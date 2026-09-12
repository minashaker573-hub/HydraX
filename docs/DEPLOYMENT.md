# HYDRAX — Deployment (Vercel)

## The shape: one Vercel project, one Supabase database

```text
                ┌──────────────────────────── Vercel project ────────────────────────────┐
 visitor ──────►│ static (CDN)      /  /links  /request  /privacy  /terms                 │
                │                   /dashboard   /admin                                   │
                │                                                                          │
                │ function          /api/*   /health   /assets/uploads/*  ──► api/index.js ├──► Supabase Postgres
                │ (api/index.js)                                                           │
                │ daily cron        /api/cron/maintenance                                  │
                └──────────────────────────────────────────────────────────────────────────┘
 ESP32 controllers ───────────────────────── POST /api/v1/telemetry ─────────────────────►
```

- **Static files.** `scripts/vercel-build.mjs` assembles `public/` from
  `website/` (at `/`), `dashboard/` (at `/dashboard`) and `admin/` (at
  `/admin`). No bundling — they are already static.
- **The backend** runs as one Vercel Function, `api/index.js` →
  `backend/src/vercel.ts`, wrapping the same `createApp()` that `npm start`
  runs. Every route, validation rule, and header is the same code. The build
  compiles `backend/src` to `backend/dist` with the project's own TypeScript
  (`backend/tsconfig.build.json`), and the function imports that output — a
  type error fails the deploy. Each rewrite carries the original request path
  in `__hydrax_path`, which the handler restores before routing.
- **Uploaded images** are stored in Postgres (`website_media.data`) and served
  at the same `/assets/uploads/<uuid>.jpg` URLs. A Vercel Function has no
  writable, persistent disk, so this is what makes uploads survive. Images
  uploaded before this change are committed to the repository and served as
  static files.
- **Same origin everywhere**, so the CSP stays `connect-src 'self'` and no
  CORS is involved.

`vercel.json` at the repository root holds all of this; `website/check.mjs`
fails if its critical parts are removed.

---

## Deploy

1. Sign in at <https://vercel.com> with the GitHub account that owns the
   repository.
2. **Add New → Project**, import **HydraX**.
3. Leave **Root Directory** as the repository root (`./`) and **Framework
   Preset** as **Other**. Build and install commands come from `vercel.json`;
   leave those fields empty.
4. Under **Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `HYDRAX_DEVICE_KEY` | the key controllers send (same as your local `backend/.env`) |
   | `HYDRAX_ADMIN_KEY` | the operator key for `/admin` (must differ from the device key) |
   | `HYDRAX_DATABASE_URL` | the Supabase **Session pooler** connection string ([CONFIGURATION.md](CONFIGURATION.md)) |
   | `CRON_SECRET` | any long random string — protects the daily maintenance job |

5. **Deploy**. When it finishes, check on the Vercel URL:
   - `/health/live` answers `{"status":"ok",…}`, and `/health` reports the database reachable
   - `/links` shows the team and social accounts
   - `/admin` signs in with `HYDRAX_ADMIN_KEY`
   - `/dashboard` loads

Every push to `master` redeploys.

---

## How it differs from running `npm start`

| Concern | Long-running server | Vercel |
| --- | --- | --- |
| Startup (schema, seeding, link hub upgrade) | once at boot | once per function instance, on its first request; retried if it fails |
| Offline-device alerts | swept every 15 s by a timer | swept (at most every 15 s) right before `GET /api/v1/dashboard` or `/api/v1/alerts` is answered, **plus** once a day by cron |
| Telemetry retention | pruned every 6 h | pruned once a day by cron |
| Quote-form rate limit | one in-memory counter | one counter **per function instance** — a weaker speed bump |
| Uploaded images | database | database |

**Offline alerts on the Hobby plan.** Vercel Hobby allows cron jobs at most
once a day. A device's *online/offline status* is computed on every read, so
the dashboard always shows it correctly; what changes is when a
`DEVICE_OFFLINE` *alert* is created — whenever someone opens the dashboard or
alerts, or at the daily run. For alerts raised within minutes with nobody
watching, Vercel Pro allows per-minute cron: change the schedule in
`vercel.json` (e.g. `"*/1 * * * *"`).

**Upload size.** Vercel Functions accept request bodies up to 4.5 MB, so the
admin's upload limit is 4 MB. Resize larger photos before uploading.

**Cold starts.** The first request to a new function instance runs startup
against Supabase, which can take a few seconds. `/links` renders instantly
from its built-in fallback and fills in team and social content when the API
answers.

## Controllers (firmware)

Controllers post telemetry directly to `https://<your-vercel-domain>/api/v1/telemetry`.
Their `kBackendBaseUrl` (in the git-ignored `firmware/src/config/secrets.h`) is
a LAN address today. Vercel only serves HTTPS, and the firmware's telemetry
client (`firmware/src/net/telemetry_client.cpp`) uses `HTTPClient` with no TLS
configuration — **pointing a controller at the Vercel URL is untested and must
be verified on the bench first.** Irrigation is unaffected either way; only
reporting is.

## The database is shared

The local server and the Vercel deployment use the same Supabase database when
they share `HYDRAX_DATABASE_URL`: edits in the local admin appear on the live
site. Use a separate Supabase project for local experiments if that is not
wanted.

## Local development is unchanged

`cd backend && npm start` still runs everything — website, `/links`, admin,
dashboard, API — from one process with timers, exactly as before. Vercel is
only the deployment target.
