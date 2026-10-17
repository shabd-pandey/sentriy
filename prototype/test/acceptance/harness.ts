// Shared acceptance-test harness for the movie-ticketing platform.
//
// Every later ticket (02-10) tests through this seam. It runs the *real* Cloudflare
// Pages worker (prototype/functions/api/[[path]].ts) against a *real* in-process
// Postgres (PGlite) with the *real* migrations, and real RS256 Clerk tokens — with
// no seam added to production code. The only substitution is the Neon HTTP driver,
// which is swapped for PGlite's parameterised query API.
//
// Usage (see README.md in this directory):
//
//   import { useAcceptanceHarness, customerToken, ownerToken } from "./harness";
//
//   describe("customer wallet", () => {
//     const harness = useAcceptanceHarness();
//     it("returns only the caller's bookings", async () => {
//       const h = harness();
//       const token = await customerToken();
//       const { status, body } = await h.call({ path: "/api/bookings", token });
//       expect(status).toBe(200);
//     });
//   });
import { afterAll, afterEach, beforeEach, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase, truncateAllTables } from "./database";
import { clerkJwksRoute, createFetchStub, type FetchRoute } from "./fetch-stub";
import { testKeys, TEST_AUDIENCE, TEST_ISSUER } from "./tokens";

// The Neon driver is used as a tagged template: `db\`SELECT ... ${param}\``.
// We map that template straight onto PGlite's parameterised `query(sql, params)`
// and return `rows`, which is exactly what the worker destructures. The mock
// factory is hoisted above the worker import below, so the worker always sees it.
const state = vi.hoisted(() => ({ db: null as PGlite | null }));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const db = state.db;
    if (!db) throw new Error("Acceptance harness: no database attached; call useAcceptanceHarness()/createHarness()");
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1]}`;
    }
    const result = await db.query(text, values);
    return result.rows;
  },
}));

import { onRequest } from "../../functions/api/[[path]]";

export { createTestDatabase, applyMigrations, truncateAllTables, MIGRATIONS_DIR } from "./database";
export * from "./tokens";
export { clerkJwksRoute, route, jsonResponse, createFetchStub } from "./fetch-stub";
export type { FetchRoute, FetchHandler } from "./fetch-stub";

/** The environment variables the worker reads (see production.md §3). */
export interface AcceptanceEnv {
  DATABASE_URL: string;
  OBJECT_STORAGE_ENDPOINT: string;
  OBJECT_STORAGE_REGION: string;
  OBJECT_STORAGE_BUCKET: string;
  OBJECT_STORAGE_ACCESS_KEY_ID: string;
  OBJECT_STORAGE_SECRET_ACCESS_KEY: string;
  CLERK_ISSUER: string;
  CLERK_JWKS_URL: string;
  CLERK_AUDIENCE?: string;
  OWNER_EMAILS?: string;
}

export const DEFAULT_JWKS_URL = `${TEST_ISSUER}/.well-known/jwks.json`;

export function createEnv(overrides: Partial<AcceptanceEnv> = {}): AcceptanceEnv {
  return {
    DATABASE_URL: "postgresql://acceptance:acceptance@localhost:5432/acceptance",
    OBJECT_STORAGE_ENDPOINT: "https://storage.example.test",
    OBJECT_STORAGE_REGION: "test-region-1",
    OBJECT_STORAGE_BUCKET: "acceptance-media",
    OBJECT_STORAGE_ACCESS_KEY_ID: "acceptance-access-key",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "acceptance-secret-key",
    CLERK_ISSUER: TEST_ISSUER,
    CLERK_JWKS_URL: DEFAULT_JWKS_URL,
    CLERK_AUDIENCE: TEST_AUDIENCE,
    ...overrides,
  };
}

export interface CallOptions {
  path: string;
  method?: string;
  /** Bearer token; omit for an unauthenticated request. */
  token?: string | null;
  /** Object bodies are JSON-encoded; strings are sent verbatim. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Override the environment for this request (e.g. OWNER_EMAILS). */
  env?: Partial<AcceptanceEnv>;
  /** Route params, mirroring Cloudflare Pages `context.params`. */
  params?: Record<string, string>;
}

export interface ApiResult {
  status: number;
  /** Parsed JSON body when the response is JSON, otherwise the raw text. */
  body: any;
  response: Response;
}

export interface Harness {
  /** The migrated in-process Postgres backing this test. */
  db: PGlite;
  env: AcceptanceEnv;
  /** Call the worker exactly as Cloudflare Pages would. */
  call(options: CallOptions): Promise<ApiResult>;
  /** Run a SQL query against the test database (for seeding fixtures). */
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>;
  /** Run a multi-statement SQL script against the test database. */
  exec(sql: string): Promise<void>;
  /** Every URL the worker fetched, in order. */
  readonly fetchCalls: string[];
  dispose(): Promise<void>;
}

export interface HarnessOptions {
  env?: Partial<AcceptanceEnv>;
  /** Extra fetch routes (e.g. Razorpay in later tickets), appended after the Clerk JWKS route. */
  routes?: FetchRoute[];
}

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const db = await createTestDatabase();
  const harness = await attachHarness(db, options);
  return {
    ...harness,
    async dispose() {
      state.db = null;
      vi.unstubAllGlobals();
      await db.close();
    },
  };
}

/**
 * Point the worker at `db` and install the composable fetch stub. Does not own
 * the database — callers decide when to truncate or close it.
 */
async function attachHarness(db: PGlite, options: HarnessOptions): Promise<Harness> {
  state.db = db;

  const env = createEnv(options.env);
  const { publicJwk } = await testKeys();
  const stub = createFetchStub([clerkJwksRoute(env.CLERK_JWKS_URL, [publicJwk]), ...(options.routes ?? [])]);
  vi.stubGlobal("fetch", stub);

  const call = async (options: CallOptions): Promise<ApiResult> => {
    const headers = new Headers(options.headers);
    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (typeof options.body === "string") {
        body = options.body;
      } else {
        body = JSON.stringify(options.body);
        if (!headers.has("content-type")) headers.set("content-type", "application/json");
      }
    }
    if (options.token) headers.set("authorization", `Bearer ${options.token}`);
    const request = new Request(new URL(options.path, "https://app.test"), {
      method: options.method ?? "GET",
      headers,
      body,
    });
    const response = await onRequest({ request, env: { ...env, ...options.env }, params: options.params ?? {} });
    const clone = response.clone();
    const text = await response.text();
    let parsed: unknown = text;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: response.status, body: parsed, response: clone };
  };

  const query = async <T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]> =>
    (await db.query<T>(text, values as any[])).rows;

  return {
    db,
    env,
    call,
    query,
    exec: async (sql) => {
      await db.exec(sql);
    },
    get fetchCalls() {
      return stub.calls;
    },
    async dispose() {
      vi.unstubAllGlobals();
    },
  };
}

/**
 * Register per-test setup/teardown and get an accessor for the current harness.
 * Call once at the top of a `describe` block; call the returned function inside
 * each `it` to get the harness for the currently running test.
 *
 * One migrated database is booted per suite and truncated before each test, so
 * tests are order-independent without paying for a Postgres boot every time.
 */
export function useAcceptanceHarness(options: HarnessOptions = {}): () => Harness {
  let database: Promise<PGlite> | undefined;
  let current: Harness | undefined;
  const ensureDatabase = () => (database ??= createTestDatabase());

  beforeEach(async () => {
    const db = await ensureDatabase();
    await truncateAllTables(db);
    current = await attachHarness(db, options);
  });

  afterEach(async () => {
    await current?.dispose();
    current = undefined;
  });

  afterAll(async () => {
    state.db = null;
    const db = await database?.catch(() => undefined);
    await db?.close();
    database = undefined;
  });

  return () => {
    if (!current) throw new Error("useAcceptanceHarness() accessor called outside a test");
    return current;
  };
}
