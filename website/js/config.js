/**
 * HYDRAX website — per-deployment configuration.
 *
 * Leave API_BASE empty. Both supported deployments serve the website and the
 * API from ONE origin:
 *
 *   - Local / single process (`npm start`): one Node server serves the
 *     website, the dashboard, the admin console and the API.
 *   - Vercel (docs/DEPLOYMENT.md): the website is static files and the API is
 *     a Vercel Function in the same project, so relative requests reach it and
 *     the CSP stays `connect-src 'self'`.
 *
 * Set API_BASE only if the website is ever hosted apart from the backend —
 * the page would then call it cross-origin, which additionally needs
 * HYDRAX_ALLOWED_ORIGIN on the backend and the backend origin in the CSP's
 * connect-src. Only the quote form reads this value.
 */
export const API_BASE = '';
