/**
 * HYDRAX backend configuration.
 *
 * Everything is read from the environment exactly once, here. No other module
 * touches `process.env`.
 */

export interface Config {
  readonly host: string;
  readonly port: number;
  readonly dbPath: string;
  /** Shared secret devices must present in `X-Device-Key`. */
  readonly deviceKey: string | null;
  /** A device with no telemetry for this long is considered offline. */
  readonly offlineTimeoutMs: number;
  /** How often the offline sweep runs. */
  readonly offlineSweepIntervalMs: number;
  /** Telemetry rows older than this are pruned. 0 disables pruning. */
  readonly retentionDays: number;
  /** Directory served as the dashboard. */
  readonly dashboardDir: string;
}

export class ConfigError extends Error {}

function intFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new ConfigError(`${name} must be a non-negative number, got "${raw}"`);
  }
  return value;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  defaults: { dbPath: string; dashboardDir: string },
): Config {
  const deviceKey = env.HYDRAX_DEVICE_KEY?.trim() ?? '';
  const allowInsecure = env.HYDRAX_ALLOW_INSECURE === 'true';

  // Refuse to start with ingestion wide open unless that was an explicit,
  // deliberate choice. Silently accepting unauthenticated writes is how a
  // "temporary" dev setup ends up in a field deployment.
  if (deviceKey === '' && !allowInsecure) {
    throw new ConfigError(
      'HYDRAX_DEVICE_KEY is not set. Set it to a shared secret that matches the ' +
        'firmware, or set HYDRAX_ALLOW_INSECURE=true to accept unauthenticated ' +
        'telemetry (local development only).',
    );
  }

  return {
    host: env.HYDRAX_HOST ?? '0.0.0.0',
    port: intFromEnv(env, 'HYDRAX_PORT', 8080),
    dbPath: env.HYDRAX_DB_PATH ?? defaults.dbPath,
    deviceKey: deviceKey === '' ? null : deviceKey,
    offlineTimeoutMs: intFromEnv(env, 'HYDRAX_OFFLINE_TIMEOUT_MS', 60_000),
    offlineSweepIntervalMs: intFromEnv(env, 'HYDRAX_OFFLINE_SWEEP_MS', 15_000),
    retentionDays: intFromEnv(env, 'HYDRAX_RETENTION_DAYS', 30),
    dashboardDir: env.HYDRAX_DASHBOARD_DIR ?? defaults.dashboardDir,
  };
}
