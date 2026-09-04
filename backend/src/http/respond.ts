/**
 * HYDRAX - HTTP request/response helpers.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Hard ceiling on a request body. Telemetry is ~1 KB; anything approaching
 * this is either a bug or an attempt to exhaust memory, and is refused before
 * being buffered.
 */
export const MAX_BODY_BYTES = 64 * 1024;

/**
 * Sets CORS headers for a single, specific allowed origin, only when the
 * request's `Origin` matches it exactly. Not a wildcard, and a no-op when
 * `allowedOrigin` is null — same-origin deployments never see these headers
 * at all. `Vary: Origin` so a shared cache never serves one origin's
 * allow-header to another.
 */
export function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigin: string | null,
): void {
  if (allowedOrigin === null) return;
  const origin = req.headers.origin;
  if (origin !== allowedOrigin) return;
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    // API responses are never a document and must never be framed.
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(payload);
}

export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  details?: string[],
): void {
  sendJson(res, status, details === undefined ? { error: message } : { error: message, details });
}

export class BodyTooLargeError extends Error {}
export class BodyParseError extends Error {}

/**
 * Reads and parses a JSON body, enforcing the size cap while streaming rather
 * than after the fact.
 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new BodyTooLargeError(`request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(buf);
  }

  if (total === 0) throw new BodyParseError('request body is empty');

  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyParseError('request body is not valid JSON');
  }
}

/** Reads a bounded positive integer query parameter. */
export function readLimit(url: URL, name: string, fallback: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}
