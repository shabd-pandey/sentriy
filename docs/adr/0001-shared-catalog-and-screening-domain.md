# ADR-0001: Shared catalog and screening domain

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The prototype's old `Films` editor is a local preview of 22–32 independent films. The confirmed catalog instead contains 57 films and four series, needs a customer view and account-specific episode progress, and must support future titles without coupling ticketing to the supplied watchlist.

## Decision

- Add a separate catalog-title feature (`film` / `series`) rather than repurposing the existing unrelated film editor.
- Store catalog titles, series-season episode counts, screenings, per-account watch progress, booking holds, and bookings in Neon Postgres. The JSON is imported once; database rows are the live source of truth.
- Seed `watch_order` from the imported JSON. Maintain that global order independently of chronological screening order.
- All imported titles start visible and inactive (`Upcoming`). Activating a title is necessary but not sufficient for booking; each screening must also be open, not cancelled, not started, and have inventory.
- Screenings reference one title. Film screenings have no episode range; series screenings identify one season and an inclusive range in that season.
- Keep customer watch state keyed to the authenticated Clerk subject. Keep privileged writes behind server-side verification of a Clerk JWT role claim.
- Upload only explicitly rights-cleared JPEG, PNG, or WebP artwork to configured S3-compatible object storage. Never ship unverified TMDB URLs.
- Keep external credentials out of browser code. Do not expose booking as successful until a transactional hold and server-verified payment provider flow are deployed.

## Consequences

The platform needs a deployed Worker/Pages Functions API, Neon database migration, object-storage bucket and credentials, Clerk issuer/JWKS and role-template configuration, and (for ticket sales) a verified payment integration. The static Vite preview alone does not provide shared persistence or ticket checkout. Existing preview-only admin pages remain unchanged.
