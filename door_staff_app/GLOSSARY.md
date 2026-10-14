# Door staff app glossary

Vocabulary specific to the gatekeeping app in this directory. Terms the whole platform shares — *Screening*, *Paid booking*, *Bookable screening* — are defined once in the [shared glossary](../GLOSSARY.md); this file does not repeat them.

## Terms

- **Gatekeeper**: The door-staff app that admits guests at an event by checking their tickets (`app.marvelsyllabus.gatekeeper` on Android).
- **Check-in**: Admitting one ticket by scanning its QR code or entering its code by hand. The server records a check-in at most once per ticket across all doors; a re-scan returns `alreadyUsed`.
- **Order code**: The short human-typable ticket identifier (`MSY-XXXX-XXXX`), printed under the customer QR. The full QR payload is `marvelsyllabus://ticket/<orderCode>`; the app accepts both shapes.
- **Ticket**: The record behind a code — screening, title, quantity, location, and check-in state.
- **Check-in outcome**: One of `accepted`, `alreadyUsed`, or `invalid`. `alreadyUsed` means the code is real but its ticket was already checked in (on any door).
- **Live mode**: The app validates every scan against `POST /api/staff/check-in` and loads screenings plus door counts from `GET /api/staff/screenings`. Requires `API_BASE_URL` + `STAFF_TOKEN` at build time.
- **Demo mode**: Rehearsal behaviour with no API configured. The demo validator stands in for the ticketing service using a hard-coded allowlist; scans are local-only and the screen says so.
- **Demo fallback**: When the live call fails on network/timeout, the app keeps the door moving on the demo list but flags the scan loudly so staff re-scan those codes once back online. Auth errors never fall back — they fail closed.
- **Demo ticket**: A ticket hard-coded in the demo validator (`HORIZON-…` codes), offered so door staff can exercise the app without a backend.
