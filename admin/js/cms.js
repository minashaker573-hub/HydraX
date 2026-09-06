/**
 * HYDRAX admin — website content management (CMS).
 *
 * Edits the CONTENT of the public site (text, images, section order) through
 * the fixed fields the backend already defines and validates — see
 * backend/src/domain/website-content.ts. This file never builds a page out
 * of free-form blocks and never renders admin-entered text as markup: every
 * value here is read into a plain JS object and sent as JSON, and every
 * value shown back is written with textContent, exactly like admin.js
 * already does for quote requests. There is no code path here that parses a
 * string as HTML.
 *
 * The operator key lives in the same sessionStorage slot admin.js already
 * uses — this file never persists it anywhere else. It never uses
 * localStorage — see check.mjs's "credential handling" checks, which this
 * file must keep passing exactly like admin.js does.
 */

const KEY_STORAGE = 'hydrax-admin-key';

function getAdminKey() {
  try {
    return sessionStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

/** A 401 here means the key admin.js already validated has since stopped
 *  working (revoked, server restarted with a new one, …) — reloading drops
 *  back to admin.js's own gate, the same place a brand-new tab starts. */
function forceReauth() {
  try {
    sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    /* private mode: nothing to clear */
  }
  window.location.reload();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: { ...(options.headers ?? {}), 'X-Admin-Key': getAdminKey() ?? '' },
  });
  if (response.status === 401) {
    forceReauth();
    throw new Error('unauthorized');
  }
  if (!response.ok) {
    let detail = null;
    try {
      detail = await response.json();
    } catch {
      /* body wasn't JSON (or was empty) — fall through to the generic message */
    }
    const error = new Error((detail && detail.error) || `HTTP ${response.status}`);
    error.errors = detail && Array.isArray(detail.errors) ? detail.errors : undefined;
    throw error;
  }
  return response.json();
}

async function uploadMedia(file, altText) {
  const response = await fetch('/api/v1/admin/media', {
    method: 'POST',
    headers: {
      'X-Admin-Key': getAdminKey() ?? '',
      'Content-Type': file.type,
      // Header values must be ASCII; percent-encoding keeps a non-ASCII
      // filename or alt text from being silently mangled or rejected. The
      // *rendered* alt text a visitor sees comes from a section's own
      // imageAlt field (a normal JSON value, no such restriction) — this
      // metadata is only for finding the file again in the picker below.
      'X-Original-Filename': encodeURIComponent(file.name || 'upload'),
      'X-Alt-Text': encodeURIComponent(altText || ''),
    },
    body: file,
  });
  if (response.status === 401) {
    forceReauth();
    throw new Error('unauthorized');
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error((detail && detail.error) || `upload failed (HTTP ${response.status})`);
  }
  return response.json();
}

function formatApiError(error) {
  if (error && Array.isArray(error.errors) && error.errors.length > 0) return error.errors.join(' · ');
  return (error && error.message) || 'Something went wrong.';
}

function formatDate(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toLocaleString();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ============================================================ constants == */

// Mirrors domain/website-content.ts's validateHref allowlist exactly — kept
// as a plain list here (not fetched from the server) so a broken network
// request can never leave this dropdown empty. The backend still re-checks
// every value on save regardless of what this list offers.
const HREF_OPTIONS = [
  { value: '#top', label: 'Top of page (#top)' },
  { value: '#problem', label: 'Field problem section (#problem)' },
  { value: '#how', label: 'How it works section (#how)' },
  { value: '#product', label: 'Product section (#product)' },
  { value: '#benefits', label: 'Benefits section (#benefits)' },
  { value: '#field', label: 'Built for the field section (#field)' },
  { value: '#contact', label: 'Contact section (#contact)' },
  { value: '/', label: 'Home page (/)' },
  { value: '/request', label: 'Request a system (/request)' },
  { value: '/dashboard', label: 'Live dashboard (/dashboard)' },
  { value: '/privacy', label: 'Privacy policy (/privacy)' },
  { value: '/terms', label: 'Terms (/terms)' },
];

// The photos the site already shipped with, before the CMS existed — kept
// selectable so "go back to the original photo" never requires a re-upload.
// See website-content-seed.ts, which these are transcribed from.
const SEED_IMAGES = [
  { value: '/assets/logo.jpeg', label: 'Original — site logo' },
  { value: '/assets/hero-field-canal.jpg', label: 'Original — hero field canal' },
  { value: '/assets/field-problem-aerial.jpg', label: 'Original — field problem aerial' },
  { value: '/assets/water-droplet-leaf.jpg', label: 'Original — water droplet on leaf' },
  { value: '/dashboard-preview.png', label: 'Original — dashboard preview capture' },
  { value: '/assets/crop-rows-sunset.jpg', label: 'Original — crop rows at sunset' },
  { value: '/assets/irrigation-sprinkler.jpg', label: 'Original — irrigation sprinkler' },
];

// Mirrors CONTENT_STATUSES in domain/website-content.ts. An admin picks one
// of these values; the label is UI chrome this file supplies, the same way
// js/content.js's STATUS_LABELS does for the public page.
const STATUS_OPTIONS = [
  'VERIFIED',
  'SOFTWARE_VERIFIED',
  'IN_PROGRESS',
  'PLANNED',
  'PENDING_HARDWARE_VALIDATION',
  'NOT_IMPLEMENTED',
];
const STATUS_LABELS = {
  VERIFIED: 'Verified',
  SOFTWARE_VERIFIED: 'Software verified',
  IN_PROGRESS: 'In progress',
  PLANNED: 'Planned',
  PENDING_HARDWARE_VALIDATION: 'Pending hardware validation',
  NOT_IMPLEMENTED: 'Not implemented',
};

const REORDERABLE_IDS = ['problem', 'how', 'product', 'benefits', 'field'];

const SECTION_LABELS = {
  hero: 'Hero',
  navigation: 'Navigation',
  problem: 'Field problem',
  how: 'How it works',
  product: 'Product',
  benefits: 'Benefits',
  field: 'Built for the field',
  contact: 'Final CTA / contact',
  footer: 'Footer',
  seo: 'SEO',
  sections: 'Homepage section order',
  settings: 'Site settings',
};

// The left-hand nav's order. 'media' and 'publishing' aren't website-content
// sections themselves (media is its own store; publishing covers the
// 'sections' content plus every section's publish status) but sit alongside
// the real ones here because that's where an admin looks for them.
const NAV_ITEMS = [
  { id: 'hero', label: 'Hero' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'problem', label: 'Field problem' },
  { id: 'how', label: 'How it works' },
  { id: 'product', label: 'Product' },
  { id: 'benefits', label: 'Benefits' },
  { id: 'field', label: 'Built for the field' },
  { id: 'contact', label: 'Final CTA / contact' },
  { id: 'footer', label: 'Footer' },
  { id: 'seo', label: 'SEO' },
  { id: 'settings', label: 'Site settings' },
  { id: 'media', label: 'Media library' },
  { id: 'publishing', label: 'Sections & publishing' },
];

/**
 * One entry per real website-content section, describing exactly the
 * fields backend/src/domain/website-content.ts already validates — the
 * bounds here (maxLen, min/max item counts, fixed) are transcribed from
 * that file's validators so the form's own limits match what the server
 * will actually accept. The server re-checks all of it regardless; this
 * only keeps the form from offering something guaranteed to be rejected.
 */
const SECTION_SCHEMA = {
  hero: [
    { key: 'eyebrow', label: 'Eyebrow', kind: 'localized', maxLen: 60 },
    { key: 'headline', label: 'Headline', kind: 'localized', maxLen: 140 },
    { key: 'description', label: 'Description', kind: 'localized', maxLen: 500, textarea: true },
    { key: 'primaryCtaLabel', label: 'Button label', kind: 'localized', maxLen: 40 },
    { key: 'primaryCtaHref', label: 'Button link', kind: 'href' },
    { key: 'heroImage', label: 'Hero photo', kind: 'image' },
    { key: 'heroImageAlt', label: 'Hero photo alt text', kind: 'localized', maxLen: 200 },
    { key: 'points', label: 'Points', kind: 'localizedList', min: 1, max: 5, itemMaxLen: 100, itemLabel: 'point' },
  ],
  navigation: [
    {
      key: 'items', label: 'Nav links', kind: 'objectList', min: 1, max: 7, itemLabel: 'link',
      itemFields: [
        { key: 'label', label: 'Label', kind: 'localized', maxLen: 40 },
        { key: 'href', label: 'Link', kind: 'href' },
        { key: 'visible', label: 'Visible', kind: 'boolean' },
      ],
    },
    { key: 'dashboardCtaLabel', label: 'Dashboard link label', kind: 'localized', maxLen: 40 },
    { key: 'primaryCtaLabel', label: 'Primary button label', kind: 'localized', maxLen: 40 },
  ],
  problem: [
    { key: 'eyebrow', label: 'Eyebrow', kind: 'localized', maxLen: 60 },
    { key: 'pullQuote', label: 'Pull quote', kind: 'localized', maxLen: 160 },
    {
      key: 'paragraphs', label: 'Paragraphs', kind: 'localizedList', min: 1, max: 4,
      itemMaxLen: 700, textarea: true, itemLabel: 'paragraph',
    },
    { key: 'image', label: 'Photo', kind: 'image' },
    { key: 'imageAlt', label: 'Photo alt text', kind: 'localized', maxLen: 200 },
  ],
  how: [
    { key: 'eyebrow', label: 'Eyebrow', kind: 'localized', maxLen: 60 },
    { key: 'headline', label: 'Headline', kind: 'localized', maxLen: 140 },
    { key: 'intro', label: 'Intro', kind: 'localized', maxLen: 300, textarea: true },
    {
      key: 'steps', label: 'Steps', kind: 'objectList', fixed: true, min: 3, max: 3, itemLabel: 'step',
      itemFields: [
        { key: 'title', label: 'Title', kind: 'localized', maxLen: 60 },
        { key: 'description', label: 'Description', kind: 'localized', maxLen: 400, textarea: true },
        { key: 'detail', label: 'Detail line (optional)', kind: 'localized', maxLen: 100 },
      ],
    },
    { key: 'accentImage', label: 'Accent photo', kind: 'image' },
    { key: 'accentImageAlt', label: 'Accent photo alt text', kind: 'localized', maxLen: 200 },
    { key: 'accentCaption', label: 'Accent caption', kind: 'localized', maxLen: 160 },
  ],
  product: [
    { key: 'eyebrow', label: 'Eyebrow', kind: 'localized', maxLen: 60 },
    { key: 'headline', label: 'Headline', kind: 'localized', maxLen: 140 },
    { key: 'lede', label: 'Lede', kind: 'localized', maxLen: 400, textarea: true },
    { key: 'dashboardImage', label: 'Dashboard screenshot', kind: 'image' },
    { key: 'captionTitle', label: 'Caption title', kind: 'localized', maxLen: 60 },
    { key: 'captionDetail', label: 'Caption detail', kind: 'localized', maxLen: 160 },
    {
      key: 'capabilityItems', label: 'Capability list', kind: 'objectList', min: 3, max: 8, itemLabel: 'item',
      itemFields: [
        { key: 'label', label: 'Label', kind: 'localized', maxLen: 40 },
        { key: 'description', label: 'Description', kind: 'localized', maxLen: 200, textarea: true },
      ],
    },
  ],
  benefits: [
    { key: 'eyebrow', label: 'Eyebrow', kind: 'localized', maxLen: 60 },
    { key: 'headline', label: 'Headline', kind: 'localized', maxLen: 140 },
    { key: 'lede', label: 'Lede', kind: 'localized', maxLen: 400, textarea: true },
    {
      key: 'items', label: 'Benefits', kind: 'objectList', min: 3, max: 8, itemLabel: 'benefit',
      itemFields: [
        { key: 'title', label: 'Title', kind: 'localized', maxLen: 40 },
        { key: 'description', label: 'Description', kind: 'localized', maxLen: 300, textarea: true },
      ],
    },
  ],
  field: [
    { key: 'eyebrow', label: 'Eyebrow', kind: 'localized', maxLen: 60 },
    { key: 'headline', label: 'Headline', kind: 'localized', maxLen: 140 },
    { key: 'lede', label: 'Lede', kind: 'localized', maxLen: 500, textarea: true },
    {
      key: 'gallery', label: 'Gallery photos', kind: 'objectList', fixed: true, min: 2, max: 2, itemLabel: 'photo',
      itemFields: [
        { key: 'image', label: 'Photo', kind: 'image' },
        { key: 'imageAlt', label: 'Alt text', kind: 'localized', maxLen: 200 },
        { key: 'caption', label: 'Caption', kind: 'localized', maxLen: 80 },
      ],
    },
    {
      key: 'statusBadges', label: 'Status badges', kind: 'objectList', min: 0, max: 6, itemLabel: 'badge',
      itemFields: [
        { key: 'title', label: 'Title', kind: 'localized', maxLen: 40 },
        { key: 'status', label: 'Status', kind: 'enum', options: STATUS_OPTIONS },
      ],
    },
    {
      key: 'stats', label: 'Verification numbers', kind: 'objectList', min: 2, max: 6, itemLabel: 'stat',
      itemFields: [
        { key: 'value', label: 'Number', kind: 'number', min: 0, max: 1000000 },
        { key: 'label', label: 'Label', kind: 'localized', maxLen: 60 },
      ],
    },
    { key: 'statsNote', label: 'Numbers footnote', kind: 'localized', maxLen: 200, textarea: true },
  ],
  contact: [
    { key: 'eyebrow', label: 'Eyebrow', kind: 'localized', maxLen: 60 },
    { key: 'headline', label: 'Headline', kind: 'localized', maxLen: 140 },
    { key: 'lede', label: 'Lede', kind: 'localized', maxLen: 300, textarea: true },
    { key: 'ctaLabel', label: 'Button label', kind: 'localized', maxLen: 40 },
    { key: 'ctaHref', label: 'Button link', kind: 'href' },
    { key: 'email', label: 'Email address', kind: 'text', maxLen: 120 },
    { key: 'phone', label: 'Phone (shown and dialled as-is)', kind: 'text', maxLen: 40 },
    { key: 'location', label: 'Location', kind: 'localized', maxLen: 80 },
  ],
  footer: [
    { key: 'tagline', label: 'Tagline', kind: 'localized', maxLen: 80 },
    {
      key: 'links', label: 'Footer links', kind: 'objectList', min: 1, max: 12, itemLabel: 'link',
      itemFields: [
        { key: 'label', label: 'Label', kind: 'localized', maxLen: 40 },
        { key: 'href', label: 'Link', kind: 'href' },
        { key: 'visible', label: 'Visible', kind: 'boolean' },
      ],
    },
    { key: 'legalText', label: 'Legal / measurement note', kind: 'localized', maxLen: 600, textarea: true },
    { key: 'photoCreditsText', label: 'Photo credits', kind: 'localized', maxLen: 500, textarea: true },
  ],
  settings: [
    { key: 'logo', label: 'Site logo / identity image', kind: 'image' },
    { key: 'defaultCtaLabel', label: 'Default CTA label', kind: 'localized', maxLen: 40 },
    { key: 'defaultCtaHref', label: 'Default CTA link', kind: 'href' },
    { key: 'stickyCtaText', label: 'Mobile sticky-bar headline', kind: 'localized', maxLen: 160 },
  ],
  seo: [
    { key: 'siteTitle', label: 'Site title', kind: 'localized', maxLen: 70 },
    { key: 'metaDescription', label: 'Meta description', kind: 'localized', maxLen: 160, textarea: true },
    { key: 'ogTitle', label: 'Social share title', kind: 'localized', maxLen: 70 },
    { key: 'ogDescription', label: 'Social share description', kind: 'localized', maxLen: 200, textarea: true },
    { key: 'ogImage', label: 'Social share image (optional)', kind: 'image', optional: true },
  ],
};

const ALL_CONTENT_IDS = [
  'hero', 'navigation', 'problem', 'how', 'product', 'benefits', 'field', 'contact', 'footer', 'seo', 'sections',
  'settings',
];

/* ============================================================ state ===== */

let adminContent = null; // { sections: { [id]: {draft, published, updated_at, published_at, has_unpublished_changes} } }
let mediaCache = null; // media library rows, loaded lazily
let workingSection = null; // id of the section object currently backing the open form (or 'sections')
let workingDraft = null; // the in-progress edit, not yet necessarily saved
let editorLang = 'en';
let currentMessageBox = null;

/* ============================================================ dom ======= */

const navTabs = document.getElementById('admin-tabs');
const panelRequests = document.getElementById('panel-requests');
const panelCms = document.getElementById('panel-cms');
const cmsNav = document.getElementById('cms-nav');
const editorEl = document.getElementById('cms-editor');
const previewOpenBtn = document.getElementById('cms-preview-open');
const previewOverlay = document.getElementById('cms-preview');
const previewFrame = document.getElementById('cms-preview-frame');
const previewCloseBtn = document.getElementById('cms-preview-close');

/* ============================================================ tabs ====== */

if (navTabs) {
  navTabs.addEventListener('click', (event) => {
    const target = event.target;
    const button = target instanceof HTMLElement ? target.closest('.tab') : null;
    if (!(button instanceof HTMLElement) || !button.dataset.tab) return;

    for (const tab of navTabs.querySelectorAll('.tab')) {
      const isActive = tab === button;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    }
    panelRequests.hidden = button.dataset.tab !== 'requests';
    panelCms.hidden = button.dataset.tab !== 'cms';

    if (button.dataset.tab === 'cms' && adminContent === null) void initCms();
  });
}

/* ============================================================ boot ====== */

function buildNav() {
  cmsNav.replaceChildren();
  for (const item of NAV_ITEMS) {
    const button = el('button', 'cms-nav-item', item.label);
    button.type = 'button';
    button.dataset.section = item.id;
    button.addEventListener('click', () => void selectSection(item.id));
    cmsNav.appendChild(button);
  }
}

async function initCms() {
  buildNav();
  editorEl.replaceChildren(el('p', 'cms-placeholder', 'Loading…'));
  try {
    adminContent = await api('/api/v1/admin/website-content');
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') return;
    editorEl.replaceChildren(el('p', 'cms-placeholder', `Could not load website content: ${formatApiError(error)}`));
    adminContent = null;
  }
}

async function ensureMediaLoaded() {
  if (mediaCache !== null) return;
  try {
    const result = await api('/api/v1/admin/media');
    mediaCache = result.media;
  } catch {
    mediaCache = [];
  }
}

function markActiveNav(id) {
  for (const button of cmsNav.querySelectorAll('.cms-nav-item')) {
    button.classList.toggle('is-active', button.dataset.section === id);
  }
}

async function selectSection(id) {
  markActiveNav(id);
  if (adminContent === null) {
    try {
      adminContent = await api('/api/v1/admin/website-content');
    } catch {
      return;
    }
  }
  if (id === 'media') await renderMediaPanel();
  else if (id === 'publishing') await renderPublishingPanel();
  else await renderContentEditor(id);
}

/* ============================================================ messages == */

function showEditorMessage(text, kind) {
  if (!currentMessageBox) return;
  currentMessageBox.textContent = text;
  currentMessageBox.className = `cms-message is-${kind}`;
  currentMessageBox.hidden = false;
}

function clearEditorMessage() {
  if (currentMessageBox) currentMessageBox.hidden = true;
}

/* ============================================================ language == */

function applyLangVisibility() {
  for (const node of editorEl.querySelectorAll('.lang-field')) {
    node.hidden = node.dataset.lang !== editorLang;
  }
}

function buildLangBar() {
  const bar = el('div', 'cms-lang-bar');
  const enBtn = el('button', 'lang-tab is-active', 'ENGLISH');
  enBtn.type = 'button';
  enBtn.dataset.lang = 'en';
  const arBtn = el('button', 'lang-tab', 'العربية');
  arBtn.type = 'button';
  arBtn.dataset.lang = 'ar';

  for (const button of [enBtn, arBtn]) {
    button.addEventListener('click', () => {
      editorLang = button.dataset.lang;
      enBtn.classList.toggle('is-active', editorLang === 'en');
      arBtn.classList.toggle('is-active', editorLang === 'ar');
      applyLangVisibility();
    });
  }

  bar.appendChild(enBtn);
  bar.appendChild(arBtn);
  return bar;
}

/* ============================================================ fields ==== */

function buildLocalizedPair(value, opts = {}) {
  const box = el('div', 'localized-box');
  for (const lang of ['en', 'ar']) {
    const control = opts.textarea ? el('textarea') : el('input');
    if (!opts.textarea) control.type = 'text';
    control.value = value[lang] ?? '';
    if (opts.maxLen) control.maxLength = opts.maxLen;
    control.className = 'lang-field';
    control.dataset.lang = lang;
    control.placeholder = lang === 'ar' ? 'العربية — اختياري إذا لم تُترجم بعد' : 'English';
    control.addEventListener('input', () => {
      value[lang] = control.value;
    });
    box.appendChild(control);
  }
  return box;
}

function buildSelect(options, currentValue, onChange) {
  const select = el('select');
  const known = options.some((option) => option.value === currentValue);
  if (!known && currentValue) {
    const stray = el('option', null, `${currentValue} (current)`);
    stray.value = currentValue;
    stray.selected = true;
    select.appendChild(stray);
  }
  for (const option of options) {
    const node = el('option', null, option.label);
    node.value = option.value;
    if (option.value === currentValue) node.selected = true;
    select.appendChild(node);
  }
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function buildImagePicker(obj, desc) {
  const box = el('div', 'image-field');

  const preview = document.createElement('img');
  preview.className = 'image-preview';
  preview.alt = '';
  const syncPreview = () => {
    preview.src = obj[desc.key] || '';
    preview.hidden = !obj[desc.key];
  };
  syncPreview();

  const options = [
    ...(desc.optional ? [{ value: '', label: '(none — use the site default)' }] : []),
    ...SEED_IMAGES,
    ...(mediaCache || []).map((media) => ({ value: media.url, label: `Uploaded — ${media.original_name}` })),
  ];
  const select = buildSelect(options, obj[desc.key], (value) => {
    obj[desc.key] = value;
    syncPreview();
  });

  const uploadWrap = el('label', 'image-upload');
  uploadWrap.appendChild(document.createTextNode('Upload new image'));
  const uploadInput = document.createElement('input');
  uploadInput.type = 'file';
  uploadInput.accept = 'image/jpeg,image/png,image/webp';
  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files && uploadInput.files[0];
    if (!file) return;
    try {
      const media = await uploadMedia(file, '');
      mediaCache = [...(mediaCache || []), media];
      const option = el('option', null, `Uploaded — ${media.original_name}`);
      option.value = media.url;
      option.selected = true;
      select.appendChild(option);
      obj[desc.key] = media.url;
      syncPreview();
    } catch (error) {
      showEditorMessage(formatApiError(error), 'error');
    } finally {
      uploadInput.value = '';
    }
  });
  uploadWrap.appendChild(uploadInput);

  box.appendChild(preview);
  box.appendChild(select);
  box.appendChild(uploadWrap);
  return box;
}

function blankFor(desc) {
  switch (desc.kind) {
    case 'localized': return { en: '', ar: '' };
    case 'href': return HREF_OPTIONS[0].value;
    case 'image': return desc.optional ? '' : SEED_IMAGES[0].value;
    case 'number': return desc.min ?? 0;
    case 'boolean': return true;
    case 'enum': return (desc.options || [])[0] ?? '';
    default: return '';
  }
}

function blankObjectItem(itemFields) {
  const obj = {};
  for (const field of itemFields) obj[field.key] = blankFor(field);
  return obj;
}

function blankSection(id) {
  const fields = SECTION_SCHEMA[id] || [];
  const obj = {};
  for (const field of fields) {
    if (field.kind === 'localizedList') {
      obj[field.key] = Array.from({ length: field.min ?? 1 }, () => ({ en: '', ar: '' }));
    } else if (field.kind === 'objectList') {
      const length = field.fixed ? field.max : Math.max(field.min ?? 1, 1);
      obj[field.key] = Array.from({ length }, () => blankObjectItem(field.itemFields));
    } else {
      obj[field.key] = blankFor(field);
    }
  }
  return obj;
}

function buildField(obj, desc) {
  const wrap = el('div', `field field-${desc.kind}`);
  wrap.appendChild(el('label', 'field-label', desc.label));

  switch (desc.kind) {
    case 'localized':
      wrap.appendChild(buildLocalizedPair(obj[desc.key] || (obj[desc.key] = { en: '', ar: '' }), {
        maxLen: desc.maxLen, textarea: desc.textarea,
      }));
      break;
    case 'href':
      wrap.appendChild(buildSelect(HREF_OPTIONS, obj[desc.key], (value) => { obj[desc.key] = value; }));
      break;
    case 'image':
      wrap.appendChild(buildImagePicker(obj, desc));
      break;
    case 'text': {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = obj[desc.key] ?? '';
      if (desc.maxLen) input.maxLength = desc.maxLen;
      input.addEventListener('input', () => { obj[desc.key] = input.value; });
      wrap.appendChild(input);
      break;
    }
    case 'number': {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(desc.min ?? 0);
      input.max = String(desc.max ?? 1000000);
      input.value = String(obj[desc.key] ?? desc.min ?? 0);
      input.addEventListener('input', () => {
        const parsed = Number(input.value);
        obj[desc.key] = Number.isFinite(parsed) ? parsed : 0;
      });
      wrap.appendChild(input);
      break;
    }
    case 'boolean': {
      const label = el('label', 'boolean-field');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(obj[desc.key]);
      input.addEventListener('change', () => { obj[desc.key] = input.checked; });
      label.appendChild(input);
      label.appendChild(document.createTextNode('Visible'));
      wrap.appendChild(label);
      break;
    }
    case 'enum': {
      const options = (desc.options || []).map((value) => ({ value, label: STATUS_LABELS[value] ?? value }));
      wrap.appendChild(buildSelect(options, obj[desc.key], (value) => { obj[desc.key] = value; }));
      break;
    }
    case 'localizedList':
    case 'objectList':
      return buildArrayField(obj, desc);
    default:
      break;
  }
  return wrap;
}

function buildArrayField(obj, desc) {
  const wrap = el('div', 'field field-array');
  wrap.appendChild(el('label', 'field-label', desc.label));

  const itemsBox = el('div', 'array-items');
  wrap.appendChild(itemsBox);

  function renderItems() {
    itemsBox.replaceChildren();
    const items = obj[desc.key];

    items.forEach((item, index) => {
      const card = el('div', 'array-item');
      const body = el('div', 'array-item-body');

      if (desc.kind === 'objectList') {
        for (const field of desc.itemFields) body.appendChild(buildField(item, field));
      } else {
        body.appendChild(buildLocalizedPair(item, { maxLen: desc.itemMaxLen, textarea: desc.textarea }));
      }
      card.appendChild(body);

      const controls = el('div', 'array-item-controls');
      const upBtn = el('button', 'icon-btn', '↑');
      upBtn.type = 'button';
      upBtn.title = 'Move up';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', () => {
        [items[index - 1], items[index]] = [items[index], items[index - 1]];
        renderItems();
        applyLangVisibility();
      });

      const downBtn = el('button', 'icon-btn', '↓');
      downBtn.type = 'button';
      downBtn.title = 'Move down';
      downBtn.disabled = index === items.length - 1;
      downBtn.addEventListener('click', () => {
        [items[index], items[index + 1]] = [items[index + 1], items[index]];
        renderItems();
        applyLangVisibility();
      });

      controls.appendChild(upBtn);
      controls.appendChild(downBtn);

      if (!desc.fixed && items.length > (desc.min ?? 0)) {
        const removeBtn = el('button', 'icon-btn icon-btn-danger', '✕');
        removeBtn.type = 'button';
        removeBtn.title = 'Remove';
        removeBtn.addEventListener('click', () => {
          items.splice(index, 1);
          renderItems();
          applyLangVisibility();
        });
        controls.appendChild(removeBtn);
      }

      card.appendChild(controls);
      itemsBox.appendChild(card);
    });

    applyLangVisibility();
  }

  renderItems();

  if (!desc.fixed) {
    const addBtn = el('button', 'btn btn-outline btn-sm', `+ Add ${desc.itemLabel || 'item'}`);
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      const items = obj[desc.key];
      if (items.length >= (desc.max ?? Infinity)) return;
      items.push(desc.kind === 'objectList' ? blankObjectItem(desc.itemFields) : { en: '', ar: '' });
      renderItems();
    });
    wrap.appendChild(addBtn);
  }

  wrap.appendChild(el(
    'span', 'field-hint',
    desc.fixed
      ? `Exactly ${desc.max} ${desc.itemLabel || 'items'} — fixed by this section's layout`
      : `${desc.min ?? 0}–${desc.max} ${desc.itemLabel || 'items'}`,
  ));

  return wrap;
}

/* ============================================================ save/publish */

async function putDraft(id, data) {
  const result = await api(`/api/v1/admin/website-content/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const entry = adminContent.sections[id];
  entry.draft = result.draft;
  entry.updated_at = result.updated_at;
  entry.has_unpublished_changes = JSON.stringify(result.draft) !== JSON.stringify(entry.published);
  return result;
}

async function postPublish(id) {
  const result = await api(`/api/v1/admin/website-content/${id}/publish`, { method: 'POST' });
  const entry = adminContent.sections[id];
  entry.published = deepClone(entry.draft);
  entry.published_at = result.published_at;
  entry.has_unpublished_changes = false;
  return result;
}

/* ============================================================ editor ==== */

async function renderContentEditor(id) {
  await ensureMediaLoaded();

  const entry = adminContent.sections[id];
  workingSection = id;
  // A stored draft/published row can predate a field the schema has since
  // gained (exactly what happened here: `footer.links` was added by the CMS
  // polish pass, and any footer saved before that has no `links` key at
  // all) — spreading the real content over a freshly-blanked skeleton fills
  // in only what's actually missing, so an older row never crashes this
  // form instead of just showing one field with sensible empty defaults.
  workingDraft = { ...blankSection(id), ...deepClone(entry.draft ?? entry.published ?? {}) };

  editorEl.replaceChildren();

  const header = el('div', 'cms-editor-header');
  header.appendChild(el('h2', null, SECTION_LABELS[id]));
  const status = el('div', 'cms-status');
  status.appendChild(el(
    'span', 'cms-status-item',
    entry.published_at ? `Published ${formatDate(entry.published_at)}` : 'Never published',
  ));
  status.appendChild(el(
    'span', 'cms-status-item',
    entry.updated_at ? `Draft saved ${formatDate(entry.updated_at)}` : 'No draft saved yet',
  ));
  status.appendChild(el(
    'span', `cms-status-pill ${entry.has_unpublished_changes ? 'is-pending' : 'is-clean'}`,
    entry.has_unpublished_changes ? 'Unpublished changes' : 'Draft matches live',
  ));
  header.appendChild(status);
  editorEl.appendChild(header);

  editorEl.appendChild(buildLangBar());

  const messageBox = el('div', 'cms-message');
  messageBox.hidden = true;
  editorEl.appendChild(messageBox);
  currentMessageBox = messageBox;

  const form = el('div', 'cms-form');
  for (const desc of SECTION_SCHEMA[id] || []) form.appendChild(buildField(workingDraft, desc));
  editorEl.appendChild(form);

  const actions = el('div', 'cms-actions');
  const saveBtn = el('button', 'btn btn-outline', 'Save draft');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    clearEditorMessage();
    try {
      await putDraft(id, workingDraft);
      showEditorMessage('Draft saved.', 'ok');
      await renderContentEditor(id);
    } catch (error) {
      if (error instanceof Error && error.message === 'unauthorized') return;
      showEditorMessage(formatApiError(error), 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  const publishBtn = el('button', 'btn btn-primary', 'Save & publish');
  publishBtn.type = 'button';
  publishBtn.addEventListener('click', async () => {
    publishBtn.disabled = true;
    clearEditorMessage();
    try {
      await putDraft(id, workingDraft);
      await postPublish(id);
      showEditorMessage('Saved and published — now live on the public site.', 'ok');
      await renderContentEditor(id);
    } catch (error) {
      if (error instanceof Error && error.message === 'unauthorized') return;
      showEditorMessage(formatApiError(error), 'error');
    } finally {
      publishBtn.disabled = false;
    }
  });

  actions.appendChild(saveBtn);
  actions.appendChild(publishBtn);
  editorEl.appendChild(actions);

  applyLangVisibility();
}

/* ============================================================ publishing */

async function renderPublishingPanel() {
  workingSection = null;
  editorEl.replaceChildren();
  editorEl.appendChild(el('h2', null, 'Sections & publishing'));

  const messageBox = el('div', 'cms-message');
  messageBox.hidden = true;
  editorEl.appendChild(messageBox);
  currentMessageBox = messageBox;

  editorEl.appendChild(el('h3', 'cms-subheading', 'Publish status'));
  const table = el('div', 'publish-table');
  for (const id of ALL_CONTENT_IDS) {
    const entry = adminContent.sections[id];
    const row = el('div', 'publish-row');
    row.appendChild(el('span', 'publish-row-name', SECTION_LABELS[id]));
    row.appendChild(el(
      'span', 'publish-row-meta',
      entry.published_at ? `live: ${formatDate(entry.published_at)}` : 'never published',
    ));
    row.appendChild(el(
      'span', `cms-status-pill ${entry.has_unpublished_changes ? 'is-pending' : 'is-clean'}`,
      entry.has_unpublished_changes ? 'Unpublished changes' : 'Up to date',
    ));
    const publishBtn = el('button', 'btn btn-outline btn-sm', 'Publish');
    publishBtn.type = 'button';
    publishBtn.disabled = !entry.draft;
    publishBtn.addEventListener('click', async () => {
      publishBtn.disabled = true;
      clearEditorMessage();
      try {
        await postPublish(id);
        await renderPublishingPanel();
      } catch (error) {
        if (error instanceof Error && error.message === 'unauthorized') return;
        showEditorMessage(formatApiError(error), 'error');
        publishBtn.disabled = false;
      }
    });
    row.appendChild(publishBtn);
    table.appendChild(row);
  }
  editorEl.appendChild(table);

  editorEl.appendChild(el('h3', 'cms-subheading', 'Homepage section order'));
  editorEl.appendChild(el(
    'p', 'field-hint',
    "Hero, navigation and the contact section always stay in place. Privacy, terms and the " +
      'request form are separate pages, not part of this order, and are not shown here.',
  ));

  const sectionsEntry = adminContent.sections.sections;
  workingSection = 'sections';
  workingDraft = deepClone(sectionsEntry.draft ?? sectionsEntry.published ?? {
    order: [...REORDERABLE_IDS],
    enabled: Object.fromEntries(REORDERABLE_IDS.map((id) => [id, true])),
  });

  const orderBox = el('div', 'array-items');

  function renderOrder() {
    orderBox.replaceChildren();
    workingDraft.order.forEach((id, index) => {
      const row = el('div', 'array-item order-item');
      row.appendChild(el('span', 'order-item-name', SECTION_LABELS[id] || id));

      const toggle = el('label', 'boolean-field');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = workingDraft.enabled[id] !== false;
      checkbox.addEventListener('change', () => { workingDraft.enabled[id] = checkbox.checked; });
      toggle.appendChild(checkbox);
      toggle.appendChild(document.createTextNode('Shown on page'));
      row.appendChild(toggle);

      const controls = el('div', 'array-item-controls');
      const upBtn = el('button', 'icon-btn', '↑');
      upBtn.type = 'button';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', () => {
        [workingDraft.order[index - 1], workingDraft.order[index]] =
          [workingDraft.order[index], workingDraft.order[index - 1]];
        renderOrder();
      });
      const downBtn = el('button', 'icon-btn', '↓');
      downBtn.type = 'button';
      downBtn.disabled = index === workingDraft.order.length - 1;
      downBtn.addEventListener('click', () => {
        [workingDraft.order[index], workingDraft.order[index + 1]] =
          [workingDraft.order[index + 1], workingDraft.order[index]];
        renderOrder();
      });
      controls.appendChild(upBtn);
      controls.appendChild(downBtn);
      row.appendChild(controls);

      orderBox.appendChild(row);
    });
  }
  renderOrder();
  editorEl.appendChild(orderBox);

  const actions = el('div', 'cms-actions');
  const saveBtn = el('button', 'btn btn-outline', 'Save draft');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    clearEditorMessage();
    try {
      await putDraft('sections', workingDraft);
      showEditorMessage('Draft saved.', 'ok');
      await renderPublishingPanel();
    } catch (error) {
      if (error instanceof Error && error.message === 'unauthorized') return;
      showEditorMessage(formatApiError(error), 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });
  const publishBtn = el('button', 'btn btn-primary', 'Save & publish');
  publishBtn.type = 'button';
  publishBtn.addEventListener('click', async () => {
    publishBtn.disabled = true;
    clearEditorMessage();
    try {
      await putDraft('sections', workingDraft);
      await postPublish('sections');
      showEditorMessage('Saved and published.', 'ok');
      await renderPublishingPanel();
    } catch (error) {
      if (error instanceof Error && error.message === 'unauthorized') return;
      showEditorMessage(formatApiError(error), 'error');
    } finally {
      publishBtn.disabled = false;
    }
  });
  actions.appendChild(saveBtn);
  actions.appendChild(publishBtn);
  editorEl.appendChild(actions);
}

/* ============================================================ media ===== */

async function renderMediaPanel() {
  workingSection = null;
  editorEl.replaceChildren();
  editorEl.appendChild(el('h2', null, 'Media library'));
  editorEl.appendChild(el(
    'p', 'field-hint',
    'Photos uploaded here become selectable from any image field above. An image still in use by ' +
      'a section (draft or published) cannot be deleted.',
  ));

  const messageBox = el('div', 'cms-message');
  messageBox.hidden = true;
  editorEl.appendChild(messageBox);
  currentMessageBox = messageBox;

  const uploadRow = el('div', 'media-upload-row');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp';
  const altInput = document.createElement('input');
  altInput.type = 'text';
  altInput.placeholder = 'Description (for this list only)';
  const uploadBtn = el('button', 'btn btn-primary btn-sm', 'Upload');
  uploadBtn.type = 'button';
  uploadBtn.addEventListener('click', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      showEditorMessage('Choose a file first.', 'error');
      return;
    }
    uploadBtn.disabled = true;
    clearEditorMessage();
    try {
      const media = await uploadMedia(file, altInput.value);
      mediaCache = [...(mediaCache || []), media];
      fileInput.value = '';
      altInput.value = '';
      showEditorMessage('Uploaded.', 'ok');
      await renderMediaPanel();
    } catch (error) {
      if (error instanceof Error && error.message === 'unauthorized') return;
      showEditorMessage(formatApiError(error), 'error');
    } finally {
      uploadBtn.disabled = false;
    }
  });
  uploadRow.appendChild(fileInput);
  uploadRow.appendChild(altInput);
  uploadRow.appendChild(uploadBtn);
  editorEl.appendChild(uploadRow);

  await ensureMediaLoaded();
  const grid = el('div', 'media-grid');
  for (const media of mediaCache || []) {
    const card = el('div', 'media-card');
    const img = document.createElement('img');
    img.src = media.url;
    img.alt = '';
    card.appendChild(img);
    card.appendChild(el('span', 'media-name', media.original_name));
    card.appendChild(el('span', 'media-meta', `${Math.round(media.size_bytes / 1024)} KB`));

    const deleteBtn = el('button', 'btn btn-outline btn-sm', 'Delete');
    deleteBtn.type = 'button';
    deleteBtn.addEventListener('click', async () => {
      deleteBtn.disabled = true;
      clearEditorMessage();
      try {
        await api(`/api/v1/admin/media/${media.id}`, { method: 'DELETE' });
        mediaCache = (mediaCache || []).filter((item) => item.id !== media.id);
        await renderMediaPanel();
      } catch (error) {
        if (error instanceof Error && error.message === 'unauthorized') return;
        showEditorMessage(formatApiError(error), 'error');
        deleteBtn.disabled = false;
      }
    });
    card.appendChild(deleteBtn);

    grid.appendChild(card);
  }
  if ((mediaCache || []).length === 0) {
    grid.appendChild(el('p', 'cms-placeholder', 'No images uploaded yet.'));
  }
  editorEl.appendChild(grid);
}

/* ============================================================ preview === */

if (previewOpenBtn) previewOpenBtn.addEventListener('click', () => void openPreview());
if (previewCloseBtn) previewCloseBtn.addEventListener('click', () => { previewOverlay.hidden = true; });

async function openPreview() {
  let content;
  try {
    content = await api('/api/v1/admin/website-content');
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') return;
    showEditorMessage(formatApiError(error), 'error');
    return;
  }

  const sections = {};
  for (const [id, entry] of Object.entries(content.sections)) sections[id] = entry.draft ?? entry.published;
  // The section currently open in the editor may hold edits not yet saved —
  // "Preview" should always show what is actually on screen right now.
  if (workingSection && workingDraft) sections[workingSection] = workingDraft;

  previewOverlay.hidden = false;
  const send = () => {
    previewFrame.contentWindow.postMessage({ type: 'hydrax:preview-content', sections }, window.location.origin);
  };
  if (previewFrame.dataset.loaded === 'true') {
    send();
  } else {
    previewFrame.addEventListener('load', () => {
      previewFrame.dataset.loaded = 'true';
      send();
    }, { once: true });
    previewFrame.src = '/';
  }
}
