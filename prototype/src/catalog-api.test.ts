import { describe, expect, it } from "vitest";
import { screeningIsBookable, sortCatalog, type CatalogTitle, type Screening } from "./catalog-api";

const showing: Screening = {
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
};

const title = (id: string, watchOrder: number): CatalogTitle => ({
  id,
  titleType: "film",
  title: id,
  synopsis: "",
  releaseYear: null,
  posterUrl: null,
  active: false,
  watchOrder,
});

describe("catalog ordering", () => {
  it("sorts films and series together by the administrator's global watch order", () => {
    expect(sortCatalog([title("third", 3), title("first", 1), title("second", 2)]).map((item) => item.id))
      .toEqual(["first", "second", "third"]);
  });

  it("does not mutate the loaded catalog list", () => {
    const source = [title("later", 2), title("earlier", 1)];
    sortCatalog(source);
    expect(source.map((item) => item.id)).toEqual(["later", "earlier"]);
  });
});

describe("screening availability", () => {
  it("allows an active, open screening with remaining capacity", () => {
    expect(screeningIsBookable(showing, Date.parse("2026-10-15T12:00:00.000Z"))).toBe(true);
  });

  it("does not allow booking while a title is inactive", () => {
    expect(screeningIsBookable({ ...showing, titleActive: false }, Date.parse("2026-10-15T12:00:00.000Z"))).toBe(false);
  });

  it("does not allow cancelled or sold-out screenings", () => {
    expect(screeningIsBookable({ ...showing, cancelled: true }, Date.parse("2026-10-15T12:00:00.000Z"))).toBe(false);
    expect(screeningIsBookable({ ...showing, soldCount: 90, heldCount: 10 }, Date.parse("2026-10-15T12:00:00.000Z"))).toBe(false);
  });

  it("opens inclusively and closes exclusively at the configured sales boundaries", () => {
    const opensAt = Date.parse(showing.salesOpenAt!);
    const closesAt = Date.parse(showing.startsAt);
    expect(screeningIsBookable(showing, opensAt)).toBe(true);
    expect(screeningIsBookable(showing, closesAt - 1)).toBe(true);
    expect(screeningIsBookable(showing, closesAt)).toBe(false);
  });

  it("stops sales before showtime even if a later closing time is configured", () => {
    expect(screeningIsBookable({
      ...showing,
      salesCloseAt: "2026-11-01T19:00:00.000Z",
    }, Date.parse(showing.startsAt))).toBe(false);
  });
});
