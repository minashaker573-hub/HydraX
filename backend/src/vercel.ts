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
 *     While it fails, every request answers 503 with a SAFE diagnosis — which
 *     environment variable names are missing, or the database error code —
 *     so a misconfigured deployment explains itself at /health instead of
 *     only in the function logs. Values, hostnames and messages never appear.
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

const REQUIRED_ENV = ['HYDRAX_DATABASE_URL', 'HYDRAX_DEVICE_KEY', 'HYDRAX_ADMIN_KEY'] as const;

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

export interface StartupDiagnosis {
  error: 'service unavailable';
  reason: 'configuration' | 'database';
  /** Names of required environment variables that are empty or absent. */
  missing?: string[];
  /** A database driver or network error code, e.g. 28P01 or ENOTFOUND. */
  code?: string;
  hint: string;
}

/** Plain-language hints for the database failures a deployment actually hits. */
const DATABASE_HINTS: Record<string, string> = {
  '28P01': 'The database rejected the username or password in HYDRAX_DATABASE_URL.',
  '28000': 'The database rejected the username or password in HYDRAX_DATABASE_URL.',
  XX000: 'The Supabase pooler did not recognise the project or user in HYDRAX_DATABASE_URL — use the Session pooler URI exactly as Supabase shows it.',
  ENOTFOUND: 'The database host in HYDRAX_DATABASE_URL does not exist.',
  EAI_AGAIN: 'The database host in HYDRAX_DATABASE_URL could not be resolved.',
  ECONNREFUSED: 'The database refused the connection. Check the host and port in HYDRAX_DATABASE_URL.',
  ETIMEDOUT: 'The database did not answer in time. Use Supabase\'s Session pooler URI, not the direct connection.',
  TIMEOUT: 'The database did not answer in time. Use Supabase\'s Session pooler URI, not the direct connection.',
};

/**
 * What a failed startup may safely tell a visitor. Deliberately built from
 * facts rather than the error message: messages can contain hostnames,
 * usernames or values. Variable NAMES and error CODES are not secrets.
 */
export function describeStartupFailure(error: unknown, env: NodeJS.ProcessEnv): StartupDiagnosis {
  if (error instanceof ConfigError) {
    const insecure = env.HYDRAX_ALLOW_INSECURE === 'true';
    const required = insecure ? ['HYDRAX_DATABASE_URL'] : [...REQUIRED_ENV];
    const missing = required.filter((name) => (env[name] ?? '').trim() === '');
    return {
      error: 'service unavailable',
      reason: 'configuration',
      missing,
      hint: missing.length > 0
        ? 'Set these environment variables for the Production environment in the Vercel project settings, then redeploy.'
        : 'An environment variable has an invalid value (for example HYDRAX_ADMIN_KEY equal to HYDRAX_DEVICE_KEY). The function logs name it.',
    };
  }

  const rawCode = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : '';
  const code = typeof rawCode === 'string' && /^[A-Z0-9_]{2,40}$/.test(rawCode)
    ? rawCode
    : /timeout/i.test(message) ? 'TIMEOUT' : undefined;
  return {
    error: 'service unavailable',
    reason: 'database',
    ...(code === undefined ? {} : { code }),
    hint: (code !== undefined && DATABASE_HINTS[code])
      || 'The backend could not connect to or prepare the database. Check HYDRAX_DATABASE_URL; the function logs have the details.',
  };
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
      // Full detail goes to the function logs only.
      log.error(error instanceof ConfigError ? 'config' : 'startup', message);
      sendJson(res, 503, describeStartupFailure(error, env));
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
