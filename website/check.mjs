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
import { fileURLToPath } from 'node:url';
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
  const KNOWN_ROUTES = new Set(['/dashboard', '/request', '/privacy', '/terms']);
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

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all website checks passed');
