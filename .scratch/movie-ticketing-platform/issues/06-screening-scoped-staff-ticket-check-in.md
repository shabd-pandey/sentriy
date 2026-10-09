# 06: Validating tickets for assigned screenings

**What to build:** The owner can assign staff accounts to screenings, and assigned staff can validate a group's QR ticket or look it up by ID. Valid entry is consumed exactly once and recorded for audit.

**Blocked by:** 05: Confirming verified payments and issuing customer QR tickets.

**Status:** ready-for-agent

- [ ] The owner can assign an individual staff account to one or more screenings.
- [ ] Staff can access only check-in and lookup functions for their assigned screenings.
- [ ] Staff can scan a QR code or enter a protected manual ticket/order ID lookup.
- [ ] The system reports clear outcomes for valid, already-used, unpaid, cancelled, invalid, and wrong-screening tickets.
- [ ] A valid order QR is atomically marked used exactly once and admits the entire order quantity together.
- [ ] Staff cannot override an invalid or duplicate scan.
- [ ] Every scan attempt and outcome is recorded with staff identity, screening, and timestamp for the owner activity history.
- [ ] End-to-end tests verify scope enforcement, concurrent duplicate scans, lookup, rejection states, and audit events.
