/**
 * HYDRAX - public website content model.
 *
 * This is the fixed schema the CMS is built around — one interface and one
 * validator per real section of website/index.html, audited from the actual
 * file before anything here was written (see docs/CMS.md for that audit).
 * There is no generic "block" or "component" type: the admin can change the
 * VALUES in these fields, never the shape of a section or add a new one. That
 * is what keeps this a content editor rather than a page builder — the
 * distinction the CMS was explicitly asked to preserve.
 *
 * Every text field is `{ en, ar }`. `en` is required; `ar` may be an empty
 * string, meaning "not translated yet" — see website/js/i18n.js for the
 * fallback this produces at render time (show `ar` if present, else `en`),
 * which mirrors the fallback rule the dashboard's i18n already uses.
 */

import { Errors, isRecord, oneOf, optionalText, requireInteger, requireRecord, requireText } from './validators.ts';
import { findUnmeasuredClaims } from './honesty-guard.ts';
import type { ValidationResult } from './validators.ts';

export interface Localized {
  readonly en: string;
  readonly ar: string;
}

export const SECTION_IDS = [
  'hero', 'navigation', 'problem', 'how', 'product', 'benefits', 'field', 'contact', 'footer', 'sections', 'seo',
  'settings',
  // The link hub at /links — its own page, so its own section, the same way
  // privacy/terms are separate pages rather than homepage content. Adding an
  // id here needs no migration: website_content.section is plain TEXT with
  // no enum constraint (db/schema.sql), and server.ts seeds any section
  // missing a row on every boot via seedWebsiteContentIfMissing, which is a
  // no-op once a row exists. See docs/CMS.md §"Link hub".
  'linkHub',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/**
 * The five middle-page sections a visitor can genuinely reorder or hide
 * without breaking the page — see the "sections" content type below. Hero,
 * navigation, contact and footer are structural chrome (the primary
 * conversion path, in contact's case) and are deliberately not in this list,
 * for the same reason privacy/terms/404 are not ordinary content sections.
 */
export const REORDERABLE_SECTION_IDS = ['problem', 'how', 'product', 'benefits', 'field'] as const;
export type ReorderableSectionId = (typeof REORDERABLE_SECTION_IDS)[number];

/**
 * Every href/CTA destination in the CMS is validated against this allowlist —
 * an in-page anchor that actually exists on the page, a real internal route,
 * or a mailto:/tel: link. Nothing else is accepted: no external domain, and
 * critically no `javascript:` or `data:` scheme, because there is no way to
 * "sanitize" a URL scheme without simply naming which ones are allowed.
 */
const INTERNAL_ANCHORS = new Set(['#top', '#problem', '#how', '#product', '#benefits', '#field', '#contact']);
const INTERNAL_ROUTES = new Set(['/', '/request', '/dashboard', '/privacy', '/terms']);
const MAILTO_RE = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const TEL_RE = /^tel:\+?[0-9 ]{5,20}$/;

/** Media URLs the CMS itself created — see routes/media.ts. Anything else
 *  (an arbitrary external image URL) is refused, so an admin cannot point a
 *  page at content this project does not host or control. */
const MEDIA_URL_RE = /^\/assets\/uploads\/[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp)$/i;
/** The handful of images already shipped with the site, kept selectable so
 *  "revert to the original photo" does not require a re-upload. */
const SEED_IMAGE_RE = /^\/assets\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$|^\/dashboard-preview\.png$/i;

function validateHref(value: unknown, path: string, errors: Errors): string {
  const raw = requireText(value, path, errors, { max: 200 });
  if (raw === null) return '';
  if (INTERNAL_ANCHORS.has(raw) || INTERNAL_ROUTES.has(raw) || MAILTO_RE.test(raw) || TEL_RE.test(raw)) return raw;
  errors.add(`${path} must be an existing in-page section, a real page on this site, a mailto: link, or a tel: link`);
  return raw;
}

function validateImageRef(value: unknown, path: string, errors: Errors, required = true): string {
  if (!required && (value === null || value === undefined || value === '')) return '';
  const raw = requireText(value, path, errors, { max: 200 });
  if (raw === null) return '';
  if (MEDIA_URL_RE.test(raw) || SEED_IMAGE_RE.test(raw)) return raw;
  errors.add(`${path} must reference an image uploaded through the CMS media library, or one of the site's original photos`);
  return raw;
}

/** Applies the honesty guard to one already-extracted string, prefixing any
 *  hit with the field path so an admin can see exactly which field failed. */
function guardText(text: string, path: string, errors: Errors): void {
  for (const problem of findUnmeasuredClaims(text)) errors.add(`${path}: ${problem}`);
}

function requireLocalized(
  value: unknown,
  path: string,
  errors: Errors,
  { min = 1, max = 200 }: { min?: number; max?: number } = {},
): Localized {
  const record = requireRecord(value, path, errors);
  // min === 0 means "en itself may be entirely absent", so it goes through
  // optionalText (which tolerates a missing key) rather than requireText
  // (which does not, regardless of its own min setting).
  const en = min === 0
    ? optionalText(record.en, `${path}.en`, errors, max) ?? ''
    : requireText(record.en, `${path}.en`, errors, { min, max }) ?? '';
  const ar = optionalText(record.ar, `${path}.ar`, errors, max) ?? '';
  if (en) guardText(en, `${path}.en`, errors);
  if (ar) guardText(ar, `${path}.ar`, errors);
  return { en, ar };
}

/** Like `requireLocalized`, but the field may be entirely absent — used for
 *  a step's small mono-font detail line, which two of the three real steps
 *  carry and one deliberately does not (see index.html's step 3). Absent or
 *  `{en:'',ar:''}` both mean "no detail line for this step". */
function optionalLocalized(value: unknown, path: string, errors: Errors, max: number): Localized {
  if (value === null || value === undefined) return { en: '', ar: '' };
  return requireLocalized(value, path, errors, { min: 0, max });
}

function requireBoundedArray<T>(
  value: unknown,
  path: string,
  errors: Errors,
  min: number,
  max: number,
  itemValidator: (item: unknown, itemPath: string, errors: Errors) => T,
): T[] {
  if (!Array.isArray(value)) {
    errors.add(`${path} must be a list`);
    return [];
  }
  if (value.length < min || value.length > max) {
    errors.add(`${path} must have between ${min} and ${max} items (this section's layout does not support more)`);
    return value.slice(0, max).map((item, i) => itemValidator(item, `${path}[${i}]`, errors));
  }
  return value.map((item, i) => itemValidator(item, `${path}[${i}]`, errors));
}

function requireFixedTuple<T>(
  value: unknown,
  path: string,
  errors: Errors,
  length: number,
  itemValidator: (item: unknown, itemPath: string, errors: Errors) => T,
): T[] {
  if (!Array.isArray(value) || value.length !== length) {
    errors.add(`${path} must have exactly ${length} items — this section's layout is built around that count`);
    const arr = Array.isArray(value) ? value : [];
    return Array.from({ length }, (_, i) => itemValidator(arr[i], `${path}[${i}]`, errors));
  }
  return value.map((item, i) => itemValidator(item, `${path}[${i}]`, errors));
}

/* ========================================================================= */
/* hero                                                                      */
/* ========================================================================= */

export interface HeroContent {
  eyebrow: Localized;
  headline: Localized;
  description: Localized;
  primaryCtaLabel: Localized;
  primaryCtaHref: string;
  heroImage: string;
  heroImageAlt: Localized;
  points: Localized[];
}

function validateHero(body: unknown): ValidationResult<HeroContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'hero', errors);
  const value: HeroContent = {
    eyebrow: requireLocalized(r.eyebrow, 'hero.eyebrow', errors, { max: 60 }),
    headline: requireLocalized(r.headline, 'hero.headline', errors, { max: 140 }),
    description: requireLocalized(r.description, 'hero.description', errors, { max: 500 }),
    primaryCtaLabel: requireLocalized(r.primaryCtaLabel, 'hero.primaryCtaLabel', errors, { max: 40 }),
    primaryCtaHref: validateHref(r.primaryCtaHref, 'hero.primaryCtaHref', errors),
    heroImage: validateImageRef(r.heroImage, 'hero.heroImage', errors),
    heroImageAlt: requireLocalized(r.heroImageAlt, 'hero.heroImageAlt', errors, { max: 200 }),
    points: requireBoundedArray(r.points, 'hero.points', errors, 1, 5, (item, p, e) =>
      requireLocalized(item, p, e, { max: 100 }),
    ),
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* navigation                                                                */
/* ========================================================================= */

export interface NavItem {
  label: Localized;
  href: string;
  visible: boolean;
}

// No `brandTagline` here: an earlier pass added one, but nothing on the real
// page ever rendered it (the nav shows only the logo image) — an editable
// field with no visible effect is worse than no field, so the CMS polish
// audit removed it rather than leave a phantom "editable" control. The one
// tagline that actually renders is `footer.tagline`. See docs/CMS.md.
export interface NavigationContent {
  items: NavItem[];
  dashboardCtaLabel: Localized;
  primaryCtaLabel: Localized;
}

function validateNavItem(item: unknown, path: string, errors: Errors): NavItem {
  const r = requireRecord(item, path, errors);
  return {
    label: requireLocalized(r.label, `${path}.label`, errors, { max: 40 }),
    href: validateHref(r.href, `${path}.href`, errors),
    visible: typeof r.visible === 'boolean' ? r.visible : true,
  };
}

function validateNavigation(body: unknown): ValidationResult<NavigationContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'navigation', errors);
  const value: NavigationContent = {
    items: requireBoundedArray(r.items, 'navigation.items', errors, 1, 7, validateNavItem),
    dashboardCtaLabel: requireLocalized(r.dashboardCtaLabel, 'navigation.dashboardCtaLabel', errors, { max: 40 }),
    primaryCtaLabel: requireLocalized(r.primaryCtaLabel, 'navigation.primaryCtaLabel', errors, { max: 40 }),
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* problem (the field problem)                                              */
/* ========================================================================= */

export interface ProblemContent {
  eyebrow: Localized;
  pullQuote: Localized;
  paragraphs: Localized[];
  image: string;
  imageAlt: Localized;
}

function validateProblem(body: unknown): ValidationResult<ProblemContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'problem', errors);
  const value: ProblemContent = {
    eyebrow: requireLocalized(r.eyebrow, 'problem.eyebrow', errors, { max: 60 }),
    pullQuote: requireLocalized(r.pullQuote, 'problem.pullQuote', errors, { max: 160 }),
    paragraphs: requireBoundedArray(r.paragraphs, 'problem.paragraphs', errors, 1, 4, (item, p, e) =>
      requireLocalized(item, p, e, { max: 700 }),
    ),
    image: validateImageRef(r.image, 'problem.image', errors),
    imageAlt: requireLocalized(r.imageAlt, 'problem.imageAlt', errors, { max: 200 }),
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* how (how hydrax works)                                                    */
/* ========================================================================= */

export interface HowStep {
  title: Localized;
  description: Localized;
  detail: Localized;
}

export interface HowContent {
  eyebrow: Localized;
  headline: Localized;
  intro: Localized;
  steps: HowStep[];
  accentImage: string;
  accentImageAlt: Localized;
  accentCaption: Localized;
}

function validateHowStep(item: unknown, path: string, errors: Errors): HowStep {
  const r = requireRecord(item, path, errors);
  return {
    title: requireLocalized(r.title, `${path}.title`, errors, { max: 60 }),
    description: requireLocalized(r.description, `${path}.description`, errors, { max: 400 }),
    detail: optionalLocalized(r.detail, `${path}.detail`, errors, 100),
  };
}

function validateHow(body: unknown): ValidationResult<HowContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'how', errors);
  const value: HowContent = {
    eyebrow: requireLocalized(r.eyebrow, 'how.eyebrow', errors, { max: 60 }),
    headline: requireLocalized(r.headline, 'how.headline', errors, { max: 140 }),
    intro: requireLocalized(r.intro, 'how.intro', errors, { max: 300 }),
    // Exactly 3 — the numbering (1/2/3) and stagger animation are built
    // around this count; see docs/CMS.md's audit note on this section.
    steps: requireFixedTuple(r.steps, 'how.steps', errors, 3, validateHowStep),
    accentImage: validateImageRef(r.accentImage, 'how.accentImage', errors),
    accentImageAlt: requireLocalized(r.accentImageAlt, 'how.accentImageAlt', errors, { max: 200 }),
    accentCaption: requireLocalized(r.accentCaption, 'how.accentCaption', errors, { max: 160 }),
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* product (the platform / live monitoring)                                 */
/* ========================================================================= */

export interface CapabilityItem {
  label: Localized;
  description: Localized;
}

export interface ProductContent {
  eyebrow: Localized;
  headline: Localized;
  lede: Localized;
  dashboardImage: string;
  captionTitle: Localized;
  captionDetail: Localized;
  capabilityItems: CapabilityItem[];
}

function validateCapabilityItem(item: unknown, path: string, errors: Errors): CapabilityItem {
  const r = requireRecord(item, path, errors);
  return {
    label: requireLocalized(r.label, `${path}.label`, errors, { max: 40 }),
    description: requireLocalized(r.description, `${path}.description`, errors, { max: 200 }),
  };
}

function validateProduct(body: unknown): ValidationResult<ProductContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'product', errors);
  const value: ProductContent = {
    eyebrow: requireLocalized(r.eyebrow, 'product.eyebrow', errors, { max: 60 }),
    headline: requireLocalized(r.headline, 'product.headline', errors, { max: 140 }),
    lede: requireLocalized(r.lede, 'product.lede', errors, { max: 400 }),
    // Deliberately NOT admin-uploadable as a fresh photo shoot would be: this
    // must stay a real, current screenshot of the actual dashboard, so only
    // the CMS media library (uploads validated the same as every other
    // image) or the seeded original capture may be referenced — the same
    // validation as any other image field. Nothing here can technically stop
    // an admin from uploading a doctored screenshot; that risk is accepted
    // the same way it already is for quote-request data — see docs/CMS.md.
    dashboardImage: validateImageRef(r.dashboardImage, 'product.dashboardImage', errors),
    captionTitle: requireLocalized(r.captionTitle, 'product.captionTitle', errors, { max: 60 }),
    captionDetail: requireLocalized(r.captionDetail, 'product.captionDetail', errors, { max: 160 }),
    capabilityItems: requireBoundedArray(r.capabilityItems, 'product.capabilityItems', errors, 3, 8, validateCapabilityItem),
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* benefits                                                                  */
/* ========================================================================= */

export interface BenefitItem {
  title: Localized;
  description: Localized;
}

export interface BenefitsContent {
  eyebrow: Localized;
  headline: Localized;
  lede: Localized;
  items: BenefitItem[];
}

function validateBenefitItem(item: unknown, path: string, errors: Errors): BenefitItem {
  const r = requireRecord(item, path, errors);
  return {
    title: requireLocalized(r.title, `${path}.title`, errors, { max: 40 }),
    description: requireLocalized(r.description, `${path}.description`, errors, { max: 300 }),
  };
}

function validateBenefits(body: unknown): ValidationResult<BenefitsContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'benefits', errors);
  const value: BenefitsContent = {
    eyebrow: requireLocalized(r.eyebrow, 'benefits.eyebrow', errors, { max: 60 }),
    headline: requireLocalized(r.headline, 'benefits.headline', errors, { max: 140 }),
    lede: requireLocalized(r.lede, 'benefits.lede', errors, { max: 400 }),
    items: requireBoundedArray(r.items, 'benefits.items', errors, 3, 8, validateBenefitItem),
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* field (built for the field + the honest verification-numbers strip,      */
/* which is the closest real content the "engineering status" request maps  */
/* onto — see docs/CMS.md)                                                  */
/* ========================================================================= */

export interface GalleryPhoto {
  image: string;
  imageAlt: Localized;
  caption: Localized;
}

export interface VerificationStat {
  value: number;
  label: Localized;
}

/**
 * Structured form of exactly the claim the real "Built for the field" copy
 * already makes in prose ("verified against 50 firmware tests... running on
 * a physical board... is the next step, not a claimed one" — see
 * docs/HARDWARE_VALIDATION.md, which this enum's values are taken from
 * verbatim). This does not let an admin invent a new claim; it lets them
 * restate the one already true, without prose-editing it into something it
 * is not.
 */
export const CONTENT_STATUSES = [
  'VERIFIED',
  'SOFTWARE_VERIFIED',
  'IN_PROGRESS',
  'PLANNED',
  'PENDING_HARDWARE_VALIDATION',
  'NOT_IMPLEMENTED',
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export interface StatusBadge {
  title: Localized;
  status: ContentStatus;
}

export interface FieldContent {
  eyebrow: Localized;
  headline: Localized;
  lede: Localized;
  gallery: GalleryPhoto[];
  statusBadges: StatusBadge[];
  stats: VerificationStat[];
  statsNote: Localized;
}

function validateGalleryPhoto(item: unknown, path: string, errors: Errors): GalleryPhoto {
  const r = requireRecord(item, path, errors);
  return {
    image: validateImageRef(r.image, `${path}.image`, errors),
    imageAlt: requireLocalized(r.imageAlt, `${path}.imageAlt`, errors, { max: 200 }),
    caption: requireLocalized(r.caption, `${path}.caption`, errors, { max: 80 }),
  };
}

function validateStatusBadge(item: unknown, path: string, errors: Errors): StatusBadge {
  const r = requireRecord(item, path, errors);
  return {
    title: requireLocalized(r.title, `${path}.title`, errors, { max: 40 }),
    status: oneOf(r.status, CONTENT_STATUSES, `${path}.status`, errors),
  };
}

function validateStat(item: unknown, path: string, errors: Errors): VerificationStat {
  const r = requireRecord(item, path, errors);
  return {
    // A verified count is a whole number by nature (tests, assertions,
    // dependencies) — 0 is valid and meaningful (see "0 cloud dependencies").
    value: requireInteger(r.value, `${path}.value`, errors, 0, 1_000_000),
    label: requireLocalized(r.label, `${path}.label`, errors, { max: 60 }),
  };
}

function validateField(body: unknown): ValidationResult<FieldContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'field', errors);
  const value: FieldContent = {
    eyebrow: requireLocalized(r.eyebrow, 'field.eyebrow', errors, { max: 60 }),
    headline: requireLocalized(r.headline, 'field.headline', errors, { max: 140 }),
    lede: requireLocalized(r.lede, 'field.lede', errors, { max: 500 }),
    // Exactly 2 — the .is-tall/.is-wide layout is two fixed, differently
    // shaped slots, not a generic gallery grid.
    gallery: requireFixedTuple(r.gallery, 'field.gallery', errors, 2, validateGalleryPhoto),
    statusBadges: requireBoundedArray(r.statusBadges, 'field.statusBadges', errors, 0, 6, validateStatusBadge),
    stats: requireBoundedArray(r.stats, 'field.stats', errors, 2, 6, validateStat),
    statsNote: requireLocalized(r.statsNote, 'field.statsNote', errors, { max: 200 }),
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* contact (final cta)                                                       */
/* ========================================================================= */

export interface ContactContent {
  eyebrow: Localized;
  headline: Localized;
  lede: Localized;
  ctaLabel: Localized;
  ctaHref: string;
  email: string;
  phone: string;
  location: Localized;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ]{5,20}$/;

function validateContact(body: unknown): ValidationResult<ContactContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'contact', errors);

  const email = requireText(r.email, 'contact.email', errors, { max: 120 }) ?? '';
  if (email && !EMAIL_RE.test(email)) errors.add('contact.email must be a valid email address');
  const phone = requireText(r.phone, 'contact.phone', errors, { max: 40 }) ?? '';
  if (phone && !PHONE_RE.test(phone)) errors.add('contact.phone must be a valid phone number');

  const value: ContactContent = {
    eyebrow: requireLocalized(r.eyebrow, 'contact.eyebrow', errors, { max: 60 }),
    headline: requireLocalized(r.headline, 'contact.headline', errors, { max: 140 }),
    lede: requireLocalized(r.lede, 'contact.lede', errors, { max: 300 }),
    ctaLabel: requireLocalized(r.ctaLabel, 'contact.ctaLabel', errors, { max: 40 }),
    ctaHref: validateHref(r.ctaHref, 'contact.ctaHref', errors),
    email,
    phone,
    location: requireLocalized(r.location, 'contact.location', errors, { max: 80 }),
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* footer                                                                    */
/* ========================================================================= */

export interface FooterContent {
  tagline: Localized;
  // The footer's own link list — a real, fully hardcoded piece of content
  // the original CMS pass missed (it mirrors, but isn't identical to,
  // `navigation.items`: it also lists "Built for the field", Dashboard,
  // Request, Privacy and Terms). Added by the CMS polish audit. Reuses
  // NavItem/validateNavItem — same shape, same href allowlist, no reason to
  // duplicate either.
  links: NavItem[];
  legalText: Localized;
  photoCreditsText: Localized;
}

function validateFooter(body: unknown): ValidationResult<FooterContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'footer', errors);
  const value: FooterContent = {
    tagline: requireLocalized(r.tagline, 'footer.tagline', errors, { max: 80 }),
    links: requireBoundedArray(r.links, 'footer.links', errors, 1, 12, validateNavItem),
    // A floor on length: this sentence exists specifically to prevent a
    // misleading reading of the soil-moisture percentage, so it must never
    // be blankable down to nothing through this editor.
    legalText: requireLocalized(r.legalText, 'footer.legalText', errors, { min: 40, max: 600 }),
    photoCreditsText: requireLocalized(r.photoCreditsText, 'footer.photoCreditsText', errors, { min: 0, max: 500 }),
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* sections (order + visibility of the reorderable middle sections)         */
/* ========================================================================= */

export interface SectionsContent {
  order: ReorderableSectionId[];
  enabled: Record<ReorderableSectionId, boolean>;
}

function validateSections(body: unknown): ValidationResult<SectionsContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'sections', errors);

  const orderRaw = Array.isArray(r.order) ? r.order : [];
  const order: ReorderableSectionId[] = [];
  for (const id of orderRaw) {
    if (!REORDERABLE_SECTION_IDS.includes(id as ReorderableSectionId)) {
      errors.add(`sections.order contains an unknown section id: ${String(id)}`);
      continue;
    }
    order.push(id as ReorderableSectionId);
  }
  // Must be a permutation of exactly the reorderable ids — no duplicates, none
  // missing. A missing id would silently drop a whole section from the page.
  const asSet = new Set(order);
  if (asSet.size !== REORDERABLE_SECTION_IDS.length || order.length !== REORDERABLE_SECTION_IDS.length) {
    errors.add(
      `sections.order must contain each of ${REORDERABLE_SECTION_IDS.join(', ')} exactly once`,
    );
  }

  const enabledRaw = isRecord(r.enabled) ? r.enabled : {};
  const enabled = {} as Record<ReorderableSectionId, boolean>;
  for (const id of REORDERABLE_SECTION_IDS) {
    enabled[id] = typeof enabledRaw[id] === 'boolean' ? (enabledRaw[id] as boolean) : true;
  }

  const value: SectionsContent = {
    order: order.length === REORDERABLE_SECTION_IDS.length ? order : [...REORDERABLE_SECTION_IDS],
    enabled,
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* seo                                                                       */
/* ========================================================================= */

export interface SeoContent {
  siteTitle: Localized;
  metaDescription: Localized;
  ogTitle: Localized;
  ogDescription: Localized;
  ogImage: string;
}

function validateSeo(body: unknown): ValidationResult<SeoContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'seo', errors);
  const value: SeoContent = {
    siteTitle: requireLocalized(r.siteTitle, 'seo.siteTitle', errors, { max: 70 }),
    metaDescription: requireLocalized(r.metaDescription, 'seo.metaDescription', errors, { max: 160 }),
    ogTitle: requireLocalized(r.ogTitle, 'seo.ogTitle', errors, { max: 70 }),
    ogDescription: requireLocalized(r.ogDescription, 'seo.ogDescription', errors, { max: 200 }),
    ogImage: validateImageRef(r.ogImage, 'seo.ogImage', errors, false),
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* settings (site identity + the small pieces of copy reused across pages)  */
/* ========================================================================= */

/**
 * Added by the CMS polish audit: a few genuinely site-wide, genuinely
 * content-level settings that were previously hardcoded in more than one
 * place — see docs/CMS.md §"Site Settings". Deliberately narrow: this is
 * NOT a theme/CSS editor. `logo` reuses the same image validation as every
 * other image field (uploads or the site's own seeded photos); an admin
 * cannot point site identity at an arbitrary external image any more than
 * they can point a section's photo at one.
 */
export interface SiteSettingsContent {
  logo: string;
  defaultCtaLabel: Localized;
  defaultCtaHref: string;
  stickyCtaText: Localized;
}

function validateSettings(body: unknown): ValidationResult<SiteSettingsContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'settings', errors);
  const value: SiteSettingsContent = {
    logo: validateImageRef(r.logo, 'settings.logo', errors),
    defaultCtaLabel: requireLocalized(r.defaultCtaLabel, 'settings.defaultCtaLabel', errors, { max: 40 }),
    defaultCtaHref: validateHref(r.defaultCtaHref, 'settings.defaultCtaHref', errors),
    stickyCtaText: requireLocalized(r.stickyCtaText, 'settings.stickyCtaText', errors, { max: 160 }),
  };
  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* linkHub (the /links link hub — website/links.html)                        */
/* ========================================================================= */

/**
 * The social platforms /links is built to display, and the ONE host a URL for
 * each is allowed to be on.
 *
 * This list is presentation plus an allowlist, never a claim that an account
 * exists: every platform ships with an empty `url`, and an empty url renders
 * no row at all (see website/js/links.js). HYDRAX has no LinkedIn page, no
 * Instagram, no Facebook, no YouTube, no TikTok and no X account, and nothing
 * in this repository invents one — an admin supplies a real profile URL, or
 * the row stays absent. A dead link in a social bio costs more trust than a
 * missing row does.
 *
 * `domain` is what makes "only real URLs for the platform they claim to be"
 * enforceable rather than aspirational: validateSocialUrl below rejects a URL
 * whose host is not that domain (or a subdomain of it), so a row labelled
 * LinkedIn cannot quietly point somewhere else. Mirrors the `domain` values
 * in website/js/links-config.js.
 */
export const SOCIAL_PLATFORMS = [
  { key: 'linkedin', domain: 'linkedin.com' },
  { key: 'instagram', domain: 'instagram.com' },
  { key: 'facebook', domain: 'facebook.com' },
  { key: 'youtube', domain: 'youtube.com' },
  { key: 'tiktok', domain: 'tiktok.com' },
  { key: 'x', domain: 'x.com' },
] as const;

export const SOCIAL_PLATFORM_KEYS = SOCIAL_PLATFORMS.map((p) => p.key) as readonly SocialPlatformKey[];
export type SocialPlatformKey = (typeof SOCIAL_PLATFORMS)[number]['key'];

const SOCIAL_DOMAINS = new Map<string, string>(SOCIAL_PLATFORMS.map((p) => [p.key, p.domain]));

/**
 * Destinations allowed on /links.
 *
 * Deliberately NOT `validateHref`: that allowlist includes the homepage's
 * in-page anchors (#problem, #how, …), which do not exist on /links — an
 * anchor accepted here would save cleanly and then scroll nowhere. So this
 * accepts only real routes on this site, plus mailto:/tel: for the contact
 * rows. No external origin and, critically, no `javascript:`/`data:`: the
 * scheme is decided by what this function names, not by trying to sanitize
 * whatever arrived.
 *
 * Social URLs are the one external case and go through validateSocialUrl
 * instead, which additionally pins the host.
 */
function validateLinkHubHref(value: unknown, path: string, errors: Errors): string {
  const raw = requireText(value, path, errors, { max: 200 });
  if (raw === null) return '';
  if (INTERNAL_ROUTES.has(raw) || MAILTO_RE.test(raw) || TEL_RE.test(raw)) return raw;
  errors.add(
    `${path} must be a real page on this site (${[...INTERNAL_ROUTES].join(', ')}), a mailto: link, or a tel: link`,
  );
  return raw;
}

/**
 * A social profile URL, or '' meaning "this account does not exist yet".
 *
 * Never rewritten — an admin's URL is accepted exactly as typed or refused
 * with a reason, because silently "fixing" a URL is how a link ends up
 * pointing somewhere nobody chose.
 */
function validateSocialUrl(value: unknown, platform: string, path: string, errors: Errors): string {
  if (value === null || value === undefined || value === '') return '';
  const raw = requireText(value, path, errors, { max: 300, min: 0 });
  if (raw === null || raw === '') return '';

  const domain = SOCIAL_DOMAINS.get(platform);
  if (domain === undefined) {
    // Unknown platform: the enum check on `platform` has already recorded the
    // real error, so do not pile a second confusing one on top of it.
    return raw;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    errors.add(`${path} is not a valid URL`);
    return raw;
  }
  // https only. http: would be downgradeable in transit, and every other
  // scheme (javascript:, data:, file:, …) has no business being a profile
  // link at all.
  if (parsed.protocol !== 'https:') {
    errors.add(`${path} must start with https:// (got "${parsed.protocol}")`);
    return raw;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== domain && !host.endsWith(`.${domain}`)) {
    errors.add(`${path} must be a ${domain} URL — a ${platform} link cannot point at "${host}"`);
    return raw;
  }
  return raw;
}

/** A machine handle for a row, so reordering and editing cannot swap two
 *  rows' identities. Generated by the admin UI, never shown to a visitor. */
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

function validateItemId(value: unknown, path: string, errors: Errors): string {
  const raw = requireText(value, path, errors, { max: 40 });
  if (raw === null) return '';
  if (!ID_RE.test(raw)) {
    errors.add(`${path} must be lowercase letters, digits and hyphens (1–40 characters)`);
  }
  return raw;
}

/**
 * One row of the hub.
 *
 * `order` is deliberately absent as a stored number: the array index IS the
 * order, exactly as it already is for navigation.items and footer.links. A
 * separate integer would let two rows claim position 2, and nothing could
 * then say which the page should believe — an invalid state worth making
 * unrepresentable rather than validating after the fact. The admin's ↑/↓
 * controls reorder the array itself.
 *
 * `category` is likewise the array a row lives in rather than a field on the
 * row, so a contact row cannot be labelled "explore" while sitting in the
 * contact list, and a mailto: cannot end up in a list rendered without one.
 */
export interface LinkHubItem {
  id: string;
  label: Localized;
  note: Localized;
  href: string;
  visible: boolean;
}

/** A contact row: same shape plus the value a visitor reads. `display` is the
 *  number/address as shown (the site shows "0127 915 9200" and dials
 *  "+20…"), so it is plain text, not prose to translate. */
export interface LinkHubContactItem extends LinkHubItem {
  display: string;
}

export interface LinkHubSocialItem {
  platform: SocialPlatformKey;
  label: Localized;
  url: string;
  visible: boolean;
}

export interface LinkHubContent {
  eyebrow: Localized;
  tagline: Localized;
  intro: Localized;
  primaryLabel: Localized;
  primaryNote: Localized;
  primaryHref: string;
  exploreHeading: Localized;
  exploreItems: LinkHubItem[];
  socialHeading: Localized;
  social: LinkHubSocialItem[];
  contactHeading: Localized;
  contactItems: LinkHubContactItem[];
  location: Localized;
  footerLinks: NavItem[];
}

function validateLinkHubItem(item: unknown, path: string, errors: Errors): LinkHubItem {
  const r = requireRecord(item, path, errors);
  return {
    id: validateItemId(r.id, `${path}.id`, errors),
    label: requireLocalized(r.label, `${path}.label`, errors, { max: 60 }),
    note: requireLocalized(r.note, `${path}.note`, errors, { min: 0, max: 140 }),
    href: validateLinkHubHref(r.href, `${path}.href`, errors),
    visible: typeof r.visible === 'boolean' ? r.visible : true,
  };
}

function validateLinkHubContactItem(item: unknown, path: string, errors: Errors): LinkHubContactItem {
  const base = validateLinkHubItem(item, path, errors);
  const r = requireRecord(item, path, errors);
  const display = requireText(r.display, `${path}.display`, errors, { min: 0, max: 120 }) ?? '';
  // A contact row's destination is a mailto:/tel: by definition — an internal
  // route here would render a "Call us" row that opens a web page.
  if (base.href && !MAILTO_RE.test(base.href) && !TEL_RE.test(base.href)) {
    errors.add(`${path}.href must be a mailto: or tel: link for a contact row`);
  }
  return { ...base, display };
}

function validateLinkHubSocialItem(item: unknown, path: string, errors: Errors): LinkHubSocialItem {
  const r = requireRecord(item, path, errors);
  const platform = oneOf(r.platform, SOCIAL_PLATFORM_KEYS, `${path}.platform`, errors);
  return {
    platform,
    label: requireLocalized(r.label, `${path}.label`, errors, { max: 40 }),
    url: validateSocialUrl(r.url, platform, `${path}.url`, errors),
    visible: typeof r.visible === 'boolean' ? r.visible : true,
  };
}

function validateLinkHub(body: unknown): ValidationResult<LinkHubContent> {
  const errors = new Errors();
  const r = requireRecord(body, 'linkHub', errors);

  const value: LinkHubContent = {
    eyebrow: requireLocalized(r.eyebrow, 'linkHub.eyebrow', errors, { max: 60 }),
    tagline: requireLocalized(r.tagline, 'linkHub.tagline', errors, { max: 100 }),
    intro: requireLocalized(r.intro, 'linkHub.intro', errors, { min: 0, max: 200 }),

    primaryLabel: requireLocalized(r.primaryLabel, 'linkHub.primaryLabel', errors, { max: 60 }),
    primaryNote: requireLocalized(r.primaryNote, 'linkHub.primaryNote', errors, { min: 0, max: 140 }),
    primaryHref: validateLinkHubHref(r.primaryHref, 'linkHub.primaryHref', errors),

    exploreHeading: requireLocalized(r.exploreHeading, 'linkHub.exploreHeading', errors, { max: 40 }),
    exploreItems: requireBoundedArray(r.exploreItems, 'linkHub.exploreItems', errors, 0, 8, validateLinkHubItem),

    socialHeading: requireLocalized(r.socialHeading, 'linkHub.socialHeading', errors, { max: 40 }),
    // Exactly one row per supported platform, always — the six rows are the
    // editor's surface for "does this account exist yet", not a list an admin
    // grows. Adding a seventh platform is a code change (an icon has to be
    // drawn and a domain allowlisted), not a content change.
    social: requireFixedTuple(
      r.social, 'linkHub.social', errors, SOCIAL_PLATFORMS.length, validateLinkHubSocialItem,
    ),

    contactHeading: requireLocalized(r.contactHeading, 'linkHub.contactHeading', errors, { max: 40 }),
    contactItems: requireBoundedArray(
      r.contactItems, 'linkHub.contactItems', errors, 0, 4, validateLinkHubContactItem,
    ),
    location: requireLocalized(r.location, 'linkHub.location', errors, { min: 0, max: 80 }),

    // Same shape and same href allowlist as the site footer's own links —
    // no reason for a second validator, but note these go through
    // validateNavItem's `validateHref`, which also permits the homepage's
    // in-page anchors. That is correct here: a /links footer link to
    // "/#contact" is a real destination on another page.
    footerLinks: requireBoundedArray(r.footerLinks, 'linkHub.footerLinks', errors, 1, 8, validateNavItem),
  };

  // Ids are the one cross-row invariant: two rows sharing one would make
  // "which row did the admin just reorder" ambiguous, so it is refused
  // outright rather than de-duplicated behind the admin's back.
  const ids = [...value.exploreItems, ...value.contactItems].map((item) => item.id).filter((id) => id !== '');
  const duplicated = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  for (const id of duplicated) errors.add(`linkHub has more than one row with the id "${id}"`);

  // One row per platform, no platform twice — the fixed-tuple check above
  // only guarantees the count.
  const platforms = value.social.map((s) => s.platform);
  for (const key of SOCIAL_PLATFORM_KEYS) {
    const count = platforms.filter((p) => p === key).length;
    if (count !== 1) errors.add(`linkHub.social must list ${key} exactly once (found ${count})`);
  }

  return errors.ok ? { ok: true, value } : { ok: false, errors: errors.list };
}

/* ========================================================================= */
/* dispatch                                                                  */
/* ========================================================================= */

const VALIDATORS: Record<SectionId, (body: unknown) => ValidationResult<unknown>> = {
  hero: validateHero,
  navigation: validateNavigation,
  problem: validateProblem,
  how: validateHow,
  product: validateProduct,
  benefits: validateBenefits,
  field: validateField,
  contact: validateContact,
  footer: validateFooter,
  sections: validateSections,
  seo: validateSeo,
  settings: validateSettings,
  linkHub: validateLinkHub,
};

export function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}

export function validateWebsiteSection(section: SectionId, body: unknown): ValidationResult<unknown> {
  return VALIDATORS[section](body);
}
