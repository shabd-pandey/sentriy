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
export const loadSeasons = (id: string, token: string) =>
  apiRequest<Season[]>(`/api/admin/series/${encodeURIComponent(id)}/seasons`, token);
export const loadProgress = (token: string) => apiRequest<WatchedItem[]>("/api/progress", token);
export const loadProfileQr = () => apiRequest<{ qrDestination: string | null }>("/api/profile-qr");

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
