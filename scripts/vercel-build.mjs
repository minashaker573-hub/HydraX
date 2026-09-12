/**
 * HYDRAX — Vercel build.
 *
 * 1. Compiles the backend (backend/src -> backend/dist) with the project's own
 *    TypeScript, so the Vercel Function (api/index.js) imports plain
 *    JavaScript. The sources import each other with `.ts` extensions (Node
 *    runs them directly locally); Vercel's own transpiler leaves those
 *    specifiers as `.ts`, which would fail at runtime — verified with a local
 *    `vercel build`. A type error fails the deploy here.
 * 2. Copies schema.sql next to the compiled database module, which reads it
 *    at startup.
 * 3. Assembles the static output in public/:
 *
 *      website/    ->  public/             (/, /links, /request, /privacy, …)
 *      dashboard/  ->  public/dashboard/   (/dashboard)
 *      admin/      ->  public/admin/       (/admin)
 *
 * Local `npm start` does not use this script.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BACKEND = join(ROOT, 'backend');
const DIST = join(BACKEND, 'dist');
const OUT = join(ROOT, 'public');

function fail(message) {
  console.error(`vercel-build: ${message}`);
  process.exit(1);
}

/* ------------------------------------------------------ 1. compile backend -- */

const tsc = join(BACKEND, 'node_modules', 'typescript', 'bin', 'tsc');
if (!existsSync(tsc)) fail('backend dependencies are not installed (expected `npm ci --prefix backend` first)');

rmSync(DIST, { recursive: true, force: true });
try {
  execFileSync(process.execPath, [tsc, '-p', join(BACKEND, 'tsconfig.build.json')], { stdio: 'inherit' });
} catch {
  fail('backend TypeScript compilation failed');
}

/* ------------------------------------------------------ 2. runtime assets -- */

cpSync(join(BACKEND, 'src', 'db', 'schema.sql'), join(DIST, 'db', 'schema.sql'));

const compiled = ['vercel.js', 'bootstrap.js', 'app.js', 'db/index.js', 'db/schema.sql'];
const notCompiled = compiled.filter((file) => !existsSync(join(DIST, file)));
if (notCompiled.length > 0) fail(`missing from backend/dist: ${notCompiled.join(', ')}`);

/* ---------------------------------------------------------- 3. static site -- */

/** Development tooling that has no business being publicly downloadable. */
const EXCLUDE = new Set(['check.mjs', 'vercel.json']);

const copy = (from, to) => cpSync(join(ROOT, from), join(OUT, to), {
  recursive: true,
  filter: (src) => !EXCLUDE.has(basename(src)),
});

rmSync(OUT, { recursive: true, force: true });
copy('website', '.');
copy('dashboard', 'dashboard');
copy('admin', 'admin');

// A deploy missing any of these would look fine in the build log and be
// broken for visitors, so the build fails instead.
const REQUIRED = [
  'index.html', 'links.html', 'request.html', '404.html', 'styles.css', 'links.css',
  'dashboard/index.html', 'admin/index.html',
];
const missing = REQUIRED.filter((file) => !existsSync(join(OUT, file)));
if (missing.length > 0) fail(`missing from public/: ${missing.join(', ')}`);

const leaked = [...EXCLUDE].flatMap((name) => ['', 'dashboard', 'admin'].map((dir) => join(dir, name)))
  .filter((file) => existsSync(join(OUT, file)));
if (leaked.length > 0) fail(`excluded files leaked into public/: ${leaked.join(', ')}`);

console.log('vercel-build: backend compiled to backend/dist; public/ assembled (website /, dashboard /dashboard, admin /admin)');
