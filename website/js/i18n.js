/**
 * HYDRAX website — language state.
 *
 * The website previously had no i18n of its own (only the dashboard did).
 * This is deliberately the smallest possible port of that same architecture
 * — same function names, same fallback rule, same persistence mechanism —
 * so this file's behavior is predictable to anyone who already knows
 * dashboard/js/i18n.js, not a new pattern to learn.
 *
 * The one real difference: the dashboard's `t()` reads a static dictionary
 * baked into that file. This site's translatable text now lives in the CMS
 * (see js/content.js), not in a dictionary here — so this module only ever
 * tracks *which* language is active and flips `dir`/`lang` on `<html>`. Text
 * substitution and the EN→AR fallback rule live in content.js, next to the
 * fetch that makes the fallback meaningful.
 */

const STORAGE_KEY = 'hydrax-website-lang';
const SUPPORTED = ['en', 'ar'];
const DEFAULT_LANG = 'en';

const listeners = new Set();

function readStoredLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(stored) ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

let currentLang = readStoredLang();

export function getLang() {
  return currentLang;
}

export function isRtl(lang = currentLang) {
  return lang === 'ar';
}

/** Sets <html lang>/<html dir> so the whole document — not just CMS-sourced
 *  text — lays out and reads correctly. */
export function applyDocumentDirection() {
  const root = document.documentElement;
  root.lang = currentLang;
  root.dir = isRtl() ? 'rtl' : 'ltr';
}

export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === currentLang) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Preference just won't survive a reload in this browser; switching
    // still works for the rest of this page view.
  }
  applyDocumentDirection();
  for (const listener of listeners) listener(lang);
}

export function onLangChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Wires up a language-toggle control (see index.html's #lang-toggle: a
 * container with `.lang-btn[data-lang="en"|"ar"]` children) — shared by
 * every page that shows one (js/content.js, js/chrome.js) so the
 * active-button styling and the click-to-switch behavior live in exactly
 * one place, rather than three slightly-different copies.
 */
export function wireLangToggle(containerId = 'lang-toggle') {
  const container = document.getElementById(containerId);

  function sync() {
    const lang = getLang();
    for (const btn of document.querySelectorAll('.lang-btn')) {
      const active = btn.dataset.lang === lang;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  sync();
  if (container instanceof HTMLElement) {
    container.addEventListener('click', (event) => {
      const target = event.target;
      const btn = target instanceof HTMLElement ? target.closest('.lang-btn') : null;
      if (btn instanceof HTMLElement && btn.dataset.lang) setLang(btn.dataset.lang);
    });
  }
  onLangChange(sync);
}
