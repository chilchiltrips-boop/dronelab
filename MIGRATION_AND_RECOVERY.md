# Review build migration and recovery

No credential or firmware-storage migration in this checkpoint. Existing private-label enrollment and USB recovery remain intact. Service Worker gets a new cache name and includes the new header stylesheet. Pending owner/student schema changes must include explicit migration and rollback tests.

Customer: power kit, join its AP in OS settings, New Kit, verify full Device ID using the private label, optionally scan/test Wi-Fi, then connect STA. Remember diagnostic access only on a personal browser. Use Refresh Connection Status to recheck; it never grants physical control. Public code/AP password never grants authorization.

Teacher: existing protected USB admin enrollment/unlock only. Network student assignment and revocation are not available in this review build. Do not distribute maintenance credentials as student credentials.

Home: a previously authorized diagnostic browser may use local AP where firmware policy exposes it. Individual student offline expiry/revocation is not implemented; this is not complete School Home Mode.

Rollback: keep main and baseline artifacts unchanged until acceptance. Revert reviewed feature commits through a new reviewed commit; never hard reset shared progress or force push. USB factory recovery must use the exact board's verified factory image and offsets. Firmware 1.4.0 remains the baseline; no claim of new 1.5.0 binaries.
