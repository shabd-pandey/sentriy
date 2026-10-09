import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  apiRequest,
  loadCatalog,
  loadProfileQr,
  loadProgress,
  loadScreenings,
  screeningIsBookable,
  sortCatalog,
  type CatalogTitle,
  type Screening,
  type Season,
  type TitleType,
  type WatchedItem,
} from "./catalog-api";

type PortalMode = "admin" | "customer";
type CatalogDraft = Pick<CatalogTitle, "title" | "synopsis" | "releaseYear" | "active" | "watchOrder" | "posterKey"> & { titleType: TitleType; id?: string };

const emptyDraft = (order: number): CatalogDraft => ({
  title: "",
  titleType: "film",
  synopsis: "",
  releaseYear: null,
  active: false,
  watchOrder: order,
  posterKey: null,
});

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function watchedKey(item: Pick<WatchedItem, "titleId" | "seasonNumber" | "episodeNumber">) {
  return `${item.titleId}:${item.seasonNumber ?? "film"}:${item.episodeNumber ?? ""}`;
}

export default function CatalogPortal({
  mode,
  onBack,
  getToken,
  authConfigured,
  authControls,
}: {
  mode: PortalMode;
  onBack: () => void;
  getToken?: () => Promise<string | null>;
  authConfigured: boolean;
  authControls?: ReactNode;
}) {
  const [catalog, setCatalog] = useState<CatalogTitle[]>([]);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [progress, setProgress] = useState<WatchedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TitleType>("all");
  const [adminTab, setAdminTab] = useState<"catalog" | "screenings" | "profile">("catalog");
  const [editing, setEditing] = useState<CatalogDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [episodeTextByTitle, setEpisodeTextByTitle] = useState<Record<string, string>>({});
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [showScreeningForm, setShowScreeningForm] = useState(false);
  const [screeningTitle, setScreeningTitle] = useState("");
  const [screeningSeason, setScreeningSeason] = useState("");
  const [screeningForm, setScreeningForm] = useState({
    startsAt: "",
    endsAt: "",
    location: "",
    capacity: "100",
    price: "0",
    episodeStart: "1",
    episodeEnd: "1",
  });
  const [profileQrDestination, setProfileQrDestination] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [titles, showings] = await Promise.all([loadCatalog(), loadScreenings()]);
      const profileQr = await loadProfileQr().catch(() => ({ qrDestination: null }));
      setCatalog(titles);
      setScreenings(showings);
      setProfileQrDestination(profileQr.qrDestination ?? "");
      if (mode === "customer" && getToken) {
        const token = await getToken();
        setProgress(token ? await loadProgress(token) : []);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the shared catalog.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [mode]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const orderedCatalog = useMemo(
    () => sortCatalog(catalog),
    [catalog],
  );
  const filteredCatalog = useMemo(() => {
    const lower = query.trim().toLocaleLowerCase();
    return orderedCatalog.filter((title) =>
      (typeFilter === "all" || title.titleType === typeFilter) &&
      `${title.title} ${title.synopsis} ${title.releaseYear ?? ""}`.toLocaleLowerCase().includes(lower),
    );
  }, [orderedCatalog, query, typeFilter]);
  const watchedItems = useMemo(() => new Set(progress.map(watchedKey)), [progress]);
  const selectedScreeningTitle = catalog.find((title) => title.id === screeningTitle);
  const availableSeasons = selectedScreeningTitle?.seasons ?? [];
  const selectedSeason = availableSeasons.find((season) => season.seasonNumber === Number(screeningSeason));

  const requestToken = async () => {
    const token = await getToken?.();
    if (!token) throw new Error("Sign in to continue.");
    return token;
  };

  const saveProfileQr = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const token = await requestToken();
      const saved = await apiRequest<{ qrDestination: string }>("/api/admin/profile-qr", token, {
        method: "PUT",
        body: JSON.stringify({ qrDestination: profileQrDestination }),
      });
      setProfileQrDestination(saved.qrDestination);
      setNotice("The shared profile-card QR destination is live for every member.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the profile QR destination.");
    } finally {
      setSaving(false);
    }
  };

  const saveTitle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const token = await requestToken();
      const result = editing.id
        ? await apiRequest<{ ok: boolean }>(`/api/admin/catalog/${encodeURIComponent(editing.id)}`, token, {
            method: "PUT",
            body: JSON.stringify(editing),
          })
        : await apiRequest<{ id: string }>("/api/admin/catalog", token, {
            method: "POST",
            body: JSON.stringify(editing),
          });
      if (result) {
        setEditing(null);
        await refresh();
        setNotice("Catalog entry saved to the shared database.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the title.");
    } finally {
      setSaving(false);
    }
  };

  const uploadPoster = async (file?: File) => {
    if (!file || !editing) return;
    if (!rightsConfirmed) {
      setError("Confirm you own or have licensed the artwork before uploading it.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await requestToken();
      const form = new FormData();
      form.set("file", file);
      form.set("rightsCleared", "true");
      const result = await apiRequest<{ key: string }>("/api/admin/artwork", token, { method: "POST", body: form });
      setEditing({ ...editing, posterKey: result.key });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Artwork upload failed.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (title: CatalogTitle) => {
    setError("");
    try {
      const token = await requestToken();
      await apiRequest(`/api/admin/catalog/${encodeURIComponent(title.id)}`, token, {
        method: "PUT",
        body: JSON.stringify({
          title: title.title,
          synopsis: title.synopsis,
          releaseYear: title.releaseYear,
          posterKey: title.posterKey ?? null,
          active: !title.active,
          watchOrder: title.watchOrder,
        }),
      });
      await refresh();
      setNotice(`${title.title} is now ${title.active ? "Upcoming" : "Active"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update title visibility.");
    }
  };

  const moveTitle = async (title: CatalogTitle, offset: number) => {
    const index = orderedCatalog.findIndex((item) => item.id === title.id);
    const target = index + offset;
    if (target < 0 || target >= orderedCatalog.length) return;
    const next = [...orderedCatalog];
    [next[index], next[target]] = [next[target], next[index]];
    try {
      const token = await requestToken();
      await apiRequest("/api/admin/catalog/order", token, {
        method: "PUT",
        body: JSON.stringify({ ids: next.map((item) => item.id) }),
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reorder the catalog.");
    }
  };

  const saveSeasons = async (title: CatalogTitle, text: string) => {
    try {
      const seasons: Season[] = text.split(",").map((entry) => {
        const [seasonNumber, episodeCount] = entry.trim().split(":").map(Number);
        return { seasonNumber, episodeCount };
      }).filter((season) => Number.isInteger(season.seasonNumber) && Number.isInteger(season.episodeCount));
      const token = await requestToken();
      await apiRequest(`/api/admin/series/${encodeURIComponent(title.id)}/seasons`, token, {
        method: "PUT",
        body: JSON.stringify({ seasons }),
      });
      await refresh();
      setNotice(`Season episode counts saved for ${title.title}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save season data.");
    }
  };

  const saveScreening = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = catalog.find((item) => item.id === screeningTitle);
    if (!title) return;
    try {
      const token = await requestToken();
      await apiRequest("/api/admin/screenings", token, {
        method: "POST",
        body: JSON.stringify({
          titleId: title.id,
          startsAt: new Date(screeningForm.startsAt).toISOString(),
          endsAt: new Date(screeningForm.endsAt).toISOString(),
          location: screeningForm.location,
          capacity: Number(screeningForm.capacity),
          priceMinor: Math.round(Number(screeningForm.price) * 100),
          ...(title.titleType === "series" ? {
            seasonNumber: Number(screeningSeason),
            episodeStart: Number(screeningForm.episodeStart),
            episodeEnd: Number(screeningForm.episodeEnd),
          } : {}),
        }),
      });
      setShowScreeningForm(false);
      await refresh();
      setNotice("Screening added. It is bookable only when active and within its sales window.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not schedule the screening.");
    }
  };

  const toggleWatched = async (item: Pick<WatchedItem, "titleId" | "seasonNumber" | "episodeNumber">, watched: boolean) => {
    try {
      const token = await requestToken();
      await apiRequest("/api/progress", token, {
        method: "PUT",
        body: JSON.stringify({ ...item, watched }),
      });
      setProgress((current) => watched
        ? [...current.filter((saved) => watchedKey(saved) !== watchedKey(item)), { ...item, watchedAt: new Date().toISOString() }]
        : current.filter((saved) => watchedKey(saved) !== watchedKey(item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save watch progress.");
    }
  };

  return (
    <div className={`catalog-portal ${mode === "customer" ? "customer-portal" : "catalog-admin-portal"}`}>
      <header className="portal-topbar">
        <a className="portal-brand" href="#" onClick={(event) => { event.preventDefault(); onBack(); }}>
          <span className="portal-brand-mark">F</span>
          <span><strong>FRAME</strong><small>{mode === "admin" ? "CATALOG STUDIO" : "WATCHLIST & TICKETS"}</small></span>
        </a>
        <div className="portal-account">
          {authControls}
          <button className="portal-return" type="button" onClick={onBack}>
            {mode === "admin" ? "Admin dashboard" : "Back to dashboard"}
          </button>
        </div>
      </header>

      <main className="portal-content">
        <section className="portal-heading">
          <div>
            <p className="portal-eyebrow">{mode === "admin" ? "SHARED CATALOG" : "YOUR MOVIE NIGHT STARTS HERE"}</p>
            <h1>{mode === "admin" ? "Films & series" : "The Doomsday watchlist"}</h1>
            <p>{mode === "admin"
              ? "Manage this ordered catalog, configure series episodes, and schedule bookable events."
              : "Browse films and series in watch order, explore screenings, and keep your personal watch progress."}</p>
          </div>
          {mode === "admin" && adminTab === "catalog" && (
            <button type="button" className="portal-primary" onClick={() => { setRightsConfirmed(false); setEditing(emptyDraft(catalog.length + 1)); }}>Add title</button>
          )}
          {mode === "admin" && adminTab === "screenings" && (
            <button type="button" className="portal-primary" onClick={() => setShowScreeningForm(true)}>Schedule screening</button>
          )}
        </section>

        {!authConfigured && (
          <div className="portal-callout" role="status">
            Sign-in is not configured for this deployment. Set the Clerk publishable key and API issuer/JWKS settings to enable admin edits and account progress.
          </div>
        )}
        {error && <div className="portal-error" role="alert">{error}</div>}
        {notice && <div className="portal-notice" role="status">{notice}</div>}

        {mode === "admin" && (
          <div className="portal-tabs" role="tablist" aria-label="Catalog administration">
            <button type="button" role="tab" aria-selected={adminTab === "catalog"} onClick={() => setAdminTab("catalog")}>Titles <span>{catalog.length}</span></button>
            <button type="button" role="tab" aria-selected={adminTab === "screenings"} onClick={() => setAdminTab("screenings")}>Screenings <span>{screenings.length}</span></button>
            <button type="button" role="tab" aria-selected={adminTab === "profile"} onClick={() => setAdminTab("profile")}>Profile QR</button>
          </div>
        )}

        {mode === "admin" && adminTab === "profile" ? (
          <form className="profile-qr-admin" onSubmit={(event) => void saveProfileQr(event)}>
            <p className="portal-eyebrow">SHARED PROFILE CARD</p>
            <h2>One QR code for every member</h2>
            <p>Choose the destination once. The same QR pattern appears at the bottom of every MarvelSyllabus ID card.</p>
            <label>QR destination URL<input type="url" required placeholder="https://example.com/your-destination" value={profileQrDestination} onChange={(event) => setProfileQrDestination(event.target.value)} /></label>
            <button className="portal-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save shared QR"}</button>
          </form>
        ) : adminTab === "catalog" || mode === "customer" ? (
          <>
            <section className="portal-toolbar">
              <label className="portal-search">
                <span className="sr-only">Search catalog</span>
                <span aria-hidden="true">⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles or descriptions" />
              </label>
              <div className="portal-filter" aria-label="Filter title type">
                {(["all", "film", "series"] as const).map((type) => (
                  <button key={type} type="button" aria-pressed={typeFilter === type} onClick={() => setTypeFilter(type)}>
                    {type === "all" ? "All titles" : type === "film" ? "Films" : "Series"}
                  </button>
                ))}
              </div>
              <span className="portal-result-count">{filteredCatalog.length} titles</span>
            </section>

            {loading ? <div className="portal-empty">Loading shared catalog…</div> :
              !catalog.length ? (
                <div className="portal-empty">
                  {error ? "The shared catalog API is unavailable. Apply the database migration, seed the catalog, and deploy the API before using this page." : "The catalog is empty. Import the watchlist once from the admin setup tools."}
                </div>
              ) : (
                <section className="title-grid" aria-label="Catalog titles">
                  {filteredCatalog.map((title, index) => {
                    const titleProgress = progress.filter((item) => item.titleId === title.id);
                    const screeningsForTitle = screenings.filter((screening) => screening.titleId === title.id)
                      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
                    const filmItem = { titleId: title.id, seasonNumber: null, episodeNumber: null };
                    return (
                      <article className="title-card" key={title.id}>
                        <div className="title-art">
                          {title.posterUrl
                            ? <img src={title.posterUrl} alt={`${title.title} poster`} loading="lazy" decoding="async" width="440" height="660" sizes="(max-width: 600px) 44vw, (max-width: 1000px) 28vw, 220px" />
                            : <div className="poster-placeholder"><span>{title.title.slice(0, 1)}</span><small>{title.titleType === "series" ? "SERIES" : "FILM"}</small></div>}
                          <span className="order-chip">{String(title.watchOrder).padStart(2, "0")}</span>
                          {mode === "customer" && <span className={`availability-chip ${title.active ? "active" : ""}`}>{title.active ? "Active" : "Upcoming"}</span>}
                        </div>
                        <div className="title-card-copy">
                          <div className="title-meta-line">
                            <span className={title.titleType === "series" ? "kind-series" : "kind-film"}>{title.titleType === "series" ? "Series" : "Film"}</span>
                            {title.releaseYear && <span>{title.releaseYear}</span>}
                          </div>
                          <h2>{title.title}</h2>
                          {title.synopsis && <p className="title-synopsis">{title.synopsis}</p>}
                          {mode === "admin" ? (
                            <>
                              <p className="admin-title-state">{title.active ? "Active · booking may open per screening" : "Upcoming · visible, no booking"}</p>
                              <div className="card-admin-actions">
                                <button type="button" onClick={() => {
                                  setRightsConfirmed(false);
                                  setEditing({
                                    id: title.id,
                                    title: title.title,
                                    titleType: title.titleType,
                                    synopsis: title.synopsis,
                                    releaseYear: title.releaseYear,
                                    posterKey: title.posterKey ?? null,
                                    active: title.active,
                                    watchOrder: title.watchOrder,
                                  });
                                }}>Edit title</button>
                                <button type="button" onClick={() => void toggleActive(title)}>{title.active ? "Set upcoming" : "Activate"}</button>
                                <button type="button" onClick={() => void moveTitle(title, -1)} disabled={index === 0} aria-label={`Move ${title.title} up`}>↑</button>
                                <button type="button" onClick={() => void moveTitle(title, 1)} disabled={index === orderedCatalog.length - 1} aria-label={`Move ${title.title} down`}>↓</button>
                              </div>
                              {title.titleType === "series" && (
                                <div className="season-maintenance">
                                  <label>Season:episode-count pairs
                                    <input aria-label={`${title.title} season episode counts`} value={episodeTextByTitle[title.id] ?? (title.seasons ?? []).map((season) => `${season.seasonNumber}:${season.episodeCount}`).join(",")} onChange={(event) => setEpisodeTextByTitle({ ...episodeTextByTitle, [title.id]: event.target.value })} placeholder="e.g. 1:6,2:8" />
                                  </label>
                                  <button type="button" onClick={() => void saveSeasons(title, episodeTextByTitle[title.id] ?? (title.seasons ?? []).map((season) => `${season.seasonNumber}:${season.episodeCount}`).join(","))}>Save seasons</button>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="watch-progress">
                                {title.titleType === "film" ? (
                                  <label className="watched-toggle">
                                    <input type="checkbox" checked={watchedItems.has(watchedKey(filmItem))} disabled={!authConfigured} onChange={(event) => void toggleWatched(filmItem, event.target.checked)} />
                                    <span>Watched</span>
                                  </label>
                                ) : (title.seasons ?? []).length ? (
                                  <details className="episode-progress">
                                    <summary>{titleProgress.length} episodes watched · track progress</summary>
                                    {(title.seasons ?? []).map((season) => (
                                      <div className="season-episodes" key={season.seasonNumber}>
                                        <strong>Season {season.seasonNumber}</strong>
                                        <div>{Array.from({ length: season.episodeCount }, (_, i) => i + 1).map((episode) => {
                                          const episodeItem = { titleId: title.id, seasonNumber: season.seasonNumber, episodeNumber: episode };
                                          return <label key={episode}><input type="checkbox" checked={watchedItems.has(watchedKey(episodeItem))} disabled={!authConfigured} onChange={(event) => void toggleWatched(episodeItem, event.target.checked)} />E{episode}</label>;
                                        })}</div>
                                      </div>
                                    ))}
                                  </details>
                                ) : <span className="progress-unset">Episode tracking opens when season counts are set.</span>}
                              </div>
                              {screeningsForTitle.length > 0 && (
                                <div className="title-screenings">
                                  <strong>Screenings</strong>
                                  {screeningsForTitle.slice(0, 2).map((screening) => {
                                    const canBook = screeningIsBookable(screening);
                                    return <div className="screening-mini" key={screening.id}>
                                      <span>{formatDate(screening.startsAt)} · {screening.location}{screening.seasonNumber ? ` · S${screening.seasonNumber} E${screening.episodeStart}–${screening.episodeEnd}` : ""}</span>
                                      <button type="button" disabled={!canBook} title={canBook ? "Checkout integration must be configured" : "This screening is not currently bookable"} onClick={() => setNotice("Checkout is not connected yet. Configure the payment provider and booking API before accepting ticket orders.")}>
                                        {canBook ? "Book" : screening.cancelled ? "Cancelled" : title.active ? "Unavailable" : "Upcoming"}
                                      </button>
                                    </div>;
                                  })}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </section>
              )}
          </>
        ) : (
          <section className="screenings-panel">
            <div className="screenings-table-heading"><span>SHOWING</span><span>DATE & TIME</span><span>CAPACITY</span><span>STATUS</span></div>
            {screenings.length ? [...screenings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map((screening) => {
              const remaining = Math.max(0, screening.capacity - screening.soldCount - screening.heldCount);
              const canBook = screeningIsBookable(screening);
              return <article className="screening-row" key={screening.id}>
                <div><strong>{screening.title}</strong><span>{screening.location}{screening.seasonNumber ? ` · Season ${screening.seasonNumber}, episodes ${screening.episodeStart}–${screening.episodeEnd}` : ""}</span></div>
                <span>{formatDate(screening.startsAt)}</span>
                <span>{screening.soldCount} sold · {remaining} remaining</span>
                <span className={canBook ? "screening-on-sale" : "screening-not-sale"}>{screening.cancelled ? "Cancelled" : canBook ? "On sale" : screening.titleActive ? "Not on sale" : "Upcoming title"}</span>
              </article>;
            }) : <div className="portal-empty">No screenings have been scheduled yet.</div>}
          </section>
        )}
      </main>

      {editing && (
        <div className="portal-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
          <form className="portal-modal" onSubmit={(event) => void saveTitle(event)}>
            <header><div><p className="portal-eyebrow">CATALOG ENTRY</p><h2>{editing.id ? "Edit title" : "Add a title"}</h2></div><button type="button" className="modal-close" aria-label="Close" onClick={() => setEditing(null)}>×</button></header>
            <label>Title<input autoFocus required maxLength={250} value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label>
            {!editing.id && <label>Type<select value={editing.titleType} onChange={(event) => setEditing({ ...editing, titleType: event.target.value as TitleType })}><option value="film">Film</option><option value="series">Series</option></select></label>}
            <label>Synopsis<textarea rows={4} value={editing.synopsis} onChange={(event) => setEditing({ ...editing, synopsis: event.target.value })} /></label>
            <label>Release year<input type="number" min="1888" max="2200" value={editing.releaseYear ?? ""} onChange={(event) => setEditing({ ...editing, releaseYear: event.target.value ? Number(event.target.value) : null })} /></label>
            <label className="portal-checkbox"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />I confirm this artwork is owned or licensed for this catalog.</label>
            <label>Rights-cleared poster<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!rightsConfirmed || saving} onChange={(event) => void uploadPoster(event.target.files?.[0])} /></label>
            <p className="upload-note">{editing.posterKey ? "Uploaded artwork attached. Only the configured object-storage URL is displayed." : "No poster uploaded. External artwork URLs are not accepted."} Maximum 8 MB; JPEG, PNG, or WebP.</p>
            <label className="portal-checkbox"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} />Active (otherwise shown as Upcoming; booking remains closed)</label>
            <label>Watch order<input type="number" min="1" value={editing.watchOrder} onChange={(event) => setEditing({ ...editing, watchOrder: Number(event.target.value) })} /></label>
            <footer><button type="button" className="portal-secondary" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="portal-primary" disabled={saving}>{saving ? "Saving…" : "Save title"}</button></footer>
          </form>
        </div>
      )}

      {showScreeningForm && (
        <div className="portal-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowScreeningForm(false); }}>
          <form className="portal-modal" onSubmit={(event) => void saveScreening(event)}>
            <header><div><p className="portal-eyebrow">SCHEDULE</p><h2>New screening</h2></div><button type="button" className="modal-close" aria-label="Close" onClick={() => setShowScreeningForm(false)}>×</button></header>
            <label>Title<select required value={screeningTitle} onChange={(event) => { setScreeningTitle(event.target.value); setScreeningSeason(""); }}><option value="">Choose a title</option>{orderedCatalog.map((title) => <option key={title.id} value={title.id}>{title.title} · {title.titleType}</option>)}</select></label>
            {selectedScreeningTitle?.titleType === "series" && <>
              <label>Season<select required value={screeningSeason} onChange={(event) => setScreeningSeason(event.target.value)}><option value="">Choose a season</option>{availableSeasons.map((season) => <option key={season.seasonNumber} value={season.seasonNumber}>Season {season.seasonNumber} · {season.episodeCount} episodes</option>)}</select></label>
              {selectedSeason && <div className="episode-range-fields">
                <label>First episode<input type="number" min="1" max={selectedSeason.episodeCount} required value={screeningForm.episodeStart} onChange={(event) => setScreeningForm({ ...screeningForm, episodeStart: event.target.value })} /></label>
                <label>Last episode<input type="number" min={screeningForm.episodeStart} max={selectedSeason.episodeCount} required value={screeningForm.episodeEnd} onChange={(event) => setScreeningForm({ ...screeningForm, episodeEnd: event.target.value })} /></label>
              </div>}
            </>}
            <label>Start date and time<input required type="datetime-local" value={screeningForm.startsAt} onChange={(event) => setScreeningForm({ ...screeningForm, startsAt: event.target.value })} /></label>
            <label>End date and time<input required type="datetime-local" value={screeningForm.endsAt} onChange={(event) => setScreeningForm({ ...screeningForm, endsAt: event.target.value })} /></label>
            <label>Venue / location<input required value={screeningForm.location} onChange={(event) => setScreeningForm({ ...screeningForm, location: event.target.value })} /></label>
            <div className="episode-range-fields"><label>Capacity<input type="number" min="1" required value={screeningForm.capacity} onChange={(event) => setScreeningForm({ ...screeningForm, capacity: event.target.value })} /></label><label>Ticket price (₹)<input type="number" min="0" step="0.01" required value={screeningForm.price} onChange={(event) => setScreeningForm({ ...screeningForm, price: event.target.value })} /></label></div>
            <p className="upload-note">A screening can be scheduled while its title is Upcoming. Sales open only after title activation and all availability rules pass.</p>
            <footer><button type="button" className="portal-secondary" onClick={() => setShowScreeningForm(false)}>Cancel</button><button type="submit" className="portal-primary">Save screening</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}
