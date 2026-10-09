import {
  apiRequest,
  loadCatalog,
  loadProfileQr,
  loadProgress,
  loadScreenings,
  type CatalogTitle,
  type Screening,
  type TitleType,
  type WatchedItem,
} from "./catalog-api";

export type RewardKind = "coupon" | "discount" | "free-ticket";
export type RewardStatus = "reserved" | "available" | "redeemed";

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
  status: "confirmed" | "payment_pending" | "refunded" | "cancelled";
  ticketStatus: "valid" | "used" | "invalid";
  qrValue: string;
  createdAt: string;
  refundStatus?: "pending" | "confirmed" | "failed";
}

export interface RewardGrant {
  id: string;
  kind: RewardKind;
  title: string;
  description: string;
  status: RewardStatus;
  expiresAt: string;
  instructions: string;
  code?: string;
  discountPercent?: 30 | 50;
  eligibleTitleIds?: string[];
}

export interface RewardCampaign {
  id: string;
  name: string;
  completedPlays: number;
  requiredPlays: number;
  completionWindowDays: number;
  expiresAt: string;
  status: "active" | "paused" | "complete";
  eligible: boolean;
  claimed: boolean;
  reward: RewardGrant;
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
  source: "api" | "demo";
}

export const CUSTOMER_STATE_KEY = "marvelsyllabus-customer-state-v3";

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

const previewPosterOverrides: Record<string, string> = {
  "captain-america-the-first-avenger": "/data/posters/captain-america-the-first-avenger.jpg",
  "iron-man": "/data/posters/iron-man.jpg",
  "iron-man-2": "/data/posters/iron-man-2.jpg",
  thor: "/data/posters/thor.jpg",
  "the-avengers": "/data/posters/the-avengers.jpg",
};

function toCatalogTitle(movie: WatchlistMovie): CatalogTitle {
  const posterUrl = movie.images?.poster_url ?? previewPosterOverrides[movie.id] ?? null;
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

const fallbackCatalog: CatalogTitle[] = [
  { id: "captain-america-the-first-avenger", titleType: "film", title: "Captain America: The First Avenger", synopsis: "Steve Rogers becomes Captain America in WWII and meets Peggy Carter.", releaseYear: 2011, posterUrl: null, posterKey: null, active: true, watchOrder: 1, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
  { id: "iron-man", titleType: "film", title: "Iron Man", synopsis: "Tony Stark builds the Iron Man suit and begins the MCU.", releaseYear: 2008, posterUrl: null, posterKey: null, active: true, watchOrder: 2, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
  { id: "iron-man-2", titleType: "film", title: "Iron Man 2", synopsis: "Tony faces Whiplash while S.H.I.E.L.D. watches him.", releaseYear: 2010, posterUrl: null, posterKey: null, active: true, watchOrder: 3, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
  { id: "thor", titleType: "film", title: "Thor", synopsis: "Thor is banished to Earth and Loki schemes for the throne.", releaseYear: 2011, posterUrl: null, posterKey: null, active: true, watchOrder: 4, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
  { id: "the-avengers", titleType: "film", title: "The Avengers", synopsis: "Earth's heroes unite to stop Loki's invasion.", releaseYear: 2012, posterUrl: null, posterKey: null, active: true, watchOrder: 5, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
  { id: "iron-man-3", titleType: "film", title: "Iron Man 3", synopsis: "Tony battles the Mandarin and Extremis while dealing with PTSD.", releaseYear: 2013, posterUrl: null, posterKey: null, active: true, watchOrder: 6, universe: "MCU", tier: "optional", layer: 4, layerLabel: "Deep background" },
];

function buildDemoCatalog() {
  return fallbackCatalog;
}

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
    options: Partial<Pick<Screening, "cancelled" | "seasonNumber" | "episodeStart" | "episodeEnd">> = {},
  ): Screening => {
    const startsAt = futureDate(days, hour);
    const endsAt = futureDate(days, hour + 2, 0);
    const title = catalog.find((entry) => entry.id === titleId);
    return {
      id,
      titleId,
      title: title?.title ?? titleId,
      titleType: title?.titleType ?? "film",
      titleActive: title?.active ?? false,
      startsAt,
      endsAt,
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

  return [
    screening("showing-captain-friday", "captain-america-the-first-avenger", 2, 19, "Arc Cinema · Hall 01", 120, 86, 45000),
    screening("showing-iron-sunday", "iron-man", 4, 16, "Arc Cinema · Hall 01", 120, 42, 40000),
    screening("showing-iron-2-saturday", "iron-man-2", 3, 20, "Metro Screens · Hall 03", 90, 28, 55000),
    screening("showing-thor-thursday", "thor", 6, 21, "Arc Cinema · Hall 02", 90, 14, 50000),
    screening("showing-avengers", "the-avengers", 8, 18, "The Lab · Studio A", 60, 18, 35000, {
      seasonNumber: 1,
      episodeStart: 1,
      episodeEnd: 3,
    }),
    screening("showing-iron-3", "iron-man-3", 10, 20, "Arc Cinema · Hall 01", 120, 0, 60000),
  ];
}

function buildDemoBookings(catalog: CatalogTitle[], screenings: Screening[]): TicketBooking[] {
  const show = screenings[0];
  const title = catalog.find((entry) => entry.id === show.titleId);
  return [{
    id: "booking-demo-001",
    orderCode: "MSY-8Q4K-2N7P",
    screeningId: show.id,
    titleId: show.titleId,
    title: title?.title ?? show.title,
    startsAt: show.startsAt,
    endsAt: show.endsAt,
    location: show.location,
    quantity: 2,
    amountMinor: show.priceMinor * 2,
    status: "confirmed",
    ticketStatus: "valid",
    qrValue: "marvelsyllabus://ticket/MSY-8Q4K-2N7P",
    createdAt: pastDate(2),
  }];
}

function buildDemoSnapshot(catalog = buildDemoCatalog()): CustomerSnapshot {
  const screenings = buildDemoScreenings(catalog);
  const campaignReward: RewardGrant = {
    id: "reward-campaign-50",
    kind: "discount",
    title: "50% off one ticket",
    description: "A single-use discount for your next eligible screening.",
    status: "reserved",
    expiresAt: futureDate(9, 23, 59),
    instructions: "Your reward applies automatically at checkout. One ticket per order is discounted.",
    discountPercent: 50,
    eligibleTitleIds: ["captain-america-the-first-avenger", "iron-man", "iron-man-2", "thor", "the-avengers", "iron-man-3"],
  };
  return {
    catalog,
    screenings,
    progress: [
      { titleId: "captain-america-the-first-avenger", seasonNumber: null, episodeNumber: null, watchedAt: pastDate(3) },
      { titleId: "iron-man", seasonNumber: null, episodeNumber: null, watchedAt: pastDate(2) },
      { titleId: "iron-man-2", seasonNumber: null, episodeNumber: null, watchedAt: pastDate(1) },
    ],
    banners: [
      {
        id: "banner-captain-america",
        kicker: "FEATURED SCREENING",
        title: "Follow the Doomsday watch order.",
        copy: "The MarvelSyllabus archive is arranged for the story you want to follow next.",
        imageUrl: "",
        accent: "teal",
        destinationTitleId: "captain-america-the-first-avenger",
      },
      {
        id: "banner-rewards",
        kicker: "PLAY · EARN · RETURN",
        title: "Your next ticket is hiding in the game.",
        copy: "Complete three Temporal Loom rounds and unlock the reward reserved for your account.",
        imageUrl: "",
        accent: "violet",
      },
    ],
    bookings: buildDemoBookings(catalog, screenings),
    rewards: [{
      id: "reward-demo-food",
      kind: "coupon",
      title: "DWRPAR food treat",
      description: "A partner coupon code ready to use on dwrpar.com.",
      status: "available",
      expiresAt: futureDate(21, 23, 59),
      instructions: "Copy this code and redeem it on dwrpar.com. MarvelSyllabus does not validate partner redemption.",
      code: "MSY-TREAT-7KQ2",
    }],
    campaign: {
      id: "campaign-temporal-loom",
      name: "Temporal Loom",
      completedPlays: 1,
      requiredPlays: 3,
      completionWindowDays: 7,
      expiresAt: futureDate(6, 23, 59),
      status: "active",
      eligible: true,
      claimed: false,
      reward: campaignReward,
    },
    notifications: [
      {
        id: "notice-screening",
        kind: "screening",
        title: "Your screening is coming up",
        body: "Captain America: The First Avenger · Friday at 7:00 PM · Arc Cinema Hall 01.",
        createdAt: pastDate(0, 9, 15),
        read: false,
      },
      {
        id: "notice-reward",
        kind: "reward",
        title: "Your reward is reserved",
        body: "Complete two more rounds in Temporal Loom before the window closes.",
        createdAt: pastDate(1, 18, 0),
        read: false,
      },
      {
        id: "notice-welcome",
        kind: "account",
        title: "Welcome to MarvelSyllabus",
        body: "Your watch progress and tickets will stay with your account across devices.",
        createdAt: pastDate(4, 12, 0),
        read: true,
      },
    ],
    settings: {
      displayName: "Aarav Mehta",
      shareWatched: true,
      shareStreak: true,
      productUpdates: true,
      reminderNotifications: true,
      qrDestination: "https://marvelsyllabus.com/discover",
    },
    source: "demo",
  };
}

function mergeStoredState(base: CustomerSnapshot): CustomerSnapshot {
  try {
    const raw = window.localStorage.getItem(CUSTOMER_STATE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<CustomerSnapshot>;
    return {
      ...base,
      ...saved,
      catalog: base.catalog,
      screenings: base.screenings,
      banners: base.banners,
      source: base.source,
      settings: { ...base.settings, ...(saved.settings ?? {}) },
      campaign: { ...base.campaign, ...(saved.campaign ?? {}), reward: { ...base.campaign.reward, ...(saved.campaign?.reward ?? {}) } },
      bookings: Array.isArray(saved.bookings) ? saved.bookings : base.bookings,
      rewards: Array.isArray(saved.rewards) ? saved.rewards : base.rewards,
      progress: Array.isArray(saved.progress) ? saved.progress : base.progress,
      notifications: Array.isArray(saved.notifications) ? saved.notifications : base.notifications,
    };
  } catch {
    return base;
  }
}

export function persistCustomerState(snapshot: CustomerSnapshot) {
  try {
    window.localStorage.setItem(CUSTOMER_STATE_KEY, JSON.stringify({
      bookings: snapshot.bookings,
      rewards: snapshot.rewards,
      campaign: snapshot.campaign,
      progress: snapshot.progress,
      notifications: snapshot.notifications,
      settings: snapshot.settings,
    }));
  } catch {
    // Storage is an enhancement. The in-memory experience should keep working.
  }
}

export async function loadCustomerSnapshot(getToken?: () => Promise<string | null>): Promise<CustomerSnapshot> {
  let fallback = mergeStoredState(buildDemoSnapshot());
  try {
    fallback = mergeStoredState(buildDemoSnapshot(await loadLocalWatchlistCatalog()));
  } catch {
    // The compact fallback keeps the shell usable if the static watchlist cannot be fetched.
  }
  const [catalogResult, screeningsResult, profileQrResult] = await Promise.allSettled([loadCatalog(), loadScreenings(), loadProfileQr()]);
  const catalogReady = catalogResult.status === "fulfilled";
  const screeningsReady = screeningsResult.status === "fulfilled";
  const qrDestination = profileQrResult.status === "fulfilled"
    ? profileQrResult.value.qrDestination
    : fallback.settings.qrDestination;
  if (!catalogReady || !screeningsReady) return { ...fallback, settings: { ...fallback.settings, qrDestination } };

  let progress: WatchedItem[] = [];
  try {
    const token = await getToken?.();
    if (token) progress = await loadProgress(token);
  } catch {
    progress = [];
  }

  const catalog = catalogResult.value.map((title) => {
    const source = fallback.catalog.find((entry) => entry.id === title.id);
    return source ? { ...source, ...title, posterUrl: title.posterUrl ?? source.posterUrl } : title;
  });
  const firstTitle = catalog[0];
  return {
    ...fallback,
    catalog,
    screenings: screeningsResult.value,
    progress,
    banners: firstTitle ? [{
      id: "live-featured-title",
      kicker: "THE MARVELSYLLABUS ARCHIVE",
      title: firstTitle.title,
      copy: firstTitle.synopsis,
      imageUrl: firstTitle.posterUrl ?? "",
      accent: "teal",
      destinationTitleId: firstTitle.id,
    }] : [],
    bookings: [],
    rewards: [],
    campaign: {
      ...fallback.campaign,
      status: "paused",
      eligible: false,
      completedPlays: 0,
      claimed: false,
      reward: { ...fallback.campaign.reward, status: "reserved" },
    },
    notifications: [],
    settings: {
      ...fallback.settings,
      displayName: "Member",
      shareWatched: false,
      shareStreak: false,
      qrDestination,
    },
    source: "api",
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

export function titleForScreening(screening: Screening, catalog: CatalogTitle[]) {
  return catalog.find((title) => title.id === screening.titleId);
}
