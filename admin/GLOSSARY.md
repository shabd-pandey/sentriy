# Operator app glossary

Vocabulary specific to the operator app in this directory. Terms the whole platform shares — *Catalog title*, *Screening*, *Reward campaign*, *Reward grant* — are defined once in the [shared glossary](../GLOSSARY.md); this file covers only the operator surface's own names.

## Terms

- **Command Deck**: The operator surface itself, organised into the tabs *activity*, *catalog*, *screenings*, *banners*, *rewards*, and *settings*.
- **Banner**: An operator-authored promotional card with a kicker, title, copy, optional artwork, accent colour, optional destination title or screening, and a `draft` / `published` state governed by a publish window.
- **Campaign code**: A single-use code belonging to a *Reward campaign*, with status `available`, `reserved`, or `used`. A reserved or used code may be attached to one *Campaign entrant*.
- **Campaign entrant**: One customer's participation row as the Command Deck shows it — completed plays, reservation expiry, the code granted to them, its grant status, and any redemption time. The underlying domain concept is a *Campaign enrollment*.
- **Activity entry**: One audited operator action, categorised as `catalog`, `screening`, `artwork`, `settings`, `banner`, or `reward`, attributed to the acting operator.
