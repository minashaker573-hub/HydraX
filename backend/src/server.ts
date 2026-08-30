/**
 * HYDRAX - server entry point.
 *
 * Composition root for the backend: loads config, opens the database, starts
 * the HTTP listener and the background maintenance timers.
 */

import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from './app.ts';
import { ConfigError, loadConfig } from './config.ts';
import { openDatabase } from './db/index.ts';
import { Repository } from './db/repository.ts';
import { sweepOfflineDevices } from './domain/alerts.ts';
import { log } from './log.ts';
import type { AppDeps } from './deps.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(HERE, '..');
const PROJECT_ROOT = resolve(BACKEND_ROOT, '..');

function main(): void {
  let config;
  try {
    config = loadConfig(process.env, {
      dbPath: join(BACKEND_ROOT, 'data', 'hydrax.db'),
      dashboardDir: join(PROJECT_ROOT, 'dashboard'),
      websiteDir: join(PROJECT_ROOT, 'website'),
    });
  } catch (error) {
    if (error instanceof ConfigError) {
      log.error('config', error.message);
      process.exit(1);
    }
    throw error;
  }

  if (config.deviceKey === null) {
    log.warn(
      'config',
      'Running with HYDRAX_ALLOW_INSECURE=true: telemetry ingestion is UNAUTHENTICATED. ' +
        'Do not use this outside local development.',
    );
  }

  const db = openDatabase(config.dbPath);
  const repo = new Repository(db);
  const deps: AppDeps = { repo, config, now: () => Date.now() };

  const server = createServer(createApp(deps));

  // --- background maintenance ----------------------------------------------
  // A device that stops reporting must surface as an alert on its own; nobody
  // is watching the dashboard at 3am waiting for a row to go stale.
  const offlineTimer = setInterval(() => {
    try {
      sweepOfflineDevices(repo, config.offlineTimeoutMs, Date.now());
    } catch (error) {
      log.error('sweep', `offline sweep failed: ${(error as Error).message}`);
    }
  }, config.offlineSweepIntervalMs);
  offlineTimer.unref();

  let retentionTimer: NodeJS.Timeout | undefined;
  if (config.retentionDays > 0) {
    const pruneOnce = (): void => {
      try {
        const cutoff = new Date(Date.now() - config.retentionDays * 86_400_000).toISOString();
        const removed = repo.pruneTelemetryBefore(cutoff);
        if (removed > 0) log.info('retention', `pruned ${removed} telemetry rows before ${cutoff}`);
      } catch (error) {
        log.error('retention', `prune failed: ${(error as Error).message}`);
      }
    };
    pruneOnce();
    retentionTimer = setInterval(pruneOnce, 6 * 60 * 60 * 1000);
    retentionTimer.unref();
  }

  server.listen(config.port, config.host, () => {
    log.info('server', `HYDRAX backend listening on http://${config.host}:${config.port}`);
    log.info('server', `Website   / -> ${config.websiteDir}`);
    log.info('server', `Dashboard /dashboard -> ${config.dashboardDir}`);
  });

  const shutdown = (signal: string): void => {
    log.info('server', `${signal} received, shutting down`);
    clearInterval(offlineTimer);
    if (retentionTimer !== undefined) clearInterval(retentionTimer);
    server.close(() => {
      db.close();
      process.exit(0);
    });
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
