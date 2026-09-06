# HYDRAX Mobile

The phone app for monitoring a HYDRAX irrigation controller.

> **The app monitors. It does not control.**
> Irrigation decisions are made on the controller itself. The backend, the
> dashboard and this app all sit downstream of that decision. If the phone
> loses signal, is switched off, or is thrown in a canal, the farm keeps being
> watered exactly as before — only visibility is lost.

**Phase 1 status:** the physical prototype does not exist yet. The only
controller reporting to the backend is the software mock
(`backend/tools/mock-device.ts`), and every reading it produces is flagged
`simulated: true`. The app shows that flag prominently on every screen that
displays telemetry. Nothing in the app pretends otherwise.

---

## Contents

1. [What you need before you start](#1-what-you-need-before-you-start)
2. [Install](#2-install)
3. [Run it](#3-run-it)
4. [Pointing the app at your backend](#4-pointing-the-app-at-your-backend)
5. [Technology, and why](#5-technology-and-why)
6. [Architecture](#6-architecture)
7. [Folder structure](#7-folder-structure)
8. [Screens, and the data behind them](#8-screens-and-the-data-behind-them)
9. [Authentication](#9-authentication)
10. [Simulation vs real hardware](#10-simulation-vs-real-hardware)
11. [Connecting the real ESP32 later](#11-connecting-the-real-esp32-later)
12. [Adding a new sensor later](#12-adding-a-new-sensor-later)
13. [Testing](#13-testing)
14. [Building a real Android app](#14-building-a-real-android-app)
15. [Known limitations](#15-known-limitations)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. What you need before you start

You do **not** need Android Studio, an emulator, or any mobile SDK to run the
app during development. You need three things:

| What | Why | How to check |
| --- | --- | --- |
| **Node.js 22 or newer** | Runs the development server | `node -v` |
| **An Android phone** | Runs the app | — |
| **The phone and the computer on the same Wi-Fi** | The phone loads the app from your computer, and talks to the backend on your computer | — |

On the phone, install **Expo Go** from the Google Play Store. It is a free app
that runs your project without you building or installing an APK. This is the
whole toolchain for day-to-day work.

Android Studio only becomes necessary for two things, both covered in
[section 14](#14-building-a-real-android-app): running an emulator instead of a
real phone, and producing an installable `.apk` file.

> **iPhone:** the app is written to run on iOS too, and Expo Go exists for
> iPhone, but nothing here has been tested on iOS. Building an iOS app for
> distribution additionally requires a Mac and an Apple developer account.
> Android is the Phase 1 target.

---

## 2. Install

Once, from the repository root:

```bash
cd mobile && npm install
```

This installs into `mobile/node_modules/`, separate from `backend/node_modules/`.
Nothing about the backend, dashboard, website or admin console changes, and no
existing npm script is affected.

---

## 3. Run it

You need **two terminals**.

**Terminal 1 — the backend** (this is what the app reads from):

```bash
cd backend && npm start
```

**Terminal 1b — the simulated controller.** Without this, the backend has no
live telemetry to serve and the app will honestly show the controller as
offline. In a third terminal, or in place of leaving terminal 1 idle:

```bash
cd backend && npm run mock-device
```

**Terminal 2 — the app:**

```bash
cd mobile && npm start
```

A QR code appears in the terminal. On the phone, open **Expo Go** and scan it.
The app loads over Wi-Fi in a few seconds. Edit a file on the computer and the
phone updates by itself.

That is the entire loop. There is no build step and nothing to install on the
phone beyond Expo Go.

---

## 4. Pointing the app at your backend

**Most of the time you do not have to do anything.** When you run `npm start`,
the app is served by a development server running on your computer. The app
takes the address of that server, and assumes the HYDRAX backend is the same
machine on port 8080. If you started the backend with `cd backend && npm start`,
that is exactly right.

The `Backend` row on the app's **Device** screen always shows the address it
actually settled on, so you can check rather than guess.

### When you do have to set it

Create `mobile/.env` (copy `mobile/.env.example`) and set one line:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:8080
```

Set it when any of these is true:

- the backend runs on a **different computer** than `npm start`
- the backend runs on a **different port** than 8080
- you built a standalone APK — there is no development server for it to ask

Use the computer's **LAN IP address**, never `localhost`. On a phone,
`localhost` means the phone itself. Find the computer's address with:

```bash
ipconfig
```

and take the `IPv4 Address` of the adapter you are on Wi-Fi with — something
like `192.168.1.20`.

For the Android **emulator** specifically, the host machine is always reachable
at the special address `10.0.2.2`:

```bash
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080
```

Restart `npm start` after changing `.env` — the value is compiled into the
bundle, so a running server does not pick it up.

> **Never put a secret in this file.** Anything named `EXPO_PUBLIC_*` is baked
> into the app bundle and readable by anyone who has the app. The app needs no
> secret at all — see [Authentication](#9-authentication).

---

## 5. Technology, and why

**React Native, via Expo (SDK 57), with TypeScript and expo-router.**

| Decision | Reason |
| --- | --- |
| **React Native + Expo** over native Android (Kotlin) | One codebase runs on Android now and iOS later without a rewrite. The team is already writing TypeScript for the backend, dashboard and admin console; a Kotlin app would be a second language and a second set of habits to maintain for the same screens. |
| **Expo** over bare React Native | Expo Go removes the entire Android toolchain from the daily loop — the thing you asked for was to be able to run this without being an app developer. Expo also owns the parts most likely to go wrong for a first mobile project: native module versions, build config, and the upgrade path. When a real APK is needed, `eas build` produces one without Android Studio. |
| **expo-router** over React Navigation directly | File-based routing: `app/(tabs)/zones.tsx` *is* the Zones tab. Fewer moving parts to explain, and deep links (`hydrax://zone/1`) work without extra wiring. It is React Navigation underneath, so nothing is given up. |
| **TypeScript, strict** | Matches `backend/tsconfig.json`, including `noUncheckedIndexedAccess`. Telemetry is full of nullable fields; the compiler is what stops a missing probe reading from rendering as `undefined%`. |
| **No state-management library** | The app has one shared object (the telemetry snapshot) and two screen-local fetches. React context over four fields is smaller than the dependency that would replace it. |
| **No charting library** | One chart, one axis, no interaction. `react-native-svg` — already needed for the icons — draws it in 170 lines. |
| **No animation library** | Entrance fades and status transitions only, on React Native's built-in `Animated`. Reanimated would be a large native dependency for motion that is deliberately restrained. |
| **No i18n library** | A flat lookup table of about 180 strings, with a test that fails if any is missing a language. |

Runtime dependencies, in full: `expo`, `expo-router`, `expo-constants`,
`expo-linking`, `expo-localization`, `expo-status-bar`,
`react-native-safe-area-context`, `react-native-screens`, `react-native-svg`,
`@react-native-async-storage/async-storage`, plus `react-native-web` and
`@expo/metro-runtime` for the optional browser preview.

---

## 6. Architecture

```
              HYDRAX PROTOTYPE (Phase 2 — does not exist yet)
                        │
                      ESP32  ── local irrigation logic, owns every decision
                        │
                      Wi-Fi
                        │
                        ▼
   ┌─────────────────────────────────────────┐
   │              HYDRAX BACKEND             │   Phase 1: fed by
   │   Node 24 + Postgres, /api/v1/*         │   tools/mock-device.ts
   └─────────────────────────────────────────┘
                        │  HTTPS / REST, read-only for the app
             ┌──────────┴──────────┐
             │                     │
        Dashboard              Mobile app
      (browser, LAN)          (this project)
```

Inside the app, data flows one way:

```
services.ts        one function per endpoint
    │
client.ts          the only place that calls fetch: base URL, timeout,
    │              status handling, error translation
parse.ts           wire shape (snake_case, 0/1) -> app types (camelCase)
    │
SystemProvider     the shared snapshot + polling + staleness
    │
screens            render; they never fetch, never parse, never see a status code
```

That `parse.ts` boundary is the thing that makes the ESP32 swap a non-event:
the UI is written against app types, not against the backend's JSON. A field
rename in the backend is a one-file edit here.

**Polling.** The Home/Zones/Alerts snapshot refreshes every 10 seconds while
the app is in the foreground, and stops completely when the app is
backgrounded (`AppState`), resuming with an immediate fetch when it returns.
The controller publishes every 15 s in the field, so polling faster would only
cost battery. Pull down on any screen to refresh by hand. **No backend polling
behaviour was changed.**

**Offline.** A failed refresh never clears the screen. The last good data stays
up, banner-labelled with its age, alongside the reminder that the controller
keeps irrigating on its own. The last snapshot is also cached on the phone so a
cold start with no signal shows the farm as it was last seen, marked stale,
rather than a spinner. Cached data older than 24 hours is discarded instead of
shown.

---

## 7. Folder structure

```
mobile/
  app/                        expo-router: every file here is a screen
    _layout.tsx               providers (safe area, i18n, telemetry) + stack
    (tabs)/_layout.tsx        the bottom tab bar
    (tabs)/index.tsx          Home
    (tabs)/zones.tsx          Zones
    (tabs)/history.tsx        History
    (tabs)/alerts.tsx         Alerts
    (tabs)/device.tsx         Device
    zone/[zone].tsx           zone detail, opens as a sheet
    +not-found.tsx            bad deep link
  src/
    api/
      config.ts               where the backend is; base URL resolution
      client.ts               the only fetch call in the app
      errors.ts               ApiError + user-facing message mapping
      parse.ts                wire format -> app types
      services.ts             one function per endpoint
      types.ts                the app's view of the contract
    state/
      SystemProvider.tsx      shared snapshot, polling, staleness
      useAsyncResource.ts     loading/success/error for one-shot fetches
      cache.ts                last-known-good snapshot on the phone
    i18n/
      strings.ts              every user-facing string, EN + AR
      I18nProvider.tsx        language, direction, persistence
    components/               the UI kit (Text, Card, Row, StatusPill, …)
    theme/tokens.ts           colour, spacing, type scale
    utils/                    formatting, classification, motion
  __tests__/                  unit + screen tests (npm test)
  __checks__/                 contract check against a running backend
  scripts/generate-icons.mjs  regenerates the app icons
  assets/                     generated icons
```

---

## 8. Screens, and the data behind them

Every value on every screen comes from an endpoint listed here. Nothing is
computed from data the backend does not have.

| Screen | Endpoint(s) | Shows |
| --- | --- | --- |
| **Home** | `GET /api/v1/dashboard` | System status, a farm moisture dial with per-zone breakdown, pump/active-zone/valve summary, a horizontal zone snapshot strip, an alert summary (ALL CLEAR or active count), recent activity |
| **Zones** | `GET /api/v1/dashboard` | Every zone: moisture, advisory threshold band (or `NO BAND SET`), valve, probe coverage, irrigation state |
| **Zone detail** | `GET /api/v1/dashboard` | Both probe readings and their validity flags, zone average on an arc gauge, coverage, valve, controller state, current run time, threshold band |
| **History** | `GET /api/v1/devices/:id/telemetry`, `GET /api/v1/devices/:id/events` | Soil moisture chart per zone with irrigation runs shaded, pump runtime summed from reported durations, the event log |
| **Alerts** | `GET /api/v1/alerts` | Real alerts with the backend's own ids, severity, message and timestamps; Active / All filter |
| **Device** | `GET /api/v1/devices/:id` + snapshot | Device id, firmware, controller status, first seen, stored sample count, online state, last seen, Wi-Fi link, RSSI, reported uptime, the live SENSE→UNDERSTAND→DECIDE→ACT→MONITOR pipeline, simulation flag, backend address |

**V2 note:** the SENSE→UNDERSTAND→DECIDE→ACT→MONITOR pipeline lived on Home
in the first UI pass. It moved to Device in the V2 redesign — a diagnostic
reading of what the controller just did belongs on the diagnostics screen,
and Home now answers "is the farm all right?" in a glance rather than reading
like firmware instrumentation. No data or endpoint changed, only where the
same `ControlLoop` component is mounted.

Endpoints the app deliberately does **not** call:

| Endpoint | Why not |
| --- | --- |
| `PUT /api/v1/devices/:id/config` | Operator action, requires `X-Admin-Key` |
| `POST /api/v1/alerts/:id/resolve` | Operator action, requires `X-Admin-Key` |
| `GET /api/v1/requests` | Customer personal data, operator-only |
| Anything that commands hardware | No such endpoint exists, and the controller owns irrigation decisions |

### Things the app refuses to show

Not omissions — deliberate. Each has a visible explanation in the app rather
than a silent absence:

- **Water volume, flow rate, litres saved.** No flow meter is fitted. Inferring
  litres from pump runtime would be wrong exactly when it matters: a blocked
  line and a burst pipe both run the pump while moving very different volumes.
- **Pump health, vibration, current, temperature.** No sensors for any of it.
- **Weather, forecasts, predictive maintenance, leak localization.** Not in
  Phase 1, backend or firmware.
- **A "water this zone now" button.** No command endpoint exists, and the
  controller decides locally. A button that quietly did nothing would be worse
  than no button.
- **A moisture verdict when no threshold band is stored.** The zone shows
  `NO BAND SET`, not "normal". The controller always has thresholds — they are
  compiled into its firmware — but the backend's advisory copy may be empty,
  and the app says precisely that.
- **A pump runtime total when the controller reported no durations.** The mock
  device sends `duration_ms: 0`; the app shows `NOT REPORTED` rather than `0s`,
  because "the pump ran for no time" and "the controller did not say" are
  different claims.

### Language

English and Arabic, switchable from the toggle on Home, taking effect
immediately with no app restart. The default follows the phone's locale.

Arabic mirrors the layout — rows, alignment, the control-loop rail, the card
edge marker. Measurements do not mirror: percentages, RSSI, device ids,
firmware strings and the chart axis stay left-to-right with Western digits in
both languages, because they are instrument readings and hardware identifiers,
not prose. This is the same rule the web dashboard follows.

### Accessibility

Every status carries a word, never only a colour (`● ONLINE`, not a green dot).
Tap targets are at least 44–48 dp. Decorative elements are hidden from screen
readers; zone cards, filters and the language toggle carry explicit labels,
roles and selected state. Animations are skipped entirely when the phone's
"remove animations" setting is on.

---

## 9. Authentication

**The app sends no credentials, and holds none.**

The Phase 1 backend has exactly two secrets, and neither belongs in a phone app:

| Key | Guards | Why the app must not have it |
| --- | --- | --- |
| `X-Device-Key` | Telemetry ingestion (`POST /api/v1/telemetry`, `/events`) | Flashed into controller firmware. The app never publishes telemetry. |
| `X-Admin-Key` | Threshold writes, alert resolution, customer quote requests | Shipping it inside an app that runs on other people's phones would hand every installer the ability to rewrite irrigation thresholds for the whole farm. **An APK is not a secret** — anyone can unzip one and read the strings. |

The endpoints the app reads — dashboard, devices, telemetry, events, alerts —
require no authentication in the current backend. So the app works today,
correctly, with no credential of any kind. `src/api/client.ts` exposes only a
`GET` helper and sets exactly one header (`Accept`); a test asserts that no
header matching `key` is ever sent.

### The gap, stated plainly

**The backend has no end-user authentication.** Its read endpoints are open to
anyone who can reach the port. That is a defensible Phase 1 decision for a
dashboard served on a farm's own LAN, and it is why this app could be built
without inventing a login. It is **not** sufficient the day the backend is
exposed to the internet: at that point anyone who finds the host can read the
farm's telemetry.

I did not paper over this with a fake login, and I did not reuse the operator
key as a user credential. What the app does instead:

- send nothing, claim nothing
- treat `401`/`403` as a real, translated error state, so if authentication is
  added the app fails visibly instead of silently showing an empty farm

### The minimal safe design, when you need it

When HYDRAX leaves the LAN, the smallest change that is actually safe:

1. **A `users` table and a `POST /api/v1/auth/login`** returning a short-lived
   bearer token (JWT or an opaque random token in a `sessions` table). Password
   hashing with `node:crypto`'s `scrypt` — no new dependency needed.
2. **A `requireUser` guard** on the read endpoints, alongside the existing
   `authorizeDevice` / `authorizeAdmin` in `backend/src/http/auth.ts`. The
   existing dashboard would need the same treatment.
3. **In the app:** a login screen, the token in `expo-secure-store` (hardware-
   backed keystore — *not* `AsyncStorage`, which is plain text), an
   `Authorization: Bearer` header added in `client.ts`, and a `401` handler that
   clears the token and returns to login.

That is roughly one backend module and one app screen. It is deliberately out
of scope here because the brief was to build the app against the backend that
exists, and because a login that protects nothing is worse than no login.

Everything else already holds: the app never touches the database directly,
never sees a Supabase credential, and only ever talks to the HYDRAX backend.

---

## 10. Simulation vs real hardware

The backend marks every telemetry row with a `simulated` flag, set by the
device that sent it. The app carries that flag straight to the surface:

- an amber **SIMULATION** banner on Home, Zones and Device
- on Device, a full sentence: *"This controller is a software simulation. Every
  reading below is synthetic — no soil probe, pump or valve exists behind it
  yet."*
- a **SIMULATION / ON** row in the Device screen's DATA SOURCE section

When a real ESP32 posts with `simulated: false`, the same components render a
quieter green **FIELD HARDWARE** label instead. **No code change is required
for that transition** — the flag flips, the label follows.

---

## 11. Connecting the real ESP32 later

The app is already finished for this. It never talks to hardware; it talks to
the backend, and the backend's contract does not change when the sender does.

**The exact next step, in order:**

1. **Flash the firmware** with `kDeviceKey` matching the backend's
   `HYDRAX_DEVICE_KEY`, and point it at the backend host (see
   `docs/HARDWARE_BRINGUP.md`).
2. **Confirm the ESP32 is ingesting.** With the mock device stopped:
   ```bash
   curl http://<backend-host>:8080/api/v1/devices
   ```
   The real controller's `device_id` should appear with `"simulated": false`.
3. **Stop the mock device permanently** so two controllers are not reporting at
   once. The app shows the first device the backend returns; two senders means
   an arbitrary one wins.
4. **Open the app.** Home should show the real device id, the SIMULATION banner
   should have become FIELD HARDWARE, and the control loop should track the real
   state machine. Nothing needs rebuilding, reconfiguring or reinstalling.
5. **Run the contract check** against the real controller's data:
   ```bash
   cd mobile && HYDRAX_API_URL=http://<backend-host>:8080 npm run check:backend
   ```
   It prints what the app can actually see, and fails if the shape has drifted.

Two things worth knowing before that day:

- **Multiple controllers.** `SystemProvider` exposes `snapshot.devices` as a
  list but shows `devices[0]`. A two-controller farm needs a device picker in
  the app — a screen, not an architecture change.
- **Bluetooth commissioning** (getting Wi-Fi credentials onto a new ESP32) is
  deliberately not implemented. If it is added, it belongs in a separate module
  that runs *before* a controller is on the network and never touches
  `src/api/` — commissioning must never become part of the irrigation control
  path.

---

## 12. Adding a new sensor later

The hardware roadmap includes flow, pump current, pump temperature, vibration,
and gas/smoke/water safety sensors. When one is actually fitted:

1. **Firmware** adds the field to its telemetry payload.
2. **Backend** accepts it in `domain/validate.ts`, stores it, and returns it in
   `routes/dashboard.ts` / `routes/devices.ts`.
3. **Mobile — three small edits:**
   - add the field to the relevant interface in `src/api/types.ts`
   - read it in `src/api/parse.ts` (use `optNum` / `optStr` so an older
     controller that does not send it stays valid)
   - add a `KeyValue` row or a card to the screen that should show it, and its
     label to `src/i18n/strings.ts` in both languages

No change to navigation, fetching, state or error handling. The zone detail
screen is written to absorb extra rows without a redesign.

**Do not add the UI first.** An empty "Flow: —" row teaches the reader that the
farm has a flow meter. Absent hardware should be absent from the screen, or
explicitly explained — as it currently is on the History screen.

---

## 13. Testing

```bash
cd mobile
npm test          # 93 tests, no network, no device needed
npm run typecheck # tsc --noEmit, strict
```

The suites, and what each is actually protecting:

| Suite | Covers |
| --- | --- |
| `api.test.ts` | Base URL resolution; parsing of real captured backend responses; malformed, empty and unknown-enum payloads; every failure mode of the client (network, timeout, 401, 500, non-JSON); the assertion that no credential is ever sent |
| `format.test.ts` | Percentages, durations, relative time, broken timestamps; the honesty rules — no band means `NO BAND`, not `NORMAL`; a farm average that excludes unread zones instead of counting them as zero |
| `i18n.test.ts` | Every string has both languages, no Arabic left as English, placeholders match across languages |
| `screens.test.tsx` | All five screens over a stubbed network: loading, success, empty, error; the SIMULATION label; `NO BAND SET`; that a raw backend error is never rendered |
| `rtl.test.tsx` | Arabic copy renders; rows reverse; measurements and device ids do not |
| `state.test.tsx` | loading → success → stale transitions; data survives a failed refresh; the snapshot cache round-trips and expires |
| `navigation.test.tsx` | Zone card accessibility labels, zone detail routing, a zone the controller no longer reports, and that no field exists for unfitted hardware |

Against a **running** backend, additionally:

```bash
npm run check:backend                                   # localhost:8080
HYDRAX_API_URL=http://192.168.1.20:8080 npm run check:backend
```

This one calls the real endpoints with the app's own service and parsing code,
and prints what it found. It is not part of `npm test`, because a suite that
fails when a server is not running is a suite people learn to ignore.

---

## 14. Building a real Android app

Two ways, depending on whether you want to install Android Studio.

### A. Cloud build (no Android Studio)

```bash
cd mobile
npx eas-cli build --platform android --profile preview
```

Requires a free Expo account. It builds on Expo's servers and gives you a URL
to download the `.apk` from; open that link on the phone to install it.

Before doing this, set `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env` to an
address the phone can reach **without** the development server — a standalone
build has none to ask.

### B. Local build (Android Studio required)

Install [Android Studio](https://developer.android.com/studio), let it install
the Android SDK and set `ANDROID_HOME`, then:

```bash
cd mobile
npx expo run:android
```

This generates the native `android/` project (currently absent, by design —
Expo regenerates it) and installs a debug build on a connected phone or a
running emulator. To create an emulator: Android Studio → **Device Manager** →
**Create device**.

### C. Browser preview (layout only)

```bash
cd mobile && npm run web
```

Renders the app in a browser at a phone width. Useful for checking layout
without a phone, but **it cannot reach the backend**: browsers enforce CORS and
the HYDRAX backend does not send CORS headers for its read endpoints, so the
web preview will show the "Cannot reach HYDRAX" state. React Native on a real
phone is not a browser and is not subject to CORS, so this affects the web
preview only. Use a phone or emulator for anything involving live data.

---

## 15. Known limitations

| Limitation | Detail |
| --- | --- |
| **No end-user authentication** | The backend has none. The app sends no credentials. See [section 9](#9-authentication) for the gap and the minimal safe design. |
| **Read-only** | No thresholds can be edited, no alerts resolved, no irrigation commanded. Those need the operator key, or an endpoint that does not exist. |
| **One controller** | The app shows `devices[0]`. The data layer already returns a list; a second controller needs a picker screen. |
| **History is capped at 60 samples** | `GET /api/v1/devices/:id/telemetry` fetches each sample's zone rows in a separate query, so it costs roughly 40 ms per sample against hosted Postgres — 180 samples takes about 8 seconds. 60 keeps the screen responsive and is more points than a phone-width chart can resolve. Fixing this properly means a single joined query in `backend/src/db/repository.ts`; it is a backend performance issue, not a mobile one, and no backend change was made here. |
| **No push notifications** | A new alert is visible when the app is open (tab badge, Alerts screen). Waking the phone for a critical alert needs a push service and a backend-side trigger. |
| **iOS untested** | Written to run there; never run there. |
| **No Bluetooth commissioning** | Deliberate. See [section 11](#11-connecting-the-real-esp32-later). |
| **Web preview cannot reach the backend** | CORS. See [section 14C](#c-browser-preview-layout-only). |
| **Time is shown as the phone's local time** | The backend stamps everything in UTC. Absolute timestamps on the Device screen are rendered in the phone's timezone. |

---

## 16. Troubleshooting

**"Cannot reach HYDRAX" on the phone**

Check, in order:

1. Is the backend running? From the computer: `curl http://127.0.0.1:8080/health/live`
2. Is the phone on the same Wi-Fi as the computer? Guest networks usually block
   device-to-device traffic entirely.
3. Does the address on the app's **Device** screen (`Backend` row) look like the
   computer's LAN IP? If it says `localhost`, set `EXPO_PUBLIC_API_BASE_URL` —
   see [section 4](#4-pointing-the-app-at-your-backend).
4. Windows Firewall will often block inbound connections to Node on a new
   network. Allow it, or try from the phone's browser:
   `http://<computer-ip>:8080/health/live` — if the browser cannot reach it, the
   app cannot either, and the problem is the network, not the app.

**The app shows "No controller registered"**

The backend has never received telemetry. Start the simulated controller:
`cd backend && npm run mock-device`.

**The controller shows OFFLINE**

The backend has telemetry but nothing recent (default: silent for more than
60 s). Either the mock device is stopped or the real controller is not
reporting. This is the app telling the truth, not a bug.

**Expo Go says the project needs a different SDK version**

Update Expo Go from the Play Store. The project targets SDK 57.

**`npm start` fails, or the phone loads a stale version**

```bash
cd mobile && npx expo start --clear
```

**Something is wrong and you want the raw picture**

```bash
cd mobile && npm run check:backend
```

It calls every endpoint the app uses, with the app's own code, and prints what
came back.

---

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md) — the system as a whole
- [TELEMETRY.md](TELEMETRY.md) — the telemetry contract the app parses
- [CONFIGURATION.md](CONFIGURATION.md) — backend environment variables
- [DASHBOARD.md](DASHBOARD.md) — the web dashboard this app shares its design language with
- [HARDWARE_BRINGUP.md](HARDWARE_BRINGUP.md) — bringing up the real ESP32
