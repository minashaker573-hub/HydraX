/**
 * HYDRAX - customer quote request validation.
 *
 * This is a PUBLIC, unauthenticated trust boundary — the only one in the
 * system. Anything arriving here is hostile until proven otherwise, so:
 *
 *   * only known fields are read; unknown keys are ignored rather than stored;
 *   * every string is length-bounded and stripped of control characters;
 *   * every enum is matched against an allowlist, never stored as given;
 *   * the result is a fully-constructed value, not the caller's object.
 *
 * Nothing here touches SQL. Persistence uses parameterized statements only.
 */

import {
  CAPABILITIES,
  IRRIGATION_TYPES,
  MAX_REQUEST_ZONES,
  type Capability,
  type QuoteRequestInput,
} from './types.ts';
import {
  Errors,
  oneOf,
  optionalText,
  requireInteger,
  requireRecord,
  requireText,
  sanitizeText,
  type ValidationResult,
} from './validators.ts';

const MAX_NAME = 120;
const MAX_LOCATION = 160;
const MAX_FARM_SIZE = 60;
const MAX_PHONE = 32;
const MAX_EMAIL = 254; // RFC 5321 maximum path length
const MAX_NOTES = 2000;

/**
 * Deliberately permissive: international numbering is messy, and rejecting a
 * real customer's phone number is a worse failure than accepting an odd one.
 * Requires 7-20 digits, allowing the usual separators and a leading +.
 */
const PHONE_ALLOWED = /^[+()\-.\s\d]+$/;
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 20;

/**
 * Pragmatic email check: one @, something either side, a dot in the domain,
 * no whitespace. Full RFC 5322 conformance is not worth the false negatives —
 * the only real proof an address works is sending to it.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

function validatePhone(value: unknown, errors: Errors): string | null {
  const raw = requireText(value, 'phone', errors, { min: 1, max: MAX_PHONE });
  if (raw === null) return null;

  if (!PHONE_ALLOWED.test(raw)) {
    errors.add('phone may contain only digits, spaces and + ( ) - .');
    return null;
  }
  const digits = raw.replace(/\D/g, '').length;
  if (digits < PHONE_MIN_DIGITS || digits > PHONE_MAX_DIGITS) {
    errors.add(`phone must contain between ${PHONE_MIN_DIGITS} and ${PHONE_MAX_DIGITS} digits`);
    return null;
  }
  return raw;
}

function validateEmail(value: unknown, errors: Errors): string | null {
  // Email is optional — a farmer with a phone and no email is a real customer.
  if (value === null || value === undefined || value === '') return null;

  const raw = optionalText(value, 'email', errors, MAX_EMAIL);
  if (raw === null) return null;

  if (!EMAIL_PATTERN.test(raw)) {
    errors.add('email must be a valid address');
    return null;
  }
  return raw.toLowerCase();
}

function validateCapabilities(value: unknown, errors: Errors): Capability[] {
  if (!Array.isArray(value)) {
    errors.add('capabilities must be an array');
    return [];
  }
  if (value.length > CAPABILITIES.length) {
    errors.add(`capabilities must contain at most ${CAPABILITIES.length} entries`);
    return [];
  }

  const selected = new Set<Capability>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !CAPABILITIES.includes(entry as Capability)) {
      errors.add(`capabilities entries must be one of: ${CAPABILITIES.join(', ')}`);
      continue;
    }
    selected.add(entry as Capability);
  }

  if (selected.size === 0 && errors.ok) {
    errors.add('select at least one capability');
  }
  // Returned in declaration order so storage and display are deterministic
  // regardless of the order the form submitted them in.
  return CAPABILITIES.filter((c) => selected.has(c));
}

export function validateQuoteRequest(input: unknown): ValidationResult<QuoteRequestInput> {
  const errors = new Errors();
  const body = requireRecord(input, 'body', errors);
  if (!errors.ok) return { ok: false, errors: errors.list };

  const farmSize = requireText(body.farm_size, 'farm_size', errors, { max: MAX_FARM_SIZE });
  const farmLocation = requireText(body.farm_location, 'farm_location', errors, {
    max: MAX_LOCATION,
  });
  const irrigationType = oneOf(body.irrigation_type, IRRIGATION_TYPES, 'irrigation_type', errors);
  const zoneCount = requireInteger(body.zone_count, 'zone_count', errors, 1, MAX_REQUEST_ZONES);

  const capabilities = validateCapabilities(body.capabilities, errors);

  const fullName = requireText(body.full_name, 'full_name', errors, { min: 2, max: MAX_NAME });
  const phone = validatePhone(body.phone, errors);
  const email = validateEmail(body.email, errors);
  const notes = optionalText(body.notes, 'notes', errors, MAX_NOTES);

  if (!errors.ok) return { ok: false, errors: errors.list };

  return {
    ok: true,
    value: {
      farmSize: farmSize!,
      farmLocation: farmLocation!,
      irrigationType,
      zoneCount,
      capabilities,
      fullName: fullName!,
      phone: phone!,
      email,
      notes: notes === null ? null : sanitizeText(notes),
    },
  };
}
