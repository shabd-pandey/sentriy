import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { customerToken, jsonResponse, route, useAcceptanceHarness } from "./harness";

// The customer checkout seam: hold -> Razorpay order -> signature check ->
// confirmed ticket in the wallet. The worker's Razorpay calls are the only
// network dependency, so they are stubbed; token verification, SQL, inventory
// math and HMAC signature verification all run for real.
const RAZORPAY_ORDERS = "https://api.razorpay.com/v1/orders";
const SCREENING_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "order_acceptance_1";
const PAYMENT_ID = "pay_acceptance_1";
const KEY_SECRET = "acceptance_secret";

const razorpayRoute = route(RAZORPAY_ORDERS, () =>
  jsonResponse({ id: ORDER_ID, amount: 50000, currency: "INR" }, 200));

const signature = (orderId: string, paymentId: string) =>
  createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

describe("ticket checkout", () => {
  const harness = useAcceptanceHarness({ routes: [razorpayRoute] });

  async function seedScreening(h: ReturnType<typeof harness>, options: { capacity?: number; priceMinor?: number; salesClosed?: boolean } = {}) {
    const { capacity = 4, priceMinor = 25000, salesClosed = false } = options;
    await h.query(
      `INSERT INTO catalog_titles (id, title_type, title, watch_order, active)
       VALUES ('iron-man', 'film', 'Iron Man', 1, true)`,
    );
    await h.query(
      `INSERT INTO screenings (id, title_id, starts_at, ends_at, location, capacity, price_minor, sales_open_at, sales_close_at)
       VALUES ($1, 'iron-man', now() + interval '2 days', now() + interval '2 days 2 hours',
         'Arc Cinema · Hall 01', $2, $3,
         now() - interval '1 day',
         CASE WHEN $4 THEN now() - interval '1 hour' ELSE now() + interval '2 days' END)`,
      [SCREENING_ID, capacity, priceMinor, salesClosed],
    );
  }

  async function holdSeats(h: ReturnType<typeof harness>, token: string, quantity = 2) {
    const hold = await h.call({
      method: "POST",
      path: "/api/booking-holds",
      token,
      body: { screeningId: SCREENING_ID, quantity },
    });
    expect(hold.status).toBe(201);
    return hold.body.holdId as string;
  }

  it("holds seats, opens a Razorpay order and confirms the ticket", async () => {
    const h = harness();
    await seedScreening(h);
    const token = await customerToken();

    const holdId = await holdSeats(h, token, 2);

    const order = await h.call({ method: "POST", path: "/api/create-order", token, body: { holdId } });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ order_id: ORDER_ID, amount: 50000, currency: "INR" });
    expect(h.fetchCalls).toContain(RAZORPAY_ORDERS);

    const verified = await h.call({
      method: "POST",
      path: "/api/verify-payment",
      token,
      body: {
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: signature(ORDER_ID, PAYMENT_ID),
      },
    });
    expect(verified.status).toBe(200);
    expect(verified.body.success).toBe(true);
    expect(verified.body.orderCode).toMatch(/^MSY-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const wallet = await h.call({ path: "/api/bookings", token });
    expect(wallet.status).toBe(200);
    expect(wallet.body).toHaveLength(1);
    expect(wallet.body[0]).toMatchObject({
      orderCode: verified.body.orderCode,
      screeningId: SCREENING_ID,
      title: "Iron Man",
      quantity: 2,
      amountMinor: 50000,
      status: "confirmed",
      ticketStatus: "valid",
      qrValue: `marvelsyllabus://ticket/${verified.body.orderCode}`,
    });

    const screenings = await h.call({ path: "/api/screenings" });
    expect(screenings.body[0].soldCount).toBe(2);
  });

  it("rejects a signature that does not match the payment", async () => {
    const h = harness();
    await seedScreening(h);
    const token = await customerToken();
    const holdId = await holdSeats(h, token, 1);
    await h.call({ method: "POST", path: "/api/create-order", token, body: { holdId } });

    const verified = await h.call({
      method: "POST",
      path: "/api/verify-payment",
      token,
      body: {
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: "0".repeat(64),
      },
    });

    expect(verified.status).toBe(400);
    expect(verified.body.error).toBe("signature_mismatch");

    // The abandoned checkout stays visible to its owner, but only as pending —
    // door staff reject anything that is not `confirmed`.
    const wallet = await h.call({ path: "/api/bookings", token });
    expect(wallet.body).toHaveLength(1);
    expect(wallet.body[0].status).toBe("payment_pending");
  });

  it("refuses a hold once sales have closed", async () => {
    const h = harness();
    await seedScreening(h, { salesClosed: true });
    const token = await customerToken();

    const hold = await h.call({
      method: "POST",
      path: "/api/booking-holds",
      token,
      body: { screeningId: SCREENING_ID, quantity: 1 },
    });

    expect(hold.status).toBe(409);
    expect(hold.body.error).toBe("not_on_sale");
  });

  it("refuses a hold beyond the seats left", async () => {
    const h = harness();
    await seedScreening(h, { capacity: 2 });
    const token = await customerToken();

    const hold = await h.call({
      method: "POST",
      path: "/api/booking-holds",
      token,
      body: { screeningId: SCREENING_ID, quantity: 3 },
    });

    expect(hold.status).toBe(409);
    expect(hold.body.error).toBe("sold_out");
  });

  it("requires a signed-in customer to open an order", async () => {
    const h = harness();
    await seedScreening(h);

    const order = await h.call({ method: "POST", path: "/api/create-order", body: { holdId: SCREENING_ID } });
    expect(order.status).toBe(401);

    const wallet = await h.call({ path: "/api/bookings" });
    expect(wallet.status).toBe(401);
  });

  it("never returns another customer's tickets", async () => {
    const h = harness();
    await seedScreening(h);
    const buyer = await customerToken();
    const holdId = await holdSeats(h, buyer, 1);
    await h.call({ method: "POST", path: "/api/create-order", token: buyer, body: { holdId } });
    await h.call({
      method: "POST",
      path: "/api/verify-payment",
      token: buyer,
      body: {
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: signature(ORDER_ID, PAYMENT_ID),
      },
    });

    const other = await customerToken({ sub: "user_someone_else" });
    const wallet = await h.call({ path: "/api/bookings", token: other });
    expect(wallet.body).toHaveLength(0);
  });
});
