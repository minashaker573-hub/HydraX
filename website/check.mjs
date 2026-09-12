/**
 * HYDRAX website — static checks.
 *
 * The site has no build step, so nothing would otherwise catch a broken asset
 * path, a dead internal anchor, or — most importantly — an unmeasured claim
 * creeping into the copy.
 *
 * Checks performed:
 *   1. every module parses as an ES module;
 *   2. referenced local assets exist;
 *   3. every in-page anchor resolves to a real element id;
 *   4. no inline <script>, which the server's CSP would block anyway;
 *   5. no innerHTML assignment;
 *   6. NO UNMEASURED QUANTITATIVE CLAIMS. This is the important one: the
 *      project has not run on hardware, so a water-saving percentage or a
 *      yield figure on this page would be fabricated. Numbers that ARE
 *      verifiable (test counts, hardware quantities) are allowlisted.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const JS_DIR = join(HERE, 'js');

let failures = 0;
const fail = (m) => { console.error(`  FAIL ${m}`); failures += 1; };
const ok = (m) => console.log(`  ok   ${m}`);

console.log('website static checks\n');

const pages = (await readdir(HERE)).filter((f) => f.endsWith('.html')).sort();
if (pages.length === 0) fail('no HTML pages found');

const modules = existsSync(JS_DIR)
  ? (await readdir(JS_DIR)).filter((f) => f.endsWith('.js')).sort()
  : [];

/* --- 1. modules parse ---------------------------------------------------- */
console.log('parse:');
for (const file of modules) {
  const source = await readFile(join(JS_DIR, file), 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: source,
    encoding: 'utf8',
  });
  if (result.status === 0) ok(`js/${file}`);
  else fail(`js/${file} does not parse:\n${(result.stderr || '').trim()}`);
}
if (modules.length === 0) ok('no modules to parse');

/* --- 2..6 per page ------------------------------------------------------- */
for (const page of pages) {
  const html = await readFile(join(HERE, page), 'utf8');

  console.log(`\n${page} — assets:`);
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  // Routes handled by the backend or resolved by the server's extensionless
  // fallback, not files that exist verbatim on disk.
  const KNOWN_ROUTES = new Set(['/dashboard', '/request', '/privacy', '/terms', '/links']);
  let checked = 0;
  for (const ref of new Set(refs)) {
    if (ref.startsWith('/api/')) continue;
    // A same-origin link to a page section, e.g. /#contact from another page.
    // The path before '#' is what has to exist; a bare '/' is the homepage.
    const [path] = ref.split('#');
    if (path === '' || path === '/' || KNOWN_ROUTES.has(path)) continue;
    const onDisk = join(HERE, path.replace(/^\//, ''));
    checked += 1;
    if (!existsSync(onDisk)) fail(`${page} references missing asset ${ref}`);
  }
  ok(`${checked} local asset reference(s) resolve`);

  console.log(`${page} — anchors:`);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const broken = anchors.filter((a) => !ids.has(a));
  if (broken.length > 0) fail(`${page} has dead anchors: ${broken.join(', ')}`);
  else ok(`${anchors.length} in-page anchor(s) resolve`);

  console.log(`${page} — CSP compatibility:`);
  // The server sends script-src 'self'; an inline script would silently die.
  const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html);
  if (inlineScript) fail(`${page} contains an inline <script>; the CSP blocks it`);
  else ok('no inline scripts');

  const inlineHandler = /\son(?:click|load|error|submit|change|input)=/i.test(html);
  if (inlineHandler) fail(`${page} uses an inline event handler; the CSP blocks it`);
  else ok('no inline event handlers');

  console.log(`${page} — honesty:`);
  const claims = findUnmeasuredClaims(html);
  if (claims.length > 0) {
    for (const claim of claims) fail(`${page} makes an unmeasured claim: "${claim}"`);
  } else {
    ok('no unmeasured performance claims');
  }
}

/* --- 5. innerHTML -------------------------------------------------------- */
console.log('\nsafe rendering:');
for (const file of modules) {
  const source = await readFile(join(JS_DIR, file), 'utf8');
  if (/\.(inner|outer)HTML\s*=/.test(source)) fail(`js/${file} assigns innerHTML — use textContent`);
  else ok(`js/${file} uses textContent only`);
}
if (modules.length === 0) ok('no modules to scan');

/**
 * Flags quantitative performance claims the project cannot currently support.
 *
 * HYDRAX has never run on hardware, so there is no measured water saving, yield
 * change, efficiency figure or accuracy number. Percentages tied to those words
 * would be invented. Counts of tests, sensors and zones are facts about the
 * repository and the bill of materials, so they are not flagged.
 */
function findUnmeasuredClaims(html) {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');

  // Naming a capability in order to rule it out is the opposite of claiming it,
  // and this site does that deliberately. So the scan works sentence by
  // sentence and skips any sentence carrying a disclaimer.
  const sentences = text.split(/(?<=[.!?])\s+/);

  const DISCLAIMED =
    /\b(?:not|no|nor|none|never|without|cannot|can't|until|before|would be|planned|research|require[sd]?|prerequisite|do not|does not|have not|will not|yet|neither|absent|lacks?|unimplemented|rather than|instead of)\b/i;

  // A percentage within a few words of a performance term, in either order.
  // Verb stems are matched with \w* so plurals and tenses cannot slip past.
  const PERF = '(?:sav|reduc|cut|increas|improv|boost|efficien|yield|accura|uptime|faster|less water)\\w*';
  const PCT = '\\d+(?:\\.\\d+)?\\s*(?:%|percent)';
  const QUANTIFIED = new RegExp(
    `(?:${PCT}\\s*(?:\\w+\\s+){0,3}${PERF})|(?:${PERF}\\s+(?:\\w+\\s+){0,3}(?:by\\s+)?${PCT})`,
    'gi',
  );

  const CAPABILITY =
    /\b(?:AI-powered|AI-driven|machine learning|predicts? (?:pump )?failure|leak localization|proven to save|guaranteed savings|clinically|scientifically proven)\b/gi;

  const hits = [];
  for (const sentence of sentences) {
    const disclaimed = DISCLAIMED.test(sentence);

    QUANTIFIED.lastIndex = 0;
    CAPABILITY.lastIndex = 0;

    // A number attached to a performance word is never acceptable here — even
    // "we did not measure a 30% saving" puts the figure on the page.
    let match;
    while ((match = QUANTIFIED.exec(sentence)) !== null) {
      hits.push(match[0].trim().slice(0, 80));
    }

    if (disclaimed) continue;
    while ((match = CAPABILITY.exec(sentence)) !== null) {
      hits.push(`${match[0].trim()} — in: "${sentence.trim().slice(0, 60)}…"`);
    }
  }

  return [...new Set(hits)];
}

/* --- 7. the request flow -------------------------------------------------- */
// Every CTA on the site points at /request. If that page or any of its fields
// disappears, the whole commercial path breaks silently.
console.log('\nrequest flow:');
{
  const requestPath = join(HERE, 'request.html');
  if (!existsSync(requestPath)) {
    fail('request.html is missing, but every CTA on the site links to /request');
  } else {
    const requestHtml = await readFile(requestPath, 'utf8');
    const indexHtml = await readFile(join(HERE, 'index.html'), 'utf8');

    if (indexHtml.includes('href="/request"')) ok('index.html links to /request');
    else fail('index.html has no link to /request');

    const FIELDS = [
      ['farm_size', 'farm size'],
      ['farm_location', 'farm location'],
      ['irrigation_type', 'irrigation type'],
      ['zone_count', 'zone count'],
      ['capabilities', 'capabilities'],
      ['full_name', 'full name'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['notes', 'notes'],
    ];
    const missing = FIELDS.filter(([name]) => !requestHtml.includes(`name="${name}"`));
    if (missing.length > 0) {
      for (const [, label] of missing) fail(`request.html is missing the ${label} field`);
    } else {
      ok(`all ${FIELDS.length} form fields present`);
    }

    if (/\srequired\b/.test(requestHtml)) ok('required-field validation declared');
    else fail('request.html declares no required fields');

    if (requestHtml.includes('data-error-for=')) ok('per-field error slots present');
    else fail('request.html has no per-field error slots');

    if (requestHtml.includes('id="confirmation"') && requestHtml.includes('id="reference-value"')) {
      ok('confirmation state with a request ID present');
    } else {
      fail('request.html has no confirmation state');
    }

    if (requestHtml.includes('Request submitted successfully')) ok('confirmation message present');
    else fail('request.html is missing the confirmation message');
  }
}

/* --- 8. commercial language ----------------------------------------------- */
// No payment system exists and pricing is not finalised, so neither may be
// implied anywhere on the public site.
console.log('\ncommercial language:');
{
  const PURCHASE = /\b(?:buy now|add to cart|checkout|proceed to payment|order now)\b/i;
  const MONEY = /[$€£]\s?\d|\b\d+\s?(?:USD|EGP|EUR|GBP)\b/i;

  let clean = true;
  for (const page of pages) {
    const text = (await readFile(join(HERE, page), 'utf8')).replace(/<[^>]+>/g, ' ');
    if (PURCHASE.test(text)) {
      fail(`${page} uses purchase language, but no payment system exists`);
      clean = false;
    }
    if (MONEY.test(text)) {
      fail(`${page} shows a price, but pricing is not finalised`);
      clean = false;
    }
  }
  if (clean) ok('no purchase language and no prices');
}

/* --- 9. technical files ----------------------------------------------------- */
console.log('\ntechnical files:');
{
  if (existsSync(join(HERE, '404.html'))) ok('404.html exists');
  else fail('404.html is missing — a routing miss on the public site falls back to a bare error');

  const robotsPath = join(HERE, 'robots.txt');
  if (!existsSync(robotsPath)) {
    fail('robots.txt is missing');
  } else {
    const robots = await readFile(robotsPath, 'utf8');
    if (/^User-agent:/im.test(robots)) ok('robots.txt has a User-agent rule');
    else fail('robots.txt has no User-agent rule');
    if (/Disallow:\s*\/admin/i.test(robots)) ok('robots.txt keeps /admin out of the crawl');
    else fail('robots.txt does not exclude /admin from crawling');
  }
}

/* --- 10. the link hub ------------------------------------------------------ */
// /links is the URL that goes in HYDRAX's social bios. Its content is authored
// in the CMS; links.html is the no-JS fallback and crawler view, and
// js/links-config.js holds that same fallback as data (and is what the backend
// seed must equal — asserted in backend/test/link-hub-content.test.ts). What
// has to stay true here, without anyone remembering to check:
//
//   a) the markup lists every fallback destination as a real anchor
//   b) nothing external is linked that the fallback does not know about
//   c) no link to a social account that does not exist
//   d) the team and social sections ship hidden exactly when they are empty
//   e) every element js/links.js writes into exists in the markup
//   f) the fallback rows match the fallback data, row for row
//   g) contact details match the homepage's
//   h) the RTL fix for phone/email values is still in the stylesheet
//   i) the view model stays pure, so the backend suite can test it
console.log('\nlink hub:');
{
  const linksPath = join(HERE, 'links.html');
  const configPath = join(JS_DIR, 'links-config.js');
  const rendererPath = join(JS_DIR, 'links.js');
  const modelPath = join(JS_DIR, 'links-model.js');
  const cssPath = join(HERE, 'links.css');
  const required = [linksPath, configPath, rendererPath, modelPath, cssPath];
  const absentFiles = required.filter((path) => !existsSync(path));

  if (absentFiles.length > 0) {
    for (const path of absentFiles) fail(`link hub file is missing: ${path.slice(HERE.length + 1)}`);
  } else {
    const linksHtml = await readFile(linksPath, 'utf8');
    const { LINK_HUB_FALLBACK: fallback, SOCIAL_DOMAINS: domains } = await import(pathToFileURL(configPath).href);
    const shown = (list) => (Array.isArray(list) ? list : []).filter((item) => item && item.visible !== false);

    const socials = shown(fallback.social).filter((s) => typeof s.url === 'string' && s.url.trim() !== '');
    const members = shown(fallback.team).filter((m) => m.name && typeof m.name.en === 'string' && m.name.en.trim() !== '');
    const profiles = members.map((m) => m.linkedinUrl).filter((url) => typeof url === 'string' && url !== '');
    const explore = shown(fallback.exploreItems);
    const contact = shown(fallback.contactItems);

    // (a)
    const configured = [
      fallback.primaryHref,
      ...explore.map((item) => item.href),
      ...contact.map((item) => item.href),
      ...shown(fallback.footerLinks).map((link) => link.href),
      ...socials.map((s) => s.url),
      ...profiles,
    ];
    const missing = [...new Set(configured)].filter((href) => !linksHtml.includes(`href="${href}"`));
    if (missing.length > 0) {
      for (const href of missing) fail(`links-config.js lists ${href}, but links.html has no anchor for it`);
    } else {
      ok(`all ${new Set(configured).size} fallback destination(s) present in links.html`);
    }

    // (b)
    const external = [...linksHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    const allowedExternal = new Set([...socials.map((s) => s.url), ...profiles]);
    const unlisted = external.filter((href) => !allowedExternal.has(href));
    if (unlisted.length > 0) {
      for (const href of unlisted) fail(`links.html links to ${href}, which links-config.js does not list — no invented URLs`);
    } else {
      ok(`no external link outside links-config.js (${socials.length} social, ${profiles.length} member profile(s))`);
    }

    // (c) Matched on the parsed host, never a substring ("hydrax" contains
    // an "x"). A team member's own LinkedIn is not a HYDRAX account and is
    // excluded from the LinkedIn platform check.
    const onHost = (href, domain) => {
      try {
        const { hostname } = new URL(href);
        return hostname === domain || hostname.endsWith(`.${domain}`);
      } catch {
        return false;
      }
    };
    const unpublished = shown(fallback.social).filter((s) => !(typeof s.url === 'string' && s.url.trim() !== ''));
    const ghosts = unpublished.filter((s) =>
      external.some((href) => onHost(href, domains[s.platform]) && !profiles.includes(href)));
    if (ghosts.length > 0) {
      for (const s of ghosts) fail(`links.html links to ${domains[s.platform]}, but no ${s.platform} account exists`);
    } else {
      ok(`${unpublished.length} social platform(s) with no account have no link — including no HYDRAX LinkedIn`);
    }

    // (d)
    const sectionTag = (id) => (linksHtml.match(new RegExp(`<section[^>]*id="${id}"[^>]*>`)) || [''])[0];
    const isHidden = (id) => /\shidden(?=[\s>=])/.test(sectionTag(id));
    const memberRows = (linksHtml.match(/class="lh-member"/g) || []).length;
    if (members.length === 0 && !(isHidden('linkhub-team-section') && memberRows === 0)) {
      fail('the fallback has no team members, so links.html must ship #linkhub-team-section hidden and empty');
    } else if (members.length > 0 && (isHidden('linkhub-team-section') || memberRows !== members.length)) {
      fail(`the fallback lists ${members.length} member(s) but links.html shows ${memberRows}`);
    } else {
      ok(members.length === 0
        ? 'team section ships hidden and empty — no member exists in the repository, none invented'
        : `team section lists all ${members.length} fallback member(s)`);
    }
    if (socials.length === 0 && !isHidden('linkhub-social-section')) {
      fail('no social account exists, so links.html must ship #linkhub-social-section hidden');
    } else {
      ok(socials.length === 0 ? 'social section ships hidden — no empty "Follow" heading' : 'social section visible');
    }

    // (e) A renamed id makes links.js silently stop updating that field: the
    // page keeps its static default and looks fine while published edits
    // never appear. So the ids are read out of the renderer itself.
    const renderer = await readFile(rendererPath, 'utf8');
    const targets = [...new Set([...renderer.matchAll(/'(linkhub-[a-z0-9-]+)'/g)].map((m) => m[1]))];
    const absentIds = targets.filter((id) => !new RegExp(`id="${id}"`).test(linksHtml));
    if (absentIds.length > 0) {
      for (const id of absentIds) fail(`js/links.js renders into #${id}, which does not exist in links.html`);
    } else {
      ok(`all ${targets.length} render target id(s) exist in links.html`);
    }

    // (f) If the markup were hollowed out, a JS-blocked visitor and every
    // unfurl crawler would get an empty hub.
    const linkRows = (linksHtml.match(/class="lh-link"/g) || []).length;
    const contactRows = (linksHtml.match(/class="lh-contact-link"/g) || []).length;
    if (linkRows !== explore.length || contactRows !== contact.length) {
      fail(
        `links.html fallback has ${linkRows} link row(s) and ${contactRows} contact row(s); `
          + `links-config.js has ${explore.length} and ${contact.length}`,
      );
    } else {
      ok(`fallback markup matches the data row for row (${linkRows} link, ${contactRows} contact)`);
    }

    // (g)
    const indexHtml = await readFile(join(HERE, 'index.html'), 'utf8');
    const contactHrefs = [...linksHtml.matchAll(/href="((?:mailto|tel):[^"]+)"/g)].map((m) => m[1]);
    const invented = contactHrefs.filter((href) => !indexHtml.includes(`href="${href}"`));
    if (invented.length > 0) {
      for (const href of invented) fail(`links.html contacts via ${href}, which does not appear on index.html`);
    } else {
      ok(`${contactHrefs.length} contact method(s) match the homepage`);
    }

    // (h)
    const css = await readFile(cssPath, 'utf8');
    const valueRule = (css.match(/\.lh-contact-value\s*\{[^}]*\}/) || [''])[0];
    if (/direction:\s*ltr/.test(valueRule) && /unicode-bidi:\s*isolate/.test(valueRule)) {
      ok('phone/email values stay left-to-right and isolated in Arabic');
    } else {
      fail('.lh-contact-value lost `direction: ltr; unicode-bidi: isolate` — the phone number would reorder in Arabic');
    }

    // (i)
    const model = await readFile(modelPath, 'utf8');
    const impure = ['document.', 'window.', 'fetch(', 'localStorage'].filter((token) => model.includes(token));
    if (impure.length > 0) {
      fail(`js/links-model.js must stay pure, but uses: ${impure.join(', ')}`);
    } else {
      ok('js/links-model.js is pure (no DOM, network or storage)');
    }
  }
}

/* --- 11. Vercel deployment config ------------------------------------------ */
// website/vercel.json proxies the backend's routes from Render so the site,
// /links, admin and dashboard all share one origin (see docs/DEPLOYMENT.md).
// Three things must stay true, or production breaks in a way no local run
// would show:
//   a) it is valid JSON with no leftover placeholder
//   b) every proxy rewrite targets the SAME https origin — one backend
//   c) no proxied path may be cached on Vercel's CDN. /api/v1/admin responses
//      are authenticated by header; a cached one could be served to someone
//      without the key. The backend sends no-store as well; this is the
//      second, independent lock.
//   d) the CSP stays same-origin — the proxy is what makes that possible
console.log('\nvercel deployment config:');
{
  const vercelPath = join(HERE, 'vercel.json');
  if (!existsSync(vercelPath)) {
    fail('vercel.json is missing — the Vercel deployment has no rewrites or security headers');
  } else {
    const raw = await readFile(vercelPath, 'utf8');
    let cfg = null;
    try {
      cfg = JSON.parse(raw);
      ok('vercel.json is valid JSON');
    } catch (error) {
      fail(`vercel.json is not valid JSON: ${error.message}`);
    }
    if (cfg) {
      if (/REPLACE|YOUR-DOMAIN|example\.com/i.test(raw)) fail('vercel.json still contains a placeholder');
      else ok('no placeholder values');

      const rewrites = Array.isArray(cfg.rewrites) ? cfg.rewrites : [];
      const external = rewrites.filter((r) => /^https?:\/\//.test(String(r.destination)));
      const origins = [...new Set(external.map((r) => new URL(r.destination).origin))];
      if (origins.length !== 1) {
        fail(`proxy rewrites must target exactly one backend origin, found: ${origins.join(', ') || 'none'}`);
      } else if (!origins[0].startsWith('https://')) {
        fail(`backend origin must be https, got ${origins[0]}`);
      } else {
        ok(`${external.length} proxy rewrite(s) all target ${origins[0]}`);
      }

      const REQUIRED = ['/api/:path*', '/admin', '/admin/:path*', '/dashboard', '/dashboard/:path*'];
      const missing = REQUIRED.filter((src) => !external.some((r) => r.source === src));
      if (missing.length) fail(`vercel.json does not proxy: ${missing.join(', ')}`);
      else ok('api, admin and dashboard are proxied to the backend');

      const noCache = new Set((cfg.headers || [])
        .filter((h) => (h.headers || []).some((x) => x.key.toLowerCase() === 'x-vercel-enable-rewrite-caching' && String(x.value) === '0'))
        .map((h) => h.source));
      const cacheable = external.filter((r) => !noCache.has(r.source)).map((r) => r.source);
      if (cacheable.length) fail(`proxied path(s) could be cached on Vercel's CDN: ${cacheable.join(', ')}`);
      else ok('CDN caching disabled on every proxied path');

      const csp = (cfg.headers || []).flatMap((h) => h.headers || [])
        .find((x) => x.key.toLowerCase() === 'content-security-policy');
      const connect = csp && (csp.value.match(/connect-src([^;]*)/) || [])[1];
      if (!csp) fail('vercel.json sets no Content-Security-Policy');
      else if (!connect || connect.trim() !== "'self'") fail(`CSP connect-src must be 'self' only, got "${connect}"`);
      else ok("CSP connect-src is 'self' only");

      // The public pages themselves are static files on Vercel, never proxied.
      const proxiedPages = external.filter((r) => ['/', '/links', '/request', '/privacy', '/terms'].includes(r.source));
      if (proxiedPages.length) fail(`public pages must be served by Vercel, not proxied: ${proxiedPages.map((r) => r.source).join(', ')}`);
      else ok('public pages are served statically by Vercel');
    }
  }
}

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all website checks passed');
