/**
 * HYDRAX - alert endpoints.
 */

import { nowIso, type AppDeps } from '../deps.ts';
import { authorizeAdmin } from '../http/auth.ts';
import { readLimit, sendError, sendJson } from '../http/respond.ts';
import type { AlertRow } from '../db/repository.ts';
import type { Router } from '../http/router.ts';

const MAX_PAGE = 500;

export function serializeAlert(alert: AlertRow): Record<string, unknown> {
  return {
    id: alert.id,
    device_id: alert.device_id,
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
    raised_at: alert.raised_at,
    resolved_at: alert.resolved_at,
    active: alert.active === 1,
  };
}

export function registerAlertRoutes(router: Router, deps: AppDeps): void {
  router.get('/api/v1/alerts', (ctx) => {
    // Active-only by default: the dashboard wants what is wrong now.
    const activeOnly = ctx.url.searchParams.get('active') !== 'false';
    const limit = readLimit(ctx.url, 'limit', 100, MAX_PAGE);
    sendJson(ctx.res, 200, {
      alerts: deps.repo.listAlerts(activeOnly, limit).map(serializeAlert),
    });
  });

  router.post('/api/v1/alerts/:id/resolve', (ctx) => {
    // Silencing a critical alert is an operator decision, not a public one.
    if (!authorizeAdmin(ctx, deps)) return;

    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id < 1) {
      sendError(ctx.res, 400, 'alert id must be a positive integer');
      return;
    }
    const resolved = deps.repo.resolveAlertById(id, nowIso(deps));
    if (!resolved) {
      sendError(ctx.res, 404, `no active alert with id ${id}`);
      return;
    }
    sendJson(ctx.res, 200, { id, active: false });
  });
}
