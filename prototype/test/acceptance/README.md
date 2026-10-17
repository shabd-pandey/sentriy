# Acceptance tests (`prototype/test/acceptance`)

This directory holds the shared acceptance-test harness for the movie-ticketing
platform. Every ticket 02–10 tests through this seam.

## How it works

- **Real Postgres:** PGlite boots Postgres 18 in-process (no server, no
  credentials, no network). The real migrations under `prototype/db/` are
  applied in filename order before each suite.
- **Real Clerk auth:** A real RSA key pair is generated, its public JWK is
  served from a stubbed JWKS endpoint, and genuinely signed RS256 tokens are
  minted. Issuer, audience, expiry and signature checks all run for real — we
  do not stub the worker's auth logic.
- **Real worker:** The harness imports `onRequest` from
  `prototype/functions/api/[[path]].ts` and calls it with a real `Request`,
  exactly as Cloudflare Pages would. The Neon HTTP driver (`@neondatabase/serverless`)
  is swapped for PGlite's parameterised query API via `vi.mock` — no seam is
  added to production code.
- **Composable fetch stub:** URL-matched routes let later tickets stub Razorpay
  and other provider calls; anything unmatched throws, so a test can never
  silently reach the real network.

## Using the harness

```ts
import { useAcceptanceHarness, customerToken, ownerToken } from "./harness";

describe("customer wallet", () => {
  const harness = useAcceptanceHarness();

  it("returns only the caller's bookings", async () => {
    const h = harness();
    const token = await customerToken();
    const { status, body } = await h.call({ path: "/api/bookings", token });
    expect(status).toBe(200);
  });
});
```

### Public API

| Export | What it is |
|---|---|
| `useAcceptanceHarness(options?)` | Boots one migrated database per suite, truncates before each test, and returns an accessor `() => Harness`. Call once per `describe`. |
| `createHarness(options?)` | Creates and returns a `Harness` you own (dispose when done). Useful for one-off scripts. |
| `Harness.call(options)` | Calls the worker; returns `{ status, body, response }`. |
| `Harness.query<T>(text, values?)` | Runs SQL against the test database (for seeding/assertions). |
| `Harness.exec(sql)` | Runs a multi-statement SQL script. |
| `Harness.fetchCalls` | Every URL the worker fetched, in order. |
| `customerToken(spec?)`, `ownerToken(spec?)`, `allowlistedOwnerToken(spec?)`, `staffToken(spec?)`, `expiredToken(spec?)`, `badlySignedToken(spec?)`, `mintToken(spec?)` | Token factories. See `tokens.ts`. |
| `createEnv(overrides?)`, `DEFAULT_JWKS_URL` | Environment factory. |
| `clerkJwksRoute(jwksUrl, keys)`, `route(match, handle)`, `createFetchStub(routes)`, `jsonResponse(body, status?)` | Fetch stub building blocks. See `fetch-stub.ts`. |

### Options

`useAcceptanceHarness({ env: { OWNER_EMAILS: "..." }, routes: [...] })` — `env` overrides are merged into the worker environment per request; `routes` are appended after the Clerk JWKS route (use this to stub Razorpay in ticket 05).

### Writing a new test file

1. Import `useAcceptanceHarness` and token factories from `./harness`.
2. Call `useAcceptanceHarness()` once at the top of `describe`.
3. Inside each `it`, call the accessor `const h = harness()` then `h.call({ path, method, token, body })`.
4. Seed fixtures with `h.query(...)` or `h.exec(...)`; assert against the DB with `h.query(...)`.

Tests run with `npx vitest run` from `prototype/`. The worker itself is typechecked with `npm run check:worker`; this whole directory is covered by `tsc -b` (see `tsconfig.json`).
