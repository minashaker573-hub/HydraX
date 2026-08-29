/**
 * HYDRAX - device ingestion endpoints.
 *
 * The only write path devices use. Both endpoints authenticate, validate
 * strictly, persist, then reconcile alerts.
 */

import { timingSafeEqual } from 'node:crypto';

import { applyEventAlerts, applyTelemetryAlerts } from '../domain/alerts.ts';
import { validateEvent, validateTelemetry } from '../domain/validate.ts';
import { log } from '../log.ts';
import { nowIso, type AppDeps } from '../deps.ts';
import {
  BodyParseError,
  BodyTooLargeError,
  readJsonBody,
  sendError,
  sendJson,
} from '../http/respond.ts';
import type { RequestContext, Router } from '../http/router.ts';

/**
 * Constant-time comparison of the device key, so a wrong key cannot be
 * recovered by measuring how long the rejection takes.
 */
function keyMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorize(ctx: RequestContext, deps: AppDeps): boolean {
  if (deps.config.deviceKey === null) return true; // explicit insecure mode

  const header = ctx.req.headers['x-device-key'];
  const provided = Array.isArray(header) ? header[0] : header;
  if (typeof provided !== 'string' || !keyMatches(deps.config.deviceKey, provided)) {
    sendError(ctx.res, 401, 'invalid or missing X-Device-Key');
    return false;
  }
  return true;
}

/** Turns body-reading failures into the right status code. */
function handleBodyError(ctx: RequestContext, error: unknown): void {
  if (error instanceof BodyTooLargeError) {
    sendError(ctx.res, 413, error.message);
    return;
  }
  if (error instanceof BodyParseError) {
    sendError(ctx.res, 400, error.message);
    return;
  }
  throw error;
}

export function registerIngestRoutes(router: Router, deps: AppDeps): void {
  router.post('/api/v1/telemetry', async (ctx) => {
    if (!authorize(ctx, deps)) return;

    let body: unknown;
    try {
      body = await readJsonBody(ctx.req);
    } catch (error) {
      handleBodyError(ctx, error);
      return;
    }

    const result = validateTelemetry(body);
    if (!result.ok) {
      // 400 is deliberate: the firmware discards a payload the backend will
      // never accept instead of retrying it forever.
      log.warn('ingest', `rejected telemetry: ${result.errors.join('; ')}`);
      sendError(ctx.res, 400, 'invalid telemetry payload', result.errors);
      return;
    }

    const receivedAt = nowIso(deps);
    const id = deps.repo.insertTelemetry(result.value, receivedAt);
    applyTelemetryAlerts(deps.repo, result.value, receivedAt);

    log.debug(
      'ingest',
      `${result.value.deviceId} telemetry #${id} state=${result.value.irrigationState}`,
    );
    sendJson(ctx.res, 202, { accepted: true, id, received_at: receivedAt });
  });

  router.post('/api/v1/events', async (ctx) => {
    if (!authorize(ctx, deps)) return;

    let body: unknown;
    try {
      body = await readJsonBody(ctx.req);
    } catch (error) {
      handleBodyError(ctx, error);
      return;
    }

    const result = validateEvent(body);
    if (!result.ok) {
      log.warn('ingest', `rejected event: ${result.errors.join('; ')}`);
      sendError(ctx.res, 400, 'invalid event payload', result.errors);
      return;
    }

    const receivedAt = nowIso(deps);
    const id = deps.repo.insertEvent(result.value, receivedAt);
    applyEventAlerts(deps.repo, result.value, receivedAt);

    log.info('ingest', `${result.value.deviceId} event ${result.value.type}`);
    sendJson(ctx.res, 202, { accepted: true, id, received_at: receivedAt });
  });
}
