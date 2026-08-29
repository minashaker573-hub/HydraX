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

        // Anything not an API route falls through to the dashboard.
        if (method === 'GET' && !url.pathname.startsWith('/api/')) {
          const served = await serveStatic(res, deps.config.dashboardDir, url.pathname);
          if (served) return;
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
