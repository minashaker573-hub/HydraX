/**
 * HYDRAX dashboard — formatting and state vocabulary.
 *
 * Rule for this whole file: a value the backend did not send is rendered as
 * unavailable. Nothing is interpolated, defaulted to zero, or guessed. A
 * missing moisture reading shows an em dash, never "0%", because a zero is a
 * measurement and a dash is an absence.
 *
 * Every user-visible label in this file goes through `t()` from i18n.js, so
 * it renders in whichever language is currently active. Dates and times force
 * Latin (Western) digits even in Arabic — `ar-EG-u-nu-latn` — because a
 * telemetry reading is a number first, and the reference direction for this
 * dashboard keeps digits in that form in both languages.
 */

import { getLang, t } from './i18n.js';

export function isNum(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** One decimal place, or an em dash when there is genuinely no value. */
export function percent(value) {
  return isNum(value) ? `${value.toFixed(1)}` : '—';
}

export function duration(ms) {
  if (!isNum(ms) || ms <= 0) return t('common.durationZero');
  const totalS = Math.round(ms / 1000);
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  if (h > 0) return t('common.durationHoursMinutes', { h, m });
  if (m > 0) return t('common.durationMinutesSeconds', { m, s });
  return t('common.durationSeconds', { s });
}

export function relativeTime(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return t('common.unknown');
  const delta = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (delta < 5) return t('common.justNow');
  if (delta < 60) return t('common.secondsAgo', { n: delta });
  if (delta < 3600) return t('common.minutesAgo', { n: Math.floor(delta / 60) });
  if (delta < 86400) return t('common.hoursAgo', { n: Math.floor(delta / 3600) });
  return t('common.daysAgo', { n: Math.floor(delta / 86400) });
}

/** Locale for Intl date/time formatting — Latin digits in both languages. */
function dtLocale() {
  return getLang() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US';
}

export function clockTime(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '—';
  return new Date(time).toLocaleTimeString(dtLocale());
}

export function dateTime(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '—';
  return new Date(time).toLocaleString(dtLocale());
}

/** Human label for an ALL_CAPS enum coming off the wire with no dictionary
 *  entry — a readable fallback, never a crash, for a token i18n.js does not
 *  yet know about. */
export function humanize(token) {
  if (typeof token !== 'string' || token === '') return '—';
  return token.replace(/_/g, ' ');
}

/**
 * Translates a wire enum (event type, alert type, irrigation state,
 * controller status...) through the i18n dictionary at `namespace.TOKEN`,
 * falling back to a humanized version of the raw token if the dictionary has
 * no entry — so an enum value added to the backend before the dictionary is
 * updated still renders something readable instead of a raw key path.
 */
export function localizedLabel(namespace, token) {
  if (typeof token !== 'string' || token === '') return '—';
  const translated = t(`${namespace}.${token}`);
  if (translated === `${namespace}.${token}`) return humanize(token);
  return translated;
}

/* -------------------------------------------------------------------------
   State vocabulary — the single place that maps backend enums to severity.
   ------------------------------------------------------------------------- */

/** Irrigation state -> pill tone. */
export function irrigationTone(state) {
  switch (state) {
    case 'IRRIGATING':
    case 'STARTING':
    case 'STOPPING':
    case 'IRRIGATION_REQUIRED':
      return 'water';
    case 'SENSOR_ERROR':
    case 'ACTUATOR_ERROR':
    case 'TIMEOUT':
      return 'crit';
    default:
      return 'idle';
  }
}

/** Controller status -> pill tone. */
export function statusTone(status) {
  if (status === 'OK') return 'ok';
  if (status === 'DEGRADED') return 'warn';
  if (status === null || status === undefined) return 'na';
  return 'crit';
}

/**
 * Moisture status relative to the zone's configured hysteresis band.
 *
 * Returns null when there is no reading or no configured band — the UI then
 * shows "no threshold configured" rather than inventing DRY/NORMAL.
 */
export function moistureStatus(average, config) {
  if (!isNum(average)) return null;
  // The controller always has thresholds (compiled into the firmware); what
  // may be missing is the backend's advisory copy. Say that precisely rather
  // than implying the device is running without a band.
  if (!config || !isNum(config.start_percent) || !isNum(config.stop_percent)) {
    return { label: t('moistureStatus.noBandSet'), tone: 'na' };
  }
  if (average < config.start_percent) return { label: t('moistureStatus.dry'), tone: 'warn' };
  if (average >= config.stop_percent) return { label: t('moistureStatus.wet'), tone: 'water' };
  return { label: t('moistureStatus.normal'), tone: 'ok' };
}

/** Zone sensor coverage -> tone + label. */
export function coverage(validSensors) {
  if (validSensors === 2) return { label: t('coverage.ok'), tone: 'ok' };
  if (validSensors === 1) return { label: t('coverage.degraded'), tone: 'warn' };
  return { label: t('coverage.noValidProbe'), tone: 'crit' };
}

/** Event type -> category used by the Alerts & Events filters. */
export function eventCategory(type) {
  switch (type) {
    case 'IRRIGATION_STARTED':
    case 'IRRIGATION_STOPPED':
    case 'ZONE_ACTIVATED':
    case 'IRRIGATION_TIMEOUT':
      return 'IRRIGATION';
    case 'ACTUATOR_ERROR':
    case 'FAULT_CLEARED':
      return 'PUMP';
    case 'SENSOR_ERROR':
    case 'SENSOR_RECOVERED':
      return 'SAFETY';
    case 'SAFE_SHUTDOWN':
      return 'SAFETY';
    default:
      return 'SYSTEM';
  }
}

/** Event type -> pill tone. */
export function eventTone(type) {
  switch (type) {
    case 'IRRIGATION_TIMEOUT':
    case 'SENSOR_ERROR':
    case 'ACTUATOR_ERROR':
    case 'SAFE_SHUTDOWN':
      return 'crit';
    case 'IRRIGATION_STARTED':
    case 'ZONE_ACTIVATED':
      return 'water';
    case 'SENSOR_RECOVERED':
    case 'FAULT_CLEARED':
      return 'ok';
    default:
      return 'idle';
  }
}

/** Alert type -> category, for filtering alongside events. */
export function alertCategory(type) {
  if (type === 'IRRIGATION_TIMEOUT') return 'IRRIGATION';
  if (type === 'ACTUATOR_ERROR') return 'PUMP';
  if (type === 'SENSOR_ERROR') return 'SAFETY';
  return 'SYSTEM';
}
