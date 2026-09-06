/**
 * HYDRAX Mobile — where the backend lives.
 *
 * Resolution order, highest priority first:
 *
 *   1. EXPO_PUBLIC_API_BASE_URL, from mobile/.env — the explicit answer, and
 *      the only one that works for a real (non-dev-server) build.
 *   2. The Expo dev server's own host. When you run `npm start`, Metro tells
 *      the app which machine it was loaded from (e.g. 192.168.1.20:8081); the
 *      HYDRAX backend is almost always that same machine on port 8080. This is
 *      what makes "clone, npm start, scan the QR code" work with no config at
 *      all — and it is why `localhost` is never hardcoded: `localhost` on a
 *      phone means the phone, not the laptop running the backend.
 *   3. http://localhost:8080 — only reachable from an emulator/simulator or
 *      Expo web on the same machine. A last resort, not a default to rely on.
 *
 * See docs/MOBILE.md for the step-by-step version of all this.
 */

import Constants from 'expo-constants';

/** Port the HYDRAX backend listens on (backend/.env: HYDRAX_PORT). */
export const DEFAULT_BACKEND_PORT = 8080;

export interface BaseUrlSources {
  /** Value of EXPO_PUBLIC_API_BASE_URL, if any. */
  readonly envUrl?: string | undefined;
  /** Expo dev-server host, e.g. "192.168.1.20:8081". */
  readonly hostUri?: string | undefined;
  readonly port?: number;
}

export interface ResolvedBaseUrl {
  readonly url: string;
  readonly source: 'env' | 'dev-server' | 'fallback';
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Pure so it can be unit-tested without a device. Exported for that reason.
 */
export function resolveApiBaseUrl(sources: BaseUrlSources = {}): ResolvedBaseUrl {
  const port = sources.port ?? DEFAULT_BACKEND_PORT;

  const envUrl = sources.envUrl?.trim();
  if (envUrl !== undefined && envUrl !== '') {
    return { url: trimTrailingSlash(envUrl), source: 'env' };
  }

  const hostUri = sources.hostUri?.trim();
  if (hostUri !== undefined && hostUri !== '') {
    // hostUri may carry a scheme, a port and a path; we want only the host.
    const withoutScheme = hostUri.replace(/^[a-z]+:\/\//i, '');
    const hostAndPort = withoutScheme.split('/')[0] ?? '';
    // Keep IPv6 literals ("[::1]:8081") intact.
    const host = hostAndPort.startsWith('[')
      ? (hostAndPort.match(/^\[[^\]]+\]/)?.[0] ?? hostAndPort)
      : (hostAndPort.split(':')[0] ?? hostAndPort);
    if (host !== '') {
      return { url: `http://${host}:${port}`, source: 'dev-server' };
    }
  }

  return { url: `http://localhost:${port}`, source: 'fallback' };
}

function devServerHost(): string | undefined {
  // `hostUri` is only present while running from a dev server; a released
  // build has none, which is exactly when EXPO_PUBLIC_API_BASE_URL must be set.
  const fromConfig = Constants.expoConfig?.hostUri;
  if (typeof fromConfig === 'string') return fromConfig;
  const legacy = (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
    ?.debuggerHost;
  return typeof legacy === 'string' ? legacy : undefined;
}

const resolved = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  hostUri: devServerHost(),
});

/** Base URL every request is built from, e.g. "http://192.168.1.20:8080". */
export const API_BASE_URL = resolved.url;

/** How that URL was decided — shown on the error screen so a wrong one is obvious. */
export const API_BASE_URL_SOURCE = resolved.source;

/** Per-request timeout. Long enough for a phone on farm Wi-Fi, short enough to fail visibly. */
export const REQUEST_TIMEOUT_MS = 8000;

/**
 * How often the app asks for fresh telemetry while it is in the foreground.
 *
 * The controller publishes every 15 s in the field (3 s from the mock device),
 * so anything faster only adds battery and server load for no new information.
 * Polling stops entirely when the app is backgrounded — see SystemProvider.
 */
export const POLL_INTERVAL_MS = 10_000;
