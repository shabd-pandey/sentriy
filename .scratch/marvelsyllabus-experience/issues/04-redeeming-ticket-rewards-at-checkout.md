# 04: Applying earned rewards during ticket checkout

**What to build:** A customer with an earned platform ticket reward can see its effect before payment and use it once to book an otherwise eligible screening without bypassing inventory, activation, or verified-payment rules.

**Blocked by:** 03: Earning a reward through three game plays; movie-ticketing-platform #04: Holding screening inventory and starting Razorpay test checkout; movie-ticketing-platform #05: Confirming verified payments and issuing customer QR tickets.

**Status:** ready-for-agent

- [ ] Eligible 30% or 50% discounts and complimentary-premiere rewards appear automatically at the next configured eligible ticket checkout; customers do not need to type a promo code.
- [ ] Before payment, checkout displays the reward, its eligibility, and the final amount due.
- [ ] A discount applies to exactly one eligible ticket in an order; remaining tickets are charged at their normal price.
- [ ] A complimentary ticket reward applies only to screenings designated eligible by the admin and creates a normal booking/ticket without a positive payment charge; it does not qualify the booking for game-campaign access.
- [ ] When multiple unexpired ticket rewards are available, checkout applies at most one per order, selecting the eligible reward with the earliest expiry first.
- [ ] Reward eligibility follows the offer configuration and cannot make an inactive title, cancelled/closed screening, or sold-out screening bookable.
- [ ] Inventory holds and normal booking limits apply to discounted and complimentary bookings; a complimentary ticket produces a normal account booking and QR ticket without charging a positive amount.
- [ ] A platform reward is consumed atomically only when the corresponding booking succeeds; failed, abandoned, or expired checkout does not consume it.
- [ ] Reward expiry is visible before checkout; reward expiry is based on the configured duration from grant and cannot exceed an assigned partner code's expiry.
- [ ] If the customer's earliest-expiring reward is not eligible for the selected screening, checkout applies the next earliest-expiring reward that is eligible; no more than one reward is applied to an order.
- [ ] Concurrent checkouts and retries cannot redeem one grant more than once or oversell screening inventory.
- [ ] Food coupon codes remain partner-redemption instructions and are not represented as a platform ticket discount or as validated by dwrpar.com.
- [ ] End-to-end acceptance verifies discount totals, free-ticket booking, eligibility rejection, payment failure/retry, and one-time redemption.
