# HYDRAX — Deployment

## The shape: website on Vercel, backend on Render, database on Supabase

```
                    ┌──────────────────────── Vercel ────────────────────────┐
 visitor ──────────►│ /  /links  /request  /privacy  /terms   (static files) │
                    │                                                         │
                    │ /api/*  /admin  /dashboard  /assets/uploads/*  ──proxy──┼──► Render: backend (Node)
                    └─────────────────────────────────────────────────────────┘          │
                                                                                         ▼
 ESP32 controllers ─────────────────────────────── /api/v1/telemetry ──────────► Supabase Postgres
```

**Why not all on Vercel.** The backend is one long-running Node process: two
`setInterval` background jobs (offline-device sweep, telemetry retention), an
in-memory rate limiter, and CMS uploads written to disk. Vercel runs
short-lived functions that are thrown away after each request, so none of that
survives there. Render runs it exactly as `npm start` does locally.

**Why a proxy instead of CORS.** `website/vercel.json` rewrites `/api/*`,
`/admin`, `/dashboard` and `/assets/uploads/*` to the backend. The browser only
ever talks to the Vercel domain, so:

- the website's relative requests (`/api/v1/website-content`, the quote form)
  work unchanged — no `API_BASE`, no `HYDRAX_ALLOWED_ORIGIN`;
- the Content-Security-Policy stays `connect-src 'self'`;
- the admin console and dashboard are reachable on the Vercel domain too, and
  still directly on the Render domain;
- the backend URL appears in exactly one file: `website/vercel.json`.

CDN caching is **disabled** on every proxied path
(`x-vercel-enable-rewrite-caching: 0`), and the backend sends
`Cache-Control: no-store` on every API response. Admin API responses are
authenticated by header, so a cached one must never be served to anyone else —
`website/check.mjs` fails if that header is removed from any proxied path.

---

## 1. Backend on Render

`render.yaml` at the repository root is a Render **Blueprint**: service
`hydrax-api`, free plan, Node 24, health check `/health/live`, auto-deploy on
every push.

1. Sign in at <https://dashboard.render.com> with the GitHub account that owns
   this repository.
2. **New → Blueprint**, select the repository. Render reads `render.yaml`.
3. It asks for the three secrets. Use the same values as your local
   `backend/.env`:
   - `HYDRAX_DEVICE_KEY` — the key the controllers send
   - `HYDRAX_ADMIN_KEY` — the operator key (must differ from the device key)
   - `HYDRAX_DATABASE_URL` — the Supabase **Session pooler** connection string
     ([CONFIGURATION.md](CONFIGURATION.md))
4. **Apply**. The first build takes a few minutes. When it is live, open
   `https://hydrax-api.onrender.com/health/live` — it should answer `200`.
5. **Check the URL Render gave you.** If `hydrax-api` was already taken, Render
   uses a different subdomain. In that case replace
   `https://hydrax-api.onrender.com` in `website/vercel.json` (every rewrite)
   with your real URL, run `cd backend && npm run check`, and push.

The server binds to Render's `PORT` automatically (`HYDRAX_PORT` still wins if
set).

## 2. Website on Vercel

1. Sign in at <https://vercel.com> with the same GitHub account.
2. **Add New → Project**, import the repository.
3. Settings:
   - **Root Directory**: `website`
   - **Framework Preset**: Other
   - **Build Command**: leave empty · **Output Directory**: leave empty
4. **Deploy**. Then check, on your Vercel URL:
   - `/links` shows the team and social accounts (content comes through the proxy)
   - `/admin` opens the operator console; sign in with `HYDRAX_ADMIN_KEY`
   - `/dashboard` loads

Every push to `master` redeploys both services.

---

## Known limits of the free tiers

- **Render free services sleep after 15 minutes without traffic** and take
  about a minute to wake. While asleep, `/links` still renders instantly from
  its built-in fallback, but CMS content — team members, social accounts —
  appears only once the backend answers. Admin and dashboard wait for it. A
  controller posting telemetry every 15 s keeps it awake; otherwise Render's
  paid instance removes the sleep.
- **Render's free disk is wiped on every restart, redeploy and sleep.** CMS
  image uploads are written to `website/assets/uploads/` on that disk, so a
  photo uploaded through the live admin disappears at the next spin-down —
  the page then shows initials instead. **Photos that must persist are
  committed to the repository** (they then exist on both Render and Vercel).
  Durable runtime uploads need either a Render persistent disk (paid plans) or
  moving media storage to Supabase Storage.
- **Uploading through the Vercel domain is not verified.** Vercel does not
  document a body-size or time limit for proxied requests. If an admin photo
  upload fails on the Vercel URL, use the admin on the Render URL directly:
  `https://hydrax-api.onrender.com/admin`.

## Controllers (firmware)

Controllers talk to the backend directly, not through Vercel. Their
`kBackendBaseUrl` (in the git-ignored `firmware/src/config/secrets.h`) is a
LAN address today. Render only serves HTTPS, and the firmware's telemetry
client (`firmware/src/net/telemetry_client.cpp`) uses `HTTPClient` with no
TLS configuration — **pointing a controller at `https://hydrax-api.onrender.com`
is untested and must be verified on the bench before relying on it.** The
controller keeps irrigating either way; only reporting is affected.

## The database is shared

The local server and the Render service use the same Supabase database when
they share `HYDRAX_DATABASE_URL`. Edits made through the local admin appear on
the live site, and both processes run the background jobs (harmless — both are
idempotent). Use a separate Supabase project for local experiments if that is
not wanted.

---

## Alternative: single process on one host

Everything — website, `/links`, admin, dashboard, API — from one Node process,
no Vercel: follow step 1 only and use the Render URL as the public site. No
proxy, no second platform. The free-tier limits above apply in the same way.
