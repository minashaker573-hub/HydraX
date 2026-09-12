/**
 * HYDRAX website — the link hub renderer (/links).
 *
 * Where content comes from, in order:
 *   1. links.html's own markup — a complete page with JavaScript blocked, and
 *      what an unfurl crawler reads. It mirrors links-config.js exactly
 *      (check.mjs enforces that), so in English it is already the fallback.
 *   2. js/links-config.js — the static fallback, used here only when the
 *      markup cannot stand in for it (Arabic, or a language switch).
 *   3. PUBLISHED CMS content from /api/v1/website-content — the runtime source
 *      of truth. Drafts are never served there; an admin sees a draft only
 *      through Preview (see the message listener below).
 *
 * WHAT renders — hidden members, empty sections, language fallback, icons —
 * is decided by js/links-model.js, which is pure and tested from the backend
 * suite. This file only draws that model.
 *
 * The page re-renders only when what it would draw actually differs from what
 * is on screen. On a normal install published content equals the fallback, so
 * the entrance animation plays once, uninterrupted, on the markup itself.
 *
 * Safe rendering: text via textContent, attributes via setAttribute, never
 * innerHTML (check.mjs enforces it). Hrefs and image sources are validated by
 * the server before they can be published, and re-checked here against a
 * narrow allowlist anyway, so a malformed row is dropped rather than drawn.
 *
 * Loaded as a module because the CSP is `script-src 'self'`.
 */
import { buildViewModel, sameContent, uiStrings } from './links-model.js';
import { LINK_HUB_FALLBACK } from './links-config.js';
import { applyDocumentDirection, getLang, onLangChange, wireLangToggle } from './i18n.js';

const CONTENT_URL = '/api/v1/website-content';
const SVG_NS = 'http://www.w3.org/2000/svg';

applyDocumentDirection();
wireLangToggle();

/* ================================================================ icons === */

/** 24x24 icons drawn inline: the CSP allows no external sprite, and a farm
 *  product has to render with no internet at all. `stroke` icons are line
 *  art; the platform marks are solid. */
const ICONS = {
  arrow: { d: 'M5 12h13m-5.5-5.5L18 12l-5.5 5.5', stroke: true, width: 1.8 },
  external: { d: 'M8 16 16 8M9.5 8H16v6.5', stroke: true, width: 1.8 },
  globe: {
    d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.6 9h16.8M3.6 15h16.8M12 3c2.5 2.4 3.8 5.5 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.5-3.8-9S9.5 5.4 12 3z',
    stroke: true,
  },
  clipboard: {
    d: 'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H16M8.5 11h7M8.5 15h5',
    stroke: true,
  },
  chart: { d: 'M4 5h16v11H4zM8 20h8M12 16v4M7.5 12.5l2.5-3 2.5 2 3.5-4', stroke: true },
  shield: { d: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z', stroke: true },
  document: { d: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6', stroke: true },
  link: {
    d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    stroke: true,
  },
  mail: { d: 'M3.5 6.5h17v11h-17zM3.5 7l8.5 6 8.5-6', stroke: true },
  phone: {
    d: 'M7 3.5H4.5A1.5 1.5 0 0 0 3 5c0 8.8 7.2 16 16 16a1.5 1.5 0 0 0 1.5-1.5V17l-4.2-1.6-2.1 2.4a13.6 13.6 0 0 1-6-6l2.4-2.1z',
    stroke: true,
  },
  linkedin: {
    d: 'M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05C20.6 8.65 22 11 22 14.4V21h-4v-5.9c0-1.4-.03-3.2-1.95-3.2-1.96 0-2.26 1.53-2.26 3.1V21H9z',
  },
  instagram: {
    d: 'M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3zm0 2A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 16.5 5zM12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm5-3.1a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z',
  },
  facebook: {
    d: 'M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.87.24-1.46 1.49-1.46H16.7V3.96c-.28-.04-1.2-.12-2.28-.12-2.26 0-3.8 1.38-3.8 3.9V10H8v3h2.62v8z',
  },
  youtube: {
    d: 'M21.6 7.2a2.5 2.5 0 0 0-1.75-1.77C18.25 5 12 5 12 5s-6.25 0-7.85.43A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.75 1.77C5.75 19 12 19 12 19s6.25 0 7.85-.43a2.5 2.5 0 0 0 1.75-1.77C22 15.2 22 12 22 12s0-3.2-.4-4.8zM10 15.1V8.9l5.2 3.1z',
  },
  tiktok: {
    d: 'M16.6 2h-3.1v13.2a2.6 2.6 0 1 1-2.2-2.57V9.5a5.7 5.7 0 1 0 5.3 5.68V8.9a6.6 6.6 0 0 0 3.9 1.27V7.06A3.8 3.8 0 0 1 16.6 2z',
  },
  x: {
    d: 'M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1-5.7 6.1H1.6l7.5-8.6L1.2 3h6.6l4.5 5.6zm-1.1 16.1h1.8L7.7 4.8H5.8z',
  },
};

/** An inline icon, always aria-hidden: every control carries its own text or
 *  accessible name, so an icon is never the only label. */
function icon(name, className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);
  const spec = ICONS[name] ?? ICONS.link;
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', spec.d);
  if (spec.stroke) {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', String(spec.width ?? 1.6));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
  } else {
    path.setAttribute('fill', 'currentColor');
  }
  svg.append(path);
  return svg;
}

/* ============================================================== helpers === */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== '') node.textContent = text;
  return node;
}

/** Same-origin path (not protocol-relative), mailto:, tel: or https:. */
const SAFE_HREF = /^(?:\/(?!\/)|mailto:|tel:|https:\/\/)/i;
/** A same-origin image path — the only kind the CMS will publish. */
const SAFE_IMAGE = /^\/(?!\/)\S+$/;

function byId(id) {
  const node = document.getElementById(id);
  return node instanceof HTMLElement ? node : null;
}

function setText(id, value) {
  const node = byId(id);
  if (node && value) node.textContent = value;
}

/** Stagger position for the entrance animation, across the whole page. */
let stagger = 0;

function card(li, animate) {
  if (animate) {
    li.classList.add('lh-anim');
    li.style.setProperty('--i', String(++stagger));
  }
  return li;
}

/** icon tile + title/subtitle + action indicator — the shape of every row. */
function fillRow(anchor, { iconName, title, titleClass, sub, subClass, subId, go }) {
  const tile = el('span', 'lh-icon');
  tile.append(icon(iconName));
  const text = el('span', 'lh-text');
  text.append(el('span', titleClass ? `lh-title ${titleClass}` : 'lh-title', title));
  if (sub) {
    const subEl = el('span', subClass ? `lh-sub ${subClass}` : 'lh-sub', sub);
    if (subId) subEl.id = subId;
    text.append(subEl);
  }
  const action = el('span', 'lh-go');
  action.append(icon(go));
  anchor.replaceChildren(tile, text, action);
}

function openInNewTab(anchor) {
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
}

/* ================================================================= rows === */

function linkRow(item, animate) {
  const li = el('li');
  const a = el('a', 'lh-link');
  a.setAttribute('href', item.href);
  fillRow(a, { iconName: item.icon, title: item.label, sub: item.note, go: item.external ? 'external' : 'arrow' });
  if (item.external) openInNewTab(a);
  li.append(a);
  return card(li, animate);
}

function initialsMark(member) {
  // Decorative: the name is right beside it, so the letters are hidden from
  // assistive technology rather than read twice.
  const mark = el('span', 'lh-avatar-initials', member.initials);
  mark.setAttribute('aria-hidden', 'true');
  return mark;
}

/**
 * A member card. With a LinkedIn URL the whole card is the link — the biggest
 * possible target, like every other row — and its accessible name says whose
 * profile it opens, with the role attached as its description. Without one,
 * the card is a plain, non-interactive item.
 */
function memberRow(member, animate) {
  const li = el('li', 'lh-member');
  const hasProfile = Boolean(member.linkedin && SAFE_HREF.test(member.linkedin.href));
  const cardEl = el(hasProfile ? 'a' : 'div', 'lh-member-card');

  const avatar = el('span', 'lh-avatar');
  if (member.image && SAFE_IMAGE.test(member.image)) {
    const img = document.createElement('img');
    img.className = 'lh-avatar-img';
    img.setAttribute('src', member.image);
    img.setAttribute('alt', member.imageAlt);
    img.width = 48;
    img.height = 48;
    // A deleted or unreachable upload degrades to initials, never a broken
    // image icon.
    img.addEventListener('error', () => img.replaceWith(initialsMark(member)), { once: true });
    avatar.append(img);
  } else {
    avatar.append(initialsMark(member));
  }

  const text = el('span', 'lh-text');
  text.append(el('span', 'lh-title', member.name));
  const roleId = `lh-role-${member.index}`;
  if (member.role) {
    const role = el('span', 'lh-sub', member.role);
    role.id = roleId;
    text.append(role);
  }

  cardEl.append(avatar, text);

  if (hasProfile) {
    cardEl.setAttribute('href', member.linkedin.href);
    openInNewTab(cardEl);
    cardEl.setAttribute('aria-label', member.linkedin.ariaLabel);
    if (member.role) cardEl.setAttribute('aria-describedby', roleId);

    const badge = el('span', 'lh-in');
    badge.setAttribute('aria-hidden', 'true');
    badge.append(icon('linkedin', 'lh-in-glyph'), el('span', 'lh-in-word', member.linkedin.text), icon('external', 'lh-ext'));
    cardEl.append(badge);
  }

  li.append(cardEl);
  return card(li, animate);
}

function socialRow(item, animate) {
  const li = el('li');
  const a = el('a', 'lh-social-link');
  a.setAttribute('href', item.href);
  openInNewTab(a);
  a.setAttribute('aria-label', item.ariaLabel);
  fillRow(a, { iconName: item.platform, title: item.label, go: 'external' });
  li.append(a);
  return card(li, animate);
}

function contactRow(item, animate) {
  const li = el('li');
  const a = el('a', 'lh-contact-link');
  a.setAttribute('href', item.href);
  fillRow(a, {
    iconName: item.kind === 'phone' ? 'phone' : 'mail',
    title: item.label,
    sub: item.display,
    subClass: 'lh-contact-value',
    go: 'arrow',
  });
  li.append(a);
  return card(li, animate);
}

/* =============================================================== render === */

function render(model, animate) {
  const ui = uiStrings(model.lang);
  stagger = 0;

  setText('linkhub-eyebrow', model.eyebrow);
  setText('linkhub-tagline', model.tagline);
  setText('linkhub-intro', model.intro);
  setText('linkhub-location', model.location);
  setText('linkhub-location-label', ui.basedIn);

  // The featured card is the page's fixed anchor: always present, so the
  // "HYDRAX links" group never disappears even with no other rows.
  const primary = byId('linkhub-primary');
  if (primary instanceof HTMLAnchorElement && SAFE_HREF.test(model.primary.href)) {
    primary.setAttribute('href', model.primary.href);
    fillRow(primary, {
      iconName: model.primary.icon,
      title: model.primary.label,
      titleClass: 'lh-cta-label',
      sub: model.primary.note,
      subId: 'linkhub-primary-note',
      go: 'arrow',
    });
    stagger += 1;
  }
  setText('linkhub-projects-h', model.explore.heading);
  const explore = model.explore.items.filter((item) => SAFE_HREF.test(item.href));
  byId('linkhub-projects')?.replaceChildren(...explore.map((item) => linkRow(item, animate)));

  const members = model.team.members;
  const teamSection = byId('linkhub-team-section');
  if (teamSection) teamSection.hidden = members.length === 0;
  setText('linkhub-team-h', model.team.heading);
  const teamIntro = byId('linkhub-team-intro');
  if (teamIntro) {
    teamIntro.textContent = model.team.intro;
    teamIntro.hidden = model.team.intro === '';
  }
  byId('linkhub-team')?.replaceChildren(...members.map((member) => memberRow(member, animate)));

  const social = model.social.items.filter((item) => SAFE_HREF.test(item.href));
  const socialSection = byId('linkhub-social-section');
  if (socialSection) socialSection.hidden = social.length === 0;
  setText('linkhub-social-h', model.social.heading);
  byId('linkhub-social')?.replaceChildren(...social.map((item) => socialRow(item, animate)));

  const contact = model.contact.items.filter((item) => SAFE_HREF.test(item.href));
  const contactSection = byId('linkhub-contact-section');
  if (contactSection) contactSection.hidden = contact.length === 0;
  setText('linkhub-contact-h', model.contact.heading);
  byId('linkhub-contact')?.replaceChildren(...contact.map((item) => contactRow(item, animate)));

  const footer = byId('linkhub-footer-links');
  const footerLinks = model.footerLinks.filter((link) => SAFE_HREF.test(link.href));
  if (footer && footerLinks.length > 0) {
    footer.replaceChildren(...footerLinks.map((link) => {
      const a = el('a', null, link.label);
      a.setAttribute('href', link.href);
      return a;
    }));
  }
}

/* ================================================================= boot === */

// What is on screen right now. The markup is the English fallback.
let shown = { section: LINK_HUB_FALLBACK, lang: 'en' };
let previewing = false;

function show(section, { animate = true, force = false } = {}) {
  const lang = getLang();
  if (!force && lang === shown.lang && sameContent(section, shown.section)) return;
  const model = buildViewModel(section, lang);
  if (!model) return;
  render(model, animate);
  shown = { section, lang };
}

// The markup already is the English fallback; only Arabic needs a render.
if (getLang() !== 'en') show(LINK_HUB_FALLBACK, { force: true });

// A language switch redraws in place, without replaying the entrance.
onLangChange(() => show(shown.section, { animate: false, force: true }));

/* ------------------------------------------------------- admin preview -- */

// The admin's Preview embeds this page and posts the unsaved draft to it (see
// admin/js/cms.js openPreview). Same-origin only. The banner is this file's
// own text, so a preview can never be mistaken for the live page. Once a
// draft has arrived it wins over the published fetch below.
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.type !== 'hydrax:preview-content' || !data.sections) return;
  const section = data.sections.linkHub;
  if (!section || typeof section !== 'object') return;

  previewing = true;
  if (!document.getElementById('hydrax-preview-banner')) {
    const banner = el('div', null, 'PREVIEW — showing unpublished draft content, not the live site');
    banner.id = 'hydrax-preview-banner';
    banner.style.cssText =
      'position:sticky;top:0;z-index:999;background:#93692e;color:#fff;text-align:center;' +
      'padding:8px 12px;font:600 13px/1.4 system-ui,sans-serif;letter-spacing:0.03em;';
    document.body.prepend(banner);
  }
  show(section, { animate: false, force: true });
});

/* ---------------------------------------------------- published content -- */

async function loadPublished() {
  try {
    const response = await fetch(CONTENT_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`website-content responded ${response.status}`);
    const body = await response.json();
    if (previewing) return;
    const section = body && body.sections ? body.sections.linkHub : null;
    // No published link hub yet is not an error: the fallback on screen is
    // exactly what a fresh install publishes. Identical content is skipped.
    if (section && typeof section === 'object') show(section);
  } catch (error) {
    console.warn('[hydrax] could not load link hub content; showing static links', error);
  } finally {
    document.dispatchEvent(new CustomEvent('hydrax:content-ready'));
  }
}

loadPublished();
