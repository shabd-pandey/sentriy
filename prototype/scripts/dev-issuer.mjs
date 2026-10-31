#!/usr/bin/env node
// Points the local worker at the dev identity provider served by Vite.
//
// The worker verifies JWTs by fetching a JWKS URL, and workerd refuses to fetch
// loopback addresses, so `http://127.0.0.1:5173/__dev/jwks.json` fails with
// "Network connection lost" even though the URL is correct. This rewrites the
// JWKS entry to the machine's LAN address (Vite must listen on it, which
// `npm run dev` does) and leaves the issuer alone: the browser mints and sends
// tokens for http://127.0.0.1:5173/__dev.
//
//   node scripts/dev-issuer.mjs           # re-sync after a network change
//   node scripts/dev-issuer.mjs --check   # report drift without writing
import { readFile, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const varsPath = join(here, "..", ".dev.vars");
const ISSUER = "http://127.0.0.1:5173/__dev";

function lanAddress() {
  const candidates = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      candidates.push({ address: entry.address, rank: entry.address.startsWith("192.168.") ? 0 : 1 });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.address;
}

const address = lanAddress();
if (!address) {
  console.error("No LAN IPv4 address found. Connect to a network, or point CLERK_JWKS_URL at something the worker can reach.");
  process.exit(1);
}

const jwksUrl = `http://${address}:5173/__dev/jwks.json`;
const block = [
  "# Local-only identity provider served by the Vite dev server (dev/dev-auth.ts).",
  "# The worker verifies a real RS256 token against this JWKS, exactly like Clerk.",
  "# workerd cannot fetch loopback, so the JWKS uses the LAN address while the",
  "# issuer stays on 127.0.0.1. Never set these on a deployment.",
  `CLERK_ISSUER=${ISSUER}`,
  `CLERK_JWKS_URL=${jwksUrl}`,
].join("\n");

const text = await readFile(varsPath, "utf8");
const current = /^CLERK_JWKS_URL=(.+)$/m.exec(text)?.[1]?.trim();
const check = process.argv.includes("--check");
const upToDate = current === jwksUrl;

if (check) {
  console.log(upToDate ? `dev issuer in sync (${jwksUrl})` : `dev issuer drift: have ${current ?? "nothing"}, want ${jwksUrl}`);
  process.exit(upToDate ? 0 : 1);
}

if (upToDate) {
  console.log(`dev issuer already in sync (${jwksUrl})`);
  process.exit(0);
}

const next = /^CLERK_ISSUER=/m.test(text)
  ? text
    .replace(/^CLERK_ISSUER=.*$/m, `CLERK_ISSUER=${ISSUER}`)
    .replace(/^CLERK_JWKS_URL=.*$/m, `CLERK_JWKS_URL=${jwksUrl}`)
  : `${text.replace(/\s*$/, "")}\n\n${block}\n`;

await writeFile(varsPath, next);
console.log(`dev issuer updated: ${jwksUrl}`);
console.log("restart `npm run dev:pages` so the worker picks up the new value.");
