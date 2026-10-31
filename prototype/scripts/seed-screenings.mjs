#!/usr/bin/env node
// Publishes a small, repeatable set of screenings so the customer app has
// something bookable. Without rows in `screenings` the title sheet says
// "No screenings published yet." and no Book button can ever be enabled.
//
// The ids are fixed, so re-running refreshes the dates and prices on the same
// six showings instead of piling up duplicates. That also means re-running is
// how you move a show that has already started back into the future.
//
//   node scripts/seed-screenings.mjs            # uses .dev.vars DATABASE_URL
//   DATABASE_URL=postgres://... node scripts/seed-screenings.mjs
//
// Admin-created screenings (via the Command Deck) are untouched: this script
// only ever writes the six ids below.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));

async function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const candidate of [join(here, "..", ".dev.vars"), join(here, "..", "..", ".env.local"), join(here, "..", "..", ".env")]) {
    try {
      const text = await readFile(candidate, "utf8");
      const match = /^DATABASE_URL=(.+)$/m.exec(text);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      // Try the next location.
    }
  }
  throw new Error("Set DATABASE_URL, or run this from a checkout with prototype/.dev.vars.");
}

const IST_OFFSET_MINUTES = 330;

/** The UTC instant whose Asia/Kolkata wall clock is `hour:minute` on that day. */
function istStart(daysFromNow, hour, minute = 0) {
  const nowIst = new Date(Date.now() + IST_OFFSET_MINUTES * 60_000);
  const target = Date.UTC(
    nowIst.getUTCFullYear(),
    nowIst.getUTCMonth(),
    nowIst.getUTCDate() + daysFromNow,
    hour,
    minute,
  );
  return new Date(target - IST_OFFSET_MINUTES * 60_000).toISOString();
}

function endsAt(startsAt, minutes) {
  return new Date(Date.parse(startsAt) + minutes * 60_000).toISOString();
}

const shows = [
  { id: "11111111-1111-4111-8111-111111111101", titleId: "captain-america-the-first-avenger", inDays: 2, hour: 19, minutes: 145, location: "Arc Cinema · Hall 01", capacity: 120, priceMinor: 45000 },
  { id: "11111111-1111-4111-8111-111111111102", titleId: "iron-man", inDays: 4, hour: 16, minutes: 130, location: "Arc Cinema · Hall 01", capacity: 120, priceMinor: 40000 },
  { id: "11111111-1111-4111-8111-111111111103", titleId: "iron-man-2", inDays: 3, hour: 20, minutes: 135, location: "Metro Screens · Hall 03", capacity: 90, priceMinor: 55000 },
  { id: "11111111-1111-4111-8111-111111111104", titleId: "thor", inDays: 6, hour: 21, minutes: 130, location: "Arc Cinema · Hall 02", capacity: 90, priceMinor: 50000 },
  { id: "11111111-1111-4111-8111-111111111105", titleId: "the-avengers", inDays: 8, hour: 18, minutes: 150, location: "The Lab · Studio A", capacity: 60, priceMinor: 35000 },
  { id: "11111111-1111-4111-8111-111111111106", titleId: "iron-man-3", inDays: 10, hour: 20, minutes: 135, location: "Arc Cinema · Hall 01", capacity: 120, priceMinor: 60000 },
];

const sql = neon(await databaseUrl());

const missing = await sql`
  SELECT s.id FROM (VALUES ${sql.unsafe(shows.map((show) => `('${show.titleId}')`).join(", "))})
    AS s(id)
  WHERE NOT EXISTS (SELECT 1 FROM catalog_titles t WHERE t.id = s.id)
`;
if (missing.length) {
  throw new Error(`Unknown title ids: ${missing.map((row) => row.id).join(", ")}. Import the catalog first.`);
}

for (const show of shows) {
  const startsAt = istStart(show.inDays, show.hour);
  await sql`
    INSERT INTO screenings (id, title_id, starts_at, ends_at, location, capacity, price_minor, sales_open_at, sales_close_at)
    VALUES (${show.id}, ${show.titleId}, ${startsAt}, ${endsAt(startsAt, show.minutes)}, ${show.location},
      ${show.capacity}, ${show.priceMinor}, now() - interval '1 hour', ${startsAt})
    ON CONFLICT (id) DO UPDATE SET
      title_id = EXCLUDED.title_id,
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      location = EXCLUDED.location,
      capacity = EXCLUDED.capacity,
      price_minor = EXCLUDED.price_minor,
      sales_open_at = EXCLUDED.sales_open_at,
      sales_close_at = EXCLUDED.sales_close_at,
      cancelled = false
  `;
}

const summary = await sql`
  SELECT s.title_id AS "titleId", t.title, s.starts_at AS "startsAt", s.location,
    s.capacity, s.price_minor AS "priceMinor", s.sold_count AS "soldCount", s.held_count AS "heldCount"
  FROM customer_screenings s JOIN catalog_titles t ON t.id = s.title_id
  WHERE s.id = ANY(${shows.map((show) => show.id)})
  ORDER BY s.starts_at
`;
for (const row of summary) {
  const seats = row.capacity - Number(row.soldCount) - Number(row.heldCount);
  console.log(
    `${row.startsAt.toISOString()}  ${row.title}  ·  ${row.location}  ·  ₹${(row.priceMinor / 100).toFixed(2)}  ·  ${seats}/${row.capacity} seats`,
  );
}
console.log(`\n${summary.length} screenings published and on sale.`);
