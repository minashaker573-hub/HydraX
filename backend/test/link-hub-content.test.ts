/**
 * HYDRAX - link hub (/links) CMS tests.
 *
 * Two things are being pinned down here.
 *
 * The first is the URL allowlist. /links is the one page whose whole purpose
 * is links, and it is the URL that goes in a social bio, so a bad destination
 * here is maximally visible. The scheme and host rules are therefore asserted
 * from both directions: every kind of URL that must be accepted, and every
 * kind that must be refused - including the ones that only matter because
 * someone might try them (javascript:, data:) and the ones that only matter
 * because they look plausible (a linkedin.com URL in the Instagram row).
 *
 * The second is that HYDRAX still has no social accounts. The seed ships six
 * platforms with no URL, and an unconfigured platform must render nothing at
 * all - no row, and no empty "Follow" heading standing over it. There is
 * specifically no HYDRAX LinkedIn anywhere in the seeded content.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_WEBSITE_CONTENT } from '../src/domain/website-content-seed.ts';
import { SOCIAL_PLATFORMS, validateWebsiteSection } from '../src/domain/website-content.ts';
import { adminGet, adminPost, adminPut, get, startHarness } from './helpers.ts';

const payload = () => JSON.parse(JSON.stringify(DEFAULT_WEBSITE_CONTENT.linkHub));

/**
 * Brings a fresh test schema to the state a real server boots into.
 *
 * startHarness() provisions an empty schema; seeding is server.ts's job, so a
 * test that wants to observe "what a visitor sees on a normal install" has to
 * do the same thing server.ts does. Idempotent, exactly as at boot.
 */
async function seed(harness: Awaited<ReturnType<typeof startHarness>>): Promise<void> {
  const now = new Date().toISOString();
  await harness.repo.seedWebsiteContentIfMissing('linkHub', DEFAULT_WEBSITE_CONTENT.linkHub, now);
}

/** The validator's verdict on a payload, as a pass/fail plus the messages. */
function validate(body: unknown): { ok: boolean; errors: string[] } {
  const result = validateWebsiteSection('linkHub', body);
  return result.ok ? { ok: true, errors: [] } : { ok: false, errors: result.errors };
}

function socialRow(platform: string, url: string) {
  const body = payload();
  const row = body.social.find((s: { platform: string }) => s.platform === platform);
  row.url = url;
  return body;
}

/* ========================================================================= */
/* 1. schema validation                                                      */
/* ========================================================================= */

test('the seeded link hub content passes its own validator', () => {
  const result = validate(payload());
  assert.deepEqual(result.errors, []);
  assert.ok(result.ok);
});

test('link hub rejects a payload that is not an object, and missing required text', () => {
  assert.ok(!validate(null).ok);
  assert.ok(!validate([]).ok);

  const noTagline = payload();
  delete noTagline.tagline;
  const result = validate(noTagline);
  assert.ok(!result.ok);
  assert.ok(
    result.errors.some((e) => e.includes('linkHub.tagline')),
    `expected an error naming linkHub.tagline, got: ${result.errors.join(' | ')}`,
  );
});

test('link hub enforces its bounded array limits', () => {
  const tooMany = payload();
  const one = tooMany.exploreItems[0];
  tooMany.exploreItems = Array.from({ length: 9 }, (_, i) => ({ ...one, id: `row-${i}` }));
  const result = validate(tooMany);
  assert.ok(!result.ok);
  assert.ok(result.errors.some((e) => e.includes('exploreItems')));

  // The social list is a fixed tuple: one row per supported platform, always.
  const shortSocial = payload();
  shortSocial.social = shortSocial.social.slice(0, 3);
  assert.ok(!validate(shortSocial).ok);
});

test('link hub refuses two rows sharing one id', () => {
  const body = payload();
  body.exploreItems[1].id = body.exploreItems[0].id;
  const result = validate(body);
  assert.ok(!result.ok);
  assert.ok(
    result.errors.some((e) => e.includes('more than one row with the id')),
    `expected a duplicate-id error, got: ${result.errors.join(' | ')}`,
  );
});

test('link hub refuses a malformed id', () => {
  const body = payload();
  body.exploreItems[0].id = 'Not A Slug!';
  assert.ok(!validate(body).ok);
});

test('link hub refuses the same platform listed twice', () => {
  const body = payload();
  body.social[1].platform = body.social[0].platform;
  const result = validate(body);
  assert.ok(!result.ok);
  assert.ok(result.errors.some((e) => e.includes('exactly once')));
});

/* ========================================================================= */
/* 2-10. the URL allowlist                                                   */
/* ========================================================================= */

test('same-origin routes are accepted as link destinations', () => {
  for (const href of ['/', '/request', '/dashboard', '/privacy', '/terms']) {
    const body = payload();
    body.primaryHref = href;
    body.exploreItems[0].href = href;
    const result = validate(body);
    assert.deepEqual(result.errors, [], `expected ${href} to be accepted`);
  }
});

test('mailto: and tel: are accepted on a contact row', () => {
  const body = payload();
  body.contactItems[0].href = 'mailto:someone@example.com';
  body.contactItems[1].href = 'tel:+201234567';
  assert.deepEqual(validate(body).errors, []);
});

test('javascript:, data: and other schemes are rejected everywhere', () => {
  const hostile = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'http://example.com',
    'https://example.com',
    '//evil.example.com',
  ];

  for (const href of hostile) {
    const onPrimary = payload();
    onPrimary.primaryHref = href;
    assert.ok(!validate(onPrimary).ok, `expected primaryHref "${href}" to be rejected`);

    const onRow = payload();
    onRow.exploreItems[0].href = href;
    assert.ok(!validate(onRow).ok, `expected an explore row href "${href}" to be rejected`);

    const onContact = payload();
    onContact.contactItems[0].href = href;
    assert.ok(!validate(onContact).ok, `expected a contact row href "${href}" to be rejected`);

    // And as a social URL, where the https + host rules apply instead.
    const onSocial = socialRow('linkedin', href);
    assert.ok(!validate(onSocial).ok, `expected a social url "${href}" to be rejected`);
  }
});

test('an in-page anchor is rejected on /links, which has no such sections', () => {
  // These ARE valid on the homepage (validateHref allows them). The link hub
  // has a separate allowlist precisely so an anchor cannot be saved here and
  // then scroll nowhere.
  for (const href of ['#contact', '#how', '#top']) {
    const body = payload();
    body.primaryHref = href;
    assert.ok(!validate(body).ok, `expected "${href}" to be rejected on the link hub`);
  }
});

test('a contact row cannot point at an ordinary page', () => {
  const body = payload();
  body.contactItems[0].href = '/request';
  const result = validate(body);
  assert.ok(!result.ok);
  assert.ok(result.errors.some((e) => e.includes('mailto: or tel:')));
});

test('a real LinkedIn URL is accepted in the LinkedIn row', () => {
  for (const url of [
    'https://www.linkedin.com/in/some-real-person',
    'https://linkedin.com/company/some-real-company',
    'https://eg.linkedin.com/in/someone',
  ]) {
    const result = validate(socialRow('linkedin', url));
    assert.deepEqual(result.errors, [], `expected ${url} to be accepted`);
  }
});

test('a real Instagram URL is accepted in the Instagram row', () => {
  const result = validate(socialRow('instagram', 'https://www.instagram.com/a.real.account'));
  assert.deepEqual(result.errors, []);
});

test('every supported platform accepts a URL on its own domain', () => {
  for (const platform of SOCIAL_PLATFORMS) {
    const result = validate(socialRow(platform.key, `https://www.${platform.domain}/real-account`));
    assert.deepEqual(result.errors, [], `expected a ${platform.domain} URL to be accepted for ${platform.key}`);
  }
});

test('a social URL on the wrong host is rejected, however plausible', () => {
  // The failure this prevents: a row labelled "Team LinkedIn" that actually
  // points somewhere else entirely.
  const wrong = validate(socialRow('instagram', 'https://www.linkedin.com/company/hydrax'));
  assert.ok(!wrong.ok);
  assert.ok(
    wrong.errors.some((e) => e.includes('instagram.com')),
    `expected the error to name the required domain, got: ${wrong.errors.join(' | ')}`,
  );

  // Lookalike hosts must not pass either.
  for (const url of [
    'https://linkedin.com.evil.example/in/x',
    'https://notlinkedin.com/in/x',
    'https://linkedin.evil.com/in/x',
  ]) {
    assert.ok(!validate(socialRow('linkedin', url)).ok, `expected ${url} to be rejected`);
  }
});

test('http is rejected for a social URL; only https is accepted', () => {
  const result = validate(socialRow('linkedin', 'http://www.linkedin.com/in/someone'));
  assert.ok(!result.ok);
  assert.ok(result.errors.some((e) => e.includes('https')));
});

test('a malformed URL is rejected rather than silently rewritten', () => {
  for (const url of ['linkedin.com/in/someone', 'https://', 'not a url at all', 'https:// spaces.com']) {
    assert.ok(!validate(socialRow('linkedin', url)).ok, `expected "${url}" to be rejected`);
  }
});

test('an accepted URL is stored exactly as typed, never normalized', () => {
  const url = 'https://www.linkedin.com/in/Some.Person-123/';
  const result = validateWebsiteSection('linkHub', socialRow('linkedin', url));
  assert.ok(result.ok);
  const stored = (result.value as { social: { platform: string; url: string }[] }).social
    .find((s) => s.platform === 'linkedin');
  assert.equal(stored?.url, url);
});

/* ========================================================================= */
/* the "no invented accounts" guarantee                                      */
/* ========================================================================= */

test('the seeded link hub configures no social account at all', () => {
  const seeded = payload();
  assert.equal(seeded.social.length, SOCIAL_PLATFORMS.length);
  for (const row of seeded.social) {
    assert.equal(row.url, '', `${row.platform} must ship with no URL — HYDRAX has no such account`);
  }
});

test('no HYDRAX social URL appears anywhere in the seeded content', () => {
  const serialized = JSON.stringify(DEFAULT_WEBSITE_CONTENT);
  for (const platform of SOCIAL_PLATFORMS) {
    assert.ok(
      !serialized.includes(platform.domain),
      `the seed must not reference ${platform.domain} — no such HYDRAX account exists`,
    );
  }
});

/* ========================================================================= */
/* 11-13. draft -> preview -> publish                                        */
/* ========================================================================= */

test('a link hub draft is visible to the admin but not to the public until published', async () => {
  const harness = await startHarness();
  try {
    await seed(harness);

    const before = await get(harness, '/api/v1/website-content');
    const publishedBefore = JSON.stringify(before.body.sections.linkHub);

    const edited = payload();
    edited.tagline.en = 'A tagline only the admin has seen.';

    const put = await adminPut(harness, '/api/v1/admin/website-content/linkHub', edited);
    assert.equal(put.status, 200);

    // The admin sees the draft, and is told it differs from live.
    const adminView = await adminGet(harness, '/api/v1/admin/website-content');
    assert.equal(adminView.body.sections.linkHub.draft.tagline.en, 'A tagline only the admin has seen.');
    assert.equal(adminView.body.sections.linkHub.has_unpublished_changes, true);

    // The public endpoint — which is the only thing /links reads — must not
        // have moved at all.
    const after = await get(harness, '/api/v1/website-content');
    assert.equal(JSON.stringify(after.body.sections.linkHub), publishedBefore);
    assert.notEqual(after.body.sections.linkHub.tagline.en, 'A tagline only the admin has seen.');
  } finally {
    await harness.close();
  }
});

test('preview reads the draft the admin endpoint returns, without publishing it', async () => {
  const harness = await startHarness();
  try {
    // Preview is a postMessage of what GET /admin/website-content returns
    // (see admin/js/cms.js openPreview + website/js/links.js's message
    // listener). What is assertable server-side is that the draft is
    // retrievable and the published row is untouched — which is exactly the
    // property that makes preview safe.
    await seed(harness);

    const edited = payload();
    edited.primaryLabel.en = 'Preview-only button label';
    await adminPut(harness, '/api/v1/admin/website-content/linkHub', edited);

    const adminView = await adminGet(harness, '/api/v1/admin/website-content');
    const entry = adminView.body.sections.linkHub;
    assert.equal(entry.draft.primaryLabel.en, 'Preview-only button label');
    assert.notEqual(entry.published.primaryLabel.en, 'Preview-only button label');

    const publicView = await get(harness, '/api/v1/website-content');
    assert.notEqual(publicView.body.sections.linkHub.primaryLabel.en, 'Preview-only button label');
  } finally {
    await harness.close();
  }
});

test('publishing the link hub makes the change public', async () => {
  const harness = await startHarness();
  try {
    const edited = payload();
    edited.tagline.en = 'Published and now live.';
    edited.exploreItems[0].label.en = 'Request your system';

    await adminPut(harness, '/api/v1/admin/website-content/linkHub', edited);
    const publish = await adminPost(harness, '/api/v1/admin/website-content/linkHub/publish', {});
    assert.equal(publish.status, 200);

    const publicView = await get(harness, '/api/v1/website-content');
    assert.equal(publicView.body.sections.linkHub.tagline.en, 'Published and now live.');
    assert.equal(publicView.body.sections.linkHub.exploreItems[0].label.en, 'Request your system');
  } finally {
    await harness.close();
  }
});

test('an invalid link hub draft is refused with the standard CMS error shape', async () => {
  const harness = await startHarness();
  try {
    await seed(harness);

    const hostile = payload();
    hostile.primaryHref = 'javascript:alert(1)';

    const res = await adminPut(harness, '/api/v1/admin/website-content/linkHub', hostile);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid content');
    // `details` is the field sendError() emits — see src/http/respond.ts.
    assert.ok(Array.isArray(res.body.details) && res.body.details.length > 0);
    assert.ok(res.body.details.some((e: string) => e.includes('linkHub.primaryHref')));

    // Nothing was stored, so nothing can later be published.
    const publicView = await get(harness, '/api/v1/website-content');
    assert.notEqual(publicView.body.sections.linkHub.primaryHref, 'javascript:alert(1)');
  } finally {
    await harness.close();
  }
});

test('a fake social URL is refused at the API boundary, not just in the browser', async () => {
  const harness = await startHarness();
  try {
    const fake = socialRow('linkedin', 'https://www.linkedin.com/company/hydrax-not-real');
    // That URL is on the right host, so it IS accepted — an admin supplying a
    // real profile is the whole point. What must be refused is one that is not
    // on the platform it claims.
    assert.equal((await adminPut(harness, '/api/v1/admin/website-content/linkHub', fake)).status, 200);

    const wrongHost = socialRow('linkedin', 'https://example.com/hydrax');
    const res = await adminPut(harness, '/api/v1/admin/website-content/linkHub', wrongHost);
    assert.equal(res.status, 400);
    assert.ok(res.body.details.some((e: string) => e.includes('linkedin.com')));
  } finally {
    await harness.close();
  }
});

/* ========================================================================= */
/* the seed matches the static fallback it was transcribed from              */
/* ========================================================================= */

test('the link hub seed still matches website/js/links-config.js', async () => {
  // links-config.js is the no-JS fallback AND the source this seed was
  // transcribed from. If they drift, a visitor with JavaScript blocked sees
  // different links from one with it enabled, and nothing else would notice.
  // website/check.mjs separately ties links-config.js to links.html's markup,
  // so this closes the last side of that triangle.
  const configUrl = new URL('../../website/js/links-config.js', import.meta.url);
  const config = await import(configUrl.href);
  const seed = DEFAULT_WEBSITE_CONTENT.linkHub;

  assert.equal(seed.primaryHref, config.PRIMARY_LINK.href);
  assert.equal(seed.primaryLabel.en, config.PRIMARY_LINK.label);
  assert.equal(seed.primaryNote.en, config.PRIMARY_LINK.note);
  assert.equal(seed.location.en, config.LOCATION);

  assert.equal(seed.exploreItems.length, config.PROJECT_LINKS.length);
  seed.exploreItems.forEach((item, i) => {
    assert.equal(item.href, config.PROJECT_LINKS[i].href);
    assert.equal(item.label.en, config.PROJECT_LINKS[i].label);
    assert.equal(item.note.en, config.PROJECT_LINKS[i].note);
  });

  assert.equal(seed.contactItems.length, config.CONTACT_LINKS.length);
  seed.contactItems.forEach((item, i) => {
    assert.equal(item.href, config.CONTACT_LINKS[i].href);
    assert.equal(item.label.en, config.CONTACT_LINKS[i].label);
    assert.equal(item.display, config.CONTACT_LINKS[i].display);
  });

  assert.equal(seed.social.length, config.SOCIAL_PLATFORMS.length);
  seed.social.forEach((row, i) => {
    const platform = config.SOCIAL_PLATFORMS[i];
    assert.equal(row.platform, platform.key);
    assert.equal(row.label.en, platform.label);
    // null in the config, '' in the CMS — both mean "no account exists".
    assert.equal(row.url, '');
    assert.equal(platform.url, null);
  });
});

test('the link hub seed matches the real links.html at the time of this test', async () => {
  const html = await readFile(
    join(import.meta.dirname, '..', '..', 'website', 'links.html'),
    'utf8',
  );
  const seed = DEFAULT_WEBSITE_CONTENT.linkHub;

  assert.ok(html.includes(seed.tagline.en), 'the seeded tagline has drifted from links.html');
  assert.ok(html.includes(seed.primaryLabel.en), 'the seeded CTA label has drifted from links.html');
  for (const item of seed.exploreItems) {
    assert.ok(html.includes(`href="${item.href}"`), `links.html has no anchor for ${item.href}`);
  }
  for (const item of seed.contactItems) {
    assert.ok(html.includes(`href="${item.href}"`), `links.html has no anchor for ${item.href}`);
  }
});

/* ========================================================================= */
/* 14-17. what the public page does with this content                        */
/* ========================================================================= */

test('a disabled or unconfigured social row is excluded from what the page renders', async () => {
  // The rendering rule lives in website/js/links.js:
  //   social.filter((item) => item.visible && item.url.trim() !== '')
  // Asserted here against the real published payload, so the data contract
  // that rule depends on cannot change without this failing.
  const harness = await startHarness();
  try {
    const body = payload();
    const linkedin = body.social.find((s: { platform: string }) => s.platform === 'linkedin');
    linkedin.url = 'https://www.linkedin.com/company/a-real-team';
    linkedin.visible = false;

    const instagram = body.social.find((s: { platform: string }) => s.platform === 'instagram');
    instagram.url = 'https://www.instagram.com/a-real-account';
    instagram.visible = true;

    await adminPut(harness, '/api/v1/admin/website-content/linkHub', body);
    await adminPost(harness, '/api/v1/admin/website-content/linkHub/publish', {});

    const publicView = await get(harness, '/api/v1/website-content');
    const social = publicView.body.sections.linkHub.social as
      { platform: string; url: string; visible: boolean }[];

    const renderable = social.filter((s) => s.visible && s.url.trim() !== '');
    assert.deepEqual(renderable.map((s) => s.platform), ['instagram']);

    // A URL that is configured but hidden is still stored — hiding a row is
    // not the same as forgetting the account — it just does not render.
    const hidden = social.find((s) => s.platform === 'linkedin');
    assert.equal(hidden?.visible, false);
    assert.notEqual(hidden?.url, '');
  } finally {
    await harness.close();
  }
});

test('with no social URLs configured, nothing renders the social section', async () => {
  const harness = await startHarness();
  try {
    await seed(harness);

    const publicView = await get(harness, '/api/v1/website-content');
    const social = publicView.body.sections.linkHub.social as { url: string; visible: boolean }[];
    const renderable = social.filter((s) => s.visible && s.url.trim() !== '');
    assert.equal(renderable.length, 0, 'the seeded state must render no social rows, and so no heading');
  } finally {
    await harness.close();
  }
});

test('Arabic text is optional and round-trips per field', async () => {
  const harness = await startHarness();
  try {
    const body = payload();
    body.tagline.ar = 'مياه تتيح لكل حقل أن يزدهر.';
    body.exploreItems[0].label.ar = 'اطلب نظام HYDRAX';
    // Left deliberately untranslated: the public renderer falls back to en.
    body.exploreItems[1].label.ar = '';

    await adminPut(harness, '/api/v1/admin/website-content/linkHub', body);
    await adminPost(harness, '/api/v1/admin/website-content/linkHub/publish', {});

    const publicView = await get(harness, '/api/v1/website-content');
    const section = publicView.body.sections.linkHub;
    assert.equal(section.tagline.ar, 'مياه تتيح لكل حقل أن يزدهر.');
    assert.equal(section.exploreItems[0].label.ar, 'اطلب نظام HYDRAX');
    assert.equal(section.exploreItems[1].label.ar, '');
    // en is always present, which is what makes the fallback total.
    assert.ok(section.exploreItems[1].label.en.length > 0);
  } finally {
    await harness.close();
  }
});

test('a script tag typed into a link hub field is stored as inert text', async () => {
  const harness = await startHarness();
  try {
    const body = payload();
    body.tagline.en = '<script>alert(1)</script> still just text';

    await adminPut(harness, '/api/v1/admin/website-content/linkHub', body);
    await adminPost(harness, '/api/v1/admin/website-content/linkHub/publish', {});

    const publicView = await get(harness, '/api/v1/website-content');
    // Stored verbatim as a string — the protection is that every renderer
    // uses textContent, never innerHTML (enforced by website/check.mjs), so
    // this can only ever be displayed, never executed.
    assert.equal(publicView.body.sections.linkHub.tagline.en, '<script>alert(1)</script> still just text');
  } finally {
    await harness.close();
  }
});
