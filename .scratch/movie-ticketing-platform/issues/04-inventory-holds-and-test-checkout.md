# 04: Holding screening inventory and starting Razorpay test checkout

**What to build:** A customer can start checkout for a single screening and reserve the requested general-admission quantity temporarily, so concurrent customers cannot consume the same inventory while payment is underway.

**Blocked by:** 03: Scheduling screenings and showing availability.

**Status:** ready-for-agent

- [ ] An order contains tickets for exactly one screening and respects that screening's per-order quantity limit.
- [ ] Starting checkout atomically holds the requested quantity for ten minutes, without allowing sold plus held inventory to exceed capacity.
- [ ] Concurrent checkout attempts for the last remaining inventory cannot both acquire it.
- [ ] Checkout creates a server-owned Razorpay order in test mode and exposes only the information required by Razorpay Checkout.
- [ ] Razorpay Checkout is configured for UPI only during the pilot.
- [ ] Expired or failed checkout holds are released and the screening availability is updated.
- [ ] The browser payment callback alone cannot mark an order paid or issue tickets.
- [ ] End-to-end tests cover normal hold creation, concurrent last-ticket contention, expiration, failed checkout, and test-mode checkout initiation.
