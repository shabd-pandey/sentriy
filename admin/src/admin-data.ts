import type {
  ActivityCategory,
  ActivityEntry,
  Banner,
  BannerAccent,
  BannerState,
  CampaignCode,
  CampaignEntrant,
  CatalogTitle,
  RewardCampaign,
  Screening,
  Season,
  TitleType,
} from "./api";

export interface AdminSettings {
  profileName: string;
  qrDestination: string | null;
}

export interface AdminSnapshot {
  catalog: CatalogTitle[];
  screenings: Screening[];
  banners: Banner[];
  campaigns: RewardCampaign[];
  codes: Record<string, CampaignCode[]>;
  entrants: Record<string, CampaignEntrant[]>;
  activity: ActivityEntry[];
  settings: AdminSettings;
  source: "demo" | "live";
}

export interface TitleDraft {
  title: string;
  titleType: TitleType;
  synopsis: string;
  releaseYear: number | null;
  active: boolean;
  watchOrder: number;
  posterUrl: string | null;
  posterKey: string | null;
}

export interface ScreeningDraft {
  titleId: string;
  startsAt: string;
  endsAt: string;
  location: string;
  capacity: number;
  priceMinor: number;
  seasonNumber?: number | null;
  episodeStart?: number | null;
  episodeEnd?: number | null;
}

export interface BannerDraft {
  kicker: string;
  title: string;
  copy: string;
  imageUrl: string | null;
  accent: BannerAccent;
  destinationTitleId: string | null;
  destinationScreeningId: string | null;
  state: BannerState;
  publishAt: string | null;
  unpublishAt: string | null;
}

export interface CampaignDraft {
  name: string;
  rewardKind: "coupon" | "discount" | "free-ticket";
  discountPercent?: number;
  freeTicketScreeningId?: string;
  requiredPlays?: number;
  completionWindowDays?: number;
  rewardExpiryDays?: number;
  rewardCap: number;
  instructions?: string;
  allowOverlap?: boolean;
}

export const ADMIN_STATE_KEY = "marvelsyllabus-command-deck-v1";

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function futureDate(days: number, hour = 19, minute = 30) {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function pastDate(days: number, hour = 19, minute = 30) {
  const date = new Date(Date.now() - days * 86_400_000);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

type WatchlistMovie = {
  id: string;
  title: string;
  type: TitleType;
  release_year: number | null;
  universe?: string;
  layer?: number;
  layer_label?: string;
  tier?: string;
  suggested_watch_order: number;
  description: string;
  franchise?: string | null;
};

const previewPosterOverrides: Record<string, string> = {
  "captain-america-the-first-avenger": "/data/posters/captain-america-the-first-avenger.jpg",
  "iron-man": "/data/posters/iron-man.jpg",
  "iron-man-2": "/data/posters/iron-man-2.jpg",
  thor: "/data/posters/thor.jpg",
  "the-avengers": "/data/posters/the-avengers.jpg",
};

function toCatalogTitle(movie: WatchlistMovie): CatalogTitle {
  return {
    id: movie.id,
    titleType: movie.type,
    title: movie.title,
    synopsis: movie.description,
    releaseYear: movie.release_year,
    posterUrl: previewPosterOverrides[movie.id] ?? null,
    posterKey: null,
    active: true,
    watchOrder: movie.suggested_watch_order,
    seasons: [],
  };
}

const seedMovies: WatchlistMovie[] = [
  { id: "captain-america-the-first-avenger", title: "Captain America: The First Avenger", type: "film", release_year: 2011, universe: "MCU", tier: "optional", layer: 4, layer_label: "Deep background", suggested_watch_order: 1, description: "Steve Rogers becomes Captain America in WWII and meets Peggy Carter.", franchise: null },
  { id: "iron-man", title: "Iron Man", type: "film", release_year: 2008, universe: "MCU", tier: "optional", layer: 4, layer_label: "Deep background", suggested_watch_order: 2, description: "Tony Stark builds the Iron Man suit and begins the MCU.", franchise: null },
  { id: "iron-man-2", title: "Iron Man 2", type: "film", release_year: 2010, universe: "MCU", tier: "optional", layer: 4, layer_label: "Deep background", suggested_watch_order: 3, description: "Tony faces Whiplash while S.H.I.E.L.D. watches him.", franchise: null },
  { id: "thor", title: "Thor", type: "film", release_year: 2011, universe: "MCU", tier: "optional", layer: 4, layer_label: "Deep background", suggested_watch_order: 4, description: "Thor is banished to Earth and Loki schemes for the throne.", franchise: null },
  { id: "the-avengers", title: "The Avengers", type: "film", release_year: 2012, universe: "MCU", tier: "optional", layer: 4, layer_label: "Deep background", suggested_watch_order: 5, description: "Earth's heroes unite to stop Loki's invasion.", franchise: null },
  { id: "iron-man-3", title: "Iron Man 3", type: "film", release_year: 2013, universe: "MCU", tier: "optional", layer: 4, layer_label: "Deep background", suggested_watch_order: 6, description: "Tony battles the Mandarin and Extremis while dealing with PTSD.", franchise: null },
  { id: "wandavision", title: "WandaVision", type: "series", release_year: 2021, universe: "MCU", tier: "required", layer: 2, layer_label: "Required watch", suggested_watch_order: 7, description: "Wanda and Vision live a sitcom life that slowly unravels through reality-bending decades.", franchise: null },
  { id: "loki-season-1", title: "Loki · Season 1", type: "series", release_year: 2021, universe: "MCU", tier: "required", layer: 2, layer_label: "Required watch", suggested_watch_order: 8, description: "The God of Mischief is drafted by the TVA to repair a broken timeline.", franchise: null },
];

function seedCatalog(): CatalogTitle[] {
  return seedMovies.map((movie) => {
    const title = toCatalogTitle(movie);
    if (movie.id === "iron-man-3") title.active = false;
    if (movie.id === "wandavision") {
      title.active = true;
      title.seasons = [{ seasonNumber: 1, episodeCount: 9 }];
    }
    if (movie.id === "loki-season-1") {
      title.active = true;
      title.seasons = [{ seasonNumber: 1, episodeCount: 6 }, { seasonNumber: 2, episodeCount: 8 }];
    }
    return title;
  });
}

const screening = (
  id: string,
  catalog: CatalogTitle[],
  titleId: string,
  days: number,
  hour: number,
  location: string,
  capacity: number,
  soldCount: number,
  priceMinor: number,
  options: Partial<Pick<Screening, "cancelled" | "seasonNumber" | "episodeStart" | "episodeEnd" | "salesOpenAt" | "salesCloseAt">> = {},
): Screening => {
  const startsAt = futureDate(days, hour);
  const title = catalog.find((entry) => entry.id === titleId);
  return {
    id,
    titleId,
    title: title?.title ?? titleId,
    titleType: title?.titleType ?? "film",
    titleActive: title?.active ?? false,
    startsAt,
    endsAt: futureDate(days, hour + 2, 0),
    location,
    capacity,
    priceMinor,
    salesOpenAt: new Date().toISOString(),
    salesCloseAt: startsAt,
    cancelled: false,
    seasonNumber: null,
    episodeStart: null,
    episodeEnd: null,
    soldCount,
    heldCount: 0,
    ...options,
  };
};

function seedScreenings(catalog: CatalogTitle[]): Screening[] {
  return [
    screening("showing-captain-friday", catalog, "captain-america-the-first-avenger", 2, 19, "Arc Cinema · Hall 01", 120, 86, 45000),
    screening("showing-iron-sunday", catalog, "iron-man", 4, 16, "Arc Cinema · Hall 01", 120, 42, 40000),
    screening("showing-iron-2-saturday", catalog, "iron-man-2", 3, 20, "Metro Screens · Hall 03", 90, 28, 55000),
    screening("showing-thor-thursday", catalog, "thor", 6, 21, "Arc Cinema · Hall 02", 90, 14, 50000),
    screening("showing-avengers", catalog, "the-avengers", 8, 18, "The Lab · Studio A", 60, 18, 35000),
    screening("showing-iron-3", catalog, "iron-man-3", 10, 20, "Arc Cinema · Hall 01", 120, 0, 60000),
    screening("showing-captain-cancelled", catalog, "captain-america-the-first-avenger", 1, 18, "Arc Cinema · Hall 02", 80, 44, 40000, { cancelled: true, salesOpenAt: pastDate(2) }),
    screening("showing-loki-finale", catalog, "loki-season-1", 12, 19, "The Lab · Studio B", 70, 7, 50000, { seasonNumber: 2, episodeStart: 7, episodeEnd: 8 }),
    screening("showing-wanda", catalog, "wandavision", 14, 21, "Metro Screens · Hall 02", 90, 0, 45000, { seasonNumber: 1, episodeStart: 1, episodeEnd: 3 }),
  ];
}

function seedBanners(): Banner[] {
  return [
    {
      id: "banner-avengers",
      kicker: "FEATURED SCREENING",
      title: "The team assembles for a sold-out crowd.",
      copy: "The Avengers is back this Friday at The Lab. Follow the Doomsday watch order and book early.",
      imageKey: "/data/banners/avengers-endgame.jpg",
      accent: "teal",
      destinationTitleId: "the-avengers",
      destinationScreeningId: null,
      state: "published",
      publishAt: pastDate(3),
      unpublishAt: futureDate(9, 23, 59),
      createdAt: pastDate(5),
    },
    {
      id: "banner-rewards",
      kicker: "PLAY · EARN · RETURN",
      title: "Your next ticket is hiding in the game.",
      copy: "Complete three Temporal Loom rounds and unlock the reward reserved for your account.",
      imageKey: "/data/banners/guardians-of-the-galaxy.jpg",
      accent: "violet",
      destinationTitleId: null,
      destinationScreeningId: null,
      state: "published",
      publishAt: pastDate(1),
      unpublishAt: null,
      createdAt: pastDate(2),
    },
    {
      id: "banner-loki-draft",
      kicker: "SERIES EVENT",
      title: "Loki finale · two-episode night",
      copy: "Draft layout with a two-episode season finale screening at The Lab.",
      imageKey: "/data/banners/loki-season-1.jpg",
      accent: "coral",
      destinationTitleId: "loki-season-1",
      destinationScreeningId: "showing-loki-finale",
      state: "draft",
      publishAt: null,
      unpublishAt: null,
      createdAt: pastDate(0, 10, 12),
    },
  ];
}

function seedCampaigns(): RewardCampaign[] {
  return [
    {
      id: "campaign-loom",
      name: "Temporal Loom · 3 plays",
      status: "active",
      rewardKind: "discount",
      discountPercent: 50,
      freeTicketScreeningId: null,
      freeTicketTitle: null,
      requiredPlays: 3,
      completionWindowDays: 7,
      rewardExpiryDays: 30,
      rewardCap: 50,
      instructions: "A single-use 50% discount applies automatically at checkout.",
      allowOverlap: true,
      createdAt: pastDate(9),
      updatedAt: pastDate(2),
      enrolledCount: 38,
      grantedCount: 12,
      redeemedCount: 7,
      codesAvailable: 0,
      codesReserved: 0,
      codesUsed: 0,
    },
    {
      id: "campaign-titan",
      name: "Free ticket · Skaar teaser nights",
      status: "paused",
      rewardKind: "free-ticket",
      discountPercent: null,
      freeTicketScreeningId: "showing-thor-thursday",
      freeTicketTitle: "Thor",
      requiredPlays: 5,
      completionWindowDays: 10,
      rewardExpiryDays: 14,
      rewardCap: 20,
      instructions: "A complimentary general-admission ticket for the linked screening.",
      allowOverlap: false,
      createdAt: pastDate(12),
      updatedAt: pastDate(4),
      enrolledCount: 9,
      grantedCount: 3,
      redeemedCount: 1,
      codesAvailable: 0,
      codesReserved: 0,
      codesUsed: 0,
    },
    {
      id: "campaign-coupon",
      name: "DWRPAR partner coupons",
      status: "draft",
      rewardKind: "coupon",
      discountPercent: null,
      freeTicketScreeningId: null,
      freeTicketTitle: null,
      requiredPlays: 3,
      completionWindowDays: 7,
      rewardExpiryDays: 30,
      rewardCap: 100,
      instructions: "A manually managed partner coupon-code pool.",
      allowOverlap: true,
      createdAt: pastDate(1, 15, 0),
      updatedAt: pastDate(1, 15, 0),
      enrolledCount: 0,
      grantedCount: 0,
      redeemedCount: 0,
      codesAvailable: 4,
      codesReserved: 1,
      codesUsed: 0,
    },
  ];
}

function seedCodes(): Record<string, CampaignCode[]> {
  return {
    "campaign-coupon": [
      { id: "code-01", code: "MSY-TREAT-7KQ2", instructions: "Redeem on dwrpar.com checkout.", expiresAt: futureDate(21, 23, 59), status: "available", grantedTo: null },
      { id: "code-02", code: "MSY-POP-3N8X", instructions: "Free small popcorn with any ticket.", expiresAt: futureDate(15, 23, 59), status: "available", grantedTo: null },
      { id: "code-03", code: "MSY-DRINK-5W1M", instructions: "Reserved for test account.", expiresAt: futureDate(12, 23, 59), status: "reserved", grantedTo: "user_2PtR7vK1" },
      { id: "code-04", code: "MSY-MAGIC-PASS", instructions: null, expiresAt: null, status: "available", grantedTo: null },
    ],
  };
}

function seedEntrants(): Record<string, CampaignEntrant[]> {
  return {
    "campaign-loom": [
      { enrollmentId: "enroll-01", userId: "user_2PtR7vK1", completedPlays: 3, status: "granted", reservationExpiresAt: futureDate(2, 23, 59), code: null, codeExpiresAt: null, grantStatus: "available", grantTitle: "50% off one ticket", redeemedAt: null },
      { enrollmentId: "enroll-02", userId: "user_8Kc2Mq9A", completedPlays: 2, status: "enrolled", reservationExpiresAt: null, code: null, codeExpiresAt: null, grantStatus: null, grantTitle: null, redeemedAt: null },
      { enrollmentId: "enroll-03", userId: "user_4Tn9Gb3Z", completedPlays: 3, status: "claimed", reservationExpiresAt: futureDate(1, 23, 59), code: null, codeExpiresAt: null, grantStatus: "redeemed", grantTitle: "50% off one ticket", redeemedAt: pastDate(0, 20, 15) },
      { enrollmentId: "enroll-04", userId: "user_1Hs5Nw7C", completedPlays: 0, status: "enrolled", reservationExpiresAt: null, code: null, codeExpiresAt: null, grantStatus: null, grantTitle: null, redeemedAt: null },
      { enrollmentId: "enroll-05", userId: "user_9Qb4Df2Y", completedPlays: 3, status: "expired", reservationExpiresAt: pastDate(3, 23, 59), code: null, codeExpiresAt: null, grantStatus: null, grantTitle: null, redeemedAt: null },
    ],
  };
}

function seedActivity(): ActivityEntry[] {
  const entry = (id: string, occurredAt: string, actorSub: string, category: ActivityCategory, summary: string, extra: Partial<ActivityEntry> = {}): ActivityEntry => ({
    id,
    occurredAt,
    actorSub,
    category,
    summary,
    screeningId: null,
    bannerId: null,
    campaignId: null,
    orderRef: null,
    refLabel: "",
    ...extra,
  });
  return [
    entry("act-01", pastDate(0, 11, 4), "owner@marvelsyllabus.com", "banner", "Created banner — now draft", { bannerId: "banner-loki-draft", refLabel: "Loki finale · two-episode night" }),
    entry("act-02", pastDate(0, 10, 12), "owner@marvelsyllabus.com", "screening", "Scheduled a screening of \"Loki · Season 1\"", { screeningId: "showing-loki-finale", refLabel: "Loki · Season 1" }),
    entry("act-03", pastDate(1, 19, 47), "owner@marvelsyllabus.com", "reward", "Added 4 coupon code(s) to reward campaign campaign-coupon", { campaignId: "campaign-coupon", refLabel: "DWRPAR partner coupons" }),
    entry("act-04", pastDate(1, 16, 20), "owner@marvelsyllabus.com", "catalog", "Reordered the catalog (8 titles)"),
    entry("act-05", pastDate(2, 21, 5), "owner@marvelsyllabus.com", "settings", "Changed the shared profile-card QR destination to https://marvelsyllabus.com/discover"),
    entry("act-06", pastDate(2, 18, 33), "owner@marvelsyllabus.com", "reward", "Updated reward campaign campaign-titan — status paused", { campaignId: "campaign-titan", refLabel: "Free ticket · Skaar teaser nights" }),
    entry("act-07", pastDate(3, 22, 10), "owner@marvelsyllabus.com", "screening", "Cancelled screening showing-captain-cancelled", { screeningId: "showing-captain-cancelled", refLabel: "Captain America: The First Avenger" }),
    entry("act-08", pastDate(3, 15, 42), "owner@marvelsyllabus.com", "artwork", "Uploaded rights-cleared artwork (jpg)"),
    entry("act-09", pastDate(5, 20, 0), "owner@marvelsyllabus.com", "catalog", "Updated catalog title — active for booking", { refLabel: "WandaVision" }),
    entry("act-10", pastDate(6, 12, 30), "owner@marvelsyllabus.com", "banner", "Published banner \"The team assembles for a sold-out crowd.\"", { bannerId: "banner-avengers", refLabel: "The team assembles for a sold-out crowd." }),
    entry("act-11", pastDate(8, 18, 15), "owner@marvelsyllabus.com", "reward", "Created reward campaign \"Temporal Loom · 3 plays\" (discount)", { campaignId: "campaign-loom", refLabel: "Temporal Loom · 3 plays" }),
    entry("act-12", pastDate(11, 9, 0), "owner@marvelsyllabus.com", "catalog", "Created catalog title \"Loki · Season 1\" (series)"),
  ];
}

function buildDemoSnapshot(): AdminSnapshot {
  const catalog = seedCatalog();
  const screenings = seedScreenings(catalog);
  return {
    catalog,
    screenings,
    banners: seedBanners(),
    campaigns: seedCampaigns(),
    codes: seedCodes(),
    entrants: seedEntrants(),
    activity: seedActivity(),
    settings: {
      profileName: "Aarav Mehta",
      qrDestination: "https://marvelsyllabus.com/discover",
    },
    source: "demo",
  };
}

function mergeStored(base: AdminSnapshot): AdminSnapshot {
  try {
    const raw = window.localStorage.getItem(ADMIN_STATE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<AdminSnapshot>;
    return {
      ...base,
      catalog: Array.isArray(saved.catalog) ? saved.catalog : base.catalog,
      screenings: Array.isArray(saved.screenings) ? saved.screenings : base.screenings,
      banners: Array.isArray(saved.banners) ? saved.banners : base.banners,
      campaigns: Array.isArray(saved.campaigns) ? saved.campaigns : base.campaigns,
      codes: saved.codes && typeof saved.codes === "object" ? saved.codes : base.codes,
      entrants: saved.entrants && typeof saved.entrants === "object" ? saved.entrants : base.entrants,
      activity: Array.isArray(saved.activity) ? saved.activity : base.activity,
      settings: { ...base.settings, ...(saved.settings ?? {}) },
      source: "demo",
    };
  } catch {
    return base;
  }
}

export function persistAdminSnapshot(snapshot: AdminSnapshot) {
  try {
    window.localStorage.setItem(ADMIN_STATE_KEY, JSON.stringify({
      catalog: snapshot.catalog,
      screenings: snapshot.screenings,
      banners: snapshot.banners,
      campaigns: snapshot.campaigns,
      codes: snapshot.codes,
      entrants: snapshot.entrants,
      activity: snapshot.activity,
      settings: snapshot.settings,
    }));
  } catch {
    // Storage is an enhancement. The in-memory demo should keep working.
  }
}

export function loadAdminSnapshot(): AdminSnapshot {
  return mergeStored(buildDemoSnapshot());
}

export function resetAdminData(): AdminSnapshot {
  try {
    window.localStorage.removeItem(ADMIN_STATE_KEY);
  } catch {
    // Ignore storage failures.
  }
  return buildDemoSnapshot();
}

export function withActivity(snapshot: AdminSnapshot, meta: {
  category: ActivityCategory;
  summary: string;
  screeningId?: string | null;
  bannerId?: string | null;
  campaignId?: string | null;
  orderRef?: string | null;
  refLabel?: string;
}, patch: Partial<AdminSnapshot> = {}): AdminSnapshot {
  const entry: ActivityEntry = {
    id: newId("act"),
    occurredAt: new Date().toISOString(),
    actorSub: "owner@marvelsyllabus.com",
    category: meta.category,
    summary: meta.summary,
    screeningId: meta.screeningId ?? null,
    bannerId: meta.bannerId ?? null,
    campaignId: meta.campaignId ?? null,
    orderRef: meta.orderRef ?? null,
    refLabel: meta.refLabel ?? "",
  };
  return { ...snapshot, ...patch, activity: [entry, ...snapshot.activity] };
}

export function upsertTitle(snapshot: AdminSnapshot, id: string | null, draft: TitleDraft): AdminSnapshot {
  const entry: CatalogTitle = {
    id: id ?? newId("title"),
    titleType: draft.titleType,
    title: draft.title,
    synopsis: draft.synopsis,
    releaseYear: draft.releaseYear,
    posterUrl: draft.posterUrl,
    posterKey: draft.posterKey,
    active: draft.active,
    watchOrder: draft.watchOrder,
    seasons: [],
  };
  const catalog = id
    ? snapshot.catalog.map((title) => title.id === id ? { ...title, ...entry, seasons: title.seasons ?? [] } : title)
    : [...snapshot.catalog, entry];
  return withActivity(snapshot, {
    category: "catalog",
    summary: id ? `Updated catalog title — ${draft.active ? "active" : "upcoming"} for booking` : `Created catalog title "${draft.title}" (${draft.titleType})`,
    refLabel: draft.title,
  }, { catalog });
}

export const reorderCatalogue = (snapshot: AdminSnapshot, ids: string[]): AdminSnapshot => {
  const orderMap = new Map(ids.map((id, index) => [id, index + 1]));
  const catalog = [...snapshot.catalog].sort((a, b) => (orderMap.get(a.id) ?? a.watchOrder) - (orderMap.get(b.id) ?? b.watchOrder));
  return withActivity(snapshot, { category: "catalog", summary: `Reordered the catalog (${ids.length} titles)` }, { catalog });
};

export const saveSeasonsFor = (snapshot: AdminSnapshot, titleId: string, seasons: Season[]): AdminSnapshot => {
  const catalog = snapshot.catalog.map((title) => title.id === titleId ? { ...title, seasons } : title);
  return withActivity(snapshot, {
    category: "catalog",
    summary: `Saved ${seasons.length} season episode counts for series ${titleId}`,
    refLabel: snapshot.catalog.find((title) => title.id === titleId)?.title,
  }, { catalog });
};

export function addScreening(snapshot: AdminSnapshot, draft: ScreeningDraft): AdminSnapshot {
  const title = snapshot.catalog.find((entry) => entry.id === draft.titleId);
  const entry: Screening = {
    id: newId("showing"),
    titleId: draft.titleId,
    title: title?.title ?? draft.titleId,
    titleType: title?.titleType ?? "film",
    titleActive: title?.active ?? false,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    location: draft.location,
    capacity: draft.capacity,
    priceMinor: draft.priceMinor,
    salesOpenAt: new Date().toISOString(),
    salesCloseAt: draft.startsAt,
    cancelled: false,
    seasonNumber: draft.seasonNumber ?? null,
    episodeStart: draft.episodeStart ?? null,
    episodeEnd: draft.episodeEnd ?? null,
    soldCount: 0,
    heldCount: 0,
  };
  return withActivity(snapshot, {
    category: "screening",
    summary: `Scheduled a screening of "${entry.title}"`,
    screeningId: entry.id,
    refLabel: entry.title,
  }, { screenings: [...snapshot.screenings, entry] });
}

export function toggleScreeningCancelled(snapshot: AdminSnapshot, id: string, cancelled: boolean): AdminSnapshot {
  const screenings = snapshot.screenings.map((item) => item.id === id ? { ...item, cancelled } : item);
  const screening = snapshot.screenings.find((item) => item.id === id);
  return withActivity(snapshot, {
    category: "screening",
    summary: cancelled ? `Cancelled screening ${id}` : `Reopened cancelled screening ${id}`,
    screeningId: id,
    refLabel: screening?.title,
  }, { screenings });
}

export function upsertBanner(snapshot: AdminSnapshot, id: string | null, draft: BannerDraft): AdminSnapshot {
  const existing = id ? snapshot.banners.find((item) => item.id === id) : undefined;
  const banner: Banner = {
    id: id ?? newId("banner"),
    kicker: draft.kicker,
    title: draft.title,
    copy: draft.copy,
    imageKey: draft.imageUrl,
    accent: draft.accent,
    destinationTitleId: draft.destinationTitleId ?? null,
    destinationScreeningId: draft.destinationScreeningId ?? null,
    state: draft.state,
    publishAt: draft.publishAt ?? null,
    unpublishAt: draft.unpublishAt ?? null,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  const banners = id
    ? snapshot.banners.map((item) => item.id === id ? { ...item, ...banner } : item)
    : [...snapshot.banners, banner];
  return withActivity(snapshot, {
    category: "banner",
    summary: id ? `Updated banner — now ${banner.state}` : `Created banner — now ${banner.state}`,
    bannerId: banner.id,
    refLabel: banner.title,
  }, { banners });
}

export const deleteBanner = (snapshot: AdminSnapshot, id: string): AdminSnapshot =>
  withActivity(snapshot, {
    category: "banner",
    summary: "Deleted banner",
    bannerId: id,
    refLabel: snapshot.banners.find((item) => item.id === id)?.title,
  }, { banners: snapshot.banners.filter((item) => item.id !== id) });

export function upsertCampaign(snapshot: AdminSnapshot, id: string | null, draft: CampaignDraft): AdminSnapshot {
  const now = new Date().toISOString();
  const baseCodes = id ? snapshot.codes[id] ?? [] : [];
  const campaign: RewardCampaign = {
    id: id ?? newId("campaign"),
    name: draft.name,
    status: "draft",
    rewardKind: draft.rewardKind,
    discountPercent: draft.rewardKind === "discount" ? draft.discountPercent ?? 50 : null,
    freeTicketScreeningId: draft.rewardKind === "free-ticket" ? draft.freeTicketScreeningId ?? null : null,
    freeTicketTitle: draft.rewardKind === "free-ticket"
      ? snapshot.screenings.find((item) => item.id === draft.freeTicketScreeningId)?.title ?? null
      : null,
    requiredPlays: draft.requiredPlays ?? 3,
    completionWindowDays: draft.completionWindowDays ?? 7,
    rewardExpiryDays: draft.rewardExpiryDays ?? 30,
    rewardCap: draft.rewardCap,
    instructions: draft.instructions ?? "",
    allowOverlap: draft.allowOverlap !== false,
    createdAt: now,
    updatedAt: now,
    enrolledCount: 0,
    grantedCount: 0,
    redeemedCount: 0,
    codesAvailable: baseCodes.filter((code) => code.status === "available").length,
    codesReserved: baseCodes.filter((code) => code.status === "reserved").length,
    codesUsed: baseCodes.filter((code) => code.status === "used").length,
  };
  const campaigns = id
    ? snapshot.campaigns.map((item) => item.id === id ? { ...item, ...campaign, updatedAt: now } : item)
    : [...snapshot.campaigns, campaign];
  return withActivity(snapshot, {
    category: "reward",
    summary: id ? `Updated reward campaign ${id} — status ${campaign.status}` : `Created reward campaign "${campaign.name}" (${campaign.rewardKind})`,
    campaignId: campaign.id,
    refLabel: campaign.name,
  }, { campaigns, ...(id ? {} : { codes: { ...snapshot.codes, [campaign.id]: [] }, entrants: { ...snapshot.entrants, [campaign.id]: [] } }) });
}

export function setCampaignStatus(snapshot: AdminSnapshot, id: string, status: RewardCampaign["status"]): AdminSnapshot {
  const campaigns = snapshot.campaigns.map((item) => item.id === id
    ? { ...item, status, updatedAt: new Date().toISOString() }
    : status === "active" && item.status === "active" ? { ...item, status: "paused" as const, updatedAt: new Date().toISOString() } : item);
  return withActivity(snapshot, {
    category: "reward",
    summary: `Updated reward campaign ${id} — status ${status}`,
    campaignId: id,
    refLabel: snapshot.campaigns.find((item) => item.id === id)?.name,
  }, { campaigns });
}

export function addCampaignCodes(snapshot: AdminSnapshot, campaignId: string, codes: string[], instructions?: string, expiresAt?: string | null): AdminSnapshot {
  const now = new Date().toISOString();
  const existing = snapshot.codes[campaignId] ?? [];
  const map = new Map(existing.map((code) => [code.code, code]));
  for (const raw of codes) {
    const code = raw.trim();
    if (!code || map.has(code)) continue;
    map.set(code, {
      id: newId("code"),
      code,
      instructions: instructions?.trim() ? instructions.trim() : null,
      expiresAt: expiresAt || null,
      status: "available",
      grantedTo: null,
    });
  }
  const nextCodes = [...map.values()];
  const counts = {
    codesAvailable: nextCodes.filter((code) => code.status === "available").length,
    codesReserved: nextCodes.filter((code) => code.status === "reserved").length,
    codesUsed: nextCodes.filter((code) => code.status === "used").length,
  };
  const campaigns = snapshot.campaigns.map((item) => item.id === campaignId ? { ...item, ...counts, updatedAt: now } : item);
  return withActivity(snapshot, {
    category: "reward",
    summary: `Added ${codes.filter((code) => code.trim()).length} coupon code(s) to reward campaign ${campaignId}`,
    campaignId,
    refLabel: snapshot.campaigns.find((item) => item.id === campaignId)?.name,
  }, { codes: { ...snapshot.codes, [campaignId]: nextCodes }, campaigns });
}

export function deleteCampaignCode(snapshot: AdminSnapshot, campaignId: string, codeId: string): AdminSnapshot {
  const nextCodes = (snapshot.codes[campaignId] ?? []).filter((code) => code.id !== codeId);
  return withActivity(snapshot, {
    category: "reward",
    summary: `Removed unused coupon code from reward campaign ${campaignId}`,
    campaignId,
    refLabel: snapshot.campaigns.find((item) => item.id === campaignId)?.name,
  }, { codes: { ...snapshot.codes, [campaignId]: nextCodes } });
}

export function saveSettings(snapshot: AdminSnapshot, settings: AdminSettings): AdminSnapshot {
  return withActivity(snapshot, {
    category: "settings",
    summary: `Changed the shared profile-card QR destination to ${settings.qrDestination ?? "none"}`,
  }, { settings });
}