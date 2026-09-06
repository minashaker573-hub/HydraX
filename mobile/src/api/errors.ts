/**
 * HYDRAX Mobile — one error type for every way a request can fail.
 *
 * Screens never see a raw fetch rejection, an HTTP status or a JSON parse
 * exception. They see an `ApiError` with a `kind`, and turn that kind into a
 * translated sentence. Nothing the backend says is ever rendered verbatim:
 * a stack trace or a Postgres message is not a useful thing to show a farmer,
 * and is not a safe thing to show anyone.
 */

import type { StringKey } from '../i18n/strings';

export type ApiErrorKind =
  /** The request never reached the server (no route, wrong URL, no Wi-Fi). */
  | 'network'
  /** The server did not answer in time. */
  | 'timeout'
  /** 401/403 — should not happen: this app sends no credentials. */
  | 'unauthorized'
  /** Any other non-2xx answer. */
  | 'server'
  /** 2xx, but the body was not JSON or did not match the expected shape. */
  | 'parse';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

/** The user-facing sentence for a failure. Never the server's own words. */
export function errorMessageKey(error: unknown): StringKey {
  if (!(error instanceof ApiError)) return 'error.network';
  switch (error.kind) {
    case 'timeout':
      return 'error.timeout';
    case 'unauthorized':
      return 'error.unauthorized';
    case 'parse':
      return 'error.parse';
    case 'server':
      return 'error.server';
    case 'network':
    default:
      return 'error.network';
  }
}

/**
 * True when the failure means "the phone could not talk to the backend",
 * as opposed to "the backend answered and said no". The distinction matters:
 * the first is usually the phone's network, and the controller is unaffected
 * either way.
 */
export function isConnectivityError(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'network' || error.kind === 'timeout');
}
