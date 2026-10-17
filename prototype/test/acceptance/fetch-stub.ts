// Composable fetch stub for the acceptance harness.
//
// The worker reaches the network in exactly one place during auth — it fetches
// the Clerk JWKS — and later tickets add Razorpay HTTP calls. Rather than
// stubbing one call site, tests register URL-matched routes; anything
// unmatched throws so a test can never silently reach the real network.
export type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>;

export interface FetchRoute {
  /** Return true when this route handles the given request URL. */
  match: (url: URL) => boolean;
  handle: FetchHandler;
}

export interface FetchStub {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  /** Every URL the worker requested, in order (useful for assertions). */
  calls: string[];
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Serve `{ keys }` for the Clerk JWKS URL the worker was configured with. */
export function clerkJwksRoute(jwksUrl: string, keys: JsonWebKey[]): FetchRoute {
  const target = new URL(jwksUrl);
  return {
    match: (url) => url.href === target.href,
    handle: () => jsonResponse({ keys }),
  };
}

/** Route matching an origin + pathname prefix, for stubbing later provider calls. */
export function route(match: string, handle: FetchHandler): FetchRoute {
  const target = new URL(match);
  return { match: (url) => url.href.startsWith(target.href), handle };
}

export function createFetchStub(routes: FetchRoute[]): FetchStub {
  const calls: string[] = [];
  const stub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.href);
    for (const candidate of routes) {
      if (candidate.match(url)) return candidate.handle(input, init);
    }
    throw new Error(`Acceptance harness: unstubbed fetch to ${url.href}`);
  };
  (stub as FetchStub).calls = calls;
  return stub as FetchStub;
}
