# HYDRAX — Public website

The customer-facing product site, served at `/`. Audience: farm owners,
competition judges, and potential partners.

---

## The rule that shapes this site

> **Nothing on this website is a number we have not measured.**

HYDRAX has never run on hardware. There is therefore no water-saving
percentage, no yield figure, no efficiency number and no accuracy claim — and
there will not be until a flow meter, a control plot and a season of data
exist.

What the site *does* claim is mechanism: hysteresis prevents short-cycling, a
runtime cap bounds the worst case, a zone above its start threshold is not
irrigated. Those are properties of the implementation, verifiable by reading
the code and running the tests.

**This is enforced, not merely intended.** `npm run check:website` fails the
build on a percentage attached to a performance word, and on capability claims
(`AI-powered`, `predicts pump failure`, `leak localization`, `proven to save`)
that are not accompanied by a disclaimer in the same sentence.

The numbers that *do* appear — 50 firmware tests, 1,082 assertions, 80 backend
tests, 4 build configurations — are counts from the repository. They measure
the software, and the site says so explicitly.

---

## Structure

`website/index.html` is the marketing page, a single page with anchored
sections. There is no router and no build step. A handful of small standalone
pages sit alongside it: `request.html` (the quote flow), `privacy.html`,
`terms.html`, and `404.html` (served by the backend for any unmatched public
path — see `backend/src/app.ts`).

| Section | Answers |
| --- | --- |
| Hero | What is HYDRAX? |
| Problem | What problem does it solve? Who is it for? |
| How it works | The five-stage control loop, on the controller |
| Features | What the system does *today* |
| An instrument that guesses… | Why panels read NOT AVAILABLE |
| Technology | How it is built, and how to audit it |
| Impact | Mechanism — and an explicit statement of what is not claimed |
| Product | Hardware, software, and what ships with the system |
| Dashboard | Preview, and a link to the live one |
| Engineering status | Complete / in progress / planned, honestly |
| About | Why the architecture is shaped this way |
| Contact | Quote request and direct contact |

A small sticky CTA appears on mobile once the hero has scrolled past, and
hides again once the real contact section is reachable — see
`js/site.js`. It is dismissible and the dismissal is remembered only for the
tab (`sessionStorage`, not a cookie).

---

## Files

```
website/
  index.html      the marketing page
  request.html    the quote request flow
  privacy.html    privacy policy (template — see Known limitations)
  terms.html      terms of use (template — see Known limitations)
  404.html        served by the backend for any unmatched public path
  robots.txt      crawl rules; no Sitemap line until a production domain exists
  og-image.svg    social preview image (SVG — see Known limitations)
  styles.css      design tokens and all component styles
  check.mjs       static checks, including the honesty guard
  js/site.js      progressive enhancement only
  js/request.js   the quote form
```

---

## Technology choices

| Choice | Reason |
| --- | --- |
| No framework, no build step | Matches the rest of the project; the page is deployable by copying it |
| System font stack | The server's CSP allows no external font host, and a font CDN fails exactly when a farm or venue network does |
| External JS only | The CSP sets `script-src 'self'`; an inline script would be silently blocked |
| Inline SVG schematic | The hero diagram is the product, not stock imagery — and it scales and themes with the page |
| Progressive enhancement | Every section and link works with JavaScript blocked; `site.js` only adds the mobile menu, nav state and scroll-spy |

### Motion

One animation: water flowing along the pipe in the hero schematic. It is gated
twice — by `prefers-reduced-motion`, and by an `IntersectionObserver` so it
only runs while the hero is on screen. An always-running animation keeps the
compositor awake for the whole session and costs battery on a phone for
something nobody is looking at.

---

## Design language

- **Palette** — soil-washed neutrals (a faint warm-green bias, not neutral
  grey) with a single water-blue accent. Green appears only where something is
  verified, so colour carries meaning.
- **Type** — one system stack, with character from a wide scale, tight negative
  tracking on display sizes, and wide-tracked monospace micro-labels.
- **Numbering** — only the five control-loop stages are numbered, because they
  are genuinely a sequence. Top-level sections are not.
- **Dark mode** — full parity, driven by tokens, following the viewer's system
  setting.

---

## Running it

```bash
cd backend
HYDRAX_DEVICE_KEY=... HYDRAX_ADMIN_KEY=... npm start
```

| Path | Serves |
| --- | --- |
| `/` | this website (`website/`) |
| `/dashboard` | the monitoring dashboard (`dashboard/`) |
| `/api/v1/*` | the API |

Override the directory with `HYDRAX_WEBSITE_DIR`.

---

## Checks

```bash
npm run check:website     # parse, assets, anchors, CSP, honesty guard
npm run check             # website + dashboard
```

The honesty guard is verified against control phrases — `Cuts water use by
35%`, `Saves up to 40% of water`, `30% less water`, `AI-powered irrigation`,
`Proven to save water` are each detected.

---

## Known limitations

1. **Contact details are placeholders.** `team@hydrax.example` uses the
   reserved `.example` TLD so it cannot resolve to a real party. Phone and
   location read "to be added". **The project owner must replace these before
   publishing.** They are marked with a `TODO` comment in `index.html`,
   `privacy.html` and `terms.html`.
2. **No analytics, no cookies, no third-party requests.** Nothing to consent
   to, which is deliberate but means there is no traffic measurement. The
   sticky mobile CTA's dismiss state uses `sessionStorage`, not a cookie, and
   carries no identifying data.
3. **Single language (English).**
4. **No CMS.** Copy changes are edits to `index.html`.
5. **Hero schematic is illustrative**, not a live view of a device. The live
   view is the dashboard, one click away.
6. **`privacy.html` and `terms.html` are templates, not published legal
   documents.** They describe what the code actually does today, verified
   against the backend, but leave the legal entity, address, jurisdiction,
   liability clause and retention period as marked placeholders. **They need
   the project owner's review — and ideally counsel's — before they are
   linked from a live, public deployment.**
7. **No production domain is defined anywhere in this repository.** Because
   of that: `robots.txt` has no `Sitemap:` line, no `sitemap.xml` exists, and
   `og:url`/absolute `og:image` are not set — all documented inline where
   they're missing, rather than invented. Once a domain is chosen, see the
   `TODO` comments in `index.html`'s `<head>` and in `robots.txt`.
8. **`og-image.svg` is an SVG, not the PNG most social platforms expect.**
   It renders correctly when opened directly and is wired up via `og:image`
   and `twitter:image`, but Facebook/LinkedIn/iMessage previews are
   unreliable with SVG. Convert it to a 1200×630 PNG before relying on link
   previews for launch.
9. **No analytics is installed.** If one is added later, it must run under
   the existing CSP (`connect-src 'self'` — no external endpoint can be
   reached without changing it), must not set non-essential cookies without a
   consent mechanism, and should be configured from an environment variable
   rather than a hardcoded ID.
