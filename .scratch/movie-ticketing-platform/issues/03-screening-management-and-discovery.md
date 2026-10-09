# 03: Scheduling screenings and showing availability

**What to build:** The owner can schedule one-title film or series screenings with a manually entered location, time, inventory, price, and sales window; customers can see screenings chronologically and whether each is available.

**Blocked by:** 02: Managing films and showing the customer catalog.

**Status:** ready-for-agent

- [ ] The owner can create screenings for existing film or series titles with a free-text location name and explicit start/end times.
- [ ] A film screening has no episode fields. A series screening selects one season and an inclusive episode range within that season; the database rejects invalid ranges.
- [ ] Admins maintain series season and episode counts without episode titles.
- [ ] Each screening has general-admission capacity, one INR ticket price, and a configurable per-order ticket limit defaulting to ten.
- [ ] The owner can set sales-open and sales-close times; defaults are opening on publication and closing at showtime.
- [ ] A screening cannot be purchased before its sales-open time, after its sales-close time, or after it starts.
- [ ] Customers can view screenings in chronological order with location, Asia/Kolkata date/time, price, and remaining availability/sold-out state.
- [ ] An inactive Upcoming title's screenings remain view-only, even if they were scheduled before activation.
- [ ] Capacity cannot be reduced below sold plus active held inventory.
- [ ] End-to-end tests verify IST rendering, sales-window boundaries, capacity behavior, and private/unpublished screenings.
