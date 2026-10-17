import { describe, expect, it } from "vitest";
import { ownerToken, useAcceptanceHarness } from "./harness";

// The worker writes screenings.updated_at on every edit and cancel (see
// functions/api/[[path]].ts), but the column was missing from the schema, so
// screening edits failed at runtime. This exercises the real routes end to end.
describe("screening lifecycle", () => {
  const harness = useAcceptanceHarness();

  async function seedScreening(h: ReturnType<typeof harness>) {
    const admin = await ownerToken();
    const title = await h.call({
      method: "POST",
      path: "/api/admin/catalog",
      token: admin,
      body: { title: "Dune", titleType: "film", watchOrder: 1 },
    });
    expect(title.status).toBe(201);
    const screening = await h.call({
      method: "POST",
      path: "/api/admin/screenings",
      token: admin,
      body: {
        titleId: title.body.id,
        startsAt: "2026-11-01T18:00:00+05:30",
        endsAt: "2026-11-01T21:00:00+05:30",
        location: "Hall A",
        capacity: 100,
        priceMinor: 25000,
      },
    });
    expect(screening.status).toBe(201);
    return { admin, screeningId: screening.body.id as string };
  }

  it("lets an owner edit a screening", async () => {
    const h = harness();
    const { admin, screeningId } = await seedScreening(h);

    const edited = await h.call({
      method: "PUT",
      path: `/api/admin/screenings/${screeningId}`,
      token: admin,
      body: { location: "Hall B", capacity: 120 },
    });

    expect(edited.status).toBe(200);
    const rows = await h.query<{ location: string; capacity: number; updated_at: string }>(
      "SELECT location, capacity, updated_at FROM screenings WHERE id = $1",
      [screeningId],
    );
    expect(rows[0].location).toBe("Hall B");
    expect(rows[0].capacity).toBe(120);
  });

  it("lets an owner cancel a screening", async () => {
    const h = harness();
    const { admin, screeningId } = await seedScreening(h);

    const cancelled = await h.call({
      method: "PUT",
      path: `/api/admin/screenings/${screeningId}`,
      token: admin,
      body: { cancelled: true },
    });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.cancelled).toBe(true);
    const rows = await h.query<{ cancelled: boolean }>("SELECT cancelled FROM screenings WHERE id = $1", [screeningId]);
    expect(rows[0].cancelled).toBe(true);
  });

  it("lets an owner update a screening's sales window", async () => {
    const h = harness();
    const { admin, screeningId } = await seedScreening(h);

    const updated = await h.call({
      method: "PUT",
      path: `/api/admin/screenings/${screeningId}`,
      token: admin,
      body: { salesOpenAt: "2026-10-20T10:00:00+05:30", salesCloseAt: "2026-11-01T17:00:00+05:30" },
    });

    expect(updated.status).toBe(200);
    const rows = await h.query<{ sales_open_at: string | null }>(
      "SELECT sales_open_at FROM screenings WHERE id = $1",
      [screeningId],
    );
    expect(rows[0].sales_open_at).not.toBeNull();
  });
});
