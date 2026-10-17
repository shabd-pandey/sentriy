// PGlite-backed database helpers for the acceptance harness.
//
// PGlite is Postgres 18.x compiled to WASM and running in-process, so tests
// exercise the real SQL (plpgsql triggers, NULLS NOT DISTINCT indexes,
// pgcrypto functions, transactions) with no server and no credentials.
//
// Migrations are the real files under prototype/db/, applied in filename
// order. Each file is executed on its own: a multi-statement `exec` wraps the
// whole file in one implicit transaction, so one bad statement would roll the
// entire file back and hide the real error behind the first failure.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../db/", import.meta.url));

/** Apply every `*.sql` migration in `directory` (default `prototype/db/`) in filename order. */
export async function applyMigrations(db: PGlite, directory = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(join(directory, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed: ${message}`, { cause: error });
    }
  }
  return files;
}

/** Create an in-memory Postgres database with all migrations applied. */
export async function createTestDatabase(directory = MIGRATIONS_DIR): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await applyMigrations(db, directory);
  return db;
}

/**
 * Empty every table in the public schema (and reset identity columns), giving
 * the next test a logically fresh database without paying for a new WASM boot.
 * Discovering the tables at runtime keeps this working as later tickets add
 * tables.
 */
export async function truncateAllTables(db: PGlite): Promise<void> {
  const result = await db.query<{ tablename: string }>(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'",
  );
  const tables = result.rows.map((row) => `"${row.tablename}"`);
  if (tables.length > 0) {
    await db.exec(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
  }
}
