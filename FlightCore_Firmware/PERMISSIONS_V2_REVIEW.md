# FlightCore 1.5.0 V2 firmware permission review

**Development branch only until A1/A2 builds and security regression checks pass.** No motor PWM, DShot, real ARM, or flight PID is enabled.

## Firmware role policy

| Role | Credential | Observe | RC diagnostic preview | Wi-Fi setup | Classroom grants / revoke | OTA |
|---|---|---|---|---|---|---|
| Teacher | Existing private X-ZJ-Key (USB-paired) | Yes | Yes | Yes | Yes | APP only, actual STA |
| Setup | Manufacturer's private label, AP socket, 5-minute limit | Status only | No | Yes | No | No |
| Diagnostic | Label-derived diagnostic HMAC | Yes | No | No | No | No |
| Student observe | Student-specific 64-hex key plus active teacher grant | Yes | No | No | No | No |
| Student control | Student-specific 64-hex key plus active teacher grant | Yes | Yes (one owner) | No | No | No |

A public six-digit kit code or AP password cannot authorize these roles. Students have unique private HMAC enrollment credentials, independent of label and teacher key. Enrollment still requires the exact kitId/bootId, 32-hex client, one-use short-lived challenge, signed counter and encrypted POST payload. For student enrollment include `studentId` with `kind=student` in both `/api/auth/challenge` and `/api/auth/enroll`; HMAC message format is unchanged.

## Teacher USB commands

First `ZJADMIN,ENROLL,<passphrase>` (first-time) or `ZJADMIN,UNLOCK,<passphrase>`. Generate a unique 64-character hex secret for each student on a private teacher device; do not store it in GitHub, browser logs or screenshots.

```text
ZJADMIN,STUDENT,ADD,student01,<64-hex-private-key>
ZJADMIN,STUDENT,ENABLE,student01,15,observe
ZJADMIN,STUDENT,ENABLE,student01,15,control
ZJADMIN,STUDENT,REVOKE,student01
ZJADMIN,STUDENT,REMOVE,student01
```

Student credentials persist securely only to the extent existing ESP32 NVS storage provides; physical flash extraction protection is **not** configured. A maximum of four IDs are supported. Teacher grants are restricted to 1–30 minutes, invalidate previous student sessions on change, and **expire automatically on reboot** because there is no trusted persistent wall clock. Revoke or expiry also neutralizes and releases student-owned RC immediately. The existing 350 ms watchdog, 1800 ms lease, STOP safety, exclusive owner, and motor-disabled hard gates remain.

## Teacher management endpoints

These require the legacy teacher X-ZJ-Key and exact device identity where supplied. They never return private student secrets.

- `GET /api/classroom/students`: IDs, active grant, control bit, remaining seconds.
- `POST /api/classroom/grant`: `studentId`, `minutes=1..30`, `scope=observe|control`. USB-provisioned student required.
- `POST /api/classroom/revoke`: `studentId`; immediate session invalidation and RC release.
- `POST /api/classroom/takeover`: release any current RC controller and force neutral input.
- `GET /api/status`: role and `canControl` are calculated by the device, not browser flags.

## Acceptance / migration blockers

1. Compile fresh A1 and A2 APP and FACTORY firmware; verify chip IDs, partition sizes and published SHA256 hashes.
2. Run all WebApp, Android, firmware and network regression gates; existing diagnostic-only clients lose RC-claim permission and need V2 student control enrollment.
3. Encrypt teacher provisioning/control transport, implement secure boot + signed OTA, robust student/teacher lifecycle, durable audit and full Home Mode, before claiming production School/Home security.
4. Test physical ESP32-C3 and ESP32-C6 radio handover, enrollment/revocation, power-cycle expiry, OTA and USB recovery with actual boards.

The checked-in 1.4.0 binaries/catalog remain the **last verified release** until CI generates new matching 1.5.0 files. Never relabel old binaries. WebApp/Android student onboarding is not yet included in this firmware-only change.
