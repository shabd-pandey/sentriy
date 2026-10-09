# 03: Earning a reward through three game plays

**What to build:** A signed-in customer with a confirmed paid booking can enter the active reward campaign from “Play & Earn Rewards,” complete up to three game rounds within the campaign window, and receive the campaign's reserved reward after the third completion.

**Blocked by:** 02: Managing rewards and partner coupons in the admin workspace; movie-ticketing-platform #05: Confirming verified payments and issuing customer QR tickets; movie-ticketing-platform #07: Managing screening changes, cancellations, and customer updates.

**Status:** ready-for-agent

- [ ] The customer navigation includes a “Play & Earn Rewards” entry that opens the supplied Music Festival Landing Page game experience.
- [ ] A signed-in customer with at least one confirmed paid booking can start one enrollment per campaign while new enrollment is open; a booking qualifies regardless of its ticket quantity, and repeat orders cannot create additional enrollments.
- [ ] Complimentary bookings do not qualify. A cancellation/refund before reward claim removes unclaimed game access and releases its campaign reward reservation; an already granted reward is not revoked.
- [ ] The existing 30-second Temporal Loom round behavior is preserved; a round counts when it reaches the finished/results state, not when the customer presses the claim acknowledgement.
- [ ] Play progress and the campaign's one selected reward are account-bound in the shared backend; no browser refresh, replay, or concurrent completion requests can exceed three completed rounds or grant a duplicate reward.
- [ ] One reward is reserved when the customer starts their first round; progress/reservation expires after the campaign window (seven days by default), and an unfinished round session reservation releases after two minutes without releasing the campaign reward reservation.
- [ ] The third completed round grants exactly one reward; after the customer claims it, the campaign's Play & Earn entry disappears. A separately eligible future campaign may show its own entry.
- [ ] Customers already enrolled can finish within their completion window after new enrollment is paused/deactivated or the reward inventory is exhausted; adding coupon codes resumes new enrollment unless manually paused. The admin may activate a new campaign before prior cohorts finish when overlap is enabled, while only one campaign accepts new enrollments at a time.
- [ ] The customer can view the earned reward, its status, and its instructions; a dwrpar.com food coupon is displayed for redemption on the partner service.
- [ ] The game is loaded when opened rather than eagerly bundled into the main catalog experience.
- [ ] End-to-end acceptance uses deterministic results and a paid-booking/payment stub to verify eligibility, persistence, campaign progress, reservation and expiry, three-play enforcement, one-time issuance, and entry visibility.
