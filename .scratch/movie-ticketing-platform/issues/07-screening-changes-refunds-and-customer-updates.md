# 07: Managing screening changes, cancellations, and customer updates

**What to build:** The owner can explicitly reschedule or cancel a screening after sales, customers see changed ticket status and in-app updates, and the owner can manually initiate cancellation refunds with status based on Razorpay confirmation.

**Blocked by:** 05: Confirming verified payments and issuing customer QR tickets.

**Status:** ready-for-agent

- [ ] Ticket-impacting screening fields are locked after the first sale; a reschedule follows a dedicated flow that records old and new schedule values.
- [ ] Existing tickets remain associated with the rescheduled screening and show the new schedule in the customer wallet.
- [ ] Cancelling a screening immediately invalidates its tickets for check-in and changes the wallet state independently of refund completion.
- [ ] Customers receive an in-app notification for a reschedule or cancellation and can see the current state in their wallet.
- [ ] The owner can review affected paid orders and manually initiate full Razorpay refunds for a cancelled screening.
- [ ] Refund state is shown as pending/failed/confirmed according to provider-confirmed status; the application does not claim completion before confirmation.
- [ ] Customer-initiated refunds are unavailable except where legally required.
- [ ] End-to-end tests verify reschedule preservation, cancellation invalidation, wallet/inbox updates, and refund state transitions.
