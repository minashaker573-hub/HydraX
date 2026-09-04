/**
 * HYDRAX - request handling.
 *
 * `createApp` returns a plain Node request listener, so tests exercise the
 * real routing and serialization without any HTTP framework in between.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import { log } from './log.ts';
import { Router } from './http/router.ts';
import { sendError, sendJson } from './http/respond.ts';
import { serveStatic } from './http/static.ts';
import { registerAlertRoutes } from './routes/alerts.ts';
import { registerDashboardRoutes } from './routes/dashboard.ts';
import { registerDeviceRoutes } from './routes/devices.ts';
import { registerIngestRoutes } from './routes/ingest.ts';
import { registerQuoteRoutes } from './routes/quotes.ts';
import type { AppDeps } from './deps.ts';

export type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

export function createRouter(deps: AppDeps): Router {
  const router = new Router();

  router.get('/health', (ctx) => {
    sendJson(ctx.res, 200, {
      status: 'ok',
      time: new Date(deps.now()).toISOString(),
      devices: deps.repo.listDevices().length,
    });
  });

  registerIngestRoutes(router, deps);
  registerDeviceRoutes(router, deps);
  registerAlertRoutes(router, deps);
  registerDashboardRoutes(router, deps);
  registerQuoteRoutes(router, deps);

  return router;
}

export function createApp(deps: AppDeps): RequestListener {
  const router = createRouter(deps);

  return (req, res) => {
    const method = req.method ?? 'GET';
    let url: URL;
    try {
      url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      sendError(res, 400, 'malformed request URL');
      return;
    }

    void (async () => {
      try {
        const match = router.resolve(method, url.pathname);

        if ('handler' in match) {
          await match.handler({ req, res, url, params: match.params });
          return;
        }

        if (match.pathMatched) {
          sendError(res, 405, `${method} is not allowed on ${url.pathname}`);
          return;
        }

        // Static surfaces. Two roots, because the public site and the operator
        // dashboard have different audiences and are deployed as one process:
        //   /dashboard/**  -> the monitoring app
        //   everything else -> the public website
        if (method === 'GET' && !url.pathname.startsWith('/api/')) {
          if (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) {
            const rest = url.pathname.slice('/dashboard'.length) || '/';
            if (await serveStatic(res, deps.config.dashboardDir, rest)) return;
            // A deep link into the dashboard is handled client-side, so fall
            // back to its shell rather than 404-ing a valid route.
            if (await serveStatic(res, deps.config.dashboardDir, '/index.html')) return;
          } else if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
            // The operator console. Serving it does not grant access: every
            // byte of customer data behind it needs the operator key, which
            // the page asks for and never ships with.
            const rest = url.pathname.slice('/admin'.length) || '/';
            if (await serveStatic(res, deps.config.adminDir, rest)) return;
          } else {
            if (await serveStatic(res, deps.config.websiteDir, url.pathname)) return;
            // A genuine miss on the public site gets the branded 404 page, not
            // a bare JSON error — a visitor following a stale or mistyped link
            // should land somewhere that still looks like HYDRAX and offers a
            // way back in. /api/* and the dashboard/admin mounts are untouched.
            if (await serveStatic(res, deps.config.websiteDir, '/404.html', 404)) return;
          }
        }

        sendError(res, 404, `no route for ${method} ${url.pathname}`);
      } catch (error) {
        // Never leak internals to the client; log the detail server-side.
        const message = error instanceof Error ? error.message : String(error);
        log.error('http', `${method} ${url.pathname} failed: ${message}`);
        if (!res.headersSent) sendError(res, 500, 'internal server error');
        else res.end();
      }
    })();
  };
}
