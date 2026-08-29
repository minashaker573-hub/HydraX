/**
 * HYDRAX dashboard — formatting and state vocabulary.
 *
 * Rule for this whole file: a value the backend did not send is rendered as
 * unavailable. Nothing is interpolated, defaulted to zero, or guessed. A
 * missing moisture reading shows an em dash, never "0%", because a zero is a
 * measurement and a dash is an absence.
 */

export const NOT_AVAILABLE = 'NOT AVAILABLE';

export function isNum(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** One decimal place, or an em dash when there is genuinely no value. */
export function percent(value) {
  return isNum(value) ? `${value.toFixed(1)}` : '—';
}

export function duration(ms) {
  if (!isNum(ms) || ms <= 0) return '0s';
  const totalS = Math.round(ms / 1000);
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function relativeTime(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown';
  const delta = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (delta < 5) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export function clockTime(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleTimeString();
}

export function dateTime(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString();
}

/** Human label for an ALL_CAPS enum coming off the wire. */
export function humanize(token) {
  if (typeof token !== 'string' || token === '') return '—';
  return token.replace(/_/g, ' ');
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
    return { label: 'NO BAND SET', tone: 'na' };
  }
  if (average < config.start_percent) return { label: 'DRY', tone: 'warn' };
  if (average >= config.stop_percent) return { label: 'WET', tone: 'water' };
  return { label: 'NORMAL', tone: 'ok' };
}

/** Zone sensor coverage -> tone + label. */
export function coverage(validSensors) {
  if (validSensors === 2) return { label: 'OK', tone: 'ok' };
  if (validSensors === 1) return { label: 'DEGRADED — 1 OF 2', tone: 'warn' };
  return { label: 'NO VALID PROBE', tone: 'crit' };
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
