import { describe, expect, it } from "vitest";
import { useAcceptanceHarness } from "./harness";

// The manual booking seam: guest reserve -> `payment_pending` booking ->
// Command Deck confirm -> scannable ticket. No Clerk, no Razorpay: the worker's
// demo mode trusts `x-customer-id` and `x-demo-admin`, so this exercises the
// same path the deployed prototype and admin app use.
const SCREENING_ID = "33333333-3333-4333-8333-333333333333";
const GUEST = "guest-acceptance-0001";

const guestHeaders = { "x-customer-id": GUEST };
const adminHeaders = { "x-customer-id": GUEST, "x-demo-admin": "1" };

describe("manual booking confirmation", () => {
  const harness = useAcceptanceHarness({ env: { CLERK_ISSUER: "", PAYMENTS_MODE: "manual" } });

  async function seedScreening(h: ReturnType<typeof harness>, capacity = 4) {
    await h.query(
      `INSERT INTO catalog_titles (id, title_type, title, watch_order, active)
       VALUES ('iron-man', 'film', 'Iron Man', 1, true)`,
    );
    await h.query(
      `INSERT INTO screenings (id, title_id, starts_at, ends_at, location, capacity, price_minor, sales_open_at, sales_close_at)
       VALUES ($1, 'iron-man', now() + interval '2 days', now() + interval '2 days 2 hours',
         'Arc Cinema · Hall 01', $2, 25000, now() - interval '1 day', now() + interval '2 days')`,
      [SCREENING_ID, capacity],
    );
  }

  it("reserves as a guest, then confirms in the Command Deck", async () => {
    const h = harness();
    await seedScreening(h);

    const hold = await h.call({
      method: "POST",
      path: "/api/booking-holds",
      headers: guestHeaders,
      body: { screeningId: SCREENING_ID, quantity: 2 },
    });
    expect(hold.status).toBe(201);

    const order = await h.call({
      method: "POST",
      path: "/api/create-order",
      headers: guestHeaders,
      body: { holdId: hold.body.holdId },
    });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ manual: true, amount: 50000, currency: "INR" });
    expect(order.body.orderCode).toMatch(/^MSY-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const adminList = await h.call({
      path: `/api/admin/bookings?screeningId=${SCREENING_ID}`,
      headers: adminHeaders,
    });
    expect(adminList.status).toBe(200);
    expect(adminList.body).toHaveLength(1);
    expect(adminList.body[0]).toMatchObject({
      id: order.body.bookingId,
      orderCode: order.body.orderCode,
      status: "payment_pending",
      ticketStatus: "valid",
    });

    const confirmed = await h.call({
      method: "POST",
      path: `/api/admin/bookings/${order.body.bookingId}/confirm`,
      headers: adminHeaders,
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ ok: true, status: "confirmed", orderCode: order.body.orderCode });

    const wallet = await h.call({ path: "/api/bookings", headers: guestHeaders });
    expect(wallet.status).toBe(200);
    expect(wallet.body[0]).toMatchObject({
      orderCode: order.body.orderCode,
      status: "confirmed",
      ticketStatus: "valid",
    });

    const ticket = await h.call({
      method: "POST",
      path: "/api/staff/validate",
      headers: adminHeaders,
      body: { code: order.body.orderCode },
    });
    expect(ticket.status).toBe(200);
    expect(ticket.body).toMatchObject({ status: "valid", code: order.body.orderCode });

    const again = await h.call({
      method: "POST",
      path: `/api/admin/bookings/${order.body.bookingId}/confirm`,
      headers: adminHeaders,
    });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("booking_not_pending");
  });

  it("hides pending bookings from the door until they are confirmed", async () => {
    const h = harness();
    await seedScreening(h);

    const hold = await h.call({
      method: "POST",
      path: "/api/booking-holds",
      headers: guestHeaders,
      body: { screeningId: SCREENING_ID, quantity: 1 },
    });
    const order = await h.call({
      method: "POST",
      path: "/api/create-order",
      headers: guestHeaders,
      body: { holdId: hold.body.holdId },
    });
    expect(order.status).toBe(201);

    const ticket = await h.call({
      method: "POST",
      path: "/api/staff/validate",
      headers: adminHeaders,
      body: { code: order.body.orderCode },
    });
    expect(ticket.status).toBe(200);
    expect(ticket.body.status).not.toBe("valid");
  });

  it("keeps admin routes closed without the demo admin marker", async () => {
    const h = harness();
    await seedScreening(h);

    const list = await h.call({ path: "/api/admin/bookings", headers: guestHeaders });
    expect(list.status).toBe(403);

    const order = await h.call({
      method: "POST",
      path: "/api/booking-holds",
      headers: guestHeaders,
      body: { screeningId: SCREENING_ID, quantity: 1 },
    });
    const booking = await h.call({
      method: "POST",
      path: "/api/create-order",
      headers: guestHeaders,
      body: { holdId: order.body.holdId },
    });
    const confirm = await h.call({
      method: "POST",
      path: `/api/admin/bookings/${booking.body.bookingId}/confirm`,
      headers: guestHeaders,
    });
    expect(confirm.status).toBe(403);
  });
});
