# Movie ticketing glossary

- **Catalog title**: A customer-visible entry with a stable ID, type (`film` or `series`), editable title, synopsis, release year, optional managed poster, active state, and global `watch_order`.
- **Film**: A standalone catalog title. Its screenings and watch progress do not contain episode numbers.
- **Series**: A catalog title with administrator-maintained season numbers and episode counts. Episode titles are intentionally not modeled.
- **Upcoming**: The visible, inactive state of a catalog title. Customers may browse it, but cannot book its screenings or mark it watched.
- **Active**: A catalog title state that permits booking only when a particular screening also passes its sales-window, cancellation, start-time, and remaining-capacity checks.
- **Watch order**: The catalog-wide ordering shared by films and series. It is independent of screening chronology.
- **Screening**: One scheduled, bookable event for exactly one catalog title. A film screening has no episode range; a series screening selects one season and an inclusive episode range within that season.
- **Watch progress**: Account-scoped state recording a watched film or one watched episode. It is separate from bookings and visible only to its signed-in account.
- **Paid booking**: A booking whose payment has been confirmed. A complimentary ticket is not a paid booking.
- **Reward campaign**: An operator-managed promotion that gives eligible customers an opportunity to earn a reward through game play.
- **Campaign enrollment**: A customer's participation in one reward campaign, including their play progress and reserved reward.
- **Reward grant**: A reward assigned to a customer after completing the campaign's required plays. A grant may be a partner coupon or a platform ticket benefit.
- **Reward redemption**: The one-time use of a reward grant, either by following partner instructions or applying a ticket benefit to an eligible booking.
- **Profile card**: A downloadable share image containing only the watch-progress and streak fields the customer has opted to include.
- **Managed artwork**: Rights-cleared image data uploaded by an administrator to configured object storage. TMDB links and unverified external images are not catalog artwork.
- **Seed/import artifact**: The supplied JSON used for the one-time initial catalog import. After import, the shared Postgres database is the live source of truth.
- **Bookable screening**: A non-cancelled screening whose title is active, sales window is open, start time has not passed, and sold plus held tickets are below capacity.
- **Booking hold**: A temporary reservation of screening inventory while a customer completes payment. It is not a confirmed booking.
