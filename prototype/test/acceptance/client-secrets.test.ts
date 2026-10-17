import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Server credentials must never reach the browser bundle. This is a guard, not
// a behaviour test: it fails the moment a source file under prototype/src/
// (which Vite bundles into the customer app) references a server-only secret.
const SRC_DIR = fileURLToPath(new URL("../../src/", import.meta.url));

const FORBIDDEN = ["DATABASE_URL", "OBJECT_STORAGE_SECRET_ACCESS_KEY", "CLERK_JWKS_URL", "RAZORPAY_KEY_SECRET"];

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? listFiles(join(directory, entry.name)) : Promise.resolve([join(directory, entry.name)]),
    ),
  );
  return files.flat();
}

describe("browser bundle secrets", () => {
  it("no browser-side file under prototype/src references server credentials", async () => {
    const files = await listFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const contents = await readFile(file, "utf8");
      for (const secret of FORBIDDEN) {
        if (contents.includes(secret)) offenders.push(`${file}: ${secret}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
