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
// /links is the single URL that goes in HYDRAX's social bios, so two things
// about it have to stay true without anyone remembering to check:
//
//   a) js/links-config.js and links.html list the same destinations. The
//      config drives the rendered page and the markup is what a JS-blocked
//      visitor and a preview crawler get; if they drift, one audience
//      silently gets a different, staler set of links than the other.
//   b) no invented URL is on the page. HYDRAX has no social accounts, and a
//      dead link in a bio is worse than an absent row — so a profile URL may
//      only reach the HTML by being added to the config first.
console.log('\nlink hub:');
{
  const linksPath = join(HERE, 'links.html');
  const configPath = join(JS_DIR, 'links-config.js');

  if (!existsSync(linksPath)) {
    fail('links.html is missing — /links is the URL used in social bios');
  } else if (!existsSync(configPath)) {
    fail('js/links-config.js is missing — /links has no centralized link list');
  } else {
    const linksHtml = await readFile(linksPath, 'utf8');
    const config = await import(pathToFileURL(configPath).href);
    const socials = config.publishableSocials();

    // (a) every configured destination is in the static markup too.
    const configured = [
      config.PRIMARY_LINK.href,
      ...config.PROJECT_LINKS.map((link) => link.href),
      ...socials.map((platform) => platform.url),
      ...config.CONTACT_LINKS.map((link) => link.href),
    ];
    const missing = configured.filter((href) => !linksHtml.includes(`href="${href}"`));
    if (missing.length > 0) {
      for (const href of missing) {
        fail(`links-config.js lists ${href}, but links.html has no anchor for it`);
      }
    } else {
      ok(`all ${configured.length} configured link(s) present in links.html`);
    }

    // (b) nothing leaves this site except a social profile the config knows.
    const allowedExternal = new Set(socials.map((platform) => platform.url));
    const external = [...linksHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    const unlisted = external.filter((href) => !allowedExternal.has(href));
    if (unlisted.length > 0) {
      for (const href of unlisted) {
        fail(`links.html links to ${href}, which is not in links-config.js — no invented URLs`);
      }
    } else {
      ok(`no external link outside links-config.js (${socials.length} social account(s) configured)`);
    }

    // A platform with no account must not have a row anywhere. Matched on the
    // platform's canonical host, not its name: "hydrax" contains an "x", and a
    // substring test would read that as an X profile.
    const onHost = (href, domain) => {
      try {
        const { hostname } = new URL(href);
        return hostname === domain || hostname.endsWith(`.${domain}`);
      } catch {
        return false;
      }
    };

    const unpublished = (config.SOCIAL_PLATFORMS ?? []).filter(
      (platform) => typeof platform.url !== 'string' || platform.url.trim() === '',
    );
    const ghosts = unpublished.filter((platform) =>
      external.some((href) => onHost(href, platform.domain)),
    );
    if (ghosts.length > 0) {
      for (const platform of ghosts) {
        fail(`links.html has a ${platform.domain} link, but no ${platform.label} account exists`);
      }
    } else {
      ok(`${unpublished.length} platform(s) with no account are correctly absent`);
    }

    // And a URL that IS configured must point at the platform it claims to be.
    const misrouted = socials.filter((platform) => !onHost(platform.url, platform.domain));
    if (misrouted.length > 0) {
      for (const platform of misrouted) {
        fail(`${platform.label} is configured as ${platform.url}, which is not on ${platform.domain}`);
      }
    } else if (socials.length > 0) {
      ok(`${socials.length} social URL(s) point at the right platform`);
    }

    // (c) every element js/links.js writes published CMS content into
    // actually exists in the markup.
    //
    // This is the join between the static fallback and the CMS: links.js
    // reaches its render targets by id, and a renamed or dropped id makes it
    // silently stop updating that field - the page keeps showing the static
    // default and looks fine, while an admin's published edit never appears.
    // Nothing else would catch that, so the ids the renderer asks for are
    // read out of the renderer itself and checked against the page.
    const renderer = await readFile(join(JS_DIR, 'links.js'), 'utf8');
    const wantedIds = [...renderer.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
    const setTextIds = [...renderer.matchAll(/setText\('([^']+)'/g)].map((m) => m[1]);
    const renderIds = [...renderer.matchAll(/render\('([^']+)'/g)].map((m) => m[1]);
    const targets = [...new Set([...wantedIds, ...setTextIds, ...renderIds])]
      // The preview banner is created by links.js, not present in the page.
      .filter((id) => id !== 'hydrax-preview-banner');
    const absent = targets.filter((id) => !new RegExp(`id="${id}"`).test(linksHtml));
    if (absent.length > 0) {
      for (const id of absent) {
        fail(`js/links.js renders CMS content into #${id}, which does not exist in links.html`);
      }
    } else {
      ok(`all ${targets.length} CMS render target(s) exist in links.html`);
    }

    // The static fallback must stay complete on its own. If links.js were to
    // become the only thing that puts links on the page, a JS-blocked
    // visitor and every unfurl crawler would get an empty hub.
    const fallbackRows = (linksHtml.match(/class="linkhub-row"/g) || []).length;
    if (fallbackRows >= configured.length - 1) {
      ok(`static fallback still carries ${fallbackRows} row(s) with no JavaScript`);
    } else {
      fail(
        `links.html has only ${fallbackRows} static row(s) for ${configured.length} configured link(s) `
          + '- the no-JS fallback has been hollowed out',
      );
    }

    // (d) the contact details match the rest of the site rather than being
    // new ones invented for this page.
    const indexHtml = await readFile(join(HERE, 'index.html'), 'utf8');
    const contactHrefs = [...linksHtml.matchAll(/href="((?:mailto|tel):[^"]+)"/g)].map((m) => m[1]);
    const invented = contactHrefs.filter((href) => !indexHtml.includes(`href="${href}"`));
    if (invented.length > 0) {
      for (const href of invented) {
        fail(`links.html contacts via ${href}, which does not appear on index.html`);
      }
    } else {
      ok(`${contactHrefs.length} contact method(s) match the rest of the site`);
    }
  }
}

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all website checks passed');
