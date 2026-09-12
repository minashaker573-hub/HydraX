/**
 * HYDRAX website — the link hub's view model (/links).
 *
 * Pure: no DOM, no fetch, no globals. It turns a `linkHub` content section —
 * published CMS content, an admin's preview draft, or the static fallback in
 * links-config.js, which all share one shape — into exactly what the page
 * should show, in one language.
 *
 * Every rule about WHAT renders lives here, not in the DOM code:
 *   - a hidden or nameless team member is not shown
 *   - a member with no LinkedIn URL gets no LinkedIn action
 *   - a social platform with no URL renders no row, and with none at all the
 *     section is absent (no empty "Follow" heading)
 *   - an empty list hides its whole section
 *   - Arabic falls back to English per field, never per page
 *   - which icon a link gets (from where it goes, never from stored content)
 *
 * Keeping those rules pure is what lets backend/test/link-hub-content.test.ts
 * import this file and test the real rendering decisions, instead of a copy of
 * them that could quietly disagree with the page. js/links.js only draws what
 * this returns.
 */

/** en, or ar when Arabic is active and actually filled in. Also accepts a
 *  plain string. */
export function localize(value, lang) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (lang === 'ar' && typeof value.ar === 'string' && value.ar.trim() !== '') return value.ar;
  return typeof value.en === 'string' ? value.en : '';
}

/**
 * Up to two initials for the no-photo mark: first letter of the first and
 * last word. Code-point aware (Array.from), so an Arabic name yields Arabic
 * letters rather than half a surrogate pair. Latin letters are uppercased;
 * scripts without case are left alone.
 */
export function initialsOf(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toLocaleUpperCase('en');
}

/**
 * The icon a destination gets. Derived from where the link goes rather than
 * stored with it, so an admin who points a row somewhere else gets the right
 * icon automatically and can never pair "Call us" with an envelope.
 */
export function iconForHref(href) {
  const value = String(href || '');
  if (/^mailto:/i.test(value)) return 'mail';
  if (/^tel:/i.test(value)) return 'phone';
  const path = value.split(/[?#]/)[0];
  if (path === '/') return 'globe';
  if (path === '/request') return 'clipboard';
  if (path === '/dashboard') return 'chart';
  if (path === '/privacy') return 'shield';
  if (path === '/terms') return 'document';
  return 'link';
}

/** JSON with object keys sorted at every depth. Postgres JSONB returns keys in
 *  its own order, so content that is identical can serialize differently. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Whether two content sections would render identically. */
export function sameContent(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

/** Interface text that belongs to the page, not to the content an admin
 *  edits — so it is translated here, once, in both languages. */
const UI = {
  en: {
    linkedin: 'LinkedIn',
    viewProfile: (name) => `View ${name}'s LinkedIn profile`,
    newTab: '(opens in a new tab)',
    portrait: (name) => `Portrait of ${name}`,
    basedIn: 'Based in',
  },
  ar: {
    linkedin: 'LinkedIn',
    viewProfile: (name) => `عرض ملف ${name} على LinkedIn`,
    newTab: '(يفتح في علامة تبويب جديدة)',
    portrait: (name) => `صورة ${name}`,
    basedIn: 'المقر',
  },
};

export function uiStrings(lang) {
  return lang === 'ar' ? UI.ar : UI.en;
}

const pad2 = (n) => String(n).padStart(2, '0');
const list = (value) => (Array.isArray(value) ? value : []);
const str = (value) => (typeof value === 'string' ? value : '');

/**
 * Builds everything /links renders from one `linkHub` section.
 * Returns null for something that is not a section at all, so a caller can
 * keep whatever is already on screen.
 */
export function buildViewModel(section, lang = 'en') {
  if (!section || typeof section !== 'object') return null;
  const t = (value) => localize(value, lang);
  const ui = uiStrings(lang);

  const explore = list(section.exploreItems)
    .filter((item) => item && item.visible !== false && str(item.href) !== '')
    .map((item) => ({
      id: str(item.id),
      label: t(item.label),
      note: t(item.note),
      href: item.href,
      icon: iconForHref(item.href),
      external: /^https?:\/\//i.test(item.href),
    }));

  const members = list(section.team)
    .filter((m) => m && m.visible !== false && t(m.name).trim() !== '')
    .map((m, i) => {
      const name = t(m.name);
      const url = str(m.linkedinUrl).trim();
      return {
        id: str(m.id),
        index: pad2(i + 1),
        name,
        role: t(m.role),
        initials: initialsOf(name),
        image: str(m.image),
        imageAlt: ui.portrait(name),
        linkedin: url === ''
          ? null
          : { href: url, text: ui.linkedin, ariaLabel: `${ui.viewProfile(name)} ${ui.newTab}` },
      };
    });

  const social = list(section.social)
    .filter((s) => s && s.visible !== false && str(s.url).trim() !== '')
    .map((s) => {
      const label = t(s.label);
      return { platform: str(s.platform), label, href: s.url, ariaLabel: `${label} ${ui.newTab}` };
    });

  const contact = list(section.contactItems)
    .filter((c) => c && c.visible !== false && str(c.href) !== '')
    .map((c) => ({
      id: str(c.id),
      label: t(c.label),
      display: str(c.display),
      href: c.href,
      // Follows the scheme rather than being stored: a tel: row is a handset,
      // a mailto: row an envelope, and an admin cannot mislabel either.
      kind: /^mailto:/i.test(c.href) ? 'mail' : /^tel:/i.test(c.href) ? 'phone' : 'link',
    }));

  // Section numbers count only what is on the page, so a hidden section never
  // leaves a gap in the sequence.
  let n = 0;
  const number = (visible) => (visible ? pad2(++n) : '');
  const primaryHref = str(section.primaryHref) || '/';

  return {
    lang,
    eyebrow: t(section.eyebrow),
    tagline: t(section.tagline),
    intro: t(section.intro),
    location: t(section.location),
    primary: {
      label: t(section.primaryLabel),
      note: t(section.primaryNote),
      href: primaryHref,
      icon: iconForHref(primaryHref),
    },
    explore: {
      number: number(explore.length > 0),
      heading: t(section.exploreHeading),
      items: explore,
    },
    team: {
      number: number(members.length > 0),
      heading: t(section.teamHeading),
      intro: t(section.teamIntro),
      members,
    },
    social: {
      number: number(social.length > 0),
      heading: t(section.socialHeading),
      items: social,
    },
    contact: {
      number: number(contact.length > 0),
      heading: t(section.contactHeading),
      items: contact,
    },
    footerLinks: list(section.footerLinks)
      .filter((link) => link && link.visible !== false && str(link.href) !== '')
      .map((link) => ({ label: t(link.label), href: link.href })),
  };
}
