# MarvelSyllabus production runbook

This document is the deployment plan for the customer-facing app in [`prototype/`](./prototype/). It follows the platform spec: Cloudflare Pages/Workers, Neon Postgres, Clerk, managed object storage, Razorpay test mode, and encrypted GitHub Actions backups.

## 1. Hosting map

| Concern | Where to host | What belongs there |
| --- | --- | --- |
| Customer web app | Cloudflare Pages | Vite output from [`prototype/dist/`](./prototype/dist) |
| Customer API | Cloudflare Pages Functions / Workers | [`prototype/functions/api/[[path]].ts`](./prototype/functions/api/%5B%5Bpath%5D%5D.ts) and the production booking/rewards routes |
| Relational data | Neon Postgres Free, Singapore region | Catalog, screenings, holds, bookings, payment/refund state, watch progress, rewards, notifications, audit data |
| Poster/banner files | Neon Object Storage or another configured S3-compatible bucket | Rights-cleared JPEG, PNG, and WebP artwork only |
| Identity | Clerk Hobby | Google sign-in, customer sessions, server-verifiable JWTs |
| Payments | Razorpay | UPI-only test checkout until the pilot passes reconciliation and recovery checks |
| Backups | Private GitHub Actions artifacts | Encrypted database snapshots and changed media manifests |

The free-tier pilot is low-volume and is not a reliability, uptime, data-residency, or disaster-recovery guarantee. Recheck provider pricing, limits, region availability, retention rules, and payment terms before enabling live transactions.

## Customer surface mapping

The customer UI follows the supplied references in [`style/`](./style/):

- `Movie Booking Interface (3).make` is the Discover surface: black cinematic canvas, Instrument Serif headings, amber accent, centered poster rail, swipe-to-book card action, and pill navigation.
- `Music Festival Landing Page.make` is loaded only from the Ticket screen through `Play & Earn Rewards`; the game uses the green Temporal Loom visual language and its 30-second round.
- `User Profile Page.make` is the Profile surface: cream/copper archival layout, flip-style profile/timeline card, watched/streak fields, QR destination, and account settings.

Rewards intentionally live under Ticket rather than as a separate primary navigation item, so eligibility remains connected to a confirmed paid ticket.

The local customer preview reads [`prototype/public/data/doomsday_watchlist.json`](./prototype/public/data/doomsday_watchlist.json) at runtime. The checked-in JSON contains the 61-title metadata and currently has null poster/banner fields. To enrich a licensed copy with the supplied script, set `TMDB_API_KEY`, review the applicable license, then write the output directly to that public data path:

```powershell
python ring\fetch_images.py `
  --input "ring\doomsday_watchlist (1).json" `
  --output "prototype\public\data\doomsday_watchlist.json" `
  --confirm-tmdb-license `
  --overwrite
```

The app will pick up the generated managed image references without changing the customer layout. Review the matches before using any third-party artwork in production.

## 2. Deploy the customer web app

1. Create a Cloudflare Pages project connected to the repository.
2. Set the Pages root directory to `prototype`.
3. Use these build settings:

   ```text
   Framework preset: Vite
   Build command: npm ci && npm run build
   Build output directory: dist
   Node version: 22.x
   ```

4. Add the browser-safe variable in Pages → Settings → Environment variables:

   ```text
   VITE_CLERK_PUBLISHABLE_KEY=pk_live_or_test_...
   ```

5. Deploy from the repository or with:

   ```powershell
   cd prototype
   npm ci
   npm run build
   npx wrangler pages deploy dist --project-name frame-catalog
   ```

The app shows a preview-data ribbon when the API is unavailable so local development stays usable. It must disappear in a deployed environment only after the live catalog, screening, and account APIs are configured and returning real data. Do not put database, Clerk secret, object-storage, or Razorpay credentials in `VITE_*` variables or browser code.

## 3. Configure the Pages Functions API

The following values belong in Cloudflare Pages/Workers encrypted environment variables or secrets, not in [`wrangler.toml`](./prototype/wrangler.toml) and not in Git:

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

Set production values with the Cloudflare dashboard or `wrangler secret put`. Keep preview and production variables separate. Restrict CORS to the Pages/custom-domain origin if a separate API origin is introduced; same-origin `/api/*` routes are preferred.

Before launch, the API must provide the complete customer seam, not only the current catalog/progress prototype routes:

- `GET /api/catalog`, `GET /api/screenings`, and account-scoped `GET/PUT /api/progress`.
- Atomic `POST /api/booking-holds` for one screening, one order, quantity 1–10, a ten-minute hold, and server-created Razorpay orders.
- `POST /api/payments/webhook` with raw-body Razorpay signature verification, provider-event deduplication, out-of-order handling, and paid-but-unfulfilled resolution.
- Account-scoped bookings, QR/order codes, refund state, notifications, and ticket wallet routes.
- Account-scoped campaign enrollment, round completion, reward claim/redemption, coupon-code display, and profile/share settings routes.
- Owner/admin authorization on all privileged writes. A customer must never gain admin or staff access from browser state or public registration.

The browser success callback is not authoritative. The customer app must only show a confirmed ticket after the server has verified the payment event and committed the booking transaction.

## 4. Create and migrate Neon Postgres

1. Create a Neon project and choose the documented Singapore region for the pilot.
2. Create a pooled application connection string and store it as `DATABASE_URL` in Cloudflare.
3. Apply the catalog migration from the repository using a secure local shell or Neon SQL editor:

   ```powershell
   cd prototype
   psql "$env:DATABASE_URL" -f db/001_catalog.sql
   ```

4. Add the production migrations for booking holds, payment events, ticket codes/check-in state, reschedules/cancellations, refunds, notifications, banners, reward campaigns/enrollments/rounds/grants/redemptions, profile settings, QR configuration, activity history, and deletion requests.
5. Add indexes for screening start time, open sales windows, account bookings, account progress, notification unread state, campaign enrollment, payment event ID, and order/ticket code.
6. Import the supplied JSON once through the guarded importer. The JSON is a seed artifact, not the runtime source of truth:

   ```powershell
   node scripts/import-catalog.mjs --input "..\ring\doomsday_watchlist (1).json" --url "https://<pages-domain>"
   ```

All imported titles should start visible and inactive (`Upcoming`). Never import or expose unverified external poster URLs. Titles and screenings must remain independently validated by the server.

For booking holds, use a transaction and row/advisory lock around capacity calculation. Count only unexpired holds plus confirmed bookings, then insert the hold before returning the Razorpay order. Expired holds must be released by query semantics and/or a scheduled cleanup job.

## 5. Configure Clerk

In Clerk:

1. Enable Google as the customer sign-in provider.
2. Add the Pages preview and production URLs as allowed origins/redirect URLs.
3. Create a JWT template named `platform-api` with issuer, subject, expiry, and the `aud` value `platform-api`.
4. Configure the issuer and JWKS URL in the Pages environment variables above.
5. Treat a missing role as `customer`. Bootstrap the owner with an explicit, manually maintained allowlist; assign `admin` and `staff` roles only through server-side operations.
6. Verify the JWT on every private API route. Never trust a role stored in local storage or supplied by a form.

The customer frontend can hide privileged navigation, but authorization still belongs in the API. Staff permissions must additionally be scoped to assigned screenings.

## 6. Configure managed artwork storage

Create a private S3-compatible bucket named `marvelsyllabus-media` (Neon Object Storage if available for the project; otherwise use the S3-compatible provider represented by the `OBJECT_STORAGE_*` variables). Allow the API service account to put/get objects, and do not expose write credentials to the browser.

The upload route should:

- require an authenticated admin and an explicit rights-cleared confirmation;
- accept only JPEG, PNG, and WebP;
- validate both declared MIME type and file magic bytes;
- enforce the 8 MB limit and reasonable image dimensions;
- generate opaque object keys and immutable cache headers;
- return signed read URLs or a safe image proxy URL;
- keep poster and banner keys separate from unverified third-party URLs.

## 7. Configure Razorpay safely

1. Create a Razorpay test account and keep UPI as the only pilot payment method.
2. Store test keys and a webhook secret as Cloudflare secrets.
3. Point the Razorpay webhook to the deployed `/api/payments/webhook` route.
4. Verify the signature against the raw request body before changing payment state.
5. Store and deduplicate provider event IDs. Make payment confirmation idempotent.
6. If a payment arrives after a hold expires, fulfill only when capacity remains; otherwise record paid-but-unfulfilled and expose it to the owner for refund resolution.
7. Do not switch to live keys until payment reconciliation, cancellation/refund behavior, backup restore, and venue check-in have passed acceptance testing.

## 8. Backups and restore

Create a private GitHub Actions workflow that runs daily and when managed media changes. Store these as GitHub Actions secrets:

```text
DATABASE_URL
OBJECT_STORAGE_* credentials
BACKUP_ENCRYPTION_PUBLIC_KEY
BACKUP_RESTORE_KEY            # only in the protected recovery environment
```

The workflow should:

- export the database with `pg_dump` in custom or logical format;
- encrypt the export before it is written to an artifact;
- include changed poster/banner objects and an object-key manifest;
- retain seven daily snapshots and prune older artifacts according to the repository policy;
- fail loudly and alert the operator when export, encryption, upload, or retention fails;
- never print connection strings, encryption keys, raw exports, or payment secrets;
- restore a selected snapshot and media manifest into a disposable Neon/database and bucket before calling the backup healthy.

GitHub artifact retention and quota are not provider-independent recovery. Keep the recovery key outside the repository and test the restore procedure before the first public booking.

## 9. Performance and launch checks

Before launch:

- Run `npm run build` and confirm the game chunk remains lazy-loaded.
- Confirm the app loads the catalog through the API; the watchlist JSON and `.make` archives must not enter the browser bundle.
- Keep managed images dimensioned, lazy-loaded, and served with immutable caching. Preload only the featured hero image when it is genuinely above the fold.
- Verify mobile navigation, keyboard focus, reduced-motion behavior, readable contrast, and touch target sizes.
- Test IST boundaries, inactive/Upcoming titles, sales-open/sales-close/start-time rules, capacity and held inventory, and quantity limits.
- Test verified payment, duplicate/out-of-order webhooks, failed/expired holds, QR wallet state, reschedules, cancellations, refund progress, and online one-time check-in.
- Test reward eligibility, one enrollment per campaign, three completed results-state rounds, reservation/expiry, fixed reward caps, automatic discount/free-ticket math, and one-time redemption.
- Test profile card opt-in: it may contain only watched/streak fields selected by the customer and the operator's shared QR destination; never include identity, bookings, account IDs, or credentials.
- Run `npm test` and the agreed end-to-end acceptance suite against a disposable database and Razorpay/Clerk test doubles.

The current repository build is a customer-facing UI with a safe local preview fallback. It is ready to deploy as a visual pilot, but real public ticket sales require the server-side hold/payment/wallet/reward routes and operational checks above.
