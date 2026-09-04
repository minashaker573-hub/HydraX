/**
 * HYDRAX - dashboard static file serving.
 *
 * The dashboard is plain HTML/CSS/JS with no build step, served straight from
 * disk by the same process that ingests telemetry. One thing to run.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { ServerResponse } from 'node:http';

import { log } from '../log.ts';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * Resolves a URL path to a file inside `rootDir`, or null if it escapes.
 *
 * Traversal is rejected by comparing the resolved absolute path against the
 * resolved root, which handles `..`, encoded separators and symlink-ish tricks
 * that string matching alone would miss.
 */
export function resolveStaticPath(rootDir: string, urlPath: string): string | null {
  const root = resolve(rootDir);
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const candidate = resolve(join(root, relative === '' ? 'index.html' : relative));

  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}

export async function serveStatic(
  res: ServerResponse,
  rootDir: string,
  urlPath: string,
  status = 200,
): Promise<boolean> {
  const filePath = resolveStaticPath(rootDir, urlPath);
  if (filePath === null) return false;

  let target = filePath;
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      target = join(target, 'index.html');
      await stat(target);
    }
  } catch {
    // Extensionless URLs: /request serves request.html. Keeps public links
    // clean without a rewrite rule in front of the server. Only attempted for
    // paths that carry no extension, so a genuine 404 for /missing.css stays
    // a 404 rather than silently returning HTML.
    if (extname(target) !== '') return false;
    target = `${target}.html`;
    try {
      await stat(target);
    } catch {
      return false;
    }
  }

  const contentType = MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
    // Everything the dashboard and site need is served from this origin, so
    // the policy can stay tight. 'unsafe-inline' covers the small amount of
    // inline styling in the marketing pages; no inline script is permitted.
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self'; connect-src 'self'; font-src 'self' data:; " +
      "base-uri 'none'; form-action 'self'; frame-ancestors 'self'; object-src 'none'",
  });
  // `.pipe()` does not propagate errors between the two streams — a read
  // error (or a client disconnecting mid-download, which surfaces the same
  // way) would emit 'error' on the file stream with nothing listening for
  // it, and Node's default response to an unhandled stream 'error' event is
  // to crash the process. Same bug class as the pg.Pool issue this project
  // already hit in production once (see db/index.ts); `pipeline()` from
  // node:stream/promises is the standard fix — it wires up error forwarding
  // and cleanup between both streams and rejects instead.
  try {
    await pipeline(createReadStream(target), res);
  } catch (error) {
    // Headers are already sent by this point, so there is no error response
    // left to send — only something to log and a connection to let close.
    // A client disconnecting mid-download is the routine case, not a bug:
    // Node reports it as ERR_STREAM_PREMATURE_CLOSE, worth a debug line, not
    // an error-level alert.
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ERR_STREAM_PREMATURE_CLOSE') {
      log.debug('static', `${target}: client disconnected mid-transfer`);
    } else {
      log.error('static', `${target}: streaming failed: ${(error as Error).message}`);
    }
  }
  return true;
}
