import { neon } from "@neondatabase/serverless";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface Env {
  DATABASE_URL: string;
  OBJECT_STORAGE_ENDPOINT: string;
  OBJECT_STORAGE_REGION: string;
  OBJECT_STORAGE_BUCKET: string;
  OBJECT_STORAGE_ACCESS_KEY_ID: string;
  OBJECT_STORAGE_SECRET_ACCESS_KEY: string;
  CLERK_ISSUER: string;
  CLERK_JWKS_URL: string;
  CLERK_AUDIENCE?: string;
}

interface Claims {
  sub: string;
  iss: string;
  exp: number;
  nbf?: number;
  aud?: string | string[];
  role?: string;
}

type ClerkJwk = JsonWebKey & { kid?: string; kty?: string };

interface PagesContext {
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
  if (admin && claims.role !== "admin") throw new Error("forbidden");
  return claims;
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
type Db = ReturnType<typeof neon>;
const recordActivity = async (db: Db, meta: {
  actor: string;
  category: "catalog" | "screening" | "artwork" | "settings" | "banner" | "reward";
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

async function route({ request, env }: PagesContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const db = neon(env.DATABASE_URL);

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
    const body = await parseBody<{ title: string; synopsis: string; releaseYear: number | null; posterKey: string | null; active: boolean; watchOrder: number }>(request);
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
    const body = await parseBody<{ cancelled?: boolean }>(request);
    const [screening] = await db`
      UPDATE screenings SET cancelled = ${body.cancelled === true}, updated_at = now()
      WHERE id = ${screeningId} RETURNING id, cancelled
    `;
    if (!screening) return json({ error: "not_found" }, 404);
    await recordActivity(db, {
      actor: admin.sub,
      category: "screening",
      summary: screening.cancelled ? `Cancelled screening ${screeningId}` : `Reopened cancelled screening ${screeningId}`,
      screeningId,
    });
    return json({ ok: true, cancelled: screening.cancelled });
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
        s.location, b.quantity, b.amount_minor AS "amountMinor", b.status,
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
    const body = await parseBody<{ screeningId: string; quantity?: number }>(request);
    const screeningId = uuidParameter(requiredText(body.screeningId, "screening_id", 64));
    const quantity = body.quantity == null ? 1 : positiveInteger(body.quantity, "quantity");
    if (quantity > 10) throw new Error("invalid_quantity");
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
      INSERT INTO booking_holds (screening_id, user_id, quantity, expires_at)
      VALUES (${screeningId}, ${user.sub}, ${quantity}, now() + interval '10 minutes')
      RETURNING id, expires_at AS "expiresAt"
    `;
    return json({ holdId: hold.id, expiresAt: hold.expiresAt }, 201);
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
        SELECT b.order_code AS "orderCode", b.quantity, b.status,
          b.ticket_status AS "ticketStatus", b.checked_in_at AS "checkedInAt",
          b.created_at AS "createdAt"
        FROM bookings b WHERE b.screening_id = ${uuidParameter(screeningId)}
        ORDER BY b.created_at DESC LIMIT 500`
      : await db`
        SELECT b.order_code AS "orderCode", b.screening_id AS "screeningId",
          b.quantity, b.status, b.ticket_status AS "ticketStatus",
          b.created_at AS "createdAt"
        FROM bookings b ORDER BY b.created_at DESC LIMIT 100`;
    return json(rows);
  }

  return json({ error: "not_found" }, 404);
}

export const onRequest = async (context: PagesContext) => {
  try {
    return await route(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    if (message === "unauthorized") return json({ error: message }, 401);
    if (message === "forbidden") return json({ error: message }, 403);
    if (message === "auth_unavailable") return json({ error: message }, 503);
    console.error("API request failed", error);
    return json({ error: message.startsWith("invalid_") ? message : "request_failed" }, message.startsWith("invalid_") ? 400 : 500);
  }
};
