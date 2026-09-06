/**
 * HYDRAX - public website content management (CMS).
 *
 * One public, unauthenticated read (what a visitor's browser actually
 * fetches) and three operator-authenticated writes. This mirrors quotes.ts's
 * shape deliberately: one unauthenticated surface, validated strictly; every
 * mutation behind the operator key.
 *
 * The public endpoint serves ONLY 'published' rows — a draft, however far
 * along, is never reachable without the admin key. See db/repository.ts's
 * website_content table comment for the two-row-per-section model this reads
 * and writes.
 */

import { authorizeAdmin } from '../http/auth.ts';
import { BodyParseError, BodyTooLargeError, readJsonBody, sendError, sendJson } from '../http/respond.ts';
import { nowIso, type AppDeps } from '../deps.ts';
import { isSectionId, SECTION_IDS, validateWebsiteSection } from '../domain/website-content.ts';
import { log } from '../log.ts';
import type { Router } from '../http/router.ts';

export function registerWebsiteContentRoutes(router: Router, deps: AppDeps): void {
  // --------------------------------------------------------------- public --
  router.get('/api/v1/website-content', async (ctx) => {
    const rows = await deps.repo.listWebsiteContent('published');
    const sections: Record<string, unknown> = {};
    for (const row of rows) sections[row.section] = row.data;
    sendJson(ctx.res, 200, { generated_at: nowIso(deps), sections });
  });

  // ---------------------------------------------------------------- admin --
  router.get('/api/v1/admin/website-content', async (ctx) => {
    if (!authorizeAdmin(ctx, deps)) return;

    const [drafts, published] = await Promise.all([
      deps.repo.listWebsiteContent('draft'),
      deps.repo.listWebsiteContent('published'),
    ]);
    const draftBySection = new Map(drafts.map((r) => [r.section, r]));
    const publishedBySection = new Map(published.map((r) => [r.section, r]));

    const sections: Record<string, unknown> = {};
    for (const id of SECTION_IDS) {
      const draft = draftBySection.get(id);
      const live = publishedBySection.get(id);
      sections[id] = {
        draft: draft?.data ?? null,
        published: live?.data ?? null,
        updated_at: draft?.updated_at ?? null,
        published_at: live?.published_at ?? null,
        // The admin UI's "draft differs from published" indicator is a
        // plain string comparison of the serialized content — cheap, and
        // exactly matches what publishing would actually change.
        has_unpublished_changes:
          draft !== undefined && (live === undefined || JSON.stringify(draft.data) !== JSON.stringify(live.data)),
      };
    }
    sendJson(ctx.res, 200, { sections });
  });

  router.put('/api/v1/admin/website-content/:section', async (ctx) => {
    if (!authorizeAdmin(ctx, deps)) return;

    const section = ctx.params.section!;
    if (!isSectionId(section)) {
      sendError(ctx.res, 400, `unknown section "${section}" — must be one of: ${SECTION_IDS.join(', ')}`);
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(ctx.req);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        sendError(ctx.res, 413, error.message);
        return;
      }
      if (error instanceof BodyParseError) {
        sendError(ctx.res, 400, error.message);
        return;
      }
      throw error;
    }

    const result = validateWebsiteSection(section, body);
    if (!result.ok) {
      sendError(ctx.res, 400, 'invalid content', result.errors);
      return;
    }

    const now = nowIso(deps);
    await deps.repo.saveWebsiteContentDraft(section, result.value, now);
    log.info('cms', `${section}: draft saved`);
    sendJson(ctx.res, 200, { section, draft: result.value, updated_at: now });
  });

  router.post('/api/v1/admin/website-content/:section/publish', async (ctx) => {
    if (!authorizeAdmin(ctx, deps)) return;

    const section = ctx.params.section!;
    if (!isSectionId(section)) {
      sendError(ctx.res, 400, `unknown section "${section}" — must be one of: ${SECTION_IDS.join(', ')}`);
      return;
    }

    // Re-validate the draft that is about to go live, defensively: the
    // schema this project enforces can change between when a draft was
    // saved and when someone clicks publish (a deploy in between, say), and
    // publishing a shape the current code no longer understands would be a
    // worse failure than refusing to.
    const draftRow = await deps.repo.getWebsiteContent(section, 'draft');
    if (draftRow === undefined) {
      sendError(ctx.res, 404, `${section} has no draft to publish`);
      return;
    }
    const revalidated = validateWebsiteSection(section, draftRow.data);
    if (!revalidated.ok) {
      sendError(ctx.res, 409, `${section}'s saved draft no longer passes validation`, revalidated.errors);
      return;
    }

    const now = nowIso(deps);
    const published = await deps.repo.publishWebsiteContent(section, now);
    if (!published) {
      sendError(ctx.res, 404, `${section} has no draft to publish`);
      return;
    }

    log.info('cms', `${section}: published`);
    sendJson(ctx.res, 200, { section, published_at: now });
  });
}
