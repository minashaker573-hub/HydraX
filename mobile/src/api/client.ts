/**
 * HYDRAX Mobile — the one place that talks HTTP.
 *
 * No screen calls `fetch`. Everything goes through `getJson`, which owns the
 * base URL, the timeout, status handling, JSON parsing and error translation.
 *
 * SECURITY — read this before adding a method here:
 *
 *   - This client sends NO credentials. Not the operator key, not the device
 *     key, not a token. The HYDRAX backend's read endpoints (dashboard,
 *     devices, telemetry, events, alerts) require none, and the endpoints that
 *     DO require the operator key are exactly the ones that change state
 *     (threshold writes, alert resolution, customer data). Shipping that key
 *     inside an app that runs on other people's phones would hand every
 *     installer the ability to rewrite irrigation thresholds for the farm —
 *     an APK is not a secret. See docs/MOBILE.md, "Authentication".
 *   - Only GET is exposed. There is no `post`/`put` helper, deliberately: the
 *     app is a monitor, and the controller owns irrigation decisions.
 */

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config';
import { ApiError } from './errors';

export interface RequestOptions {
  /** Caller-owned cancellation, e.g. a screen unmounting mid-poll. */
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly baseUrl?: string;
}

/**
 * Fetches JSON and hands the decoded body to `parse`.
 *
 * `parse` is passed in rather than the result being cast, so a response that
 * does not match the contract fails here with a clean `ApiError('parse')`
 * instead of turning into `undefined` three components deep.
 */
export async function getJson<T>(
  path: string,
  parse: (raw: unknown) => T,
  options: RequestOptions = {},
): Promise<T> {
  const base = options.baseUrl ?? API_BASE_URL;
  const url = `${base}${path}`;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) throw new ApiError('timeout', `timed out after ${timeoutMs}ms`);
    // An abort the caller asked for is not a failure to report; rethrow it as
    // a network error only if it came from somewhere else.
    if (options.signal?.aborted) throw new ApiError('network', 'request cancelled');
    throw new ApiError('network', describe(error));
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiError('unauthorized', `HTTP ${response.status}`, response.status);
    }
    throw new ApiError('server', `HTTP ${response.status}`, response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError('parse', 'response body was not valid JSON', response.status);
  }

  // `parse` throws ApiError('parse') itself on a shape mismatch; anything else
  // escaping it is a bug in this app, and is reported as a parse failure
  // rather than being allowed to crash a screen.
  try {
    return parse(body);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('parse', describe(error), response.status);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
