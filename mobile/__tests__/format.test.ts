/**
 * HYDRAX Mobile — formatting and classification rules.
 *
 * The classification tests here are the app's honesty rules in executable
 * form. In particular: a zone with no advisory band must never be reported as
 * "normal", and a farm average must never be computed by treating an unknown
 * zone as zero.
 */

import { translate } from '../src/i18n/I18nProvider';
import type { ZoneSnapshot } from '../src/api/types';
import {
  ABSENT,
  absoluteTime,
  coverageStatus,
  decimal,
  driestZone,
  duration,
  enumLabel,
  greetingKey,
  moistureStatus,
  overallMoisture,
  percent,
  probeCoverage,
  relativeTime,
  severityTone,
  stateTone,
} from '../src/utils/format';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

function zone(partial: Partial<ZoneSnapshot> & { zone: number }): ZoneSnapshot {
  return {
    sensor1: null,
    sensor2: null,
    sensor1Valid: false,
    sensor2Valid: false,
    average: null,
    validSensors: 0,
    valveOpen: false,
    irrigating: false,
    band: null,
    ...partial,
  };
}

describe('numbers', () => {
  it('rounds percentages and marks a missing one absent', () => {
    expect(percent(41.6)).toBe('42%');
    expect(percent(null)).toBe(ABSENT);
    expect(percent(Number.NaN)).toBe(ABSENT);
  });

  it('shows one decimal for a single probe reading', () => {
    expect(decimal(13.84)).toBe('13.8');
    expect(decimal(null)).toBe(ABSENT);
  });

  it('distinguishes zero from unknown', () => {
    expect(percent(0)).toBe('0%');
    expect(percent(null)).toBe(ABSENT);
  });
});

describe('time', () => {
  const now = Date.parse('2026-09-05T12:00:00.000Z');

  it('describes recency in the reader’s units', () => {
    expect(relativeTime('2026-09-05T11:59:58.000Z', t, now)).toBe('just now');
    expect(relativeTime('2026-09-05T11:59:20.000Z', t, now)).toBe('40s ago');
    expect(relativeTime('2026-09-05T11:45:00.000Z', t, now)).toBe('15m ago');
    expect(relativeTime('2026-09-05T09:00:00.000Z', t, now)).toBe('3h ago');
    expect(relativeTime('2026-09-02T12:00:00.000Z', t, now)).toBe('3d ago');
  });

  it('refuses to guess at a broken timestamp', () => {
    expect(relativeTime('not-a-date', t, now)).toBe(ABSENT);
    expect(relativeTime(null, t, now)).toBe(ABSENT);
    expect(absoluteTime('not-a-date')).toBe(ABSENT);
  });

  it('formats durations', () => {
    expect(duration(45_000, t)).toBe('45s');
    expect(duration(192_000, t)).toBe('3m 12s');
    expect(duration(7_500_000, t)).toBe('2h 05m');
    expect(duration(null, t)).toBe(ABSENT);
    expect(duration(-1, t)).toBe(ABSENT);
  });

  it('greets by hour', () => {
    expect(greetingKey(7)).toBe('home.goodMorning');
    expect(greetingKey(14)).toBe('home.goodAfternoon');
    expect(greetingKey(21)).toBe('home.goodEvening');
  });
});

describe('moisture classification', () => {
  it('says NO BAND rather than NORMAL when the backend holds no band', () => {
    expect(moistureStatus(42, null)?.labelKey).toBe('moisture.noBand');
  });

  it('classifies against a real band', () => {
    const band = { startPercent: 35, stopPercent: 60 };
    expect(moistureStatus(20, band)?.labelKey).toBe('moisture.dry');
    expect(moistureStatus(45, band)?.labelKey).toBe('moisture.normal');
    expect(moistureStatus(72, band)?.labelKey).toBe('moisture.wet');
  });

  it('has no opinion when there is no reading', () => {
    expect(moistureStatus(null, { startPercent: 35, stopPercent: 60 })).toBeNull();
  });

  it('grades probe coverage', () => {
    expect(coverageStatus(2).labelKey).toBe('coverage.full');
    expect(coverageStatus(1).tone).toBe('warn');
    expect(coverageStatus(0).tone).toBe('crit');
  });
});

describe('aggregation', () => {
  it('averages only the zones that actually reported', () => {
    const zones = [zone({ zone: 1, average: 20 }), zone({ zone: 2, average: 40 }), zone({ zone: 3 })];
    // Not 20: the unread zone is excluded, not counted as 0.
    expect(overallMoisture(zones)).toBe(30);
  });

  it('returns null when nothing reported', () => {
    expect(overallMoisture([zone({ zone: 1 })])).toBeNull();
    expect(overallMoisture([])).toBeNull();
  });

  it('counts probe coverage against the fitted probes', () => {
    expect(probeCoverage([zone({ zone: 1, validSensors: 2 }), zone({ zone: 2, validSensors: 1 })]))
      .toEqual({ valid: 3, total: 4 });
  });

  it('finds the driest zone with a reading', () => {
    const zones = [zone({ zone: 1, average: 40 }), zone({ zone: 2, average: 12 }), zone({ zone: 3 })];
    expect(driestZone(zones)?.zone).toBe(2);
    expect(driestZone([zone({ zone: 9 })])).toBeNull();
  });
});

describe('enum labels', () => {
  it('translates a known controller state', () => {
    expect(enumLabel('state', 'IRRIGATING', t)).toBe('Irrigating');
    expect(enumLabel('alert', 'DEVICE_OFFLINE', t)).toBe('Controller offline');
  });

  it('shows an unknown token verbatim instead of hiding it', () => {
    expect(enumLabel('state', 'FLUSHING', t)).toBe('FLUSHING');
  });

  it('maps states to tones', () => {
    expect(stateTone('IRRIGATING')).toBe('water');
    expect(stateTone('ACTUATOR_ERROR')).toBe('crit');
    expect(stateTone('OK')).toBe('ok');
    expect(stateTone('SOMETHING_NEW')).toBe('idle');
    expect(severityTone('critical')).toBe('crit');
    expect(severityTone('warning')).toBe('warn');
  });
});
