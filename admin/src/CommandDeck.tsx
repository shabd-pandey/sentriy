import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  remainingCapacity,
  screeningStatus,
  sortCatalog,
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
  reorderCatalog as reorderCatalogRemote,
  saveCatalogTitle as saveCatalogTitleRemote,
  saveBanner as saveBannerRemote,
  saveProfileQr as saveProfileQrRemote,
  addCampaignCodes as addCampaignCodesRemote,
  saveSeasons as saveSeasonsRemote,
  setScreeningCancelled as setScreeningCancelledRemote,
  updateCampaign as updateCampaignRemote,
  uploadArtwork as uploadArtworkRemote,
  type BannerAccent,
  type CampaignCode,
  type CampaignEntrant,
} from "./api";
import {
  addCampaignCodes,
  addScreening,
  deleteBanner,
  deleteCampaignCode,
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

type TabId = "activity" | "catalog" | "screenings" | "banners" | "rewards" | "settings";

export interface LiveStore {
  token: string;
  refresh: () => Promise<void>;
}

const categoryClass: Record<AdminSnapshot["activity"][number]["category"], string> = {
  catalog: "cat-catalog",
  screening: "cat-screening",
  artwork: "cat-artwork",
  settings: "cat-settings",
  banner: "cat-banner",
  reward: "cat-reward",
};

const categoryLabel: Record<string, string> = {
  catalog: "Catalog",
  screening: "Screening",
  artwork: "Artwork",
  settings: "Settings",
  banner: "Banner",
  reward: "Reward",
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

export interface DeckAuth {
  authConfigured: boolean;
  signedIn?: boolean;
  getToken?: () => Promise<string | null>;
  authControls?: ReactNode;
}

export default function CommandDeck({ authConfigured = false, signedIn = false, getToken, authControls }: DeckAuth) {
  const [snapshot, setSnapshot] = useState<AdminSnapshot>(() => loadAdminSnapshot());
  const [tab, setTab] = useState<TabId>("activity");
  const [clock, setClock] = useState(Date.now());
  const [liveToken, setLiveToken] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<"idle" | "loading" | "live" | "forbidden" | "error" | "demo">("idle");
  const [liveError, setLiveError] = useState("");
  const [previewRequested, setPreviewRequested] = useState(false);

  useEffect(() => { if (snapshot.source === "demo") persistAdminSnapshot(snapshot); }, [snapshot]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const commit = (next: AdminSnapshot) => setSnapshot(next);

  const refreshLive = useCallback(async (token: string) => {
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

  useEffect(() => {
    if (!authConfigured || !signedIn || !getToken || previewRequested) return;
    let cancelled = false;
    setLiveState("loading");
    setLiveError("");
    void getToken()
      .then((token) => {
        if (cancelled || !token) {
          if (!cancelled) {
            setLiveState("demo");
            setLiveError("Signed in without an API token. Showing preview data.");
          }
          return null;
        }
        return refreshLive(token).then(() => {
          if (!cancelled) {
            setLiveToken(token);
            setLiveState("live");
          }
        });
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
  }, [authConfigured, signedIn, getToken, previewRequested, refreshLive]);

  const live = liveState === "live" && liveToken ? { token: liveToken, refresh: () => refreshLive(liveToken) } : null;

  if (authConfigured && !signedIn && !previewRequested) {
    return (
      <div className="cd-shell">
        <header className="cd-topbar">
          <span className="cd-brand">
            <span className="cd-brand-mark">M</span>
            <span><strong>MARVELSYLLABUS</strong><small>COMMAND DECK · BURDEN WITH GLORIOUS SYLLABUS</small></span>
          </span>
          {authControls}
        </header>
        <main className="cd-content">
          <section className="cd-section cd-gate">
            <p className="cd-eyebrow">OPERATOR ACCESS</p>
            <h1>Sign in as an admin</h1>
            <p>The Command Deck reads the shared catalog, screenings, banners, rewards, and activity. Public sign-up grants customer access only.</p>
            <div className="cd-gate-actions">
              {authControls}
              <button type="button" className="cd-outline" onClick={() => setPreviewRequested(true)}>Explore preview data instead</button>
            </div>
          </section>
        </main>
        <footer className="cd-footer">
          <span>MarvelSyllabus Command Deck · Burden with Glorious Syllabus</span>
          <span>Asia/Kolkata · shared catalog, screenings, banners, rewards &amp; activity</span>
        </footer>
      </div>
    );
  }

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
        {authConfigured && authControls}
        {snapshot.source === "demo" && <button type="button" className="cd-reset" onClick={() => { if (window.confirm("Reset all demo data to the original seed?")) setSnapshot(resetAdminData()); }}>Reset demo</button>}
      </header>

      <nav className="cd-tabs" role="tablist" aria-label="Operator workspace">
        {([
          ["activity", "Activity"],
          ["catalog", "Catalog"],
          ["screenings", "Screenings"],
          ["banners", "Banners"],
          ["rewards", "Rewards"],
          ["settings", "Settings"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
            {label}
            {id === "activity" && <span>{activityToday}</span>}
            {id === "catalog" && <span>{snapshot.catalog.length}</span>}
            {id === "screenings" && <span>{screeningsOnSale}</span>}
            {id === "banners" && <span>{bannersPublished}</span>}
            {id === "rewards" && <span>{campaignsActive}</span>}
          </button>
        ))}
      </nav>

      <main className="cd-content">
        {tab === "activity" && <ActivityTab snapshot={snapshot} clock={clock} live={live} onOpenScreenings={() => setTab("screenings")} onOpenCatalog={() => setTab("catalog")} />}
        {tab === "catalog" && <CatalogTab snapshot={snapshot} orderedCatalog={orderedCatalog} onCommit={commit} live={live} />}
        {tab === "screenings" && <ScreeningsTab snapshot={snapshot} orderedCatalog={orderedCatalog} onCommit={commit} live={live} />}
        {tab === "banners" && <BannersTab snapshot={snapshot} orderedCatalog={orderedCatalog} onCommit={commit} live={live} />}
        {tab === "rewards" && <RewardsTab snapshot={snapshot} onCommit={commit} live={live} />}
        {tab === "settings" && <SettingsTab snapshot={snapshot} onCommit={commit} live={live} />}
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
    };
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
        <StatCard label="Titles" value={snapshot.catalog.length} hint={`${snapshot.catalog.filter((title) => title.active).length} active`} onClick={onOpenCatalog} />
        <StatCard label="Screenings on sale" value={screeningsOnSale(snapshot, clock)} hint={`${snapshot.screenings.filter((item) => item.cancelled).length} cancelled`} onClick={onOpenScreenings} />
        <StatCard label="Published banners" value={snapshot.banners.filter((banner) => banner.state === "published").length} hint={`${snapshot.banners.length} total`} onClick={() => undefined} />
        <StatCard label="Active campaigns" value={snapshot.campaigns.filter((campaign) => campaign.status === "active").length} hint={`${snapshot.campaigns.reduce((sum, campaign) => sum + campaign.grantedCount, 0)} rewards granted`} onClick={() => undefined} />
      </div>

      <div className="cd-toolbar">
        <label className="cd-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity, actors, or references" /></label>
        <div className="cd-filter">
          <button type="button" className={category === "all" ? "is-active" : ""} onClick={() => setCategory("all")}>All</button>
          {(["catalog", "screening", "banner", "reward", "artwork", "settings"] as const).map((name) => (
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

type ScreeningForm = { titleId: string; seasonNumber: string; episodeStart: string; episodeEnd: string; startsAt: string; endsAt: string; location: string; capacity: string; price: string };

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
});

function ScreeningsTab({ snapshot, orderedCatalog, onCommit, live }: { snapshot: AdminSnapshot; orderedCatalog: ReturnType<typeof sortCatalog>; onCommit: (next: AdminSnapshot) => void; live: LiveStore | null }) {
  const [form, setForm] = useState<ScreeningForm | null>(null);
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

  return (
    <section className="cd-section">
      <div className="cd-section-header">
        <div><p className="cd-eyebrow">PUBLISHED SHOWINGS</p><h1>Screenings</h1><p>Schedule films and series events with capacity, price, and sales windows.</p></div>
        <PrimaryButton onClick={() => setForm(emptyScreeningForm())}>Schedule screening</PrimaryButton>
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
              <div className="cd-actions">{upcoming && <button type="button" className="cd-mini" disabled={saving} onClick={() => setCancelled(screening.id, !screening.cancelled)}>{screening.cancelled ? "Reopen" : "Cancel"}</button>}</div>
            </article>
          );
        })}
        {!screeningList(snapshot).length && <div className="cd-empty">No screenings have been scheduled yet.</div>}
      </div>

      {form && (
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
            <p className="cd-note">A screening can be scheduled while its title is Upcoming. Sales open only after activation.</p>
            <footer className="cd-form-footer"><OutlineButton onClick={() => setForm(null)}>Cancel</OutlineButton><PrimaryButton type="submit">Save screening</PrimaryButton></footer>
          </form>
        </Modal>
      )}
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