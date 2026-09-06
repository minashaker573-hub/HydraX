/**
 * HYDRAX - CMS media library.
 *
 * Uploads a real file to disk under website/assets/uploads/ (served by the
 * existing static route for the rest of website/assets/ — see
 * config.ts's `mediaDir` comment), records its metadata, and lets the admin
 * list or delete what has been uploaded.
 *
 * No multipart parsing: the browser sends the raw file bytes as the request
 * body (see http/upload.ts), with the original filename and alt text as
 * headers. Every upload is re-validated server-side — content-type and size
 * — regardless of what the browser claims to be sending.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { authorizeAdmin } from '../http/auth.ts';
import { sendError, sendJson } from '../http/respond.ts';
import { BodyTooLargeError, readRawBody } from '../http/upload.ts';
import { sanitizeText } from '../domain/validators.ts';
import { nowIso, type AppDeps } from '../deps.ts';
import { log } from '../log.ts';
import type { MediaRow } from '../db/repository.ts';
import type { Router } from '../http/router.ts';

/** Raster only — an uploaded SVG can carry a <script>, which this project's
 *  CSP would block in a normal page load but not inside an <img> src in
 *  every rendering context, so it is refused outright rather than relied on
 *  to be harmless. */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB — generous for a real photo, bounded

function toPublicMedia(row: MediaRow): Record<string, unknown> {
  return {
    id: row.id,
    url: `/assets/uploads/${row.filename}`,
    original_name: row.original_name,
    content_type: row.content_type,
    size_bytes: row.size_bytes,
    alt_text: row.alt_text,
    uploaded_at: row.uploaded_at,
  };
}

function headerValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw : '';
}

export function registerMediaRoutes(router: Router, deps: AppDeps): void {
  router.post('/api/v1/admin/media', async (ctx) => {
    if (!authorizeAdmin(ctx, deps)) return;

    const contentType = (headerValue(ctx.req.headers['content-type']) || '').split(';')[0]!.trim().toLowerCase();
    const ext = ALLOWED_TYPES[contentType];
    if (ext === undefined) {
      sendError(
        ctx.res,
        415,
        `unsupported image type "${contentType || '(none)'}" — allowed: ${Object.keys(ALLOWED_TYPES).join(', ')}`,
      );
      return;
    }

    let bytes: Buffer;
    try {
      bytes = await readRawBody(ctx.req, MAX_UPLOAD_BYTES);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        sendError(ctx.res, 413, error.message);
        return;
      }
      throw error;
    }
    if (bytes.length === 0) {
      sendError(ctx.res, 400, 'upload is empty');
      return;
    }

    const originalName = sanitizeText(headerValue(ctx.req.headers['x-original-filename'])).slice(0, 200) || 'upload';
    const altText = sanitizeText(headerValue(ctx.req.headers['x-alt-text'])).slice(0, 200);

    const filename = `${randomUUID()}.${ext}`;
    await mkdir(deps.config.mediaDir, { recursive: true });
    await writeFile(join(deps.config.mediaDir, filename), bytes);

    const now = nowIso(deps);
    const row = await deps.repo.insertMedia(
      { filename, originalName, contentType, sizeBytes: bytes.length, altText },
      now,
    );

    log.info('cms', `media uploaded: ${filename} (${bytes.length} bytes, from "${originalName}")`);
    sendJson(ctx.res, 201, toPublicMedia(row));
  });

  router.get('/api/v1/admin/media', async (ctx) => {
    if (!authorizeAdmin(ctx, deps)) return;
    const rows = await deps.repo.listMedia();
    sendJson(ctx.res, 200, { media: rows.map(toPublicMedia) });
  });

  router.add('DELETE', '/api/v1/admin/media/:id', async (ctx) => {
    if (!authorizeAdmin(ctx, deps)) return;

    const idParam = Number(ctx.params.id);
    if (!Number.isInteger(idParam) || idParam < 1) {
      sendError(ctx.res, 400, 'invalid media id');
      return;
    }
    const id = idParam;

    const media = await deps.repo.getMedia(id);
    if (media === undefined) {
      sendError(ctx.res, 404, `no media with id ${id}`);
      return;
    }

    const url = `/assets/uploads/${media.filename}`;
    if (await deps.repo.isMediaReferenced(url)) {
      sendError(ctx.res, 409, 'this image is used by a draft or published section and cannot be deleted');
      return;
    }

    await deps.repo.deleteMedia(id);
    try {
      await unlink(join(deps.config.mediaDir, media.filename));
    } catch (error) {
      // The DB row is already gone; a missing file on disk (already deleted,
      // moved, whatever) is not a reason to report failure for a delete that
      // otherwise succeeded — just note it for whoever reads the logs.
      log.warn('cms', `media ${id}: file already missing on disk (${(error as Error).message})`);
    }

    log.info('cms', `media deleted: ${media.filename}`);
    sendJson(ctx.res, 200, { deleted: true });
  });
}
