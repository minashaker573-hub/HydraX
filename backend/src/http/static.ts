/**
 * HYDRAX - dashboard static file serving.
 *
 * The dashboard is plain HTML/CSS/JS with no build step, served straight from
 * disk by the same process that ingests telemetry. One thing to run.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { ServerResponse } from 'node:http';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
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
  res.writeHead(200, {
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
  createReadStream(target).pipe(res);
  return true;
}
