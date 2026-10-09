# 05: Confirming verified payments and issuing customer QR tickets

**What to build:** A verified successful payment turns a held order into a paid booking, and the customer can retrieve its single group-admission QR ticket in their account wallet. Payment events that arrive late or more than once are handled safely.

**Blocked by:** 04: Holding screening inventory and starting Razorpay test checkout.

**Status:** ready-for-agent

- [ ] Razorpay webhook signatures are validated using the raw request body before payment state changes.
- [ ] Provider event IDs are deduplicated, and duplicate or out-of-order events do not create duplicate bookings or tickets.
- [ ] A verified payment confirms the order and issues one high-entropy QR/order code for the full ticket quantity.
- [ ] An unverified browser callback cannot create a paid order or valid QR ticket.
- [ ] Customers can see their paid order, screening details, quantity, and QR ticket in their account wallet.
- [ ] A payment success arriving after hold expiry confirms a booking only if capacity remains.
- [ ] If late payment cannot be fulfilled without overselling, the order becomes paid-but-unfulfilled and is visible to the owner for resolution/refund.
- [ ] End-to-end tests cover valid, invalid-signature, duplicate, out-of-order, delayed, and capacity-conflicting payment events.
