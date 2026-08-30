# HYDRAX — Dashboard

The Farm Monitoring & Control dashboard. Monitoring only: it reads the backend
and never commands the controller.

---

## The rule that shapes this dashboard

> **A signal with no sensor behind it is shown as `NOT AVAILABLE`.**

Never zero, never an estimate, never a plausible-looking number. A dashboard
that shows a reassuring figure for something it cannot measure is worse than one
that shows nothing, because an operator will believe it.

This is why the flow-rate tile reads `NOT AVAILABLE` rather than a litres/min
figure, and why there is no leak indicator: the Phase 1 hardware has no flow
meter, so a green "no leak" would be a claim the system cannot support.

---

## Technology

| Choice | Reason |
| --- | --- |
| Vanilla ES modules, no framework | The existing dashboard had none, and the brief was not to introduce one |
| No build step | Files are served straight from disk by the existing backend |
| System font stack | HYDRAX is local-first; a remote font CDN fails exactly when the farm network does |
| Polling over REST | The transport the backend already supports — see [real-time](#real-time-updates) |
| `textContent` only, never `innerHTML` | Telemetry carries device-supplied strings; enforced by `npm run check:dashboard` |

**No backend changes were required.** Every endpoint the dashboard consumes
already existed.

---

## Files

```
dashboard/
  index.html        app shell: sidebar, topbar, view container
  styles.css        design tokens + all component styles
  check.mjs         static checks (parse, imports, innerHTML ban)
  js/
    app.js          entry: routing, polling cadences, error states
    api.js          the backend calls, all of them
    format.js       formatting + the enum -> severity vocabulary
    ui.js           DOM helpers, KPI/pill/gauge, chart, farm schematic
    views.js        the seven view renderers
```

---

## Sections

| Section | Real data | Shown as NOT AVAILABLE |
| --- | --- | --- |
| **Overview** | System online, farm-average moisture, pump state, irrigation state, active zone, alerts, events, live control-loop pipeline | Water flow |
| **Smart Irrigation** | Per-zone sensor 1 & 2, average, DRY/NORMAL/WET vs configured band, coverage, valve, irrigation state, last run + duration, **real moisture history chart** | Water consumption per zone |
| **Pump Health** | Pump state, current run, start count and abnormal stops derived from the event log | Current, temperature, vibration, health score, anomaly, all predictive maintenance |
| **Water Network** | Pump state, both valve states, distribution schematic | Flow rate, consumption, leak status, affected zone |
| **Safety Center** | Controller status, actuator interlock, sensor integrity, runtime cut-outs, firmware interlocks, safety events | Ambient temperature, gas, smoke, water detection, hardware e-stop |
| **Alerts & Events** | Active alerts, filterable event timeline, resolved alert history | — |
| **Device** | Device ID, firmware, connection, last telemetry, uptime, sample count, Wi-Fi/RSSI, backend status, LIVE/OFFLINE/DEMO | Device clock when NTP has not synced |

Pump Health and Safety Center are **not empty shells**. Pump *usage* is real,
derived from irrigation events; Safety Center shows the firmware's actual
fail-safe state. Only the missing *sensors* read NOT AVAILABLE.

---

## APIs consumed

All pre-existing. The dashboard is a read-only consumer except for the zone
config endpoint, which it does not currently write.

| Endpoint | Cadence | Used for |
| --- | --- | --- |
| `GET /api/v1/dashboard?events=80` | 3 s | Everything on every page |
| `GET /api/v1/devices/:id/telemetry?limit=150` | 15 s | Moisture history chart |
| `GET /api/v1/alerts?active=false&limit=200` | 15 s | Resolved alert history |
| `GET /api/v1/devices/:id` | 15 s | Device uptime, clock, sample count |

### Data mapping

| UI element | Source field |
| --- | --- |
| System ONLINE/OFFLINE | `device.online` (server-computed from `last_seen_at`) |
| Soil moisture (farm) | mean of `zones[].average` where present — labelled "farm average" |
| Zone sensor 1 / 2 | `zone.sensor_1` / `sensor_2`, blanked unless `sensor_N_valid` |
| Zone average | `zone.average` (backend already excludes invalid probes) |
| Moisture status | `zone.average` vs `zone.config.start_percent` / `stop_percent` |
| Sensor coverage | `zone.valid_sensors` (2 → OK, 1 → DEGRADED, 0 → NO VALID PROBE) |
| Valve | `zone.valve_open` |
| Irrigation state | `irrigation.state` |
| Current run | `irrigation.run_ms` |
| Last irrigation + duration | newest `IRRIGATION_STOPPED` / `IRRIGATION_TIMEOUT` event for that zone |
| Pump | `pump_on` |
| Alerts | `alerts[]` (type, severity, message, raised_at) |
| Events | `events[]` (type, zone, detail, moisture, duration_ms, received_at) |
| Chart | `telemetry[].zones[].average` against `received_at` |

---

## Real-time updates

The backend exposes **no SSE or WebSocket endpoint**, and none was added.
Polling was kept because:

- `/api/v1/dashboard` already returns a complete refresh in one request, so
  polling costs one call per interval rather than a stream of deltas;
- a farm LAN drops in and out, and polling recovers from that with no
  reconnect/backoff state machine;
- adding a transport would have meant changing the backend, which the brief
  ruled out.

Two cadences, matched to how fast the data actually changes:

| Cadence | Interval | Calls |
| --- | --- | --- |
| Live state | 3 s | `/api/v1/dashboard` |
| Slow state | 15 s | history, alert history, device detail |

If sub-second updates are ever needed, SSE is the natural next step — a single
`GET /api/v1/stream` pushing the same aggregate payload, with this polling loop
kept as the fallback.

---

## Demo mode

The mock device fixture (`backend/tools/mock-device.ts`) is unchanged and still
supported.

Any device whose telemetry carries `simulated: true` is labelled everywhere:

- a **`DEMO / SIMULATION`** badge in the topbar, on every page;
- a full-width banner at the top of every view;
- `Data source: DEMO` on the Device page.

The flag comes from the device's own telemetry and is stored per sample, so a
device cannot be simulated on one page and real on another.

```bash
cd backend
HYDRAX_DEVICE_KEY=demo npm start
npm run mock-device -- --key demo --interval 1000
```

The fixture replays a fixed script — a normal cycle, a probe fault, recovery and
a runtime timeout. It contains **no irrigation logic**; the real decisions live
once, in the firmware.

---

## Error states

| Condition | Behaviour |
| --- | --- |
| Backend unreachable, no cached data | Full-width error banner explaining the controller is unaffected. No empty skeleton. |
| Backend unreachable, cached data | Last known values kept, with a banner saying when they went stale |
| Device offline | Banner naming the silence duration and stating irrigation continues locally |
| No device has reported | Actionable empty state with the command to start the mock device |
| Sensor invalid | The individual reading reads NOT AVAILABLE; the zone average uses the surviving probe and is marked DEGRADED |
| Zone has no valid probe | `NO VALID PROBE`, average blank — never 0% |
| No telemetry history | The chart is not drawn; an empty state explains it needs at least two samples |
| No events / no alerts | Explicit empty states |
| No threshold band configured | Zones show `NO BAND SET` plus a note that the controller still has its own compiled-in thresholds |

The dashboard never renders a broken chart or a misleading zero.

---

## Running it

```bash
cd backend
npm install
HYDRAX_DEVICE_KEY=your-secret npm start
```

Open <http://localhost:8080/dashboard>. The backend serves the dashboard from
`dashboard/` mounted at `/dashboard`, and the public website from `website/` at
`/`. There is nothing to build.

Absolute asset URLs in `index.html` therefore carry the `/dashboard` prefix;
`npm run check:dashboard` fails the build if one is missing it.

### Checks

```bash
npm run check:dashboard   # parse, imports, entry points, innerHTML ban
npm test                  # 65 backend tests
npm run typecheck         # tsc --noEmit
```

---

## Responsive behaviour

| Width | Layout |
| --- | --- |
| > 1040 px | Sidebar + two-column content. The competition presentation view. |
| 860–1040 px | Sidebar retained, content collapses to one column |
| < 860 px | Sidebar becomes a horizontal scrolling tab bar; pipeline stacks |

---

## Design language

- **Palette** — cool-biased neutrals; a single blue accent; semantic colour
  (ok / warn / crit / water) reserved exclusively for state, never decoration.
- **Hierarchy** — KPI strip first (the 10-second read), then the control-loop
  pipeline, then detail.
- **Status encoding** — pill *and* card stripe, so state survives greyscale and
  does not rely on colour alone.
- **Numbers** — tabular figures everywhere so digits line up between refreshes.
- **Motion** — one pulsing dot for live activity. Nothing else animates.

### The story the Overview tells

`SENSE → UNDERSTAND → DECIDE → ACT → MONITOR` is rendered as **live state**,
not a static diagram: probe validity, the driest zone and its status, the
decision, the actuators, and telemetry freshness.

The DECIDE stage is careful about what it claims. When a zone reads dry but
nothing is running, the dashboard cannot see whether that is a cooldown, a
timeout lockout or degraded coverage — so it reports the observation and names
the possibilities rather than asserting a cause it has not verified.

---

## Known limitations

1. **Single device.** Phase 1 is one controller; the dashboard renders the first
   reporting device rather than pretending to be a fleet view.
2. **Read-only.** No irrigation can be commanded from the dashboard. That is
   deliberate — putting the network in the control path would break the
   local-first guarantee.
3. **Zone thresholds are not editable here.** The `PUT .../config` endpoint
   exists and the dashboard displays the band, but editing is not wired up, and
   the firmware does not consume the value yet either.
4. **Read endpoints are unauthenticated.** Unchanged from Phase 1; assumes a
   trusted LAN.
5. **The chart shows only what is retained.** Default retention is 30 days, and
   the chart requests the most recent 150 samples.
6. **Verified against the mock device only.** No hardware was available; real
   sensor data has never flowed through this UI.
