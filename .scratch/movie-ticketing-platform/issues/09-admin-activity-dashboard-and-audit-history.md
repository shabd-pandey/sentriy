# 09: Monitoring platform activity in the admin dashboard

**What to build:** The owner can monitor current bookings and operational changes in a near-real-time admin view, then search the durable history to investigate bookings, payment/refund transitions, scans, and administrative edits.

**Blocked by:** 02: Managing films and showing the customer catalog; 03: Scheduling screenings and showing availability; 05: Confirming verified payments and issuing customer QR tickets; 06: Validating tickets for assigned screenings; 07: Managing screening changes, cancellations, and customer updates; 08: Managing and displaying promotional banners.

**Status:** ready-for-agent

- [ ] The admin activity view refreshes automatically every 15–30 seconds without requiring a full page reload.
- [ ] The view records and displays booking creation, payment state changes, refund state changes, ticket scans, screening changes, and film/banner/admin changes.
- [ ] Activity entries include appropriate timestamp, actor or system source, and relevant screening/order reference without exposing secrets.
- [ ] The owner can search/filter the durable activity history by supported event category and relevant screening/order.
- [ ] Customers and staff cannot access the admin activity view or its backing data.
- [ ] End-to-end tests verify event visibility, refresh interval behavior, filtering, persistence, and authorization.
