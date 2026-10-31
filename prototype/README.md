# Shared film/series catalog prototype

The separate **Title catalog** and **Customer dashboard** surfaces use Cloudflare Pages Functions for shared API operations. The old preview-only `Films` editor remains unchanged. Browser code does not import the 55 KB watchlist file and does not persist catalog changes in local storage.

## Data and service boundaries

- `db/001_catalog.sql` creates the live catalog, series season counts, screenings, per-account watch progress, and the future booking/hold tables.
- `/api/catalog` returns the interleaved catalog ordered by `watch_order`, including active/upcoming state and configured season counts. `/api/screenings` uses chronological order.
- `scripts/import-catalog.mjs` is a one-time importer for `ring/doomsday_watchlist (1).json`. It copies IDs, titles, types, descriptions, release years, and `suggested_watch_order`; it deliberately ignores image URLs and makes every imported title inactive. Conflicts are left untouched, so repeat imports do not overwrite admin edits.
- Catalog administration, season maintenance, artwork upload, screenings, and watch progress are handled by `functions/api/[[path]].ts`. Admin operations require a signed Clerk JWT with `role: "admin"`; watch progress uses the JWT subject.
- Poster uploads require an explicit rights confirmation and JPEG, PNG, or WebP content under 8 MB. The Worker stores objects in an S3-compatible object-storage bucket and returns short-lived signed image URLs. Do not import TMDB image links.

## Setup

1. Create a Neon Postgres database and run `db/001_catalog.sql` once in the Neon SQL editor or with `psql`.
2. Create an S3-compatible object-storage bucket (the planned Neon Object Storage integration) and provision server-side endpoint, region, bucket, access-key ID, and secret access key. Do not use a browser-visible storage credential.
3. Configure Clerk Google sign-in and the Clerk JWT template named `platform-api`. The template must include a server-controlled `role` claim populated from trusted Clerk public metadata; only the operator should grant `admin`. Configure `CLERK_ISSUER`, `CLERK_JWKS_URL`, and, if used, `CLERK_AUDIENCE`. Skip this step to run in demo mode with guest bookings.
4. Set Cloudflare Pages environment values/secrets: `DATABASE_URL`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, and, only when using the hosted checkout, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PAYMENTS_MODE=razorpay`. Add `CLERK_ISSUER`, `CLERK_JWKS_URL`, and optional `CLERK_AUDIENCE` when sign-in is enabled. The database, object-storage, and Razorpay secrets must never use the `VITE_` prefix.
5. Build/deploy with `npm run build` and `npm run deploy:pages -- --project-name <your-pages-project>`. The Cloudflare project must be configured for this Pages build output and Functions directory.
6. After the API is deployed, provide a short-lived admin Clerk JWT in `CATALOG_ADMIN_TOKEN` and run the one-time import from the repository root:

   ```powershell
   $env:CATALOG_ADMIN_TOKEN = '<short-lived admin JWT>'
   node prototype\scripts\import-catalog.mjs --input 'ring\doomsday_watchlist (1).json' --url 'https://<your-pages-domain>'
   Remove-Item Env:CATALOG_ADMIN_TOKEN
   ```

7. Configure the four series' season/episode counts in Title catalog before scheduling episode-range screenings or tracking episodes.

For local Pages Functions, first build, then run `npm run dev:pages` (worker on port 8788). Local secrets go in `prototype/.dev.vars` (gitignored); `prototype/.dev.vars` is what Wrangler binds as `env.*`. Do not put real credentials in tracked files.

Razorpay test keys are split the way Vite requires:

- `.env` (repository root, gitignored) holds `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`; the secret is copied into `prototype/.dev.vars` for the local worker.
- `prototype/.env` (gitignored) holds only `VITE_RAZORPAY_KEY_ID`, because every `VITE_*` value is inlined into the browser bundle.
- `.env.example` and `prototype/.env.example` document the shape without real values.

Rotating a key means updating `.env`, `prototype/.env`, and `prototype/.dev.vars`, then rebuilding and restarting both dev servers - Vite reads `VITE_*` once at startup, so a running dev server keeps serving the old key id.

### Demo mode (no sign-in, no payment)

This build is wired for a guest booking test, not a public launch. With `CLERK_ISSUER` and `CLERK_JWKS_URL` unset the worker runs in **demo mode**: it trusts the browser's `x-customer-id` guest id for customer routes and the `x-demo-admin: 1` header for admin routes. With `PAYMENTS_MODE` unset it also runs **manual payments**: a reservation writes a `payment_pending` booking instead of opening Razorpay, and the booking becomes a scannable ticket only after the Command Deck confirms it.

Both switches are automatic and deliberately fail closed: set the two Clerk values and a verified JWT is required again; set `PAYMENTS_MODE=razorpay` (plus both Razorpay keys) and the hosted checkout returns. Do not leave demo mode on a public deployment — anyone can call the admin routes.

For hot reload with a live API, keep `npm run dev:pages` running and start `npm run dev` in a second terminal; Vite proxies `/api` to `http://127.0.0.1:8788`. `npm run dev` on its own has no backend unless that worker is up (the proxied target is `API_ORIGIN` in `vite.config.ts`).

## Deploying on Vercel

Vercel does **not** run `functions/api/[[path]].ts` (that is a Cloudflare Pages convention), so the Vercel function is a separate entrypoint: `api/[...path].js`, a build-time bundle of `backend/src/vercel.ts` - a Node adapter around the same worker. Nothing is duplicated: Cloudflare and Vercel run the same routes, SQL and auth.

`api/[...path].js` is **generated**, not hand-written. `npm run build:api` (`scripts/build-api.mjs`, esbuild) bundles the adapter and worker into one file and `npm run build` runs it first, so the committed copy cannot drift. The bundle is required because Vercel's Node builder does not transpile or trace TypeScript imports that live outside `api/`; a plain re-export of `backend/src/vercel.ts` fails at runtime with `ERR_MODULE_NOT_FOUND`. Do not edit `api/[...path].js` by hand.

### Why `vercel.json` has a rewrite

On a non-Next Vercel project a bracket file is **not** a catch-all: `api/[...path].js` matches exactly one segment, so `/api/health` works while `/api/admin/bookings` and `/api/staff/validate` 404 at the edge before the function runs. `vercel.json` therefore rewrites every `/api/...` request onto that function:

```json
"rewrites": [{ "source": "/api/(.*)", "destination": "/api/[...path]?__path=$1" }]
```

The function reads the original request URL, so the adapter needs no special handling. If you rename or move the bundle, update this rewrite in the same commit; without it only single-segment routes answer.

1. Import the repository at vercel.com and, in the monorepo, set **Root Directory** to `prototype` (the standalone `movieticketbooking` repo keeps the app at its root).
2. Leave **Include source files outside of the Root Directory in the Build Step** enabled (the default) if `backend/` sits above the project root; the bundler reads `backend/src/vercel.ts` there. The standalone repo vendors `backend/` inside the project, so no outside files are needed.
3. `vercel.json` already pins the framework (`vite`), build (`npm run build`), output (`dist`), region (`sin1`), a 30s limit for `api/*.js`, and the `/api/(.*)` rewrite described above.
4. Add the environment variables below for **Production** and **Preview**.
5. Apply every migration in `db/` (001 through 006) to the same Neon database.
6. Deploy, then open `https://<project>.vercel.app/api/health`. It must answer `{"ok":true,"database":true,...}`. A 404 means the function was not built; `ok:false` with `database:false` means `DATABASE_URL` is wrong or unreachable.
7. Open the app and book a screening. In demo mode it reserves a seat as a guest; the Command Deck's Bookings tab then confirms it, and the wallet flips to a scannable ticket. If the preview-data notice is still showing, `/api/health` is failing.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | API | Neon pooled connection string |
| `CLERK_ISSUER`, `CLERK_JWKS_URL` | API auth | Leave unset for demo mode; set both to require verified Clerk JWTs |
| `OWNER_EMAILS` | first admin | Comma-separated verified Google emails granted `admin` |
| `PAYMENTS_MODE` | checkout | `razorpay` for hosted checkout; unset (default) books `payment_pending` for manual confirmation |
| `OBJECT_STORAGE_*` | artwork upload | Endpoint, region, bucket, access key id, secret |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | hosted checkout | Server-side only, and only read when `PAYMENTS_MODE=razorpay` |
| `CORS_ORIGINS` | split hosting | Comma-separated frontend origins; only needed when the API is on a different domain |
| `VITE_API_BASE_URL` | build | Optional absolute API origin (for example a Cloudflare Worker). Leave empty for same-origin `/api` |

The admin Command Deck deploys the same way from `admin/` (its own `scripts/build-api.mjs` generates `admin/api/[...path].js` from the same adapter), so both Vercel projects read one database and one set of rules.

### Seeding the shipped posters

`public/data/streak-collection/posters/` ships one portrait poster per catalog title, but the catalog API only returns `posterUrl` when the row has a `poster_key`. Upload and link them once with:

```sh
npm run upload:posters -- --dry-run   # list what would change
npm run upload:posters                # upload artwork/<title-id>.jpg and set poster_key
```

The script reads `DATABASE_URL` and `OBJECT_STORAGE_*` from `.dev.vars`, `.env.local` or the environment, skips rows that already match, and is safe to re-run after adding titles. Without it every card falls back to a letter tile.

## Checkout and confirmation

Manual mode is the default (`PAYMENTS_MODE` unset):

- `POST /api/booking-holds` reserves seats for ten minutes, bounded by what is actually left in the hall.
- `POST /api/create-order` writes a `payment_pending` booking with `payment_reference = 'manual'` and returns `{ manual: true, bookingId, orderCode }`. The amount is recomputed from the database, never taken from the browser.
- `POST /api/admin/bookings/:id/confirm` (Command Deck → Bookings → **Confirm**) flips it to `confirmed`, redeems the reward held for it, and logs the activity. A booking that is not `payment_pending` answers `409 booking_not_pending`.
- `GET /api/bookings` is the account wallet and it is authoritative. Pending rows stay visible to their owner and are labelled "Awaiting confirmation"; they are not scannable, and door staff reject anything that is not `confirmed`.
- Refund and cancel still only flip the booking status and invalidate the ticket.

Set `PAYMENTS_MODE=razorpay` (with both Razorpay keys) to restore the hosted checkout: `create-order` returns a real Razorpay order and `POST /api/verify-payment` recomputes the HMAC-SHA256 signature over `<order_id>|<payment_id>` before confirming. That path still has no webhook, so a payment completed out-of-band needs manual reconciliation.

## Local data

Two scripts fill an empty database:

1. `node prototype\scripts\seed-screenings.mjs` publishes six upcoming screenings (fixed ids, so re-running refreshes their dates and keeps them bookable) using `DATABASE_URL` from `prototype\.dev.vars`.
2. For the catalog itself, either import the watchlist through the admin API (step 6) or insert the titles described in `db/001_catalog.sql`.

`scripts/seed-screenings.mjs` never touches screenings created elsewhere; it only rewrites its own six ids.

The local setup cannot be completed without the operator's Neon database, object-storage bucket/credentials, Cloudflare Pages project, and Clerk configuration. No live service credentials or TMDB artwork are included in this repository.
