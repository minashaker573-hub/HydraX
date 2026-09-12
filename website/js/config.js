/**
 * HYDRAX website — per-deployment configuration.
 *
 * Leave API_BASE empty for BOTH supported deployments:
 *
 *   - Single process (npm start): one Node server serves the website, the
 *     dashboard, the admin console and the API from one origin.
 *   - Vercel + Render (docs/DEPLOYMENT.md): website/vercel.json proxies /api,
 *     /admin, /dashboard and /assets/uploads to the backend on Render, so the
 *     browser still sees ONE origin. Relative requests just work, the CSP stays
 *     `connect-src 'self'`, and no CORS is involved.
 *
 * Set API_BASE only for a host that cannot proxy — the page would then call
 * the backend cross-origin, which additionally needs HYDRAX_ALLOWED_ORIGIN on
 * the backend and the backend origin in the CSP's connect-src. Note that only
 * the quote form reads this value; CMS content (js/content.js, js/links.js)
 * is always fetched from the page's own origin.
 */
export const API_BASE = '';
