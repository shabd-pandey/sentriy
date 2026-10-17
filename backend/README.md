# `@sentriy/backend` — the single shared backend

This package is the **one and only** implementation of the MarvelSyllabus API. All three frontends
talk to it, and it talks to one database:

| Frontend | How it reaches the backend |
|---|---|
| Customer web (`prototype/`) | `prototype/functions/api/[[path]].ts` → re-exports `backend/src/worker.ts` |
| Admin Command Deck (`admin/`) | `admin/functions/api/[[path]].ts` → re-exports `backend/src/worker.ts` |
| Door staff (`door_staff_app/`) | Calls the Pages domain directly (`/api/staff/*`) |

## Why a separate package

Previously the canonical worker lived inside `prototype/functions/api/[[path]].ts` and `admin/` just
re-exported it. That worked, but the "single source of truth" was buried inside a customer-app
folder. Moving it to `backend/src/worker.ts` makes the contract explicit: one implementation, one
test suite, one deployment story.

## Files

- `backend/package.json` — manifest (deps: `@neondatabase/serverless`,
  `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`; devDeps: TypeScript,
  vitest, PGlite for acceptance tests).
- `backend/tsconfig.json` — strict TypeScript config mirroring the existing app
  configs.
- `backend/src/worker.ts` — the canonical `onRequest` Pages Function, moved
  here from `prototype/functions/api/[[path]].ts` (commit `f0b1a4d`).

Both Pages projects keep thin re-export shims in their own `functions/` directory,
because Cloudflare Pages Functions must live inside each project root:

```ts
// prototype/functions/api/[[path]].ts
export { onRequest } from "../../../backend/src/worker";

// admin/functions/api/[[path]].ts
export { onRequest } from "../../../backend/src/worker";
```

Both Pages projects (`frame-catalog`, `marvelsyllabus-command-deck`) therefore
serve byte-identical API behaviour from one source file.

## Local typechecking

`backend/node_modules` is a local junction to `prototype/node_modules` so
`tsc` can resolve `@neondatabase/serverless` etc. from `backend/src/worker.ts`.
It is gitignored and not part of the repository.

## Environment variables (set on both Pages projects)

`DATABASE_URL`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`,
`OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`,
`OBJECT_STORAGE_SECRET_ACCESS_KEY`, `CLERK_ISSUER`, `CLERK_JWKS_URL`,
`CLERK_AUDIENCE` (optional), `OWNER_EMAILS` (optional allowlist).

## Roadmap status

`backend/src/worker.ts` exists. Tickets 02–10 extend it directly:

- 02 catalog titles and customer catalog ← blocked by 01 ✅ unblocked
- 03 screenings ← blocked by 02
- 04 inventory holds and test checkout ← blocked by 03
- 05 verified payment and customer ticket wallet ← blocked by 04
- 06 staff ticket check-in ← blocked by 05
- 07 screening changes, refunds, customer updates ← blocked by 05
- 08 promotional banners ← blocked by 01 ✅ unblocked
- 09 admin activity dashboard ← blocked by 02, 03, 05, 06, 07, 08
- 10 encrypted backup and restore ← blocked by 02, 03, 05, 07, 08

Next frontier: tickets **02** and **08** (both unblocked by 01).
