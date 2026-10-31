import { describe, expect, it, vi } from "vitest";

// The adapter only translates Node <-> Web requests. Stub the worker so the
// test can assert on what the worker would actually receive.
vi.mock("../../../backend/src/worker", () => ({
  onRequest: async ({ request }: { request: Request }) =>
    new Response(
      JSON.stringify({
        method: request.method,
        url: request.url,
        body: await request.text(),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
}));

const { default: handler } = await import("../../../backend/src/vercel");

type NodeRequest = Parameters<typeof handler>[0];
type NodeResponse = Parameters<typeof handler>[1];

const invoke = async (request: Record<string, unknown>) => {
  const result = { status: 0, headers: {} as Record<string, string>, payload: "" };
  const response = {
    set statusCode(value: number) {
      result.status = value;
    },
    get statusCode() {
      return result.status;
    },
    setHeader(name: string, value: string | string[]) {
      result.headers[name.toLowerCase()] = Array.isArray(value) ? value.join("|") : value;
    },
    end(body?: Uint8Array | string) {
      result.payload = body === undefined ? "" : typeof body === "string" ? body : new TextDecoder().decode(body);
    },
  };
  await handler(request as unknown as NodeRequest, response as unknown as NodeResponse);
  return result;
};

const streamMustNotBeRead = () => {
  throw new Error("request stream was read even though the runtime pre-parsed the body");
};

const call = (overrides: Record<string, unknown>) => ({
  method: "POST",
  url: "/api/account?source=vercel",
  headers: { "content-type": "application/json", host: "example.vercel.app", "x-forwarded-proto": "https" },
  [Symbol.asyncIterator]: streamMustNotBeRead,
  ...overrides,
});

describe("Vercel adapter", () => {
  it("forwards a body the Vercel runtime pre-parsed into an object", async () => {
    const result = await invoke(call({ body: { displayName: "Smoke Test" } }));
    expect(result.status).toBe(200);
    expect(JSON.parse(result.payload)).toMatchObject({
      method: "POST",
      url: "https://example.vercel.app/api/account?source=vercel",
      body: '{"displayName":"Smoke Test"}',
    });
  });

  it("forwards a pre-parsed string or buffer body without re-reading the stream", async () => {
    const asString = await invoke(call({ body: '{"displayName":"Smoke Test"}' }));
    const asBuffer = await invoke(call({ body: Buffer.from('{"displayName":"Smoke Test"}') }));
    expect(JSON.parse(asString.payload).body).toBe('{"displayName":"Smoke Test"}');
    expect(JSON.parse(asBuffer.payload).body).toBe('{"displayName":"Smoke Test"}');
  });

  it("reads the stream when the runtime did not pre-parse the body", async () => {
    const result = await invoke(
      call({
        body: undefined,
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('{"displayName":"Smoke');
          yield Buffer.from(' Test"}');
        },
      }),
    );
    expect(JSON.parse(result.payload).body).toBe('{"displayName":"Smoke Test"}');
  });

  it("re-encodes form bodies that were pre-parsed into objects", async () => {
    const result = await invoke(
      call({
        headers: { "content-type": "application/x-www-form-urlencoded", host: "example.vercel.app" },
        body: { a: "1", b: "two" },
      }),
    );
    expect(JSON.parse(result.payload).body).toBe("a=1&b=two");
  });

  it("keeps bodyless GET requests empty", async () => {
    const result = await invoke({
      method: "GET",
      url: "/api/health",
      headers: { host: "example.vercel.app" },
      async *[Symbol.asyncIterator]() {},
    });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.payload).body).toBe("");
  });
});
