# Authorization status and unresolved gates

Retained: private per-device manufacturer label, HMAC challenge/response, encrypted POST payload, signed response, monotonic counters, limited setup scope, protected USB admin, device-enforced exclusive RC lease. Kit codes and AP passwords are not credentials. No universal administrator password introduced.

The existing 32-character maintenance key retains broad legacy authority. Student diagnostic enrollment is not a complete per-student permission system. The encrypted browser vault is convenience storage and cannot defend against malicious same-origin scripts.

**Release blockers:** independently revocable student credentials, teacher network enrollment and takeover, capability checks at every firmware endpoint, password changes, persistent audit, secure ownership migration, Home Mode policy. These must be implemented and exercised before claiming School Mode. Do not replace manufacturer enrollment with public codes or browser-only roles.

Unsigned bench OTA is not production secure boot or authenticated firmware signing.
