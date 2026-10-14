import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import tvaLogo from "./assets/tva-logo-reference.png";
import QRCode from "qrcode";
import {
  loadCustomerSnapshot,
  persistCustomerState,
  saveWatchedProgress,
  type CustomerSettings,
  type CustomerSnapshot,
  type RewardGrant,
  type TicketBooking,
} from "./customer-data";
import { screeningIsBookable, sortCatalog, type CatalogTitle, type Screening, type TitleType, type WatchedItem } from "./catalog-api";

const TemporalLoom = lazy(() => import("./TemporalLoom"));

type AppProps = {
  authConfigured?: boolean;
  getToken?: () => Promise<string | null>;
  signedIn?: boolean;
  authControls?: ReactNode;
};

type Nav = "Discover" | "Streak" | "Ticket" | "Profile";
type ProfileTab = "profile" | "timeline" | "share" | "settings";
type ToastTone = "default" | "success" | "danger";

type IconName = "home" | "ticket" | "streak" | "profile" | "star" | "arrow" | "chevronUp" | "location" | "clock" | "share" | "check" | "lock" | "food" | "heart" | "close" | "bell" | "settings" | "camera" | "image";

const iconPaths: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9.5V21h14V9.5M9 21v-7h6v7" /></>,
  ticket: <><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5V9a3 3 0 0 0 0 6v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V15a3 3 0 0 0 0-6Z" /><path d="M13 9v6M9 9v6" /></>,
  streak: <><path d="M8.7 9.2C4.7 8.4 2.1 5.4 3.5 1.2c1 3 3.3 4.4 6.1 4.9M15.3 9.2c4-.8 6.6-3.8 5.2-8-1 3-3.3 4.4-6.1 4.9" /><path d="M8.2 7.2 12 5l3.8 2.2-.7 6.3L12 16l-3.1-2.5Z" /><path d="m9 10 3 1.3 3-1.3M7.5 21a4.5 4.5 0 0 1 9 0" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  star: <path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9Z" />,
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" /></>,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" /></>,
  food: <><path d="m7 8 1.5 13h7L17 8Z" /><path d="M6 8h12M9 8l1-5 3 3 2-3 1 5" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6v-2.6h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V6h2.6v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v2.6h-.2a1.7 1.7 0 0 0-1.2.3Z" /></>,
  camera: <><path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5Z" /><circle cx="12" cy="13" r="3.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 15-5-5L5 20" /></>,
};

function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>;
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...options }).format(new Date(value));
}

function money(minor: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(minor / 100);
}

function watchedKey(item: Pick<WatchedItem, "titleId" | "seasonNumber" | "episodeNumber">) {
  return `${item.titleId}:${item.seasonNumber ?? "film"}:${item.episodeNumber ?? ""}`;
}

function dateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value instanceof Date ? value : new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function streakLength(progress: WatchedItem[]) {
  const days = [...new Set(progress.map((item) => dateKey(item.watchedAt)))].sort().reverse();
  if (!days.length) return 0;
  const today = Date.parse(`${dateKey(new Date())}T00:00:00Z`);
  const latest = Date.parse(`${days[0]}T00:00:00Z`);
  if (today - latest > 86_400_000) return 0;
  let count = 1;
  for (let index = 1; index < days.length; index += 1) {
    if (Date.parse(`${days[index - 1]}T00:00:00Z`) - Date.parse(`${days[index]}T00:00:00Z`) !== 86_400_000) break;
    count += 1;
  }
  return count;
}

function remaining(screening: Screening) {
  return Math.max(0, screening.capacity - screening.soldCount - screening.heldCount);
}

function bookable(screening: Screening) {
  return screeningIsBookable(screening) && remaining(screening) > 0;
}

function Poster({ title, className = "" }: { title: CatalogTitle; className?: string }) {
  return <div className={`cinema-poster ${className}`}>{title.posterUrl ? <img src={title.posterUrl} alt={`${title.title} poster`} loading="lazy" /> : <div className="poster-fallback">{title.title.slice(0, 1)}</div>}</div>;
}

function MovieCard({ title, active, onSelect, onBook, saved, onSave }: { title: CatalogTitle; active: boolean; onSelect: () => void; onBook: () => void; saved: boolean; onSave: () => void }) {
  const tierLabel = title.tier ? title.tier.charAt(0).toUpperCase() + title.tier.slice(1) : title.active ? "Catalog title" : "Coming soon";
  const meta = { eyebrow: tierLabel, duration: title.universe ?? (title.titleType === "series" ? "Series" : "Film"), rating: title.layerLabel ?? "Watch order", genres: [title.layerLabel ?? (title.titleType === "series" ? "Series" : "Film"), ...(title.franchise ? [title.franchise] : [])] };
  return <article className={`movie-card ${active ? "is-active" : "is-muted"}`} onClick={onSelect}>
    <Poster title={title} />
    <div className="poster-shade" />
    <div className="movie-card-top"><span>{meta.eyebrow}</span><button type="button" aria-label={saved ? `Remove ${title.title} from saved titles` : `Save ${title.title}`} className={`save-button ${saved ? "is-saved" : ""}`} onClick={(event) => { event.stopPropagation(); onSave(); }}><Icon name="heart" size={17} /></button></div>
    <div className="movie-card-bottom"><div className="movie-meta"><span className="rating"><Icon name="star" size={13} /> <strong>{meta.rating}</strong></span><i /> <span>{title.releaseYear ?? "—"}</span><i /> <span>{meta.duration}</span></div><h2>{title.title}</h2><div className="genre-row">{meta.genres.map((genre) => <span key={genre}>{genre}</span>)}</div><button type="button" className="swipe-booking" onClick={(event) => { event.stopPropagation(); onBook(); }}><span><strong>{title.active ? "Swipe up to book" : "View title"}</strong><small>{title.active ? "General admission from the next show" : "Upcoming · booking closed"}</small></span><span className="swipe-arrow"><Icon name="chevronUp" size={20} /></span></button></div>
  </article>;
}

function TicketQr({ value }: { value: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let current = true;
    void QRCode.toDataURL(value, { errorCorrectionLevel: "M", margin: 1, width: 210, color: { dark: "#242120", light: "#f2e6d4" } }).then((next) => { if (current) setSource(next); });
    return () => { current = false; };
  }, [value]);
  return <div className="qr-code" aria-label="QR code"><>{source && <img src={source} alt="" />}</></div>;
}

function loadCardImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function renderProfileShareCard(snapshot: CustomerSnapshot) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1600;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("share_card_unavailable");
  const title = snapshot.catalog.find((entry) => entry.active) ?? snapshot.catalog[0];
  const watched = snapshot.settings.shareWatched ? snapshot.progress.length : null;
  const streak = snapshot.settings.shareStreak ? streakLength(snapshot.progress) : null;

  context.fillStyle = "#242120";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#b85f36";
  context.lineWidth = 10;
  context.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);
  context.fillStyle = "#f2e6d4";
  context.font = "700 28px monospace";
  context.fillText("MARVELSYLLABUS / PERSONAL ARCHIVE", 90, 115);
  context.fillStyle = "#e7a476";
  context.font = "700 60px sans-serif";
  context.fillText("MS", 1000, 120);
  context.strokeStyle = "#78391f";
  context.lineWidth = 20;
  context.strokeRect(210, 190, 780, 720);
  if (title?.posterUrl) {
    try {
      const image = await loadCardImage(title.posterUrl);
      context.drawImage(image, 230, 210, 740, 680);
    } catch {
      // The identity card remains shareable if artwork is unavailable.
    }
  }
  context.fillStyle = "rgba(0,0,0,.38)";
  context.fillRect(230, 210, 740, 680);
  context.fillStyle = "#f2e6d4";
  context.font = "500 70px sans-serif";
  context.fillText(snapshot.settings.displayName, 90, 1030);
  context.fillStyle = "#c78a64";
  context.font = "600 25px monospace";
  context.fillText("OFFICIAL PERSONNEL FILE", 93, 1085);
  context.strokeStyle = "rgba(242,230,212,.35)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(90, 1140);
  context.lineTo(1110, 1140);
  context.stroke();
  context.fillStyle = "#e7a476";
  context.font = "700 62px monospace";
  if (watched !== null) context.fillText(String(watched), 100, 1240);
  if (streak !== null) context.fillText(String(streak), 395, 1240);
  context.fillStyle = "#b7a79b";
  context.font = "600 20px monospace";
  if (watched !== null) context.fillText("WATCHED", 100, 1280);
  if (streak !== null) context.fillText("DAY STREAK", 395, 1280);
  const originX = 785;
  const originY = 1195;
  const qrSource = await QRCode.toDataURL(snapshot.settings.qrDestination ?? "https://marvelsyllabus.com", { errorCorrectionLevel: "M", margin: 1, width: 330, color: { dark: "#242120", light: "#f2e6d4" } });
  const qrImage = await loadCardImage(qrSource);
  context.drawImage(qrImage, originX - 12, originY - 12, 339, 339);
  context.fillStyle = "#b7a79b";
  context.font = "500 20px monospace";
  context.fillText("BURDEN WITH GLORIOUS SYLLABUS", 90, 1490);
  return new Promise<File>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(new File([blob], "marvelsyllabus-id-card.png", { type: "image/png" })) : reject(new Error("share_card_failed")), "image/png"));
}

function SwipeDots({ count, active, onChange }: { count: number; active: number; onChange: (index: number) => void }) {
  return <div className="carousel-dots">{Array.from({ length: count }, (_, index) => <button type="button" aria-label={`Show title ${index + 1}`} className={active === index ? "is-active" : ""} onClick={() => onChange(index)} key={index} />)}</div>;
}

function DiscoverSection({ snapshot, titles, activeMovie, saved, onSelect, onBook, onSave }: { snapshot: CustomerSnapshot; titles: CatalogTitle[]; activeMovie: number; saved: Set<string>; onSelect: (index: number) => void; onBook: (title: CatalogTitle) => void; onSave: (title: CatalogTitle) => void }) {
  const carouselRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      carouselRef.current?.children[activeMovie]?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeMovie]);
  const scrollTo = (index: number) => { onSelect(index); carouselRef.current?.children[index]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); };
  return <main className="discover-page">
    <header className="cinema-header"><div><p className="cinema-date">{formatDate(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long" })}</p><p className="cinema-choose">Choose your story.</p></div><button className="cinema-avatar" type="button" aria-label="Open profile"><Icon name="profile" size={18} /></button></header>
    <section className="featured-section"><div className="featured-heading"><div><p className="cinema-eyebrow">In cinemas</p><h1>Featured films</h1></div><p>Swipe through this week&apos;s most anticipated releases.</p></div><div ref={carouselRef} className="movie-rail">{titles.slice(0, 6).map((title, index) => <MovieCard key={title.id} title={title} active={activeMovie === index} saved={saved.has(title.id)} onSelect={() => scrollTo(index)} onBook={() => onBook(title)} onSave={() => onSave(title)} />)}</div><SwipeDots count={Math.min(titles.length, 6)} active={activeMovie} onChange={scrollTo} /></section>
    <section className="discover-quick-row"><div><span>Tonight</span><strong>{snapshot.screenings.filter((screening) => bookable(screening)).length} showings on sale</strong></div><div><span>Watch order</span><strong>{titles.length || 61} titles · films & series</strong></div><div><span>All times</span><strong>Asia / Kolkata</strong></div></section>
  </main>;
}

function StreakSection({ snapshot, titles, onShare, onMeter, onOpenTitle }: { snapshot: CustomerSnapshot; titles: CatalogTitle[]; onShare: () => void; onMeter: () => void; onOpenTitle: (title: CatalogTitle) => void }) {
  const streak = streakLength(snapshot.progress);
  const watched = new Set(snapshot.progress.map(watchedKey));
  const movies = titles;
  return <main className="streak-page"><div className="section-topline"><div><p className="cinema-eyebrow">Personal archive</p><h1>Streak</h1></div><button className="outline-action" type="button" onClick={onShare}><Icon name="share" size={16} /> <span>Share</span></button></div><div className="streak-hero"><div className="streak-orbit"><div><strong>{streak}</strong><small>Days</small></div></div><div className="streak-copy"><h2>Weekly quest</h2><span>1 / 2</span><div className="quest-track"><i style={{ width: `${Math.min(100, Math.max(12, streak * 16.6))}%` }} /></div><p>Keep the story moving · +200 XP</p></div><div className="streak-stats"><div><strong>{snapshot.progress.length}</strong><small>Watched</small></div><div><strong>{snapshot.screenings.filter((screening) => Date.parse(screening.startsAt) > Date.now()).length}</strong><small>Upcoming</small></div><div><strong>{streak * 120}</strong><small>XP</small></div></div></div><div className="subsection-heading"><h2>Movies</h2><span>{snapshot.progress.length} marked moments</span></div><div className="streak-movies">{movies.map((title) => { const item = { titleId: title.id, seasonNumber: null, episodeNumber: null } as const; const isWatched = watched.has(watchedKey(item)); return <button type="button" className="streak-movie" key={title.id} onClick={() => onOpenTitle(title)}><div><Poster title={title} /><span className={isWatched ? "watched" : "upcoming"}>{isWatched ? <Icon name="check" size={13} /> : <Icon name="clock" size={13} />}</span><b>+{isWatched ? 120 : 180} XP</b></div><strong>{title.title}</strong><small>{isWatched ? "Watched" : "Upcoming"} · {isWatched ? "Marked" : "Next up"}</small></button>; })}</div><button type="button" className="marvel-meter" onClick={onMeter}><span><Icon name="streak" size={20} /><span><strong>Marvel Meter</strong><small>Level 4</small></span></span><Icon name="arrow" size={17} /></button></main>;
}

function TicketSection({ snapshot, catalog, onPlay, onOpenBooking, onOpenTitle }: { snapshot: CustomerSnapshot; catalog: CatalogTitle[]; onPlay: () => void; onOpenBooking: (booking: TicketBooking) => void; onOpenTitle: (title: CatalogTitle) => void }) {
  const booking = snapshot.bookings[0];
  const show = booking ? snapshot.screenings.find((screening) => screening.id === booking.screeningId) : [...snapshot.screenings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  const title = booking ? catalog.find((entry) => entry.id === booking.titleId) : show ? catalog.find((entry) => entry.id === show.titleId) : catalog[0];
  const ticketValue = booking?.qrValue ?? `preview://${show?.id ?? "ticket"}`;
  const locationParts = (booking?.location ?? show?.location ?? "Arc Cinema · Hall 04").split("·").map((part) => part.trim());
  const time = booking?.startsAt ?? show?.startsAt ?? new Date().toISOString();
  const hasReward = snapshot.campaign.eligible;
  return <main className="ticket-page"><div className="section-topline"><div><p className="cinema-eyebrow">Ready to scan</p><h1>Live ticket</h1></div><span className="ticket-wallet-status"><Icon name="lock" size={13} /> Account wallet</span></div><article className="ticket-card"><div className="ticket-hero">{title?.posterUrl ? <img src={title.posterUrl} alt="" /> : <div className="ticket-hero-placeholder">{title?.title.slice(0, 1) ?? "M"}</div>}<div className="ticket-hero-shade" /><span className="live-chip"><i /> {booking ? "Confirmed" : "Preview"}</span><div><p>{formatDate(time, { weekday: "long", day: "numeric", month: "short" })}</p><h2>{title?.title ?? "Your next screening"}</h2></div></div><div className="ticket-facts"><div><span>Time</span><strong>{formatDate(time, { hour: "numeric", minute: "2-digit" })}</strong></div><div><span>Hall</span><strong>{locationParts.at(-1) ?? "04"}</strong></div><div><span>Group</span><strong>{booking?.quantity ?? 1} {booking?.quantity === 1 ? "ticket" : "tickets"}</strong></div></div><div className="ticket-stub"><div className="ticket-qr-wrap"><TicketQr value={ticketValue} /></div><div><span>Venue</span><strong>{locationParts[0] ?? "Arc Cinema"}</strong><small>{locationParts.slice(1).join(" · ") || "Show this code at the entrance."}</small><code>{booking?.orderCode ?? "MSY-PREVIEW"}</code></div>{booking && <button className="ticket-open" type="button" onClick={() => onOpenBooking(booking)} aria-label="Open ticket details"><Icon name="arrow" size={16} /></button>}</div></article><div className="ticket-actions"><button className="reward-entry" type="button" onClick={onPlay}><span><span className="reward-icon"><Icon name="food" size={20} /></span><span><strong>Play &amp; Earn Rewards</strong><small>{hasReward ? `${snapshot.campaign.completedPlays} of ${snapshot.campaign.requiredPlays} rounds complete` : "Confirm a paid ticket to unlock"}</small></span></span><b>{hasReward ? "Play" : "Locked"}</b></button><button className="ticket-secondary" type="button" onClick={() => title && onOpenTitle(title)}><Icon name="clock" size={15} /> View screening details</button></div><div className="ticket-list">{snapshot.bookings.slice(1).map((entry) => <button type="button" key={entry.id} onClick={() => onOpenBooking(entry)}><span>{formatDate(entry.startsAt, { day: "numeric", month: "short" })}</span><strong>{entry.title}</strong><small>{entry.orderCode}</small><Icon name="arrow" size={15} /></button>)}</div></main>;
}

function displayUserId(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  return "TVA-" + hash.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

function TvaCameraModal({ onClose, onCapture }: { onClose: () => void; onCapture: (photo: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is unavailable. Check your browser permission and try again.");
      return () => { active = false; };
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }).then((stream) => {
      if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(() => { if (active) setError("Camera access is unavailable. Check your browser permission and try again."); });
    return () => { active = false; streamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, []);
  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    onCapture(canvas.toDataURL("image/jpeg", 0.9));
  };
  return <div className="tva-camera-backdrop" role="dialog" aria-modal="true" aria-label="Take profile photo"><div className="tva-camera-modal"><div className="tva-camera-head"><div><span className="profile-eyebrow">Identity scan</span><p className="tva-camera-title">Capture profile image</p></div><button type="button" className="tva-icon-button" aria-label="Close camera" onClick={onClose}><Icon name="close" size={18} /></button></div><div className="tva-viewfinder">{error ? <div className="tva-camera-error">{error}</div> : <video ref={videoRef} autoPlay playsInline muted />}<span className="tva-focus tva-focus-a" /><span className="tva-focus tva-focus-b" /><span className="tva-focus tva-focus-c" /><span className="tva-focus tva-focus-d" /></div><div className="tva-camera-actions"><span>Center your face within the frame</span><button type="button" className="tva-shutter" onClick={takePhoto} disabled={Boolean(error)} aria-label="Take photo"><span /></button></div></div></div>;
}

function ProfileIdCard({ snapshot, isTimeline, onFlip, onShare, onUpdateSettings }: { snapshot: CustomerSnapshot; isTimeline: boolean; onFlip: () => void; onShare: () => void; onUpdateSettings: (settings: Partial<CustomerSettings>) => void }) {
  const title = snapshot.catalog.find((entry) => entry.active) ?? snapshot.catalog[0];
  const streak = streakLength(snapshot.progress);
  const [photo, setPhoto] = useState(title?.posterUrl ?? "");
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const userId = displayUserId(snapshot.settings.displayName || "Agent");
  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhoto(URL.createObjectURL(file));
    setPhotoMenuOpen(false);
  };
  const capturePhoto = (image: string) => { setPhoto(image); setCameraOpen(false); setPhotoMenuOpen(false); };
  return <div className="tva-card-stage"><div className="tva-flip-control" role="group" aria-label="Choose card side"><span className={!isTimeline ? "active" : ""}>Profile</span><button type="button" className={"tva-flip-switch" + (isTimeline ? " is-back" : "")} role="switch" aria-checked={isTimeline} aria-label="Flip to the back of the card" onClick={onFlip}><span /></button><span className={isTimeline ? "active" : ""}>Timeline</span></div><div className={"tva-flipper" + (isTimeline ? " is-flipped" : "")}><article className="tva-id-card tva-face tva-front" aria-hidden={isTimeline}><div className="tva-inner"><div className="tva-heading"><div><span className="tva-authority">Time Variance Authority</span><span className="tva-serial">414-620701-401220</span></div><div className="tva-logo-plate"><img src={tvaLogo} alt="TVA logo" /></div></div><div className="tva-photo-section"><div className="tva-photo-frame">{photo ? <img src={photo} alt={snapshot.settings.displayName + " profile photo"} /> : <div className="tva-photo-placeholder">{(snapshot.settings.displayName || "A").slice(0, 1)}</div>}<span className="tva-scanline" /><button type="button" className="tva-photo-trigger" aria-label="Change profile photo" aria-expanded={photoMenuOpen} onClick={() => setPhotoMenuOpen((open) => !open)}><Icon name="camera" size={18} /></button></div>{photoMenuOpen && <div className="tva-photo-menu"><button type="button" className="tva-photo-option" onClick={() => { setCameraOpen(true); setPhotoMenuOpen(false); }}><span className="tva-option-icon"><Icon name="camera" size={16} /></span><span><strong>Take a photo</strong><small>Use your camera</small></span></button><button type="button" className="tva-photo-option" onClick={() => uploadRef.current?.click()}><span className="tva-option-icon"><Icon name="image" size={16} /></span><span><strong>Choose from gallery</strong><small>JPG, PNG or HEIC</small></span></button></div>}<input ref={uploadRef} className="tva-hidden" type="file" accept="image/*" onChange={selectPhoto} aria-label="Choose profile photo from gallery" /></div><label className="tva-name-field"><span>Agent name</span><input value={snapshot.settings.displayName} onChange={(event) => onUpdateSettings({ displayName: event.target.value.slice(0, 30) })} maxLength={30} aria-label="Your name" /><span className="tva-edit-hint">Click to edit</span></label><div className="tva-stats"><div className="tva-stat"><span className="tva-stat-number">{snapshot.progress.length}</span><span className="tva-stat-label">Movies watched</span></div><div className="tva-stat"><span className="tva-stat-number">{streak}</span><span className="tva-stat-label">Day watch streak</span></div></div><div className="tva-identity"><div><span className="tva-meta-label">User ID</span><strong>{userId}</strong></div>{snapshot.settings.qrDestination ? <TicketQr value={snapshot.settings.qrDestination} /> : <span className="tva-qr-pending">QR set by admin</span>}</div><footer className="tva-footer"><span>For all time.</span><strong>Glorious Purpose</strong><span>Always.</span></footer><button className="tva-share-btn" type="button" onClick={onShare}><Icon name="share" size={14} /> Share ID card</button></div></article><article className="tva-id-card tva-face tva-back" aria-hidden={!isTimeline}><div className="tva-inner tva-back-inner"><div className="tva-back-heading"><div><span className="tva-authority">Temporal record</span><span className="tva-serial">Branch 620701 - Stable</span></div><div className="tva-mini">TVA</div></div><TimelineTree /><div className="tva-tree-message"><span>This tree holds</span><strong>everything that made you, you.</strong><p>Hope, expectation, unsaid love, grief, happiness - and every branch still becoming.</p></div><footer className="tva-footer tva-back-footer"><span>One life.</span><strong>Infinite Branches</strong><span>One purpose.</span></footer></div></article></div>{cameraOpen && <TvaCameraModal onClose={() => setCameraOpen(false)} onCapture={capturePhoto} />}</div>;
}
function TimelineTree() {
  return <div className="tree-art"><svg viewBox="0 0 360 440" role="img" aria-label="A branching timeline tree"><g className="tree-lines"><path d="M180 410V289c0-23-16-31-16-52V113M180 326c0-29 29-34 29-61V92M165 267c-9-31-42-31-42-65V79M209 247c18-27 52-25 52-62V73M123 187c-13-22-45-19-45-56V55M123 159c17-23 32-29 32-59V38M209 183c-1-32 23-41 23-70V42M260 172c13-21 37-29 37-61V67M180 346c-28 13-56 18-79 40M180 365c27 8 52 21 74 42M180 390c-10 16-15 27-16 40M181 390c14 12 22 23 25 40M78 110 47 89V62m31 67-42 9-18-17m137-59-24-23-2-35m103 57 24-24 1-44m40 82 29-22V49m-65 87 51 8 24-18" /></g><g className="tree-nodes">{[[47,62],[18,121],[78,55],[129,24],[155,38],[232,42],[257,27],[297,67],[336,126],[123,79],[209,92],[164,113]].map(([x,y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" />)}</g></svg><span className="branch-word word-hope">Hope</span><span className="branch-word word-love">Unsaid love</span><span className="branch-word word-grief">Grief</span><span className="branch-word word-happy">Happiness</span><span className="branch-word word-expect">Expectation</span><span className="branch-word word-memory">Memory</span><span className="branch-word word-wonder">Wonder</span><span className="branch-word word-becoming">Becoming</span></div>;
}

function ProfileSection({ snapshot, tab, setTab, onShare, onUpdateSettings, authControls }: { snapshot: CustomerSnapshot; tab: ProfileTab; setTab: (tab: ProfileTab) => void; onShare: () => void; onUpdateSettings: (settings: Partial<CustomerSettings>) => void; authControls?: ReactNode }) {
  return <main className="profile-page"><header className="profile-topbar"><button type="button" className="profile-back" aria-label="Back to discover"><Icon name="arrow" size={18} /></button><div className="profile-wordmark"><strong>MS</strong><span>MarvelSyllabus / Personal archive</span></div><span className="profile-clearance">Clearance 07</span></header><section className="profile-layout"><div className="profile-intro"><span className="profile-eyebrow">Official personnel file</span><h1>Your timeline.<br /><em>Your story.</em></h1><p>Every movie leaves a mark. This is the record of yours.</p><div className="profile-nav-list">{([ ["profile","Profile"], ["timeline","Timeline"], ["share","Share card"], ["settings","Settings"] ] as const).map(([id,label]) => <button type="button" className={tab === id ? "is-active" : ""} key={id} onClick={() => setTab(id)}>{label}<Icon name="arrow" size={13} /></button>)}</div>{authControls && <div className="profile-auth">{authControls}</div>}</div><div className="profile-card-stage"><ProfileIdCard snapshot={snapshot} isTimeline={tab === "timeline"} onFlip={() => setTab(tab === "timeline" ? "profile" : "timeline")} onShare={onShare} onUpdateSettings={onUpdateSettings} />{tab === "share" && <div className="profile-share-panel"><p className="profile-eyebrow">Share by choice</p><h2>Render the record.</h2><p>Choose which personal progress belongs on the image, then send the ID card directly to a social app.</p><button type="button" className="copper-button" onClick={onShare}><Icon name="share" size={15} /> Share ID card</button><label><span>Watched progress</span><input type="checkbox" checked={snapshot.settings.shareWatched} onChange={(event) => onUpdateSettings({ shareWatched: event.target.checked })} /></label><label><span>Viewing streak</span><input type="checkbox" checked={snapshot.settings.shareStreak} onChange={(event) => onUpdateSettings({ shareStreak: event.target.checked })} /></label></div>}{tab === "settings" && <div className="profile-share-panel"><p className="profile-eyebrow">Account settings</p><h2>Keep the archive yours.</h2><label><span>Screening reminders</span><input type="checkbox" checked={snapshot.settings.reminderNotifications} onChange={(event) => onUpdateSettings({ reminderNotifications: event.target.checked })} /></label><label><span>Product updates</span><input type="checkbox" checked={snapshot.settings.productUpdates} onChange={(event) => onUpdateSettings({ productUpdates: event.target.checked })} /></label><p className="profile-note">Google sign-in and security are managed by the identity provider.</p></div>}</div></section></main>;
}

function BookingModal({ screening, title, rewards, isSignedIn, onClose, onRequireAuth, onConfirm }: { screening: Screening; title?: CatalogTitle; rewards: RewardGrant[]; isSignedIn: boolean; onClose: () => void; onRequireAuth: () => void; onConfirm: (quantity: number, rewardId?: string) => void }) {
  const maxQuantity = Math.min(10, remaining(screening));
  const [quantity, setQuantity] = useState(1);
  const [rewardId, setRewardId] = useState<string | undefined>();
  const [seconds, setSeconds] = useState(600);
  const reward = rewards.filter((entry) => entry.kind !== "coupon" && entry.status === "available" && (!entry.eligibleTitleIds || (title && entry.eligibleTitleIds.includes(title.id)))).sort((a,b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))[0];
  useEffect(() => { const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (reward) setRewardId(reward.id); }, [reward]);
  const activeReward = reward?.id === rewardId ? reward : undefined;
  const discount = activeReward?.kind === "discount" ? Math.round(screening.priceMinor * (activeReward.discountPercent ?? 0) / 100) : activeReward?.kind === "free-ticket" ? screening.priceMinor : 0;
  return <div className="cinema-modal-backdrop"><section className="cinema-modal" role="dialog" aria-modal="true" aria-label="Booking details"><button className="modal-x" type="button" onClick={onClose} aria-label="Close booking"><Icon name="close" size={18} /></button><p className="cinema-eyebrow">Secure checkout</p><h2>{title?.title ?? screening.title}</h2>{!isSignedIn ? <div className="modal-auth"><Icon name="lock" size={22} /><h3>Sign in to hold your seats.</h3><p>Tickets are saved to your account wallet.</p><button className="copper-button" type="button" onClick={onRequireAuth}>Sign in to continue <Icon name="arrow" size={15} /></button></div> : <><div className="modal-showing"><strong>{formatDate(screening.startsAt, { weekday: "long", day: "numeric", month: "long" })}</strong><span>{formatDate(screening.startsAt, { hour: "numeric", minute: "2-digit" })} – {formatDate(screening.endsAt, { hour: "numeric", minute: "2-digit" })} IST</span><span>{screening.location}</span><b>{Math.floor(seconds / 60).toString().padStart(2,"0")}:{(seconds % 60).toString().padStart(2,"0")} hold</b></div><div className="modal-quantity"><span>Tickets<small>Up to {maxQuantity} per order</small></span><div><button type="button" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><strong>{quantity}</strong><button type="button" disabled={quantity >= maxQuantity} onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}>+</button></div></div>{reward && <label className="modal-reward"><input type="checkbox" checked={Boolean(activeReward)} onChange={(event) => setRewardId(event.target.checked ? reward.id : undefined)} /><span><strong>Apply {reward.title}</strong><small>Automatic · expires {formatDate(reward.expiresAt, { day: "numeric", month: "short" })}</small></span><b>−{money(discount)}</b></label>}<div className="modal-total"><span>Total due</span><strong>{money(Math.max(0, screening.priceMinor * quantity - discount))}</strong></div><p className="modal-note"><Icon name="lock" size={13} /> Razorpay UPI test mode · server verification required</p><button className="copper-button wide" type="button" disabled={!maxQuantity} onClick={() => onConfirm(quantity, activeReward?.id)}>Hold seats &amp; continue <Icon name="arrow" size={15} /></button></>}</section></div>;
}

function TitleModal({ title, screenings, onClose, onBook }: { title: CatalogTitle; screenings: Screening[]; onClose: () => void; onBook: (screening: Screening) => void }) {
  return <div className="cinema-modal-backdrop"><section className="title-modal" role="dialog" aria-modal="true" aria-label={`${title.title} details`}><button className="modal-x" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button><Poster title={title} className="title-modal-poster" /><div><p className="cinema-eyebrow">{title.titleType === "series" ? "Series" : "Film"} · Watch order #{title.watchOrder}</p><h2>{title.title}</h2><p className="title-modal-copy">{title.synopsis}</p><div className="title-modal-shows">{screenings.length ? screenings.map((screening) => <div key={screening.id}><span><strong>{formatDate(screening.startsAt, { weekday: "short", day: "numeric", month: "short" })}</strong><small>{formatDate(screening.startsAt, { hour: "numeric", minute: "2-digit" })} · {screening.location}</small></span><button type="button" className="copper-button small" disabled={!bookable(screening)} onClick={() => onBook(screening)}>{bookable(screening) ? "Book" : "Unavailable"}</button></div>) : <p className="muted-copy">No screenings published yet.</p>}</div></div></section></div>;
}

function App({ authConfigured = false, getToken, signedIn = false, authControls }: AppProps) {
  const [snapshot, setSnapshot] = useState<CustomerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState<Nav>("Discover");
  const [activeMovie, setActiveMovie] = useState<number | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [bookingScreening, setBookingScreening] = useState<Screening | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<CatalogTitle | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>("profile");
  const [gameOpen, setGameOpen] = useState(false);
  const [meterOpen, setMeterOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [demoSignedIn, setDemoSignedIn] = useState(!authConfigured);
  const isSignedIn = authConfigured ? signedIn : demoSignedIn;

  useEffect(() => { let active = true; loadCustomerSnapshot(getToken).then((data) => { if (active) setSnapshot(data); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  useEffect(() => { if (snapshot) persistCustomerState(snapshot); }, [snapshot]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 3500); return () => window.clearTimeout(timer); }, [toast]);

  const catalog = useMemo(() => sortCatalog(snapshot?.catalog ?? []), [snapshot?.catalog]);
  const activeMovieIndex = activeMovie ?? 0;
  const showToast = (message: string, tone: ToastTone = "default") => setToast({ message, tone });
  const requireAuth = () => { if (!authConfigured) { setDemoSignedIn(true); showToast("Preview account signed in.", "success"); } else showToast("Use the sign-in control to continue."); };
  const selectMovie = (index: number) => setActiveMovie(index);
  const openBookingForTitle = (title: CatalogTitle) => { const screening = snapshot?.screenings.filter((entry) => entry.titleId === title.id).sort((a,b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).find(bookable); if (!screening) { showToast(title.active ? "No bookable screening is available yet." : "This title is Upcoming and cannot be booked."); return; } setBookingScreening(screening); };
  const toggleSaved = (title: CatalogTitle) => setSaved((current) => { const next = new Set(current); if (next.has(title.id)) next.delete(title.id); else next.add(title.id); return next; });
  const toggleWatched = async (item: Pick<WatchedItem, "titleId" | "seasonNumber" | "episodeNumber">, watched: boolean) => { if (!snapshot) return; if (!isSignedIn) { requireAuth(); return; } const previous = snapshot; setSnapshot((current) => current ? { ...current, progress: watched ? [...current.progress.filter((entry) => watchedKey(entry) !== watchedKey(item)), { ...item, watchedAt: new Date().toISOString() }] : current.progress.filter((entry) => watchedKey(entry) !== watchedKey(item)) } : current); try { await saveWatchedProgress(item, watched, getToken); showToast(watched ? "Added to your archive." : "Removed from your archive.", "success"); } catch { setSnapshot(previous); showToast("Could not save watch progress.", "danger"); } };
  const confirmBooking = (quantity: number, rewardId?: string) => { if (!snapshot || !bookingScreening) return; const reward = rewardId ? snapshot.rewards.find((entry) => entry.id === rewardId) : undefined; const discount = reward?.kind === "discount" ? Math.round(bookingScreening.priceMinor * (reward.discountPercent ?? 0) / 100) : reward?.kind === "free-ticket" ? bookingScreening.priceMinor : 0; const orderCode = `MSY-${Math.random().toString(36).slice(2,6).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`; const booking: TicketBooking = { id: `booking-${Date.now()}`, orderCode, screeningId: bookingScreening.id, titleId: bookingScreening.titleId, title: bookingScreening.title, startsAt: bookingScreening.startsAt, endsAt: bookingScreening.endsAt, location: bookingScreening.location, quantity, amountMinor: Math.max(0, bookingScreening.priceMinor * quantity - discount), status: "confirmed", ticketStatus: "valid", qrValue: `marvelsyllabus://ticket/${orderCode}`, createdAt: new Date().toISOString() }; setSnapshot((current) => current ? { ...current, bookings: [booking, ...current.bookings], rewards: rewardId ? current.rewards.map((entry) => entry.id === rewardId ? { ...entry, status: "redeemed" } : entry) : current.rewards } : current); setBookingScreening(null); setActiveNav("Ticket"); showToast("Ticket added to your wallet.", "success"); };
  const updateSettings = (settings: Partial<CustomerSettings>) => setSnapshot((current) => current ? { ...current, settings: { ...current.settings, ...settings } } : current);
  const handleRoundComplete = () => { setSnapshot((current) => { if (!current || current.campaign.completedPlays >= current.campaign.requiredPlays) return current; const completedPlays = current.campaign.completedPlays + 1; return { ...current, campaign: { ...current.campaign, completedPlays, status: completedPlays >= current.campaign.requiredPlays ? "complete" : current.campaign.status, reward: completedPlays >= current.campaign.requiredPlays ? { ...current.campaign.reward, status: "available" } : current.campaign.reward } }; }); showToast("Round saved to your account.", "success"); };
  const claimReward = () => { setSnapshot((current) => current ? { ...current, campaign: { ...current.campaign, claimed: true }, rewards: current.rewards.some((reward) => reward.id === current.campaign.reward.id) ? current.rewards : [{ ...current.campaign.reward, status: "available" }, ...current.rewards] } : current); setGameOpen(false); showToast("Reward unlocked in your wallet.", "success"); };
  const shareCard = async () => {
    if (!snapshot) return;
    const watched = snapshot.settings.shareWatched ? `${snapshot.progress.length} watched moments` : "a MarvelSyllabus archive";
    const streak = snapshot.settings.shareStreak ? ` and a ${streakLength(snapshot.progress)} day streak` : "";
    const text = `My MarvelSyllabus archive: ${watched}${streak}.`;
    try {
      const card = await renderProfileShareCard(snapshot);
      const nativeNavigator = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };
      const shareData: ShareData = { title: "My MarvelSyllabus ID card", text, files: [card] };
      if (typeof nativeNavigator.share === "function" && (!nativeNavigator.canShare || nativeNavigator.canShare(shareData))) {
        await nativeNavigator.share(shareData);
        showToast("Share sheet opened.", "success");
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(card);
      link.download = card.name;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast("ID card downloaded. Upload it to your social app.", "success");
    } catch {
      showToast("Could not prepare the share card.", "danger");
    }
  };

  if (loading) return <div className="cinema-shell skeleton-shell"><div className="skeleton-top"><span /><span /></div><div className="skeleton-cinema-title"><i /><b /></div><div className="skeleton-posters"><span /><span /><span /></div><div className="skeleton-nav" /></div>;
  if (!snapshot) return <div className="cinema-shell error-shell"><h1>We lost the signal.</h1><p>Refresh to reconnect to your archive.</p></div>;

  const selectedShows = selectedTitle ? snapshot.screenings.filter((screening) => screening.titleId === selectedTitle.id) : [];
  const bookingTitle = bookingScreening ? catalog.find((title) => title.id === bookingScreening.titleId) : undefined;
  const openRewards = () => { if (!snapshot.campaign.eligible) { showToast("Rewards unlock after a confirmed paid ticket."); return; } if (!isSignedIn) { requireAuth(); return; } setGameOpen(true); };

  return <main className="cinema-shell">
    <div className="cinematic-glow" />
    {activeNav === "Discover" && <DiscoverSection snapshot={snapshot} titles={catalog} activeMovie={activeMovieIndex} saved={saved} onSelect={selectMovie} onBook={openBookingForTitle} onSave={toggleSaved} />}
    {activeNav === "Streak" && <StreakSection snapshot={snapshot} titles={catalog} onShare={shareCard} onMeter={() => setMeterOpen(true)} onOpenTitle={setSelectedTitle} />}
    {activeNav === "Ticket" && <TicketSection snapshot={snapshot} catalog={catalog} onPlay={openRewards} onOpenBooking={(booking) => showToast(`${booking.orderCode} is ready to scan.`)} onOpenTitle={setSelectedTitle} />}
    {activeNav === "Profile" && <ProfileSection snapshot={snapshot} tab={profileTab} setTab={setProfileTab} onShare={shareCard} onUpdateSettings={updateSettings} authControls={authControls} />}
    <nav className="cinema-nav" aria-label="Primary navigation">{([ ["Discover", "home"], ["Streak", "streak"], ["Ticket", "ticket"], ["Profile", "profile"] ] as const).map(([label, icon]) => <button key={label} type="button" aria-current={activeNav === label ? "page" : undefined} className={activeNav === label ? "is-active" : ""} onClick={() => setActiveNav(label)}><Icon name={icon} size={19} /><span>{label}</span></button>)}</nav>
    {selectedTitle && <TitleModal title={selectedTitle} screenings={selectedShows} onClose={() => setSelectedTitle(null)} onBook={(screening) => { setSelectedTitle(null); setBookingScreening(screening); }} />}
    {bookingScreening && <BookingModal screening={bookingScreening} title={bookingTitle} rewards={snapshot.rewards} isSignedIn={isSignedIn} onClose={() => setBookingScreening(null)} onRequireAuth={requireAuth} onConfirm={confirmBooking} />}
    {meterOpen && <div className="meter-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMeterOpen(false); }}><section className="meter-modal"><button type="button" className="modal-x" onClick={() => setMeterOpen(false)} aria-label="Close"><Icon name="close" size={18} /></button><p className="cinema-eyebrow">Marvel Meter</p><h2>Arc Reactor</h2><p>Level 4 movie hero</p><div className="meter-progress-card"><div className="meter-reactor"><Icon name="streak" size={28} /></div><div><strong>{streakLength(snapshot.progress) * 120} XP</strong><small>1,000 XP</small><span><i /></span></div></div><div className="meter-levels"><span>03 Agent</span><strong>04 Reactor</strong><span>05 Vibranium</span></div><button type="button" className="copper-button" onClick={shareCard}><Icon name="share" size={15} /> Share level</button></section></div>}
    {gameOpen && <Suspense fallback={<div className="game-loading-screen"><span>Temporal Loom</span><strong>Loading the signal…</strong></div>}><TemporalLoom completedPlays={snapshot.campaign.completedPlays} requiredPlays={snapshot.campaign.requiredPlays} demoMode={snapshot.source === "demo"} onComplete={handleRoundComplete} onClaim={claimReward} onClose={() => setGameOpen(false)} /></Suspense>}
    {toast && <div className={`cinema-toast ${toast.tone}`} role="status"><Icon name={toast.tone === "success" ? "check" : toast.tone === "danger" ? "close" : "star"} size={15} />{toast.message}<button type="button" onClick={() => setToast(null)} aria-label="Dismiss"><Icon name="close" size={13} /></button></div>}
  </main>;
}

export default App;
