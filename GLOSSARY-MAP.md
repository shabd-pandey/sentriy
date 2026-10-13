# Glossary map

This repository is **multi-context**. Each context owns the vocabulary it introduces; the terms shared by every surface live once, at the root.

| Context | Glossary | Owns |
| --- | --- | --- |
| Shared (all contexts) | [`GLOSSARY.md`](./GLOSSARY.md) | Catalog titles, screenings, bookings, holds, rewards, watch progress — the ticketing domain every surface builds on |
| Customer app | [`prototype/GLOSSARY.md`](./prototype/GLOSSARY.md) | Customer-facing catalog browsing and dashboard surfaces |
| Operator app | [`admin/GLOSSARY.md`](./admin/GLOSSARY.md) | Command Deck: banners, campaign codes, entrants, activity |
| Door staff app | [`door_staff_app/GLOSSARY.md`](./door_staff_app/GLOSSARY.md) | Gatekeeper: check-in, ticket codes, duplicate detection |

Read the shared glossary first — it defines the terms the context glossaries assume. Then read the glossary for the context you are working in.

## Decisions

- System-wide decisions: [`docs/adr/`](./docs/adr/)
- Context-specific decisions: `docs/adr/` inside the context directory, created when the first such decision actually lands.

## Note on layout

The upstream multi-context convention assumes contexts live under `src/<context>/`. This repository keeps its deployable surfaces at the top level (`prototype/`, `admin/`, `door_staff_app/`), so each glossary sits beside its context rather than under `src/`.
