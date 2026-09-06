/**
 * HYDRAX - raw body reading for media uploads.
 *
 * respond.ts's `readJsonBody` caps a body at 64 KB, sized for a telemetry
 * sample or a quote request — nowhere near enough for a photograph. Rather
 * than raise that ceiling for every endpoint (which would let a slow client
 * or an attacker hold 8 MB of memory against any route), image uploads get
 * their own reader with their own, much larger, purpose-specific limit.
 *
 * No multipart/form-data parsing here: the admin uploads a file as a raw
 * request body (`fetch(url, { body: file })`), with the filename and alt
 * text passed as headers/query params instead. That avoids writing (or
 * depending on) a MIME multipart parser for what is, in this project, always
 * exactly one file per request.
 */

import type { IncomingMessage } from 'node:http';

export class BodyTooLargeError extends Error {}

export async function readRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      throw new BodyTooLargeError(`upload exceeds ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}
