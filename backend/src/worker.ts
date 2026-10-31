import { neon } from "@neondatabase/serverless";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface Env {
  DATABASE_URL: string;
  OBJECT_STORAGE_ENDPOINT: string;
  OBJECT_STORAGE_REGION: string;
  OBJECT_STORAGE_BUCKET: string;
  OBJECT_STORAGE_ACCESS_KEY_ID: string;
  OBJECT_STORAGE_SECRET_ACCESS_KEY: string;
  CLERK_ISSUER: string;
  CLERK_JWKS_URL: string;
  CLERK_AUDIENCE?: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  /**
   * Comma-separated, case-insensitive Google-email allowlist. An allowlisted
   * verified email is granted the `admin` role, bootstrapping the owner without
   * manual Clerk metadata. Additive with the Clerk `role` claim: metadata roles
   * keep working, including when this is unset.
   */
  /**
   * Comma-separated origins allowed to call this API from another domain
   * (for example a Vercel frontend with the backend on a Worker). Same-origin
   * deployments do not need it.
   */
  CORS_ORIGINS?: string;
  OWNER_EMAILS?: string;
}

interface Claims {
  sub: string;
  iss: string;
  exp: number;
  nbf?: number;
  aud?: string | string[];
  role?: string;
  email?: string;
  name?: string;
}

type ClerkJwk = JsonWebKey & { kid?: string; kty?: string };

export interface PagesContext {
  request: Request;
  env: Env;
  params: Record<string, string>;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
};

type Role = "admin" | "staff" | "customer";

// Roles are resolved from server-side facts only: the allowlist configured on
// the deployment and the role claim of a signature-verified JWT. Nothing a
// client sends (body, headers, metadata) can grant admin or staff. An
// allowlisted verified email is additive with, and takes precedence over, the
// Clerk metadata role, so public sign-up stays customer-only.
function resolveRole(claims: Claims, env: Env): Role {
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const allowlisted = (env.OWNER_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (email && allowlisted.includes(email)) return "admin";
  return claims.role === "admin" || claims.role === "staff" ? claims.role : "customer";
}

async function authenticatedUser(request: Request, env: Env, admin = false): Promise<Claims> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token || !env.CLERK_ISSUER || !env.CLERK_JWKS_URL) throw new Error("unauthorized");

  const [encodedHeader, encodedClaims, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedClaims || !encodedSignature) throw new Error("unauthorized");
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader))) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("unauthorized");

  const jwks = await fetch(env.CLERK_JWKS_URL, { headers: { accept: "application/json" } });
  if (!jwks.ok) throw new Error("auth_unavailable");
  const keys = (await jwks.json() as { keys?: ClerkJwk[] }).keys ?? [];
  const jwk = keys.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!jwk) throw new Error("unauthorized");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(encodedSignature),
    signed,
  );
  const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedClaims))) as Claims;
  const now = Math.floor(Date.now() / 1000);
  const audienceValid = !env.CLERK_AUDIENCE || (
    Array.isArray(claims.aud) ? claims.aud.includes(env.CLERK_AUDIENCE) : claims.aud === env.CLERK_AUDIENCE
  );
  if (
    !valid || claims.iss !== env.CLERK_ISSUER || !claims.sub ||
    typeof claims.exp !== "number" || claims.exp <= now ||
    (claims.nbf !== undefined && claims.nbf > now) || !audienceValid
  ) throw new Error("unauthorized");
  const role = resolveRole(claims, env);
  if (admin && role !== "admin") throw new Error("forbidden");
  return { ...claims, role };
}

async function requireStaff(request: Request, env: Env): Promise<Claims> {
  const claims = await authenticatedUser(request, env);
  if (claims.role !== "admin" && claims.role !== "staff") throw new Error("forbidden");
  return claims;
}

// Door scanners send either the raw order code ("MSY-XXXX-XXXX") or the
// full QR payload ("marvelsyllabus://ticket/MSY-XXXX-XXXX"). Normalizing
// server-side keeps the customer app, the admin, and the Flutter door app
// on one ticket contract.
const normalizeTicketCode = (raw: unknown) => {
  const text = requiredText(raw, "code", 256).toUpperCase();
  const match = text.match(/MSY-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  if (!match) throw new Error("invalid_code");
  return match[0];
};

const makeOrderCode = () => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const group = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `MSY-${group()}-${group()}`;
};

const parseBody = async <T>(request: Request): Promise<T> => request.json() as Promise<T>;
const requiredText = (value: unknown, name: string, max = 500) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`invalid_${name}`);
  return value.trim();
};

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
};

async function razorpaySignature(orderId: string, paymentId: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${orderId}|${paymentId}`)));
}
const objectStorage = (env: Env) => new S3Client({
  endpoint: env.OBJECT_STORAGE_ENDPOINT,
  region: env.OBJECT_STORAGE_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  },
});
const positiveInteger = (value: unknown, name: string) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`invalid_${name}`);
  return number;
};
const titlePath = (url: URL) => decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
const uuidParameter = (value: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("invalid_id");
  return value;
};
const dateOrNull = (value: unknown, name: string) => {
  if (value == null || value === "") return null;
  return Date.parse(`${value}`) ? `${value}` : (() => { throw new Error(`invalid_${name}`); })();
};
const artworkKey = (value: unknown) => {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^artwork\/[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(value)) throw new Error("invalid_image_key");
  return value;
};
type Db = ReturnType<typeof neon<false, false>>;
const recordActivity = async (db: Db, meta: {
  actor: string;
  category: "catalog" | "screening" | "artwork" | "settings" | "banner" | "reward" | "booking" | "ticket" | "system";
  summary: string;
  screeningId?: string | null;
  bannerId?: string | null;
  campaignId?: string | null;
  orderRef?: string | null;
}) => {
  await db`
    INSERT INTO admin_activity (actor_sub, category, summary, screening_id, banner_id, campaign_id, order_ref)
    VALUES (${meta.actor}, ${meta.category}, ${meta.summary},
      ${meta.screeningId ?? null}, ${meta.bannerId ?? null}, ${meta.campaignId ?? null}, ${meta.orderRef ?? null})
  `;
};
const profileQrDestination = (value: unknown) => {
  const destination = requiredText(value, "qr_destination", 2048);
  const parsed = new URL(destination);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("invalid_qr_destination");
  return parsed.toString();
};

// ---- Customer account, rewards and notifications -------------------------
// The customer app renders one snapshot. These helpers build the parts that
// belong to the signed-in account (not the public catalog) from the same
// reward_campaigns / reward_grants tables the Command Deck administers, so the
// prototype and production never disagree about a reward again.

type CustomerReward = {
  id: string;
  kind: "coupon" | "discount" | "free-ticket";
  title: string;
  description: string;
  status: "reserved" | "available" | "redeemed";
  expiresAt: string;
  instructions: string;
  code?: string;
  discountPercent?: 30 | 50;
};

const customerDisplayName = (claims: Claims) => {
  const name = typeof claims.name === "string" ? claims.name.trim() : "";
  if (name) return name.slice(0, 80);
  const email = typeof claims.email === "string" ? claims.email.split("@")[0]?.trim() : "";
  return (email || "Member").slice(0, 80);
};

const rewardTitle = (campaign: { rewardKind: string; discountPercent: number | null }) =>
  campaign.rewardKind === "discount"
    ? `${campaign.discountPercent}% off one ticket`
    : campaign.rewardKind === "free-ticket"
      ? "A free ticket"
      : "Partner reward";

const mapGrant = (row: any): CustomerReward => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  description: row.detail || "A reward earned through the MarvelSyllabus campaign.",
  status: row.status === "redeemed" ? "redeemed" : "available",
  expiresAt: row.expiresAt ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
  instructions: row.instructions || "Apply this reward at checkout.",
  ...(row.code ? { code: row.code } : {}),
  ...(row.discountPercent ? { discountPercent: row.discountPercent } : {}),
});

async function loadCustomerGrants(db: Db, userId: string) {
  const rows = await db`
    SELECT g.id, g.enrollment_id AS "enrollmentId", g.kind, g.title, g.detail, g.status,
      g.expires_at AS "expiresAt", k.code, c.discount_percent AS "discountPercent",
      c.instructions
    FROM reward_grants g
    LEFT JOIN reward_campaign_codes k ON k.id = g.code_id
    LEFT JOIN reward_campaigns c ON c.id = g.campaign_id
    WHERE g.user_id = ${userId} AND g.status IN ('available', 'redeemed')
    ORDER BY g.created_at DESC
  `;
  return rows;
}

async function loadRewardsState(db: Db, userId: string) {
  const [eligibility] = await db`
    SELECT EXISTS(
      SELECT 1 FROM bookings WHERE user_id = ${userId} AND status = 'confirmed'
    ) AS eligible
  `;
  const eligible = Boolean(eligibility?.eligible);

  await db`
    UPDATE reward_grants SET status = 'expired'
    WHERE user_id = ${userId} AND status = 'available'
      AND expires_at IS NOT NULL AND expires_at <= now()
  `;
  const grantRows = await loadCustomerGrants(db, userId);

  const [campaign] = await db`
    SELECT id, name, reward_kind AS "rewardKind", discount_percent AS "discountPercent",
      required_plays AS "requiredPlays", completion_window_days AS "completionWindowDays",
      reward_expiry_days AS "rewardExpiryDays", reward_cap AS "rewardCap", instructions
    FROM reward_campaigns WHERE status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `;

  if (!campaign) {
    return {
      campaign: {
        id: "",
        name: "Temporal Loom",
        completedPlays: 0,
        requiredPlays: 3,
        completionWindowDays: 7,
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        status: "paused",
        eligible: false,
        claimed: false,
        reward: {
          id: "reward-no-campaign",
          kind: "discount",
          title: "No reward campaign is running",
          description: "Rewards open when the operator starts the next campaign.",
          status: "reserved",
          expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          instructions: "",
        } satisfies CustomerReward,
      },
      grants: grantRows.map(mapGrant),
    };
  }

  let [enrollment] = await db`
    SELECT id, completed_plays AS "completedPlays", status,
      reservation_expires_at AS "reservationExpiresAt", created_at AS "createdAt"
    FROM campaign_enrollments
    WHERE campaign_id = ${campaign.id} AND user_id = ${userId}
  `;

  if (eligible) {
    if (!enrollment) {
      await db`
        INSERT INTO campaign_enrollments (campaign_id, user_id)
        VALUES (${campaign.id}, ${userId})
        ON CONFLICT (campaign_id, user_id) DO NOTHING
      `;
      [enrollment] = await db`
        SELECT id, completed_plays AS "completedPlays", status,
          reservation_expires_at AS "reservationExpiresAt", created_at AS "createdAt"
        FROM campaign_enrollments
        WHERE campaign_id = ${campaign.id} AND user_id = ${userId}
      `;
    }
    // A campaign window that lapsed restarts the quest rather than stranding
    // the account on a dead enrollment.
    if (enrollment && enrollment.status === "expired") {
      [enrollment] = await db`
        UPDATE campaign_enrollments
        SET status = 'enrolled', completed_plays = 0, created_at = now(),
          round_started_at = NULL, active_round_expires_at = NULL
        WHERE id = ${enrollment.id}
        RETURNING id, completed_plays AS "completedPlays", status,
          reservation_expires_at AS "reservationExpiresAt", created_at AS "createdAt"
      `;
    }
  }

  const windowMs = Number(campaign.completionWindowDays) * 86_400_000;
  const completedPlays = Number(enrollment?.completedPlays ?? 0);
  const requiredPlays = Number(campaign.requiredPlays);
  const grant = enrollment
    ? grantRows.find((row) => row.enrollmentId === enrollment.id)
    : undefined;
  const reward: CustomerReward = grant
    ? mapGrant(grant)
    : {
        id: `campaign-${campaign.id}`,
        kind: campaign.rewardKind,
        title: rewardTitle(campaign as { rewardKind: string; discountPercent: number | null }),
        description: campaign.instructions || "Complete the campaign rounds to unlock this reward.",
        status: completedPlays >= requiredPlays ? "available" : "reserved",
        expiresAt: enrollment?.reservationExpiresAt ?? new Date(Date.now() + windowMs).toISOString(),
        instructions: campaign.instructions || "Apply this reward at checkout.",
        ...(campaign.discountPercent ? { discountPercent: campaign.discountPercent } : {}),
      };

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      completedPlays,
      requiredPlays,
      completionWindowDays: Number(campaign.completionWindowDays),
      expiresAt: enrollment?.reservationExpiresAt ?? new Date(Date.now() + windowMs).toISOString(),
      status: enrollment && ["granted", "claimed"].includes(enrollment.status)
        ? "complete"
        : "active",
      eligible,
      claimed: enrollment?.status === "claimed",
      reward,
    },
    grants: grantRows.map(mapGrant),
  };
}

async function grantCampaignReward(db: Db, userId: string, enrollmentId: string, campaign: any) {
  const [existing] = await db`SELECT id FROM reward_grants WHERE enrollment_id = ${enrollmentId} LIMIT 1`;
  if (existing) {
    await db`
      UPDATE campaign_enrollments
      SET status = 'granted', reservation_expires_at = COALESCE(reservation_expires_at, now() + ${Number(campaign.rewardExpiryDays)} * interval '1 day')
      WHERE id = ${enrollmentId}
    `;
    return;
  }
  const [{ granted = 0 }] = await db`
    SELECT count(*)::integer AS granted FROM reward_grants WHERE campaign_id = ${campaign.id}
  `;
  if (Number(granted) >= Number(campaign.rewardCap)) return;

  let codeId: string | null = null;
  if (campaign.rewardKind === "coupon") {
    const [code] = await db`
      SELECT id FROM reward_campaign_codes
      WHERE campaign_id = ${campaign.id} AND status = 'available'
      ORDER BY created_at LIMIT 1
      FOR UPDATE
    `;
    if (code) {
      codeId = code.id;
      await db`
        UPDATE reward_campaign_codes SET status = 'reserved', granted_to = ${userId}
        WHERE id = ${code.id}
      `;
    }
  }

  const [grant] = await db`
    INSERT INTO reward_grants (campaign_id, enrollment_id, user_id, kind, title, detail, status, expires_at, code_id)
    VALUES (${campaign.id}, ${enrollmentId}, ${userId}, ${campaign.rewardKind},
      ${rewardTitle(campaign)}, ${campaign.instructions || ""}, 'available',
      now() + ${Number(campaign.rewardExpiryDays)} * interval '1 day', ${codeId})
    RETURNING id
  `;
  await db`
    UPDATE campaign_enrollments
    SET status = 'granted', reservation_expires_at = now() + ${Number(campaign.rewardExpiryDays)} * interval '1 day',
      code_id = ${codeId}
    WHERE id = ${enrollmentId}
  `;
  return grant?.id;
}

async function route({ request, env }: PagesContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const db = neon(env.DATABASE_URL);

  // Public deployment diagnostics. The customer app can prove the API and the
  // database are reachable without exposing a single secret.
  if (request.method === "GET" && path === "/api/health") {
    try {
      const [row] = await db`
        SELECT
          (SELECT count(*)::integer FROM catalog_titles) AS titles,
          (SELECT count(*)::integer FROM screenings WHERE starts_at > now()) AS screenings
      `;
      return json({
        ok: true,
        database: true,
        catalogTitles: row.titles,
        upcomingScreenings: row.screenings,
        authConfigured: Boolean(env.CLERK_ISSUER && env.CLERK_JWKS_URL),
        storageConfigured: Boolean(env.OBJECT_STORAGE_ENDPOINT && env.OBJECT_STORAGE_BUCKET),
        paymentsConfigured: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Health check failed", error);
      return json({ ok: false, database: false, error: "database_unreachable" }, 503);
    }
  }

  // Browser-safe configuration: the Razorpay key id is public by design, the
  // secret never leaves the server.
  if (request.method === "GET" && path === "/api/config") {
    return json({
      razorpayKeyId: env.RAZORPAY_KEY_ID ?? null,
      authConfigured: Boolean(env.CLERK_ISSUER && env.CLERK_JWKS_URL),
    });
  }

  if (request.method === "GET" && path === "/api/account") {
    const user = await authenticatedUser(request, env);
    const [profile] = await db`
      SELECT display_name AS "displayName", share_watched AS "shareWatched",
        share_streak AS "shareStreak", product_updates AS "productUpdates",
        reminder_notifications AS "reminderNotifications"
      FROM customer_profiles WHERE user_id = ${user.sub}
    `;
    const [setting] = await db`
      SELECT setting_value AS "qrDestination" FROM site_settings WHERE setting_key = 'profile_qr_destination'
    `;
    return json({
      displayName: profile?.displayName ?? customerDisplayName(user),
      shareWatched: profile?.shareWatched ?? false,
      shareStreak: profile?.shareStreak ?? false,
      productUpdates: profile?.productUpdates ?? false,
      reminderNotifications: profile?.reminderNotifications ?? false,
      qrDestination: setting?.qrDestination ?? null,
    });
  }

  if (request.method === "PUT" && path === "/api/account") {
    const user = await authenticatedUser(request, env);
    const body = await parseBody<{
      displayName?: string; shareWatched?: boolean; shareStreak?: boolean;
      productUpdates?: boolean; reminderNotifications?: boolean;
    }>(request);
    const optionalBoolean = (value: unknown) => value === undefined
      ? null
      : typeof value === "boolean"
        ? value
        : (() => { throw new Error("invalid_account_setting"); })();
    const displayName = body.displayName === undefined ? null : requiredText(body.displayName, "display_name", 80);
    const shareWatched = optionalBoolean(body.shareWatched);
    const shareStreak = optionalBoolean(body.shareStreak);
    const productUpdates = optionalBoolean(body.productUpdates);
    const reminderNotifications = optionalBoolean(body.reminderNotifications);
    await db`
      INSERT INTO customer_profiles (user_id, display_name, share_watched, share_streak,
        product_updates, reminder_notifications)
      VALUES (${user.sub}, ${displayName ?? customerDisplayName(user)},
        ${shareWatched ?? false}, ${shareStreak ?? false},
        ${productUpdates ?? false}, ${reminderNotifications ?? false})
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = COALESCE(${displayName}, customer_profiles.display_name),
        share_watched = COALESCE(${shareWatched}, customer_profiles.share_watched),
        share_streak = COALESCE(${shareStreak}, customer_profiles.share_streak),
        product_updates = COALESCE(${productUpdates}, customer_profiles.product_updates),
        reminder_notifications = COALESCE(${reminderNotifications}, customer_profiles.reminder_notifications),
        updated_at = now()
    `;
    const [profile] = await db`
      SELECT display_name AS "displayName", share_watched AS "shareWatched",
        share_streak AS "shareStreak", product_updates AS "productUpdates",
        reminder_notifications AS "reminderNotifications"
      FROM customer_profiles WHERE user_id = ${user.sub}
    `;
    const [setting] = await db`
      SELECT setting_value AS "qrDestination" FROM site_settings WHERE setting_key = 'profile_qr_destination'
    `;
    return json({ ...profile, qrDestination: setting?.qrDestination ?? null });
  }

  if (request.method === "GET" && path === "/api/rewards") {
    const user = await authenticatedUser(request, env);
    return json(await loadRewardsState(db, user.sub));
  }

  if (request.method === "POST" && path === "/api/rewards/rounds/start") {
    const user = await authenticatedUser(request, env);
    const state = await loadRewardsState(db, user.sub);
    if (!state.campaign.id) return json({ error: "no_reward_campaign" }, 404);
    if (!state.campaign.eligible) return json({ error: "rewards_locked" }, 403);
    if (state.campaign.completedPlays >= state.campaign.requiredPlays) return json({ error: "campaign_complete" }, 409);
    const [enrollment] = await db`
      SELECT id FROM campaign_enrollments
      WHERE campaign_id = ${state.campaign.id} AND user_id = ${user.sub} AND status = 'enrolled'
    `;
    if (!enrollment) return json({ error: "campaign_not_enrolled" }, 409);
    await db`
      UPDATE campaign_enrollments
      SET round_started_at = now(), active_round_expires_at = now() + interval '5 minutes'
      WHERE id = ${enrollment.id}
    `;
    return json({ startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() }, 201);
  }

  if (request.method === "POST" && path === "/api/rewards/rounds/complete") {
    const user = await authenticatedUser(request, env);
    const state = await loadRewardsState(db, user.sub);
    if (!state.campaign.id) return json({ error: "no_reward_campaign" }, 404);
    const [enrollment] = await db`
      SELECT e.id, e.completed_plays AS "completedPlays", c.id AS "campaignId",
        c.reward_kind AS "rewardKind", c.discount_percent AS "discountPercent",
        c.required_plays AS "requiredPlays", c.reward_expiry_days AS "rewardExpiryDays",
        c.reward_cap AS "rewardCap", c.instructions
      FROM campaign_enrollments e
      JOIN reward_campaigns c ON c.id = e.campaign_id
      WHERE e.campaign_id = ${state.campaign.id} AND e.user_id = ${user.sub}
        AND e.status = 'enrolled'
        AND e.round_started_at IS NOT NULL
        AND e.active_round_expires_at > now()
        AND e.round_started_at <= now() - interval '8 seconds'
      FOR UPDATE OF e
    `;
    if (!enrollment) return json({ error: "round_not_ready" }, 409);
    const completedPlays = Number(enrollment.completedPlays) + 1;
    await db`
      UPDATE campaign_enrollments
      SET completed_plays = ${completedPlays}, round_started_at = NULL,
        active_round_expires_at = NULL
      WHERE id = ${enrollment.id}
    `;
    if (completedPlays >= Number(enrollment.requiredPlays)) {
      await grantCampaignReward(db, user.sub, enrollment.id, { ...enrollment, id: enrollment.campaignId });
    }
    return json(await loadRewardsState(db, user.sub));
  }

  if (request.method === "POST" && path === "/api/rewards/claim") {
    const user = await authenticatedUser(request, env);
    const [grant] = await db`
      SELECT id, enrollment_id AS "enrollmentId" FROM reward_grants
      WHERE user_id = ${user.sub} AND status = 'available'
      ORDER BY created_at DESC LIMIT 1
    `;
    if (!grant) return json({ error: "no_reward_to_claim" }, 404);
    await db`UPDATE campaign_enrollments SET status = 'claimed' WHERE id = ${grant.enrollmentId}`;
    return json(await loadRewardsState(db, user.sub));
  }

  if (request.method === "GET" && path === "/api/profile-qr") {
    const [setting] = await db`SELECT setting_value AS "qrDestination" FROM site_settings WHERE setting_key = 'profile_qr_destination'`;
    return json({ qrDestination: setting?.qrDestination ?? null });
  }

  if (request.method === "PUT" && path === "/api/admin/profile-qr") {
    const admin = await authenticatedUser(request, env, true);
    const body = await parseBody<{ qrDestination: string }>(request);
    const destination = profileQrDestination(body.qrDestination);
    await db`
      INSERT INTO site_settings (setting_key, setting_value, updated_at)
      VALUES ('profile_qr_destination', ${destination}, now())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()
    `;
    await recordActivity(db, { actor: admin.sub, category: "settings", summary: `Changed the shared profile-card QR destination to ${destination}` });
    return json({ qrDestination: destination });
  }

  if (request.method === "GET" && path === "/api/catalog") {
    const rows = await db`
      SELECT id, title_type AS "titleType", title, synopsis, release_year AS "releaseYear",
        poster_key AS "posterKey",
        active, watch_order AS "watchOrder",
        COALESCE((
          SELECT json_agg(json_build_object('seasonNumber', ss.season_number, 'episodeCount', ss.episode_count) ORDER BY ss.season_number)
          FROM series_seasons ss WHERE ss.title_id = catalog_titles.id
        ), '[]'::json) AS seasons
      FROM catalog_titles ORDER BY watch_order, title
    `;
    const storage = objectStorage(env);
    return json(await Promise.all(rows.map(async (row) => ({
      ...row,
      posterUrl: row.posterKey ? await getSignedUrl(storage, new GetObjectCommand({
        Bucket: env.OBJECT_STORAGE_BUCKET,
        Key: row.posterKey,
      }), { expiresIn: 3600 }) : null,
    }))));
  }

  if (request.method === "GET" && path === "/api/screenings") {
    const rows = await db`
      SELECT id, title_id AS "titleId", title, title_type AS "titleType", title_active AS "titleActive",
        starts_at AS "startsAt", ends_at AS "endsAt", location, capacity, price_minor AS "priceMinor",
        sales_open_at AS "salesOpenAt", sales_close_at AS "salesCloseAt", cancelled,
        season_number AS "seasonNumber", episode_start AS "episodeStart", episode_end AS "episodeEnd",
        sold_count AS "soldCount", held_count AS "heldCount"
      FROM customer_screenings ORDER BY starts_at, id
    `;
    return json(rows);
  }

  if (request.method === "GET" && path === "/api/progress") {
    const user = await authenticatedUser(request, env);
    const rows = await db`
      SELECT title_id AS "titleId", season_number AS "seasonNumber",
        episode_number AS "episodeNumber", watched_at AS "watchedAt"
      FROM watch_progress WHERE user_id = ${user.sub}
      ORDER BY title_id, season_number NULLS FIRST, episode_number NULLS FIRST
    `;
    return json(rows);
  }

  if (request.method === "PUT" && path === "/api/progress") {
    const user = await authenticatedUser(request, env);
    const body = await parseBody<{ titleId: string; seasonNumber?: number | null; episodeNumber?: number | null; watched: boolean }>(request);
    const id = requiredText(body.titleId, "title_id", 160);
    const [title] = await db`SELECT title_type FROM catalog_titles WHERE id = ${id}`;
    if (!title) return json({ error: "not_found" }, 404);
    let season: number | null = null;
    let episode: number | null = null;
    if (title.title_type === "series") {
      season = positiveInteger(body.seasonNumber, "season");
      episode = positiveInteger(body.episodeNumber, "episode");
      const [range] = await db`SELECT episode_count FROM series_seasons WHERE title_id = ${id} AND season_number = ${season}`;
      if (!range || episode > range.episode_count) return json({ error: "episode_out_of_range" }, 400);
    } else if (body.seasonNumber != null || body.episodeNumber != null) {
      return json({ error: "film_progress_has_no_episode_range" }, 400);
    }
    if (body.watched) {
      await db`
        INSERT INTO watch_progress (user_id, title_id, season_number, episode_number)
        VALUES (${user.sub}, ${id}, ${season}, ${episode})
        ON CONFLICT (user_id, title_id, season_number, episode_number)
        DO UPDATE SET watched_at = now()
      `;
    } else {
      await db`
        DELETE FROM watch_progress WHERE user_id = ${user.sub} AND title_id = ${id}
          AND season_number IS NOT DISTINCT FROM ${season} AND episode_number IS NOT DISTINCT FROM ${episode}
      `;
    }
    return json({ ok: true });
  }

  if (request.method === "POST" && path === "/api/admin/catalog/import") {
    const admin = await authenticatedUser(request, env, true);
    const body = await parseBody<{ entries: Array<{ id: string; title: string; titleType: string; synopsis?: string; releaseYear?: number; watchOrder: number }> }>(request);
    if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > 1000) {
      return json({ error: "invalid_entries" }, 400);
    }
    for (const item of body.entries) {
      const id = requiredText(item.id, "id", 160);
      const title = requiredText(item.title, "title");
      if (!["film", "series"].includes(item.titleType)) throw new Error("invalid_title_type");
      const watchOrder = Number(item.watchOrder);
      if (!Number.isInteger(watchOrder) || watchOrder < 1) throw new Error("invalid_watch_order");
      const year = item.releaseYear == null ? null : positiveInteger(item.releaseYear, "release_year");
      await db`
        INSERT INTO catalog_titles (id, title_type, title, synopsis, release_year, active, watch_order)
        VALUES (${id}, ${item.titleType}, ${title}, ${item.synopsis ?? ""}, ${year}, false, ${watchOrder})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    await recordActivity(db, { actor: admin.sub, category: "catalog", summary: `Imported ${body.entries.length} catalog titles` });
    return json({ imported: body.entries.length });
  }

  if (request.method === "POST" && path === "/api/admin/catalog") {
    const admin = await authenticatedUser(request, env, true);
    const body = await parseBody<{ id?: string; title: string; titleType: "film" | "series"; synopsis?: string; releaseYear?: number | null; watchOrder?: number }>(request);
    const id = body.id ? requiredText(body.id, "id", 160) : crypto.randomUUID();
    const title = requiredText(body.title, "title");
    if (!["film", "series"].includes(body.titleType)) return json({ error: "invalid_title_type" }, 400);
    const [max] = await db`SELECT COALESCE(max(watch_order), 0) AS value FROM catalog_titles`;
    const order = body.watchOrder == null ? Number(max.value) + 1 : positiveInteger(body.watchOrder, "watch_order");
    const [entry] = await db`
      INSERT INTO catalog_titles (id, title_type, title, synopsis, release_year, watch_order, active)
      VALUES (${id}, ${body.titleType}, ${title}, ${body.synopsis ?? ""}, ${body.releaseYear ?? null}, ${order}, false)
      RETURNING id
    `;
    await recordActivity(db, { actor: admin.sub, category: "catalog", summary: `Created catalog title "${title}" (${body.titleType})` });
    return json({ id: entry.id }, 201);
  }

  if (request.method === "PUT" && path.startsWith("/api/admin/catalog/order")) {
    const admin = await authenticatedUser(request, env, true);
    const body = await parseBody<{ ids: string[] }>(request);
    if (!Array.isArray(body.ids) || new Set(body.ids).size !== body.ids.length) return json({ error: "invalid_order" }, 400);
    for (const [index, id] of body.ids.entries()) {
      await db`UPDATE catalog_titles SET watch_order = ${index + 1}, updated_at = now() WHERE id = ${id}`;
    }
    await recordActivity(db, { actor: admin.sub, category: "catalog", summary: `Reordered the catalog (${body.ids.length} titles)` });
    return json({ ok: true });
  }

  if (request.method === "PUT" && path.startsWith("/api/admin/catalog/")) {
    const admin = await authenticatedUser(request, env, true);
    const id = titlePath(url);
    const body = await parseBody<{ title: string; titleType?: "film" | "series"; synopsis: string; releaseYear: number | null; posterKey: string | null; active: boolean; watchOrder: number }>(request);
    if (body.posterKey !== null && !/^artwork\/[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(body.posterKey)) {
      return json({ error: "invalid_poster_key" }, 400);
    }
    const [entry] = await db`
      UPDATE catalog_titles SET title = ${requiredText(body.title, "title")},
        synopsis = ${typeof body.synopsis === "string" ? body.synopsis.slice(0, 10000) : ""},
        release_year = ${body.releaseYear ?? null}, poster_key = ${body.posterKey},
        active = ${body.active === true}, watch_order = ${positiveInteger(body.watchOrder, "watch_order")},
        updated_at = now()
      WHERE id = ${id} RETURNING id
    `;
    if (entry) {
      await recordActivity(db, { actor: admin.sub, category: "catalog", summary: `Updated catalog title — ${body.active ? "active" : "upcoming"} for booking` });
      return json({ ok: true });
    }
    return json({ error: "not_found" }, 404);
  }

  if (request.method === "DELETE" && path.startsWith("/api/admin/catalog/")) {
    const admin = await authenticatedUser(request, env, true);
    const id = titlePath(url);
    const [usage] = await db`
      SELECT (SELECT count(*)::integer FROM screenings WHERE title_id = ${id}) AS screenings,
        (SELECT count(*)::integer FROM series_seasons WHERE title_id = ${id}) AS seasons
    `;
    if (usage && usage.screenings > 0) return json({ error: "title_has_screenings" }, 409);
    const [removed] = await db`DELETE FROM catalog_titles WHERE id = ${id} RETURNING title`;
    if (!removed) return json({ error: "not_found" }, 404);
    await recordActivity(db, { actor: admin.sub, category: "catalog", summary: `Deleted catalog title "${removed.title}"` });
    return json({ ok: true });
  }

  if (request.method === "POST" && path === "/api/admin/artwork") {
    const admin = await authenticatedUser(request, env, true);
    const form = await request.formData();
    const file = form.get("file");
    if (form.get("rightsCleared") !== "true") return json({ error: "rights_confirmation_required" }, 400);
    if (!(file instanceof File) || file.size > 8 * 1024 * 1024) return json({ error: "invalid_file_size" }, 400);
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[file.type];
    if (!extension) return json({ error: "unsupported_image_type" }, 415);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isJpeg = extension === "jpg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = extension === "png" && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isWebp = extension === "webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!isJpeg && !isPng && !isWebp) return json({ error: "invalid_image_content" }, 415);
    const key = `artwork/${crypto.randomUUID()}.${extension}`;
    await objectStorage(env).send(new PutObjectCommand({
      Bucket: env.OBJECT_STORAGE_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: file.type,
      Metadata: { "rights-cleared": "true" },
      CacheControl: "public, max-age=31536000, immutable",
    }));
    await recordActivity(db, { actor: admin.sub, category: "artwork", summary: `Uploaded rights-cleared artwork (${extension})` });
    return json({ key });
  }

  if (request.method === "GET" && path.startsWith("/api/admin/series/") && path.endsWith("/seasons")) {
    await authenticatedUser(request, env, true);
    const id = decodeURIComponent(path.split("/").at(-2) ?? "");
    const rows = await db`
      SELECT season_number AS "seasonNumber", episode_count AS "episodeCount"
      FROM series_seasons WHERE title_id = ${id} ORDER BY season_number
    `;
    return json(rows);
  }

  if (request.method === "PUT" && path.startsWith("/api/admin/series/") && path.endsWith("/seasons")) {
    const admin = await authenticatedUser(request, env, true);
    const id = decodeURIComponent(path.split("/").at(-2) ?? "");
    const [title] = await db`SELECT title_type FROM catalog_titles WHERE id = ${id}`;
    if (!title || title.title_type !== "series") return json({ error: "series_not_found" }, 404);
    const body = await parseBody<{ seasons: Array<{ seasonNumber: number; episodeCount: number }> }>(request);
    if (!Array.isArray(body.seasons) || body.seasons.length > 100) return json({ error: "invalid_seasons" }, 400);
    const normalized = body.seasons.map((season) => ({
      seasonNumber: positiveInteger(season.seasonNumber, "season"),
      episodeCount: positiveInteger(season.episodeCount, "episode_count"),
    }));
    if (new Set(normalized.map((season) => season.seasonNumber)).size !== normalized.length) {
      return json({ error: "duplicate_season" }, 400);
    }
    for (const season of normalized) {
      await db`
        INSERT INTO series_seasons (title_id, season_number, episode_count)
        VALUES (${id}, ${season.seasonNumber}, ${season.episodeCount})
        ON CONFLICT (title_id, season_number)
        DO UPDATE SET episode_count = EXCLUDED.episode_count
      `;
    }
    const retained = normalized.map((season) => season.seasonNumber);
    if (retained.length) {
      await db`DELETE FROM series_seasons WHERE title_id = ${id} AND NOT (season_number = ANY(${retained}::integer[]))`;
    } else {
      await db`DELETE FROM series_seasons WHERE title_id = ${id}`;
    }
    await recordActivity(db, { actor: admin.sub, category: "catalog", summary: `Saved ${normalized.length} season episode counts for series ${id}` });
    return json({ ok: true });
  }

  if (request.method === "POST" && path === "/api/admin/screenings") {
    const admin = await authenticatedUser(request, env, true);
    const body = await parseBody<{
      titleId: string; startsAt: string; endsAt: string; location: string; capacity: number;
      priceMinor: number; salesOpenAt?: string | null; salesCloseAt?: string | null;
      seasonNumber?: number | null; episodeStart?: number | null; episodeEnd?: number | null;
    }>(request);
    const id = requiredText(body.titleId, "title_id");
    const [title] = await db`SELECT title_type FROM catalog_titles WHERE id = ${id}`;
    if (!title) return json({ error: "title_not_found" }, 404);
    const season = body.seasonNumber == null ? null : positiveInteger(body.seasonNumber, "season");
    const first = body.episodeStart == null ? null : positiveInteger(body.episodeStart, "episode_start");
    const last = body.episodeEnd == null ? null : positiveInteger(body.episodeEnd, "episode_end");
    if (title.title_type === "film" && (season || first || last)) return json({ error: "films_have_no_episode_range" }, 400);
    if (title.title_type === "series" && (!season || !first || !last || last < first)) return json({ error: "series_requires_one_season_range" }, 400);
    if (!Number.isFinite(Date.parse(body.startsAt)) || !Number.isFinite(Date.parse(body.endsAt)) || Date.parse(body.endsAt) <= Date.parse(body.startsAt)) {
      return json({ error: "invalid_schedule" }, 400);
    }
    const [screening] = await db`
      INSERT INTO screenings (title_id, starts_at, ends_at, location, capacity, price_minor,
        sales_open_at, sales_close_at, season_number, episode_start, episode_end)
      VALUES (${id}, ${body.startsAt}, ${body.endsAt}, ${requiredText(body.location, "location")},
        ${positiveInteger(body.capacity, "capacity")}, ${Number.isInteger(body.priceMinor) && body.priceMinor >= 0 ? body.priceMinor : (() => { throw new Error("invalid_price"); })()},
        ${body.salesOpenAt ?? null}, ${body.salesCloseAt ?? null}, ${season}, ${first}, ${last})
      RETURNING id
    `;
    await recordActivity(db, { actor: admin.sub, category: "screening", summary: `Scheduled a screening of "${title.title}"`, screeningId: screening.id });
    return json({ id: screening.id }, 201);
  }

  if (request.method === "PUT" && path.startsWith("/api/admin/screenings/")) {
    const admin = await authenticatedUser(request, env, true);
    const screeningId = uuidParameter(titlePath(url));
    const body = await parseBody<{
      cancelled?: boolean; location?: string; startsAt?: string; endsAt?: string;
      capacity?: number; priceMinor?: number; salesOpenAt?: string | null;
      salesCloseAt?: string | null;
    }>(request);
    const [current] = await db`SELECT id, title_id AS "titleId" FROM screenings WHERE id = ${screeningId}`;
    if (!current) return json({ error: "not_found" }, 404);
    const patchKeys = Object.keys(body ?? {});
    if (patchKeys.length === 1 && typeof body.cancelled === "boolean") {
      const [screening] = await db`
        UPDATE screenings SET cancelled = ${body.cancelled === true}, updated_at = now()
        WHERE id = ${screeningId} RETURNING id, cancelled
      `;
      await recordActivity(db, {
        actor: admin.sub,
        category: "screening",
        summary: screening.cancelled ? `Cancelled screening ${screeningId}` : `Reopened cancelled screening ${screeningId}`,
        screeningId,
      });
      return json({ ok: true, cancelled: screening.cancelled });
    }
    const location = body.location == null ? undefined : requiredText(body.location, "location");
    const startsAt = body.startsAt == null ? undefined : new Date(body.startsAt).toISOString();
    const endsAt = body.endsAt == null ? undefined : new Date(body.endsAt).toISOString();
    if (startsAt && Number.isNaN(Date.parse(startsAt))) return json({ error: "invalid_schedule" }, 400);
    if (endsAt && Number.isNaN(Date.parse(endsAt))) return json({ error: "invalid_schedule" }, 400);
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return json({ error: "invalid_schedule" }, 400);
    const capacity = body.capacity == null ? undefined : positiveInteger(body.capacity, "capacity");
    const priceMinor = body.priceMinor == null ? undefined : (() => {
      if (!Number.isInteger(body.priceMinor) || (body.priceMinor as number) < 0) throw new Error("invalid_price");
      return body.priceMinor as number;
    })();
    const [screening] = await db`
      UPDATE screenings SET
        location = COALESCE(${location ?? null}, location),
        starts_at = COALESCE(${startsAt ?? null}::timestamptz, starts_at),
        ends_at = COALESCE(${endsAt ?? null}::timestamptz, ends_at),
        capacity = COALESCE(${capacity ?? null}, capacity),
        price_minor = COALESCE(${priceMinor ?? null}, price_minor),
        cancelled = COALESCE(${typeof body.cancelled === "boolean" ? body.cancelled : null}, cancelled),
        updated_at = now()
      WHERE id = ${screeningId} RETURNING id, cancelled
    `;
    if (body.salesOpenAt !== undefined || body.salesCloseAt !== undefined) {
      await db`UPDATE screenings SET
        sales_open_at = ${body.salesOpenAt ? new Date(body.salesOpenAt).toISOString() : null}::timestamptz,
        sales_close_at = ${body.salesCloseAt ? new Date(body.salesCloseAt).toISOString() : null}::timestamptz,
        updated_at = now() WHERE id = ${screeningId}`;
    }
    await recordActivity(db, { actor: admin.sub, category: "screening", summary: `Updated screening ${screeningId}`, screeningId });
    return json({ ok: true, cancelled: screening.cancelled });
  }

  if (request.method === "DELETE" && path.startsWith("/api/admin/screenings/")) {
    const admin = await authenticatedUser(request, env, true);
    const screeningId = uuidParameter(titlePath(url));
    const [usage] = await db`
      SELECT (SELECT count(*)::integer FROM bookings WHERE screening_id = ${screeningId} AND status = 'confirmed') AS confirmed,
        (SELECT count(*)::integer FROM booking_holds WHERE screening_id = ${screeningId} AND expires_at > now()) AS held
    `;
    if (usage && (usage.confirmed > 0 || usage.held > 0)) return json({ error: "screening_has_bookings" }, 409);
    const [removed] = await db`DELETE FROM screenings WHERE id = ${screeningId} RETURNING id`;
    if (!removed) return json({ error: "not_found" }, 404);
    await recordActivity(db, { actor: admin.sub, category: "screening", summary: `Deleted screening ${screeningId}` });
    return json({ ok: true });
  }

  if (request.method === "GET" && path === "/api/banners") {
    const rows = await db`
      SELECT id, kicker, title, copy, image_key AS "imageKey", accent, destination_title_id AS "destinationTitleId"
      FROM banners
      WHERE state = 'published'
        AND (publish_at IS NULL OR publish_at <= now())
        AND (unpublish_at IS NULL OR unpublish_at > now())
      ORDER BY created_at DESC
    `;
    const storage = objectStorage(env);
    return json(await Promise.all(rows.map(async (row) => ({
      id: row.id,
      kicker: row.kicker,
      title: row.title,
      copy: row.copy,
      imageUrl: row.imageKey ? await getSignedUrl(storage, new GetObjectCommand({ Bucket: env.OBJECT_STORAGE_BUCKET, Key: row.imageKey }), { expiresIn: 3600 }) : "",
      accent: row.accent,
      destinationTitleId: row.destinationTitleId ?? undefined,
    }))));
  }

  if (request.method === "GET" && path === "/api/admin/banners") {
    await authenticatedUser(request, env, true);
    const rows = await db`
      SELECT id, kicker, title, copy, image_key AS "imageKey", accent,
        destination_title_id AS "destinationTitleId", destination_screening_id AS "destinationScreeningId",
        state, publish_at AS "publishAt", unpublish_at AS "unpublishAt", created_at AS "createdAt"
      FROM banners ORDER BY created_at DESC
    `;
    return json(rows);
  }

  if (request.method === "POST" && path === "/api/admin/banners") {
    const admin = await authenticatedUser(request, env, true);
    const body = await parseBody<{
      kicker?: string; title: string; copy?: string; imageKey?: string | null; accent?: string;
      destinationTitleId?: string | null; destinationScreeningId?: string | null;
      state?: string; publishAt?: string | null; unpublishAt?: string | null;
    }>(request);
    const [banner] = await db`
      INSERT INTO banners (kicker, title, copy, image_key, accent, destination_title_id,
        destination_screening_id, state, publish_at, unpublish_at)
      VALUES (${typeof body.kicker === "string" ? body.kicker.slice(0, 120) : ""},
        ${requiredText(body.title, "title", 200)},
        ${typeof body.copy === "string" ? body.copy.slice(0, 1000) : ""},
        ${artworkKey(body.imageKey)},
        ${body.accent === "violet" || body.accent === "coral" ? body.accent : "teal"},
        ${body.destinationTitleId ?? null}, ${body.destinationScreeningId ?? null},
        ${body.state === "published" ? "published" : "draft"},
        ${dateOrNull(body.publishAt, "publish_at")}, ${dateOrNull(body.unpublishAt, "unpublish_at")})
      RETURNING id
    `;
    await recordActivity(db, { actor: admin.sub, category: "banner", summary: `Created banner "${requiredText(body.title, "title", 200)}"`, bannerId: banner.id });
    return json({ id: banner.id }, 201);
  }

  if (request.method === "PUT" && path.startsWith("/api/admin/banners/")) {
    const admin = await authenticatedUser(request, env, true);
    const bannerId = uuidParameter(titlePath(url));
    const body = await parseBody<{
      kicker?: string; title: string; copy?: string; imageKey?: string | null; accent?: string;
      destinationTitleId?: string | null; destinationScreeningId?: string | null;
      state?: string; publishAt?: string | null; unpublishAt?: string | null;
    }>(request);
    const [banner] = await db`
      UPDATE banners SET kicker = ${typeof body.kicker === "string" ? body.kicker.slice(0, 120) : ""},
        title = ${requiredText(body.title, "title", 200)},
        copy = ${typeof body.copy === "string" ? body.copy.slice(0, 1000) : ""},
        image_key = ${artworkKey(body.imageKey)},
        accent = ${body.accent === "violet" || body.accent === "coral" ? body.accent : "teal"},
        destination_title_id = ${body.destinationTitleId ?? null},
        destination_screening_id = ${body.destinationScreeningId ?? null},
        state = ${body.state === "published" ? "published" : "draft"},
        publish_at = ${dateOrNull(body.publishAt, "publish_at")},
        unpublish_at = ${dateOrNull(body.unpublishAt, "unpublish_at")},
        updated_at = now()
      WHERE id = ${bannerId} RETURNING id, state
    `;
    if (!banner) return json({ error: "not_found" }, 404);
    await recordActivity(db, { actor: admin.sub, category: "banner", summary: `Updated banner — now ${banner.state === "published" ? "published" : "draft"}`, bannerId });
    return json({ ok: true });
  }

  if (request.method === "DELETE" && path.startsWith("/api/admin/banners/")) {
    const admin = await authenticatedUser(request, env, true);
    const bannerId = uuidParameter(titlePath(url));
    const [banner] = await db`DELETE FROM banners WHERE id = ${bannerId} RETURNING title`;
    if (!banner) return json({ error: "not_found" }, 404);
    await recordActivity(db, { actor: admin.sub, category: "banner", summary: `Deleted banner "${banner.title}"` });
    return json({ ok: true });
  }

  if (request.method === "GET" && path === "/api/admin/rewards/campaigns") {
    await authenticatedUser(request, env, true);
    const rows = await db`
      SELECT c.id, c.name, c.status, c.reward_kind AS "rewardKind", c.discount_percent AS "discountPercent",
        c.free_ticket_screening_id AS "freeTicketScreeningId", c.required_plays AS "requiredPlays",
        c.completion_window_days AS "completionWindowDays", c.reward_expiry_days AS "rewardExpiryDays",
        c.reward_cap AS "rewardCap", c.instructions, c.allow_overlap AS "allowOverlap",
        c.created_at AS "createdAt", c.updated_at AS "updatedAt",
        (SELECT t.title FROM screenings s JOIN catalog_titles t ON t.id = s.title_id WHERE s.id = c.free_ticket_screening_id) AS "freeTicketTitle",
        (SELECT count(*) FROM campaign_enrollments e WHERE e.campaign_id = c.id)::integer AS "enrolledCount",
        (SELECT count(*) FROM reward_grants g WHERE g.campaign_id = c.id)::integer AS "grantedCount",
        (SELECT count(*) FROM reward_grants g WHERE g.campaign_id = c.id AND g.status = 'redeemed')::integer AS "redeemedCount",
        (SELECT count(*) FROM reward_campaign_codes k WHERE k.campaign_id = c.id AND k.status = 'available')::integer AS "codesAvailable",
        (SELECT count(*) FROM reward_campaign_codes k WHERE k.campaign_id = c.id AND k.status = 'reserved')::integer AS "codesReserved",
        (SELECT count(*) FROM reward_campaign_codes k WHERE k.campaign_id = c.id AND k.status = 'used')::integer AS "codesUsed"
      FROM reward_campaigns c ORDER BY c.created_at DESC
    `;
    return json(rows);
  }

  if (request.method === "POST" && path === "/api/admin/rewards/campaigns") {
    const admin = await authenticatedUser(request, env, true);
    const body = await parseBody<{
      name: string; rewardKind: "coupon" | "discount" | "free-ticket";
      discountPercent?: number; freeTicketScreeningId?: string;
      requiredPlays?: number; completionWindowDays?: number; rewardExpiryDays?: number;
      rewardCap: number; instructions?: string; allowOverlap?: boolean;
    }>(request);
    const kind = requiredText(body.rewardKind, "reward_kind");
    if (!["coupon", "discount", "free-ticket"].includes(kind)) return json({ error: "invalid_reward_kind" }, 400);
    if (kind === "discount" && ![30, 50].includes(Number(body.discountPercent))) return json({ error: "invalid_discount_percent" }, 400);
    if (kind === "free-ticket" && !body.freeTicketScreeningId) return json({ error: "invalid_free_ticket_screening" }, 400);
    const [campaign] = await db`
      INSERT INTO reward_campaigns (name, reward_kind, discount_percent, free_ticket_screening_id,
        required_plays, completion_window_days, reward_expiry_days, reward_cap, instructions, allow_overlap)
      VALUES (${requiredText(body.name, "name", 160)}, ${kind},
        ${kind === "discount" ? positiveInteger(body.discountPercent, "discount_percent") : null},
        ${kind === "free-ticket" ? body.freeTicketScreeningId : null},
        ${body.requiredPlays == null ? 3 : positiveInteger(body.requiredPlays, "required_plays")},
        ${body.completionWindowDays == null ? 7 : positiveInteger(body.completionWindowDays, "completion_window_days")},
        ${body.rewardExpiryDays == null ? 30 : positiveInteger(body.rewardExpiryDays, "reward_expiry_days")},
        ${positiveInteger(body.rewardCap, "reward_cap")},
        ${typeof body.instructions === "string" ? body.instructions.slice(0, 2000) : ""},
        ${body.allowOverlap !== false})
      RETURNING id
    `;
    await recordActivity(db, { actor: admin.sub, category: "reward", summary: `Created reward campaign "${requiredText(body.name, "name", 160)}" (${kind})`, campaignId: campaign.id });
    return json({ id: campaign.id }, 201);
  }

  if (request.method === "PUT" && path.startsWith("/api/admin/rewards/campaigns/") && !path.endsWith("/codes") && !path.match(/\/codes\/[0-9a-f-]+$/)) {
    const admin = await authenticatedUser(request, env, true);
    const campaignId = uuidParameter(decodeURIComponent(path.split("/").filter(Boolean).at(-1) ?? ""));
    const body = await parseBody<{
      name?: string; status?: string; requiredPlays?: number; completionWindowDays?: number;
      rewardExpiryDays?: number; instructions?: string; allowOverlap?: boolean;
    }>(request);
    if (body.status === "active") {
      await db`UPDATE reward_campaigns SET status = 'paused', updated_at = now() WHERE status = 'active' AND id <> ${campaignId}`;
    }
    const [campaign] = await db`
      UPDATE reward_campaigns SET
        name = ${body.name == null ? null : requiredText(body.name, "name", 160)},
        status = ${body.status == null ? null : (["active", "paused", "draft", "ended"].includes(body.status) ? body.status : (() => { throw new Error("invalid_status"); })())},
        required_plays = ${body.requiredPlays == null ? null : positiveInteger(body.requiredPlays, "required_plays")},
        completion_window_days = ${body.completionWindowDays == null ? null : positiveInteger(body.completionWindowDays, "completion_window_days")},
        reward_expiry_days = ${body.rewardExpiryDays == null ? null : positiveInteger(body.rewardExpiryDays, "reward_expiry_days")},
        instructions = ${body.instructions == null ? null : body.instructions.slice(0, 2000)},
        allow_overlap = ${body.allowOverlap == null ? null : body.allowOverlap === true},
        updated_at = now()
      WHERE id = ${campaignId} RETURNING id, status
    `;
    if (!campaign) return json({ error: "not_found" }, 404);
    await recordActivity(db, { actor: admin.sub, category: "reward", summary: `Updated reward campaign ${campaignId} — status ${campaign.status}`, campaignId });
    return json({ ok: true, status: campaign.status });
  }

  if (request.method === "GET" && path.endsWith("/entrants") && path.startsWith("/api/admin/rewards/campaigns/")) {
    await authenticatedUser(request, env, true);
    const campaignId = uuidParameter(decodeURIComponent(path.split("/").filter(Boolean).at(-2) ?? ""));
    const rows = await db`
      SELECT e.id AS "enrollmentId", e.user_id AS "userId", e.completed_plays AS "completedPlays",
        e.status AS "status", e.reservation_expires_at AS "reservationExpiresAt",
        k.code AS "code", k.expires_at AS "codeExpiresAt",
        g.status AS "grantStatus", g.title AS "grantTitle", g.redeemed_at AS "redeemedAt"
      FROM campaign_enrollments e
      LEFT JOIN reward_campaign_codes k ON k.id = e.code_id
      LEFT JOIN reward_grants g ON g.enrollment_id = e.id
      WHERE e.campaign_id = ${campaignId}
      ORDER BY e.created_at DESC
    `;
    return json(rows);
  }

  if (request.method === "GET" && path.endsWith("/codes") && path.startsWith("/api/admin/rewards/campaigns/")) {
    await authenticatedUser(request, env, true);
    const campaignId = uuidParameter(decodeURIComponent(path.split("/").filter(Boolean).at(-2) ?? ""));
    const rows = await db`
      SELECT id, code, instructions, expires_at AS "expiresAt", status, granted_to AS "grantedTo"
      FROM reward_campaign_codes WHERE campaign_id = ${campaignId}
      ORDER BY created_at DESC
    `;
    return json(rows);
  }

  if (request.method === "POST" && path.endsWith("/codes") && path.startsWith("/api/admin/rewards/campaigns/")) {
    const admin = await authenticatedUser(request, env, true);
    const campaignId = uuidParameter(decodeURIComponent(path.split("/").filter(Boolean).at(-2) ?? ""));
    const body = await parseBody<{ codes: string[]; instructions?: string; expiresAt?: string | null }>(request);
    if (!Array.isArray(body.codes) || body.codes.length < 1 || body.codes.length > 500) return json({ error: "invalid_codes" }, 400);
    const unique = [...new Set(body.codes.map((code) => requiredText(code, "code", 200)))];
    let added = 0;
    for (const code of unique) {
      const rows = await db`
        INSERT INTO reward_campaign_codes (campaign_id, code, instructions, expires_at)
        VALUES (${campaignId}, ${code}, ${typeof body.instructions === "string" ? body.instructions.slice(0, 500) : null}, ${dateOrNull(body.expiresAt, "expires_at")})
        ON CONFLICT (campaign_id, code) DO NOTHING
        RETURNING id
      `;
      if (rows.length) added += 1;
    }
    await recordActivity(db, { actor: admin.sub, category: "reward", summary: `Added ${added} coupon code(s) to reward campaign ${campaignId}`, campaignId });
    return json({ added });
  }

  if (request.method === "DELETE" && path.match(/^\/api\/admin\/rewards\/campaigns\/[0-9a-f-]+\/codes\/[0-9a-f-]+$/)) {
    const admin = await authenticatedUser(request, env, true);
    const segments = path.split("/").filter(Boolean);
    const campaignId = uuidParameter(segments[3]);
    const codeId = uuidParameter(segments[5]);
    const [code] = await db`DELETE FROM reward_campaign_codes WHERE id = ${codeId} AND campaign_id = ${campaignId} AND status = 'available' RETURNING code`;
    if (!code) return json({ error: "not_found" }, 404);
    await recordActivity(db, { actor: admin.sub, category: "reward", summary: `Removed unused coupon code from reward campaign ${campaignId}`, campaignId });
    return json({ ok: true });
  }

  if (request.method === "GET" && path === "/api/admin/activity") {
    await authenticatedUser(request, env, true);
    const urlQuery = new URL(request.url).searchParams;
    const category = urlQuery.get("category");
    const query = urlQuery.get("query");
    const limit = Math.min(200, Math.max(1, Number(urlQuery.get("limit")) || 50));
    const rows = await db`
      SELECT a.id, a.occurred_at AS "occurredAt", a.actor_sub AS "actorSub", a.category, a.summary,
        a.screening_id AS "screeningId", a.banner_id AS "bannerId", a.campaign_id AS "campaignId", a.order_ref AS "orderRef",
        COALESCE(t.title, '') AS "refLabel"
      FROM admin_activity a
      LEFT JOIN screenings s ON s.id = a.screening_id
      LEFT JOIN catalog_titles t ON t.id = s.title_id
      WHERE (${category ?? null}::text IS NULL OR a.category = ${category ?? null})
        AND (${query ?? null}::text IS NULL
          OR a.summary ILIKE ${`%${query ?? ""}%`}
          OR t.title ILIKE ${`%${query ?? ""}%`}
          OR a.actor_sub ILIKE ${`%${query ?? ""}%`}
          OR a.order_ref ILIKE ${`%${query ?? ""}%`})
      ORDER BY a.occurred_at DESC, a.id DESC
      LIMIT ${limit}
    `;
    return json(rows);
  }

  // ---- Shared ticketing seam: customer app <-> admin <-> door staff ----
  // REST + short polling (not WebSockets): Pages Functions cannot hold a
  // persistent socket without Durable Objects, and door scanning needs an
  // idempotent request/response, not a stream. Clients poll the counts
  // endpoints every 15-20s; the admin already polls activity at 20s.

  if (request.method === "GET" && path === "/api/bookings") {
    const user = await authenticatedUser(request, env);
    const rows = await db`
      SELECT b.id, b.order_code AS "orderCode", b.screening_id AS "screeningId",
        s.title_id AS "titleId", t.title, s.starts_at AS "startsAt", s.ends_at AS "endsAt",
        s.location, b.quantity, b.amount_minor AS "amountMinor", b.discount_minor AS "discountMinor",
        b.status,
        b.ticket_status AS "ticketStatus", b.qr_value AS "qrValue",
        b.created_at AS "createdAt"
      FROM bookings b
      JOIN screenings s ON s.id = b.screening_id
      JOIN catalog_titles t ON t.id = s.title_id
      WHERE b.user_id = ${user.sub}
      ORDER BY b.created_at DESC
      LIMIT 100
    `;
    return json(rows);
  }

  if (request.method === "POST" && path === "/api/booking-holds") {
    const user = await authenticatedUser(request, env);
    const body = await parseBody<{ screeningId: string; quantity?: number; rewardId?: string }>(request);
    const screeningId = uuidParameter(requiredText(body.screeningId, "screening_id", 64));
    const quantity = body.quantity == null ? 1 : positiveInteger(body.quantity, "quantity");
    if (quantity > 10) throw new Error("invalid_quantity");
    let rewardId: string | null = null;
    if (body.rewardId) {
      rewardId = uuidParameter(requiredText(body.rewardId, "reward_id", 64));
      const [reward] = await db`
        SELECT g.id, c.reward_kind AS "rewardKind"
        FROM reward_grants g JOIN reward_campaigns c ON c.id = g.campaign_id
        WHERE g.id = ${rewardId} AND g.user_id = ${user.sub} AND g.status = 'available'
          AND (g.expires_at IS NULL OR g.expires_at > now())
      `;
      if (!reward) return json({ error: "reward_unavailable" }, 409);
      if (reward.rewardKind === "coupon") return json({ error: "reward_not_applicable" }, 409);
    }
    const [screening] = await db`
      SELECT s.id, s.capacity, t.active AS title_active, s.cancelled,
        s.starts_at, s.sales_open_at, s.sales_close_at,
        COALESCE((SELECT sum(b.quantity)::integer FROM bookings b
          WHERE b.screening_id = s.id AND b.status = 'confirmed'), 0) AS sold,
        COALESCE((SELECT sum(h.quantity)::integer FROM booking_holds h
          WHERE h.screening_id = s.id AND h.expires_at > now()), 0) AS held
      FROM screenings s JOIN catalog_titles t ON t.id = s.title_id
      WHERE s.id = ${screeningId}
    `;
    if (!screening) return json({ error: "not_found" }, 404);
    const now = Date.now();
    const opensAt = screening.sales_open_at ? Date.parse(screening.sales_open_at) : Number.NEGATIVE_INFINITY;
    const closesAt = screening.sales_close_at ? Date.parse(screening.sales_close_at) : Date.parse(screening.starts_at);
    if (!screening.title_active || screening.cancelled || now < opensAt || now >= closesAt || now >= Date.parse(screening.starts_at)) {
      return json({ error: "not_on_sale" }, 409);
    }
    if (Number(screening.sold) + Number(screening.held) + quantity > Number(screening.capacity)) {
      return json({ error: "sold_out" }, 409);
    }
    const [hold] = await db`
      INSERT INTO booking_holds (screening_id, user_id, quantity, expires_at, reward_grant_id)
      VALUES (${screeningId}, ${user.sub}, ${quantity}, now() + interval '10 minutes', ${rewardId})
      RETURNING id, expires_at AS "expiresAt"
    `;
    return json({ holdId: hold.id, expiresAt: hold.expiresAt }, 201);
  }

  if (request.method === "POST" && path === "/api/create-order") {
    const user = await authenticatedUser(request, env);
    const body = await parseBody<{ holdId: string }>(request);
    const holdId = uuidParameter(requiredText(body.holdId, "hold_id", 64));
    const [hold] = await db`
      SELECT h.id, h.screening_id AS "screeningId", h.quantity, h.reward_grant_id AS "rewardGrantId",
        s.price_minor AS "priceMinor"
      FROM booking_holds h
      JOIN screenings s ON s.id = h.screening_id
      JOIN catalog_titles t ON t.id = s.title_id
      WHERE h.id = ${holdId} AND h.user_id = ${user.sub} AND h.expires_at > now()
        AND t.active AND NOT s.cancelled AND s.starts_at > now()
      FOR UPDATE OF h
    `;
    if (!hold) return json({ error: "hold_expired_or_not_found" }, 409);

    // Rewards are priced from server data, never from the browser's displayed
    // total. A percentage reward discounts one ticket per order; a free-ticket
    // reward covers one ticket.
    let discount = 0;
    if (hold.rewardGrantId) {
      const [reward] = await db`
        SELECT g.id, c.reward_kind AS "rewardKind", c.discount_percent AS "discountPercent"
        FROM reward_grants g JOIN reward_campaigns c ON c.id = g.campaign_id
        WHERE g.id = ${hold.rewardGrantId} AND g.user_id = ${user.sub}
          AND g.status = 'available' AND (g.expires_at IS NULL OR g.expires_at > now())
        FOR UPDATE OF g
      `;
      if (!reward) return json({ error: "reward_unavailable" }, 409);
      if (reward.rewardKind === "discount") {
        discount = Math.round(Number(hold.priceMinor) * Number(reward.discountPercent) / 100);
      } else if (reward.rewardKind === "free-ticket") {
        discount = Number(hold.priceMinor);
      }
    }

    const gross = Number(hold.priceMinor) * Number(hold.quantity);
    const amount = Math.max(0, gross - discount);
    if (!Number.isSafeInteger(amount) || amount < 0) return json({ error: "invalid_amount" }, 400);
    if (amount > 0 && amount < 100) return json({ error: "amount_below_minimum" }, 400);

    const orderCode = makeOrderCode();
    const qrValue = `marvelsyllabus://ticket/${orderCode}`;

    // A fully discounted reward needs no payment provider. It is still a real,
    // one-time ticket in the wallet and the reward is consumed exactly once.
    if (amount === 0) {
      const [booking] = await db`
        INSERT INTO bookings (screening_id, user_id, quantity, amount_minor, discount_minor,
          status, order_code, qr_value, payment_reference, reward_grant_id)
        VALUES (${hold.screeningId}, ${user.sub}, ${hold.quantity}, 0, ${discount},
          'confirmed', ${orderCode}, ${qrValue}, 'reward', ${hold.rewardGrantId})
        RETURNING id
      `;
      await db`
        UPDATE reward_grants SET status = 'redeemed', redeemed_at = now()
        WHERE id = ${hold.rewardGrantId}
      `;
      await db`DELETE FROM booking_holds WHERE id = ${holdId}`;
      return json({ free: true, orderCode, amount: 0, currency: "INR" }, 201);
    }

    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new Error("invalid_razorpay_configuration");

    const [booking] = await db`
      INSERT INTO bookings (screening_id, user_id, quantity, amount_minor, discount_minor,
        status, order_code, qr_value, reward_grant_id)
      VALUES (${hold.screeningId}, ${user.sub}, ${hold.quantity}, ${amount}, ${discount},
        'payment_pending', ${orderCode}, ${qrValue}, ${hold.rewardGrantId})
      RETURNING id
    `;

    let razorpayOrder: { id?: unknown; amount?: unknown; currency?: unknown };
    try {
      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ amount, currency: "INR", receipt: booking.id }),
      });
      if (response.status === 401) throw new Error("razorpay_auth_failed");
      if (!response.ok) throw new Error("razorpay_create_failed");
      razorpayOrder = await response.json() as { id?: unknown; amount?: unknown; currency?: unknown };
    } catch (error) {
      await db`DELETE FROM bookings WHERE id = ${booking.id} AND status = 'payment_pending'`;
      throw error;
    }

    if (typeof razorpayOrder.id !== "string" || typeof razorpayOrder.amount !== "number" || typeof razorpayOrder.currency !== "string") {
      await db`DELETE FROM bookings WHERE id = ${booking.id} AND status = 'payment_pending'`;
      throw new Error("razorpay_create_failed");
    }
    await db`UPDATE bookings SET payment_reference = ${razorpayOrder.id}, updated_at = now() WHERE id = ${booking.id}`;
    return json({ order_id: razorpayOrder.id, amount: razorpayOrder.amount, currency: razorpayOrder.currency }, 201);
  }

  if (request.method === "POST" && path === "/api/verify-payment") {
    const user = await authenticatedUser(request, env);
    const body = await parseBody<{ razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }>(request);
    const orderId = requiredText(body.razorpay_order_id, "razorpay_order_id", 128);
    const paymentId = requiredText(body.razorpay_payment_id, "razorpay_payment_id", 128);
    const signature = requiredText(body.razorpay_signature, "razorpay_signature", 128);
    if (!env.RAZORPAY_KEY_SECRET) throw new Error("invalid_razorpay_configuration");
    const expected = await razorpaySignature(orderId, paymentId, env.RAZORPAY_KEY_SECRET);
    if (!constantTimeEqual(expected, signature)) return json({ error: "signature_mismatch" }, 400);

    const [booking] = await db`
      UPDATE bookings SET status = 'confirmed', updated_at = now()
      WHERE user_id = ${user.sub} AND payment_reference = ${orderId} AND status = 'payment_pending'
      RETURNING id, order_code AS "orderCode", reward_grant_id AS "rewardGrantId"
    `;
    if (!booking) return json({ error: "payment_not_pending" }, 409);
    if (booking.rewardGrantId) {
      await db`
        UPDATE reward_grants SET status = 'redeemed', redeemed_at = now()
        WHERE id = ${booking.rewardGrantId} AND status = 'available'
      `;
    }
    await db`DELETE FROM booking_holds WHERE id IN (
      SELECT h.id FROM booking_holds h JOIN bookings b ON b.screening_id = h.screening_id
      WHERE b.id = ${booking.id} AND h.user_id = ${user.sub}
    )`;
    return json({ success: true, orderCode: booking.orderCode });
  }

  if (request.method === "GET" && path === "/api/staff/screenings") {
    await requireStaff(request, env);
    const rows = await db`
      SELECT s.id, s.title_id AS "titleId", t.title, s.starts_at AS "startsAt",
        s.ends_at AS "endsAt", s.location, s.capacity, s.cancelled,
        COALESCE((SELECT sum(b.quantity)::integer FROM bookings b
          WHERE b.screening_id = s.id AND b.status = 'confirmed'), 0) AS "soldCount",
        COALESCE((SELECT count(*)::integer FROM bookings b
          WHERE b.screening_id = s.id AND b.status = 'confirmed' AND b.ticket_status = 'used'), 0) AS "checkedInCount"
      FROM screenings s JOIN catalog_titles t ON t.id = s.title_id
      WHERE s.starts_at > now() - interval '12 hours'
      ORDER BY s.starts_at
      LIMIT 50
    `;
    return json(rows);
  }

  if (request.method === "POST" && path === "/api/staff/validate") {
    await requireStaff(request, env);
    const body = await parseBody<{ code: string }>(request);
    const code = normalizeTicketCode(body.code);
    const [booking] = await db`
      SELECT b.id, b.order_code AS "orderCode", b.quantity, b.status,
        b.ticket_status AS "ticketStatus", b.checked_in_at AS "checkedInAt",
        s.id AS "screeningId", t.title, s.starts_at AS "startsAt",
        s.location, s.cancelled
      FROM bookings b
      JOIN screenings s ON s.id = b.screening_id
      JOIN catalog_titles t ON t.id = s.title_id
      WHERE b.order_code = ${code}
    `;
    if (!booking) {
      return json({ status: "invalid", code });
    }
    if (booking.status !== "confirmed" || booking.cancelled) {
      return json({ ...booking, code, status: "invalid" });
    }
    if (booking.ticketStatus === "used") {
      return json({ ...booking, code, status: "already_used" });
    }
    return json({ ...booking, code, status: "valid" });
  }

  if (request.method === "POST" && path === "/api/staff/check-in") {
    const staff = await requireStaff(request, env);
    const body = await parseBody<{ code: string }>(request);
    const code = normalizeTicketCode(body.code);
    const [booking] = await db`
      SELECT id, screening_id AS "screeningId", status, ticket_status AS "ticketStatus"
      FROM bookings WHERE order_code = ${code}
    `;
    if (!booking || booking.status !== "confirmed") {
      if (booking) {
        await db`INSERT INTO ticket_checkins (booking_id, screening_id, staff_sub, result)
          VALUES (${booking.id}, ${booking.screeningId}, ${staff.sub}, 'invalid')`;
      }
      return json({ status: "invalid", code }, 404);
    }
    if (booking.ticketStatus === "used") {
      await db`INSERT INTO ticket_checkins (booking_id, screening_id, staff_sub, result)
        VALUES (${booking.id}, ${booking.screeningId}, ${staff.sub}, 'already_used')`;
      return json({ status: "already_used", code });
    }
    const updated = await db`
      UPDATE bookings SET ticket_status = 'used', checked_in_at = now(), updated_at = now()
      WHERE id = ${booking.id} AND ticket_status = 'valid'
      RETURNING id
    `;
    await db`INSERT INTO ticket_checkins (booking_id, screening_id, staff_sub, result)
      VALUES (${booking.id}, ${booking.screeningId}, ${staff.sub}, 'accepted')`;
    if (!updated.length) return json({ status: "already_used", code });
    return json({ status: "accepted", code });
  }

  if (request.method === "GET" && path === "/api/admin/bookings") {
    await authenticatedUser(request, env, true);
    const screeningId = url.searchParams.get("screeningId");
    const rows = screeningId
      ? await db`
        SELECT b.id, b.order_code AS "orderCode", b.user_id AS "userId", b.quantity,
          b.amount_minor AS "amountMinor", b.status,
          b.ticket_status AS "ticketStatus", b.checked_in_at AS "checkedInAt",
          b.created_at AS "createdAt"
        FROM bookings b WHERE b.screening_id = ${uuidParameter(screeningId)}
        ORDER BY b.created_at DESC LIMIT 500`
      : await db`
        SELECT b.id, b.order_code AS "orderCode", b.screening_id AS "screeningId",
          s.title_id AS "titleId", t.title, b.user_id AS "userId", b.quantity,
          b.amount_minor AS "amountMinor", b.status, b.ticket_status AS "ticketStatus",
          b.created_at AS "createdAt"
        FROM bookings b JOIN screenings s ON s.id = b.screening_id
        JOIN catalog_titles t ON t.id = s.title_id
        ORDER BY b.created_at DESC LIMIT 200`;
    return json(rows);
  }

  if (request.method === "POST" && path.match(/^\/api\/admin\/bookings\/[0-9a-f-]+\/(refund|cancel)$/)) {
    const admin = await authenticatedUser(request, env, true);
    const segments = path.split("/").filter(Boolean);
    const bookingId = uuidParameter(segments[3]);
    const action = segments[4];
    const [booking] = await db`SELECT id, screening_id AS "screeningId", status FROM bookings WHERE id = ${bookingId}`;
    if (!booking) return json({ error: "not_found" }, 404);
    const next = action === "refund" ? "refunded" : "failed";
    const [updated] = await db`
      UPDATE bookings SET status = ${next}, ticket_status = 'invalid', updated_at = now()
      WHERE id = ${bookingId} RETURNING id, status
    `;
    await recordActivity(db, {
      actor: admin.sub, category: "booking",
      summary: `${action === "refund" ? "Refunded" : "Cancelled"} booking ${bookingId}`,
      screeningId: booking.screeningId, orderRef: bookingId,
    });
    return json({ ok: true, status: updated.status });
  }

  if (request.method === "GET" && path === "/api/admin/holds") {
    await authenticatedUser(request, env, true);
    const screeningId = url.searchParams.get("screeningId");
    const rows = screeningId
      ? await db`
        SELECT h.id, h.screening_id AS "screeningId", h.user_id AS "userId", h.quantity,
          h.expires_at AS "expiresAt", h.created_at AS "createdAt"
        FROM booking_holds h WHERE h.screening_id = ${uuidParameter(screeningId)} AND h.expires_at > now()
        ORDER BY h.created_at DESC LIMIT 200`
      : await db`
        SELECT h.id, h.screening_id AS "screeningId", t.title, h.user_id AS "userId", h.quantity,
          h.expires_at AS "expiresAt", h.created_at AS "createdAt"
        FROM booking_holds h JOIN screenings s ON s.id = h.screening_id
        JOIN catalog_titles t ON t.id = s.title_id
        WHERE h.expires_at > now() ORDER BY h.created_at DESC LIMIT 200`;
    return json(rows);
  }

  if (request.method === "DELETE" && path.startsWith("/api/admin/holds/")) {
    const admin = await authenticatedUser(request, env, true);
    const holdId = uuidParameter(titlePath(url));
    const [hold] = await db`DELETE FROM booking_holds WHERE id = ${holdId} RETURNING screening_id AS "screeningId"`;
    if (!hold) return json({ error: "not_found" }, 404);
    await recordActivity(db, { actor: admin.sub, category: "booking", summary: `Released booking hold ${holdId}`, screeningId: hold.screeningId });
    return json({ ok: true });
  }

  if (request.method === "GET" && path === "/api/admin/checkins") {
    await authenticatedUser(request, env, true);
    const screeningId = url.searchParams.get("screeningId");
    if (!screeningId) return json({ error: "invalid_screening_id" }, 400);
    const rows = await db`
      SELECT c.id, c.booking_id AS "bookingId", b.order_code AS "orderCode",
        c.staff_sub AS "staffSub", c.result, c.created_at AS "createdAt"
      FROM ticket_checkins c JOIN bookings b ON b.id = c.booking_id
      WHERE c.screening_id = ${uuidParameter(screeningId)}
      ORDER BY c.created_at DESC LIMIT 500`;
    return json(rows);
  }

  if (request.method === "GET" && path === "/api/admin/overview") {
    await authenticatedUser(request, env, true);
    const [[titles], [screenings], [bookings], [holds], [checkins], [campaigns]] = await Promise.all([
      db`SELECT count(*)::integer AS value FROM catalog_titles`,
      db`SELECT count(*)::integer AS value FROM screenings WHERE starts_at > now() - interval '12 hours'`,
      db`SELECT count(*)::integer AS value, COALESCE(sum(CASE WHEN status = 'confirmed' THEN amount_minor ELSE 0 END), 0)::bigint AS revenue FROM bookings`,
      db`SELECT count(*)::integer AS value FROM booking_holds WHERE expires_at > now()`,
      db`SELECT count(*)::integer AS value FROM ticket_checkins WHERE created_at > now() - interval '24 hours'`,
      db`SELECT count(*)::integer AS value FROM reward_campaigns WHERE status = 'active'`,
    ]);
    return json({
      titles: titles.value, upcomingScreenings: screenings.value,
      bookings: bookings.value, revenueMinor: Number(bookings.revenue),
      activeHolds: holds.value, checkins24h: checkins.value, activeCampaigns: campaigns.value,
    });
  }

  return json({ error: "not_found" }, 404);
}

export const onRequest = async (context: PagesContext) => {
  const origin = context.request.headers.get("origin");
  const allowedOrigins = (context.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowOrigin = origin && (allowedOrigins.includes("*") || allowedOrigins.includes(origin));
  const cors: Record<string, string> = allowOrigin
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-max-age": "86400",
        vary: "Origin",
      }
    : {};
  if (context.request.method === "OPTIONS" && allowOrigin) {
    return new Response(null, { status: 204, headers: cors });
  }

  let response: Response;
  try {
    response = await route(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    if (message === "unauthorized") response = json({ error: message }, 401);
    else if (message === "forbidden") response = json({ error: message }, 403);
    else if (message === "auth_unavailable") response = json({ error: message }, 503);
    else if (message === "razorpay_auth_failed") response = json({ error: message }, 401);
    else {
      console.error("API request failed", error);
      response = json({ error: message.startsWith("invalid_") ? message : "request_failed" }, message.startsWith("invalid_") ? 400 : 500);
    }
  }
  if (!allowOrigin) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
