/**
 * HYDRAX - customer request references.
 *
 * Format: HYX-XXXXXX
 *
 * Two deliberate choices:
 *
 *  1. RANDOM, not sequential. A reference derived from the row id would tell
 *     anyone holding one roughly how many requests exist — a detail a young
 *     company has no reason to publish.
 *
 *  2. AN UNAMBIGUOUS ALPHABET. The characters 0, 1, I, L, O and S are omitted,
 *     because this string gets read aloud over the phone and written on paper,
 *     and those are the pairs people confuse. That leaves 30 characters, so
 *     30^6 is 729 million combinations — and the database still has a UNIQUE
 *     constraint with a retry behind it, so collisions are handled rather than
 *     assumed away.
 */

import { randomInt } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKMNPQRTUVWXYZ';
const LENGTH = 6;

export const REFERENCE_PATTERN = new RegExp(`^HYX-[${ALPHABET}]{${LENGTH}}$`);

export function makeRequestReference(): string {
  let body = '';
  for (let i = 0; i < LENGTH; i += 1) {
    // randomInt is uniform and cryptographically sourced; Math.random is
    // neither, and a predictable reference is a way to enumerate requests.
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `HYX-${body}`;
}

/** Normalizes user-typed input ("hyx-abc123", " HYX-ABC123 ") for lookup. */
export function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}
