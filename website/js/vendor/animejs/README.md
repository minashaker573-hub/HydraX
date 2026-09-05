# Vendored dependency: Anime.js

Same rationale and the same file as `dashboard/js/vendor/animejs/README.md` —
duplicated here rather than shared, because the website and the dashboard are
served from separate root directories on the backend (`websiteDir` vs.
`dashboardDir` in `backend/src/config.ts`), so there is no single on-disk
location both could reference with a relative import.

| | |
| --- | --- |
| Package | [`animejs`](https://www.npmjs.com/package/animejs) |
| Version | 4.5.0 |
| File | `dist/bundles/anime.esm.min.js` from the published npm tarball, copied unmodified |
| License | MIT — see `LICENSE.md` in this folder |
| Obtained via | `npm pack animejs@4.5.0`, `dist/bundles/anime.esm.min.js` extracted as-is |

No CDN, no external runtime request — served same-origin, so it never
violates this server's CSP (`script-src 'self'`, `connect-src 'self'`). See
the dashboard's copy of this README for why the single-file bundle was used
instead of the modular `dist/modules/` build.

## Updating or removing

Same steps as `dashboard/js/vendor/animejs/README.md`. To remove Anime.js
from the website entirely: delete this folder, delete
`website/js/animations.js`, and remove its one `<script type="module">` tag
and the one import line that uses it. The site's HTML is fully readable and
navigable with that script blocked or absent — see `website/js/site.js`'s
own header comment, which states the same guarantee for the rest of the
site's interactivity.
