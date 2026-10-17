# Central Admin HTTPS (optional) — deployment runbook

**Scope:** Central developer/staff login is an optional hosted WebApp feature, separate from Kit hardware. Local DroneLab AP/STA/USB, Android diagnostic control, PPM, firmware operations and simulator work without this cloud service.

**Out of scope:** Restrictive-network WebRTC TURN relay and internet-based **physical Kit control**. Do not deploy coturn, a TURN credential broker, or a remote Kit control tunnel for DroneLab. `remote-rtc-config.json` intentionally keeps `turnCredentialsUrl: null`, and `remote-rtc.js` always uses a STUN-only peer configuration. Peer connectivity across carrier/school firewalls is not guaranteed.

**Deployment status:** No hosted admin URL or secrets are provisioned by this repository. GitHub Pages cannot execute a Node server or hold a secure private account database.

## Optional Admin HTTPS server procedure

1. Provision a public DNS name (for example, `admin.yourdomain.example`), a Node.js 22+ host, private persistent volume, and TLS 1.2+ HTTPS reverse proxy with auto-renewal. Keep Node listening on `127.0.0.1:4173` or a private container network; do not expose backend HTTP credentials directly on the public internet.
2. Set privately: `ZEBJUS_PUBLIC_ORIGIN=https://admin.yourdomain.example`, `ZEBJUS_DEVELOPER_PASSWORD=<a unique strong privately stored password>`, `ZEBJUS_ADMIN_DATA_DIR=<private persistent directory outside web root>`, `HOST=127.0.0.1`, `PORT=4173`. Never add real secrets to Git or GitHub Pages.
3. Start `node server.cjs`. Reverse-proxy public HTTPS traffic and serve the WebApp on this **same origin** so relative `/api/admin/*` requests use the authenticated backend. Use no-store, rate limits, log redaction, backups and secure session cookies.
4. Check `GET /api/admin/session` reports `{"available":true,"user":null}` without credentials, then test staff account creation, login from another machine, password rotation, logout/session revocation, CSRF rejection and persistence after restart.
5. Run `ZEBJUS_PUBLIC_ORIGIN=https://admin.yourdomain.example npm run verify:admin-deployment` for a basic HTTPS origin and login-API reachability check. This **does not** certify school production safety; document real admin acceptance separately.

Do not confuse cloud staff administration with Kit ownership. Physical controller input remains restricted to verified local USB/AP/STA authorization and all existing safety/deadman checks. For details, see `docs/CENTRAL_WEBAPP_ADMIN.md`.
