/**
 * HYDRAX - backend startup, shared by both ways the backend runs.
 *
 *   - server.ts   a long-running Node process (`npm start`): calls this once,
 *                 then listens and runs the maintenance jobs on timers.
 *   - vercel.ts   a Vercel Function: calls this once per function instance,
 *                 and runs the same maintenance on reads and a daily cron,
 *                 because a function instance is not kept alive for timers.
 *
 * Everything here is idempotent — schema, seeding, the link hub upgrade — so
 * running it on every cold start is safe.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp, type RequestListener } from './app.ts';
import { loadConfig } from './config.ts';
import { openDatabase, type Db } from './db/index.ts';
import { Repository } from './db/repository.ts';
import { sweepOfflineDevices } from './domain/alerts.ts';
import { DEFAULT_WEBSITE_CONTENT, LINKHUB_SEED_V1 } from './domain/website-content-seed.ts';
import { SECTION_IDS, upgradeSeededContent } from './domain/website-content.ts';
import { log } from './log.ts';
import type { AppDeps } from './deps.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');

export interface Runtime {
  readonly deps: AppDeps;
  readonly db: Db;
  readonly app: RequestListener;
}

export interface StaticDirs {
  dashboardDir: string;
  websiteDir: string;
  adminDir: string;
}

export function defaultDirs(): StaticDirs {
  return {
    dashboardDir: join(PROJECT_ROOT, 'dashboard'),
    websiteDir: join(PROJECT_ROOT, 'website'),
    adminDir: join(PROJECT_ROOT, 'admin'),
  };
}

/**
 * Loads config, opens the database, seeds website content and upgrades the
 * link hub. Throws ConfigError for a configuration the server must refuse to
 * start with; each caller decides what refusing looks like.
 */
export async function bootstrap(env: NodeJS.ProcessEnv = process.env, dirs: StaticDirs = defaultDirs()): Promise<Runtime> {
  const config = loadConfig(env, dirs);

  if (config.deviceKey === null) {
    log.warn(
      'config',
      'Running with HYDRAX_ALLOW_INSECURE=true: telemetry ingestion is UNAUTHENTICATED. ' +
        'Do not use this outside local development.',
    );
  }

  const db = await openDatabase(config.databaseUrl);
  const repo = new Repository(db);
  const deps: AppDeps = { repo, config, now: () => Date.now() };

  // Seeds each website content section with the site's real current copy —
  // a no-op for any section that has already been touched (draft or
  // published), so this never overwrites a real edit. See
  // domain/website-content-seed.ts.
  const seedNow = new Date(Date.now()).toISOString();
  for (const section of SECTION_IDS) {
    await repo.seedWebsiteContentIfMissing(section, DEFAULT_WEBSITE_CONTENT[section], seedNow);
  }

  // The link hub gained fields (the team) after its first release. A database
  // seeded by that release has rows without them, which the current validator
  // would refuse to re-save. This fills in missing fields and moves values
  // that were never edited to the new defaults; any admin edit is kept as-is.
  // A no-op once the rows are current. See upgradeSeededContent.
  const linkHubUpgrade = await repo.upgradeWebsiteContent(
    'linkHub',
    (stored) => upgradeSeededContent(stored, LINKHUB_SEED_V1, DEFAULT_WEBSITE_CONTENT.linkHub),
    seedNow,
  );
  if (linkHubUpgrade.draft || linkHubUpgrade.published) {
    log.info(
      'cms',
      `linkHub: upgraded stored content to the current schema (draft: ${linkHubUpgrade.draft}, `
        + `published: ${linkHubUpgrade.published}); admin edits were preserved`,
    );
  }

  return { deps, db, app: createApp(deps) };
}

/* ------------------------------------------------------------ maintenance -- */

/**
 * Raises DEVICE_OFFLINE for any device that has stopped reporting. Whether a
 * device shows as online is computed on every read regardless; this is only
 * what turns "stale" into an alert.
 */
export async function sweepOffline(deps: AppDeps): Promise<void> {
  await sweepOfflineDevices(deps.repo, deps.config.offlineTimeoutMs, deps.now());
}

/** Deletes telemetry older than the retention window. Returns rows removed;
 *  0 when retention is disabled (HYDRAX_RETENTION_DAYS=0). */
export async function pruneRetention(deps: AppDeps): Promise<number> {
  if (deps.config.retentionDays <= 0) return 0;
  const cutoff = new Date(deps.now() - deps.config.retentionDays * 86_400_000).toISOString();
  const removed = await deps.repo.pruneTelemetryBefore(cutoff);
  if (removed > 0) log.info('retention', `pruned ${removed} telemetry rows before ${cutoff}`);
  return removed;
}
