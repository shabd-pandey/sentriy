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
4. Set Cloudflare Pages environment values/secrets: `DATABASE_URL`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `CLERK_ISSUER`, `CLERK_JWKS_URL`, and optional `CLERK_AUDIENCE`. Set `VITE_CLERK_PUBLISHABLE_KEY` as a Pages build variable. The database and object-storage secrets must never use the `VITE_` prefix.
5. Build/deploy with `npm run build` and `npm run deploy:pages -- --project-name <your-pages-project>`. The Cloudflare project must be configured for this Pages build output and Functions directory.
6. After the API is deployed, provide a short-lived admin Clerk JWT in `CATALOG_ADMIN_TOKEN` and run the one-time import from the repository root:

   ```powershell
   $env:CATALOG_ADMIN_TOKEN = '<short-lived admin JWT>'
   node prototype\scripts\import-catalog.mjs --input 'ring\doomsday_watchlist (1).json' --url 'https://<your-pages-domain>'
   Remove-Item Env:CATALOG_ADMIN_TOKEN
   ```

7. Configure the four series' season/episode counts in Title catalog before scheduling episode-range screenings or tracking episodes.

For local Pages Functions, first build, then run `npm run dev:pages`. Supply local service variables using Wrangler's local development environment; do not put real credentials in the repository. `npm run dev` alone runs only Vite and cannot reach these Pages Functions.

## Operational limits

The current implementation does not accept ticket payments or create successful booking orders. Screening availability and safe database shapes exist, but a transactional inventory-hold endpoint, Razorpay test checkout, signed webhook verification, reconciliation/refunds, and booking wallet still need to be implemented and deployed before any tickets are sold. The customer “Book” action intentionally reports that checkout is not connected; it does not claim or record a booking.

The local setup cannot be completed without the operator's Neon database, object-storage bucket/credentials, Cloudflare Pages project, and Clerk configuration. No live service credentials or TMDB artwork are included in this repository.
