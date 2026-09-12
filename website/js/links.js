/**
 * HYDRAX website — the link hub (/links).
 *
 * Three sources of truth, in strict precedence order:
 *
 *   1. links.html's own markup — every row is a real <a> in the document.
 *      That is the page with JavaScript blocked or still loading, and what a
 *      preview crawler reads. For the one URL that goes in a social bio,
 *      that is not hypothetical: in-app browsers, strict privacy modes and
 *      unfurl bots all have to see the links.
 *   2. js/links-config.js — the static defaults, rendered immediately so the
 *      page behaves exactly as it did before the CMS existed if the network
 *      is unreachable. It is also what backend/src/domain/website-content-
 *      seed.ts's `linkHub` seed was transcribed from, so at first boot 1, 2
 *      and 3 all say the same thing and nothing visibly changes.
 *   3. published CMS content from /api/v1/website-content — the runtime
 *      source once an admin has published. Only ever 'published' rows: a
 *      draft is not served on this endpoint at all (see
 *      backend/src/routes/website-content.ts).
 *
 * A failure at step 3 leaves step 2's render standing. The page never goes
 * blank because the CMS could not be reached.
 *
 * Text is set with textContent and attributes with setAttribute, never
 * innerHTML — there is no code path here that parses a string as HTML, so
 * admin-entered content can never become markup. Same rule js/content.js
 * follows for the homepage; check.mjs enforces it.
 *
 * Loaded as a module because the server's CSP is `script-src 'self'`.
 */
import {
  CONTACT_LINKS,
  LOCATION,
  PRIMARY_LINK,
  PROJECT_LINKS,
  SOCIAL_PLATFORMS,
} from './links-config.js';
import { applyDocumentDirection, getLang, onLangChange, wireLangToggle } from './i18n.js';

const CONTENT_URL = '/api/v1/website-content';
const SVG_NS = 'http://www.w3.org/2000/svg';

/* Same job as js/chrome.js on the other content-free pages: carry a language
   choice made on the homepage over to this page as direction, and wire this
   page's own EN/AR toggle. */
applyDocumentDirection();
wireLangToggle();

/**
 * Single-path icon geometry, drawn inline — the CSP forbids an external
 * sprite host and a farm product has to render with no internet at all.
 * Each is a 24x24 path; brand marks are solid, interface icons are stroked.
 */
const ICONS = {
  mail: { d: 'M3 6.5h18v11H3zM3 7l9 6 9-6', stroke: true },
  phone: {
    d: 'M7 3.5H4.5A1.5 1.5 0 0 0 3 5c0 8.8 7.2 16 16 16a1.5 1.5 0 0 0 1.5-1.5V17l-4.2-1.6-2.1 2.4a13.6 13.6 0 0 1-6-6l2.4-2.1z',
    stroke: true,
  },
  arrow: { d: 'M5 12h13m-5.5-5.5L18 12l-5.5 5.5', stroke: true },
  linkedin: {
    d: 'M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05C20.6 8.65 22 11 22 14.4V21h-4v-5.9c0-1.4-.03-3.2-1.95-3.2-1.96 0-2.26 1.53-2.26 3.1V21H9z',
    stroke: false,
  },
  instagram: {
    d: 'M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3zm0 2A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 16.5 5zM12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm5-3.1a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z',
    stroke: false,
  },
  facebook: {
    d: 'M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.87.24-1.46 1.49-1.46H16.7V3.96c-.28-.04-1.2-.12-2.28-.12-2.26 0-3.8 1.38-3.8 3.9V10H8v3h2.62v8z',
    stroke: false,
  },
  youtube: {
    d: 'M21.6 7.2a2.5 2.5 0 0 0-1.75-1.77C18.25 5 12 5 12 5s-6.25 0-7.85.43A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.75 1.77C5.75 19 12 19 12 19s6.25 0 7.85-.43a2.5 2.5 0 0 0 1.75-1.77C22 15.2 22 12 22 12s0-3.2-.4-4.8zM10 15.1V8.9l5.2 3.1z',
    stroke: false,
  },
  tiktok: {
    d: 'M16.6 2h-3.1v13.2a2.6 2.6 0 1 1-2.2-2.57V9.5a5.7 5.7 0 1 0 5.3 5.68V8.9a6.6 6.6 0 0 0 3.9 1.27V7.06A3.8 3.8 0 0 1 16.6 2z',
    stroke: false,
  },
  x: {
    d: 'M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1-5.7 6.1H1.6l7.5-8.6L1.2 3h6.6l4.5 5.6zm-1.1 16.1h1.8L7.7 4.8H5.8z',
    stroke: false,
  },
};

/* ============================================================ helpers ==== */

/** en, with ar shown instead when Arabic is active and an Arabic value has
 *  actually been entered — the same fallback rule js/content.js and the
 *  dashboard's i18n already use. Also accepts a plain string, which is what
 *  links-config.js holds. */
function text(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (getLang() === 'ar' && typeof value.ar === 'string' && value.ar.trim() !== '') return value.ar;
  return typeof value.en === 'string' ? value.en : '';
}

/** Builds one inline <svg> icon. Always aria-hidden: every row it sits in
 *  carries its own visible text label, so the icon is decoration. */
function icon(name, className) {
  const spec = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (spec === undefined) return svg;

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', spec.d);
  if (spec.stroke) {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
  } else {
    path.setAttribute('fill', 'currentColor');
  }
  svg.append(path);
  return svg;
}

/** True for anything that leaves this site. Internal routes stay bare links;
 *  external ones get rel="noopener noreferrer" and an announced new tab. */
function isExternal(href) {
  return /^https?:\/\//i.test(href);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el instanceof HTMLElement && value) el.textContent = value;
}

/* ============================================================ rows ======= */

/**
 * One row of the hub: an anchor with a label, an optional supporting line,
 * an optional leading icon and a trailing arrow.
 */
function row({ href, label, note, display, iconName, external }) {
  const anchor = document.createElement('a');
  anchor.className = 'linkhub-row';
  anchor.href = href;

  if (external) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }

  if (iconName) {
    const mark = document.createElement('span');
    mark.className = 'linkhub-row-icon';
    mark.append(icon(iconName, 'linkhub-icon'));
    anchor.append(mark);
  }

  const body = document.createElement('span');
  body.className = 'linkhub-row-body';

  const labelEl = document.createElement('span');
  labelEl.className = 'linkhub-row-label';
  labelEl.textContent = label;
  body.append(labelEl);

  const secondary = display || note;
  if (secondary) {
    const noteEl = document.createElement('span');
    noteEl.className = display ? 'linkhub-row-value' : 'linkhub-row-note';
    noteEl.textContent = secondary;
    body.append(noteEl);
  }

  anchor.append(body);

  // "opens in a new tab" belongs to the link's accessible name, not to a
  // visual-only marker — a screen reader user gets the same warning a
  // sighted user gets from the arrow changing shape.
  if (external) {
    const hint = document.createElement('span');
    hint.className = 'sr-only';
    hint.textContent = ' (opens in a new tab)';
    anchor.append(hint);
  }

  anchor.append(icon('arrow', 'linkhub-row-arrow'));
  return anchor;
}

/** Replaces a container's children. An empty list leaves the existing markup
 *  alone rather than blanking the page — a section an admin genuinely wants
 *  gone is hidden by `visible`, not by arriving empty. */
function render(id, nodes) {
  const container = document.getElementById(id);
  if (!(container instanceof HTMLElement) || nodes.length === 0) return false;
  container.replaceChildren(...nodes);
  return true;
}

/* ============================================================ model ====== */

/**
 * The shape the renderer below consumes, built either from links-config.js
 * (static defaults) or from a published `linkHub` CMS section. Normalizing
 * first means there is exactly one renderer, not one per source — the two
 * cannot drift into rendering differently.
 */
function modelFromConfig() {
  return {
    eyebrow: 'Official links',
    tagline: 'Water that lets every field thrive.',
    intro: 'Soil-based irrigation control that runs on the farm, not in the cloud.',
    primary: { label: PRIMARY_LINK.label, note: PRIMARY_LINK.note, href: PRIMARY_LINK.href },
    exploreHeading: 'Explore',
    explore: PROJECT_LINKS.map((link, i) => ({
      id: `explore-${i}`, label: link.label, note: link.note, href: link.href, visible: true,
    })),
    socialHeading: 'Follow',
    social: SOCIAL_PLATFORMS.map((platform) => ({
      platform: platform.key,
      label: platform.label,
      // links-config.js uses null for "no account"; the CMS uses ''. Both
      // mean the same thing and both render no row.
      url: typeof platform.url === 'string' ? platform.url : '',
      visible: true,
    })),
    contactHeading: 'Contact',
    contact: CONTACT_LINKS.map((link) => ({
      id: link.icon, label: link.label, note: '', display: link.display,
      href: link.href, icon: link.icon, visible: true,
    })),
    location: LOCATION,
    footerLinks: null, // the static footer markup is already correct
  };
}

/** Maps a platform key to the icon registry key. They are the same name for
 *  every supported platform; this keeps that an explicit lookup rather than
 *  an assumption, so an unknown key degrades to no icon, not a broken one. */
function socialIcon(platform) {
  return Object.prototype.hasOwnProperty.call(ICONS, platform) ? platform : null;
}

function modelFromCms(section) {
  return {
    eyebrow: text(section.eyebrow),
    tagline: text(section.tagline),
    intro: text(section.intro),
    primary: {
      label: text(section.primaryLabel),
      note: text(section.primaryNote),
      href: typeof section.primaryHref === 'string' ? section.primaryHref : '/',
    },
    exploreHeading: text(section.exploreHeading),
    explore: (Array.isArray(section.exploreItems) ? section.exploreItems : []).map((item) => ({
      id: item.id, label: text(item.label), note: text(item.note),
      href: typeof item.href === 'string' ? item.href : '', visible: item.visible !== false,
    })),
    socialHeading: text(section.socialHeading),
    social: (Array.isArray(section.social) ? section.social : []).map((item) => ({
      platform: item.platform,
      label: text(item.label),
      url: typeof item.url === 'string' ? item.url : '',
      visible: item.visible !== false,
    })),
    contactHeading: text(section.contactHeading),
    contact: (Array.isArray(section.contactItems) ? section.contactItems : []).map((item) => ({
      id: item.id, label: text(item.label), note: text(item.note),
      display: typeof item.display === 'string' ? item.display : '',
      href: typeof item.href === 'string' ? item.href : '',
      // The icon follows the link's scheme rather than being stored: a
      // mailto: row is an envelope and a tel: row is a handset, and letting
      // an admin choose otherwise would only allow mislabelling.
      icon: /^mailto:/i.test(item.href) ? 'mail' : /^tel:/i.test(item.href) ? 'phone' : null,
      visible: item.visible !== false,
    })),
    location: text(section.location),
    footerLinks: (Array.isArray(section.footerLinks) ? section.footerLinks : [])
      .filter((link) => link.visible !== false)
      .map((link) => ({ label: text(link.label), href: link.href })),
  };
}

/* ============================================================ render ===== */

function renderModel(model) {
  setText('linkhub-eyebrow', model.eyebrow);
  setText('linkhub-tagline', model.tagline);
  setText('linkhub-intro', model.intro);
  setText('linkhub-location', model.location);

  /* ------------------------------------------------------- primary CTA -- */
  const primary = document.getElementById('linkhub-primary');
  if (primary instanceof HTMLAnchorElement && model.primary.href) {
    primary.href = model.primary.href;
    const label = primary.querySelector('.linkhub-cta-label');
    if (label instanceof HTMLElement && model.primary.label) label.textContent = model.primary.label;
  }
  setText('linkhub-primary-note', model.primary.note);

  /* ------------------------------------------------------------ explore -- */
  setText('linkhub-projects-h', model.exploreHeading);
  const explore = model.explore.filter((item) => item.visible && item.href);
  const exploreSection = document.getElementById('linkhub-projects-section');
  if (explore.length === 0) {
    if (exploreSection instanceof HTMLElement) exploreSection.hidden = true;
  } else {
    if (exploreSection instanceof HTMLElement) exploreSection.hidden = false;
    render('linkhub-projects', explore.map((item) => row({
      href: item.href, label: item.label, note: item.note, external: isExternal(item.href),
    })));
  }

  /* ------------------------------------------------------------- social -- */
  // A platform with no URL is not an account that exists, so it renders no
  // row — and if that leaves the section empty, the heading goes with it
  // rather than standing over nothing.
  setText('linkhub-social-h', model.socialHeading);
  const socials = model.social.filter((item) => item.visible && item.url.trim() !== '');
  const socialSection = document.getElementById('linkhub-social-section');
  if (socialSection instanceof HTMLElement) socialSection.hidden = socials.length === 0;
  // Unlike the other lists, this container is written unconditionally — it
  // has no static fallback rows to protect (links.html ships it empty,
  // because no account exists), and "no rows" is a real state it must be
  // able to return to. Leaving stale children behind would strand a row
  // inside a hidden section, which is invisible but no longer true.
  const socialList = document.getElementById('linkhub-social');
  if (socialList instanceof HTMLElement) {
    socialList.replaceChildren(...socials.map((item) => row({
      href: item.url, label: item.label, iconName: socialIcon(item.platform),
      external: isExternal(item.url),
    })));
  }

  /* ------------------------------------------------------------ contact -- */
  setText('linkhub-contact-h', model.contactHeading);
  const contacts = model.contact.filter((item) => item.visible && item.href);
  const contactSection = document.getElementById('linkhub-contact-section');
  if (contacts.length === 0) {
    if (contactSection instanceof HTMLElement) contactSection.hidden = true;
  } else {
    if (contactSection instanceof HTMLElement) contactSection.hidden = false;
    render('linkhub-contact', contacts.map((item) => row({
      href: item.href, label: item.label, display: item.display,
      iconName: item.icon, external: false,
    })));
  }

  /* ------------------------------------------------------------- footer -- */
  if (Array.isArray(model.footerLinks) && model.footerLinks.length > 0) {
    render('linkhub-footer-links', model.footerLinks.map((link) => {
      const a = document.createElement('a');
      a.href = typeof link.href === 'string' ? link.href : '/';
      a.textContent = link.label;
      return a;
    }));
  }
}

/* ============================================================ boot ======= */

let cachedModel = null;

// Once the admin has posted a draft into this page, published content must
// not be allowed to land on top of it. Preview opens in an iframe, so the
// draft message and this page's own fetch of published content are genuinely
// racing; without this the admin sees their draft flicker and then vanish,
// which reads as "my edit did not work" rather than "a fetch resolved late".
let previewing = false;

function apply(model) {
  cachedModel = model;
  renderModel(model);
}

// Step 2: the static defaults, applied immediately. Identical to the markup
// on a fresh install, so this is invisible then — it matters when the CMS is
// unreachable, where it keeps the page behaving exactly as it did before the
// CMS existed.
apply(modelFromConfig());

// Language is the one thing that can change without new content arriving.
onLangChange(() => {
  if (cachedModel) renderModel(cachedModel);
});

/* ------------------------------------------------------- admin preview -- */

// The admin CMS's Preview button embeds this page in an iframe and posts the
// in-progress draft to it — see admin/js/cms.js's openPreview(). Draft
// content is never served over the network for this; it only reaches this
// page if something already embedding it (same origin, so already trusted —
// see the CSP's frame-ancestors 'self') chooses to send it. The banner is
// this file's own static text, not admin content, so a visitor can never
// mistake a preview for the live page.
function showPreviewBanner() {
  if (document.getElementById('hydrax-preview-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'hydrax-preview-banner';
  banner.textContent = 'PREVIEW — showing unpublished draft content, not the live site';
  banner.style.cssText =
    'position:sticky;top:0;z-index:999;background:#93692e;color:#fff;text-align:center;' +
    'padding:8px 12px;font:600 13px/1.4 system-ui,sans-serif;letter-spacing:0.03em;';
  document.body.prepend(banner);
}

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.type !== 'hydrax:preview-content' || !data.sections) return;
  const section = data.sections.linkHub;
  if (!section || typeof section !== 'object') return;

  previewing = true;
  showPreviewBanner();
  apply(modelFromCms(section));
});

/* ---------------------------------------------------- published content -- */

async function loadContent() {
  try {
    const response = await fetch(CONTENT_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`website-content responded ${response.status}`);
    const body = await response.json();
    // A preview arrived while this was in flight — that draft is what the
    // admin asked to see, so it wins.
    if (previewing) return;
    const section = body && body.sections ? body.sections.linkHub : null;
    // No published linkHub row yet (a database seeded before this section
    // existed, say) is not an error — it means "nothing has overridden the
    // defaults", which is exactly what is already on screen.
    if (!section || typeof section !== 'object') return;
    apply(modelFromCms(section));
  } catch (error) {
    // Leave the static render exactly as it is. A visitor never sees a blank
    // link hub because this fetch failed.
    console.warn('[hydrax] could not load link hub content; showing static links', error);
  } finally {
    document.dispatchEvent(new CustomEvent('hydrax:content-ready'));
  }
}

loadContent();
