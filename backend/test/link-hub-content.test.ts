/**
 * HYDRAX - link hub (/links) CMS tests.
 *
 * What is pinned down here:
 *
 *   - The schema, including team members, validated server-side.
 *   - The URL allowlist from both directions: every URL shape that must be
 *     accepted, and every one that must be refused — the hostile ones
 *     (javascript:, data:) and the plausible ones (a lookalike LinkedIn host).
 *   - Contact consistency with the homepage: a mismatch is refused, never
 *     silently synchronized.
 *   - The RENDER rules, tested against the real view model the page uses
 *     (website/js/links-model.js), not a re-implementation of them.
 *   - Draft -> preview -> publish.
 *   - That the seed, the static fallback and the markup cannot drift apart.
 *   - That nothing is invented: no social account, no team member.
 *
 * Fixture people below ("Test Member One", …) exist only inside the throwaway
 * schema each test creates and drops. They never reach a real database.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_WEBSITE_CONTENT, LINKHUB_SEED_V1 } from '../src/domain/website-content-seed.ts';
import {
  SOCIAL_PLATFORMS,
  upgradeSeededContent,
  validateWebsiteSection,
  type ValidationContext,
} from '../src/domain/website-content.ts';
import { adminGet, adminPost, adminPut, get, startHarness } from './helpers.ts';

type Harness = Awaited<ReturnType<typeof startHarness>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const payload = (): Json => JSON.parse(JSON.stringify(DEFAULT_WEBSITE_CONTENT.linkHub));

const CANONICAL: ValidationContext = {
  canonicalContact: {
    email: DEFAULT_WEBSITE_CONTENT.contact.email,
    phone: DEFAULT_WEBSITE_CONTENT.contact.phone,
  },
};

function validate(body: unknown, context: ValidationContext = {}): { ok: boolean; errors: string[] } {
  const result = validateWebsiteSection('linkHub', body, context);
  return result.ok ? { ok: true, errors: [] } : { ok: false, errors: result.errors };
}

const member = (overrides: Json = {}): Json => ({
  id: 'member-one',
  name: { en: 'Test Member One', ar: '' },
  role: { en: 'Firmware', ar: '' },
  linkedinUrl: 'https://www.linkedin.com/in/test-member-one',
  image: '',
  visible: true,
  ...overrides,
});

function withTeam(...members: Json[]): Json {
  const body = payload();
  body.team = members;
  return body;
}

function withMemberUrl(url: string): Json {
  return withTeam(member({ linkedinUrl: url }));
}

function socialRow(platform: string, url: string): Json {
  const body = payload();
  body.social.find((s: Json) => s.platform === platform).url = url;
  return body;
}

async function seed(harness: Harness): Promise<void> {
  await harness.repo.seedWebsiteContentIfMissing('linkHub', DEFAULT_WEBSITE_CONTENT.linkHub, new Date().toISOString());
}

/** The page's own view model — the code that decides what /links renders. */
async function loadModel(): Promise<Json> {
  return import(new URL('../../website/js/links-model.js', import.meta.url).href);
}

/* ========================================================================= */
/* 1. schema                                                                 */
/* ========================================================================= */

test('the seeded link hub content passes its own validator, with and without contact context', () => {
  assert.deepEqual(validate(payload()).errors, []);
  assert.deepEqual(validate(payload(), CANONICAL).errors, []);
});

test('link hub rejects a non-object and missing required text', () => {
  assert.ok(!validate(null).ok);
  assert.ok(!validate([]).ok);

  const noTagline = payload();
  delete noTagline.tagline;
  const result = validate(noTagline);
  assert.ok(!result.ok);
  assert.ok(result.errors.some((e) => e.includes('linkHub.tagline')));

  const noTeamHeading = payload();
  delete noTeamHeading.teamHeading;
  assert.ok(validate(noTeamHeading).errors.some((e) => e.includes('linkHub.teamHeading')));
});

test('link hub enforces its bounded arrays', () => {
  const tooManyLinks = payload();
  tooManyLinks.exploreItems = Array.from({ length: 9 }, (_, i) => ({ ...tooManyLinks.exploreItems[0], id: `row-${i}` }));
  assert.ok(validate(tooManyLinks).errors.some((e) => e.includes('exploreItems')));

  const tooManyMembers = withTeam(...Array.from({ length: 13 }, (_, i) => member({ id: `m-${i}` })));
  assert.ok(validate(tooManyMembers).errors.some((e) => e.includes('linkHub.team')));

  const shortSocial = payload();
  shortSocial.social = shortSocial.social.slice(0, 3);
  assert.ok(!validate(shortSocial).ok);
});

test('link hub refuses duplicate and malformed row ids, and a platform listed twice', () => {
  const dupRows = payload();
  dupRows.exploreItems[1].id = dupRows.exploreItems[0].id;
  assert.ok(validate(dupRows).errors.some((e) => e.includes('more than one row with the id')));

  const badId = payload();
  badId.exploreItems[0].id = 'Not A Slug!';
  assert.ok(!validate(badId).ok);

  const dupPlatform = payload();
  dupPlatform.social[1].platform = dupPlatform.social[0].platform;
  assert.ok(validate(dupPlatform).errors.some((e) => e.includes('exactly once')));
});

/* ========================================================================= */
/* 2. team members                                                           */
/* ========================================================================= */

test('an empty team is accepted — it is the honest default', () => {
  assert.deepEqual(validate(withTeam()).errors, []);
});

test('a valid team member is accepted, in both languages and with a photo', () => {
  const result = validate(withTeam(
    member(),
    member({
      id: 'member-two',
      name: { en: 'Test Member Two', ar: 'عضو اختبار' },
      role: { en: 'Hardware', ar: 'العتاد' },
      linkedinUrl: 'https://linkedin.com/in/test-member-two/',
      image: '/assets/logo.jpeg',
    }),
  ));
  assert.deepEqual(result.errors, []);
});

test('a team member needs a name, but role, LinkedIn and photo are optional', () => {
  const nameless = validate(withTeam(member({ name: { en: '', ar: '' } })));
  assert.ok(nameless.errors.some((e) => e.includes('linkHub.team[0].name')));

  const minimal = validate(withTeam(member({ role: { en: '', ar: '' }, linkedinUrl: '', image: '' })));
  assert.deepEqual(minimal.errors, []);
});

test('duplicate member ids are rejected', () => {
  const result = validate(withTeam(member(), member({ name: { en: 'Someone Else', ar: '' } })));
  assert.ok(result.errors.some((e) => e.includes('more than one member with the id "member-one"')));
});

test('a malformed LinkedIn URL is rejected, never rewritten', () => {
  for (const url of [
    'linkedin.com/in/someone',
    'www.linkedin.com/in/someone',
    'https://',
    'not a url',
    'https:// www.linkedin.com/in/x',
    ' https://www.linkedin.com/in/x',
    'https://www.linkedin.com/in/x ',
  ]) {
    assert.ok(!validate(withMemberUrl(url)).ok, `expected "${url}" to be rejected`);
  }
});

test('a fake or lookalike LinkedIn domain is rejected for a member', () => {
  for (const url of [
    'https://linkedin.com.evil.example/in/x',
    'https://www.linkedin.com.evil.example/in/x',
    'https://notlinkedin.com/in/x',
    'https://evil.example/linkedin.com/in/x',
    'https://example.com/?u=https://www.linkedin.com/in/x',
    // Real LinkedIn subdomains, but not the two hosts a member link may use.
    'https://eg.linkedin.com/in/x',
    'https://lnkd.in/abc',
  ]) {
    const result = validate(withMemberUrl(url));
    assert.ok(!result.ok, `expected "${url}" to be rejected`);
    assert.ok(result.errors.some((e) => e.includes('linkHub.team[0].linkedinUrl')));
  }
});

test('an http:// LinkedIn URL is rejected; only https is accepted', () => {
  const result = validate(withMemberUrl('http://www.linkedin.com/in/test-member-one'));
  assert.ok(!result.ok);
  assert.ok(result.errors.some((e) => e.includes('https://')));
});

test('javascript:, data: and other schemes are rejected as a member LinkedIn URL', () => {
  for (const url of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'file:///etc/passwd',
    '//www.linkedin.com/in/x',
  ]) {
    assert.ok(!validate(withMemberUrl(url)).ok, `expected "${url}" to be rejected`);
  }
});

test('a LinkedIn URL must name a profile, and may not smuggle credentials or a port', () => {
  for (const url of [
    'https://www.linkedin.com',
    'https://www.linkedin.com/',
    'https://user:pass@www.linkedin.com/in/x',
    'https://www.linkedin.com:8443/in/x',
  ]) {
    assert.ok(!validate(withMemberUrl(url)).ok, `expected "${url}" to be rejected`);
  }
});

test('accepted LinkedIn URLs are stored exactly as typed', () => {
  for (const url of [
    'https://www.linkedin.com/in/test-member-one',
    'https://linkedin.com/in/Test.Member-1/',
    'https://www.linkedin.com/in/test-member-one?locale=ar_AE',
  ]) {
    const result = validateWebsiteSection('linkHub', withMemberUrl(url));
    assert.ok(result.ok, `expected "${url}" to be accepted`);
    assert.equal((result.value as Json).team[0].linkedinUrl, url);
  }
});

test('profile images must be CMS uploads or site assets, never external or inline', () => {
  const accepted = [
    '',
    '/assets/logo.jpeg',
    '/assets/uploads/123e4567-e89b-12d3-a456-426614174000.jpg',
    '/assets/uploads/123e4567-e89b-12d3-a456-426614174000.webp',
  ];
  for (const image of accepted) {
    assert.deepEqual(validate(withTeam(member({ image }))).errors, [], `expected image "${image}" to be accepted`);
  }

  const refused = [
    'https://example.com/me.jpg',
    'http://example.com/me.jpg',
    '//example.com/me.jpg',
    'data:image/png;base64,iVBORw0KGgo=',
    'javascript:alert(1)',
    '/assets/uploads/../../secrets.jpg',
    '/assets/uploads/not-a-uuid.jpg',
    '/assets/logo.svg',
  ];
  for (const image of refused) {
    const result = validate(withTeam(member({ image })));
    assert.ok(!result.ok, `expected image "${image}" to be rejected`);
    assert.ok(result.errors.some((e) => e.includes('linkHub.team[0].image')));
  }
});

/* ========================================================================= */
/* 3. link destinations and social accounts                                  */
/* ========================================================================= */

test('same-origin routes are accepted; footer links may also use homepage anchors', () => {
  for (const href of ['/', '/request', '/dashboard', '/privacy', '/terms']) {
    const body = payload();
    body.primaryHref = href;
    body.exploreItems[0].href = href;
    assert.deepEqual(validate(body).errors, [], `expected ${href} to be accepted`);
  }
  const footer = payload();
  footer.footerLinks[0].href = '#contact';
  assert.deepEqual(validate(footer).errors, []);
});

test('javascript:, data: and external origins are rejected on every link field', () => {
  const hostile = [
    'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox(1)',
    'file:///etc/passwd', 'http://example.com', 'https://example.com', '//evil.example.com',
  ];
  for (const href of hostile) {
    const onPrimary = payload();
    onPrimary.primaryHref = href;
    assert.ok(!validate(onPrimary).ok, `primaryHref "${href}"`);

    const onRow = payload();
    onRow.exploreItems[0].href = href;
    assert.ok(!validate(onRow).ok, `explore href "${href}"`);

    const onContact = payload();
    onContact.contactItems[0].href = href;
    assert.ok(!validate(onContact).ok, `contact href "${href}"`);

    assert.ok(!validate(socialRow('linkedin', href)).ok, `social url "${href}"`);
  }
});

test('an in-page anchor is rejected as a link hub destination, and a contact row cannot be a page', () => {
  for (const href of ['#contact', '#how', '#top']) {
    const body = payload();
    body.primaryHref = href;
    assert.ok(!validate(body).ok, `"${href}"`);
  }
  const contactPage = payload();
  contactPage.contactItems[0].href = '/request';
  assert.ok(validate(contactPage).errors.some((e) => e.includes('mailto: or tel:')));
});

test('every social platform accepts a URL on its own domain, and only there', () => {
  for (const platform of SOCIAL_PLATFORMS) {
    assert.deepEqual(validate(socialRow(platform.key, `https://www.${platform.domain}/real-account`)).errors, []);
  }
  assert.ok(!validate(socialRow('instagram', 'https://www.linkedin.com/company/x')).ok);
  assert.ok(!validate(socialRow('linkedin', 'https://linkedin.com.evil.example/x')).ok);
  assert.ok(!validate(socialRow('instagram', 'http://www.instagram.com/x')).ok);
});

/* ========================================================================= */
/* 4. contact consistency with the homepage                                  */
/* ========================================================================= */

test('a contact email matching the homepage is accepted', () => {
  const body = payload();
  body.contactItems[0].href = `mailto:${DEFAULT_WEBSITE_CONTENT.contact.email.toUpperCase()}`;
  assert.deepEqual(validate(body, CANONICAL).errors, []);
});

test('a contact email that differs from the homepage is rejected, naming the field', () => {
  const body = payload();
  body.contactItems[0].href = 'mailto:someone-else@example.com';
  const result = validate(body, CANONICAL);
  assert.ok(!result.ok);
  const error = result.errors.find((e) => e.includes('linkHub.contactItems[0].href'));
  assert.ok(error, `expected an error naming the field, got: ${result.errors.join(' | ')}`);
  assert.ok(error.includes('contact.email'));
  assert.ok(error.includes('someone-else@example.com'));

  // The shown value is checked too: a row that reads one address and mails another is refused.
  const display = payload();
  display.contactItems[0].display = 'someone-else@example.com';
  assert.ok(validate(display, CANONICAL).errors.some((e) => e.includes('linkHub.contactItems[0].display')));
});

test('a contact phone matching the homepage is accepted, in international or local form', () => {
  // Homepage: "0127 915 9200". Link hub dials "+201279159200" and shows the local form.
  assert.deepEqual(validate(payload(), CANONICAL).errors, []);

  const spaced = payload();
  spaced.contactItems[1].href = 'tel:+20 127 915 9200';
  spaced.contactItems[1].display = '+20 127 915 9200';
  assert.deepEqual(validate(spaced, CANONICAL).errors, []);
});

test('a contact phone that differs from the homepage is rejected, naming the field', () => {
  const body = payload();
  body.contactItems[1].href = 'tel:+201000000000';
  const result = validate(body, CANONICAL);
  assert.ok(!result.ok);
  const error = result.errors.find((e) => e.includes('linkHub.contactItems[1].href'));
  assert.ok(error, `expected an error naming the field, got: ${result.errors.join(' | ')}`);
  assert.ok(error.includes('contact.phone'));

  const display = payload();
  display.contactItems[1].display = '0100 000 0000';
  assert.ok(validate(display, CANONICAL).errors.some((e) => e.includes('linkHub.contactItems[1].display')));

  // A short fragment of the real number must not count as a match.
  const fragment = payload();
  fragment.contactItems[1].href = 'tel:9200';
  assert.ok(!validate(fragment, CANONICAL).ok);
});

test('the API refuses a link hub save whose contact details disagree with the published homepage', async () => {
  const harness = await startHarness();
  try {
    const now = new Date().toISOString();
    await harness.repo.seedWebsiteContentIfMissing(
      'contact', { ...DEFAULT_WEBSITE_CONTENT.contact, email: 'new-address@example.com' }, now,
    );

    const res = await adminPut(harness, '/api/v1/admin/website-content/linkHub', payload());
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid content');
    assert.ok(res.body.details.some((e: string) => e.includes('linkHub.contactItems[0]') && e.includes('contact.email')));

    // Nothing was synchronized behind the admin's back: the homepage keeps its value.
    const publicView = await get(harness, '/api/v1/website-content');
    assert.equal(publicView.body.sections.contact.email, 'new-address@example.com');
  } finally {
    await harness.close();
  }
});

test('publishing a link hub draft is refused if the homepage contact changed after it was saved', async () => {
  const harness = await startHarness();
  try {
    assert.equal((await adminPut(harness, '/api/v1/admin/website-content/linkHub', payload())).status, 200);

    await harness.repo.seedWebsiteContentIfMissing(
      'contact', { ...DEFAULT_WEBSITE_CONTENT.contact, phone: '0100 000 0000' }, new Date().toISOString(),
    );

    const publish = await adminPost(harness, '/api/v1/admin/website-content/linkHub/publish', {});
    assert.equal(publish.status, 409);
    assert.ok(publish.body.details.some((e: string) => e.includes('contact.phone')));
  } finally {
    await harness.close();
  }
});

/* ========================================================================= */
/* 5. nothing invented                                                       */
/* ========================================================================= */

test('the seed contains no team member and no social account', () => {
  const seeded = payload();
  assert.deepEqual(seeded.team, []);
  for (const row of seeded.social) assert.equal(row.url, '', `${row.platform} must ship with no URL`);

  const serialized = JSON.stringify(DEFAULT_WEBSITE_CONTENT);
  for (const platform of SOCIAL_PLATFORMS) {
    assert.ok(!serialized.includes(platform.domain), `the seed must not reference ${platform.domain}`);
  }
});

/* ========================================================================= */
/* 6. what the page renders — the real view model                           */
/* ========================================================================= */

test('a disabled team member is not rendered', async () => {
  const { buildViewModel } = await loadModel();
  const model = buildViewModel(withTeam(
    member({ id: 'a', name: { en: 'Shown Member', ar: '' } }),
    member({ id: 'b', name: { en: 'Hidden Member', ar: '' }, visible: false }),
  ), 'en');
  assert.deepEqual(model.team.members.map((m: Json) => m.name), ['Shown Member']);
});

test('members render in stored order and are numbered by what is shown', async () => {
  const { buildViewModel } = await loadModel();
  const model = buildViewModel(withTeam(
    member({ id: 'c', name: { en: 'Third Stored', ar: '' } }),
    member({ id: 'a', name: { en: 'Hidden', ar: '' }, visible: false }),
    member({ id: 'b', name: { en: 'Second Stored', ar: '' } }),
  ), 'en');
  assert.deepEqual(model.team.members.map((m: Json) => [m.index, m.name]), [['01', 'Third Stored'], ['02', 'Second Stored']]);
});

test('a member renders a LinkedIn action with a descriptive label only when a URL exists', async () => {
  const { buildViewModel } = await loadModel();
  const model = buildViewModel(withTeam(
    member({ id: 'a', name: { en: 'Has Profile', ar: '' } }),
    member({ id: 'b', name: { en: 'No Profile', ar: '' }, linkedinUrl: '' }),
  ), 'en');
  const [withProfile, without] = model.team.members;
  assert.equal(withProfile.linkedin.href, 'https://www.linkedin.com/in/test-member-one');
  assert.equal(withProfile.linkedin.ariaLabel, "View Has Profile's LinkedIn profile (opens in a new tab)");
  assert.equal(without.linkedin, null);
  assert.equal(without.initials, 'NP');
});

test('the team and social sections are absent when empty, and numbering closes up', async () => {
  const { buildViewModel } = await loadModel();
  const model = buildViewModel(payload(), 'en');
  assert.equal(model.team.members.length, 0);
  assert.equal(model.team.number, '');
  assert.equal(model.social.items.length, 0);
  assert.equal(model.social.number, '');
  assert.equal(model.explore.number, '01');
  assert.equal(model.contact.number, '02');
});

test('a real, visible social link is rendered; hidden or empty ones are not', async () => {
  const { buildViewModel } = await loadModel();
  const body = payload();
  body.social.find((s: Json) => s.platform === 'instagram').url = 'https://www.instagram.com/a-real-account';
  const hidden = body.social.find((s: Json) => s.platform === 'youtube');
  hidden.url = 'https://www.youtube.com/@a-real-channel';
  hidden.visible = false;

  const model = buildViewModel(body, 'en');
  assert.deepEqual(model.social.items.map((s: Json) => [s.platform, s.href]), [['instagram', 'https://www.instagram.com/a-real-account']]);
  assert.equal(model.social.number, '02');
  assert.equal(model.contact.number, '03');
});

test('Arabic renders Arabic where entered and falls back to English per field', async () => {
  const { buildViewModel } = await loadModel();
  const body = withTeam(member({
    name: { en: 'Test Member One', ar: 'عضو الاختبار الأول' },
    role: { en: 'Firmware', ar: '' },
  }));
  body.tagline.ar = 'مياه تتيح لكل حقل أن يزدهر.';

  const ar = buildViewModel(body, 'ar');
  assert.equal(ar.lang, 'ar');
  assert.equal(ar.tagline, 'مياه تتيح لكل حقل أن يزدهر.');
  assert.equal(ar.intro, body.intro.en, 'an untranslated field falls back to English');
  assert.equal(ar.team.members[0].name, 'عضو الاختبار الأول');
  assert.equal(ar.team.members[0].role, 'Firmware');
  assert.ok(ar.team.members[0].linkedin.ariaLabel.includes('عرض ملف عضو الاختبار الأول'));
  assert.equal(ar.team.members[0].initials, 'عا');

  const en = buildViewModel(body, 'en');
  assert.equal(en.tagline, 'Water that lets every field thrive.');
  assert.equal(en.team.members[0].name, 'Test Member One');
});

test('initials handle one-word, multi-word and Arabic names', async () => {
  const { initialsOf } = await loadModel();
  assert.equal(initialsOf('Test'), 'T');
  assert.equal(initialsOf('test member one'), 'TO');
  assert.equal(initialsOf('  spaced   name  '), 'SN');
  assert.equal(initialsOf('عضو الاختبار'), 'عا');
  assert.equal(initialsOf(''), '');
});

/* ========================================================================= */
/* 7. draft -> preview -> publish                                            */
/* ========================================================================= */

test('a link hub draft is visible to the admin but does not change the public content', async () => {
  const harness = await startHarness();
  try {
    await seed(harness);
    const before = JSON.stringify((await get(harness, '/api/v1/website-content')).body.sections.linkHub);

    const edited = withTeam(member());
    assert.equal((await adminPut(harness, '/api/v1/admin/website-content/linkHub', edited)).status, 200);

    const adminView = await adminGet(harness, '/api/v1/admin/website-content');
    assert.equal(adminView.body.sections.linkHub.draft.team.length, 1);
    assert.equal(adminView.body.sections.linkHub.has_unpublished_changes, true);

    const after = (await get(harness, '/api/v1/website-content')).body.sections.linkHub;
    assert.equal(JSON.stringify(after), before);
    assert.equal(after.team.length, 0);
  } finally {
    await harness.close();
  }
});

test('preview has the draft to show while the public content stays unpublished', async () => {
  const harness = await startHarness();
  try {
    await seed(harness);
    await adminPut(harness, '/api/v1/admin/website-content/linkHub', withTeam(member()));

    // Preview posts what the admin endpoint returns into the page (admin/js/cms.js
    // openPreview -> website/js/links.js). The draft must be there to post, and
    // the real view model must render the member from it.
    const entry = (await adminGet(harness, '/api/v1/admin/website-content')).body.sections.linkHub;
    const { buildViewModel } = await loadModel();
    assert.equal(buildViewModel(entry.draft ?? entry.published, 'en').team.members[0].name, 'Test Member One');
    assert.equal(entry.published.team.length, 0);

    assert.equal((await get(harness, '/api/v1/website-content')).body.sections.linkHub.team.length, 0);
  } finally {
    await harness.close();
  }
});

test('publishing makes the team member public', async () => {
  const harness = await startHarness();
  try {
    await seed(harness);
    await adminPut(harness, '/api/v1/admin/website-content/linkHub', withTeam(member()));
    assert.equal((await adminPost(harness, '/api/v1/admin/website-content/linkHub/publish', {})).status, 200);

    const section = (await get(harness, '/api/v1/website-content')).body.sections.linkHub;
    assert.equal(section.team.length, 1);
    assert.equal(section.team[0].linkedinUrl, 'https://www.linkedin.com/in/test-member-one');
  } finally {
    await harness.close();
  }
});

test('an invalid member is refused at the API with the standard CMS error shape, and nothing is stored', async () => {
  const harness = await startHarness();
  try {
    await seed(harness);
    const res = await adminPut(
      harness, '/api/v1/admin/website-content/linkHub', withMemberUrl('https://linkedin.com.evil.example/in/x'),
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid content');
    assert.ok(res.body.details.some((e: string) => e.includes('linkHub.team[0].linkedinUrl')));

    const draft = (await adminGet(harness, '/api/v1/admin/website-content')).body.sections.linkHub.draft;
    assert.equal(draft.team.length, 0);
  } finally {
    await harness.close();
  }
});

test('a script tag typed into a member name is stored as inert text', async () => {
  const harness = await startHarness();
  try {
    await seed(harness);
    const hostile = withTeam(member({ name: { en: '<script>alert(1)</script> Name', ar: '' } }));
    await adminPut(harness, '/api/v1/admin/website-content/linkHub', hostile);
    await adminPost(harness, '/api/v1/admin/website-content/linkHub/publish', {});
    const section = (await get(harness, '/api/v1/website-content')).body.sections.linkHub;
    // Stored verbatim; links.js only ever sets it with textContent (check.mjs
    // forbids innerHTML), so it can be displayed but never executed.
    assert.equal(section.team[0].name.en, '<script>alert(1)</script> Name');
  } finally {
    await harness.close();
  }
});

/* ========================================================================= */
/* 8. anti-drift                                                             */
/* ========================================================================= */

test('the link hub seed is exactly the static fallback in website/js/links-config.js', async () => {
  const config = await import(new URL('../../website/js/links-config.js', import.meta.url).href);
  assert.deepEqual(DEFAULT_WEBSITE_CONTENT.linkHub, config.LINK_HUB_FALLBACK);
});

test('the seed matches the real links.html markup', async () => {
  const html = await readFile(join(import.meta.dirname, '..', '..', 'website', 'links.html'), 'utf8');
  const seedContent = DEFAULT_WEBSITE_CONTENT.linkHub;
  for (const text of [seedContent.eyebrow.en, seedContent.tagline.en, seedContent.intro.en, seedContent.primaryLabel.en,
    seedContent.exploreHeading.en, seedContent.teamHeading.en, seedContent.location.en]) {
    assert.ok(html.includes(text), `links.html does not contain the seeded text "${text}"`);
  }
  for (const item of [...seedContent.exploreItems, ...seedContent.contactItems]) {
    assert.ok(html.includes(`href="${item.href}"`), `links.html has no anchor for ${item.href}`);
  }
});

/* ========================================================================= */
/* 9. upgrading a database seeded by the first release                       */
/* ========================================================================= */

function v1Row(): Json {
  const row = payload();
  delete row.teamHeading;
  delete row.teamIntro;
  delete row.team;
  Object.assign(row, JSON.parse(JSON.stringify(LINKHUB_SEED_V1)));
  return row;
}

test('the upgrade fills new fields, refreshes untouched defaults, keeps edits, and is idempotent', () => {
  const stored = v1Row();
  // Key order exactly as Postgres JSONB returns it. An untouched default must
  // still be recognised as untouched — the regression this line guards.
  stored.eyebrow = { ar: stored.eyebrow.ar, en: stored.eyebrow.en };
  stored.intro = { ar: stored.intro.ar, en: stored.intro.en };
  stored.tagline = { en: 'An admin edited this.', ar: '' };
  // Not a V1 default an admin could have kept: an edit.
  stored.exploreHeading = { en: 'Our links', ar: '' };

  const upgraded = upgradeSeededContent(stored, LINKHUB_SEED_V1, DEFAULT_WEBSITE_CONTENT.linkHub);
  assert.ok(upgraded);
  assert.deepEqual(upgraded.team, []);
  assert.deepEqual(upgraded.teamHeading, DEFAULT_WEBSITE_CONTENT.linkHub.teamHeading);
  assert.deepEqual(upgraded.eyebrow, DEFAULT_WEBSITE_CONTENT.linkHub.eyebrow, 'an untouched default moves forward');
  assert.deepEqual(upgraded.tagline, { en: 'An admin edited this.', ar: '' }, 'an edit is kept');
  assert.deepEqual(upgraded.exploreHeading, { en: 'Our links', ar: '' }, 'an edit is kept');
  assert.deepEqual(validate(upgraded, CANONICAL).errors, []);

  assert.equal(upgradeSeededContent(upgraded, LINKHUB_SEED_V1, DEFAULT_WEBSITE_CONTENT.linkHub), null);
});

test('the boot upgrade brings a first-release database row up to date in place', async () => {
  const harness = await startHarness();
  try {
    await harness.repo.seedWebsiteContentIfMissing('linkHub', v1Row(), new Date().toISOString());
    const upgrade = (stored: unknown) => upgradeSeededContent(stored, LINKHUB_SEED_V1, DEFAULT_WEBSITE_CONTENT.linkHub);

    assert.deepEqual(await harness.repo.upgradeWebsiteContent('linkHub', upgrade, new Date().toISOString()),
      { draft: true, published: true });
    assert.deepEqual(await harness.repo.upgradeWebsiteContent('linkHub', upgrade, new Date().toISOString()),
      { draft: false, published: false }, 'a second boot changes nothing');

    const section = (await get(harness, '/api/v1/website-content')).body.sections.linkHub;
    assert.deepEqual(section.team, []);
    assert.deepEqual(section, DEFAULT_WEBSITE_CONTENT.linkHub);
    // And it can be saved again through the API, which a V1 row could not.
    assert.equal((await adminPut(harness, '/api/v1/admin/website-content/linkHub', section)).status, 200);
  } finally {
    await harness.close();
  }
});
