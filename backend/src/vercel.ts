/**
 * HYDRAX - the backend as a Vercel Function.
 *
 * vercel.json routes /api/*, /health and /assets/uploads/* to api/index.js,
 * which calls this handler (compiled to backend/dist at build time). Routing
 * inside is the same createApp() the Node server uses, so every route,
 * validation rule and header behaves identically.
 *
 * What differs from server.ts, and why:
 *
 *   - Each rewrite carries the original path in `__hydrax_path`, and the
 *     handler restores it before routing. That makes routing independent of
 *     whether the platform presents the function with the original URL or the
 *     rewritten one. It grants nothing: any path it can express can already be
 *     requested directly, with the same authentication.
 *   - Startup runs once per function instance, lazily, on the first request.
 *     A failed startup is not cached: the next request tries again, so a
 *     database that was briefly unreachable does not wedge the instance.
 *   - There are no timers — a function instance is not kept alive to fire
 *     them. The offline sweep instead runs, at most once per sweep interval,
 *     just before GET /api/v1/dashboard or /api/v1/alerts is answered: the two
 *     reads that show alerts, so what they return is current. A daily Vercel
 *     Cron (vercel.json) runs the sweep and telemetry retention regardless of
 *     traffic. On the Hobby plan, cron cannot run more often than daily.
 *   - The quote-form rate limiter lives in memory, so it counts per function
 *     instance rather than globally. It was always documented as a speed bump,
 *     not a defence; that is now more true.
 */

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { pruneRetention, sweepOffline, type Runtime } from './bootstrap.ts';
import { ConfigError } from './config.ts';
import { log } from './log.ts';
import type { AppDeps } from './deps.ts';

export type VercelHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const SWEEP_ON_READ = new Set(['/api/v1/dashboard', '/api/v1/alerts']);
export const CRON_PATH = '/api/cron/maintenance';
/** Query parameter vercel.json's rewrites use to carry the original path. */
export const ORIGINAL_PATH_PARAM = '__hydrax_path';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

/** Constant-time comparison, so the secret cannot be recovered by timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rewrites req.url back to the path the visitor requested, from the
 * `__hydrax_path` parameter a vercel.json rewrite adds, keeping every other
 * query parameter. Anything that is not a plain absolute path (e.g. a
 * protocol-relative `//host`) is ignored and the URL left as it arrived.
 */
export function restoreOriginalUrl(req: IncomingMessage): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const original = url.searchParams.get(ORIGINAL_PATH_PARAM);
  if (original === null || !original.startsWith('/') || original.startsWith('//')) return;
  url.searchParams.delete(ORIGINAL_PATH_PARAM);
  const query = url.searchParams.toString();
  req.url = query === '' ? original : `${original}?${query}`;
}

export interface VercelHandlerOptions {
  /** Starts the backend. Production: bootstrap(process.env). */
  boot: () => Promise<Runtime>;
  env?: NodeJS.ProcessEnv;
  /** Maintenance, injectable so tests can observe exactly when it runs. */
  sweep?: (deps: AppDeps) => Promise<void>;
  prune?: (deps: AppDeps) => Promise<number>;
}

export function createVercelHandler(options: VercelHandlerOptions): VercelHandler {
  const env = options.env ?? process.env;
  const sweep = options.sweep ?? sweepOffline;
  const prune = options.prune ?? pruneRetention;
  let starting: Promise<Runtime> | null = null;
  let lastSweepMs = Number.NEGATIVE_INFINITY;

  const runtime = (): Promise<Runtime> => {
    if (starting === null) {
      starting = options.boot().catch((error: unknown) => {
        starting = null; // retry on the next request instead of failing forever
        throw error;
      });
    }
    return starting;
  };

  return async (req, res) => {
    restoreOriginalUrl(req);

    let rt: Runtime;
    try {
      rt = await runtime();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(error instanceof ConfigError ? 'config' : 'startup', message);
      // Configuration detail is for the logs, never the response.
      sendJson(res, 503, { error: 'service unavailable' });
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');

    /* ------------------------------------------------------ daily cron -- */
    if (url.pathname === CRON_PATH) {
      const expected = env.CRON_SECRET ?? '';
      if (expected === '') {
        // Fail closed: without a secret anyone could trigger maintenance.
        log.error('cron', 'CRON_SECRET is not set; refusing to run maintenance');
        sendJson(res, 503, { error: 'cron is not configured' });
        return;
      }
      const header = req.headers.authorization ?? '';
      if (!secretMatches(header, `Bearer ${expected}`)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      try {
        await sweep(rt.deps);
        lastSweepMs = rt.deps.now();
        const pruned = await prune(rt.deps);
        sendJson(res, 200, { ok: true, pruned });
      } catch (error) {
        log.error('cron', `maintenance failed: ${(error as Error).message}`);
        sendJson(res, 500, { error: 'maintenance failed' });
      }
      return;
    }

    /* --------------------------------------------- sweep before alert reads -- */
    if (req.method === 'GET' && SWEEP_ON_READ.has(url.pathname)) {
      const now = rt.deps.now();
      if (now - lastSweepMs >= rt.deps.config.offlineSweepIntervalMs) {
        lastSweepMs = now;
        try {
          await sweep(rt.deps);
        } catch (error) {
          // A failed sweep must not fail the read it was meant to freshen.
          log.error('sweep', `offline sweep failed: ${(error as Error).message}`);
        }
      }
    }

    /* ------------------------------------------------------------ the app -- */
    // createApp's listener returns immediately and finishes asynchronously;
    // the function must not complete until the response has actually ended.
    await new Promise<void>((resolve) => {
      res.once('finish', resolve);
      res.once('close', resolve);
      rt.app(req, res);
    });
  };
}
