import { describe, expect, it } from "vitest";
import {
  addCampaignCodes,
  loadAdminSnapshot,
  reorderCatalogue,
  setCampaignStatus,
  upsertBanner,
  upsertTitle,
} from "./admin-data";

describe("upsertTitle", () => {
  it("creates a title and records catalog activity", () => {
    const base = loadAdminSnapshot();
    const before = base.activity.length;
    const next = upsertTitle(base, null, {
      title: "New Film",
      titleType: "film",
      synopsis: "A new story.",
      releaseYear: 2026,
      active: false,
      watchOrder: 99,
      posterUrl: null,
      posterKey: null,
    });
    expect(next.catalog.length).toBe(base.catalog.length + 1);
    expect(next.activity.length).toBe(before + 1);
    expect(next.activity[0].category).toBe("catalog");
  });

  it("preserves series seasons when editing a series title", () => {
    const base = loadAdminSnapshot();
    const series = base.catalog.find((entry) => entry.titleType === "series");
    expect(series).toBeDefined();
    const next = upsertTitle(base, series!.id, {
      title: series!.title,
      titleType: "series",
      synopsis: series!.synopsis,
      releaseYear: series!.releaseYear,
      active: series!.active,
      watchOrder: series!.watchOrder,
      posterUrl: series!.posterUrl,
      posterKey: series!.posterKey,
    });
    expect(next.catalog.find((entry) => entry.id === series!.id)?.seasons.length).toBeGreaterThan(0);
  });
});

describe("reorderCatalogue", () => {
  it("reorders the catalog to match the given id sequence", () => {
    const base = loadAdminSnapshot();
    const reversed = [...base.catalog].reverse().map((entry) => entry.id);
    const next = reorderCatalogue(base, reversed);
    expect(next.catalog.map((entry) => entry.id)).toEqual(reversed);
  });
});

describe("setCampaignStatus", () => {
  it("keeps exactly one active campaign by pausing the previous one", () => {
    const base = loadAdminSnapshot();
    const draft = base.campaigns.find((item) => item.status === "draft");
    const active = base.campaigns.find((item) => item.status === "active");
    expect(draft).toBeDefined();
    expect(active).toBeDefined();
    const next = setCampaignStatus(base, draft!.id, "active");
    expect(next.campaigns.filter((item) => item.status === "active").map((item) => item.id)).toEqual([
      draft!.id,
    ]);
  });
});

describe("addCampaignCodes", () => {
  it("ignores duplicate codes and records reward activity", () => {
    const base = loadAdminSnapshot();
    const campaignId = "campaign-coupon";
    const before = (base.codes[campaignId] ?? []).length;
    const next = addCampaignCodes(base, campaignId, ["MSY-TREAT-7KQ2", "  ", "MSY-NEW-0001"]);
    expect((next.codes[campaignId] ?? []).length).toBe(before + 1);
    expect(next.activity[0].category).toBe("reward");
  });
});

describe("upsertBanner", () => {
  it("preserves the original creation time when editing a banner", () => {
    const base = loadAdminSnapshot();
    const banner = base.banners[0];
    const next = upsertBanner(base, banner.id, {
      kicker: banner.kicker,
      title: "Edited title",
      copy: banner.copy,
      imageUrl: banner.imageKey,
      accent: banner.accent,
      destinationTitleId: banner.destinationTitleId,
      destinationScreeningId: banner.destinationScreeningId,
      state: banner.state,
      publishAt: banner.publishAt,
      unpublishAt: banner.unpublishAt,
    });
    expect(next.banners.find((item) => item.id === banner.id)?.createdAt).toBe(banner.createdAt);
  });
});

describe("demo seed integrity", () => {
  it("never attaches an episode range to a film screening", () => {
    const base = loadAdminSnapshot();
    for (const showing of base.screenings) {
      if (showing.titleType === "film") {
        expect(showing.seasonNumber).toBeNull();
        expect(showing.episodeStart).toBeNull();
        expect(showing.episodeEnd).toBeNull();
      }
    }
  });
});
