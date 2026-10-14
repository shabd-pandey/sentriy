# Gatekeeper

The MarvelSyllabus door-staff app (`app.marvelsyllabus.gatekeeper` on Android).
It scans customer QR codes, admits tickets against the shared ticketing API —
the same backend the customer app and the Command Deck use — and shows live
sold vs checked-in counts per screening.

## Run

Install Flutter 3.27 or later, connect an Android phone or start an emulator,
then run:

```sh
flutter pub get
flutter run
```

On first launch the app asks for camera access. This is required: Android needs
both the `CAMERA` declaration in `android/app/src/main/AndroidManifest.xml`
(missing it was the cause of the black viewfinder in the old release build)
and the runtime grant. If permission is denied the scanner shows an "Allow
camera access" button; if it is permanently denied it deep-links to Settings.

## Install on Android

Build a release APK and copy it to each staff phone:

```sh
flutter build apk --release \
  --dart-define=API_BASE_URL=https://<your-pages-domain> \
  --dart-define=STAFF_TOKEN=<clerk-staff-jwt>
```

Open the APK on the phone to install (allow installs from the app you used to
download it when asked). Approve camera access when prompted.

Without the `--dart-define` flags the app runs in clearly-labeled demo mode
(offline rehearsal list) — fine for practice, never for doors. Release builds
are per-event artifacts (they embed a short-lived staff token) and are
git-ignored; do not commit APKs.

## Demo tickets

Without API flags, use these QR payloads or enter the codes manually:

- `HORIZON-2048` — Avery Morgan, seat B-12
- `HORIZON-3902` — Jordan Lee, seat C-08
- `HORIZON-7185` — Sam Rivera, seat A-03

Each demo ticket can be admitted once per app install. Unknown codes and repeat
check-ins are rejected. In live mode these codes are invalid — only real
`MSY-XXXX-XXXX` order codes from confirmed bookings scan green.

## Production integration

The app speaks the shared ticketing API served by the Pages Functions backend
(`prototype/functions/api/[[path]].ts`, re-exported by `admin/functions`):

- `POST /api/staff/validate` — look up a ticket without changing state.
- `POST /api/staff/check-in` — admit a ticket. Idempotent: a re-scan returns
  `already_used` instead of admitting twice.
- `GET /api/staff/screenings` — tonight's screenings with sold/checked-in counts.

The ticket contract is shared with the customer app and the admin:
QR payload `marvelsyllabus://ticket/MSY-XXXX-XXXX`, manual entry `MSY-XXXX-XXXX`.
`lib/api_ticket_validator.dart` handles both shapes. When no API is configured
the app falls back to `DemoTicketValidator` (offline demo list) and says so on
screen; when the live call fails mid-event it also falls back but flags
"demo fallback used" so staff know that scan was not a live check-in.

### Live build

```sh
flutter pub get
flutter build apk --release \
  --dart-define=API_BASE_URL=https://<your-pages-domain> \
  --dart-define=STAFF_TOKEN=<clerk-staff-jwt>
```

`STAFF_TOKEN` must be a Clerk `platform-api` JWT for an account whose role is
`staff` or `admin` (see the root `production.md` for where to create it).
Tokens expire, so for a real event mint a fresh one shortly before doors open
and rebuild, or paste it into a small local config. Never commit the token.
