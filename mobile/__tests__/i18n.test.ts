/**
 * HYDRAX Mobile — translations and direction.
 *
 * The first test is the important one: it walks the whole string table and
 * fails if any key is missing a language or left as an English placeholder in
 * the Arabic column. A half-translated monitoring app is worse than an
 * untranslated one, because the gaps show up exactly on the screens nobody
 * reviewed.
 */

import { detectLanguage, interpolate, translate } from '../src/i18n/I18nProvider';
import { LANGUAGES, STRINGS, type StringKey } from '../src/i18n/strings';

/**
 * Keys whose Arabic is intentionally identical to the English: brand names and
 * protocol vocabulary that must not be translated. Anything else matching
 * across languages is an untranslated string.
 */
const INTENTIONALLY_UNTRANSLATED: StringKey[] = ['common.appName', 'device.wifi'];

describe('string table', () => {
  const keys = Object.keys(STRINGS) as StringKey[];

  it('has both languages for every key', () => {
    const missing = keys.filter((key) =>
      LANGUAGES.some((lang) => {
        const value = STRINGS[key][lang];
        return typeof value !== 'string' || value.trim() === '';
      }),
    );
    expect(missing).toEqual([]);
  });

  it('has no untranslated Arabic left over', () => {
    const untranslated = keys.filter(
      (key) =>
        STRINGS[key].ar === STRINGS[key].en && !INTENTIONALLY_UNTRANSLATED.includes(key),
    );
    expect(untranslated).toEqual([]);
  });

  it('keeps the same interpolation placeholders in both languages', () => {
    const placeholders = (value: string) => (value.match(/\{(\w+)\}/g) ?? []).sort();
    const mismatched = keys.filter(
      (key) =>
        placeholders(STRINGS[key].en).join() !== placeholders(STRINGS[key].ar).join(),
    );
    expect(mismatched).toEqual([]);
  });
});

describe('translate', () => {
  it('returns the active language', () => {
    expect(translate('en', 'nav.home')).toBe('Home');
    expect(translate('ar', 'nav.home')).toBe('الرئيسية');
  });

  it('interpolates variables', () => {
    expect(translate('en', 'common.zone', { n: 2 })).toBe('Zone 2');
    expect(translate('ar', 'common.zone', { n: 2 })).toContain('2');
  });

  it('returns the key itself for an unknown lookup rather than throwing', () => {
    expect(translate('en', 'not.a.real.key' as StringKey)).toBe('not.a.real.key');
  });

  it('leaves an unknown placeholder in place instead of printing undefined', () => {
    expect(interpolate('Zone {n} of {total}', { n: 1 })).toBe('Zone 1 of {total}');
  });
});

describe('language detection', () => {
  it('picks Arabic for an Arabic device locale', () => {
    expect(detectLanguage(['ar-EG', 'en-US'])).toBe('ar');
  });

  it('picks English for anything not shipped', () => {
    expect(detectLanguage(['fr-FR'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });

  it('matches on the primary subtag, not the whole tag', () => {
    expect(detectLanguage(['AR-sa'])).toBe('ar');
  });
});
