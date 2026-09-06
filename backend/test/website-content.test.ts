/**
 * HYDRAX - website content management (CMS) tests.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_WEBSITE_CONTENT } from '../src/domain/website-content-seed.ts';
import { SECTION_IDS } from '../src/domain/website-content.ts';
import {
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
  adminUpload,
  get,
  startHarness,
} from './helpers.ts';

const heroPayload = () => JSON.parse(JSON.stringify(DEFAULT_WEBSITE_CONTENT.hero));

/* ========================================================================= */
/* authorization                                                            */
/* ========================================================================= */

test('unauthorized access to every CMS endpoint is rejected', async () => {
  const harness = await startHarness();
  try {
    const noKey = { adminKey: null };
    assert.equal((await adminGet(harness, '/api/v1/admin/website-content', null)).status, 401);
    assert.equal((await adminPut(harness, '/api/v1/admin/website-content/hero', heroPayload(), null)).status, 401);
    assert.equal((await adminPost(harness, '/api/v1/admin/website-content/hero/publish', {}, null)).status, 401);
    assert.equal((await adminGet(harness, '/api/v1/admin/media', null)).status, 401);
    assert.equal(
      (await adminUpload(harness, '/api/v1/admin/media', Buffer.from('x'), 'image/jpeg', noKey)).status,
      401,
    );
    assert.equal((await adminDelete(harness, '/api/v1/admin/media/1', null)).status, 401);

    // A wrong key must be rejected exactly like a missing one.
    assert.equal((await adminGet(harness, '/api/v1/admin/website-content', 'wrong-key')).status, 401);
  } finally {
    await harness.close();
  }
});

test('authenticated admin access to website content works', async () => {
  const harness = await startHarness();
  try {
    const res = await adminGet(harness, '/api/v1/admin/website-content');
    assert.equal(res.status, 200);
    for (const id of SECTION_IDS) assert.ok(id in res.body.sections, `expected section "${id}" in response`);
  } finally {
    await harness.close();
  }
});

/* ========================================================================= */
/* draft / publish separation — the core CMS guarantee                      */
/* ========================================================================= */

test('draft updates persist and are visible to the admin, but not the public, until published', async () => {
  const harness = await startHarness();
  try {
    const edited = heroPayload();
    edited.headline.en = 'A brand new headline nobody outside admin has seen yet.';

    const put = await adminPut(harness, '/api/v1/admin/website-content/hero', edited);
    assert.equal(put.status, 200);
    assert.equal(put.body.draft.headline.en, edited.headline.en);

    // Persists: a fresh admin read shows the same draft.
    const adminRead = await adminGet(harness, '/api/v1/admin/website-content');
    assert.equal(adminRead.body.sections.hero.draft.headline.en, edited.headline.en);
    assert.equal(adminRead.body.sections.hero.has_unpublished_changes, true);

    // The public endpoint has never heard of this section (nothing seeded,
    // nothing published yet) — it simply omits it, never leaks the draft.
    const publicRead = await get(harness, '/api/v1/website-content');
    assert.equal(publicRead.status, 200);
    assert.equal(publicRead.body.sections.hero, undefined);
  } finally {
    await harness.close();
  }
});

test('publishing makes the draft the live, publicly-served content', async () => {
  const harness = await startHarness();
  try {
    const edited = heroPayload();
    edited.headline.en = 'This headline is about to go live.';
    await adminPut(harness, '/api/v1/admin/website-content/hero', edited);

    const publish = await adminPost(harness, '/api/v1/admin/website-content/hero/publish', {});
    assert.equal(publish.status, 200);
    assert.equal(publish.body.section, 'hero');
    assert.ok(typeof publish.body.published_at === 'string' && publish.body.published_at.length > 0);

    const publicRead = await get(harness, '/api/v1/website-content');
    assert.equal(publicRead.body.sections.hero.headline.en, edited.headline.en);

    const adminRead = await adminGet(harness, '/api/v1/admin/website-content');
    assert.equal(adminRead.body.sections.hero.has_unpublished_changes, false);
    assert.equal(adminRead.body.sections.hero.published.headline.en, edited.headline.en);
  } finally {
    await harness.close();
  }
});

test('editing the draft again after publishing does not change the live content', async () => {
  const harness = await startHarness();
  try {
    const v1 = heroPayload();
    v1.headline.en = 'Version one, published.';
    await adminPut(harness, '/api/v1/admin/website-content/hero', v1);
    await adminPost(harness, '/api/v1/admin/website-content/hero/publish', {});

    const v2 = heroPayload();
    v2.headline.en = 'Version two, only a draft.';
    await adminPut(harness, '/api/v1/admin/website-content/hero', v2);

    const publicRead = await get(harness, '/api/v1/website-content');
    assert.equal(publicRead.body.sections.hero.headline.en, v1.headline.en);

    const adminRead = await adminGet(harness, '/api/v1/admin/website-content');
    assert.equal(adminRead.body.sections.hero.draft.headline.en, v2.headline.en);
    assert.equal(adminRead.body.sections.hero.published.headline.en, v1.headline.en);
    assert.equal(adminRead.body.sections.hero.has_unpublished_changes, true);
  } finally {
    await harness.close();
  }
});

test('publishing a section with no draft yet fails rather than inventing one', async () => {
  const harness = await startHarness();
  try {
    const res = await adminPost(harness, '/api/v1/admin/website-content/benefits/publish', {});
    assert.equal(res.status, 404);
  } finally {
    await harness.close();
  }
});

/* ========================================================================= */
/* validation                                                                */
/* ========================================================================= */

test('an unknown section id is rejected on every CMS route that takes one', async () => {
  const harness = await startHarness();
  try {
    assert.equal((await adminPut(harness, '/api/v1/admin/website-content/not-a-real-section', {})).status, 400);
    assert.equal(
      (await adminPost(harness, '/api/v1/admin/website-content/not-a-real-section/publish', {})).status,
      400,
    );
  } finally {
    await harness.close();
  }
});

test('an external URL, and a javascript: URL, are both rejected for a CTA href', async () => {
  const harness = await startHarness();
  try {
    const withExternal = heroPayload();
    withExternal.primaryCtaHref = 'https://not-hydrax.example/buy-now';
    const r1 = await adminPut(harness, '/api/v1/admin/website-content/hero', withExternal);
    assert.equal(r1.status, 400);

    const withScript = heroPayload();
    withScript.primaryCtaHref = 'javascript:alert(1)';
    const r2 = await adminPut(harness, '/api/v1/admin/website-content/hero', withScript);
    assert.equal(r2.status, 400);

    // A real internal route is accepted.
    const withReal = heroPayload();
    withReal.primaryCtaHref = '/dashboard';
    const r3 = await adminPut(harness, '/api/v1/admin/website-content/hero', withReal);
    assert.equal(r3.status, 200);
  } finally {
    await harness.close();
  }
});

test('an invalid status value on a field status badge is rejected', async () => {
  const harness = await startHarness();
  try {
    const field = JSON.parse(JSON.stringify(DEFAULT_WEBSITE_CONTENT.field));
    field.statusBadges = [{ title: { en: 'Something', ar: '' }, status: 'DEFINITELY_WORKS' }];
    const res = await adminPut(harness, '/api/v1/admin/website-content/field', field);
    assert.equal(res.status, 400);
    assert.ok(res.body.details.some((d: string) => d.includes('status')));

    // A real status value from the fixed set is accepted.
    field.statusBadges = [{ title: { en: 'Something', ar: '' }, status: 'VERIFIED' }];
    const ok = await adminPut(harness, '/api/v1/admin/website-content/field', field);
    assert.equal(ok.status, 200);
  } finally {
    await harness.close();
  }
});

test('a fixed-count section rejects the wrong number of items', async () => {
  const harness = await startHarness();
  try {
    const how = JSON.parse(JSON.stringify(DEFAULT_WEBSITE_CONTENT.how));
    how.steps = how.steps.slice(0, 2); // only 2, not the required 3
    const res = await adminPut(harness, '/api/v1/admin/website-content/how', how);
    assert.equal(res.status, 400);
  } finally {
    await harness.close();
  }
});

test('a bounded-array section rejects too many items', async () => {
  const harness = await startHarness();
  try {
    const benefits = JSON.parse(JSON.stringify(DEFAULT_WEBSITE_CONTENT.benefits));
    const extra = { title: { en: 'Extra', ar: '' }, description: { en: 'Extra', ar: '' } };
    benefits.items = [...benefits.items, extra, extra, extra, extra]; // 9, over the max of 8
    const res = await adminPut(harness, '/api/v1/admin/website-content/benefits', benefits);
    assert.equal(res.status, 400);
  } finally {
    await harness.close();
  }
});

test('the footer link list enforces the same href allowlist and bounds as navigation', async () => {
  const harness = await startHarness();
  try {
    const footer = JSON.parse(JSON.stringify(DEFAULT_WEBSITE_CONTENT.footer));

    const withBadHref = JSON.parse(JSON.stringify(footer));
    withBadHref.links[0].href = 'https://example.com/not-allowed';
    const rejected = await adminPut(harness, '/api/v1/admin/website-content/footer', withBadHref);
    assert.equal(rejected.status, 400);

    const tooFew = JSON.parse(JSON.stringify(footer));
    tooFew.links = [];
    const rejectedEmpty = await adminPut(harness, '/api/v1/admin/website-content/footer', tooFew);
    assert.equal(rejectedEmpty.status, 400);

    // The real seeded list (9 links) is valid as-is.
    const ok = await adminPut(harness, '/api/v1/admin/website-content/footer', footer);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.draft.links.length, 9);
  } finally {
    await harness.close();
  }
});

test('site settings (logo, default CTA, sticky CTA text) round-trips through draft and publish', async () => {
  const harness = await startHarness();
  try {
    const settings = JSON.parse(JSON.stringify(DEFAULT_WEBSITE_CONTENT.settings));

    // An arbitrary external image is rejected, same as any other image field.
    const badLogo = { ...settings, logo: 'https://evil.example.com/logo.png' };
    const rejected = await adminPut(harness, '/api/v1/admin/website-content/settings', badLogo);
    assert.equal(rejected.status, 400);

    settings.defaultCtaLabel.en = 'Talk to us';
    const saved = await adminPut(harness, '/api/v1/admin/website-content/settings', settings);
    assert.equal(saved.status, 200);

    const published = await adminPost(harness, '/api/v1/admin/website-content/settings/publish', {});
    assert.equal(published.status, 200);

    const publicRead = await get(harness, '/api/v1/website-content');
    assert.equal(publicRead.body.sections.settings.defaultCtaLabel.en, 'Talk to us');
    assert.equal(publicRead.body.sections.settings.logo, '/assets/logo.jpeg');
  } finally {
    await harness.close();
  }
});

test('missing required English text is rejected, but a missing Arabic translation is not', async () => {
  const harness = await startHarness();
  try {
    const withoutEnglish = heroPayload();
    withoutEnglish.headline.en = '';
    const r1 = await adminPut(harness, '/api/v1/admin/website-content/hero', withoutEnglish);
    assert.equal(r1.status, 400);

    const withoutArabic = heroPayload();
    withoutArabic.headline.ar = '';
    const r2 = await adminPut(harness, '/api/v1/admin/website-content/hero', withoutArabic);
    assert.equal(r2.status, 200);
  } finally {
    await harness.close();
  }
});

/* ========================================================================= */
/* honesty guard                                                            */
/* ========================================================================= */

test('the honesty guard rejects an unmeasured performance claim written through the CMS', async () => {
  const harness = await startHarness();
  try {
    const benefits = JSON.parse(JSON.stringify(DEFAULT_WEBSITE_CONTENT.benefits));
    benefits.lede.en = 'HYDRAX reduces water use by 35% on every farm.';
    const res = await adminPut(harness, '/api/v1/admin/website-content/benefits', benefits);
    assert.equal(res.status, 400);
    assert.ok(res.body.details.some((d: string) => d.includes('unmeasured performance claim')));
  } finally {
    await harness.close();
  }
});

test('the honesty guard rejects an unverified capability claim', async () => {
  const harness = await startHarness();
  try {
    // Deliberately no disclaiming word ("not", "before", "yet"...) anywhere
    // in this sentence: the guard's disclaim check is word-based (inherited
    // from website/check.mjs, which this module deliberately mirrors — see
    // honesty-guard.ts's header comment) and, like check.mjs itself, can be
    // coincidentally defeated by one of those words appearing for an
    // unrelated reason ("predicts failure before it happens" would slip
    // through on "before"). That is a known, pre-existing limitation of the
    // word-list heuristic this project already accepted for check.mjs, not
    // something introduced here — this test asserts the guard catches the
    // claim it is actually designed to catch, unobstructed by that edge case.
    const product = JSON.parse(JSON.stringify(DEFAULT_WEBSITE_CONTENT.product));
    product.lede.en = 'Our AI-powered platform predicts pump failure.';
    const res = await adminPut(harness, '/api/v1/admin/website-content/product', product);
    assert.equal(res.status, 400);
  } finally {
    await harness.close();
  }
});

test('the honesty guard does not flag the real seeded copy that honestly names an absent capability', async () => {
  const harness = await startHarness();
  try {
    // This is the actual "Not shown: water flow, pump condition, weather..."
    // sentence from the live site. It must save cleanly — disclaiming an
    // absent capability is the opposite of claiming it.
    const res = await adminPut(harness, '/api/v1/admin/website-content/product', DEFAULT_WEBSITE_CONTENT.product);
    assert.equal(res.status, 200);
  } finally {
    await harness.close();
  }
});

/* ========================================================================= */
/* content does not allow HTML/script injection                             */
/* ========================================================================= */

test('a script tag or HTML in a text field is stored as inert text, not markup', async () => {
  const harness = await startHarness();
  try {
    const edited = heroPayload();
    edited.description.en = '<script>alert(1)</script> <img src=x onerror=alert(2)>';
    const res = await adminPut(harness, '/api/v1/admin/website-content/hero', edited);
    assert.equal(res.status, 200);
    // Control characters are stripped by sanitizeText, but the tag text
    // itself round-trips as plain text — the safety guarantee is that the
    // public site (js/content.js) only ever assigns this to .textContent,
    // never .innerHTML, so it can never execute regardless of its content.
    assert.ok(res.body.draft.description.en.includes('<script>'));

    await adminPost(harness, '/api/v1/admin/website-content/hero/publish', {});
    const publicRead = await get(harness, '/api/v1/website-content');
    assert.equal(publicRead.body.sections.hero.description.en, edited.description.en);
  } finally {
    await harness.close();
  }
});

/* ========================================================================= */
/* media                                                                     */
/* ========================================================================= */

// A minimal, genuinely valid 1x1 JPEG, so content-sniffing-adjacent checks
// (if any are ever added) see real image bytes rather than an arbitrary blob.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkI' +
    'CQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);

test('media upload, list, and reference-protected delete all work end to end', async () => {
  const harness = await startHarness();
  try {
    const upload = await adminUpload(harness, '/api/v1/admin/media', TINY_JPEG, 'image/jpeg', {
      originalName: 'field.jpg',
      altText: 'A test field photo',
    });
    assert.equal(upload.status, 201);
    assert.match(upload.body.url, /^\/assets\/uploads\/[a-f0-9-]+\.jpg$/);

    const list = await adminGet(harness, '/api/v1/admin/media');
    assert.ok(list.body.media.some((m: { id: number }) => m.id === upload.body.id));

    // Reference it from a section, then a delete must be refused.
    const hero = heroPayload();
    hero.heroImage = upload.body.url;
    const put = await adminPut(harness, '/api/v1/admin/website-content/hero', hero);
    assert.equal(put.status, 200, JSON.stringify(put.body));

    const blockedDelete = await adminDelete(harness, `/api/v1/admin/media/${upload.body.id}`);
    assert.equal(blockedDelete.status, 409);

    // Point the section elsewhere, then the same delete succeeds.
    const heroCleared = heroPayload();
    await adminPut(harness, '/api/v1/admin/website-content/hero', heroCleared);
    const allowedDelete = await adminDelete(harness, `/api/v1/admin/media/${upload.body.id}`);
    assert.equal(allowedDelete.status, 200);
  } finally {
    await harness.close();
  }
});

test('an unsupported file type is refused', async () => {
  const harness = await startHarness();
  try {
    const res = await adminUpload(harness, '/api/v1/admin/media', Buffer.from('<svg onload=alert(1)/>'), 'image/svg+xml');
    assert.equal(res.status, 415);
  } finally {
    await harness.close();
  }
});

test('a reference to an image the CMS did not create is rejected', async () => {
  const harness = await startHarness();
  try {
    const hero = heroPayload();
    hero.heroImage = '/assets/../../etc/passwd';
    const res = await adminPut(harness, '/api/v1/admin/website-content/hero', hero);
    assert.equal(res.status, 400);
  } finally {
    await harness.close();
  }
});

/* ========================================================================= */
/* seeding                                                                   */
/* ========================================================================= */

test('seeding populates every section with the real current copy, once', async () => {
  const harness = await startHarness();
  try {
    const now = new Date().toISOString();
    for (const section of SECTION_IDS) {
      await harness.repo.seedWebsiteContentIfMissing(section, DEFAULT_WEBSITE_CONTENT[section], now);
    }

    const publicRead = await get(harness, '/api/v1/website-content');
    assert.equal(publicRead.body.sections.hero.headline.en, 'Water that lets every field thrive.');
    assert.equal(publicRead.body.sections.field.stats[0].value, 50);

    // Seeding again after an edit must not clobber it — this is what makes
    // the seed step safe to run unconditionally on every boot.
    const edited = heroPayload();
    edited.headline.en = 'An admin already changed this.';
    await adminPut(harness, '/api/v1/admin/website-content/hero', edited);
    await adminPost(harness, '/api/v1/admin/website-content/hero/publish', {});

    await harness.repo.seedWebsiteContentIfMissing('hero', DEFAULT_WEBSITE_CONTENT.hero, new Date().toISOString());
    const afterReseed = await get(harness, '/api/v1/website-content');
    assert.equal(afterReseed.body.sections.hero.headline.en, edited.headline.en);
  } finally {
    await harness.close();
  }
});

/* ========================================================================= */
/* existing admin functionality is untouched                                */
/* ========================================================================= */

test('the pre-existing quote-request admin flow still works unchanged', async () => {
  const harness = await startHarness();
  try {
    const res = await adminGet(harness, '/api/v1/requests?limit=1');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.requests));
  } finally {
    await harness.close();
  }
});

/* ========================================================================= */
/* the seed data on disk matches what index.html actually says              */
/* ========================================================================= */

test('the seeded hero headline matches the real index.html at the time of this test', async () => {
  const indexPath = join(import.meta.dirname, '..', '..', 'website', 'index.html');
  const html = await readFile(indexPath, 'utf8');
  assert.ok(
    html.includes(DEFAULT_WEBSITE_CONTENT.hero.headline.en),
    'the seed file has drifted from the real website copy — see domain/website-content-seed.ts',
  );
});
