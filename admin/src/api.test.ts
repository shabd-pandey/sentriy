import { describe, expect, it } from "vitest";
import {
  money,
  remainingCapacity,
  screeningStatus,
  sortCatalog,
  type CatalogTitle,
  type Screening,
} from "./api";

const title = (id: string, watchOrder: number, active = true): CatalogTitle => ({
  id,
  titleType: "film",
  title: id,
  synopsis: "",
  releaseYear: null,
  posterUrl: null,
  posterKey: null,
  active,
  watchOrder,
  seasons: [],
});

const screening = (overrides: Partial<Screening> = {}): Screening => ({
  id: "show-1",
  titleId: "film-1",
  title: "Sample film",
  titleType: "film",
  titleActive: true,
  startsAt: "2026-11-01T18:00:00.000Z",
  endsAt: "2026-11-01T20:00:00.000Z",
  location: "Hall 1",
  capacity: 100,
  priceMinor: 50000,
  salesOpenAt: "2026-10-01T00:00:00.000Z",
  salesCloseAt: null,
  cancelled: false,
  seasonNumber: null,
  episodeStart: null,
  episodeEnd: null,
  soldCount: 20,
  heldCount: 5,
  ...overrides,
});

describe("sortCatalog", () => {
  it("sorts films and series together by the administrator's global watch order", () => {
    expect(
      sortCatalog([title("third", 3), title("first", 1), title("second", 2)]).map((item) => item.id),
    ).toEqual(["first", "second", "third"]);
  });

  it("does not mutate the loaded catalog list", () => {
    const source = [title("later", 2), title("earlier", 1)];
    sortCatalog(source);
    expect(source.map((item) => item.id)).toEqual(["later", "earlier"]);
  });
});

describe("screeningStatus", () => {
  const openAt = Date.parse("2026-10-15T12:00:00.000Z");

  it("reports on-sale for an active, open screening with remaining capacity", () => {
    expect(screeningStatus(screening(), openAt)).toBe("on-sale");
  });

  it("reports cancelled before any other state", () => {
    expect(screeningStatus(screening({ cancelled: true }), openAt)).toBe("cancelled");
  });

  it("reports upcoming-title while the title is inactive", () => {
    expect(screeningStatus(screening({ titleActive: false }), openAt)).toBe("upcoming-title");
  });

  it("reports started once showtime passes, even inside the sales window", () => {
    expect(screeningStatus(screening(), Date.parse("2026-11-01T18:00:00.000Z"))).toBe("started");
  });

  it("opens inclusively at sales-open and closes exclusively at sales-close", () => {
    const opensAt = Date.parse(screening().salesOpenAt!);
    const closesAt = Date.parse(screening().startsAt);
    expect(screeningStatus(screening(), opensAt)).toBe("on-sale");
    expect(screeningStatus(screening(), closesAt - 1)).toBe("on-sale");
    expect(screeningStatus(screening(), closesAt)).toBe("started");
  });

  it("defaults an unset sales window to open-on-publication, close-at-showtime", () => {
    const noWindow = screening({ salesOpenAt: null, salesCloseAt: null });
    expect(screeningStatus(noWindow, Date.parse("2026-10-15T12:00:00.000Z"))).toBe("on-sale");
  });
});

describe("remainingCapacity", () => {
  it("subtracts sold and held inventory from capacity", () => {
    expect(remainingCapacity(screening())).toBe(75);
  });

  it("floors at zero when oversubscribed", () => {
    expect(remainingCapacity(screening({ soldCount: 90, heldCount: 20 }))).toBe(0);
  });
});

describe("money", () => {
  it("formats minor units as whole-rupee INR", () => {
    expect(money(50000)).toContain("500");
  });
});
