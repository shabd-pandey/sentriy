import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Vercel does not treat `api/[...path].js` as a catch-all on a non-Next project:
// the bracket file matches exactly one segment. `/api/health` works, while
// `/api/admin/bookings` and `/api/staff/validate` 404 at the edge before the
// function is invoked. `vercel.json` must keep rewriting every `/api/...`
// request onto the bundle, or the deployed API silently loses multi-segment
// routes while the local worker tests stay green.
const CONFIG = fileURLToPath(new URL("../../vercel.json", import.meta.url));

interface VercelConfig {
  rewrites?: { source: string; destination: string }[];
  functions?: Record<string, unknown>;
}

describe("Vercel routing config", () => {
  it("rewrites every /api path onto the generated function bundle", async () => {
    const config = JSON.parse(await readFile(CONFIG, "utf8")) as VercelConfig;
    const rewrite = config.rewrites?.find((entry) => entry.source === "/api/(.*)");
    expect(rewrite).toBeDefined();
    expect(rewrite?.destination).toContain("/api/[...path]");
  });

  it("applies the function settings to files directly under api/", async () => {
    const config = JSON.parse(await readFile(CONFIG, "utf8")) as VercelConfig;
    // `api/**/*.js` needs a subdirectory, so it never matched the bundle.
    expect(Object.keys(config.functions ?? {})).toContain("api/*.js");
  });
});
