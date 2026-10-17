import { describe, expect, it } from "vitest";
import {
  allowlistedOwnerToken,
  badlySignedToken,
  customerToken,
  expiredToken,
  GARBAGE_TOKEN,
  mintToken,
  OWNER_EMAIL,
  ownerToken,
  staffToken,
  useAcceptanceHarness,
  WRONG_ISSUER,
} from "./harness";

// Server-side identity and role enforcement, exercised through the real HTTP
// seam with genuinely signed Clerk JWTs. The security property under test:
// only server-verified claims and the operator's OWNER_EMAILS allowlist can
// grant admin or staff — never a request body or header.
describe("identity and role enforcement", () => {
  const harness = useAcceptanceHarness({ env: { OWNER_EMAILS: OWNER_EMAIL } });

  it("lets a signed-in customer reach customer routes", async () => {
    const h = harness();
    const token = await customerToken();
    const result = await h.call({ path: "/api/progress", token });
    expect(result.status).toBe(200);
    expect(result.body).toEqual([]);
  });

  it("lets an allowlisted owner reach admin routes", async () => {
    const h = harness();
    const token = await allowlistedOwnerToken();
    const result = await h.call({ path: "/api/admin/overview", token });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ titles: 0 });
  });

  it("still lets a metadata admin reach admin routes when OWNER_EMAILS is unset", async () => {
    const h = harness();
    const token = await ownerToken();
    const result = await h.call({ path: "/api/admin/overview", token, env: { OWNER_EMAILS: undefined } });
    expect(result.status).toBe(200);
  });

  it("denies an ordinary customer admin routes", async () => {
    const h = harness();
    const token = await customerToken();
    const result = await h.call({ path: "/api/admin/overview", token });
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "forbidden" });
  });

  it("denies an ordinary customer staff routes", async () => {
    const h = harness();
    const token = await customerToken();
    const result = await h.call({ method: "POST", path: "/api/staff/validate", token, body: { code: "MSY-AAAA-AAAA" } });
    expect(result.status).toBe(403);
  });

  it("lets a staff member reach staff routes but not admin routes", async () => {
    const h = harness();
    const token = await staffToken();
    const staff = await h.call({ path: "/api/staff/screenings", token });
    expect(staff.status).toBe(200);
    const admin = await h.call({ path: "/api/admin/overview", token });
    expect(admin.status).toBe(403);
  });

  describe("rejects unusable credentials", () => {
    const cases: Array<[string, () => Promise<{ path: string; token: string | null }>]> = [
      ["missing token", async () => ({ path: "/api/progress", token: null })],
      ["garbage token", async () => ({ path: "/api/progress", token: GARBAGE_TOKEN })],
      ["expired token", async () => ({ path: "/api/progress", token: await expiredToken() })],
      ["wrong issuer", async () => ({ path: "/api/progress", token: await customerToken({ iss: WRONG_ISSUER }) })],
      ["wrong audience", async () => ({ path: "/api/progress", token: await mintToken({ role: "customer", aud: "some-other-api" }) })],
      ["badly signed token", async () => ({ path: "/api/progress", token: await badlySignedToken() })],
    ];

    it.each(cases)("%s", async (_name, make) => {
      const h = harness();
      const { path, token } = await make();
      const result = await h.call({ path, token });
      expect(result.status).toBe(401);
      expect(result.body).toEqual({ error: "unauthorized" });
    });
  });

  describe("public sign-up cannot escalate privileges", () => {
    it("ignores role and email fields in the request body on an admin route", async () => {
      const h = harness();
      const token = await customerToken();
      const result = await h.call({
        method: "POST",
        path: "/api/admin/catalog",
        token,
        body: { title: "Escalation", titleType: "film", watchOrder: 1, role: "admin", email: OWNER_EMAIL },
      });
      expect(result.status).toBe(403);
    });

    it("ignores forged role headers on a staff route", async () => {
      const h = harness();
      const token = await customerToken();
      const result = await h.call({
        method: "POST",
        path: "/api/staff/check-in",
        token,
        headers: { "x-clerk-role": "staff", "x-clerk-metadata": JSON.stringify({ role: "admin" }) },
        body: { code: "MSY-AAAA-AAAA", role: "admin", staff: true },
      });
      expect(result.status).toBe(403);
    });

    it("does not grant admin from a body email even when it is allowlisted", async () => {
      const h = harness();
      const token = await mintToken({ sub: "user_public", role: "customer", email: "public@example.test" });
      const result = await h.call({
        method: "POST",
        path: "/api/admin/catalog",
        token,
        body: { title: "Escalation", titleType: "film", watchOrder: 1, email: OWNER_EMAIL },
      });
      expect(result.status).toBe(403);
    });
  });
});

describe("account-scoped data", () => {
  const harness = useAcceptanceHarness();

  it("returns only the caller's watch progress", async () => {
    const h = harness();
    const admin = await ownerToken();
    const title = await h.call({
      method: "POST",
      path: "/api/admin/catalog",
      token: admin,
      body: { title: "Andor", titleType: "film", watchOrder: 1 },
    });
    const alice = await customerToken({ sub: "user_alice", email: "alice@example.test" });
    const bob = await mintToken({ sub: "user_bob", role: "customer", email: "bob@example.test" });

    const write = await h.call({ method: "PUT", path: "/api/progress", token: alice, body: { titleId: title.body.id, watched: true } });
    expect(write.status).toBe(200);

    const aliceView = await h.call({ path: "/api/progress", token: alice });
    expect(aliceView.body).toHaveLength(1);
    expect(aliceView.body[0].titleId).toBe(title.body.id);

    const bobView = await h.call({ path: "/api/progress", token: bob });
    expect(bobView.body).toEqual([]);
  });

  it("returns only the caller's bookings", async () => {
    const h = harness();
    await h.exec(`
      INSERT INTO catalog_titles (id, title_type, title, synopsis, active, watch_order)
        VALUES ('film-1', 'film', 'Film One', '', true, 1);
      INSERT INTO screenings (id, title_id, starts_at, ends_at, location, capacity, price_minor)
        VALUES ('11111111-1111-1111-1111-111111111111', 'film-1', now() + interval '1 day', now() + interval '1 day 2 hours', 'Hall A', 50, 10000);
      INSERT INTO bookings (screening_id, user_id, quantity, amount_minor, status, order_code, qr_value)
        VALUES ('11111111-1111-1111-1111-111111111111', 'user_owner', 1, 10000, 'confirmed', 'MSY-AAAA-AAAA', 'marvelsyllabus://ticket/MSY-AAAA-AAAA'),
               ('11111111-1111-1111-1111-111111111111', 'user_other', 2, 20000, 'confirmed', 'MSY-BBBB-BBBB', 'marvelsyllabus://ticket/MSY-BBBB-BBBB');
    `);

    const ownerView = await h.call({ path: "/api/bookings", token: await ownerToken() });
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.map((row: { orderCode: string }) => row.orderCode)).toEqual(["MSY-AAAA-AAAA"]);

    const otherView = await h.call({
      path: "/api/bookings",
      token: await customerToken({ sub: "user_other", email: "other@example.test" }),
    });
    expect(otherView.body.map((row: { orderCode: string }) => row.orderCode)).toEqual(["MSY-BBBB-BBBB"]);
  });
});
