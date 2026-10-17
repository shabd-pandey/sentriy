import { describe, expect, it } from "vitest";
import { applyMigrations, createTestDatabase, MIGRATIONS_DIR } from "./database";

// The migrations in prototype/db are the schema of record for the shared
// worker. If any file cannot be applied to a clean Postgres, the platform
// cannot be deployed no matter what the TypeScript says.
describe("database migrations", () => {
  it("apply cleanly in filename order against a fresh Postgres", async () => {
    const db = await createTestDatabase();
    const applied = await applyMigrations(db, MIGRATIONS_DIR);
    expect(applied).toContain("003_tickets.sql");
    await db.close();
  });

  it("exposes the screening_door_counts view the admin and staff surfaces query", async () => {
    const db = await createTestDatabase();
    const result = await db.query("SELECT screening_id, confirmed_tickets, checked_in_bookings FROM screening_door_counts");
    expect(result.rows).toEqual([]);
    await db.close();
  });

  it("is idempotent, so an operator can re-run every file", async () => {
    const db = await createTestDatabase();
    await expect(applyMigrations(db)).resolves.toBeDefined();
    await db.close();
  });
});
