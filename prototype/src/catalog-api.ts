export type TitleType = "film" | "series";

export interface CatalogTitle {
  id: string;
  titleType: TitleType;
  title: string;
  synopsis: string;
  releaseYear: number | null;
  posterUrl: string | null;
  bannerUrl?: string | null;
  posterKey?: string | null;
  active: boolean;
  watchOrder: number;
  seasons?: Season[];
  directors?: string | null;
  creators?: string | null;
  universe?: string | null;
  layer?: number | null;
  layerLabel?: string | null;
  tier?: string | null;
  doomsdayConnection?: string | null;
  confirmedCharacters?: string[];
  franchise?: string | null;
  tmdbLookup?: { query: string; year: number; mediaType: "movie" | "tv"; tmdbId?: number };
}

export interface Screening {
  id: string;
  titleId: string;
  title: string;
  titleType: TitleType;
  titleActive: boolean;
  startsAt: string;
  endsAt: string;
  location: string;
  capacity: number;
  priceMinor: number;
  salesOpenAt: string | null;
  salesCloseAt: string | null;
  cancelled: boolean;
  seasonNumber: number | null;
  episodeStart: number | null;
  episodeEnd: number | null;
  soldCount: number;
  heldCount: number;
}

export interface Season {
  seasonNumber: number;
  episodeCount: number;
}

export interface WatchedItem {
  titleId: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  watchedAt: string;
}

// Same-origin by default (`/api`). Set VITE_API_BASE_URL when the frontend and
// the shared worker are deployed on different hosts.
export const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(/\/+$/, "");

export async function apiRequest<T>(
  path: string,
  token?: string | null,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `request_failed_${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface PublicConfig {
  razorpayKeyId: string | null;
  authConfigured: boolean;
}

export const loadPublicConfig = () => apiRequest<PublicConfig>("/api/config");

export interface HealthReport {
  ok: boolean;
  database: boolean;
  catalogTitles?: number;
  upcomingScreenings?: number;
  authConfigured?: boolean;
  storageConfigured?: boolean;
  paymentsConfigured?: boolean;
  checkedAt?: string;
  error?: string;
}

export const loadHealth = () => apiRequest<HealthReport>("/api/health");

export const loadCatalog = () => apiRequest<CatalogTitle[]>("/api/catalog");
export const loadScreenings = () => apiRequest<Screening[]>("/api/screenings");
export const loadSeasons = (id: string, token: string) =>
  apiRequest<Season[]>(`/api/admin/series/${encodeURIComponent(id)}/seasons`, token);
export const loadProgress = (token: string) => apiRequest<WatchedItem[]>("/api/progress", token);
export const loadProfileQr = () => apiRequest<{ qrDestination: string | null }>("/api/profile-qr");

export interface PublicBanner {
  id: string;
  kicker: string;
  title: string;
  copy: string;
  imageUrl: string;
  accent: "violet" | "coral" | "teal";
  destinationTitleId?: string;
}

export const loadBanners = () => apiRequest<PublicBanner[]>("/api/banners");

export interface AccountSettings {
  displayName: string;
  shareWatched: boolean;
  shareStreak: boolean;
  productUpdates: boolean;
  reminderNotifications: boolean;
  qrDestination: string | null;
}

export const loadAccount = (token: string) => apiRequest<AccountSettings>("/api/account", token);

export const saveAccount = (
  token: string,
  settings: Partial<Pick<AccountSettings, "displayName" | "shareWatched" | "shareStreak" | "productUpdates" | "reminderNotifications">>,
) => apiRequest<AccountSettings>("/api/account", token, {
  method: "PUT",
  body: JSON.stringify(settings),
});

export type RewardKind = "coupon" | "discount" | "free-ticket";
export type RewardStatus = "reserved" | "available" | "redeemed";

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

export interface RewardsState {
  campaign: RewardCampaign;
  grants: RewardGrant[];
}

export const loadRewards = (token: string) => apiRequest<RewardsState>("/api/rewards", token);

export const startRewardRound = (token: string) =>
  apiRequest<{ startedAt: string; expiresAt: string }>("/api/rewards/rounds/start", token, { method: "POST" });

export const completeRewardRound = (token: string) =>
  apiRequest<RewardsState>("/api/rewards/rounds/complete", token, { method: "POST" });

export const claimReward = (token: string) =>
  apiRequest<RewardsState>("/api/rewards/claim", token, { method: "POST" });

export function sortCatalog(titles: CatalogTitle[]): CatalogTitle[] {
  return [...titles].sort((a, b) => a.watchOrder - b.watchOrder || a.title.localeCompare(b.title));
}

export function screeningIsBookable(screening: Screening, now = Date.now()): boolean {
  const startsAt = Date.parse(screening.startsAt);
  const opensAt = screening.salesOpenAt ? Date.parse(screening.salesOpenAt) : Number.NEGATIVE_INFINITY;
  const closesAt = screening.salesCloseAt ? Date.parse(screening.salesCloseAt) : startsAt;
  return screening.titleActive &&
    !screening.cancelled &&
    screening.soldCount + screening.heldCount < screening.capacity &&
    now >= opensAt &&
    now < closesAt &&
    now < startsAt;
}

// ---- Shared ticketing seam (customer wallet + holds) ----
// Same ticket contract as the door-staff app and the admin:
// QR payload "marvelsyllabus://ticket/<orderCode>", manual entry "<orderCode>".

export interface WalletBooking {
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
  status: string;
  ticketStatus: "valid" | "used" | "invalid";
  qrValue: string;
  createdAt: string;
}

export function ticketQrValue(orderCode: string) {
  return `marvelsyllabus://ticket/${orderCode}`;
}

export function normalizeTicketCode(raw: string) {
  const match = raw.trim().toUpperCase().match(/MSY-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  if (!match) throw new Error("invalid_code");
  return match[0];
}

export const loadWallet = (token: string) =>
  apiRequest<WalletBooking[]>("/api/bookings", token);

export const createBookingHold = (token: string, screeningId: string, quantity = 1, rewardId?: string) =>
  apiRequest<{ holdId: string; expiresAt: string }>("/api/booking-holds", token, {
    method: "POST",
    body: JSON.stringify({ screeningId, quantity, ...(rewardId ? { rewardId } : {}) }),
  });

export interface RazorpayOrder {
  order_id?: string;
  amount: number;
  currency: string;
  /** A fully discounted reward is confirmed without a payment provider. */
  free?: boolean;
  orderCode?: string;
}

export const createRazorpayOrder = (token: string, holdId: string) =>
  apiRequest<RazorpayOrder>("/api/create-order", token, {
    method: "POST",
    body: JSON.stringify({ holdId }),
  });

export const verifyRazorpayPayment = (
  token: string,
  payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
) => apiRequest<{ success: true; orderCode: string }>("/api/verify-payment", token, {
  method: "POST",
  body: JSON.stringify(payment),
});
