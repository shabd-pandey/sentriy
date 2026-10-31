// Upload the shipped poster artwork to object storage and link it to the
// catalog rows. The catalog API only returns a `posterUrl` when
// `catalog_titles.poster_key` is set, so artwork that sits unused in
// `public/` renders as letter tiles in the UI.
//
// Usage (from `prototype/` or the standalone repo root):
//   node scripts/upload-posters.mjs --dry-run
//   node scripts/upload-posters.mjs
//
// Credentials come from `PROCESS env`, then `.dev.vars`, then `.env.local`
// (this project first, then its parent). Nothing is written to tracked files.
import { readFileSync, existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { neon } from "@neondatabase/serverless";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(scripts, "..");
const dryRun = process.argv.includes("--dry-run");

const env = { ...process.env };
for (const candidate of [
  path.join(project, ".dev.vars"),
  path.join(project, ".env.local"),
  path.join(project, ".env"),
  path.resolve(project, "..", ".env.local"),
  path.resolve(project, "..", ".env"),
]) {
  if (!existsSync(candidate)) continue;
  for (const line of readFileSync(candidate, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || line.trim().startsWith("#")) continue;
    const [, key, raw] = match;
    if (env[key] === undefined) env[key] = raw.trim().replace(/^["']|["']$/g, "");
  }
}

const databaseUrl = env.DATABASE_URL;
const endpoint = env.OBJECT_STORAGE_ENDPOINT ?? env.AWS_ENDPOINT_URL_S3;
const region = env.OBJECT_STORAGE_REGION ?? env.AWS_REGION;
const bucket = env.OBJECT_STORAGE_BUCKET;
const accessKeyId = env.OBJECT_STORAGE_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID;
const secretAccessKey = env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY;

const missing = Object.entries({ databaseUrl, endpoint, region, bucket, accessKeyId, secretAccessKey })
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length) {
  console.error(`upload-posters: missing ${missing.join(", ")}`);
  process.exit(1);
}

// Portrait artwork is preferred; the flat `posters/` folder holds a subset.
const sourceDirs = [
  path.join(project, "public", "data", "streak-collection", "posters"),
  path.join(project, "public", "data", "posters"),
].filter((dir) => existsSync(dir));

const files = [];
for (const dir of sourceDirs) {
  for (const name of await readdir(dir)) {
    if (!/\.(jpg|jpeg|png|webp)$/i.test(name)) continue;
    const id = name.replace(/\.[^.]+$/, "");
    if (files.some((file) => file.id === id)) continue;
    files.push({ id, path: path.join(dir, name) });
  }
}
if (!files.length) {
  console.error("upload-posters: no poster images found under public/data");
  process.exit(1);
}

const contentTypes = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const storage = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

console.log(`upload-posters: ${files.length} artwork file(s) -> s3://${bucket}/artwork/`);

let uploaded = 0;
const failures = [];
const queue = [...files];
const workers = Array.from({ length: 6 }, async () => {
  for (;;) {
    const file = queue.shift();
    if (!file) return;
    const extension = file.path.split(".").pop().toLowerCase();
    const key = `artwork/${file.id}.${extension}`;
    if (dryRun) {
      console.log(`  would upload ${path.basename(file.path)} -> ${key}`);
      uploaded += 1;
      continue;
    }
    try {
      await storage.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: await readFile(file.path),
        ContentType: contentTypes[extension] ?? "application/octet-stream",
        CacheControl: "public, max-age=31536000, immutable",
      }));
      uploaded += 1;
    } catch (error) {
      failures.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});
await Promise.all(workers);

if (failures.length) {
  console.error(`upload-posters: ${failures.length} upload(s) failed`);
  for (const failure of failures.slice(0, 10)) console.error(`  ${failure}`);
  process.exit(1);
}

if (dryRun) {
  console.log("upload-posters: dry run, database untouched");
  process.exit(0);
}

const sql = neon(databaseUrl);
let linked = 0;
for (const file of files) {
  const key = `artwork/${file.id}.${file.path.split(".").pop().toLowerCase()}`;
  const rows = await sql`
    UPDATE catalog_titles
       SET poster_key = ${key}, updated_at = now()
     WHERE id = ${file.id}
       AND poster_key IS DISTINCT FROM ${key}
    RETURNING id
  `;
  linked += rows.length;
}

const [{ total, withPoster }] = await sql`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE poster_key IS NOT NULL)::int AS "withPoster"
    FROM catalog_titles
`;

console.log(`upload-posters: uploaded ${uploaded}, newly linked ${linked}`);
console.log(`upload-posters: catalog rows ${total}, with poster_key ${withPoster}`);
