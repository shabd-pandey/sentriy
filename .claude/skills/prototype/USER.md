# Approved movie-booking Audience design

**Status:** User-approved visual source of truth for the Audience frontend.

When working on the existing movie-booking Audience frontend, reproduce and preserve the supplied **Movie Booking Interface** design. Do not add, remove, or rearrange its visible interface or its interactions unless the user explicitly requests a change.

## What the design contains

- A dark, cinematic page with a soft background glow, the current date, “Choose your story.”, and a profile button.
- An “In cinemas / Featured films” heading, short supporting copy, and a horizontally scrolling, snap-centered carousel.
- Exactly four featured films, in this order: **The Last Horizon**, **After Midnight**, **Neon Pulse**, and **Crimson Echo**, with their film artwork, metadata, genre labels, save buttons, and “Swipe up to book” controls.
- Active and inactive carousel treatments and one navigation dot per film.
- The original snap-style transition and booking sheet, including its sample Friday screening, venue details, standard-ticket controls, price, booking fee, and continue action.
- The fixed four-item bottom navigation: **Discover**, **Streak**, **Ticket**, and **Profile**.
- The dark palette, amber accents, DM Sans text, and Instrument Serif display type.

Keep the supplied sample copy, movie order, content, imagery, navigation labels, layout, and interactions intact. Keep the four movie poster files local in `prototype/public/images/`.

## Sources

- Original design study: [Movie Booking Interface.make](../../../../Downloads/Movie%20Booking%20Interface.make)
- Current runnable implementation: [App.tsx](../../../prototype/src/App.tsx), [index.css](../../../prototype/src/index.css), and [movie poster assets](../../../prototype/public/images/)

The original design study is authoritative for the approved visual design; the runnable implementation is authoritative for the current working frontend. Preserve both when maintaining this experience.
