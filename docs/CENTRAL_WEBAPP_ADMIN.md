# Central WebApp Developer & School Staff Admin

This is a **WebApp server** feature, NOT a FlightCore firmware/AP password.
Kit Wi-Fi remains default WPA2 `12345678` unless the teacher changes it.
The existing Kit physical USB/teacher maintenance authorization is unchanged.

## Hosting limitation

GitHub Pages cannot run an authenticated account API or private database.
To allow school staff from a different location/laptop to log in, deploy
this repository's Node.js `server.cjs` on one always-on HTTPS host,
with persistent storage and a stable public URL. Deploying source to GitHub
Pages alone **does not activate central accounts**.

For the initial developer login, provision these PRIVATE server environment
settings (the actual password must never be committed to GitHub):

- `ZEBJUS_DEVELOPER_PASSWORD`: the initial developer secret you selected; at
  least 8 characters for bootstrap. The short initial password should be
  rotated promptly to a unique 12+ character password via the Admin UI.
- `ZEBJUS_ADMIN_DATA_DIR`: a persistent writable directory **outside**
  the public repository/web root, backed up securely and mounted persistently.
- `ZEBJUS_PUBLIC_ORIGIN`: the real HTTPS origin such as
  `https://admin.example-school.org` (no trailing slash or path).
- `PORT`: listening port, default 4173.
- `HOST`: `127.0.0.1` by default; put a trusted HTTPS reverse proxy in
  front. Never expose HTTP credentials over the internet.

Install Node.js 22+, set environment variables in the hosting provider's
**private secret/environment settings**, run `npm run dev` (or
`node server.cjs --port 4173`) behind your HTTPS reverse proxy.

Do NOT place the initial password in repository files, the service worker,
GitHub Pages configuration, a public CI log or a GitHub Actions variable
whose value could be exposed by the browser.

## Use

1. Visit **Devices & Firmware → Security & Admin** on the hosted WebApp.
2. Log in with username `developer` and your private bootstrap password.
3. Under **Add School Staff Admin**, create a different username/password
   for every school staff account. New staff passwords must be 12–128 chars.
4. Staff can sign in with their assigned account from a different laptop
   or physical location using the **same HTTPS server URL**.
5. The developer can change their own password, reset a staff password
   (which revokes old sessions), or permanently remove staff access.
6. Staff can change their own login password. They cannot add/revoke admins.

Stored passwords are salted scrypt hashes. Sessions are random, stored as
hashes on the server, delivered only through HttpOnly/SameSite cookies,
and expire after eight hours. Stateful actions use same-origin JSON and an
explicit header; login attempts are rate-limited. The server uses a JSON
account store with atomic writes, suitable for one Node process with a
persistent private disk. For multi-instance production hosting, replace
this with a transactional database/session store.

Back up the private data directory before moving to a new server; this
also preserves developer-password changes and staff accounts.

## Security boundaries

Cloud login controls **cloud account administration** and (when the API
is configured) the visible physical Kit Admin panel. It does not authorize
Firmware OTA, unlock a physical USB Kit, issue flight-control permission,
or replace manufacturer enrollment. Those still require the existing
device-side keys/USB checks. Hiding a web panel is not a security boundary;
all sensitive cloud operations are validated on the Node server.

Existing static GitHub Pages deployment continues to support non-cloud
features, but will display “Central Admin unavailable” until a Node backend
is hosted. Never implement a frontend-only global master password.
