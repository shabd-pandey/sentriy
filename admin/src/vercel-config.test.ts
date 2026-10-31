import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vercel is not Next.js here: `api/[...path].js` matches one segment only, so
// multi-segment routes such as /api/admin/bookings and
// /api/admin/bookings/:id/confirm 404 at the edge unless vercel.json rewrites
// them onto the bundle. This guards the deployed admin API.
interface VercelConfig {
  rewrites?: { source: string; destination: string }[];
}

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as VercelConfig;

describe("Vercel routing config", () => {
  it("rewrites /api/* onto the generated function bundle", () => {
    const rewrite = config.rewrites?.find((entry) => entry.source === "/api/(.*)");
    expect(rewrite?.destination).toContain("/api/[...path]");
  });
});
