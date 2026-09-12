/**
 * HYDRAX - server entry point (long-running process, `npm start`).
 *
 * Starts the backend via bootstrap.ts, listens, and runs the maintenance jobs
 * on timers. On Vercel the same backend runs through vercel.ts instead.
 */

import { createServer } from 'node:http';

import { bootstrap, pruneRetention, sweepOffline } from './bootstrap.ts';
import { ConfigError } from './config.ts';
import { closeDatabase } from './db/index.ts';
import { log } from './log.ts';

async function main(): Promise<void> {
  let runtime;
  try {
    runtime = await bootstrap(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      log.error('config', error.message);
      process.exit(1);
    }
    throw error;
  }
  const { deps, db, app } = runtime;
  const { config } = deps;

  const server = createServer(app);

  // --- background maintenance ----------------------------------------------
  // A device that stops reporting must surface as an alert on its own; nobody
  // is watching the dashboard at 3am waiting for a row to go stale.
  const offlineTimer = setInterval(() => {
    void sweepOffline(deps).catch((error: unknown) => {
      log.error('sweep', `offline sweep failed: ${(error as Error).message}`);
    });
  }, config.offlineSweepIntervalMs);
  offlineTimer.unref();

  let retentionTimer: NodeJS.Timeout | undefined;
  if (config.retentionDays > 0) {
    const pruneOnce = (): void => {
      void pruneRetention(deps).catch((error: unknown) => {
        log.error('retention', `prune failed: ${(error as Error).message}`);
      });
    };
    pruneOnce();
    retentionTimer = setInterval(pruneOnce, 6 * 60 * 60 * 1000);
    retentionTimer.unref();
  }

  server.listen(config.port, config.host, () => {
    log.info('server', `HYDRAX backend listening on http://${config.host}:${config.port}`);
    log.info('server', `Website   / -> ${config.websiteDir}`);
    log.info('server', `Dashboard /dashboard -> ${config.dashboardDir}`);
    log.info('server', `Admin     /admin -> ${config.adminDir}`);
  });

  const shutdown = (signal: string): void => {
    log.info('server', `${signal} received, shutting down`);
    clearInterval(offlineTimer);
    if (retentionTimer !== undefined) clearInterval(retentionTimer);
    server.close(() => {
      void (async () => {
        try {
          await closeDatabase(db);
        } catch (error) {
          // Ending the pool failing is not a reason to hang here — log and
          // exit anyway. Not wrapping this would leave an unhandled
          // rejection: closeDatabase(db).finally(...) would still call
          // process.exit, but the rejection itself would be unhandled in
          // the meantime, which is fatal by default since Node 15.
          log.error('server', `error closing database: ${(error as Error).message}`);
        } finally {
          process.exit(0);
        }
      })();
    });
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Defense in depth, not the primary fix: the two specific unhandled-'error'
  // vectors this project has actually hit (pg.Pool on an idle connection,
  // and a static-file stream — see db/index.ts and http/static.ts) are
  // handled at their source. These two are a safety net for anything of the
  // same class not yet found. They deliberately do NOT attempt a graceful
  // shutdown: an uncaught exception or unhandled rejection means something
  // happened that the code did not anticipate, so the process's state is
  // not trustworthy enough to run more async cleanup in — log what happened
  // in the same format as everything else, then exit immediately so the
  // host's process manager restarts a clean instance.
  process.on('uncaughtException', (error) => {
    log.error('server', `uncaught exception: ${error.message}`);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    log.error('server', `unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
    process.exit(1);
  });
}

main().catch((error: unknown) => {
  log.error('server', `fatal startup error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
