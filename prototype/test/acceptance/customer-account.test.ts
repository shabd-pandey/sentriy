import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { customerToken, jsonResponse, route, useAcceptanceHarness } from "./harness";

const RAZORPAY_ORDERS = "https://api.razorpay.com/v1/orders";
const SCREENING_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "order_reward_1";
const PAYMENT_ID = "pay_reward_1";
const KEY_SECRET = "acceptance_secret";

const razorpayRoute = route(RAZORPAY_ORDERS, () =>
  jsonResponse({ id: ORDER_ID, amount: 37500, currency: "INR" }, 200));

const signature = (orderId: string, paymentId: string) =>
  createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

describe("customer account, rewards and reward-aware checkout", () => {
  const harness = useAcceptanceHarness({ routes: [razorpayRoute] });

  async function seedScreening(h: ReturnType<typeof harness>) {
    await h.query(
      `INSERT INTO catalog_titles (id, title_type, title, watch_order, active)
       VALUES ('iron-man', 'film', 'Iron Man', 1, true)`,
    );
    await h.query(
      `INSERT INTO screenings (id, title_id, starts_at, ends_at, location, capacity, price_minor, sales_open_at, sales_close_at)
       VALUES ($1, 'iron-man', now() + interval '2 days', now() + interval '2 days 2 hours',
         'Arc Cinema · Hall 01', 10, 25000, now() - interval '1 day', now() + interval '2 days')`,
      [SCREENING_ID],
    );
  }

  async function seedCampaign(
    h: ReturnType<typeof harness>,
    options: { kind?: "discount" | "free-ticket"; discountPercent?: number } = {},
  ) {
    const { kind = "discount", discountPercent = 50 } = options;
    const [campaign] = await h.query<{ id: string }>(
      `INSERT INTO reward_campaigns
        (name, status, reward_kind, discount_percent, required_plays, completion_window_days,
         reward_expiry_days, reward_cap, instructions)
       VALUES ('Temporal Loom', 'active', $1, $2, 3, 7, 30, 10, 'Apply at checkout.')
       RETURNING id`,
      [kind, kind === "discount" ? discountPercent : null],
    );
    return campaign.id;
  }

  async function grantPaidTicket(h: ReturnType<typeof harness>) {
    await h.query(
      `INSERT INTO bookings (screening_id, user_id, quantity, amount_minor, status, order_code, qr_value)
       VALUES ($1, 'user_customer', 1, 25000, 'confirmed', 'MSY-PAID-TEST', 'marvelysyllabus://ticket/MSY-PAID-TEST')`,
      [SCREENING_ID],
    );
  }

  async function playRound(h: ReturnType<typeof harness>, token: string) {
    const start = await h.call({ method: "POST", path: "/api/rewards/rounds/start", token });
    expect(start.status).toBe(201);
    // The worker refuses rounds shorter than eight seconds. Move the clock
    // instead of sleeping in a test.
    await h.query(
      `UPDATE campaign_enrollments
       SET round_started_at = now() - interval '10 seconds',
         active_round_expires_at = now() + interval '4 minutes'
       WHERE user_id = 'user_customer'`,
    );
    return h.call({ method: "POST", path: "/api/rewards/rounds/complete", token });
  }

  it("reports database health without requiring a session", async () => {
    const h = harness();
    await seedScreening(h);
    const health = await h.call({ path: "/api/health" });
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      ok: true,
      database: true,
      catalogTitles: 1,
      upcomingScreenings: 1,
      authConfigured: true,
    });
  });

  it("keeps account settings on the server", async () => {
    const h = harness();
    const token = await customerToken();
    await h.query(
      `INSERT INTO site_settings (setting_key, setting_value)
       VALUES ('profile_qr_destination', 'https://marvelsyllabus.example/discover')`,
    );

    const initial = await h.call({ path: "/api/account", token });
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      displayName: "customer",
      shareWatched: false,
      qrDestination: "https://marvelsyllabus.example/discover",
    });

    const saved = await h.call({
      method: "PUT",
      path: "/api/account",
      token,
      body: { displayName: "Aarav Mehta", shareWatched: true, reminderNotifications: true },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      displayName: "Aarav Mehta",
      shareWatched: true,
      reminderNotifications: true,
      shareStreak: false,
    });

    const reread = await h.call({ path: "/api/account", token });
    expect(reread.body.displayName).toBe("Aarav Mehta");
    expect(reread.body.shareWatched).toBe(true);

    const anonymous = await h.call({ path: "/api/account" });
    expect(anonymous.status).toBe(401);
  });

  it("opens the Loom to everyone, even without a ticket", async () => {
    const h = harness();
    await seedScreening(h);
    await seedCampaign(h);
    const token = await customerToken();

    const state = await h.call({ path: "/api/rewards", token });
    expect(state.status).toBe(200);
    expect(state.body.campaign).toMatchObject({ eligible: true, completedPlays: 0, status: "active" });

    const start = await h.call({ method: "POST", path: "/api/rewards/rounds/start", token });
    expect(start.status).toBe(201);
  });

  it("records three rounds, grants the reward and discounts checkout", async () => {
    const h = harness();
    await seedScreening(h);
    await seedCampaign(h);
    await grantPaidTicket(h);
    const token = await customerToken();

    for (let round = 1; round <= 3; round += 1) {
      const completed = await playRound(h, token);
      expect(completed.status).toBe(200);
      expect(completed.body.campaign.completedPlays).toBe(round);
      if (round === 3) {
        expect(completed.body.campaign.reward.status).toBe("available");
        expect(completed.body.grants).toHaveLength(1);
      }
    }

    const claimed = await h.call({ method: "POST", path: "/api/rewards/claim", token });
    expect(claimed.status).toBe(200);
    expect(claimed.body.campaign.claimed).toBe(true);

    const rewardId = claimed.body.grants[0].id as string;
    const hold = await h.call({
      method: "POST",
      path: "/api/booking-holds",
      token,
      body: { screeningId: SCREENING_ID, quantity: 2, rewardId },
    });
    expect(hold.status).toBe(201);

    const order = await h.call({
      method: "POST",
      path: "/api/create-order",
      token,
      body: { holdId: hold.body.holdId },
    });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ order_id: ORDER_ID, amount: 37500 });

    const [booking] = await h.query<{ amountMinor: number; discountMinor: number }>(
      `SELECT amount_minor AS "amountMinor", discount_minor AS "discountMinor"
       FROM bookings WHERE user_id = 'user_customer' AND status = 'payment_pending'`,
    );
    // Two tickets at ₹250, discounting one of them by 50%: 50000 - 12500.
    expect(booking).toMatchObject({ amountMinor: 37500, discountMinor: 12500 });

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

    const state = await h.call({ path: "/api/rewards", token });
    expect(state.body.grants[0].status).toBe("redeemed");
  });

  it("confirms a fully discounted free ticket without a payment provider", async () => {
    const h = harness();
    await seedScreening(h);
    await seedCampaign(h, { kind: "free-ticket" });
    await grantPaidTicket(h);
    const token = await customerToken();

    await playRound(h, token);
    await playRound(h, token);
    await playRound(h, token);
    const state = await h.call({ path: "/api/rewards", token });
    const rewardId = state.body.grants[0].id as string;

    const hold = await h.call({
      method: "POST",
      path: "/api/booking-holds",
      token,
      body: { screeningId: SCREENING_ID, quantity: 1, rewardId },
    });
    expect(hold.status).toBe(201);

    const order = await h.call({
      method: "POST",
      path: "/api/create-order",
      token,
      body: { holdId: hold.body.holdId },
    });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ free: true, amount: 0, currency: "INR" });
    expect(h.fetchCalls).not.toContain(RAZORPAY_ORDERS);

    const wallet = await h.call({ path: "/api/bookings", token });
    expect(wallet.body).toHaveLength(2);
    const free = wallet.body.find((entry: { amountMinor: number }) => entry.amountMinor === 0);
    expect(free).toMatchObject({ status: "confirmed", ticketStatus: "valid" });

    const after = await h.call({ path: "/api/rewards", token });
    expect(after.body.grants[0].status).toBe("redeemed");
  });
});
