/**
 * HYDRAX website — per-deployment configuration.
 *
 * The site has no build step, so this is the one file to edit when the
 * public website and the backend are hosted on different origins — e.g. the
 * website on Vercel and the backend (API + dashboard + admin) on Render,
 * Railway, or a VPS, because the backend is a long-running process with a
 * SQLite file and background jobs that a serverless platform cannot run.
 * See docs/DEPLOYMENT.md.
 *
 * Same-origin deployment (the default — one process serves the website, the
 * dashboard, the admin console and the API, as in docs/WEBSITE.md "Running
 * it"): leave API_BASE empty. The request form then POSTs to a relative
 * path and reaches whatever server served the page.
 *
 * Cross-origin deployment: set API_BASE to the backend's origin, with no
 * trailing slash — e.g. 'https://hydrax-backend.onrender.com'. Then also:
 *   - add that same origin to HYDRAX_ALLOWED_ORIGIN on the backend, so it
 *     answers the browser's CORS preflight for this site's origin;
 *   - add it to this site's Content-Security-Policy `connect-src` (see
 *     vercel.json if deployed there), or the fetch is blocked client-side
 *     before it ever reaches the network.
 */
export const API_BASE = '';
