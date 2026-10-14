export type TitleType = "film" | "series";

export interface Season {
  seasonNumber: number;
  episodeCount: number;
}

export interface CatalogTitle {
  id: string;
  titleType: TitleType;
  title: string;
  synopsis: string;
  releaseYear: number | null;
  posterUrl: string | null;
  posterKey: string | null;
  active: boolean;
  watchOrder: number;
  seasons: Season[];
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

export type BannerAccent = "violet" | "coral" | "teal";
export type BannerState = "draft" | "published";

export interface Banner {
  id: string;
  kicker: string;
  title: string;
  copy: string;
  imageKey: string | null;
  accent: BannerAccent;
  destinationTitleId: string | null;
  destinationScreeningId: string | null;
  state: BannerState;
  publishAt: string | null;
  unpublishAt: string | null;
  createdAt: string;
}

export type ActivityCategory = "catalog" | "screening" | "artwork" | "settings" | "banner" | "reward";

export interface ActivityEntry {
  id: string;
  occurredAt: string;
  actorSub: string;
  category: ActivityCategory;
  summary: string;
  screeningId: string | null;
  bannerId: string | null;
  campaignId: string | null;
  orderRef: string | null;
  refLabel: string;
}

export type CampaignStatus = "draft" | "active" | "paused" | "ended";
export type RewardKind = "coupon" | "discount" | "free-ticket";

export interface RewardCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  rewardKind: RewardKind;
  discountPercent: number | null;
  freeTicketScreeningId: string | null;
  freeTicketTitle: string | null;
  requiredPlays: number;
  completionWindowDays: number;
  rewardExpiryDays: number;
  rewardCap: number;
  instructions: string;
  allowOverlap: boolean;
  createdAt: string;
  updatedAt: string;
  enrolledCount: number;
  grantedCount: number;
  redeemedCount: number;
  codesAvailable: number;
  codesReserved: number;
  codesUsed: number;
}

export interface CampaignCode {
  id: string;
  code: string;
  instructions: string | null;
  expiresAt: string | null;
  status: "available" | "reserved" | "used";
  grantedTo: string | null;
}

export interface CampaignEntrant {
  enrollmentId: string;
  userId: string;
  completedPlays: number;
  status: string;
  reservationExpiresAt: string | null;
  code: string | null;
  codeExpiresAt: string | null;
  grantStatus: string | null;
  grantTitle: string | null;
  redeemedAt: string | null;
}

export interface CatalogDraft {
  title: string;
  titleType: TitleType;
  synopsis: string;
  releaseYear: number | null;
  active: boolean;
  watchOrder: number;
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
  imageKey: string | null;
  accent: BannerAccent;
  destinationTitleId: string | null;
  destinationScreeningId: string | null;
  state: BannerState;
  publishAt: string | null;
  unpublishAt: string | null;
}

export interface CampaignDraft {
  name: string;
  rewardKind: RewardKind;
  discountPercent?: number;
  freeTicketScreeningId?: string;
  requiredPlays?: number;
  completionWindowDays?: number;
  rewardExpiryDays?: number;
  rewardCap: number;
  instructions?: string;
  allowOverlap?: boolean;
}

export async function apiRequest<T>(
  path: string,
  token?: string | null,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `request_failed_${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const loadCatalog = () => apiRequest<CatalogTitle[]>("/api/catalog");
export const loadScreenings = () => apiRequest<Screening[]>("/api/screenings");
export const loadProfileQr = () => apiRequest<{ qrDestination: string | null }>("/api/profile-qr");
export const loadBanners = (token: string) => apiRequest<Banner[]>("/api/admin/banners", token);
export const loadActivity = (token: string, filter: { category?: string; query?: string; limit?: number } = {}) => {
  const search = new URLSearchParams();
  if (filter.category) search.set("category", filter.category);
  if (filter.query) search.set("query", filter.query);
  if (filter.limit) search.set("limit", String(filter.limit));
  return apiRequest<ActivityEntry[]>(`/api/admin/activity?${search.toString()}`, token);
};
export const loadCampaigns = (token: string) => apiRequest<RewardCampaign[]>("/api/admin/rewards/campaigns", token);
export const loadCampaignCodes = (token: string, campaignId: string) => apiRequest<CampaignCode[]>(`/api/admin/rewards/campaigns/${campaignId}/codes`, token);
export const loadCampaignEntrants = (token: string, campaignId: string) => apiRequest<CampaignEntrant[]>(`/api/admin/rewards/campaigns/${campaignId}/entrants`, token);

export const adminRequest = <T>(path: string, token: string, init: RequestInit = {}) =>
  apiRequest<T>(path, token, { ...init });

export const saveCatalogTitle = (token: string, id: string | null, draft: CatalogDraft) =>
  id
    ? adminRequest<{ ok: boolean }>(`/api/admin/catalog/${encodeURIComponent(id)}`, token, { method: "PUT", body: JSON.stringify(draft) })
    : adminRequest<{ id: string }>(`/api/admin/catalog`, token, { method: "POST", body: JSON.stringify(draft) });

export const reorderCatalog = (token: string, ids: string[]) =>
  adminRequest<{ ok: boolean }>("/api/admin/catalog/order", token, { method: "PUT", body: JSON.stringify({ ids }) });

export const saveSeasons = (token: string, titleId: string, seasons: Season[]) =>
  adminRequest<{ ok: boolean }>(`/api/admin/series/${encodeURIComponent(titleId)}/seasons`, token, { method: "PUT", body: JSON.stringify({ seasons }) });

export const uploadArtwork = (token: string, file: File) => {
  const form = new FormData();
  form.set("file", file);
  form.set("rightsCleared", "true");
  return adminRequest<{ key: string }>("/api/admin/artwork", token, { method: "POST", body: form });
};

export const createScreening = (token: string, draft: ScreeningDraft) =>
  adminRequest<{ id: string }>("/api/admin/screenings", token, { method: "POST", body: JSON.stringify(draft) });

export const setScreeningCancelled = (token: string, id: string, cancelled: boolean) =>
  adminRequest<{ ok: boolean; cancelled: boolean }>(`/api/admin/screenings/${id}`, token, { method: "PUT", body: JSON.stringify({ cancelled }) });

export const saveBanner = (token: string, id: string | null, draft: BannerDraft) =>
  id
    ? adminRequest<{ ok: boolean }>(`/api/admin/banners/${id}`, token, { method: "PUT", body: JSON.stringify(draft) })
    : adminRequest<{ id: string }>("/api/admin/banners", token, { method: "POST", body: JSON.stringify(draft) });

export const deleteBanner = (token: string, id: string) =>
  adminRequest<{ ok: boolean }>(`/api/admin/banners/${id}`, token, { method: "DELETE" });

export const createCampaign = (token: string, draft: CampaignDraft) =>
  adminRequest<{ id: string }>("/api/admin/rewards/campaigns", token, { method: "POST", body: JSON.stringify(draft) });

export const updateCampaign = (token: string, id: string, patch: Partial<RewardCampaign>) =>
  adminRequest<{ ok: boolean; status: string }>(`/api/admin/rewards/campaigns/${id}`, token, { method: "PUT", body: JSON.stringify(patch) });

export const addCampaignCodes = (token: string, id: string, codes: string[], instructions?: string, expiresAt?: string | null) =>
  adminRequest<{ added: number }>(`/api/admin/rewards/campaigns/${id}/codes`, token, { method: "POST", body: JSON.stringify({ codes, instructions, expiresAt }) });

export const deleteCampaignCode = (token: string, campaignId: string, codeId: string) =>
  adminRequest<{ ok: boolean }>(`/api/admin/rewards/campaigns/${campaignId}/codes/${codeId}`, token, { method: "DELETE" });

export const saveProfileQr = (token: string, qrDestination: string) =>
  adminRequest<{ qrDestination: string }>("/api/admin/profile-qr", token, { method: "PUT", body: JSON.stringify({ qrDestination }) });

export function sortCatalog(titles: CatalogTitle[]): CatalogTitle[] {
  return [...titles].sort((a, b) => a.watchOrder - b.watchOrder || a.title.localeCompare(b.title));
}

export function screeningStatus(screening: Screening, now = Date.now()): "on-sale" | "upcoming-title" | "not-on-sale" | "cancelled" | "started" {
  if (screening.cancelled) return "cancelled";
  if (!screening.titleActive) return "upcoming-title";
  if (now >= Date.parse(screening.startsAt)) return "started";
  const opensAt = screening.salesOpenAt ? Date.parse(screening.salesOpenAt) : Number.NEGATIVE_INFINITY;
  const closesAt = screening.salesCloseAt ? Date.parse(screening.salesCloseAt) : Date.parse(screening.startsAt);
  return now >= opensAt && now < closesAt ? "on-sale" : "not-on-sale";
}

export function remainingCapacity(screening: Screening) {
  return Math.max(0, screening.capacity - screening.soldCount - screening.heldCount);
}

// ---- Shared ticketing seam (staff + door reconciliation) ----
// Same contract as the customer wallet and the Flutter door app.

export interface StaffScreening {
  id: string;
  titleId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  capacity: number;
  cancelled: boolean;
  soldCount: number;
  checkedInCount: number;
}

export type StaffCheckStatus = "accepted" | "already_used" | "valid" | "invalid";

export interface StaffTicket {
  code: string;
  status: StaffCheckStatus;
  orderCode?: string;
  title?: string;
  quantity?: number;
  screeningId?: string;
  startsAt?: string;
  location?: string;
}

export function normalizeTicketCode(raw: string) {
  const match = raw.trim().toUpperCase().match(/MSY-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  if (!match) throw new Error("invalid_code");
  return match[0];
}

export const loadStaffScreenings = (token: string) =>
  apiRequest<StaffScreening[]>("/api/staff/screenings", token);

export const validateStaffTicket = (token: string, code: string) =>
  apiRequest<StaffTicket>("/api/staff/validate", token, {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const checkInStaffTicket = (token: string, code: string) =>
  apiRequest<{ status: StaffCheckStatus; code: string }>("/api/staff/check-in", token, {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const loadAdminBookings = (token: string, screeningId?: string) =>
  apiRequest<StaffTicket[]>(
    screeningId ? `/api/admin/bookings?screeningId=${encodeURIComponent(screeningId)}` : "/api/admin/bookings",
    token,
  );

export function money(minor: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(minor / 100);
}