# HYDRAX — Deployment

## Why this isn't a single "deploy" button

The backend (`backend/`) is one long-running Node process: a plain
`http.createServer`, a SQLite file on disk, an in-memory rate limiter, and two
`setInterval` background jobs (offline-device sweep, telemetry retention
pruning). That combination needs a host that keeps a process alive and gives
it a writable disk. It **cannot** run on a serverless/edge platform like
Vercel — those spin a function up per request and throw the instance away
afterward, so the database would reset (or simply not exist) on every cold
start, and the background jobs would never fire.

Two supported shapes:

| Shape | Where | Use when |
| --- | --- | --- |
| **Single process** (default) | One host: Render, Railway, Fly.io, a VPS | Simplest. Website, dashboard, admin and API are all served by the one backend process, exactly as `backend/src/server.ts` already does. No code changes. |
| **Split** | Website on Vercel; backend (API + dashboard + admin) elsewhere | When you specifically want the marketing site on Vercel. Requires the CORS and API-base config described below. |

---

## Single process (recommended default)

This is what `npm start` already does — see [WEBSITE.md](WEBSITE.md#running-it)
and [REQUESTS.md](REQUESTS.md#running-the-flow-locally). Point any host that
runs a long-lived Node process at `backend/`:

- **Build command**: `npm install`
- **Start command**: `npm start`
- **Root directory**: `backend`
- **Node version**: ≥ 22.6 (see `backend/package.json` → `engines`)
- **Required env vars**: `HYDRAX_DEVICE_KEY`, `HYDRAX_ADMIN_KEY` (distinct
  values — the server refuses to start otherwise)
- **Persistent disk**: mount one at the path `HYDRAX_DB_PATH` points at (or
  leave the default `backend/data/hydrax.db` and mount the disk at
  `backend/data`), or every restart starts from an empty database. HYDRAX has
  no real field deployment yet, so this is a "when it matters" concern, not a
  launch blocker — but it does mean quote requests submitted before a
  redeploy will be gone after one on a host without a persistent disk.

Website, dashboard (`/dashboard`) and admin (`/admin`) are all served by this
one process, at this one origin — nothing else to configure.

---

## Split: website on Vercel, backend elsewhere

### 1. Backend — Render, Railway, or Fly.io

Same settings as the single-process table above, plus:

- **`HYDRAX_ALLOWED_ORIGIN`**: the website's Vercel origin, e.g.
  `https://hydrax.vercel.app` (no trailing slash). This is the **only**
  origin the backend will answer CORS preflight for on the public quote
  endpoint — see `applyCors` in `backend/src/http/respond.ts`. Every other
  route still requires the operator key and is same-origin only; this does
  not open the API up generally.

Once deployed, note the backend's URL (e.g. `https://hydrax-backend.onrender.com`).
The dashboard and admin console live there too — `<backend-url>/dashboard`,
`<backend-url>/admin` — they are not part of the Vercel deployment.

### 2. Website — Vercel

Import the repo in the Vercel dashboard:

- **Root directory**: `website`
- **Framework preset**: Other (no build step, no build command)
- **Output directory**: leave default (the root directory itself)

`website/vercel.json` (already in the repo) sets clean URLs — so `/request`
still resolves to `request.html`, matching the Node server's own behavior —
and the same security headers the Node server sends (`X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, CSP).

### 3. Wire the two together

Two files need the backend's real URL, once you have it:

1. **`website/js/config.js`** — set `API_BASE` to the backend origin:
   ```js
   export const API_BASE = 'https://hydrax-backend.onrender.com';
   ```
   The quote request form (`website/js/request.js`) uses this to POST
   cross-origin instead of to a relative path.

2. **`website/vercel.json`** — replace `REPLACE-WITH-BACKEND-ORIGIN` in the
   CSP's `connect-src` with the same origin, or the browser blocks the fetch
   before it leaves the page regardless of what the backend allows:
   ```
   "connect-src 'self' https://hydrax-backend.onrender.com"
   ```

Redeploy the website after either change (no build step — Vercel just needs
to pick up the new file).

### What does *not* move to Vercel

The quote-request form is the only part of the public website that talks to
the backend, so it's the only thing this wiring is for. The dashboard and
admin console are full applications in their own right (polling, an operator
key flow, alert resolution) — they stay on the backend host, served at
`/dashboard` and `/admin` exactly as they are today. There is no reason to
run them on Vercel, and doing so would mean re-implementing the parts of
`backend/src/app.ts` that serve them.
