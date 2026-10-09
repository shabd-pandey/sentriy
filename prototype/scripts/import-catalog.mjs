#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const input = argument("--input");
const baseUrl = argument("--url")?.replace(/\/+$/, "");
const token = process.env.CATALOG_ADMIN_TOKEN;
if (!input || !baseUrl || !token) {
  console.error("Usage: CATALOG_ADMIN_TOKEN=<Clerk JWT> node scripts/import-catalog.mjs --input <watchlist.json> --url <deployed-site-url>");
  process.exit(2);
}

const source = JSON.parse(await readFile(input, "utf8"));
if (!Array.isArray(source.movies) || source.movies.length !== 61) {
  throw new Error("Expected the 61-entry watchlist JSON import artifact.");
}
const entries = source.movies.map((movie) => ({
  id: movie.id,
  title: movie.title,
  titleType: movie.type,
  synopsis: movie.description ?? "",
  releaseYear: movie.release_year ?? null,
  watchOrder: movie.suggested_watch_order,
}));
const filmCount = entries.filter((item) => item.titleType === "film").length;
const seriesCount = entries.filter((item) => item.titleType === "series").length;
const orders = new Set(entries.map((item) => item.watchOrder));
if (filmCount !== 57 || seriesCount !== 4 || orders.size !== entries.length) {
  throw new Error("Watchlist must contain 57 films and four series with unique watch_order values.");
}

const response = await fetch(`${baseUrl}/api/admin/catalog/import`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ entries }),
});
if (!response.ok) {
  const message = await response.text();
  throw new Error(`Catalog import failed (${response.status}): ${message}`);
}
const result = await response.json();
console.log(`Imported ${result.imported} catalog titles. They are all inactive and need no unlicensed artwork.`);
