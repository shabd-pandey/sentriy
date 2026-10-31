import { onRequest, type Env } from "./worker";

/**
 * Vercel Node.js adapter for the shared backend.
 *
 * The canonical API is a Web-standard `onRequest(context)` because Cloudflare
 * Pages Functions use that shape. Vercel's Node runtime hands us an
 * IncomingMessage/ServerResponse pair, so this file translates in both
 * directions and leaves every route, auth rule and SQL query in worker.ts.
 *
 * `prototype/api/[...path].ts` and `admin/api/[...path].ts` re-export this
 * default handler, which is why the customer app and the Command Deck show
 * identical data when both are deployed on Vercel.
 */

type NodeRequest = AsyncIterable<Uint8Array | string> & {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  /**
   * Vercel's Node runtime consumes the request stream and pre-parses the body
   * for JSON and URL-encoded payloads. Reading `for await (const chunk of req)`
   * must therefore be skipped when this is populated, otherwise every POST
   * arrives empty and `request.json()` throws.
   */
  body?: unknown;
};

type NodeResponse = {
  statusCode: number;
  setHeader(name: string, value: string | string[]): void;
  end(body?: Uint8Array | string): void;
};

const headerValue = (req: NodeRequest, name: string) => {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(",") : value;
};

const encoder = new TextEncoder();

const readBody = async (req: NodeRequest): Promise<Uint8Array | undefined> => {
  const preParsed = req.body;
  if (preParsed !== undefined && preParsed !== null) {
    if (typeof preParsed === "string") return encoder.encode(preParsed);
    if (preParsed instanceof Uint8Array) return preParsed;
    if (typeof preParsed === "object") {
      const contentType = headerValue(req, "content-type") ?? "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const fields = preParsed as Record<string, unknown>;
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined && value !== null) search.append(key, String(value));
        }
        return encoder.encode(search.toString());
      }
      // Only JSON-ish payloads are pre-parsed into objects by the runtime.
      return encoder.encode(JSON.stringify(preParsed));
    }
    return undefined;
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
  }
  if (chunks.length === 0) return undefined;
  const total = chunks.reduce((size, chunk) => size + chunk.byteLength, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

export default async function handler(req: NodeRequest, res: NodeResponse) {
  const host = headerValue(req, "x-forwarded-host") ?? headerValue(req, "host") ?? "localhost";
  const protocol = headerValue(req, "x-forwarded-proto") ?? "https";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(",") : value);
  }

  const method = (req.method ?? "GET").toUpperCase();
  let body: Uint8Array | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await readBody(req);
  }

  const request = new Request(url, {
    method,
    headers,
    body: body && body.byteLength > 0 ? body as unknown as BodyInit : undefined,
  });

  const response = await onRequest({
    request,
    env: process.env as unknown as Env,
    params: {},
  });

  res.statusCode = response.status;
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  response.headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") return;
    res.setHeader(name, value);
  });
  if (cookies.length > 0) res.setHeader("set-cookie", cookies);
  res.end(new Uint8Array(await response.arrayBuffer()));
}
