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
    await authenticatedUser(request, env, true);
    const body = await parseBody<{ qrDestination: string }>(request);
    const destination = profileQrDestination(body.qrDestination);
    await db`
      INSERT INTO site_settings (setting_key, setting_value, updated_at)
      VALUES ('profile_qr_destination', ${destination}, now())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()
    `;
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
    await authenticatedUser(request, env, true);
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
    return json({ imported: body.entries.length });
  }

  if (request.method === "POST" && path === "/api/admin/catalog") {
    await authenticatedUser(request, env, true);
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
    return json({ id: entry.id }, 201);
  }

  if (request.method === "PUT" && path.startsWith("/api/admin/catalog/order")) {
    await authenticatedUser(request, env, true);
    const body = await parseBody<{ ids: string[] }>(request);
    if (!Array.isArray(body.ids) || new Set(body.ids).size !== body.ids.length) return json({ error: "invalid_order" }, 400);
    for (const [index, id] of body.ids.entries()) {
      await db`UPDATE catalog_titles SET watch_order = ${index + 1}, updated_at = now() WHERE id = ${id}`;
    }
    return json({ ok: true });
  }

  if (request.method === "PUT" && path.startsWith("/api/admin/catalog/")) {
    await authenticatedUser(request, env, true);
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
    return entry ? json({ ok: true }) : json({ error: "not_found" }, 404);
  }

  if (request.method === "POST" && path === "/api/admin/artwork") {
    await authenticatedUser(request, env, true);
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
    await authenticatedUser(request, env, true);
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
    return json({ ok: true });
  }

  if (request.method === "POST" && path === "/api/admin/screenings") {
    await authenticatedUser(request, env, true);
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
    return json({ id: screening.id }, 201);
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
