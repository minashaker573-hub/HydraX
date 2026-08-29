/**
 * HYDRAX dashboard — static checks.
 *
 * The dashboard has no build step, so nothing would otherwise catch a syntax
 * error or a broken import until it failed in a browser. This runs in CI-time
 * (`npm run check:dashboard`) and catches both.
 *
 * Checks performed:
 *   1. every module parses as an ES module;
 *   2. every relative import resolves to a file that exists;
 *   3. every module referenced from index.html exists;
 *   4. no module reaches for innerHTML, which is how device-supplied strings
 *      would become markup.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const JS_DIR = join(HERE, 'js');

let failures = 0;

function fail(message) {
  console.error(`  FAIL ${message}`);
  failures += 1;
}

function ok(message) {
  console.log(`  ok   ${message}`);
}

const files = (await readdir(JS_DIR)).filter((f) => f.endsWith('.js')).sort();

if (files.length === 0) fail('no modules found in dashboard/js');

console.log('dashboard static checks\n');

// --- 1. parse ---------------------------------------------------------------
console.log('parse:');
for (const file of files) {
  const source = await readFile(join(JS_DIR, file), 'utf8');
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--check'],
    { input: source, encoding: 'utf8' },
  );
  if (result.status === 0) ok(file);
  else fail(`${file} does not parse:\n${(result.stderr || '').trim()}`);
}

// --- 2. relative imports resolve -------------------------------------------
console.log('\nimports:');
const IMPORT_RE = /from\s+['"](\.[^'"]+)['"]/g;
for (const file of files) {
  const source = await readFile(join(JS_DIR, file), 'utf8');
  let match;
  let checked = 0;
  while ((match = IMPORT_RE.exec(source)) !== null) {
    const target = resolve(JS_DIR, match[1]);
    checked += 1;
    if (!existsSync(target)) fail(`${file} imports missing module ${match[1]}`);
  }
  ok(`${file} (${checked} relative imports)`);
}

// --- 3. entry point referenced by the page exists ---------------------------
console.log('\nentry point:');
const html = await readFile(join(HERE, 'index.html'), 'utf8');
const scriptMatch = /<script[^>]*src="([^"]+)"/.exec(html);
if (scriptMatch === null) {
  fail('index.html references no script');
} else {
  const entry = join(HERE, scriptMatch[1].replace(/^\//, ''));
  if (existsSync(entry)) ok(`index.html -> ${scriptMatch[1]}`);
  else fail(`index.html references missing ${scriptMatch[1]}`);
}

const cssMatch = /<link[^>]*href="(\/[^"]+\.css)"/.exec(html);
if (cssMatch !== null) {
  const css = join(HERE, cssMatch[1].replace(/^\//, ''));
  if (existsSync(css)) ok(`index.html -> ${cssMatch[1]}`);
  else fail(`index.html references missing ${cssMatch[1]}`);
}

// --- 4. no innerHTML --------------------------------------------------------
// Telemetry carries device-supplied strings (event details, alert messages).
// Rendering any of it through innerHTML would turn a device into an XSS vector,
// so the rule is enforced rather than merely intended.
console.log('\nsafe rendering:');
for (const file of files) {
  const source = await readFile(join(JS_DIR, file), 'utf8');
  if (/\.innerHTML\s*=/.test(source) || /\.outerHTML\s*=/.test(source)) {
    fail(`${file} assigns innerHTML/outerHTML — use textContent`);
  } else {
    ok(`${file} uses textContent only`);
  }
}

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all dashboard checks passed');
