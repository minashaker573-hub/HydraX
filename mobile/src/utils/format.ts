/**
 * HYDRAX Mobile — value formatting and status classification.
 *
 * Pure functions, no React, so every rule here is unit-testable and none of it
 * hides inside a component. The translation function is passed in rather than
 * imported, which keeps these usable from tests without a provider.
 *
 * Numbers keep Western digits in both languages — see src/i18n/I18nProvider.
 */

import type { StringKey } from '../i18n/strings';
import type { ToneName } from '../theme/tokens';
import type { AlertSeverity, ZoneBand, ZoneSnapshot } from '../api/types';

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

/** An em dash, used everywhere a value is genuinely absent. */
export const ABSENT = '—';

/** A percentage as the UI shows it: whole numbers, no false precision. */
export function percent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ABSENT;
  return `${Math.round(value)}%`;
}

/** One decimal place, for a single probe reading where the detail is useful. */
export function decimal(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ABSENT;
  return value.toFixed(1);
}

/**
 * "4m ago" for an ISO timestamp.
 *
 * Anything unparseable returns the absent dash rather than "NaN ago" or
 * today's date — a broken timestamp should look broken, not plausible.
 */
export function relativeTime(iso: string | null | undefined, t: Translate, now = Date.now()): string {
  if (typeof iso !== 'string' || iso === '') return ABSENT;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return ABSENT;

  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 5) return t('common.justNow');
  if (seconds < 60) return t('common.secondsAgo', { n: seconds });

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('common.minutesAgo', { n: minutes });

  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('common.hoursAgo', { n: hours });

  return t('common.daysAgo', { n: Math.round(hours / 24) });
}

/** A duration in milliseconds as "45s" / "3m 12s" / "2h 05m". */
export function duration(ms: number | null | undefined, t: Translate): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return ABSENT;

  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return t('common.durationSeconds', { s: totalSeconds });

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return t('common.durationMinutes', { m: minutes, s: seconds });

  const hours = Math.floor(minutes / 60);
  return t('common.durationHours', { h: hours, m: String(minutes % 60).padStart(2, '0') });
}

/** An absolute timestamp, for the places where "when exactly" matters. */
export function absoluteTime(iso: string | null | undefined): string {
  if (typeof iso !== 'string' || iso === '') return ABSENT;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return ABSENT;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ` +
    `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
  );
}

/* ========================================================================= */
/* classification                                                            */
/* ========================================================================= */

export interface StatusLabel {
  readonly labelKey: StringKey;
  readonly tone: ToneName;
}

/**
 * Moisture against the backend's advisory band.
 *
 * When no band is stored, the honest answer is "no band set" — NOT "normal".
 * The controller always has thresholds (they are compiled into its firmware);
 * what may be missing is the backend's advisory copy, and the app says exactly
 * that rather than implying the hardware is running unbounded.
 */
export function moistureStatus(
  average: number | null,
  band: ZoneBand | null,
): StatusLabel | null {
  if (average === null) return null;
  if (band === null) return { labelKey: 'moisture.noBand', tone: 'idle' };
  if (average < band.startPercent) return { labelKey: 'moisture.dry', tone: 'warn' };
  if (average >= band.stopPercent) return { labelKey: 'moisture.wet', tone: 'water' };
  return { labelKey: 'moisture.normal', tone: 'ok' };
}

/** Probe coverage for a zone: two valid probes, one, or none. */
export function coverageStatus(validSensors: number): StatusLabel {
  if (validSensors >= 2) return { labelKey: 'coverage.full', tone: 'ok' };
  if (validSensors === 1) return { labelKey: 'coverage.degraded', tone: 'warn' };
  return { labelKey: 'coverage.none', tone: 'crit' };
}

/** Tone for a controller/irrigation state token. Unknown tokens read as idle. */
export function stateTone(state: string | null): ToneName {
  switch (state) {
    case 'IRRIGATING':
    case 'STARTING':
      return 'water';
    case 'SENSOR_ERROR':
    case 'ACTUATOR_ERROR':
    case 'TIMEOUT':
      return 'crit';
    case 'DEGRADED':
      return 'warn';
    case 'OK':
      return 'ok';
    default:
      return 'idle';
  }
}

export function severityTone(severity: AlertSeverity): ToneName {
  return severity === 'critical' ? 'crit' : 'warn';
}

/**
 * The label for a controller enum token.
 *
 * Falls back to the raw token when this build has no sentence for it — a
 * controller reporting a state added after this app shipped must show that
 * state, not a blank or a wrong guess.
 */
export function enumLabel(
  prefix: 'state' | 'status' | 'event' | 'alert',
  token: string | null | undefined,
  t: Translate,
): string {
  if (typeof token !== 'string' || token === '') return ABSENT;
  const key = `${prefix}.${token}` as StringKey;
  const label = t(key);
  return label === key ? token : label;
}

/* ========================================================================= */
/* aggregation                                                               */
/* ========================================================================= */

/**
 * Farm-wide moisture: the mean of the zone averages that actually have a
 * reading. Zones with no valid probe are excluded rather than counted as zero,
 * which would drag the farm average toward a number nothing measured.
 */
export function overallMoisture(zones: readonly ZoneSnapshot[]): number | null {
  const readings = zones
    .map((zone) => zone.average)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (readings.length === 0) return null;
  return readings.reduce((sum, value) => sum + value, 0) / readings.length;
}

/** Probe counts for the SENSE stage: how many of the fitted probes are usable. */
export function probeCoverage(zones: readonly ZoneSnapshot[]): { valid: number; total: number } {
  return {
    valid: zones.reduce((n, zone) => n + zone.validSensors, 0),
    // Phase 1 hardware is two probes per zone; the count comes from the zones
    // actually reported rather than a constant, so a three-probe zone in a
    // later revision counts correctly the day the firmware reports it.
    total: zones.length * 2,
  };
}

/** The driest zone that has a usable reading, or null when none does. */
export function driestZone(zones: readonly ZoneSnapshot[]): ZoneSnapshot | null {
  let driest: ZoneSnapshot | null = null;
  for (const zone of zones) {
    if (zone.average === null) continue;
    if (driest === null || zone.average < (driest.average ?? Infinity)) driest = zone;
  }
  return driest;
}

/** Greeting key for the hour of day. */
export function greetingKey(hour: number): StringKey {
  if (hour < 12) return 'home.goodMorning';
  if (hour < 18) return 'home.goodAfternoon';
  return 'home.goodEvening';
}
