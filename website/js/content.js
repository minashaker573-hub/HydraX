/**
 * HYDRAX website — CMS content loader.
 *
 * Fetches the published content from `/api/v1/website-content` (the one
 * public, unauthenticated read the CMS exposes — see
 * backend/src/routes/website-content.ts) and fills in every element already
 * marked in this page with a `data-field*` attribute. It never invents
 * markup for those: every element it can touch already exists in the static
 * HTML, with the exact copy a visitor sees if this file never runs at all —
 * this only *updates* text/attributes, and only ever via `textContent` /
 * `setAttribute`, never `innerHTML`. That is what keeps an admin's typed
 * content from ever becoming markup: there is no code path here that parses
 * a string as HTML.
 *
 * `data-field-list` containers are the one exception to "never build new
 * elements" — those hold a small, fixed-shape repeating list (nav items,
 * hero points, the 3 how-steps, etc.) that the backend itself bounds in size
 * and shape (see domain/website-content.ts's requireBoundedArray /
 * requireFixedTuple). Rebuilding their children is still done element by
 * element with textContent, never a parsed HTML string.
 *
 * On any failure (network error, non-200, malformed body) this does nothing
 * further and leaves the static fallback content exactly as it was — the
 * page must never go blank or broken because the CMS could not be reached.
 */

import { getLang, applyDocumentDirection, onLangChange, wireLangToggle } from './i18n.js';

const CONTENT_URL = '/api/v1/website-content';

/** en, with ar shown instead when the current language is Arabic and an
 *  Arabic value has actually been entered — the same fallback rule the
 *  dashboard's i18n already uses. */
function localizedText(value) {
  if (!value || typeof value !== 'object') return '';
  if (getLang() === 'ar' && typeof value.ar === 'string' && value.ar.trim() !== '') return value.ar;
  return typeof value.en === 'string' ? value.en : '';
}

/** Resolves a dotted/indexed path ("field.gallery.0.image") against the
 *  fetched `sections` object. Returns undefined for anything not present —
 *  callers all treat that as "leave the static fallback alone". */
function get(root, path) {
  return path.split('.').reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), root);
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/* ------------------------------------------------------- simple fields -- */

function renderSimpleFields(sections) {
  for (const el of document.querySelectorAll('[data-field]')) {
    const value = get(sections, el.dataset.field);
    if (value && typeof value === 'object') el.textContent = localizedText(value);
  }
  for (const el of document.querySelectorAll('[data-field-href]')) {
    const value = get(sections, el.dataset.fieldHref);
    if (typeof value === 'string' && value) el.setAttribute('href', value);
  }
  for (const el of document.querySelectorAll('[data-field-src]')) {
    const value = get(sections, el.dataset.fieldSrc);
    if (typeof value === 'string' && value) el.setAttribute('src', value);
  }
  for (const el of document.querySelectorAll('[data-field-alt]')) {
    const value = get(sections, el.dataset.fieldAlt);
    if (value && typeof value === 'object') el.setAttribute('alt', localizedText(value));
  }
}

/* ------------------------------------------------------------- lists -- */

function buildNavItems(container, items) {
  clearChildren(container);
  for (const item of items) {
    if (item && item.visible === false) continue;
    const a = document.createElement('a');
    a.href = typeof item.href === 'string' ? item.href : '#top';
    a.textContent = localizedText(item.label);
    container.appendChild(a);
  }
}

function buildTextItems(container, tag, items) {
  clearChildren(container);
  for (const item of items) {
    const el = document.createElement(tag);
    el.textContent = localizedText(item);
    container.appendChild(el);
  }
}

function buildHowSteps(container, steps) {
  clearChildren(container);
  steps.forEach((step, index) => {
    const li = document.createElement('li');
    li.className = 'works-step';

    const num = document.createElement('span');
    num.className = 'works-step-num';
    num.textContent = String(index + 1);
    li.appendChild(num);

    const body = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.textContent = localizedText(step.title);
    body.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = localizedText(step.description);
    body.appendChild(p);

    const detail = localizedText(step.detail);
    if (detail) {
      const detailEl = document.createElement('p');
      detailEl.className = 'works-step-detail';
      detailEl.textContent = detail;
      body.appendChild(detailEl);
    }

    li.appendChild(body);
    container.appendChild(li);
  });
}

function buildCapabilityItems(container, items) {
  clearChildren(container);
  for (const item of items) {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = localizedText(item.label);
    li.appendChild(strong);
    li.appendChild(document.createTextNode(localizedText(item.description)));
    container.appendChild(li);
  }
}

function buildBenefitItems(container, items) {
  clearChildren(container);
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'benefit-row';
    const h3 = document.createElement('h3');
    h3.textContent = localizedText(item.title);
    const p = document.createElement('p');
    p.textContent = localizedText(item.description);
    row.appendChild(h3);
    row.appendChild(p);
    container.appendChild(row);
  }
}

/** Human labels for the fixed status enum — these are UI chrome, not
 *  admin-authored text, the same way a button's icon isn't; the admin picks
 *  a status VALUE, this file supplies its label. See
 *  domain/website-content.ts's CONTENT_STATUSES for the source of truth. */
const STATUS_LABELS = {
  VERIFIED: { en: 'Verified', ar: '' },
  SOFTWARE_VERIFIED: { en: 'Software verified', ar: '' },
  IN_PROGRESS: { en: 'In progress', ar: '' },
  PLANNED: { en: 'Planned', ar: '' },
  PENDING_HARDWARE_VALIDATION: { en: 'Pending hardware validation', ar: '' },
  NOT_IMPLEMENTED: { en: 'Not implemented', ar: '' },
};

function statusModifierClass(status) {
  return `is-${String(status).toLowerCase().replace(/_/g, '-')}`;
}

function buildStatusBadges(container, badges) {
  clearChildren(container);
  container.hidden = badges.length === 0;
  for (const badge of badges) {
    const li = document.createElement('li');
    li.className = `status-badge ${statusModifierClass(badge.status)}`;
    const label = STATUS_LABELS[badge.status];
    const title = localizedText(badge.title);
    li.textContent = label ? `${title} — ${localizedText(label)}` : title;
    container.appendChild(li);
  }
}

function buildStats(container, stats) {
  clearChildren(container);
  for (const stat of stats) {
    const item = document.createElement('div');
    item.className = 'verify-item';
    const dt = document.createElement('dt');
    dt.dataset.countUp = String(stat.value);
    dt.textContent = '0';
    const dd = document.createElement('dd');
    dd.textContent = localizedText(stat.label);
    item.appendChild(dt);
    item.appendChild(dd);
    container.appendChild(item);
  }
}

const LIST_BUILDERS = {
  'navigation.items': buildNavItems,
  'footer.links': buildNavItems,
  'hero.points': (el, items) => buildTextItems(el, 'li', items),
  'problem.paragraphs': (el, items) => buildTextItems(el, 'p', items),
  'how.steps': buildHowSteps,
  'product.capabilityItems': buildCapabilityItems,
  'benefits.items': buildBenefitItems,
  'field.statusBadges': buildStatusBadges,
  'field.stats': buildStats,
};

function renderLists(sections) {
  let navRebuilt = false;
  for (const container of document.querySelectorAll('[data-field-list]')) {
    const key = container.dataset.fieldList;
    const builder = LIST_BUILDERS[key];
    const value = get(sections, key);
    if (!builder || !Array.isArray(value)) continue;
    builder(container, value);
    if (key === 'navigation.items') navRebuilt = true;
  }
  // js/site.js's active-section highlighting binds to whichever anchors are
  // actually in #nav-links — it needs to know they were just replaced (this
  // runs on every load, language switch and reorder, not only a genuine nav
  // edit, but re-binding is cheap and idempotent).
  if (navRebuilt) document.dispatchEvent(new CustomEvent('hydrax:nav-updated'));
}

/* ------------------------------------------------------------ contact -- */

// Not generic data-field targets: the visible text and the href are both
// derived from one CMS value each (email, phone), not two independent
// fields — see website-content-seed.ts's note on why phone is one value for
// both.
function renderContact(sections) {
  const contact = sections.contact;
  if (!contact) return;

  const emailEl = document.getElementById('contact-email');
  if (emailEl && typeof contact.email === 'string' && contact.email) {
    emailEl.textContent = contact.email;
    emailEl.setAttribute('href', `mailto:${contact.email}`);
  }

  const phoneEl = document.getElementById('contact-phone');
  if (phoneEl && typeof contact.phone === 'string' && contact.phone) {
    phoneEl.textContent = contact.phone;
    const dialable = contact.phone.replace(/[^\d+]/g, '');
    phoneEl.setAttribute('href', `tel:${dialable}`);
  }
}

/* ----------------------------------------------------------------- seo -- */

function setMetaContent(selector, value) {
  if (!value) return;
  const el = document.querySelector(selector);
  if (el) el.setAttribute('content', value);
}

function renderSeo(sections) {
  const seo = sections.seo;
  if (!seo) return;

  const title = localizedText(seo.siteTitle);
  if (title) document.title = title;

  const description = localizedText(seo.metaDescription);
  setMetaContent('meta[name="description"]', description);

  const ogTitle = localizedText(seo.ogTitle) || title;
  const ogDescription = localizedText(seo.ogDescription);
  setMetaContent('meta[property="og:title"]', ogTitle);
  setMetaContent('meta[property="og:description"]', ogDescription);
  setMetaContent('meta[name="twitter:title"]', ogTitle);
  setMetaContent('meta[name="twitter:description"]', ogDescription);

  // The static og:image (an SVG) stays as-is unless a raster replacement has
  // actually been uploaded and set — see website-content-seed.ts's note.
  if (typeof seo.ogImage === 'string' && seo.ogImage) {
    setMetaContent('meta[property="og:image"]', seo.ogImage);
    setMetaContent('meta[name="twitter:image"]', seo.ogImage);
  }
}

/* ------------------------------------------------------- section order -- */

// Only the five middle sections are reorderable — see
// REORDERABLE_SECTION_IDS in domain/website-content.ts. Hero, nav and
// contact are structural chrome and never move.
function renderSectionOrder(sections) {
  const cfg = sections.sections;
  const main = document.getElementById('main');
  const contactSection = document.getElementById('contact');
  if (!cfg || !Array.isArray(cfg.order) || !(main instanceof HTMLElement) || !contactSection) return;

  for (const id of cfg.order) {
    const section = document.getElementById(id);
    if (!section) continue;
    // Inserting each id, in order, directly before the fixed `contact`
    // anchor leaves them in exactly `cfg.order`'s sequence once every id has
    // been placed, and `contact` itself never moves.
    main.insertBefore(section, contactSection);
    section.hidden = cfg.enabled ? cfg.enabled[id] === false : false;
  }

  // The decorative hero -> content divider (id="field-line-divider") is a
  // transition into "whatever section comes first," not a fixed pairing
  // with whichever section happened to be first in the original markup —
  // it has to move (or hide) with the reorder, not stay stranded wherever
  // it was hardcoded. Re-derived from the live DOM each time, from the
  // actual current order/enabled state, never from a remembered position.
  const divider = document.getElementById('field-line-divider');
  if (divider) {
    const firstVisibleId = cfg.order.find((id) => !(cfg.enabled && cfg.enabled[id] === false));
    const firstVisible = firstVisibleId ? document.getElementById(firstVisibleId) : null;
    if (firstVisible) {
      main.insertBefore(divider, firstVisible);
      divider.hidden = false;
    } else {
      // Every reorderable section is hidden — nothing for the divider to
      // introduce, so it hides too rather than sitting directly in front
      // of the contact section with no content between them and the hero.
      divider.hidden = true;
    }
  }
}

/* -------------------------------------------------------------- settings -- */

function renderSettings(sections) {
  const settings = sections.settings;
  if (!settings || typeof settings.logo !== 'string' || !settings.logo) return;
  // The nav/footer brand images are ordinary data-field-src targets,
  // handled by renderSimpleFields already — this only covers the favicon
  // <link>, which isn't an <img> and so isn't part of that generic pass.
  const favicon = document.getElementById('site-favicon');
  if (favicon) favicon.setAttribute('href', settings.logo);
}

/* ---------------------------------------------------------------- main -- */

let cachedSections = null;

/** Everything that depends on which language is showing — safe to re-run
 *  every time the visitor switches language, without re-fetching. */
function renderLocalized(sections) {
  renderSimpleFields(sections);
  renderLists(sections);
  renderContact(sections);
  renderSeo(sections);
}

applyDocumentDirection();
wireLangToggle();

onLangChange(() => {
  if (cachedSections) renderLocalized(cachedSections);
});

/* ------------------------------------------------------- admin preview -- */

// The admin CMS's Preview button embeds this exact page in an iframe and
// posts the in-progress draft to it — see admin/js/cms.js's openPreview().
// Draft content is never served over the network for this; it only ever
// reaches this page if something already embedding it (same origin, so
// already trusted — see the CSP's frame-ancestors 'self') chooses to send
// it. The banner below is this file's own static text, not admin content,
// so a visitor can never mistake a preview for the live site.
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

  showPreviewBanner();
  cachedSections = data.sections;
  renderSectionOrder(cachedSections);
  renderSettings(cachedSections);
  renderLocalized(cachedSections);
});

async function loadContent() {
  try {
    const response = await fetch(CONTENT_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`website-content responded ${response.status}`);
    const body = await response.json();
    if (!body || typeof body !== 'object' || !body.sections || typeof body.sections !== 'object') {
      throw new Error('website-content returned an unexpected shape');
    }

    cachedSections = body.sections;
    // Layout and site identity are applied once — neither is
    // language-dependent, and must not fight with a visitor toggling EN/AR.
    renderSectionOrder(cachedSections);
    renderSettings(cachedSections);
    renderLocalized(cachedSections);
  } catch (error) {
    // Leave every element exactly as the static HTML already has it. A
    // visitor never sees a broken page because this fetch failed; they see
    // the same content this file would otherwise have replaced it with.
    console.warn('[hydrax] could not load website content; showing static fallback content', error);
  } finally {
    // Fires whether the fetch succeeded or failed, so anything waiting on it
    // (see js/animations.js) never waits longer than it has to.
    document.dispatchEvent(new CustomEvent('hydrax:content-ready'));
  }
}

loadContent();
