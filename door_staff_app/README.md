# Gatekeeper

A Flutter starter app for door staff checking tickets for **The Last Horizon** premiere.
It includes live QR scanning, manual code entry, duplicate detection, a check-in
counter, and recent scan activity.

## Run

Install Flutter 3.27 or later, connect an Android phone or start an emulator,
then run:

```sh
flutter pub get
flutter run
```

## Install on Android

Download [Gatekeeper.apk](./Gatekeeper.apk) to your Android phone and open it
to install. If Android asks, allow installs from the app you used to download
the APK. Approve camera access when prompted to scan tickets.

The Android APK is a demo build signed with a local debug key; it is for
installing directly on a phone, not publishing through an app store.

## Demo tickets

Use these QR payloads or enter the codes manually:

- `HORIZON-2048` — Avery Morgan, seat B-12
- `HORIZON-3902` — Jordan Lee, seat C-08
- `HORIZON-7185` — Sam Rivera, seat A-03

Each demo ticket can be admitted once per app session. Unknown codes and repeat
check-ins are rejected.

## Production integration

This app intentionally labels its local allowlist as demo mode. Before using it
at a real event, replace `DemoTicketValidator` with an authenticated ticketing
service that validates each scan against the event’s live ticket inventory and
atomically marks admitted tickets as used. The displayed event and attendance
count are sample data.
