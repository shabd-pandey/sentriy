# MarvelSyllabus production runbook

Three surfaces, one backend:

| App | Folder | What it is | Where it hosts |
| --- | --- | --- | --- |
| Customer web app | [`prototype/`](./prototype/) | Vite + React ticket discovery, wallet, rewards game | Cloudflare Pages (`frame-catalog`) |
| Command Deck (admin) | [`admin/`](./admin/) | Vite + React operator console: catalog, screenings, banners, rewards, activity | Cloudflare Pages (`marvelsyllabus-command-deck`) |
| Gatekeeper (door staff) | [`door_staff_app/`](./door_staff_app/) | Flutter Android scanner for check-in | Sideloaded APK on staff phones |
| Shared API | [`prototype/functions/api/[[path]].ts`](./prototype/functions/api/%5B%5Bpath%5D%5D.ts) (re-exported by `admin/functions`) | Single source of truth: catalog, holds, wallet, staff validation/check-in | Pages Functions on the customer domain |

## 1. How the three apps talk (REST, not WebSockets)

There is no WebSocket server, deliberately. Pages Functions cannot hold a
persistent socket without Durable Objects (extra cost/complexity), and door
scanning wants an idempotent request/response — "did this scan admit exactly
one ticket?" — not a stream. So:

- **Customer → API:** `GET /api/catalog`, `GET /api/screenings`,
  `GET/PUT /api/progress`, `GET /api/bookings` (wallet),
  `POST /api/booking-holds` (10-minute hold, quantity 1–10, atomic capacity check).
- **Door → API:** `POST /api/staff/validate` (lookup, no state change),
  `POST /api/staff/check-in` (one-time, idempotent — re-scan returns
  `already_used`), `GET /api/staff/screenings` (sold vs checked-in counts).
- **Admin → API:** everything under `/api/admin/*` plus
  `GET /api/admin/bookings?screeningId=` for door reconciliation.
- **Freshness:** the admin polls activity every 20s; staff counts are fetched
  per screen open (poll every 15–20s during doors). No sockets to keep alive
  on flaky venue Wi-Fi, and every scan works offline-fallback-safe
  (the door app flags fallback scans on screen).

The ticket contract is identical everywhere:

- QR payload: `marvelsyllabus://ticket/MSY-XXXX-XXXX`
- Manual entry: `MSY-XXXX-XXXX`
- Server normalizes both shapes (`normalizeTicketCode` in
  `prototype/src/catalog-api.ts`, `admin/src/api.ts`,
  `door_staff_app/lib/api_ticket_validator.dart`).

Staff endpoints require a Clerk JWT whose `role` is `staff` or `admin`.
Admin endpoints require `role: admin`. Customer endpoints require any signed-in user.

## 2. Accounts to create (and what each gives you)

| # | Account | Sign up at | What you take from it |
| --- | --- | --- | --- |
| 1 | Cloudflare | dash.cloudflare.com → sign up | Pages projects, `CLOUDFLARE_API_TOKEN` (optional, for CLI deploys), custom domain |
| 2 | Neon Postgres | neon.tech → New Project, region **Singapore** | `DATABASE_URL` (pooled connection string) |
| 3 | Clerk | clerk.com → Create application | `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_ISSUER`, `CLERK_JWKS_URL`, JWT template `platform-api` |
| 4 | Razorpay | razorpay.com → test mode | `RAZORPAY_KEY_ID` (`rzp_test_…`), `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| 5 | GitHub | (you have this) | Private Actions workflow + secrets for encrypted backups |
| 6 | S3-compatible storage | Neon Object Storage if available, else Cloudflare R2 / AWS S3 | `OBJECT_STORAGE_*` keys + bucket `marvelsyllabus-media` |

No other accounts are needed. The door app has no server of its own — it calls
your Pages domain with a staff JWT baked in at build time.

## 3. Every key/secret: where to make it, where to paste it

### Clerk (do this first — everything authenticates through it)

1. Clerk dashboard → your app → **API Keys** → copy the **Publishable key**
   (`pk_test_…` / `pk_live_…`).
2. **Configure → SSO / Social connections → Google → Enable.** Add your Pages
   preview + production URLs as allowed origins/redirects.
3. **Configure → JWT templates → New template → name it exactly `platform-api`**,
   audience `platform-api`. Note the **Issuer** and **JWKS URL**
   (`https://<slug>.clerk.accounts.dev/.well-known/jwks.json`).
4. **Users → your own user → Public metadata** → set `{ "role": "admin" }`.
   (Your JWT template must expose `role` from public metadata as the `role`
   claim — that is what `authenticatedUser` / `requireStaff` check.)
   Treat missing role as `customer`. Create one user per door phone with
   `{ "role": "staff" }`.
5. Bootstrap the owner with a manually maintained allowlist; never grant
   `admin`/`staff` from browser state or public sign-up.

### Cloudflare Pages — browser-safe variables (per project, preview + production)

In Pages → project → **Settings → Environment variables**:

```text
VITE_CLERK_PUBLISHABLE_KEY=pk_live_or_test_...
```

### Cloudflare Pages — secrets (server only, never `VITE_*`, never Git)

Dashboard or `wrangler secret put`:

```text
DATABASE_URL=postgresql://...             # Neon pooled connection string
OBJECT_STORAGE_ENDPOINT=https://...       # S3-compatible endpoint
OBJECT_STORAGE_REGION=...                 # Provider region
OBJECT_STORAGE_BUCKET=marvelsyllabus-media
OBJECT_STORAGE_ACCESS_KEY_ID=...
OBJECT_STORAGE_SECRET_ACCESS_KEY=...       # secret
CLERK_ISSUER=https://....clerk.accounts.dev
CLERK_JWKS_URL=https://....clerk.accounts.dev/.well-known/jwks.json
CLERK_AUDIENCE=platform-api
RAZORPAY_KEY_ID=rzp_test_...              # server-side payment routes
RAZORPAY_KEY_SECRET=...                   # secret
RAZORPAY_WEBHOOK_SECRET=...               # secret
```

### GitHub Actions backup secrets (private workflow, daily + on media change)

```text
DATABASE_URL
OBJECT_STORAGE_* credentials
BACKUP_ENCRYPTION_PUBLIC_KEY
BACKUP_RESTORE_KEY            # only in the protected recovery environment
```

## 4. Push the server live (database → API → web apps)

```powershell
# 1. Migrate Neon (order matters; 003 adds the ticket/check-in contract)
cd prototype
psql "$env:DATABASE_URL" -f db/001_catalog.sql
psql "$env:DATABASE_URL" -f db/002_admin.sql
psql "$env:DATABASE_URL" -f db/003_tickets.sql
```

```powershell
# 2. Build both web apps (typechecks the shared worker too)
cd prototype; npm ci; npm test; npm run build
cd ..\admin; npm ci; npm test; npm run build
```

3. Create two Cloudflare Pages projects connected to this repo:
   - `frame-catalog`, root directory `prototype`, build
     `npm ci && npm run build`, output `dist`, Node 22.x.
   - `marvelsyllabus-command-deck`, root directory `admin`, same build settings.
4. Set the `VITE_CLERK_PUBLISHABLE_KEY` variable and all server secrets from
   §3 on **both** projects (same backend values; the admin re-exports the
   prototype worker so both domains serve identical API behavior).
5. Deploy from the repo, or manually:

```powershell
cd prototype; npx wrangler pages deploy dist --project-name frame-catalog
cd ..\admin; npx wrangler pages deploy dist --project-name marvelsyllabus-command-deck
```

6. Import the catalog once through the guarded importer (seed artifact, not runtime truth):

```powershell
node scripts/import-catalog.mjs --input "..\ring\doomsday_watchlist (1).json" --url "https://<pages-domain>"
```

All titles start visible and inactive (`Upcoming`). Never import unverified
external poster URLs. The preview-data ribbon in the customer app must disappear
only after live catalog/screening/account APIs return real data.

## 5. Push the door app live (staff phones)

Android application ID is `app.marvelsyllabus.gatekeeper`. The release
manifest declares `CAMERA` + `INTERNET`; the app requests the camera grant at
first launch and shows an actionable prompt (not a black screen) when denied.

1. In Clerk, create one user per door device and set public metadata
   `{ "role": "staff" }`.
2. Mint a JWT for a staff user from the `platform-api` template shortly before
   doors open (tokens expire — do this day-of, not weeks ahead):
   sign the staff user in on the admin domain, then in devtools run
   `await window.Clerk.session.getToken({ template: "platform-api" })`
   and copy the result. That string is `STAFF_TOKEN`.
3. Build and distribute (sideload — no Play Store needed for a staff tool):

```sh
cd door_staff_app
flutter pub get
flutter build apk --release \
  --dart-define=API_BASE_URL=https://<your-pages-domain> \
  --dart-define=STAFF_TOKEN=<staff-jwt-from-step-2>
```

4. Copy the APK to each phone, allow install-from-unknown-source when asked,
   approve camera access. Without the `--dart-define` flags the app runs in
   clearly-labeled demo mode (offline allowlist) — fine for rehearsal, never
   for doors.
5. At close, reconcile in the Command Deck via
   `GET /api/admin/bookings?screeningId=<id>` against the `ticket_checkins`
   audit log (who scanned what, when, with what result).

## 6. Remaining payment work (before charging real money)

The hold/wallet/staff seam above is live. Razorpay stays in **test mode,
UPI-only** until these land in the worker (see the original checklist):

- Server-created Razorpay orders inside `POST /api/booking-holds`.
- `POST /api/payments/webhook` with raw-body signature verification,
  provider-event deduplication, out-of-order handling, paid-but-unfulfilled
  resolution. The browser success callback is never authoritative.
- Account-scoped refund state, notifications, reward claim/redemption routes.

Do not switch to live Razorpay keys until reconciliation, cancellation/refund
behavior, backup restore, and venue check-in pass acceptance on a disposable
database with Clerk/Razorpay test doubles.

## 7. Launch checks

- `npm run build` in both web apps; game chunk stays lazy-loaded.
- Catalog loads through the API; watchlist JSON and `.make` archives never
  enter the browser bundle. Managed images dimensioned, lazy-loaded, immutable
  cache headers; preload only the above-the-fold hero.
- Mobile nav, keyboard focus, reduced-motion, contrast, touch targets.
- IST boundaries, Upcoming titles, sales windows, capacity + held inventory,
  quantity caps, expired-hold release.
- End to end: customer hold → confirmed booking → QR → door scan → re-scan
  shows `already_used` → admin bookings match `ticket_checkins`.
- Reward eligibility (paid ticket → 3 rounds → capped grant → one-time redemption).
- Profile share card contains only opted-in watched/streak fields + operator QR
  destination — never identity, bookings, account IDs, or credentials.
- Restore one encrypted backup into a disposable Neon project + bucket before
  the first public booking.
