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

- `backend/package.json` — manifest (deps: `@neondatabase/serverless`, `@aws-sdk/client-s3`,
  `@aws-sdk/s3-request-presigner`; devDeps: TypeScript, vitest, PGlite for acceptance tests).
- `backend/tsconfig.json` — strict TypeScript config mirroring the existing app configs.
- `backend/src/worker.ts` — the canonical `onRequest` Pages Function (moved here from
  `prototype/functions/api/[[path]].ts` once ticket 01 lands).

## Deployment (Cloudflare Pages Functions constraint)

Cloudflare Pages Functions must live **inside each project's root directory**. So each Pages
project keeps a thin re-export shim in its own `functions/api/[[path]].ts`:

```ts
// prototype/functions/api/[[path]].ts
export { onRequest } from "../../backend/src/worker";

// admin/functions/api/[[path]].ts
export { onRequest } from "../../backend/src/worker";
```

Both Pages projects (`frame-catalog`, `marvelsyllabus-command-deck`) therefore serve byte-identical
API behaviour from one source file.

## Environment variables (set on both Pages projects)

`DATABASE_URL`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`,
`OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `CLERK_ISSUER`,
`CLERK_JWKS_URL`, `CLERK_AUDIENCE` (optional).

## Roadmap status

`backend/src/worker.ts` does not exist yet. Ticket `01-runnable-platform-foundation` is
implementing the worker's auth/role enforcement and the acceptance-test harness against the current
`prototype/functions/api/[[path]].ts`. When ticket 01 merges to `integration/movie-ticketing-platform`,
the worker will be moved here verbatim and the shims created. Tickets 02–10 then extend
`backend/src/worker.ts` directly.
