#!/usr/bin/env python3
"""ZEBJUS local one-scan pairing bridge. Zero cloud dependencies.

Serves the DroneLab web app at http://localhost:8765, and accepts ONE Android
WebRTC answer per cryptographically authenticated, short-lived pairing session.
The Android APK POSTs the answer directly to this laptop on the same Wi-Fi.
No answer or pairing key is written to disk.
"""
import argparse
import hmac
import ipaddress
import json
import os
import socket
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SESSIONS = {}
LOCK = threading.RLock()
MAX_BODY = 26000
MAX_SESSIONS = 80

def local_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("192.0.2.1", 9))
        addr = sock.getsockname()[0]
        return addr if ipaddress.ip_address(addr).is_private else "127.0.0.1"
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()

def validate_id(raw):
    return isinstance(raw, str) and len(raw) == 24 and all(c in "0123456789abcdef" for c in raw)

def validate_key(raw):
    return isinstance(raw, str) and len(raw) == 48 and all(c in "0123456789abcdef" for c in raw)

def remove_expired():
    now = time.time()
    for sid in list(SESSIONS):
        if SESSIONS[sid]["until"] < now:
            del SESSIONS[sid]

class Handler(SimpleHTTPRequestHandler):
    server_version = "ZebjusLocalPair/1.2"
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, fmt, *args):
        print("LocalPair:", self.address_string(), fmt % args, flush=True)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store" if urlsplit(self.path).path.startswith("/__pairing/") else "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()
    def json_response(self, code, body):
        raw = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except BrokenPipeError:
            pass
    def json_body(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 2 or size > MAX_BODY:
                raise ValueError("Invalid payload size")
            return json.loads(self.rfile.read(size))
        except (ValueError, UnicodeError, json.JSONDecodeError):
            return None
    def require_origin(self):
        # Only a browser on this laptop may register, poll or cancel a session.
        # Browsers omit Origin on some same-origin GET requests; use Referer then.
        origin = self.headers.get("Origin", "")
        if not origin:
            referer = self.headers.get("Referer", "")
            if referer:
                u = urlsplit(referer)
                origin = "%s://%s" % (u.scheme, u.netloc)
        allowed = ("http://localhost:%d" % self.server.server_port,
                   "http://127.0.0.1:%d" % self.server.server_port)
        # Referrer-Policy:no-referrer intentionally hides the page URL.
        # Chromium sets Sec-Fetch-Site:same-origin for legitimate local GETs.
        # Also verify loopback client AND loopback Host so LAN callers cannot
        # impersonate a local browser merely by sending that fetch header.
        host = self.headers.get("Host", "").lower()
        if host not in tuple(v.replace("http://", "") for v in allowed):
            return False
        if not ipaddress.ip_address(self.client_address[0]).is_loopback:
            return False
        return origin in allowed or (not origin and self.headers.get("Sec-Fetch-Site") == "same-origin")
    def do_GET(self):
        u = urlsplit(self.path)
        if u.path == "/__pairing/info":
            if not self.require_origin():
                return self.json_response(403, {"error": "Open DroneLab from http://localhost:%d" % self.server.server_port})
            return self.json_response(200, {"version": 2, "bridge": "http://%s:%d" % (self.server.lan_ip, self.server.server_port)})
        if u.path == "/__pairing/poll":
            if not self.require_origin():
                return self.json_response(403, {"error": "Local browser only"})
            from urllib.parse import parse_qs
            q = parse_qs(u.query)
            sid, secret = q.get("sid", [""])[0], q.get("secret", [""])[0]
            with LOCK:
                remove_expired()
                entry = SESSIONS.get(sid)
                if not entry or not hmac.compare_digest(entry["secret"], secret):
                    return self.json_response(404, {"error": "Pairing expired / invalid"})
                answer = entry.pop("answer", None)
            return self.json_response(200, {"answer": answer})
        if u.path.startswith("/__pairing/"):
            return self.json_response(404, {"error": "Invalid endpoint"})
        return super().do_GET()
    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ("/__pairing/register", "/__pairing/answer", "/__pairing/close"):
            return self.json_response(404, {"error": "Not found"})
        data = self.json_body()
        if not isinstance(data, dict):
            return self.json_response(400, {"error": "Invalid JSON"})
        sid, secret = data.get("sid"), data.get("secret")
        if not validate_id(sid) or not validate_key(secret):
            return self.json_response(400, {"error": "Invalid pairing credentials"})
        if path != "/__pairing/answer" and not self.require_origin():
            return self.json_response(403, {"error": "Only localhost Web App may modify pairing"})
        with LOCK:
            remove_expired()
            if path == "/__pairing/register":
                expiry = data.get("expires")
                if not isinstance(expiry, int) or not (time.time()*1000 < expiry < time.time()*1000 + 190000):
                    return self.json_response(400, {"error": "Invalid expiry"})
                if len(SESSIONS) >= MAX_SESSIONS:
                    return self.json_response(429, {"error": "Too many pairing sessions"})
                SESSIONS[sid] = {"secret": secret, "until": expiry/1000, "answer": None}
                return self.json_response(200, {"ok": True})
            entry = SESSIONS.get(sid)
            if not entry or not hmac.compare_digest(entry["secret"], secret):
                return self.json_response(403, {"error": "Invalid or expired QR"})
            if path == "/__pairing/close":
                del SESSIONS[sid]
                return self.json_response(200, {"ok": True})
            answer = data.get("answer")
            if not isinstance(answer, str) or len(answer) > 16000 or not answer.startswith("zj1:"):
                return self.json_response(400, {"error": "Invalid WebRTC answer"})
            if entry.get("answer") is not None:
                return self.json_response(409, {"error": "Pairing answer already submitted"})
            entry["answer"] = answer
            return self.json_response(200, {"ok": True})
    def do_OPTIONS(self):
        self.json_response(405, {"error": "CORS intentionally disabled; Android native bridge submits local answer"})

def serve(port, lan_ip):
    ip = ipaddress.ip_address(lan_ip)
    if ip.version != 4 or not (ip.is_private or ip.is_loopback):
        raise SystemExit("LAN IP must be local IPv4 (e.g. 192.168.1.8)")
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    server.lan_ip = str(ip)
    print("\nZEBJUS DroneLab • Local One-Scan QR Bridge V1.2.0")
    print("Web App: http://localhost:%d/#settings" % port)
    print("Android return address: http://%s:%d" % (ip, port))
    print("Phone and laptop must be on the same Wi-Fi. Allow port %d through laptop firewall." % port)
    print("Pairing offers expire after 3 minutes. Ctrl+C stops the bridge.\n", flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\nLocal bridge stopped.")
    finally:
        server.server_close()

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--lan-ip", default=local_ip(), help="Laptop IPv4 reachable from Android, e.g. 192.168.1.8")
    args = p.parse_args()
    serve(args.port, args.lan_ip)
