# Movie Ticket Booking Platform

Status: ready-for-agent

## Problem Statement

The operator needs a mobile-first platform to showcase and sell tickets for a combined catalog seeded with 57 films and 4 series, while retaining generic ticketing for future titles. Screenings are manually scheduled at entered locations. Customers need to discover titles, book a dated screening, pay, and present a ticket at entry. The operator also needs to manage the catalog, screenings, banners, and refunds; staff need to validate tickets; and the admin needs visibility into app activity.

The first release is a low-volume, zero-cost pilot. Its free-tier infrastructure constraints mean it must not be treated as a production reliability or recovery guarantee, and Razorpay must remain in test mode until payment and recovery flows are verified.

## Solution

Build a shared-backend platform with three role-separated, mobile-first web frontends: customer booking and ticket wallet, owner/admin management and activity, and staff ticket scanning. Keep the system a modular application with transactional booking state, server-verified payment events, and auditable ticket validation.

Use Cloudflare Pages/Workers, Neon Free Postgres and Object Storage, Clerk Hobby, and encrypted GitHub Actions artifacts for backups. Use test-mode Razorpay for UPI checkout. Do not enable live payments until payment reconciliation, refunds, backups, restoration, and venue check-in have been tested and the operator has accepted transaction fees and free-tier limitations.

## User Stories

1. As a customer, I want to browse one combined, watch-ordered list of films and series, so that I can discover what is available to watch.
2. As a customer, I want to see a title's type, title, synopsis, release year, and managed poster, so that I can decide whether to book it.
3. As a customer, I want to see published promotional banners and follow their destinations, so that I can find featured films or screenings.
4. As a customer, I want to see a title's scheduled screenings, locations, dates, start and end times, availability, and price, so that I can choose a suitable showing.
5. As a customer, I want all screening times displayed in India Standard Time, so that I can understand when to arrive.
6. As a customer, I want to create an account and sign in with Google, so that my bookings and tickets are associated with me.
7. As a customer, I want public registration to grant customer access only, so that public sign-up cannot grant administrative or staff privileges.
8. As a customer, I want to book one screening per order, so that the selected showing and payment are unambiguous.
9. As a customer, I want to choose a ticket quantity within the screening's configured limit, defaulting to a maximum of ten, so that I can book for my group.
10. As a customer, I want to see the full amount due before starting payment, so that I know the screening price and are not surprised by an added booking fee.
11. As a customer, I want to pay with UPI through Razorpay Checkout in test mode during the pilot, so that the payment flow can be verified before live transactions are enabled.
12. As a customer, I want a successful booking to appear only after the server verifies payment, so that a browser-side success message cannot create an invalid ticket.
13. As a customer, I want my requested ticket quantity to be held temporarily during checkout, so that another customer cannot purchase the same remaining inventory while I pay.
14. As a customer, I want an expired or failed checkout to release its inventory hold, so that abandoned checkouts do not keep a screening sold out.
15. As a customer, I want one QR code and high-entropy ticket/order ID for my order, so that my group can enter together.
16. As a customer, I want to retrieve my QR ticket and order status from my account wallet, so that I can present it at the venue without email or SMS delivery.
17. As a customer, I want to receive in-app notifications when a screening changes or is cancelled, so that I can learn about updates when I next open the platform.
18. As a customer, I want a rescheduled screening's tickets to remain valid for the new schedule, so that a schedule change does not silently void my purchase.
19. As a customer, I want cancelled screening tickets to be marked invalid and refund progress shown in my wallet, so that I can distinguish a cancelled ticket from an active one and follow its refund.
20. As a customer, I want to request account deletion, so that my profile can be removed or anonymized after active tickets and refunds settle.
21. As an owner/admin, I want to maintain film and series titles with title, synopsis, year, poster, active state, and global watch order, so that I can manage the shared catalog.
22. As an owner/admin, I want to upload rights-cleared artwork to managed object storage, so that customer pages display platform-managed posters without unverified external images.
23. As an owner/admin, I want to create screenings for films or series with manually entered location names, explicit start/end times, capacity, price, and sales-open/sales-close settings, so that I can host screenings at different places and times.
24. As an owner/admin, I want screening publication defaults to open sales when published and close sales at showtime, so that I can publish a simple screening without configuring every timing field.
25. As an owner/admin, I want a screening to stop accepting bookings once it starts or reaches its configured sales-close time, so that tickets cannot be sold after entry should have begun.
26. As an owner/admin, I want to configure general-admission capacity and a per-screening ticket limit, so that I can match ticket inventory and group size to the event.
27. As an owner/admin, I want the system to prevent capacity reductions below sold plus currently held tickets, so that a change cannot make confirmed or in-progress bookings exceed capacity.
28. As an owner/admin, I want ticket-impacting screening details locked after the first sale, so that paid orders are not silently changed.
29. As an owner/admin, I want schedule changes to use an explicit reschedule flow that preserves existing tickets and records the old and new schedule, so that customers and staff can understand the change.
30. As an owner/admin, I want to cancel a screening and immediately invalidate its tickets, so that cancelled events cannot admit customers while refunds are pending.
31. As an owner/admin, I want to review and manually initiate full Razorpay refunds for cancelled screenings, so that refunds remain under operator review.
32. As an owner/admin, I want refund states to reflect Razorpay confirmation rather than an unverified local success, so that refund records are accurate.
33. As an owner/admin, I want to create separate promotional banners with draft/published state, optional publication windows, and optional film/screening destinations, so that campaigns can be managed independently from posters.
34. As an owner/admin, I want a near-real-time activity view refreshed every 15–30 seconds, so that I can monitor bookings, payment/refund status, ticket scans, and admin changes during events.
35. As an owner/admin, I want a durable, searchable activity history, so that I can investigate operational questions after the live activity has passed.
36. As an owner/admin, I want to be alerted when a payment succeeds after its inventory hold expires and capacity is no longer available, so that I can resolve a paid but unfulfilled order without overselling.
37. As an owner/admin, I want to resolve a failed or duplicate scan only after verifying the order and recording a reason, so that exceptions remain controlled and auditable.
38. As an owner/admin, I want to assign individual staff accounts to specific screenings, so that staff access is scoped to the events they are working.
39. As an owner/admin, I want to request deletion to remove or anonymize a customer's profile after active tickets and refunds settle, while retaining only minimum necessary transaction and audit data, so that account deletion does not destroy records needed for event operations or reconciliation.
40. As a staff member, I want an individual sign-in with check-in-only permissions for assigned screenings, so that I can validate tickets without accessing customer or content-management functions.
41. As a staff member, I want to select or access my assigned screening, so that a ticket is checked against the correct event.
42. As a staff member, I want to scan an order QR code or look up its ticket/order ID, so that customers can be checked in even if their QR image cannot be scanned.
43. As a staff member, I want a valid ticket to be atomically marked used exactly once, so that the same QR cannot admit the group more than once.
44. As a staff member, I want clear responses for invalid, unpaid, cancelled, wrong-screening, and already-used tickets, so that I can make a reliable entry decision.
45. As a staff member, I want scanner actions to be recorded in the activity history, so that the operator can audit admissions and investigate issues.
46. As a platform operator, I want booking inventory, order, and payment state to be managed transactionally, so that concurrent checkout attempts cannot oversell a screening.
47. As a platform operator, I want Razorpay webhook signatures verified against the raw request body and event IDs deduplicated, so that forged, duplicate, or out-of-order events cannot create inconsistent orders.
48. As a platform operator, I want a late successful payment to become paid-but-unfulfilled if capacity is unavailable, with an admin alert and refund workflow, so that late payment does not cause overselling.
49. As a platform operator, I want daily encrypted database exports and media backups when media changes, retaining seven daily database snapshots, so that I can attempt recovery within the pilot's stated limits.
50. As a platform operator, I want to test restoration from backups, so that a successful backup job is not mistaken for a usable recovery plan.
51. As an owner/admin, I want to maintain each series' season numbers and episode counts without episode titles, so that progress and screening ranges can be validated.
52. As a customer, I want account-scoped watched state for a film or each individual series episode, so that my progress persists across devices and sessions.

## Implementation Decisions

- The launch is a single-operator platform with one combined catalog seeded once from the provided 57-film/4-series JSON artifact. Imported titles all start inactive and visible as Upcoming; database records are the live source of truth. Generic ticketing supports other future film or series titles. It is not a multi-host marketplace.
- Implement three responsive web frontends—customer, owner/admin, and staff scanner—on a shared backend and data model. Visual composition and detailed UI interaction design are deferred to a later UI iteration.
- Model catalog titles separately from screenings. Titles are either films or series and have a required title, synopsis, year, optional managed poster, active state, and global watch order. Preserve the unrelated legacy film editor unchanged.
- Admin uploads only rights-cleared artwork to managed object storage. Do not ship unverified external artwork or use TMDB URLs before licensing is confirmed. The supplied JSON is a one-time seed/import artifact only.
- Store series seasons and episode counts without episode titles. Watch progress is account-scoped and records a film or individual episode.
- Model each screening as its own scheduled, individually purchasable instance. Each screening references exactly one title and stores a manually entered location name, explicit start and end, IST timezone, general-admission capacity, one ticket price, sales-open and sales-close times, publication state, and configurable per-order limit. Series screenings contain one season and an inclusive episode range wholly within that season; film screenings have no episode range.
- Display films and series in one `watch_order`-sorted catalog, visually label series, and sort screening lists chronologically. Inactive titles remain visible but are view-only and cannot be booked. Activating a title opens booking only for screenings that independently pass all availability checks.
- A screening's default sales window begins when it is published and ends at showtime. Purchases stop at the configured close time and cannot be made after the screening starts.
- A booking order contains tickets for exactly one screening. The default maximum is ten tickets per order and may be configured per screening. There is one price per screening and no booking fee. No GST invoice flow is in scope for the pilot.
- Hold inventory atomically for ten minutes while checkout is in progress. Confirm a booking only after server-side payment verification. Release expired/failed holds. If verified payment arrives after the hold expires, fulfill only if capacity remains; otherwise create a paid-but-unfulfilled state, alert the admin, and enable resolution/refund without overselling.
- Use Razorpay Checkout in test mode and UPI only for the pilot. The browser callback is not authoritative. Verify signed webhooks using the raw request body, deduplicate by provider event ID, and tolerate duplicate or out-of-order events. Keep payment state transitions and reconciliation explicit.
- Use one operator-owned Razorpay account. Customer tickets are non-refundable except where legally required; screening cancellation prompts a full refund, which the admin initiates manually. Do not mark a refund complete until Razorpay confirms it.
- Issue one unique high-entropy QR/order code per order; a successful scan admits the whole order's group together. Provide protected manual lookup using the ticket/order ID. Validation is online-only and atomically consumes the ticket once.
- A cancelled screening invalidates its tickets immediately, independently of refund progress. A rescheduled screening preserves existing tickets and records its previous and revised schedule. Ticket-impacting changes are locked after the first sale; schedule changes use the reschedule flow.
- The customer account wallet is the source for tickets and order/refund status. In-app notifications/inbox report reschedules, cancellations, and important account/order changes. No email, SMS, or WhatsApp delivery is planned.
- Support public customer signup with Google sign-in through Clerk Hobby. Public signups receive customer-only permissions. Bootstrap the owner using an explicit Google-email allowlist; the owner assigns individual staff accounts and screening scopes. Staff accounts may scan and look up tickets only; they cannot manage content or override failed scans.
- Only an owner/admin can resolve a failed or duplicate scan, after checking order/payment and recording a reason. Scanner staff cannot override.
- The owner/admin manages films, uploaded media, screenings, scheduled banners, staff assignments, cancellations, refunds, and activity. Admin activity refreshes every 15–30 seconds and has a durable, searchable history for bookings, payment/refund changes, scans, and administrative changes.
- Collect the buyer's Google profile only; do not collect attendee names or phone numbers. Account deletion can be requested at any time, but profile deletion/anonymization waits for active tickets and refunds to settle. Retain only the minimum order and audit data needed for operations, disputes, and applicable recordkeeping.
- Use Asia/Kolkata as the sole launch timezone. Do not add venue records, maps, or third-party location lookups; the operator enters a location name per screening.
- Pilot infrastructure is Cloudflare Pages/Workers, Neon Free Postgres and Neon Object Storage, Clerk Hobby, and GitHub Actions artifacts. Do not use EC2 or Cloudflare R2; R2 setup requires a payment method, which the operator does not have.
- Neon Free is selected as the clearest documented no-card database option. Its available region for this pilot is Singapore; it may sleep after inactivity and has limited recovery history. The pilot does not promise India data residency, production uptime, or point-in-time recovery.
- Run scheduled daily encrypted logical database exports to private GitHub Actions artifacts and back up uploaded media when it changes. Keep seven daily database snapshots; use GitHub's supported retention and free quotas, and test restores. Treat this as a limited pilot recovery measure, not a provider-independent or guaranteed backup service.
- Do not introduce AI APIs, recommendations, customer support automation, or automated content publication in the launch.

## Testing Decisions

- Test external behavior rather than internal implementation details. The primary seam is end-to-end acceptance through the three running frontends and backend, using a disposable database and controlled Clerk/Razorpay test doubles or sandbox flows.
- Cover customer-visible discovery, screening availability, Google-authenticated booking, order/ticket wallet state, and in-app notifications.
- Verify concurrent booking attempts and expiring holds against capacity; confirm no overselling when holds expire or late payment events arrive.
- Verify that only server-verified Razorpay test events create paid tickets; test bad signatures, duplicate event IDs, out-of-order events, payment retries, and paid-but-unfulfilled resolution.
- Verify that public/customer sessions cannot access owner or staff actions; staff access is restricted to assigned screenings and cannot perform overrides.
- Verify QR and manual-ID validation, wrong-screening/cancelled/unpaid/duplicate scans, one-time atomic check-in, and the audit trail.
- Verify cancellation and reschedule behavior, manual refund initiation and confirmed refund status, ticket-impacting edit restrictions, banner publication windows, admin activity refresh/history, and delayed account deletion/anonymization.
- Verify daily backup generation, encryption, media inclusion on change, seven-snapshot retention, and successful restoration from a selected backup.
- Use Razorpay test mode only in automated and manual pilot validation. Live payment flows are out of scope until the operator explicitly accepts transaction fees and has verified operations/recovery readiness.
- Existing Vitest coverage establishes prior art for catalog ordering and screening availability. Add acceptance coverage for the remaining booking flows at the agreed full-system seam rather than testing implementation details.

## Out of Scope

- Native iOS/Android applications.
- Multiple independent organizers, host self-service, organizer payouts, or marketplace tenancy.
- Assigned seating, seat maps, and seat selection.
- Multi-screening carts, waitlists, ticket categories, general-purpose coupon campaigns, and external coupon validation. Game-earned rewards and manually managed partner codes are specified in the companion MarvelSyllabus experience specification.
- Live Razorpay transactions, non-UPI payment methods, automated refunds, and production payment reconciliation.
- Email, SMS, WhatsApp, or other external customer notifications.
- Offline ticket scanning, barcode formats other than QR, or staff scan overrides.
- AI features, external movie-catalog synchronization, and IMDb metadata/poster imports without verified free commercial-use rights.
- India-only data residency, guaranteed uptime, guaranteed recovery, paid infrastructure, or service-level objectives.
- Venue maps, geocoding, or third-party location services.
- GST invoice generation and tax advice.
- Customer-initiated refunds beyond legally required cases.

## Further Notes

- This baseline is intended for a test-mode, low-volume pilot. It is not a recommendation to take significant public bookings on free-tier services.
- Cloudflare R2 was excluded because its setup documentation requires an R2 subscription/payment method. Neon explicitly advertises its Free plan as no-credit-card-required; its product region availability and recovery constraints should be rechecked at implementation time.
- GitHub Actions artifacts are subject to account quotas and retention policies. The backup workflow must alert on failure, avoid exposing unencrypted data or keys in logs/artifacts, and document the manual recovery procedure.
- Reconfirm provider limits, signup requirements, pricing, and payment terms before implementation and again before enabling live payments; free-tier policies can change.
- The React/Vite prototype now contains a separate shared catalog/customer surface, a Cloudflare Pages Functions API, a Neon-oriented SQL schema, a guarded one-time watchlist importer, and focused screening/order tests. Deployment credentials are intentionally not stored in source. Ticket checkout remains a deployment prerequisite; see `prototype/README.md`.
- The brand, customer-facing film UI, game-rewards entry point, and profile/share-card experience are specified in the companion MarvelSyllabus experience specification. That follow-up incorporates the supplied visual references and supersedes the earlier deferral of those specific UI surfaces.
