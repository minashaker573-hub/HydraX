# HYDRAX — Website content management (CMS)

How an authorized admin edits the public website's text, images and section
order through the existing Admin Console, without touching source code. This
is a content editor, not a page builder: the admin changes **values** in a
fixed set of fields; the website's layout, components and code stay exactly
as they were. See `docs/WEBSITE.md` for the site's own structure — that
document predates the current "organic" redesign (see git history: `ca92e4e`,
`7ce1085`) and is stale in places; this document describes the page as it
actually exists today, which is what the CMS was built against.

**CMS polish pass (2026-09-05):** a follow-up audit fixed three real bugs and
closed two content gaps found by re-reading the site and the admin code with
fresh eyes, without touching the architecture in §2:

1. **Full RTL support.** The site had `dir`/`lang` switching but several CSS
   rules used physical `left`/`right` values that don't flip under
   `dir="rtl"` — converted to logical properties (`inset-inline-*`,
   `margin-inline-*`, `padding-inline-*`, `border-inline-*`,
   `text-align: start`) throughout `website/styles.css`. The four secondary
   pages (`request.html`, `privacy.html`, `terms.html`, `404.html`) had no
   language/direction handling at all — a new minimal `website/js/chrome.js`
   gives them the same `dir`/`lang` persistence and language toggle as the
   homepage, and their nav's inline `style="margin-left: auto"` (which
   physically cannot flip for RTL) became a real CSS class. See §7 for what
   this does and doesn't cover.
2. **Navigation reorder bug.** `website/js/site.js`'s active-link
   highlighting captured `.nav-links`' anchors once, at page load — but the
   CMS rebuilds those anchors asynchronously (initial load, every language
   switch, a reordered nav). After a rebuild, the old code kept toggling
   classes on detached, invisible nodes. Fixed by re-querying the live
   anchors and re-binding the `IntersectionObserver` whenever
   `js/content.js` dispatches a new `hydrax:nav-updated` event; matching a
   scrolled-to section to its nav link was, and remains, by comparing each
   anchor's own `href` to the section's `id` — never by array position.
3. **Section reorder divider bug.** The decorative hero→content SVG divider
   was a static sibling between the hero and whichever section happened to
   be first in the original markup. Reordering sections left it stranded in
   its original position. `js/content.js`'s `renderSectionOrder` now moves
   `#field-line-divider` to sit immediately before whichever reorderable
   section is actually first (or hides it if every reorderable section is
   hidden), re-derived from the live order/enabled state every time.
4. **A phantom field removed.** `navigation.brandTagline` validated and
   accepted edits but had no element bound to it anywhere on the page — an
   editable field that visibly does nothing. Removed rather than wired up
   silently, per "do not claim something is editable unless it is."
5. **Two real content gaps closed.** `footer.links` (the footer's own
   9-link nav, previously fully hardcoded and not the same list as
   `navigation.items`) and a new `settings` section (site logo/favicon,
   the sticky mobile CTA's text and button, a default CTA) — see §4 and §6.

---

## 1. The audit this was built from

Before anything here was written, `website/index.html` was read end to end.
The live page (the organic redesign) is a single page with these sections,
in this order: **nav**, **hero**, **problem** ("the field problem"), **how**
("how HYDRAX works", three fixed steps), **product** ("the platform" —
this *is* the live-monitoring/dashboard-preview content), **benefits**,
**field** ("built for the field" — the photography + verification-numbers
section), **contact** (the final CTA), **footer**. Four standalone pages sit
alongside it, out of the CMS's scope by design: `request.html` (the quote
form), `privacy.html`, `terms.html`, `404.html`.

This did **not** match the structure the original CMS brief assumed. The
brief described sections from an earlier, dark-industrial redesign that is no
longer live: a five-stage SENSE/UNDERSTAND/DECIDE/ACT/MONITOR flow, a
dedicated "Edge Intelligence" section, a "Soil to Valve" flow diagram, and a
separate "Engineering Status" section. None of those exist on the page today.
Rather than inventing CMS fields for sections that are not on the site (which
`docs/WEBSITE.md`'s own stale table shows is exactly how documentation drifts
from reality), the CMS was built around the real page:

- "System / product" and "Live monitoring" in the brief are the same real
  content — the single `product` section (dashboard screenshot + capability
  list). One CMS section, not two.
- "How HYDRAX thinks" maps to the real `how` section, which has **three**
  fixed steps, not five — the numbering and stagger animation are built
  around that count (`website/styles.css`'s `.works-flow`).
- "Field problem" is two prose paragraphs on the real page, not an itemized
  card list — the CMS edits paragraphs, not invented cards.
- "Engineering status" has no dedicated section on the live page. The
  closest real content is `field`'s lede paragraph (which already states,
  in prose, that firmware is verified and hardware validation is pending —
  see `docs/HARDWARE_VALIDATION.md`) plus the verification-numbers strip.
  The CMS gives this a small piece of genuine new structure — `field`'s
  `statusBadges` — so that existing true claim can be *restated* with a
  controlled status enum instead of free prose, without inventing a new
  section or a new claim. See §6 for why this is a disclosed, deliberate,
  small addition rather than "everything already existed."
- "Edge intelligence" and "Soil to valve" do not exist on the live page.
  Building CMS sections for them would mean adding new sections to the
  page — the opposite of "the public website design must remain intact."
  They are intentionally **not** part of the CMS (see §6, item B).

## 2. Architecture

**Content model.** One fixed TypeScript interface and validator per real
section — `backend/src/domain/website-content.ts`. There is no generic
"block" type. Every text field is `{ en, ar }`; `en` is required, `ar` may be
empty ("not translated yet"). Arrays are either exact-length tuples (`how`'s
3 steps, `field`'s 2 gallery photos — the layout has exactly that many slots)
or bounded ranges (`benefits`' 3–8 items) — enforced server-side, matching the
page's real layout capacity, not an arbitrary limit.

**Storage.** Two Postgres tables, added the same way every other table in
this project is (`CREATE TABLE IF NOT EXISTS` in `schema.sql`, applied on
every boot — this project has no separate migration mechanism):

- `website_content(section, status, data, updated_at, published_at)` — one
  row per section per status (`draft` | `published`). Publishing copies
  draft → published; the public endpoint reads only `published` rows. A
  draft, however far along, is never reachable without the admin key.
- `website_media(id, filename, original_name, content_type, size_bytes,
  alt_text, uploaded_at)` — uploaded file metadata. The files themselves live
  in `website/assets/uploads/`, a subdirectory of the already-served
  `websiteDir` — no new static-serving route was needed, only upload/list/
  delete.

**Seeding.** At boot, `server.ts` calls `repo.seedWebsiteContentIfMissing`
for every section with the *real current copy* transcribed from
`website/index.html`, verbatim — `backend/src/domain/website-content-seed.ts`.
Each insert is an independent `ON CONFLICT DO NOTHING`: the first boot with
the new tables populates them with what the site already says; every boot
after that is a no-op, and a later admin edit is never overwritten. Every
seeded Arabic field is `''` — no Arabic translation is invented; the fallback
described below shows English until an admin enters one.

**Bilingual fallback.** `website/js/i18n.js` tracks the active language and
sets `<html lang>`/`<html dir>`. `website/js/content.js` shows the Arabic
value if the current language is Arabic *and* that field's Arabic value is
non-empty, else English — the same fallback rule the dashboard's i18n already
uses. The website had no i18n of its own before this; `i18n.js` is a
deliberately minimal port of the dashboard's API shape (`getLang`, `setLang`,
`isRtl`, `applyDocumentDirection`, `onLangChange`), not a new pattern.

**Validation, not sanitization.** Nothing free-form is trusted:

- `validateHref` — an href may only be one of the page's real in-page
  anchors, a real internal route, `mailto:`, or `tel:`. No external domain,
  no `javascript:`/`data:` scheme.
- `validateImageRef` — an image may only be a file this CMS's media library
  created (`/assets/uploads/<uuid>.(jpg|jpeg|png|webp)`), or one of the
  site's original seeded photos. No arbitrary or external URL, no path
  traversal.
- `findUnmeasuredClaims` (`backend/src/domain/honesty-guard.ts`) — a
  TypeScript port of `website/check.mjs`'s existing static-file honesty
  check, applied at the moment content is *written* through the CMS, not
  just at CI time against static HTML. An admin cannot type a new "X%
  saved" claim, a new "AI-powered"/"predicts failure" capability claim, or a
  claim about telemetry this hardware does not support (flow, pump
  condition, weather, temperature, remote control) into any text field —
  see `docs/WEBSITE.md`'s "rule that shapes this site." Naming an absent
  capability to say it doesn't exist (the real "Not shown: water flow..."
  copy) is correctly *not* flagged; claiming it exists is.
- No admin-provided string is ever rendered as HTML. `website/js/content.js`
  and `admin/js/cms.js` both use `textContent`/`setAttribute` exclusively —
  enforced by the existing `check.mjs` scripts in both `website/` and
  `admin/`, which fail the build on `innerHTML`/`insertAdjacentHTML`.
- Every mutating endpoint requires the existing admin key
  (`authorizeAdmin`/`X-Admin-Key`, constant-time comparison) — the same
  mechanism `requests.ts` already uses for quote management. No new auth
  system.

**Draft → publish.** `PUT /api/v1/admin/website-content/:section` validates
and saves a draft. `POST .../:section/publish` re-validates the *stored*
draft (defensively — the schema can change between save and publish) and
copies it to `published`; 404 if there is no draft, 409 if the stored draft
no longer validates. `GET /api/v1/website-content` (public, unauthenticated)
returns published content only. `GET /api/v1/admin/website-content` (admin)
returns both, plus `has_unpublished_changes` (a plain diff of the two) and
timestamps, so the admin UI always knows whether it is showing draft or live,
and never claims a save is "published" when it is only a draft.

**Preview.** The admin's Preview button opens the real `website/index.html`
in an iframe and posts the in-progress draft to it over `postMessage` — the
same rendering code a visitor gets, with a visible "PREVIEW — draft content,
not the live site" banner. Draft content is never exposed over the network
to do this; the message is same-origin only (`content.js` checks
`event.origin`), and the iframe is same-origin under this project's existing
CSP (`frame-ancestors 'self'`).

## 3. What an admin can do

Console → **Website content** tab (`admin/index.html`, `admin/js/cms.js`):
a left-hand list of sections (Hero, Navigation, Field problem, How it works,
Product, Benefits, Built for the field, Final CTA/contact, Footer, SEO,
Site settings, Media library, Sections & publishing), a form per section built from the
fixed field schema in `admin/js/cms.js`'s `SECTION_SCHEMA` (which mirrors
`website-content.ts`'s validators — same max lengths, same min/max item
counts), an ENGLISH/العربية language switch that shows one language's inputs
at a time, and Save draft / Save & publish per section. Repeating fields
(nav links, how-steps, gallery photos, status badges, stats, etc.) can be
reordered with ↑/↓ and added/removed within the same bounds the backend
enforces — a fixed-count field (how's 3 steps, field's 2 gallery photos) has
no add/remove, only reorder and edit.

**Sections & publishing** additionally shows every section's publish status
(draft saved? published? pending changes? when) with a one-click Publish, and
a homepage section-order editor for the five sections that can actually be
reordered or hidden without breaking the page — `problem`, `how`, `product`,
`benefits`, `field`. Hero, navigation, contact and footer are structural
chrome, not ordinary content, the same way `request.html`/`privacy.html`/
`terms.html`/`404.html` are separate pages, not entries in this list.

**Media library** uploads a real file (JPEG/PNG/WebP only — SVG is refused,
since an uploaded SVG can carry a `<script>`), lists what's uploaded, and
deletes only an image no draft or published section currently references.

**Site settings** (`settings`, added by the polish pass) is deliberately
narrow — genuinely site-wide, genuinely content-level values that were
previously hardcoded in more than one place, not a theme editor: the site
logo (drives the nav/footer brand image on the homepage and the favicon),
the sticky mobile CTA's headline and button, and a default CTA label/link.
It cannot touch CSS, fonts, colors, or layout — the image field uses the
same upload/allowlist as every other image, and the link field uses the
same href allowlist as every other link.

## 4. Public site integration

`website/index.html` gained `data-field` / `data-field-href` /
`data-field-src` / `data-field-alt` / `data-field-list` attributes on every
real content element — no new visible structure, only hooks. On load,
`website/js/content.js` fetches `/api/v1/website-content` and fills them in;
on any failure (network error, bad response) it does nothing further and the
static fallback text already in the HTML — the real current copy, since that
is what was seeded — is exactly what a visitor sees. The site is never blank
or broken because the CMS could not be reached.

`website/js/animations.js` waits for a `hydrax:content-ready` event (or a
1.2s timeout, so a slow/broken fetch never leaves the page unanimated) before
setting up its `IntersectionObserver`s, since a `data-field-list` container's
children can be rebuilt after this file would otherwise have already looked
at them.

## 5. Testing and verification

`backend/test/website-content.test.ts` (25 tests, part of the 153/153 passing
suite): unauthorized rejection on every CMS/media route, authenticated
access, draft persistence, draft-vs-published separation, publish (including
"no draft yet" and "edit after publish doesn't touch live"), unknown section
id rejected, external/`javascript:` href rejected, invalid status enum
rejected, fixed-tuple and bounded-array violations rejected, the footer link
list's own href allowlist/bounds, site settings' round-trip (including its
own image-allowlist check), required-English/optional-Arabic validation,
honesty-guard rejections (and a confirming pass for the real disclaiming
copy), HTML/script stored as inert text, full media upload/list/
protected-delete flow, unsupported file type rejected, path-traversal image
ref rejected, seed-once-never-clobbers behavior, the pre-existing
quote-request flow unaffected, and a drift-detector asserting the seeded
hero headline matches the real `index.html`.

**Polish-pass manual verification**, against the running dev server, using
headless Chrome driven directly over the Chrome DevTools Protocol (not just
API calls — real page loads, real DOM, real clicks):

- **RTL/breakpoints:** all 6 required widths (375/390/430/768/1024/1440px) ×
  both languages on the homepage — `dir` attribute correct, language toggle
  shows the right active state, **zero horizontal overflow** at any of the
  12 combinations. At 1440px, measured (not eyeballed) that the brand mark
  sits right of the nav links in Arabic and left of them in English, and
  that the hero's photo/copy grid columns swap sides — confirming the
  mirroring is real, not just `dir` being set. Screenshots taken at
  375/768/1440px both languages, plus the mobile hamburger menu open in
  Arabic, plus `/request`, `/privacy`, `/terms` with a stored Arabic
  preference (confirms `js/chrome.js` on pages with no CMS content of their
  own).
- **Navigation reorder:** reversed the live `navigation.items` order via the
  real API, reloaded, confirmed the nav rendered in the new order, then
  confirmed scrolling to `#problem` (now last in the list, was first) and to
  `#contact` (now first, its section is still last on the page) each
  correctly highlighted their *own* link — proving the fix matches by
  identity, not position. Restored the original order and publish state
  afterward.
- **Section reorder + divider:** reordered `sections.order` to
  `[how, problem, field, product, benefits]`, confirmed the `<section>`
  elements render in that DOM order and the decorative divider moved to sit
  immediately before `how` (the new first section); then set every
  reorderable section's `enabled` to `false` and confirmed the divider hides
  itself. Restored the original order/enabled state afterward.
- **Admin UI, end to end in a real browser:** logged in, opened the Website
  content tab, opened the Footer editor (the one section whose already-live
  draft predated the new `links` field — this is exactly the scenario that
  would have crashed the old code; it now renders in a full browser with the
  merged defaults, showing all 9 real links, zero uncaught JS exceptions),
  opened Site settings (logo picker showing "Original — site logo" already
  selected, the real default-CTA and sticky-CTA text), opened Sections &
  publishing (all 12 sections listed and "up to date"), and switched an
  editor to Arabic and confirmed the Arabic inputs actually became visible.
- Re-ran `npm run typecheck`, `npm run test` (153/153), and `npm run check`
  (dashboard + website + admin static checks) after every code change in
  this pass, not only at the end.

## 6. What is, and isn't, in the CMS — the full matrix

Re-audited against the live page a second time for the polish pass, page by
page. "Editable" means through an admin-authenticated CMS field, in
independent English/Arabic where the field is text. Every row was checked
against the actual current markup, not assumed from an earlier pass.

### `index.html` (the CMS-integrated homepage)

| Content element | Admin editable? | Intentionally code-controlled? |
| --- | --- | --- |
| Nav: logo/brand image | Yes — `settings.logo` | |
| Nav: links (label, href, show/hide), up to 7 | Yes — `navigation.items` | |
| Nav: dashboard button label | Yes — `navigation.dashboardCtaLabel` | |
| Nav: primary button label | Yes — `navigation.primaryCtaLabel` | Its href is fixed to `/request` (no `navigation.primaryCtaHref` field) |
| Nav: language toggle, mobile menu button | | Yes — UI chrome |
| Hero: eyebrow, headline, description, CTA label+link, image+alt, up to 5 points | Yes — `hero.*` | |
| Hero→content decorative divider (SVG) | | Yes — decorative; now follows section reorder (§7) |
| Field problem: eyebrow, pull quote, 1–4 paragraphs, image+alt | Yes — `problem.*` | |
| How it works: eyebrow, headline, intro, all 3 steps (title/description/optional detail), accent image+alt+caption | Yes — `how.*` | Intro's inline link to "the platform" is lost when the field is edited (§7) |
| Product: eyebrow, headline, lede, dashboard screenshot, caption, 3–8 capability items | Yes — `product.*` | "Live at /dashboard" link text+href is fixed |
| Benefits: eyebrow, headline, lede, 3–8 items | Yes — `benefits.*` | |
| Built for the field: eyebrow, headline, lede, both gallery photos+alt+caption, 0–6 status badges, 2–6 verification numbers+footnote | Yes — `field.*` | Status badge human labels ("Software verified", …) are fixed UI chrome for the `CONTENT_STATUSES` enum an admin picks from |
| Final CTA: eyebrow, headline, lede, button label+link, email, phone, location | Yes — `contact.*` | |
| Footer: tagline, brand image | Yes — `footer.tagline`, `settings.logo` | |
| Footer: "HYDRAX" brand name | | Yes — the product name |
| Footer: link list (9 links: label/href/visible) | Yes — `footer.links` (added this pass) | |
| Footer: legal/measurement note, photo credits | Yes — `footer.*` | |
| Sticky mobile CTA: headline | Yes — `settings.stickyCtaText` (added this pass) | |
| Sticky mobile CTA: "No account, no obligation." | | Yes — fixed brand copy, kept out of the field so the headline's bold styling isn't lost (a plain-text field can't carry the original two-weight sentence) |
| Sticky mobile CTA: button label+link, dismiss button | Button: yes — `settings.defaultCtaLabel`/`defaultCtaHref` (added this pass). Dismiss (×): no | |
| SEO: site title, meta description, social title/description/image | Yes — `seo.*` | Canonical URL, `twitter:card` type, charset/viewport meta are fixed technical boilerplate |
| Favicon | Yes — `settings.logo` (added this pass) | |
| Section order/visibility (problem, how, product, benefits, field) | Yes — `sections.*` | Hero, navigation, contact, footer never reorder |
| Skip-to-content link | | Yes — accessibility boilerplate |

### `request.html`, `privacy.html`, `terms.html`, `404.html`

All four are, by the original spec's own instruction, separate static/code
pages — not ordinary reorderable content, the same way a route isn't. None
of their body copy, form fields, legal text, or 404 message is in the CMS.
What the polish pass added: `js/chrome.js` gives all four the same
`dir`/`lang` persistence and a working language toggle as the homepage (see
§7 for what that does and doesn't cover), and their nav's inline
`margin-left` style became a real, RTL-safe CSS class.

| Content element | Admin editable? | Intentionally code-controlled? |
| --- | --- | --- |
| Nav: brand image, action button labels/links | | Yes — see §7's note on `settings.logo` not reaching these pages |
| Language toggle | | Yes — functional (flips layout direction), but these pages have no translated text of their own |
| Page body copy, headings, form fields, legal text, 404 message | | Yes — explicitly out of CMS scope |
| Their own separate, shorter footer (brand, tagline, 2–3 links) | | Yes — a genuinely different, independently hardcoded footer from `index.html`'s; editing `footer.*` in the CMS does not change these |

## 7. Known, disclosed limitations

- **RTL layout mirroring is real but not exhaustive.** Every physical
  `left`/`right`/`margin-left`/`padding-left`/`border-left`/`text-align:
  left` rule found in `website/styles.css` was converted to a logical
  property (`inset-inline-*`, `margin-inline-*`, etc.), and CSS Grid/Flexbox
  already reverse column/row order under `dir="rtl"` for free — verified
  with headless Chrome at 375/390/430/768/1024/1440px in both languages
  (no horizontal overflow at any combination, nav/hero/mobile-menu/hamburger
  all confirmed mirrored). Not attempted: mirroring anything that would
  count as "a technical diagram," per the brief's own instruction to leave
  those alone — there are none on this site today (verified: no arrow
  icons/diagrams exist), so nothing was exempted in practice. Anime.js
  animations (fade-up/slide reveals, the hero photo's slow drift, the
  field-line flow) are direction-neutral by design (vertical or symmetric
  motion) and were not changed.
- **`settings.logo` (and the CMS generally) doesn't reach the four secondary
  pages.** They load `js/chrome.js` (direction/language only), not
  `js/content.js` — changing the site logo updates the homepage's nav and
  footer but not request/privacy/terms/404's own hardcoded logo `<img>`.
  Extending full CMS fetch to those pages was judged out of proportion to
  "preserve current design, don't touch backend architecture unnecessarily"
  for this pass; flagged here rather than silently left inconsistent.
- **Nav active-highlight scroll-spy precision** (pre-existing, not
  introduced by this pass): the `IntersectionObserver`'s rootMargin
  (`-72px 0px -55% 0px`) is tuned for typical scroll position, not for
  `scrollIntoView({block:'center'})` on very tall sections — centering on
  `#benefits` or `#how` can highlight the section above it instead. Verified
  this is identical before and after the polish pass's reorder fix (a fixed
  test target — `#problem`, `#contact` — reliably tracks its own href
  correctly through a reorder; the imprecision is scroll-position tuning,
  unrelated to the array-position bug that was actually fixed).
- **Media alt-text metadata** (the media library's own description field,
  distinct from a section's real `imageAlt`) travels as an HTTP header and
  is percent-encoded for safety; non-ASCII text there is stored in its
  encoded form. The `<img alt>` a visitor actually sees comes from the
  section's own `imageAlt` field instead, which has no such restriction.
- **The honesty guard's word-list heuristic** (ported from `check.mjs`) can
  be coincidentally defeated by a disclaiming word appearing for an
  unrelated reason in the same sentence — documented in
  `backend/src/domain/honesty-guard.ts` and exercised by a test that shows
  the exact failure mode, not hidden.
- **`contact.phone`** drives both the visible text and the `tel:` link from
  one CMS value; the original hardcoded page used a local-dial display
  string but an international `tel:` href. The seed keeps the local-dial
  form for both (still correctly dialable from Egypt) — a disclosed,
  cosmetic behavior change, not a functional break.
- **No footer social links.** Considered for this pass (the brief's own
  "Site Settings" suggestion named them) and deliberately not added: the
  current footer has no social icons/links of any kind, and adding visible
  new UI elements would be a design change, out of scope for "preserve
  current design, do not redesign."
