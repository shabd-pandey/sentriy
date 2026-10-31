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
3. Configure Clerk Google sign-in and the Clerk JWT template named `platform-api`. The template must include a server-controlled `role` claim populated from trusted Clerk public metadata; only the operator should grant `admin`. Configure `CLERK_ISSUER`, `CLERK_JWKS_URL`, and, if used, `CLERK_AUDIENCE`.
4. Set Cloudflare Pages environment values/secrets: `DATABASE_URL`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `CLERK_ISSUER`, `CLERK_JWKS_URL`, and optional `CLERK_AUDIENCE`. Set `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_RAZORPAY_KEY_ID` as Pages build variables. The database, object-storage, and Razorpay secrets must never use the `VITE_` prefix.
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

Rotating a key means updating `.env`, `prototype/.env`, and `prototype/.dev.vars`, then rebuilding and restarting both dev servers — Vite reads `VITE_*` once at startup, so a running dev server keeps serving the old key id.

For hot reload with a live API, keep `npm run dev:pages` running and start `npm run dev` in a second terminal; Vite proxies `/api` to `http://127.0.0.1:8788`. `npm run dev` on its own has no backend unless that worker is up (the proxied target is `API_ORIGIN` in `vite.config.ts`).

## Deploying on Vercel

Vercel does **not** run `functions/api/[[path]].ts` (that is a Cloudflare Pages convention), so the Vercel function is a separate entrypoint: `api/[...path].js`, a build-time bundle of `backend/src/vercel.ts` - a Node adapter around the same worker. Nothing is duplicated: Cloudflare and Vercel run the same routes, SQL and auth.

`api/[...path].js` is **generated**, not hand-written. `npm run build:api` (`scripts/build-api.mjs`, esbuild) bundles the adapter and worker into one file and `npm run build` runs it first, so the committed copy cannot drift. The bundle is required because Vercel's Node builder does not transpile or trace TypeScript imports that live outside `api/`; a plain re-export of `backend/src/vercel.ts` fails at runtime with `ERR_MODULE_NOT_FOUND`. Do not edit `api/[...path].js` by hand.

1. Import the repository at vercel.com and, in the monorepo, set **Root Directory** to `prototype` (the standalone `movieticketbooking` repo keeps the app at its root).
2. Leave **Include source files outside of the Root Directory in the Build Step** enabled (the default) if `backend/` sits above the project root; the bundler reads `backend/src/vercel.ts` there. The standalone repo vendors `backend/` inside the project, so no outside files are needed.
3. `vercel.json` already pins the framework (`vite`), build (`npm run build`), output (`dist`), region (`sin1`) and a 30s limit for `api/**/*.js`.
4. Add the environment variables below for **Production** and **Preview**.
5. Apply every migration in `db/` (001 through 006) to the same Neon database.
6. Deploy, then open `https://<project>.vercel.app/api/health`. It must answer `{"ok":true,"database":true,...}`. A 404 means the function was not built; `ok:false` with `database:false` means `DATABASE_URL` is wrong or unreachable.
7. Sign in, then confirm the preview-data notice is gone. If it still says the API is unavailable, `/api/health` is failing or `VITE_CLERK_PUBLISHABLE_KEY` was missing at build time (Vite inlines it, so change it and redeploy; restarting is not enough).

| Variable | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | API | Neon pooled connection string |
| `CLERK_ISSUER`, `CLERK_JWKS_URL` | API auth | Optional `CLERK_AUDIENCE=platform-api` |
| `OWNER_EMAILS` | first admin | Comma-separated verified Google emails granted `admin` |
| `OBJECT_STORAGE_*` | artwork upload | Endpoint, region, bucket, access key id, secret |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | checkout | Server-side only |
| `CORS_ORIGINS` | split hosting | Comma-separated frontend origins; only needed when the API is on a different domain |
| `VITE_CLERK_PUBLISHABLE_KEY` | build | Inlined into the bundle; without it production renders signed-out with a configuration notice |
| `VITE_API_BASE_URL` | build | Optional absolute API origin (for example a Cloudflare Worker). Leave empty for same-origin `/api` |
| `VITE_RAZORPAY_KEY_ID` | build | Optional public Razorpay key id; `/api/config` is preferred and overrides it |

The admin Command Deck deploys the same way from `admin/` (its own `scripts/build-api.mjs` generates `admin/api/[...path].js` from the same adapter), so both Vercel projects read one database and one set of rules.

### Seeding the shipped posters

`public/data/streak-collection/posters/` ships one portrait poster per catalog title, but the catalog API only returns `posterUrl` when the row has a `poster_key`. Upload and link them once with:

```sh
npm run upload:posters -- --dry-run   # list what would change
npm run upload:posters                # upload artwork/<title-id>.jpg and set poster_key
```

The script reads `DATABASE_URL` and `OBJECT_STORAGE_*` from `.dev.vars`, `.env.local` or the environment, skips rows that already match, and is safe to re-run after adding titles. Without it every card falls back to a letter tile.

## Checkout

Booking is hold → Razorpay order → server-side signature check → wallet:

- `POST /api/booking-holds` reserves seats for ten minutes, bounded by what is actually left in the hall.
- `POST /api/create-order` writes the `payment_pending` booking and creates the Razorpay order server-side. The amount is recomputed from the database, never taken from the browser.
- `POST /api/verify-payment` recomputes the HMAC-SHA256 signature over `<order_id>|<payment_id>` with `RAZORPAY_KEY_SECRET` and only then marks the booking `confirmed`.
- `GET /api/bookings` is the account wallet and it is authoritative. Unpaid `payment_pending` rows stay visible to their owner and are labelled "Payment pending"; door staff reject anything that is not `confirmed`.

Still open before real money moves:

- There is no Razorpay webhook, so confirmation depends on the browser finishing the callback. A payment completed out-of-band needs manual reconciliation.
- The admin refund/cancel actions only flip the booking status and invalidate the ticket. They do **not** call the Razorpay refund API, and the payment id is not stored, so money has to be refunded from the Razorpay dashboard.
- Screening inventory is checked at hold time and again at order time, but there is no reservation lock across the two calls.

## Local data

Two scripts fill an empty database:

1. `node prototype\scripts\seed-screenings.mjs` publishes six upcoming screenings (fixed ids, so re-running refreshes their dates and keeps them bookable) using `DATABASE_URL` from `prototype\.dev.vars`.
2. For the catalog itself, either import the watchlist through the admin API (step 6) or insert the titles described in `db/001_catalog.sql`.

`scripts/seed-screenings.mjs` never touches screenings created elsewhere; it only rewrites its own six ids.

The local setup cannot be completed without the operator's Neon database, object-storage bucket/credentials, Cloudflare Pages project, and Clerk configuration. No live service credentials or TMDB artwork are included in this repository.
