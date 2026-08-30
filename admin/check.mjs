/**
 * HYDRAX operator console — static checks.
 *
 * This surface renders customer-submitted text and holds an operator
 * credential, so the checks here are about those two risks specifically:
 *
 *   * nothing may be rendered as markup (innerHTML), because every value on
 *     this page came from a public form;
 *   * the operator key must never be persisted to localStorage, put in a URL,
 *     or baked into the served files.
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

console.log('admin console static checks\n');

const modules = existsSync(JS_DIR)
  ? (await readdir(JS_DIR)).filter((f) => f.endsWith('.js')).sort()
  : [];

/* --- parse ---------------------------------------------------------------- */
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

/* --- assets and CSP ------------------------------------------------------- */
const html = await readFile(join(HERE, 'index.html'), 'utf8');

console.log('\nassets:');
const MOUNT = '/admin';
const refs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
for (const ref of new Set(refs)) {
  if (ref.startsWith('/api/') || ref === '/dashboard') continue;
  if (!ref.startsWith(`${MOUNT}/`)) {
    fail(`asset "${ref}" is missing the ${MOUNT} mount prefix`);
    continue;
  }
  const onDisk = join(HERE, ref.slice(MOUNT.length).replace(/^\//, ''));
  if (!existsSync(onDisk)) fail(`references missing asset ${ref}`);
}
ok('all local asset references resolve under the mount prefix');

console.log('\nCSP compatibility:');
if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html)) {
  fail('contains an inline <script>; the CSP blocks it');
} else {
  ok('no inline scripts');
}
if (/\son(?:click|load|error|submit|change|input)=/i.test(html)) {
  fail('uses an inline event handler; the CSP blocks it');
} else {
  ok('no inline event handlers');
}

/* --- rendering customer text --------------------------------------------- */
console.log('\nsafe rendering:');
for (const file of modules) {
  const source = await readFile(join(JS_DIR, file), 'utf8');
  if (/\.(inner|outer)HTML\s*=/.test(source) || /insertAdjacentHTML/.test(source)) {
    fail(`js/${file} renders as markup — every value here came from a public form`);
  } else {
    ok(`js/${file} uses textContent only`);
  }
}

/* --- credential handling -------------------------------------------------- */
// Comments are stripped first: this file explains *why* localStorage is
// avoided, and a naive scan would flag the explanation as the violation.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

console.log('\ncredential handling:');
for (const file of modules) {
  const source = stripComments(await readFile(join(JS_DIR, file), 'utf8'));

  if (/\blocalStorage\s*\./.test(source)) {
    fail(`js/${file} uses localStorage; the operator key must not outlive the tab`);
  } else {
    ok(`js/${file} does not persist the key to disk`);
  }

  // A key in a query string ends up in logs, history and referrers.
  if (/[?&](?:key|admin[_-]?key|token)=/i.test(source)) {
    fail(`js/${file} appears to put a credential in a URL`);
  } else {
    ok(`js/${file} keeps the key out of URLs`);
  }
}

// The served files must not contain a key themselves.
const files = [html, ...(await Promise.all(modules.map((f) => readFile(join(JS_DIR, f), 'utf8'))))].map(stripComments);
const HARDCODED = /(?:admin[_-]?key|device[_-]?key|password|secret)\s*[:=]\s*['"][^'"]{6,}['"]/i;
if (files.some((source) => HARDCODED.test(source))) {
  fail('a credential literal appears in a served file');
} else {
  ok('no credential literals in served files');
}

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all admin checks passed');
