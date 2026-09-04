/**
 * HYDRAX - customer quote requests.
 *
 * One public endpoint and three operator endpoints. The public one is the only
 * unauthenticated write in the system, so it is validated strictly, size
 * capped and rate limited.
 *
 * Customer data is never returned by the public endpoint: creating a request
 * echoes back only the reference the customer needs. Reading requests requires
 * the operator key.
 */

import { validateQuoteRequest } from '../domain/quote.ts';
import { makeRequestReference, normalizeReference, REFERENCE_PATTERN } from '../domain/reference.ts';
import { REQUEST_STATUSES, type RequestStatus } from '../domain/types.ts';
import { Errors, oneOf, requireRecord } from '../domain/validators.ts';
import { authorizeAdmin } from '../http/auth.ts';
import { clientKey, RateLimiter } from '../http/rate-limit.ts';
import { log } from '../log.ts';
import { nowIso, type AppDeps } from '../deps.ts';
import {
  applyCors,
  BodyParseError,
  BodyTooLargeError,
  readJsonBody,
  readLimit,
  sendError,
  sendJson,
} from '../http/respond.ts';
import type { QuoteRequest } from '../db/repository.ts';
import type { Router } from '../http/router.ts';

const MAX_PAGE = 200;

function serialize(request: QuoteRequest): Record<string, unknown> {
  return {
    reference: request.reference,
    status: request.status,
    created_at: request.created_at,
    updated_at: request.updated_at,
    farm: {
      size: request.farm_size,
      location: request.farm_location,
      irrigation_type: request.irrigation_type,
      zone_count: request.zone_count,
    },
    capabilities: request.capabilities,
    customer: {
      full_name: request.full_name,
      phone: request.phone,
      email: request.email,
    },
    notes: request.notes,
  };
}

export function registerQuoteRoutes(router: Router, deps: AppDeps): void {
  // Ten submissions per hour from one source is generous for a real customer
  // and low enough to blunt a script. Tunable via HYDRAX_REQUEST_RATE_MAX.
  const limiter = new RateLimiter(deps.config.requestRateMax, deps.config.requestRateWindowMs);

  // ------------------------------------------------------------------ public
  //
  // CORS is opt-in and scoped to this one endpoint: the website is the only
  // client ever expected to call it from a different origin (see config.ts
  // HYDRAX_ALLOWED_ORIGIN). Every other route in this file requires the
  // operator key and stays same-origin-only — there is no reason an operator
  // console hosted elsewhere should ever need to read customer data through
  // a browser CORS grant.
  router.add('OPTIONS', '/api/v1/requests', (ctx) => {
    applyCors(ctx.req, ctx.res, deps.config.allowedOrigin);
    ctx.res.setHeader('Access-Control-Allow-Methods', 'POST');
    ctx.res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    ctx.res.setHeader('Access-Control-Max-Age', '86400');
    ctx.res.writeHead(204);
    ctx.res.end();
  });

  router.post('/api/v1/requests', async (ctx) => {
    applyCors(ctx.req, ctx.res, deps.config.allowedOrigin);

    const decision = limiter.check(
      clientKey(ctx.req.headers, ctx.req.socket.remoteAddress ?? undefined),
      deps.now(),
    );
    if (!decision.allowed) {
      ctx.res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      sendError(ctx.res, 429, 'too many requests from this address, please try again later');
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(ctx.req);
    } catch (error) {
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

    const result = validateQuoteRequest(body);
    if (!result.ok) {
      sendError(ctx.res, 400, 'invalid request', result.errors);
      return;
    }

    const created = deps.repo.insertQuoteRequest(
      result.value,
      nowIso(deps),
      makeRequestReference,
    );

    // Log the reference and shape, never the customer's contact details.
    log.info(
      'requests',
      `new request ${created.reference} (${created.zone_count} zones, ` +
        `${created.capabilities.length} capabilities)`,
    );

    // The response carries only what the customer needs. Echoing their own
    // details back would make this endpoint a reflector for anyone probing it.
    sendJson(ctx.res, 201, {
      reference: created.reference,
      status: created.status,
      created_at: created.created_at,
    });
  });

  // ------------------------------------------------------------------- admin
  router.get('/api/v1/requests', (ctx) => {
    if (!authorizeAdmin(ctx, deps)) return;

    const limit = readLimit(ctx.url, 'limit', 50, MAX_PAGE);
    const statusParam = ctx.url.searchParams.get('status');

    let status: RequestStatus | undefined;
    if (statusParam !== null) {
      if (!REQUEST_STATUSES.includes(statusParam as RequestStatus)) {
        sendError(ctx.res, 400, `status must be one of: ${REQUEST_STATUSES.join(', ')}`);
        return;
      }
      status = statusParam as RequestStatus;
    }

    sendJson(ctx.res, 200, {
      counts: deps.repo.countQuoteRequestsByStatus(),
      requests: deps.repo.listQuoteRequests(limit, status).map(serialize),
    });
  });

  router.get('/api/v1/requests/:reference', (ctx) => {
    if (!authorizeAdmin(ctx, deps)) return;

    const reference = normalizeReference(ctx.params.reference!);
    if (!REFERENCE_PATTERN.test(reference)) {
      sendError(ctx.res, 400, 'malformed request reference');
      return;
    }

    const request = deps.repo.getQuoteRequestByReference(reference);
    if (request === undefined) {
      sendError(ctx.res, 404, `no request with reference ${reference}`);
      return;
    }
    sendJson(ctx.res, 200, serialize(request));
  });

  router.patch('/api/v1/requests/:reference/status', async (ctx) => {
    if (!authorizeAdmin(ctx, deps)) return;

    const reference = normalizeReference(ctx.params.reference!);
    if (!REFERENCE_PATTERN.test(reference)) {
      sendError(ctx.res, 400, 'malformed request reference');
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(ctx.req);
    } catch (error) {
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

    const errors = new Errors();
    const record = requireRecord(body, 'body', errors);
    const status = oneOf(record.status, REQUEST_STATUSES, 'status', errors);
    if (!errors.ok) {
      sendError(ctx.res, 400, 'invalid status update', errors.list);
      return;
    }

    if (!deps.repo.updateQuoteRequestStatus(reference, status, nowIso(deps))) {
      sendError(ctx.res, 404, `no request with reference ${reference}`);
      return;
    }

    log.info('requests', `${reference} -> ${status}`);
    const updated = deps.repo.getQuoteRequestByReference(reference)!;
    sendJson(ctx.res, 200, serialize(updated));
  });
}
