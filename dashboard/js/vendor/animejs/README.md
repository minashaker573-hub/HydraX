# Vendored dependency: Anime.js

The dashboard has no build step (see `dashboard/check.mjs`), so this is a
vendored copy rather than an npm-resolved one — served same-origin, so it
never violates the backend's CSP (`script-src 'self'`, `connect-src 'self'`)
or reaches out to a CDN at runtime.

| | |
| --- | --- |
| Package | [`animejs`](https://www.npmjs.com/package/animejs) |
| Version | 4.5.0 |
| File | `dist/bundles/anime.esm.min.js` from the published npm tarball, copied unmodified |
| License | MIT — see `LICENSE.md` in this folder |
| Obtained via | `npm pack animejs@4.5.0`, `dist/bundles/anime.esm.min.js` extracted as-is |

## Why the single-file bundle, not the modular `dist/modules/` build

`animejs@4` ships as ~69 small ES modules under `dist/modules/` so a bundler
can tree-shake unused features (SVG morphing, text splitting, draggable,
WAAPI, a Three.js adapter...). This project has no bundler, and importing
`dist/modules/index.js` directly would make the browser fetch and execute
every one of those ~69 files regardless of which few exports are actually
used, on top of being unminified (~1.5 MB total vs. this single 118 KB
minified bundle). The single bundle is the better fit for a buildless,
static-file dashboard — the same reasoning the rest of this project already
uses for its own JS.

The bundle exposes more than this dashboard uses (SVG/text/draggable
features are folded in) — a real, accepted size trade-off of not having a
bundler to tree-shake it further. It does **not** include the Three.js
adapter (`animejs`'s only peer dependency): that lives in `dist/modules/`
only and is never referenced by this bundle, confirmed by inspecting it —
so there is no risk of a broken `import 'three'` at runtime.

## Updating

1. `npm pack animejs@<version>` and extract the tarball.
2. Copy `dist/bundles/anime.esm.min.js` and `LICENSE.md` over the files in
   this folder.
3. Update the version and any changed facts above.
4. Re-run `npm run check`, plus a manual smoke test of the dashboard (see
   `dashboard/js/animations.js`'s header comment for what depends on this).

## Removing Anime.js entirely

Delete this `vendor/animejs/` folder, delete `dashboard/js/animations.js`,
remove its one import and the handful of call sites in `app.js`, `ui.js`
and `views.js` (each marked by a comment referencing `animations.js`). The
dashboard renders and functions identically with all of it gone — animation
is a presentation layer on top of the existing render pipeline, never a
dependency of it.
