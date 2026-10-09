# 02: Managing catalog titles and showing the customer catalog

**What to build:** The operator imports 57 films and 4 series once, then manages film/series titles, order, activation, and rights-cleared artwork in shared Postgres/object storage. Customers browse one combined list; inactive Upcoming titles remain visible but cannot be booked.

**Blocked by:** 01: Creating the runnable platform foundation and role-safe sign-in.

**Status:** ready-for-agent

- [ ] The one-time importer reads the JSON file explicitly, preserves `watch_order`, creates 57 films and four series inactive, and does not import any image URL.
- [ ] Admins can create generic future film/series titles and edit title, synopsis, year, poster, active state, and global order without changing the legacy Films editor.
- [ ] Rights-cleared image uploads use managed object storage with type/size/content validation; unverified TMDB artwork is not used.
- [ ] Customers see one interleaved, visually type-labeled catalog in `watch_order`, including inactive Upcoming entries.
- [ ] Customer film and episode watch progress is saved per authenticated account.
- [ ] Admin changes and watch progress persist in the shared database.
- [ ] End-to-end tests verify role restrictions, artwork storage, title state, order, and account-isolated progress.

The initial UI/schema/API seams are in `prototype/`; live shared persistence depends on deploying the documented Neon, object-storage, Clerk, and Cloudflare configuration.
