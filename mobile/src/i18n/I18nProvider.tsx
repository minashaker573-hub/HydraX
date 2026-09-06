/**
 * HYDRAX Mobile — language + direction context.
 *
 * WHY NOT `I18nManager.forceRTL`: React Native's native RTL switch only takes
 * effect after the whole app restarts, which for a monitoring app means
 * "change language, lose the screen you were watching". Direction is handled in
 * our own layout layer instead — `useI18n().isRTL` feeds the `Row` primitive
 * and the shared text styles — so EN/AR flips instantly and stays testable in
 * Jest without a native module in the loop.
 *
 * Numbers, percentages, device ids and chart axes deliberately keep Western
 * digits and left-to-right order in both languages: they are measurements and
 * hardware identifiers, not prose. Mirroring a 0–100% axis makes it harder to
 * read against its own printed labels, and the dashboard makes the same call.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { LANGUAGES, STRINGS, type Language, type StringKey } from './strings';

const STORAGE_KEY = 'hydrax.language';

export type Direction = 'ltr' | 'rtl';

export interface I18nValue {
  readonly lang: Language;
  readonly dir: Direction;
  readonly isRTL: boolean;
  /** Looks up a key in the active language. Falls back to English, then the key. */
  readonly t: (key: StringKey, vars?: Readonly<Record<string, string | number>>) => string;
  readonly setLanguage: (lang: Language) => void;
  /** False until the stored preference has been read, so nothing flashes. */
  readonly ready: boolean;
}

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Device locale -> a language we actually ship. Anything else falls to English. */
export function detectLanguage(tags: readonly string[]): Language {
  for (const tag of tags) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLanguage(primary)) return primary;
  }
  return 'en';
}

export function interpolate(
  template: string,
  vars?: Readonly<Record<string, string | number>>,
): string {
  if (vars === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/** Pure lookup, exported so tests can assert translations without a renderer. */
export function translate(
  lang: Language,
  key: StringKey,
  vars?: Readonly<Record<string, string | number>>,
): string {
  const entry = STRINGS[key] as { en: string; ar: string } | undefined;
  if (entry === undefined) return key;
  const value = entry[lang] || entry.en || key;
  return interpolate(value, vars);
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  /** Test seam: skips locale detection and storage hydration. */
  initialLanguage?: Language;
}): React.JSX.Element {
  const [lang, setLang] = useState<Language>(
    () => initialLanguage ?? detectLanguage(safeLocaleTags()),
  );
  const [ready, setReady] = useState(initialLanguage !== undefined);

  useEffect(() => {
    if (initialLanguage !== undefined) return;
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (isLanguage(stored)) setLang(stored);
      })
      .catch(() => {
        // A missing or unreadable preference is not an error worth surfacing:
        // the detected device locale is a perfectly good answer.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initialLanguage]);

  const setLanguage = useCallback((next: Language) => {
    setLang(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Persisting is a convenience; failing to persist must not break the UI.
    });
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      isRTL: lang === 'ar',
      t: (key, vars) => translate(lang, key, vars),
      setLanguage,
      ready,
    }),
    [lang, ready, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (value === null) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return value;
}

function safeLocaleTags(): string[] {
  try {
    return getLocales()
      .map((locale) => locale.languageTag)
      .filter((tag): tag is string => typeof tag === 'string');
  } catch {
    return [];
  }
}
