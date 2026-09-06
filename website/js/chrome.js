/**
 * HYDRAX website — shared nav chrome for pages with no CMS content of their
 * own (request.html, privacy.html, terms.html, 404.html).
 *
 * These pages carry no `data-field*` hooks and never fetch
 * /api/v1/website-content — their text is fully code-controlled, by design
 * (see docs/CMS.md §6: separate pages, same as privacy/terms are not
 * ordinary reorderable content). What they still need is the same
 * language/direction behavior as the CMS-driven homepage, so a language
 * choice made there carries over here instead of resetting every time a
 * visitor follows a link — this only sets <html dir>/<html lang> from the
 * stored preference and wires this page's own lang toggle, if it has one.
 */
import { applyDocumentDirection, wireLangToggle } from './i18n.js';

applyDocumentDirection();
wireLangToggle();
