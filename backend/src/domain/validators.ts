/**
 * HYDRAX - shared validation primitives.
 *
 * Used by both trust boundaries: device telemetry (validate.ts) and public
 * customer submissions (quote.ts). Extracted so the two cannot drift apart —
 * a rule tightened for one boundary should tighten for both.
 */

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: string[] };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Collects every problem in a payload rather than stopping at the first. */
export class Errors {
  readonly list: string[] = [];
  add(message: string): void {
    this.list.push(message);
  }
  get ok(): boolean {
    return this.list.length === 0;
  }
}

export function requireRecord(
  value: unknown,
  path: string,
  errors: Errors,
): Record<string, unknown> {
  if (!isRecord(value)) {
    errors.add(`${path} must be an object`);
    return {};
  }
  return value;
}

export function requireString(
  value: unknown,
  path: string,
  errors: Errors,
  maxLength = 128,
): string | null {
  if (typeof value !== 'string') {
    errors.add(`${path} must be a string`);
    return null;
  }
  if (value.length > maxLength) {
    errors.add(`${path} must be at most ${maxLength} characters`);
    return null;
  }
  return value;
}

export function requireBoolean(value: unknown, path: string, errors: Errors): boolean {
  if (typeof value !== 'boolean') {
    errors.add(`${path} must be a boolean`);
    return false;
  }
  return value;
}

export function requireInteger(
  value: unknown,
  path: string,
  errors: Errors,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    errors.add(`${path} must be an integer`);
    return min;
  }
  if (value < min || value > max) {
    errors.add(`${path} must be between ${min} and ${max}`);
    return min;
  }
  return value;
}

/** A percentage that may legitimately be absent. */
export function optionalPercent(value: unknown, path: string, errors: Errors): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.add(`${path} must be a number or null`);
    return null;
  }
  if (value < 0 || value > 100) {
    errors.add(`${path} must be between 0 and 100`);
    return null;
  }
  return value;
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  errors: Errors,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    errors.add(`${path} must be one of: ${allowed.join(', ')}`);
    return allowed[0]!;
  }
  return value as T;
}

/**
 * Strips control characters from free text before it is stored and later
 * rendered. Output escaping still applies at every render site; this keeps the
 * stored data clean as well, so an export or a log line cannot carry a
 * terminal escape sequence.
 */
export function sanitizeText(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  return out.trim();
}

/**
 * Required free text: present, non-empty after sanitizing, within length.
 * Returns null and records an error otherwise.
 */
export function requireText(
  value: unknown,
  path: string,
  errors: Errors,
  { min = 1, max = 128 }: { min?: number; max?: number } = {},
): string | null {
  const raw = requireString(value, path, errors, max);
  if (raw === null) return null;
  const clean = sanitizeText(raw);
  if (clean.length < min) {
    errors.add(min === 1 ? `${path} is required` : `${path} must be at least ${min} characters`);
    return null;
  }
  return clean;
}

/** Optional free text: absent, or valid. Empty string is treated as absent. */
export function optionalText(
  value: unknown,
  path: string,
  errors: Errors,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) return null;
  const raw = requireString(value, path, errors, maxLength);
  if (raw === null) return null;
  const clean = sanitizeText(raw);
  return clean === '' ? null : clean;
}
