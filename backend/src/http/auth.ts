/**
 * HYDRAX - request authentication.
 *
 * Two distinct roles, deliberately separated:
 *
 *   DEVICE  (X-Device-Key) - controllers publishing telemetry and events.
 *   ADMIN   (X-Admin-Key)  - operator actions that change server-side state:
 *                            editing thresholds, resolving alerts, reading
 *                            customer quote requests.
 *
 * They are separate keys because they have different blast radii and different
 * rotation needs. A device key is flashed into firmware across every
 * controller in the field; an operator key is not. Reusing one for both would
 * mean that rotating the operator credential requires reflashing hardware, and
 * that extracting a key from one device grants the ability to rewrite
 * irrigation thresholds for the whole farm.
 *
 * NOTE ON LOCAL-FIRST: none of this touches the control path. The firmware
 * never calls an admin endpoint, and irrigation continues regardless of
 * whether any of these checks pass or the backend is reachable at all.
 */

import { timingSafeEqual } from 'node:crypto';

import { sendError } from './respond.ts';
import type { AppDeps } from '../deps.ts';
import type { RequestContext } from './router.ts';

/**
 * Constant-time comparison, so a wrong key cannot be recovered by measuring
 * how long the rejection takes.
 *
 * Length is compared first and non-constant-time on purpose: `timingSafeEqual`
 * throws on a length mismatch, and the length of a rejected key is not the
 * secret worth protecting.
 */
export function keyMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function headerValue(ctx: RequestContext, name: string): string | null {
  const raw = ctx.req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value : null;
}

/**
 * Guards a device ingestion endpoint. Returns false and answers 401 when the
 * caller is not authorized.
 */
export function authorizeDevice(ctx: RequestContext, deps: AppDeps): boolean {
  // Explicit insecure mode: the server logged a warning at startup.
  if (deps.config.deviceKey === null) return true;

  const provided = headerValue(ctx, 'x-device-key');
  if (provided === null || !keyMatches(deps.config.deviceKey, provided)) {
    sendError(ctx.res, 401, 'invalid or missing X-Device-Key');
    return false;
  }
  return true;
}

/**
 * Guards an operator endpoint that mutates server-side state.
 */
export function authorizeAdmin(ctx: RequestContext, deps: AppDeps): boolean {
  if (deps.config.adminKey === null) return true;

  const provided = headerValue(ctx, 'x-admin-key');
  if (provided === null || !keyMatches(deps.config.adminKey, provided)) {
    sendError(ctx.res, 401, 'invalid or missing X-Admin-Key');
    return false;
  }
  return true;
}
