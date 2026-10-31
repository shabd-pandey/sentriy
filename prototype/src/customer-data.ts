import {
  apiRequest,
  loadAccount,
  loadBanners,
  loadCatalog,
  loadProfileQr,
  loadProgress,
  loadRewards,
  loadScreenings,
  loadWallet,
  saveAccount,
  type CatalogTitle,
  type RewardCampaign,
  type RewardGrant,
  type Screening,
  type TitleType,
  type WalletBooking,
  type WatchedItem,
} from "./catalog-api";

export type { RewardCampaign, RewardGrant, RewardKind, RewardStatus } from "./catalog-api";

export interface Banner {
  id: string;
  kicker: string;
  title: string;
  copy: string;
  imageUrl: string;
  accent: "violet" | "coral" | "teal";
  destinationTitleId?: string;
}

export interface TicketBooking {
  id: string;
  orderCode: string;
  screeningId: string;
  titleId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  quantity: number;
  amountMinor: number;
  discountMinor?: number;
  status: "confirmed" | "payment_pending" | "refunded" | "cancelled";
  ticketStatus: "valid" | "used" | "invalid";
  qrValue: string;
  createdAt: string;
  refundStatus?: "pending" | "confirmed" | "failed";
}

export interface CustomerNotification {
  id: string;
  kind: "screening" | "reward" | "account";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface CustomerSettings {
  displayName: string;
  shareWatched: boolean;
  shareStreak: boolean;
  productUpdates: boolean;
  reminderNotifications: boolean;
  qrDestination: string | null;
}

export interface CustomerSnapshot {
  catalog: CatalogTitle[];
  screenings: Screening[];
  progress: WatchedItem[];
  banners: Banner[];
  bookings: TicketBooking[];
  rewards: RewardGrant[];
  campaign: RewardCampaign;
  notifications: CustomerNotification[];
  settings: CustomerSettings;
  /**
   * `api` is the only source of truth for a real account. `demo` is the
   * development fallback used when the local worker is not running, and
   * `unavailable` is a production API failure - never invented data.
   */
  source: "api" | "demo" | "unavailable";
  issues?: string[];
}

function futureDate(days: number, hour = 19, minute = 30) {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function pastDate(days: number, hour = 19, minute = 30) {
  const date = new Date(Date.now() - days * 86_400_000);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

// Five poster files ship with the app and are used only when the catalog row
// has no managed artwork. They are presentation assets, not catalog data.
const posterOverrides: Record<string, string> = {
  "captain-america-the-first-avenger": "/data/posters/captain-america-the-first-avenger.jpg",
  "iron-man": "/data/posters/iron-man.jpg",
  "iron-man-2": "/data/posters/iron-man-2.jpg",
  thor: "/data/posters/thor.jpg",
  "the-avengers": "/data/posters/the-avengers.jpg",
};

type WatchlistMovie = {
  id: string;
  title: string;
  type: TitleType;
  release_year: number | null;
  directors?: string;
  creators?: string;
  universe?: string;
  layer?: number;
  layer_label?: string;
  tier?: string;
  suggested_watch_order: number;
  description: string;
  doomsday_connection?: string;
  doomsday_confirmed_characters?: string[];
  images?: { poster_url?: string | null; banner_url?: string | null };
  tmdb_lookup?: { query: string; year: number; media_type: "movie" | "tv"; tmdb_id?: number };
  franchise?: string | null;
};

type WatchlistPayload = { movies: WatchlistMovie[] };

function toCatalogTitle(movie: WatchlistMovie): CatalogTitle {
  const posterUrl = movie.images?.poster_url ?? posterOverrides[movie.id] ?? null;
  return {
    id: movie.id,
    titleType: movie.type,
    title: movie.title,
    synopsis: movie.description,
    releaseYear: movie.release_year,
    posterUrl,
    bannerUrl: movie.images?.banner_url ?? posterUrl,
    posterKey: null,
    active: true,
    watchOrder: movie.suggested_watch_order,
    directors: movie.directors ?? null,
    creators: movie.creators ?? null,
    universe: movie.universe ?? null,
    layer: movie.layer ?? null,
    layerLabel: movie.layer_label ?? null,
    tier: movie.tier ?? null,
    doomsdayConnection: movie.doomsday_connection ?? null,
    confirmedCharacters: movie.doomsday_confirmed_characters ?? [],
    franchise: movie.franchise ?? null,
    tmdbLookup: movie.tmdb_lookup ? { query: movie.tmdb_lookup.query, year: movie.tmdb_lookup.year, mediaType: movie.tmdb_lookup.media_type, tmdbId: movie.tmdb_lookup.tmdb_id } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Development preview
// ---------------------------------------------------------------------------
// `npm run dev` without `npm run dev:pages` has no API. These fixtures keep the
// design reviewable, but they are compiled into the production bundle only as
// dead code and are never used when the API answers. The UI labels them.

const fallbackCatalog: CatalogTitle[] = [
  { id: "captain-america-the-first-avenger", titleType: "film", title: "Captain America: The First Avenger", synopsis: "Steve Rogers becomes Captain America in WWII and meets Peggy Carter.", releaseYear: 2011, posterUrl: null, posterKey: null, active: true, watchOrder: 1, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
  { id: "iron-man", titleType: "film", title: "Iron Man", synopsis: "Tony Stark builds the Iron Man suit and begins the MCU.", releaseYear: 2008, posterUrl: null, posterKey: null, active: true, watchOrder: 2, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
  { id: "iron-man-2", titleType: "film", title: "Iron Man 2", synopsis: "Tony faces Whiplash while S.H.I.E.L.D. watches him.", releaseYear: 2010, posterUrl: null, posterKey: null, active: true, watchOrder: 3, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
  { id: "thor", titleType: "film", title: "Thor", synopsis: "Thor is banished to Earth and Loki schemes for the throne.", releaseYear: 2011, posterUrl: null, posterKey: null, active: true, watchOrder: 4, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
  { id: "the-avengers", titleType: "film", title: "The Avengers", synopsis: "Earth's heroes unite to stop Loki's invasion.", releaseYear: 2012, posterUrl: null, posterKey: null, active: true, watchOrder: 5, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
  { id: "iron-man-3", titleType: "film", title: "Iron Man 3", synopsis: "Tony battles the Mandarin and Extremis while dealing with PTSD.", releaseYear: 2013, posterUrl: null, posterKey: null, active: true, watchOrder: 6, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
];

async function loadLocalWatchlistCatalog() {
  const response = await fetch("/data/streak-collection/metadata.json", { cache: "no-store" });
  if (!response.ok) throw new Error("watchlist_unavailable");
  const payload = await response.json() as WatchlistPayload;
  if (!Array.isArray(payload.movies) || payload.movies.length === 0) throw new Error("watchlist_invalid");
  return payload.movies.map(toCatalogTitle);
}

function buildDemoScreenings(catalog: CatalogTitle[]): Screening[] {
  const screening = (
    id: string,
    titleId: string,
    days: number,
    hour: number,
    location: string,
    capacity: number,
    soldCount: number,
    priceMinor: number,
  ): Screening => {
    const startsAt = futureDate(days, hour);
    const endsAt = futureDate(days, hour + 2, 0);
    const title = catalog.find((entry) => entry.id === titleId);
    return {
      id, titleId, title: title?.title ?? titleId, titleType: title?.titleType ?? "film",
      titleActive: title?.active ?? false, startsAt, endsAt, location, capacity, priceMinor,
      salesOpenAt: new Date().toISOString(), salesCloseAt: startsAt, cancelled: false,
      seasonNumber: null, episodeStart: null, episodeEnd: null, soldCount, heldCount: 0,
    };
  };
  return [
    screening("showing-captain-friday", "captain-america-the-first-avenger", 2, 19, "Arc Cinema · Hall 01", 120, 86, 45000),
    screening("showing-iron-sunday", "iron-man", 4, 16, "Arc Cinema · Hall 01", 120, 42, 40000),
    screening("showing-iron-2-saturday", "iron-man-2", 3, 20, "Metro Screens · Hall 03", 90, 28, 55000),
    screening("showing-thor-thursday", "thor", 6, 21, "Arc Cinema · Hall 02", 90, 14, 50000),
    screening("showing-avengers", "the-avengers", 8, 18, "The Lab · Studio A", 60, 18, 35000),
    screening("showing-iron-3", "iron-man-3", 10, 20, "Arc Cinema · Hall 01", 120, 0, 60000),
  ];
}

function buildDemoSnapshot(catalog = fallbackCatalog): CustomerSnapshot {
  const screenings = buildDemoScreenings(catalog);
  const campaign: RewardCampaign = {
    id: "campaign-temporal-loom",
    name: "Temporal Loom",
    completedPlays: 1,
    requiredPlays: 3,
    completionWindowDays: 7,
    expiresAt: futureDate(6, 23, 59),
    status: "active",
    eligible: true,
    claimed: false,
    reward: {
      id: "reward-campaign-50",
      kind: "discount",
      title: "50% off one ticket",
      description: "A single-use discount for your next eligible screening.",
      status: "reserved",
      expiresAt: futureDate(9, 23, 59),
      instructions: "Your reward applies automatically at checkout.",
      discountPercent: 50,
    },
  };
  const show = screenings[0];
  return {
    catalog,
    screenings,
    progress: [
      { titleId: "captain-america-the-first-avenger", seasonNumber: null, episodeNumber: null, watchedAt: pastDate(3) },
      { titleId: "iron-man", seasonNumber: null, episodeNumber: null, watchedAt: pastDate(2) },
      { titleId: "iron-man-2", seasonNumber: null, episodeNumber: null, watchedAt: pastDate(1) },
    ],
    banners: [{
      id: "banner-preview",
      kicker: "PREVIEW DATA",
      title: "Follow the Doomsday watch order.",
      copy: "The API is not running, so this build is showing local fixtures.",
      imageUrl: "",
      accent: "teal",
      destinationTitleId: "captain-america-the-first-avenger",
    }],
    bookings: [{
      id: "booking-demo-001",
      orderCode: "MSY-8Q4K-2N7P",
      screeningId: show.id,
      titleId: show.titleId,
      title: show.title,
      startsAt: show.startsAt,
      endsAt: show.endsAt,
      location: show.location,
      quantity: 2,
      amountMinor: show.priceMinor * 2,
      status: "confirmed",
      ticketStatus: "valid",
      qrValue: "marvelsyllabus://ticket/MSY-8Q4K-2N7P",
      createdAt: pastDate(2),
    }],
    rewards: [{
      id: "reward-demo-food",
      kind: "coupon",
      title: "DWRPAR food treat",
      description: "A partner coupon code ready to use on dwrpar.com.",
      status: "available",
      expiresAt: futureDate(21, 23, 59),
      instructions: "Copy this code and redeem it on dwrpar.com.",
      code: "MSY-TREAT-7KQ2",
    }],
    campaign,
    notifications: [{
      id: "notice-preview",
      kind: "screening",
      title: "Preview account",
      body: "Connect the API to see real tickets, progress and rewards.",
      createdAt: pastDate(0, 9, 15),
      read: false,
    }],
    settings: {
      displayName: "Preview Agent",
      shareWatched: true,
      shareStreak: true,
      productUpdates: true,
      reminderNotifications: true,
      qrDestination: "https://marvelsyllabus.com/discover",
    },
    source: "demo",
  };
}

// ---------------------------------------------------------------------------
// Live snapshot
// ---------------------------------------------------------------------------

function fallbackSettings(qrDestination: string | null = null): CustomerSettings {
  return {
    displayName: "Member",
    shareWatched: false,
    shareStreak: false,
    productUpdates: false,
    reminderNotifications: false,
    qrDestination,
  };
}

function emptyCampaign(): RewardCampaign {
  return {
    id: "",
    name: "Temporal Loom",
    completedPlays: 0,
    requiredPlays: 3,
    completionWindowDays: 7,
    expiresAt: futureDate(7),
    status: "paused",
    eligible: false,
    claimed: false,
    reward: {
      id: "reward-unavailable",
      kind: "discount",
      title: "No reward campaign is running",
      description: "Rewards open when the operator starts the next campaign.",
      status: "reserved",
      expiresAt: futureDate(7),
      instructions: "",
    },
  };
}

export function unavailableSnapshot(issues: string[]): CustomerSnapshot {
  return {
    catalog: [],
    screenings: [],
    progress: [],
    banners: [],
    bookings: [],
    rewards: [],
    campaign: emptyCampaign(),
    notifications: [],
    settings: fallbackSettings(),
    source: "unavailable",
    issues,
  };
}

function featuredBanner(catalog: CatalogTitle[]): Banner[] {
  const firstTitle = catalog[0];
  return firstTitle ? [{
    id: "live-featured-title",
    kicker: "THE MARVELSYLLABUS ARCHIVE",
    title: firstTitle.title,
    copy: firstTitle.synopsis,
    imageUrl: firstTitle.posterUrl ?? "",
    accent: "teal",
    destinationTitleId: firstTitle.id,
  }] : [];
}

function toTicketBooking(entry: WalletBooking): TicketBooking {
  const statuses: TicketBooking["status"][] = ["confirmed", "payment_pending", "refunded", "cancelled"];
  const status = statuses.includes(entry.status as TicketBooking["status"])
    ? entry.status as TicketBooking["status"]
    : "payment_pending";
  return { ...entry, status };
}

export async function loadCustomerSnapshot(getToken?: () => Promise<string | null>): Promise<CustomerSnapshot> {
  const issues: string[] = [];
  let token: string | null = null;
  try {
    token = (await getToken?.()) ?? null;
  } catch {
    issues.push("auth_unavailable");
  }

  const [catalogResult, screeningsResult, bannersResult, qrResult] = await Promise.allSettled([
    loadCatalog(),
    loadScreenings(),
    loadBanners(),
    loadProfileQr(),
  ]);

  if (catalogResult.status === "rejected" || screeningsResult.status === "rejected") {
    if (import.meta.env.DEV) {
      let preview = buildDemoSnapshot();
      try {
        preview = buildDemoSnapshot(await loadLocalWatchlistCatalog());
      } catch {
        // The compact preview is enough when static fixtures are unavailable.
      }
      return { ...preview, source: "demo", issues: ["api_unreachable"] };
    }
    return unavailableSnapshot(["catalog_or_screenings_unavailable"]);
  }

  const catalog = catalogResult.value.map((title) => ({
    ...title,
    posterUrl: title.posterUrl ?? posterOverrides[title.id] ?? null,
  }));
  const screenings = screeningsResult.value;
  const qrDestination = qrResult.status === "fulfilled" ? qrResult.value.qrDestination : null;
  const banners = bannersResult.status === "fulfilled" && bannersResult.value.length > 0
    ? bannersResult.value
    : featuredBanner(catalog);

  let settings = fallbackSettings(qrDestination);
  let progress: WatchedItem[] = [];
  let bookings: TicketBooking[] = [];
  let rewards: RewardGrant[] = [];
  let campaign = emptyCampaign();

  if (token) {
    const [accountResult, progressResult, walletResult, rewardsResult] = await Promise.allSettled([
      loadAccount(token),
      loadProgress(token),
      loadWallet(token),
      loadRewards(token),
    ]);

    if (accountResult.status === "fulfilled") {
      settings = accountResult.value;
    } else {
      issues.push("account_unavailable");
    }
    if (progressResult.status === "fulfilled") {
      progress = progressResult.value;
    } else {
      issues.push("progress_unavailable");
    }
    // A paid ticket only exists on the server. Never let local rows stand in
    // for the wallet; an empty wallet is the truthful answer.
    if (walletResult.status === "fulfilled") {
      bookings = walletResult.value.map(toTicketBooking);
    } else {
      issues.push("wallet_unavailable");
    }
    if (rewardsResult.status === "fulfilled") {
      campaign = rewardsResult.value.campaign;
      rewards = rewardsResult.value.grants;
    } else {
      issues.push("rewards_unavailable");
    }
  }

  return {
    catalog,
    screenings,
    progress,
    banners,
    bookings,
    rewards,
    campaign,
    notifications: [],
    settings,
    source: "api",
    ...(issues.length ? { issues } : {}),
  };
}

export async function saveWatchedProgress(
  item: Pick<WatchedItem, "titleId" | "seasonNumber" | "episodeNumber">,
  watched: boolean,
  getToken?: () => Promise<string | null>,
) {
  const token = await getToken?.();
  if (token) {
    await apiRequest("/api/progress", token, {
      method: "PUT",
      body: JSON.stringify({ ...item, watched }),
    });
  }
}

export async function saveCustomerSettings(
  settings: Partial<CustomerSettings>,
  getToken?: () => Promise<string | null>,
) {
  const token = await getToken?.();
  if (!token) return null;
  const { displayName, shareWatched, shareStreak, productUpdates, reminderNotifications } = settings;
  return saveAccount(token, {
    ...(displayName === undefined ? {} : { displayName }),
    ...(shareWatched === undefined ? {} : { shareWatched }),
    ...(shareStreak === undefined ? {} : { shareStreak }),
    ...(productUpdates === undefined ? {} : { productUpdates }),
    ...(reminderNotifications === undefined ? {} : { reminderNotifications }),
  });
}

export function titleForScreening(screening: Screening, catalog: CatalogTitle[]) {
  return catalog.find((title) => title.id === screening.titleId);
}
