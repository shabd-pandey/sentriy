import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  remainingCapacity,
  screeningStatus,
  sortCatalog,
  money,
  normalizeTicketCode,
  loadActivity as fetchActivity,
  loadBanners as fetchBanners,
  loadCampaignCodes as fetchCampaignCodes,
  loadCampaignEntrants as fetchCampaignEntrants,
  loadCampaigns as fetchCampaigns,
  loadCatalog as fetchCatalog,
  loadProfileQr as fetchProfileQr,
  loadScreenings as fetchScreenings,
  createCampaign as createCampaignRemote,
  createScreening as createScreeningRemote,
  deleteBanner as deleteBannerRemote,
  deleteCampaignCode as deleteCampaignCodeRemote,
  deleteCatalogTitle as deleteCatalogTitleRemote,
  deleteScreening as deleteScreeningRemote,
  updateScreening as updateScreeningRemote,
  reorderCatalog as reorderCatalogRemote,
  saveCatalogTitle as saveCatalogTitleRemote,
  saveBanner as saveBannerRemote,
  saveProfileQr as saveProfileQrRemote,
  addCampaignCodes as addCampaignCodesRemote,
  saveSeasons as saveSeasonsRemote,
  setScreeningCancelled as setScreeningCancelledRemote,
  updateCampaign as updateCampaignRemote,
  uploadArtwork as uploadArtworkRemote,
  loadAdminBookings as fetchAdminBookings,
  loadAdminHolds as fetchAdminHolds,
  loadCheckins as fetchCheckins,
  loadOverview as fetchOverview,
  loadStaffScreenings as fetchStaffScreenings,
  validateStaffTicket as validateStaffTicketRemote,
  checkInStaffTicket as checkInStaffTicketRemote,
  refundBooking as refundBookingRemote,
  cancelBooking as cancelBookingRemote,
  confirmBooking as confirmBookingRemote,
  releaseHold as releaseHoldRemote,
  importCatalog as importCatalogRemote,
  type AdminBooking,
  type AdminOverview,
  type BannerAccent,
  type BookingHold,
  type CampaignCode,
  type CampaignEntrant,
  type CheckinRecord,
} from "./api";
import {
  addCampaignCodes,
  addScreening,
  deleteBanner,
  deleteCampaignCode,
  deleteScreening as deleteScreeningLocal,
  deleteTitle as deleteTitleLocal,
  updateScreening as updateScreeningLocal,
  loadAdminSnapshot,
  persistAdminSnapshot,
  resetAdminData,
  reorderCatalogue,
  saveSeasonsFor,
  saveSettings,
  setCampaignStatus,
  toggleScreeningCancelled,
  upsertBanner,
  upsertCampaign,
  upsertTitle,
  type AdminSnapshot,
  type BannerDraft,
  type CampaignDraft,
  type ScreeningDraft,
  type TitleDraft,
} from "./admin-data";

type TabId = "activity" | "catalog" | "screenings" | "bookings" | "banners" | "rewards" | "settings" | "system";

export interface LiveStore {
  token: string | null;
  refresh: () => Promise<void>;
}

const categoryClass: Record<string, string> = {
  catalog: "cat-catalog",
  screening: "cat-screening",
  artwork: "cat-artwork",
  settings: "cat-settings",
  banner: "cat-banner",
  reward: "cat-reward",
  booking: "cat-booking",
  ticket: "cat-ticket",
  system: "cat-system",
};

const categoryLabel: Record<string, string> = {
  catalog: "Catalog",
  screening: "Screening",
  artwork: "Artwork",
  settings: "Settings",
  banner: "Banner",
  reward: "Reward",
  booking: "Booking",
  ticket: "Ticket",
  system: "System",
};

function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const dateOnly = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const timeOnly = new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" });

function fmtDateTime(iso: string) { return dateTime.format(new Date(iso)); }

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const source = String(reader.result);
      const image = new Image();
      image.onerror = () => reject(new Error("invalid_image"));
      image.onload = () => {
        const max = 480;
        let { width, height } = image;
        if (width > max) { height = Math.round((height * max) / width); width = max; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) { resolve(source); return; }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  });
}

function Modal({ title, eyebrow, children, onClose }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="cd-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="cd-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div><p className="cd-eyebrow">{eyebrow ?? "COMMAND DECK"}</p><h2>{title}</h2></div>
          <button type="button" className="cd-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="cd-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function PrimaryButton({ children, disabled, onClick, type = "button" }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return <button type={type} className="cd-primary" disabled={disabled} onClick={onClick}>{children}</button>;
}

function OutlineButton({ children, disabled, onClick, tone = "default" }: { children: ReactNode; disabled?: boolean; onClick?: () => void; tone?: "default" | "danger" | "danger-ghost" }) {
  return <button type="button" className={`cd-outline ${tone === "danger" ? "outline-danger" : ""} ${tone === "danger-ghost" ? "outline-danger-ghost" : ""}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

export default function CommandDeck() {
  const [snapshot, setSnapshot] = useState<AdminSnapshot>(() => loadAdminSnapshot());
  const [tab, setTab] = useState<TabId>("activity");
  const [clock, setClock] = useState(Date.now());
  const [liveToken, setLiveToken] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<"idle" | "loading" | "live" | "forbidden" | "error" | "demo">("idle");
  const [liveError, setLiveError] = useState("");

  useEffect(() => { if (snapshot.source === "demo") persistAdminSnapshot(snapshot); }, [snapshot]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const commit = (next: AdminSnapshot) => setSnapshot(next);

  const refreshLive = useCallback(async (token: string | null) => {
    const [catalog, screenings, profile, banners, activity, campaigns] = await Promise.all([
      fetchCatalog(),
      fetchScreenings(),
      fetchProfileQr(),
      fetchBanners(token),
      fetchActivity(token, { limit: 100 }),
      fetchCampaigns(token),
    ]);
    const codes: Record<string, CampaignCode[]> = {};
    const entrants: Record<string, CampaignEntrant[]> = {};
    await Promise.all(campaigns.map(async (campaign) => {
      const [codeRows, entrantRows] = await Promise.all([
        fetchCampaignCodes(token, campaign.id).catch(() => [] as CampaignCode[]),
        fetchCampaignEntrants(token, campaign.id).catch(() => [] as CampaignEntrant[]),
      ]);
      codes[campaign.id] = codeRows;
      entrants[campaign.id] = entrantRows;
    }));
    setSnapshot((current) => ({
      catalog,
      screenings,
      banners,
      campaigns,
      codes,
      entrants,
      activity: activity as AdminSnapshot["activity"],
      settings: { profileName: current.settings.profileName, qrDestination: profile.qrDestination },
      source: "live",
    }));
  }, []);

  // Sign-in is disabled on this deployment, so the deck always loads the live
  // shared backend. The API identifies it by `x-demo-admin` (see api.ts).
  useEffect(() => {
    let cancelled = false;
    setLiveState("loading");
    setLiveError("");
    void refreshLive(null)
      .then(() => {
        if (cancelled) return;
        setLiveToken(null);
        setLiveState("live");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : "request_failed";
        if (message === "forbidden") {
          setLiveState("forbidden");
          setLiveError("This account is not an admin. Showing nothing from the shared backend.");
        } else {
          setLiveState("error");
          setLiveError(`Live data unavailable (${message}). Showing preview data.`);
        }
      });
    return () => { cancelled = true; };
  }, [refreshLive]);

  const live = liveState === "live" ? { token: liveToken, refresh: () => refreshLive(liveToken) } : null;

  const orderedCatalog = useMemo(() => sortCatalog(snapshot.catalog), [snapshot.catalog]);
  const screeningList = useMemo(
    () => [...snapshot.screenings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [snapshot.screenings],
  );
  const activityToday = snapshot.activity.filter((entry) => Date.now() - Date.parse(entry.occurredAt) < 86_400_000).length;
  const screeningsOnSale = snapshot.screenings.filter((item) => screeningStatus(item, clock) === "on-sale").length;
  const bannersPublished = snapshot.banners.filter((banner) => banner.state === "published").length;
  const campaignsActive = snapshot.campaigns.filter((campaign) => campaign.status === "active").length;

  return (
    <div className="cd-shell">
      <header className="cd-topbar">
        <a className="cd-brand" href="#" onClick={(event) => { event.preventDefault(); setTab("activity"); }}>
          <span className="cd-brand-mark">M</span>
          <span><strong>MARVELSYLLABUS</strong><small>COMMAND DECK · BURDEN WITH GLORIOUS SYLLABUS</small></span>
        </a>
        {liveState === "live" ? (
          <div className="cd-live-ribbon"><i /> Live · shared backend</div>
        ) : liveState === "loading" ? (
          <div className="cd-demo-ribbon"><i /> Connecting to the shared backend…</div>
        ) : (
          <div className="cd-demo-ribbon"><i /> Preview data · every change stays in this browser</div>
        )}
        {(liveError || liveState === "forbidden") && <span className="cd-live-error" role="status">{liveError}</span>}
        {snapshot.source === "demo" && <button type="button" className="cd-reset" onClick={() => { if (window.confirm("Reset all demo data to the original seed?")) setSnapshot(resetAdminData()); }}>Reset demo</button>}
      </header>

      <section className="cd-profile-nav">
        <div className="cd-profile-intro">
          <p className="cd-profile-kicker">Operator profile · 2026</p>
          <h1>Your command<br />timeline.</h1>
          <p>Choose a workspace to shape every screening, story, and reward in the MarvelSyllabus universe.</p>
          <span className="cd-profile-signature">MS / ADMIN</span>
        </div>
        <nav className="cd-tabs" role="tablist" aria-label="Operator workspace">
          <div className="cd-tabs-head">
            <span>THE OPERATOR'S LOGBOOK</span>
            <strong>MARVELSYLLABUS</strong>
          </div>
          <div className="cd-tabs-list">
            {([
              ["activity", "Activity", "01"],
              ["catalog", "Catalog", "02"],
              ["screenings", "Screenings", "03"],
              ["bookings", "Bookings", "04"],
              ["banners", "Banners", "05"],
              ["rewards", "Rewards", "06"],
              ["settings", "Settings", "07"],
              ["system", "System", "08"],
            ] as const).map(([id, label, number]) => {
              const count = id === "activity" ? activityToday
                : id === "catalog" ? snapshot.catalog.length
                  : id === "screenings" ? screeningsOnSale
                    : id === "banners" ? bannersPublished
                      : id === "rewards" ? campaignsActive
                        : undefined;
              return (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
                  <small>{number}</small>{label}{count !== undefined && <span>{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="cd-tabs-foot"><span>SELECTED</span><strong>{tab.toUpperCase()}</strong><i /></div>
        </nav>
      </section>

      <main className="cd-content">
        {tab === "activity" && <ActivityTab snapshot={snapshot} clock={clock} live={live} onOpenScreenings={() => setTab("screenings")} onOpenCatalog={() => setTab("catalog")} />}
        {tab === "catalog" && <CatalogTab snapshot={snapshot} orderedCatalog={orderedCatalog} onCommit={commit} live={live} />}
        {tab === "screenings" && <ScreeningsTab snapshot={snapshot} orderedCatalog={orderedCatalog} onCommit={commit} live={live} />}
        {tab === "bookings" && <BookingsTab snapshot={snapshot} live={live} />}
        {tab === "banners" && <BannersTab snapshot={snapshot} orderedCatalog={orderedCatalog} onCommit={commit} live={live} />}
        {tab === "rewards" && <RewardsTab snapshot={snapshot} onCommit={commit} live={live} />}
        {tab === "settings" && <SettingsTab snapshot={snapshot} onCommit={commit} live={live} />}
        {tab === "system" && <SystemTab snapshot={snapshot} onCommit={commit} live={live} />}
      </main>

      <footer className="cd-footer">
        <span>MarvelSyllabus Command Deck · Burden with Glorious Syllabus</span>
        <span>Asia/Kolkata · shared catalog, screenings, banners, rewards &amp; activity</span>
      </footer>
    </div>
  );
}

function ActivityTab({ snapshot, clock, live, onOpenScreenings, onOpenCatalog }: { snapshot: AdminSnapshot; clock: number; live: LiveStore | null; onOpenScreenings: () => void; onOpenCatalog: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [refreshError, setRefreshError] = useState("");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  useEffect(() => {
    if (!live) {
      const timer = window.setInterval(() => setLastRefresh(Date.now()), 15000);
      return () => window.clearInterval(timer);
    }
    let cancelled = false;
    const poll = () => {
      void live.refresh().then(
        () => { if (!cancelled) { setLastRefresh(Date.now()); setRefreshError(""); } },
        () => { if (!cancelled) setRefreshError("Live refresh failed. Retrying."); },
      );
      void fetchOverview(live.token).then(
        (data) => { if (!cancelled) setOverview(data); },
        () => { /* overview is best-effort; stat cards already render from snapshot */ },
      );
    };
    poll();
    const timer = window.setInterval(poll, 20000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [live]);

  const filtered = snapshot.activity.filter((entry) => {
    const matchesCategory = category === "all" || entry.category === category;
    const lower = query.trim().toLowerCase();
    const matchesQuery = !lower || `${entry.summary} ${entry.actorSub} ${entry.refLabel} ${entry.category}`.toLowerCase().includes(lower);
    return matchesCategory && matchesQuery;
  });

  return (
    <section className="cd-dash">
      <div className="cd-dash-header">
        <div><p className="cd-eyebrow">LIVE OPERATIONS</p><h1>Activity</h1><p>What has changed across the shared catalog in the last days.</p></div>
        <div className="cd-live-pulse"><i /> Refreshed {Math.max(0, Math.floor((Date.now() - lastRefresh) / 1000))}s ago{live ? " · live" : ""}</div>
      </div>
      {refreshError && <div className="cd-error" role="alert">{refreshError}</div>}

      <div className="cd-stat-grid">
        <StatCard label="Titles" value={overview?.titles ?? snapshot.catalog.length} hint={`${snapshot.catalog.filter((title) => title.active).length} active`} onClick={onOpenCatalog} />
        <StatCard label="Screenings on sale" value={screeningsOnSale(snapshot, clock)} hint={`${snapshot.screenings.filter((item) => item.cancelled).length} cancelled`} onClick={onOpenScreenings} />
        <StatCard label="Bookings" value={overview?.bookings ?? snapshot.campaigns.reduce((sum, campaign) => sum + campaign.grantedCount, 0)} hint={overview ? `${money(overview.revenueMinor)} confirmed revenue · ${overview.activeHolds} live holds` : "revenue visible when live"} onClick={() => undefined} />
        <StatCard label="Doors (24h)" value={overview?.checkins24h ?? 0} hint={overview ? `${overview.upcomingScreenings} upcoming screenings` : "live door counts when signed in"} onClick={() => undefined} />
        <StatCard label="Published banners" value={snapshot.banners.filter((banner) => banner.state === "published").length} hint={`${snapshot.banners.length} total`} onClick={() => undefined} />
        <StatCard label="Active campaigns" value={overview?.activeCampaigns ?? snapshot.campaigns.filter((campaign) => campaign.status === "active").length} hint={`${snapshot.campaigns.reduce((sum, campaign) => sum + campaign.grantedCount, 0)} rewards granted`} onClick={() => undefined} />
      </div>

      <div className="cd-toolbar">
        <label className="cd-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity, actors, or references" /></label>
        <div className="cd-filter">
          <button type="button" className={category === "all" ? "is-active" : ""} onClick={() => setCategory("all")}>All</button>
          {(["catalog", "screening", "banner", "reward", "artwork", "settings", "booking", "ticket", "system"] as const).map((name) => (
            <button key={name} type="button" className={category === name ? "is-active" : ""} onClick={() => setCategory(name)}>{categoryLabel[name]}</button>
          ))}
        </div>
      </div>

      <div className="cd-activity-list">
        {filtered.length ? filtered.map((entry) => (
          <article className="cd-activity-row" key={entry.id}>
            <span className={`cd-cat ${categoryClass[entry.category]}`}>{categoryLabel[entry.category]}</span>
            <p>{entry.summary}{entry.refLabel ? <em> · {entry.refLabel}</em> : ""}</p>
            <span className="cd-actor" title={entry.actorSub}>{entry.actorSub.includes("@") ? entry.actorSub.split("@")[0] : entry.actorSub}</span>
            <time dateTime={entry.occurredAt}>{timeAgo(entry.occurredAt)}</time>
          </article>
        )) : <div className="cd-empty">No activity matches this filter.</div>}
      </div>
    </section>
  );
}

function screeningsOnSale(snapshot: AdminSnapshot, now: number) {
  return snapshot.screenings.filter((item) => screeningStatus(item, now) === "on-sale").length;
}

function StatCard({ label, value, hint, onClick }: { label: string; value: number; hint: string; onClick: () => void }) {
  return <button type="button" className="cd-stat" onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{hint}</small></button>;
}

function CatalogTab({ snapshot, orderedCatalog, onCommit, live }: { snapshot: AdminSnapshot; orderedCatalog: ReturnType<typeof sortCatalog>; onCommit: (next: AdminSnapshot) => void; live: LiveStore | null }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "film" | "series">("all");
  const [editing, setEditing] = useState<{ id: string | null; draft: TitleDraft } | null>(null);
  const [posterBusy, setPosterBusy] = useState(false);
  const [rights, setRights] = useState(false);
  const [seasonText, setSeasonText] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = orderedCatalog.filter((title) =>
    (typeFilter === "all" || title.titleType === typeFilter) &&
    `${title.title} ${title.synopsis} ${title.releaseYear ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const pickSeasons = (titleId: string) => seasonText[titleId] ?? orderedCatalog.find((title) => title.id === titleId)?.seasons?.map((season) => `${season.seasonNumber}:${season.episodeCount}`).join(",") ?? "";

  const saveTitle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || saving) return;
    if (live) {
      setSaving(true);
      setError("");
      void saveCatalogTitleRemote(live.token, editing.id, {
        title: editing.draft.title,
        titleType: editing.draft.titleType,
        synopsis: editing.draft.synopsis,
        releaseYear: editing.draft.releaseYear,
        active: editing.draft.active,
        watchOrder: editing.draft.watchOrder,
        posterKey: editing.draft.posterKey,
      })
        .then(() => live.refresh())
        .then(() => {
          setEditing(null);
          setRights(false);
          setNotice(editing.id ? "Catalog entry saved to the shared backend." : "Title created in the shared catalog.");
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Save failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(upsertTitle(snapshot, editing.id, editing.draft));
    setEditing(null);
    setRights(false);
    setNotice(editing.id ? "Catalog entry saved." : "Title created in the shared catalog.");
  };

  const saveSeasons = (titleId: string) => {
    const seasons = (seasonText[titleId] ?? "").split(",").map((entry) => {
      const [seasonNumber, episodeCount] = entry.trim().split(":").map(Number);
      return { seasonNumber, episodeCount };
    }).filter((season) => Number.isInteger(season.seasonNumber) && season.seasonNumber > 0 && Number.isInteger(season.episodeCount) && season.episodeCount > 0);
    if (live) {
      setSaving(true);
      setError("");
      void saveSeasonsRemote(live.token, titleId, seasons)
        .then(() => live.refresh())
        .then(() => setNotice("Season episode counts saved to the shared backend."))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Save failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(saveSeasonsFor(snapshot, titleId, seasons));
    setNotice("Season episode counts saved.");
  };

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= orderedCatalog.length) return;
    const next = [...orderedCatalog];
    [next[index], next[target]] = [next[target], next[index]];
    const ids = next.map((title) => title.id);
    if (live) {
      setSaving(true);
      void reorderCatalogRemote(live.token, ids)
        .then(() => live.refresh())
        .then(() => setNotice("Catalog order saved to the shared backend."))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Reorder failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(reorderCatalogue(snapshot, ids));
  };

  const toggleActive = (title: ReturnType<typeof sortCatalog>[number]) => {
    if (live) {
      setSaving(true);
      void saveCatalogTitleRemote(live.token, title.id, {
        title: title.title,
        titleType: title.titleType,
        synopsis: title.synopsis,
        releaseYear: title.releaseYear,
        active: !title.active,
        watchOrder: title.watchOrder,
        posterKey: title.posterKey,
      })
        .then(() => live.refresh())
        .then(() => setNotice(`${title.title} is now ${title.active ? "Upcoming" : "Active"} in the shared backend.`))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Save failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(upsertTitle(snapshot, title.id, {
      title: title.title,
      titleType: title.titleType,
      synopsis: title.synopsis,
      releaseYear: title.releaseYear,
      active: !title.active,
      watchOrder: title.watchOrder,
      posterKey: title.posterKey ?? null,
      posterUrl: title.posterUrl,
    }));
    setNotice(`${title.title} is now ${title.active ? "Upcoming" : "Active"}.`);
  };

  const removeTitle = (title: ReturnType<typeof sortCatalog>[number]) => {
    if (snapshot.screenings.some((item) => item.titleId === title.id)) {
      setError(`"${title.title}" still has scheduled screenings. Delete or reassign those screenings first.`);
      return;
    }
    if (!window.confirm(`Delete "${title.title}" from the catalog? This cannot be undone.`)) return;
    if (live) {
      setSaving(true);
      setError("");
      void deleteCatalogTitleRemote(live.token, title.id)
        .then(() => live.refresh())
        .then(() => setNotice(`"${title.title}" deleted from the shared catalog.`))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Delete failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(deleteTitleLocal(snapshot, title.id));
    setNotice(`"${title.title}" deleted from the preview catalog.`);
  };

  const uploadPoster = async (file?: File) => {
    if (!file || !editing) return;
    if (!rights) { setError("Confirm you own or have licensed the artwork before uploading it."); return; }
    setPosterBusy(true);
    setError("");
    try {
      if (live) {
        const { key } = await uploadArtworkRemote(live.token, file);
        setEditing({ ...editing, draft: { ...editing.draft, posterKey: key, posterUrl: null } });
      } else {
        const posterUrl = await readImage(file);
        setEditing({ ...editing, draft: { ...editing.draft, posterUrl } });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Artwork upload failed.");
    } finally {
      setPosterBusy(false);
    }
  };

  return (
    <section className="cd-section">
      <div className="cd-section-header">
        <div><p className="cd-eyebrow">SHARED CATALOG</p><h1>Films &amp; series</h1><p>Order, activate, and edit the single watchlist every customer sees.</p></div>
        <PrimaryButton onClick={() => { setRights(false); setEditing({ id: null, draft: { title: "", titleType: "film", synopsis: "", releaseYear: null, active: false, watchOrder: orderedCatalog.length + 1, posterUrl: null, posterKey: null } }); }}>Add title</PrimaryButton>
      </div>
      {error && <div className="cd-error" role="alert">{error}</div>}
      {notice && <div className="cd-notice" role="status">{notice}</div>}
      <div className="cd-toolbar">
        <label className="cd-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles or descriptions" /></label>
        <div className="cd-filter">
          {(["all", "film", "series"] as const).map((type) => (
            <button key={type} type="button" className={typeFilter === type ? "is-active" : ""} onClick={() => setTypeFilter(type)}>{type === "all" ? "All" : type === "film" ? "Films" : "Series"}</button>
          ))}
        </div>
        <span className="cd-count">{filtered.length} titles</span>
      </div>

      <div className="cd-table cd-title-table">
        <div className="cd-table-head"><span /><span>Title</span><span>State</span><span>Year</span><span>Seasons</span><span>Actions</span></div>
        {filtered.map((title, index) => (
          <div className="cd-table-row" key={title.id}>
            <span className="cd-thumb">{title.posterUrl ? <img src={title.posterUrl} alt="" /> : <b>{title.title.slice(0, 1)}</b>}</span>
            <span className="cd-title-cell">
              <strong>{title.title}</strong>
              <small>{title.titleType === "series" ? `Series · order #${title.watchOrder}` : `Film · order #${title.watchOrder}`}</small>
            </span>
            <span><span className={`cd-chip ${title.active ? "chip-active" : "chip-upcoming"}`}>{title.active ? "Active" : "Upcoming"}</span></span>
            <span>{title.releaseYear ?? "—"}</span>
            <span className="cd-seasons">
              {title.titleType === "series" ? (
                <>
                  <input value={pickSeasons(title.id)} onChange={(event) => setSeasonText({ ...seasonText, [title.id]: event.target.value })} placeholder="1:6,2:8" aria-label={`${title.title} season:episode pairs`} />
                  <button type="button" className="cd-mini" onClick={() => saveSeasons(title.id)}>Save</button>
                </>
              ) : <span className="cd-muted">—</span>}
            </span>
            <span className="cd-actions">
              <button type="button" className="cd-mini" onClick={() => { setRights(false); setEditing({ id: title.id, draft: { title: title.title, titleType: title.titleType, synopsis: title.synopsis, releaseYear: title.releaseYear, active: title.active, watchOrder: title.watchOrder, posterKey: title.posterKey ?? null, posterUrl: title.posterUrl } }); }}>Edit</button>
              <button type="button" className="cd-mini" onClick={() => toggleActive(title)}>{title.active ? "Upcoming" : "Activate"}</button>
              <button type="button" className="cd-mini" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">↑</button>
              <button type="button" className="cd-mini" onClick={() => move(index, 1)} disabled={index === orderedCatalog.length - 1} aria-label="Move down">↓</button>
              <button type="button" className="cd-mini danger" disabled={saving} onClick={() => removeTitle(title)}>Delete</button>
            </span>
          </div>
        ))}
        {!filtered.length && <div className="cd-empty">No titles match this filter.</div>}
      </div>

      {editing && (
        <Modal title={editing.id ? "Edit title" : "Add a title"} onClose={() => setEditing(null)}>
          <form className="cd-form" onSubmit={saveTitle}>
            <Field label="Title"><input required maxLength={250} value={editing.draft.title} onChange={(event) => setEditing({ ...editing, draft: { ...editing.draft, title: event.target.value } })} /></Field>
            {!editing.id && <Field label="Type"><select value={editing.draft.titleType} onChange={(event) => setEditing({ ...editing, draft: { ...editing.draft, titleType: event.target.value as TitleDraft["titleType"] } })}><option value="film">Film</option><option value="series">Series</option></select></Field>}
            <Field label="Synopsis"><textarea rows={4} value={editing.draft.synopsis} onChange={(event) => setEditing({ ...editing, draft: { ...editing.draft, synopsis: event.target.value } })} /></Field>
            <Field label="Release year"><input type="number" min="1888" max="2200" value={editing.draft.releaseYear ?? ""} onChange={(event) => setEditing({ ...editing, draft: { ...editing.draft, releaseYear: event.target.value ? Number(event.target.value) : null } })} /></Field>
            <label className="cd-checkbox"><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} />I confirm this artwork is owned or licensed for this catalog.</label>
            <Field label="Rights-cleared poster"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={!rights || posterBusy} onChange={(event) => void uploadPoster(event.target.files?.[0])} /></Field>
            <p className="cd-note">{editing.draft.posterUrl ? "Poster attached for this title." : "No poster uploaded. The placeholder tile will be shown."}</p>
            <label className="cd-checkbox"><input type="checkbox" checked={editing.draft.active} onChange={(event) => setEditing({ ...editing, draft: { ...editing.draft, active: event.target.checked } })} />Active (otherwise shown as Upcoming; booking stays closed)</label>
            <Field label="Watch order"><input type="number" min="1" value={editing.draft.watchOrder} onChange={(event) => setEditing({ ...editing, draft: { ...editing.draft, watchOrder: Number(event.target.value) } })} /></Field>
            <footer className="cd-form-footer"><OutlineButton onClick={() => setEditing(null)}>Cancel</OutlineButton><PrimaryButton type="submit" disabled={posterBusy}>{editing.id ? "Save title" : "Create title"}</PrimaryButton></footer>
          </form>
        </Modal>
      )}
    </section>
  );
}

type ScreeningForm = { titleId: string; seasonNumber: string; episodeStart: string; episodeEnd: string; startsAt: string; endsAt: string; location: string; capacity: string; price: string; salesOpenAt: string; salesCloseAt: string };

const emptyScreeningForm = (): ScreeningForm => ({
  titleId: "",
  seasonNumber: "",
  episodeStart: "1",
  episodeEnd: "1",
  startsAt: "",
  endsAt: "",
  location: "",
  capacity: "100",
  price: "0",
  salesOpenAt: "",
  salesCloseAt: "",
});

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function ScreeningsTab({ snapshot, orderedCatalog, onCommit, live }: { snapshot: AdminSnapshot; orderedCatalog: ReturnType<typeof sortCatalog>; onCommit: (next: AdminSnapshot) => void; live: LiveStore | null }) {
  const [form, setForm] = useState<ScreeningForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedTitle = form ? orderedCatalog.find((title) => title.id === form.titleId) : undefined;
  const selectedSeason = form && selectedTitle?.titleType === "series" ? selectedTitle.seasons?.find((season) => season.seasonNumber === Number(form.seasonNumber)) : undefined;

  const schedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || saving) return;
    const draft: ScreeningDraft = {
      titleId: form.titleId,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      location: form.location,
      capacity: Number(form.capacity),
      priceMinor: Math.round(Number(form.price) * 100),
    };
    if (selectedTitle?.titleType === "series") {
      draft.seasonNumber = Number(form.seasonNumber);
      draft.episodeStart = Number(form.episodeStart);
      draft.episodeEnd = Number(form.episodeEnd);
    }
    if (live) {
      setSaving(true);
      setError("");
      void createScreeningRemote(live.token, draft)
        .then(() => live.refresh())
        .then(() => {
          setForm(null);
          setNotice("Screening scheduled in the shared backend. Booking opens only when the title is active.");
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Schedule failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(addScreening(snapshot, draft));
    setForm(null);
    setNotice("Screening added. Booking opens only when the title is active.");
  };

  const setCancelled = (id: string, cancelled: boolean) => {
    if (live) {
      setSaving(true);
      setError("");
      void setScreeningCancelledRemote(live.token, id, cancelled)
        .then(() => live.refresh())
        .then(() => setNotice(cancelled ? "Screening cancelled. Its tickets are invalid." : "Screening reopened."))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Update failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(toggleScreeningCancelled(snapshot, id, cancelled));
  };

  const saveEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || !editingId || saving) return;
    const patch = {
      location: form.location,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      capacity: Number(form.capacity),
      priceMinor: Math.round(Number(form.price) * 100),
      salesOpenAt: form.salesOpenAt ? new Date(form.salesOpenAt).toISOString() : null,
      salesCloseAt: form.salesCloseAt ? new Date(form.salesCloseAt).toISOString() : null,
    };
    if (live) {
      setSaving(true);
      setError("");
      void updateScreeningRemote(live.token, editingId, patch)
        .then(() => live.refresh())
        .then(() => {
          setForm(null);
          setEditingId(null);
          setNotice("Screening updated in the shared backend.");
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Update failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(updateScreeningLocal(snapshot, editingId, {
      location: patch.location,
      startsAt: patch.startsAt,
      endsAt: patch.endsAt,
      capacity: patch.capacity,
      priceMinor: patch.priceMinor,
      salesOpenAt: patch.salesOpenAt,
      salesCloseAt: patch.salesCloseAt,
    }));
    setForm(null);
    setEditingId(null);
    setNotice("Screening updated.");
  };

  const remove = (id: string, title: string) => {
    if (!window.confirm(`Delete the ${title} screening? Only screenings without confirmed bookings or live holds can be deleted.`)) return;
    if (live) {
      setSaving(true);
      setError("");
      void deleteScreeningRemote(live.token, id)
        .then(() => live.refresh())
        .then(() => setNotice("Screening deleted from the shared backend."))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Delete failed — it may still have bookings or holds."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(deleteScreeningLocal(snapshot, id));
    setNotice("Screening deleted from the preview catalog.");
  };

  const startEdit = (id: string) => {
    const item = snapshot.screenings.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setForm({
      titleId: item.titleId,
      seasonNumber: item.seasonNumber ? String(item.seasonNumber) : "",
      episodeStart: item.episodeStart ? String(item.episodeStart) : "1",
      episodeEnd: item.episodeEnd ? String(item.episodeEnd) : "1",
      startsAt: toLocalInput(item.startsAt),
      endsAt: toLocalInput(item.endsAt),
      location: item.location,
      capacity: String(item.capacity),
      price: String(item.priceMinor / 100),
      salesOpenAt: toLocalInput(item.salesOpenAt),
      salesCloseAt: toLocalInput(item.salesCloseAt),
    });
  };

  return (
    <section className="cd-section">
      <div className="cd-section-header">
        <div><p className="cd-eyebrow">PUBLISHED SHOWINGS</p><h1>Screenings</h1><p>Schedule films and series events with capacity, price, and sales windows.</p></div>
        <PrimaryButton onClick={() => { setEditingId(null); setForm(emptyScreeningForm()); }}>Schedule screening</PrimaryButton>
      </div>
      {notice && <div className="cd-notice" role="status">{notice}</div>}
      {error && <div className="cd-error" role="alert">{error}</div>}
      <div className="cd-screening-list">
        {screeningList(snapshot).map((screening) => {
          const status = screeningStatus(screening);
          const sold = screening.soldCount + screening.heldCount;
          const pct = screening.capacity ? Math.min(100, Math.round((sold / screening.capacity) * 100)) : 100;
          const upcoming = Date.parse(screening.startsAt) > Date.now();
          return (
            <article className="cd-screening" key={screening.id}>
              <div className="cd-screening-date"><strong>{dateOnly.format(new Date(screening.startsAt))}</strong><span>{timeOnly.format(new Date(screening.startsAt))} IST</span></div>
              <div className="cd-screening-title"><strong>{screening.title}</strong><small>{screening.location}{screening.seasonNumber ? ` · Season ${screening.seasonNumber}, E${screening.episodeStart}–${screening.episodeEnd}` : ""}</small><span className="cd-muted">₹{screening.priceMinor / 100} · {fmtDateTime(screening.startsAt)}</span></div>
              <div className="cd-screening-occupancy"><div className="cd-capacity-bar"><i style={{ width: `${pct}%` }} /></div><small>{screening.soldCount} sold · {remainingCapacity(screening)} remaining</small></div>
              <span className={`cd-chip ${screening.cancelled ? "chip-cancelled" : "chip-active"}`}>{screening.cancelled ? "Cancelled" : status.replace(/-/g, " ")}</span>
              <div className="cd-actions">
                <button type="button" className="cd-mini" disabled={saving} onClick={() => startEdit(screening.id)}>Edit</button>
                {upcoming && <button type="button" className="cd-mini" disabled={saving} onClick={() => setCancelled(screening.id, !screening.cancelled)}>{screening.cancelled ? "Reopen" : "Cancel"}</button>}
                <button type="button" className="cd-mini danger" disabled={saving} onClick={() => remove(screening.id, screening.title)}>Delete</button>
              </div>
            </article>
          );
        })}
        {!screeningList(snapshot).length && <div className="cd-empty">No screenings have been scheduled yet.</div>}
      </div>

      {form && !editingId && (
        <Modal title="Schedule a screening" onClose={() => setForm(null)}>
          <form className="cd-form" onSubmit={schedule}>
            <Field label="Title">
              <select required value={form.titleId} onChange={(event) => setForm({ ...form, titleId: event.target.value, seasonNumber: "" })}><option value="">Choose a title</option>{orderedCatalog.map((title) => <option key={title.id} value={title.id}>{title.title} · {title.titleType}</option>)}</select>
            </Field>
            {selectedTitle?.titleType === "series" && (
              <>
                <Field label="Season"><select required value={form.seasonNumber} onChange={(event) => setForm({ ...form, seasonNumber: event.target.value })}><option value="">Choose a season</option>{(selectedTitle.seasons ?? []).map((season) => <option key={season.seasonNumber} value={season.seasonNumber}>Season {season.seasonNumber} · {season.episodeCount} episodes</option>)}</select></Field>
                {selectedSeason && (
                  <div className="cd-two-col">
                    <Field label="First episode"><input type="number" min="1" max={selectedSeason.episodeCount} required value={form.episodeStart} onChange={(event) => setForm({ ...form, episodeStart: event.target.value })} /></Field>
                    <Field label="Last episode"><input type="number" min={form.episodeStart} max={selectedSeason.episodeCount} required value={form.episodeEnd} onChange={(event) => setForm({ ...form, episodeEnd: event.target.value })} /></Field>
                  </div>
                )}
              </>
            )}
            <div className="cd-two-col">
              <Field label="Start date &amp; time"><input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></Field>
              <Field label="End date &amp; time"><input required type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></Field>
            </div>
            <Field label="Venue / location"><input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></Field>
            <div className="cd-two-col">
              <Field label="Capacity"><input type="number" min="1" required value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></Field>
              <Field label="Ticket price (₹)"><input type="number" min="0" step="0.01" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
            </div>
            <div className="cd-two-col">
              <Field label="Sales open at (optional)"><input type="datetime-local" value={form.salesOpenAt} onChange={(event) => setForm({ ...form, salesOpenAt: event.target.value })} /></Field>
              <Field label="Sales close at (optional)"><input type="datetime-local" value={form.salesCloseAt} onChange={(event) => setForm({ ...form, salesCloseAt: event.target.value })} /></Field>
            </div>
            <p className="cd-note">A screening can be scheduled while its title is Upcoming. Sales open only after activation. Leave the sales window empty to open on publication and close at showtime.</p>
            <footer className="cd-form-footer"><OutlineButton onClick={() => setForm(null)}>Cancel</OutlineButton><PrimaryButton type="submit">Save screening</PrimaryButton></footer>
          </form>
        </Modal>
      )}
      {form && editingId && (
        <Modal title="Edit screening" onClose={() => { setForm(null); setEditingId(null); }}>
          <form className="cd-form" onSubmit={saveEdit}>
            <div className="cd-two-col">
              <Field label="Start date &amp; time"><input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></Field>
              <Field label="End date &amp; time"><input required type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></Field>
            </div>
            <Field label="Venue / location"><input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></Field>
            <div className="cd-two-col">
              <Field label="Capacity"><input type="number" min="1" required value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></Field>
              <Field label="Ticket price (₹)"><input type="number" min="0" step="0.01" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
            </div>
            <div className="cd-two-col">
              <Field label="Sales open at (optional)"><input type="datetime-local" value={form.salesOpenAt} onChange={(event) => setForm({ ...form, salesOpenAt: event.target.value })} /></Field>
              <Field label="Sales close at (optional)"><input type="datetime-local" value={form.salesCloseAt} onChange={(event) => setForm({ ...form, salesCloseAt: event.target.value })} /></Field>
            </div>
            <footer className="cd-form-footer"><OutlineButton onClick={() => { setForm(null); setEditingId(null); }}>Cancel</OutlineButton><PrimaryButton type="submit" disabled={saving}>Save changes</PrimaryButton></footer>
          </form>
        </Modal>
      )}
    </section>
  );
}

function BookingsTab({ snapshot, live }: { snapshot: AdminSnapshot; live: LiveStore | null }) {
  const [screeningId, setScreeningId] = useState("");
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [holds, setHolds] = useState<BookingHold[]>([]);
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [doorCounts, setDoorCounts] = useState<{ soldCount: number; checkedInCount: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticketInput, setTicketInput] = useState("");
  const [ticketResult, setTicketResult] = useState("");

  const list = [...snapshot.screenings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const selected = list.find((item) => item.id === screeningId);
  const pendingCount = bookings.filter((booking) => booking.status === "payment_pending").length;

  const load = useCallback((id: string, token: string | null) => {
    if (!id) {
      setBookings([]);
      setHolds([]);
      setCheckins([]);
      setDoorCounts(null);
      return;
    }
    setBusy(true);
    setError("");
    void Promise.all([
      fetchAdminBookings(token, id).catch(() => [] as AdminBooking[]),
      fetchAdminHolds(token, id).catch(() => [] as BookingHold[]),
      fetchCheckins(token, id).catch(() => [] as CheckinRecord[]),
      fetchStaffScreenings(token).catch(() => []),
    ])
      .then(([bookingRows, holdRows, checkinRows, staffRows]) => {
        setBookings(bookingRows);
        setHolds(holdRows);
        setCheckins(checkinRows);
        const match = (staffRows as { id: string; soldCount: number; checkedInCount: number }[]).find((row) => row.id === id);
        setDoorCounts(match ? { soldCount: match.soldCount, checkedInCount: match.checkedInCount } : null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Load failed."))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!list.length && !screeningId) return;
    const fallback = screeningId || list[0]?.id || "";
    if (fallback && fallback !== screeningId) setScreeningId(fallback);
  }, [list, screeningId]);

  useEffect(() => {
    if (live && screeningId) {
      load(screeningId, live.token);
      const timer = window.setInterval(() => load(screeningId, live.token), 20000);
      return () => window.clearInterval(timer);
    }
  }, [live, screeningId, load]);

  const mutateBooking = (bookingId: string, action: "confirm" | "refund" | "cancel") => {
    if (!live) return;
    const label = action === "confirm" ? "Confirm" : action === "refund" ? "Refund" : "Cancel";
    const prompt = action === "confirm"
      ? "Confirm this booking? It becomes a scannable ticket at the door."
      : `${label} this booking? Its ticket becomes invalid immediately.`;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    const request = action === "confirm"
      ? confirmBookingRemote(live.token, bookingId)
      : action === "refund"
        ? refundBookingRemote(live.token, bookingId)
        : cancelBookingRemote(live.token, bookingId);
    void request
      .then(() => {
        setNotice(`Booking ${action === "confirm" ? "confirmed" : action === "refund" ? "refunded" : "cancelled"}.`);
        load(screeningId, live.token);
        void live.refresh();
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Update failed."))
      .finally(() => setBusy(false));
  };

  const dropHold = (holdId: string) => {
    if (!live) return;
    setBusy(true);
    void releaseHoldRemote(live.token, holdId)
      .then(() => {
        setNotice("Hold released — inventory is back on sale.");
        load(screeningId, live.token);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Release failed."))
      .finally(() => setBusy(false));
  };

  const lookupTicket = (mode: "validate" | "check-in") => {
    if (!live) return;
    let code: string;
    try {
      code = normalizeTicketCode(ticketInput);
    } catch {
      setTicketResult("That code does not look like MSY-XXXX-XXXX.");
      return;
    }
    setBusy(true);
    setTicketResult("");
    if (mode === "validate") {
      void validateStaffTicketRemote(live.token, code)
        .then((result) => {
          setTicketResult(`Lookup: ${result.status} — ${result.title ?? code}${result.location ? ` · ${result.location}` : ""}`);
          if (screeningId) load(screeningId, live.token);
        })
        .catch((cause: unknown) => setTicketResult(cause instanceof Error ? cause.message : "Ticket lookup failed."))
        .finally(() => setBusy(false));
      return;
    }
    void checkInStaffTicketRemote(live.token, code)
      .then((result) => {
        setTicketResult(`Check-in: ${result.status} — ${result.code}`);
        if (screeningId) load(screeningId, live.token);
      })
      .catch((cause: unknown) => setTicketResult(cause instanceof Error ? cause.message : "Ticket lookup failed."))
      .finally(() => setBusy(false));
  };

  return (
    <section className="cd-section">
      <div className="cd-section-header">
        <div><p className="cd-eyebrow">TICKETS &amp; DOORS</p><h1>Bookings</h1><p>Every booking, hold, and door scan for one screening — plus the staff validate/check-in tool.</p></div>
      </div>
      {!live && <div className="cd-notice" role="status">The Command Deck could not reach the shared backend. Preview mode shows the schedule only.</div>}
      {notice && <div className="cd-notice" role="status">{notice}</div>}
      {error && <div className="cd-error" role="alert">{error}</div>}
      <div className="cd-toolbar">
        <label className="cd-search"><span aria-hidden="true">▦</span>
          <select value={screeningId} onChange={(event) => setScreeningId(event.target.value)} aria-label="Screening">
            <option value="">Choose a screening</option>
            {list.map((item) => <option key={item.id} value={item.id}>{item.title} · {dateOnly.format(new Date(item.startsAt))} · {item.location}</option>)}
          </select>
        </label>
        {selected && <span className="cd-count">{selected.soldCount} sold · {remainingCapacity(selected)} remaining · {selected.capacity} capacity</span>}
        {doorCounts && <span className="cd-count">Doors: {doorCounts.checkedInCount} checked in / {doorCounts.soldCount} sold</span>}
      </div>

      <div className="cd-detail-grid">
        <section>
          <h4 className="cd-h4">Bookings ({bookings.length}){pendingCount > 0 && <span className="cd-count" style={{ marginLeft: 10 }}>{pendingCount} awaiting confirmation</span>}</h4>
          {bookings.length ? (
            <table className="cd-mini-table">
              <thead><tr><th>Order</th><th>Qty</th><th>Status</th><th>Ticket</th><th /></tr></thead>
              <tbody>{bookings.map((booking) => (
                <tr key={booking.id}>
                  <td><code>{booking.orderCode}</code><small>{booking.amountMinor != null ? money(booking.amountMinor) : ""} · {booking.userId.slice(0, 12)}…</small></td>
                  <td>{booking.quantity}</td>
                  <td><span className={`cd-chip ${booking.status === "confirmed" ? "chip-active" : booking.status === "payment_pending" ? "chip-upcoming" : "chip-cancelled"}`}>{booking.status === "payment_pending" ? "awaiting confirmation" : booking.status}</span></td>
                  <td><span className={`cd-chip ${booking.ticketStatus === "valid" ? "chip-active" : booking.ticketStatus === "used" ? "chip-upcoming" : "chip-cancelled"}`}>{booking.ticketStatus}</span></td>
                  <td>{booking.status === "payment_pending" ? <span className="cd-actions">
                    <button type="button" className="cd-mini" disabled={busy} onClick={() => mutateBooking(booking.id, "confirm")}>Confirm</button>
                    <button type="button" className="cd-mini danger" disabled={busy} onClick={() => mutateBooking(booking.id, "cancel")}>Cancel</button>
                  </span> : booking.status === "confirmed" ? <span className="cd-actions">
                    <button type="button" className="cd-mini" disabled={busy} onClick={() => mutateBooking(booking.id, "refund")}>Refund</button>
                    <button type="button" className="cd-mini danger" disabled={busy} onClick={() => mutateBooking(booking.id, "cancel")}>Cancel</button>
                  </span> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="cd-muted">{live && screeningId ? (busy ? "Loading…" : "No bookings for this screening yet.") : "Pick a screening to inspect its bookings."}</p>}
        </section>
        <section>
          <h4 className="cd-h4">Live holds ({holds.length})</h4>
          {holds.length ? (
            <table className="cd-mini-table">
              <thead><tr><th>Holder</th><th>Qty</th><th>Expires</th><th /></tr></thead>
              <tbody>{holds.map((hold) => (
                <tr key={hold.id}><td><code>{hold.userId.slice(0, 16)}…</code></td><td>{hold.quantity}</td><td>{fmtDateTime(hold.expiresAt)}</td>
                  <td><button type="button" className="cd-mini" disabled={busy} onClick={() => dropHold(hold.id)}>Release</button></td></tr>
              ))}</tbody>
            </table>
          ) : <p className="cd-muted">No live holds.</p>}
          <h4 className="cd-h4" style={{ marginTop: 18 }}>Door scans ({checkins.length})</h4>
          {checkins.length ? (
            <table className="cd-mini-table">
              <thead><tr><th>Order</th><th>Result</th><th>Staff</th><th>At</th></tr></thead>
              <tbody>{checkins.slice(0, 20).map((scan) => (
                <tr key={scan.id}><td><code>{scan.orderCode}</code></td><td>{scan.result}</td><td>{scan.staffSub.slice(0, 12)}…</td><td>{fmtDateTime(scan.createdAt)}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="cd-muted">No scans recorded for this screening yet.</p>}
        </section>
      </div>

      <section className="cd-settings-form" style={{ marginTop: 22 }}>
        <h4 className="cd-h4">Staff validate / check-in</h4>
        <p className="cd-note">Same ticket contract as the door app: <code>MSY-XXXX-XXXX</code> or <code>marvelsyllabus://ticket/MSY-XXXX-XXXX</code>. Validate looks up without changing state; check-in admits exactly once.</p>
        <div className="cd-toolbar">
          <label className="cd-search"><span aria-hidden="true">⌕</span><input value={ticketInput} onChange={(event) => setTicketInput(event.target.value)} placeholder="MSY-XXXX-XXXX" disabled={!live} /></label>
          <OutlineButton onClick={() => lookupTicket("validate")}>Validate</OutlineButton>
          <PrimaryButton onClick={() => lookupTicket("check-in")}>Check in</PrimaryButton>
        </div>
        {ticketResult && <div className="cd-notice" role="status">{ticketResult}</div>}
      </section>
    </section>
  );
}

function SystemTab({ snapshot, onCommit, live }: { snapshot: AdminSnapshot; onCommit: (next: AdminSnapshot) => void; live: LiveStore | null }) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importText, setImportText] = useState("");

  const runImport = () => {
    if (!live) {
      setError("Catalog import writes to the shared database, but the Command Deck cannot reach it right now.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setError("That is not valid JSON. Paste an array of catalog entries.");
      return;
    }
    const entries = Array.isArray(parsed) ? parsed : (parsed as { entries?: unknown }).entries;
    if (!Array.isArray(entries) || !entries.length) {
      setError("Expected a JSON array of entries with id, title, titleType, and watchOrder.");
      return;
    }
    setBusy(true);
    setError("");
    void importCatalogRemote(live.token, entries as { id: string; title: string; titleType: string; watchOrder: number }[])
      .then((result) => live.refresh().then(() => {
        setNotice(`Imported ${result.imported} titles. Repeat imports never overwrite existing rows.`);
        setImportText("");
      }))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Import failed."))
      .finally(() => setBusy(false));
  };

  return (
    <section className="cd-section">
      <div className="cd-section-header">
        <div><p className="cd-eyebrow">DATA &amp; LAUNCH</p><h1>System</h1><p>Imports, demo controls, backend status, and the public-launch checklist.</p></div>
      </div>
      {notice && <div className="cd-notice" role="status">{notice}</div>}
      {error && <div className="cd-error" role="alert">{error}</div>}

      <div className="cd-detail-grid">
        <section>
          <h4 className="cd-h4">Backend status</h4>
          <table className="cd-mini-table">
            <tbody>
              <tr><td>Mode</td><td>{live ? "Live · shared Postgres backend" : "Preview · browser-local demo store"}</td></tr>
              <tr><td>Catalog rows</td><td>{snapshot.catalog.length}</td></tr>
              <tr><td>Screenings</td><td>{snapshot.screenings.length}</td></tr>
              <tr><td>Banners</td><td>{snapshot.banners.length}</td></tr>
              <tr><td>Campaigns</td><td>{snapshot.campaigns.length}</td></tr>
              <tr><td>Activity entries</td><td>{snapshot.activity.length}</td></tr>
            </tbody>
          </table>
          {snapshot.source === "demo" && (
            <div className="cd-code-add">
              <p className="cd-note">Preview data lives only in this browser. Resetting restores the original 8-title seed.</p>
              <OutlineButton onClick={() => { if (window.confirm("Reset all demo data to the original seed?")) { onCommit(resetAdminData()); setNotice("Demo data reset."); } }}>Reset demo data</OutlineButton>
            </div>
          )}
        </section>
        <section>
          <h4 className="cd-h4">One-time catalog import</h4>
          <p className="cd-note">Paste the watchlist JSON array (or <code>{"{"}"entries": […]{"}"}</code>). IDs, titles, types, descriptions, release years, and <code>suggested_watch_order</code> are copied; artwork is never imported and every title starts Upcoming. Conflicts are left untouched.</p>
          <div className="cd-code-add">
            <textarea rows={6} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='[{ "id": "iron-man", "title": "Iron Man", "titleType": "film", "watchOrder": 2 }]' aria-label="Catalog import JSON" />
            <PrimaryButton onClick={runImport}>Import to shared catalog</PrimaryButton>
          </div>
        </section>
      </div>

      <section style={{ marginTop: 22 }}>
        <h4 className="cd-h4">Public-launch checklist</h4>
        <table className="cd-mini-table">
          <thead><tr><th>Step</th><th>Where</th><th>Done when</th></tr></thead>
          <tbody>
            <tr><td>Migrate Neon (001 → 006, in order)</td><td><code>prototype/db/</code></td><td>Every migration applied to the production project</td></tr>
            <tr><td>Set Vercel env vars</td><td>Project → Settings → Environment Variables</td><td><code>DATABASE_URL</code> and <code>OBJECT_STORAGE_*</code> present for Production and Preview</td></tr>
            <tr><td>Demo mode (no Clerk)</td><td>Leave <code>CLERK_ISSUER</code> / <code>CLERK_JWKS_URL</code> unset</td><td>Customer app books as a guest; this deck confirms pending bookings via <code>x-demo-admin</code></td></tr>
            <tr><td>Manual payments</td><td>Leave <code>PAYMENTS_MODE</code> unset</td><td>Bookings arrive as <code>payment_pending</code> and Confirm turns them into scannable tickets</td></tr>
            <tr><td>Deploy both apps</td><td>Vercel → customer prototype + admin command deck</td><td><code>npm run build</code> green; <code>/api/health</code> reports <code>database: true</code></td></tr>
            <tr><td>Import catalog once</td><td>This tab ↑</td><td>Titles visible as Upcoming; preview ribbon gone on customer app</td></tr>
            <tr><td>Activate + schedule + confirm</td><td>Catalog → Screenings → Bookings</td><td>Reserve → pending booking → Confirm → QR scans at the door → re-scan shows <code>already_used</code></td></tr>
            <tr><td>Restore one encrypted backup</td><td>Disposable Neon project</td><td>Restore succeeds before the first public booking</td></tr>
          </tbody>
        </table>
      </section>
    </section>
  );
}

function screeningList(snapshot: AdminSnapshot) {
  return [...snapshot.screenings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

type BannerForm = {
  __id?: string;
  kicker: string;
  title: string;
  copy: string;
  imageUrl: string | null;
  accent: BannerAccent;
  destinationTitleId: string;
  destinationScreeningId: string;
  state: "draft" | "published";
  publishAt: string;
  unpublishAt: string;
};

const emptyBannerForm = (): BannerForm => ({ kicker: "", title: "", copy: "", imageUrl: null, accent: "teal", destinationTitleId: "", destinationScreeningId: "", state: "draft", publishAt: "", unpublishAt: "" });

function BannersTab({ snapshot, orderedCatalog, onCommit, live }: { snapshot: AdminSnapshot; orderedCatalog: ReturnType<typeof sortCatalog>; onCommit: (next: AdminSnapshot) => void; live: LiveStore | null }) {
  const [form, setForm] = useState<BannerForm | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const bannerToForm = (banner: AdminSnapshot["banners"][number]): BannerForm => ({
    kicker: banner.kicker,
    title: banner.title,
    copy: banner.copy,
    imageUrl: banner.imageKey,
    accent: banner.accent,
    destinationTitleId: banner.destinationTitleId ?? "",
    destinationScreeningId: banner.destinationScreeningId ?? "",
    state: banner.state,
    publishAt: banner.publishAt ?? "",
    unpublishAt: banner.unpublishAt ?? "",
  });

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || saving) return;
    if (form.publishAt && form.unpublishAt && new Date(form.unpublishAt) <= new Date(form.publishAt)) {
      setError("The unpublish time must be after the publish time.");
      return;
    }
    const toKey = (url: string | null): string | null => {
      if (!url) return null;
      if (url.startsWith("artwork/")) return url;
      return null;
    };
    const draft: BannerDraft = {
      kicker: form.kicker,
      title: form.title,
      copy: form.copy,
      imageUrl: form.imageUrl,
      accent: form.accent,
      destinationTitleId: form.destinationTitleId || null,
      destinationScreeningId: form.destinationScreeningId || null,
      state: form.state,
      publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : null,
      unpublishAt: form.unpublishAt ? new Date(form.unpublishAt).toISOString() : null,
    };
    const wasEditing = form.__id !== undefined;
    if (live) {
      setSaving(true);
      setError("");
      const remoteDraft = {
        kicker: draft.kicker,
        title: draft.title,
        copy: draft.copy,
        imageKey: toKey(form.imageUrl),
        accent: draft.accent,
        destinationTitleId: draft.destinationTitleId,
        destinationScreeningId: draft.destinationScreeningId,
        state: draft.state,
        publishAt: draft.publishAt,
        unpublishAt: draft.unpublishAt,
      };
      void saveBannerRemote(live.token, wasEditing ? form.__id ?? null : null, remoteDraft)
        .then(() => live.refresh())
        .then(() => {
          setForm(null);
          setNotice(`Banner saved as ${draft.state} in the shared backend.`);
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Save failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(upsertBanner(snapshot, wasEditing ? form.__id ?? null : null, draft));
    setForm(null);
    setNotice(`Banner saved as ${draft.state}.`);
  };

  const remove = (id: string, title: string) => {
    if (!window.confirm(`Delete banner "${title}"?`)) return;
    if (live) {
      setSaving(true);
      setError("");
      void deleteBannerRemote(live.token, id)
        .then(() => live.refresh())
        .then(() => setNotice("Banner deleted from the shared backend."))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Delete failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(deleteBanner(snapshot, id));
  };

  const flipState = (banner: AdminSnapshot["banners"][number]) => {
    const next = banner.state === "published" ? "draft" : "published";
    if (live) {
      setSaving(true);
      setError("");
      void saveBannerRemote(live.token, banner.id, {
        kicker: banner.kicker,
        title: banner.title,
        copy: banner.copy,
        imageKey: banner.imageKey,
        accent: banner.accent,
        destinationTitleId: banner.destinationTitleId,
        destinationScreeningId: banner.destinationScreeningId,
        state: next,
        publishAt: banner.publishAt,
        unpublishAt: banner.unpublishAt,
      })
        .then(() => live.refresh())
        .then(() => setNotice(`Banner ${next} in the shared backend.`))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Save failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(upsertBanner(snapshot, banner.id, { ...(bannerToForm(banner) as BannerDraft), state: next }));
  };

  return (
    <section className="cd-section">
      <div className="cd-section-header">
        <div><p className="cd-eyebrow">PROMOTIONAL SLOTS</p><h1>Banners</h1><p>Managed campaign layouts with draft/published state and optional windows.</p></div>
        <PrimaryButton onClick={() => { setForm(emptyBannerForm()); }}>New banner</PrimaryButton>
      </div>
      {error && <div className="cd-error" role="alert">{error}</div>}
      {notice && <div className="cd-notice" role="status">{notice}</div>}
      <div className="cd-banner-grid">
        {snapshot.banners.map((banner) => (
          <article className="cd-banner" key={banner.id} data-accent={banner.accent}>
            <div className="cd-banner-art">{banner.imageKey ? <img src={banner.imageKey} alt="" /> : <span className="cd-banner-placeholder">B</span>}</div>
            <div className="cd-banner-copy">
              <p className="cd-eyebrow">{banner.kicker || "PROMO"}</p>
              <h3>{banner.title}</h3>
              <p>{banner.copy}</p>
              <div className="cd-banner-meta">
                <span className={`cd-chip ${banner.state === "published" ? "chip-active" : "chip-upcoming"}`}>{banner.state}</span>
                <small>{banner.publishAt ? `Publish ${fmtDateTime(banner.publishAt)}` : "No publish window"}{banner.unpublishAt ? ` · unpublishes ${fmtDateTime(banner.unpublishAt)}` : ""}</small>
              </div>
            </div>
            <div className="cd-actions">
              <button type="button" className="cd-mini" disabled={saving} onClick={() => setForm({ ...bannerToForm(banner), __id: banner.id })}>Edit</button>
              <button type="button" className="cd-mini" disabled={saving} onClick={() => flipState(banner)}>{banner.state === "published" ? "Unpublish" : "Publish"}</button>
              <button type="button" className="cd-mini danger" disabled={saving} onClick={() => remove(banner.id, banner.title)}>Delete</button>
            </div>
          </article>
        ))}
        {!snapshot.banners.length && <div className="cd-empty">No banners yet.</div>}
      </div>

      {form && (
        <Modal title={form.__id ? "Edit banner" : "New banner"} onClose={() => setForm(null)}>
          <form className="cd-form" onSubmit={save}>
            <div className="cd-two-col"><Field label="Kicker"><input maxLength={120} value={form.kicker} onChange={(event) => setForm({ ...form, kicker: event.target.value })} /></Field><Field label="Accent"><select value={form.accent} onChange={(event) => setForm({ ...form, accent: event.target.value as BannerAccent })}><option value="teal">Teal</option><option value="violet">Violet</option><option value="coral">Coral</option></select></Field></div>
            <Field label="Title"><input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
            <Field label="Copy"><textarea rows={3} maxLength={1000} value={form.copy} onChange={(event) => setForm({ ...form, copy: event.target.value })} /></Field>
            <Field label="Artwork"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (live) { setSaving(true); void uploadArtworkRemote(live.token, file).then(({ key }) => setForm((current) => current ? { ...current, imageUrl: key } : current)).catch(() => setError("Artwork upload failed.")).finally(() => setSaving(false)); } else { void readImage(file).then((imageUrl) => setForm((current) => current ? { ...current, imageUrl } : current)).catch(() => setError("Artwork upload failed.")); } }} /></Field>
            <p className="cd-note">{form.imageUrl ? "Artwork attached." : "No artwork. The banner falls back to an accent tile."}</p>
            <div className="cd-two-col">
              <Field label="Destination title"><select value={form.destinationTitleId} onChange={(event) => setForm({ ...form, destinationTitleId: event.target.value })}><option value="">None</option>{orderedCatalog.map((title) => <option key={title.id} value={title.id}>{title.title}</option>)}</select></Field>
              <Field label="Destination screening"><select value={form.destinationScreeningId} onChange={(event) => setForm({ ...form, destinationScreeningId: event.target.value })}><option value="">None</option>{screeningList(snapshot).map((item) => <option key={item.id} value={item.id}>{item.title} · {dateOnly.format(new Date(item.startsAt))}</option>)}</select></Field>
            </div>
            <div className="cd-two-col">
              <Field label="Publish at"><input type="datetime-local" value={form.publishAt} onChange={(event) => setForm({ ...form, publishAt: event.target.value })} /></Field>
              <Field label="Unpublish at"><input type="datetime-local" value={form.unpublishAt} onChange={(event) => setForm({ ...form, unpublishAt: event.target.value })} /></Field>
            </div>
            <Field label="State"><select value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value as "draft" | "published" })}><option value="draft">Draft</option><option value="published">Published</option></select></Field>
            <footer className="cd-form-footer"><OutlineButton onClick={() => setForm(null)}>Cancel</OutlineButton><PrimaryButton type="submit">Save banner</PrimaryButton></footer>
          </form>
        </Modal>
      )}
    </section>
  );
}

function RewardsTab({ snapshot, onCommit, live }: { snapshot: AdminSnapshot; onCommit: (next: AdminSnapshot) => void; live: LiveStore | null }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newForm, setNewForm] = useState<null | {
    name: string;
    rewardKind: "coupon" | "discount" | "free-ticket";
    discountPercent: string;
    freeTicketScreeningId: string;
    requiredPlays: string;
    completionWindowDays: string;
    rewardExpiryDays: string;
    rewardCap: string;
    instructions: string;
    allowOverlap: boolean;
  }>(null);
  const [codeInput, setCodeInput] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const statusClass = (status: string) => status === "active" ? "chip-active" : status === "paused" || status === "ended" ? "chip-cancelled" : "chip-upcoming";
  const campaign = (id: string) => snapshot.campaigns.find((item) => item.id === id);

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newForm || saving) return;
    const draft: CampaignDraft = {
      name: newForm.name,
      rewardKind: newForm.rewardKind,
      rewardCap: Number(newForm.rewardCap),
      requiredPlays: Number(newForm.requiredPlays),
      completionWindowDays: Number(newForm.completionWindowDays),
      rewardExpiryDays: Number(newForm.rewardExpiryDays),
      instructions: newForm.instructions,
      allowOverlap: newForm.allowOverlap,
    };
    if (draft.rewardKind === "discount") draft.discountPercent = Number(newForm.discountPercent);
    if (draft.rewardKind === "free-ticket") draft.freeTicketScreeningId = newForm.freeTicketScreeningId;
    if (live) {
      setSaving(true);
      setError("");
      void createCampaignRemote(live.token, draft)
        .then(() => live.refresh())
        .then(() => {
          setNewForm(null);
          setNotice("Reward campaign created as draft in the shared backend. Activate it to start enrolling.");
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Create failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(upsertCampaign(snapshot, null, draft));
    setNewForm(null);
    setNotice("Reward campaign created as draft. Activate it to start enrolling.");
  };

  const changeStatus = (campaignId: string, status: "active" | "paused" | "ended") => {
    if (live) {
      setSaving(true);
      setError("");
      void updateCampaignRemote(live.token, campaignId, { status })
        .then(() => live.refresh())
        .then(() => setNotice(`Campaign ${status} in the shared backend.`))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Update failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(setCampaignStatus(snapshot, campaignId, status));
    if (status === "active") setNotice("Campaign activated.");
  };

  const removeCode = (campaignId: string, codeId: string) => {
    if (live) {
      setSaving(true);
      setError("");
      void deleteCampaignCodeRemote(live.token, campaignId, codeId)
        .then(() => live.refresh())
        .then(() => setNotice("Coupon code removed."))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Remove failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(deleteCampaignCode(snapshot, campaignId, codeId));
  };

  const addCodes = (campaignId: string) => {
    const lines = (codeInput[campaignId] ?? "").split(/[\n,]+/).map((code) => code.trim()).filter(Boolean);
    if (!lines.length || saving) return;
    if (live) {
      setSaving(true);
      setError("");
      void addCampaignCodesRemote(live.token, campaignId, lines)
        .then(() => live.refresh())
        .then(() => {
          setCodeInput({ ...codeInput, [campaignId]: "" });
          setNotice("Coupon codes added to the shared backend.");
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Add failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(addCampaignCodes(snapshot, campaignId, lines));
    setCodeInput({ ...codeInput, [campaignId]: "" });
    setNotice("Coupon codes added.");
  };

  return (
    <section className="cd-section">
      <div className="cd-section-header">
        <div><p className="cd-eyebrow">REWARD CAMPAIGNS</p><h1>Rewards</h1><p>Configure campaigns, coupon pools, and grant state for the customer game.</p></div>
        <PrimaryButton onClick={() => setNewForm({ name: "", rewardKind: "discount", discountPercent: "50", freeTicketScreeningId: "", requiredPlays: "3", completionWindowDays: "7", rewardExpiryDays: "30", rewardCap: "50", instructions: "", allowOverlap: true })}>New campaign</PrimaryButton>
      </div>
      {notice && <div className="cd-notice" role="status">{notice}</div>}
      {error && <div className="cd-error" role="alert">{error}</div>}

      <div className="cd-campaign-list">
        {snapshot.campaigns.map((item) => (
          <article className="cd-campaign" key={item.id}>
            <header>
              <div>
                <span className={`cd-chip ${statusClass(item.status)}`}>{item.status}</span>
                <span className="cd-kind">reward · {item.rewardKind.replace("-", " ")}</span>
                <h3>{item.name}</h3>
                <p>{item.instructions || "No instructions."}</p>
              </div>
              <div className="cd-actions">
                {item.status !== "active" && <button type="button" className="cd-mini" disabled={saving} onClick={() => changeStatus(item.id, "active")}>Activate</button>}
                {item.status === "active" && <button type="button" className="cd-mini" disabled={saving} onClick={() => changeStatus(item.id, "paused")}>Pause</button>}
                {item.status !== "ended" && <button type="button" className="cd-mini" disabled={saving} onClick={() => changeStatus(item.id, "ended")}>End</button>}
                <button type="button" className="cd-mini" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>{expanded === item.id ? "Hide" : "Details"}</button>
              </div>
            </header>
            <div className="cd-campaign-stats">
              <span><strong>{item.rewardKind === "discount" ? `${item.discountPercent}%` : item.rewardKind === "free-ticket" ? "Free ticket" : "Coupon"}</strong><small>Reward</small></span>
              <span><strong>{item.requiredPlays}</strong><small>Plays</small></span>
              <span><strong>{item.enrolledCount}</strong><small>Enrolled</small></span>
              <span><strong>{item.grantedCount}</strong><small>Granted</small></span>
              <span><strong>{item.redeemedCount}</strong><small>Redeemed</small></span>
              <span><strong>{item.codesAvailable + item.codesReserved + item.codesUsed}</strong><small>Codes</small></span>
            </div>
            {expanded === item.id && (
              <div className="cd-campaign-detail">
                <div className="cd-detail-grid">
                  <section>
                    <h4>Coupon codes</h4>
                    {(snapshot.codes[item.id] ?? []).length ? (
                      <table className="cd-mini-table">
                        <thead><tr><th>Code</th><th>Status</th><th>Expires</th><th /></tr></thead>
                        <tbody>{(snapshot.codes[item.id] ?? []).map((code) => (
                          <tr key={code.id}><td><code>{code.code}</code>{code.instructions && <small>{code.instructions}</small>}</td><td><span className={`cd-chip ${code.status === "available" ? "chip-active" : "chip-upcoming"}`}>{code.status}</span></td><td>{code.expiresAt ? fmtDateTime(code.expiresAt) : "—"}</td><td>{code.status === "available" && <button type="button" className="cd-mini" disabled={saving} onClick={() => removeCode(item.id, code.id)}>Remove</button>}</td></tr>
                        ))}</tbody>
                      </table>
                    ) : <p className="cd-muted">No codes yet.</p>}
                    <div className="cd-code-add">
                      <textarea rows={2} placeholder={"MSY-TREAT-7KQ2, MSY-PASS-X2K4\n… one code per line"} value={codeInput[item.id] ?? ""} onChange={(event) => setCodeInput({ ...codeInput, [item.id]: event.target.value })} />
                      <OutlineButton onClick={() => addCodes(item.id)}>Add codes</OutlineButton>
                    </div>
                  </section>
                  <section>
                    <h4>Enrollments</h4>
                    {(snapshot.entrants[item.id] ?? []).length ? (
                      <table className="cd-mini-table">
                        <thead><tr><th>Member</th><th>Plays</th><th>Status</th><th>Grant</th></tr></thead>
                        <tbody>{(snapshot.entrants[item.id] ?? []).map((entrant) => (
                          <tr key={entrant.enrollmentId}><td>{entrant.userId}</td><td>{entrant.completedPlays}</td><td><span className={`cd-chip ${entrant.status === "engaged" || entrant.status === "granted" ? "chip-active" : "chip-upcoming"}`}>{entrant.status}</span></td><td>{entrant.grantTitle ?? (entrant.code ?? "—")}</td></tr>
                        ))}</tbody>
                      </table>
                    ) : <p className="cd-muted">No enrollments yet.</p>}
                  </section>
                </div>
              </div>
            )}
          </article>
        ))}
        {!snapshot.campaigns.length && <div className="cd-empty">No reward campaigns yet.</div>}
      </div>

      {newForm && (
        <Modal title="New reward campaign" onClose={() => setNewForm(null)}>
          <form className="cd-form" onSubmit={create}>
            <Field label="Name"><input required maxLength={160} value={newForm.name} onChange={(event) => setNewForm({ ...newForm, name: event.target.value })} /></Field>
            <Field label="Reward kind">
              <select value={newForm.rewardKind} onChange={(event) => setNewForm({ ...newForm, rewardKind: event.target.value as "coupon" | "discount" | "free-ticket" })}>
                <option value="coupon">Coupon code</option><option value="discount">Percentage discount</option><option value="free-ticket">Free ticket</option>
              </select>
            </Field>
            {newForm.rewardKind === "discount" && (
              <Field label="Discount percent"><select value={newForm.discountPercent} onChange={(event) => setNewForm({ ...newForm, discountPercent: event.target.value })}><option value="30">30%</option><option value="50">50%</option></select></Field>
            )}
            {newForm.rewardKind === "free-ticket" && (
              <Field label="Free-ticket screening"><select required value={newForm.freeTicketScreeningId} onChange={(event) => setNewForm({ ...newForm, freeTicketScreeningId: event.target.value })}><option value="">Choose a screening</option>{screeningList(snapshot).map((item) => <option key={item.id} value={item.id}>{item.title} · {dateOnly.format(new Date(item.startsAt))}</option>)}</select></Field>
            )}
            <div className="cd-two-col"><Field label="Required plays"><input type="number" min="1" required value={newForm.requiredPlays} onChange={(event) => setNewForm({ ...newForm, requiredPlays: event.target.value })} /></Field><Field label="Completion window (days)"><input type="number" min="1" required value={newForm.completionWindowDays} onChange={(event) => setNewForm({ ...newForm, completionWindowDays: event.target.value })} /></Field></div>
            <div className="cd-two-col"><Field label="Reward expiry (days)"><input type="number" min="1" required value={newForm.rewardExpiryDays} onChange={(event) => setNewForm({ ...newForm, rewardExpiryDays: event.target.value })} /></Field><Field label="Reward cap"><input type="number" min="1" required value={newForm.rewardCap} onChange={(event) => setNewForm({ ...newForm, rewardCap: event.target.value })} /></Field></div>
            <Field label="Instructions"><textarea rows={3} maxLength={2000} value={newForm.instructions} onChange={(event) => setNewForm({ ...newForm, instructions: event.target.value })} /></Field>
            <label className="cd-checkbox"><input type="checkbox" checked={newForm.allowOverlap} onChange={(event) => setNewForm({ ...newForm, allowOverlap: event.target.checked })} />Allow overlap with other active campaigns</label>
            <footer className="cd-form-footer"><OutlineButton onClick={() => setNewForm(null)}>Cancel</OutlineButton><PrimaryButton type="submit">Create campaign</PrimaryButton></footer>
          </form>
        </Modal>
      )}
    </section>
  );
}

function SettingsTab({ snapshot, onCommit, live }: { snapshot: AdminSnapshot; onCommit: (next: AdminSnapshot) => void; live: LiveStore | null }) {
  const [qrDestination, setQrDestination] = useState(snapshot.settings.qrDestination ?? "");
  const [profileName, setProfileName] = useState(snapshot.settings.profileName);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQrDestination(snapshot.settings.qrDestination ?? "");
  }, [snapshot.settings.qrDestination]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const destination = qrDestination.trim() || null;
    if (destination && !/^https?:\/\/.+\..+/.test(destination)) { setNotice("Enter a valid destination URL."); return; }
    if (live) {
      if (!destination) { setError("The shared backend requires a destination URL."); return; }
      setSaving(true);
      setError("");
      void saveProfileQrRemote(live.token, destination)
        .then(() => live.refresh())
        .then(() => setNotice("QR destination saved to the shared backend. Every profile card uses it."))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Save failed."))
        .finally(() => setSaving(false));
      return;
    }
    onCommit(saveSettings(snapshot, { profileName: profileName.trim(), qrDestination: destination }));
    setNotice("Settings saved to the demo store.");
  };

  return (
    <section className="cd-section cd-settings">
      <div className="cd-section-header"><div><p className="cd-eyebrow">SHARED PROFILE CARD</p><h1>Settings</h1><p>One QR destination for every member ID card, plus demo operator identity.</p></div></div>
      {notice && <div className="cd-notice" role="status">{notice}</div>}
      {error && <div className="cd-error" role="alert">{error}</div>}
      <form className="cd-form cd-settings-form" onSubmit={save}>
        <Field label="Operator name"><input value={profileName} onChange={(event) => setProfileName(event.target.value)} /></Field>
        <Field label="QR destination URL" hint="The same QR pattern appears at the bottom of every MarvelSyllabus ID card."><input type="url" value={qrDestination} onChange={(event) => setQrDestination(event.target.value)} placeholder="https://marvelsyllabus.com/discover" /></Field>
        <div className="cd-setting-preview">
          <span className="cd-muted">Current live preview</span>
          <code>{qrDestination.trim() || "no destination set"}</code>
        </div>
        <footer className="cd-form-footer"><PrimaryButton type="submit" disabled={saving}>Save settings</PrimaryButton></footer>
      </form>
    </section>
  );
}
