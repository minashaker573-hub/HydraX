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
  /**
   * Operator secret required in `X-Admin-Key` for endpoints that change
   * server-side state (thresholds, alert resolution, quote requests).
   * Separate from the device key: see src/http/auth.ts.
   */
  readonly adminKey: string | null;
  /** A device with no telemetry for this long is considered offline. */
  readonly offlineTimeoutMs: number;
  /** How often the offline sweep runs. */
  readonly offlineSweepIntervalMs: number;
  /** Telemetry rows older than this are pruned. 0 disables pruning. */
  readonly retentionDays: number;
  /** Directory served as the dashboard, mounted under /dashboard. */
  readonly dashboardDir: string;
  /** Directory served as the public website, mounted at /. */
  readonly websiteDir: string;
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
  defaults: { dbPath: string; dashboardDir: string; websiteDir: string },
): Config {
  const deviceKey = env.HYDRAX_DEVICE_KEY?.trim() ?? '';
  const adminKey = env.HYDRAX_ADMIN_KEY?.trim() ?? '';
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

  // Same rule for operator actions. Without this, anyone who can reach the
  // port could rewrite irrigation thresholds or silence a critical alert.
  if (adminKey === '' && !allowInsecure) {
    throw new ConfigError(
      'HYDRAX_ADMIN_KEY is not set. Set it to an operator secret (distinct from ' +
        'HYDRAX_DEVICE_KEY) to protect threshold changes, alert resolution and ' +
        'quote requests, or set HYDRAX_ALLOW_INSECURE=true for local development.',
    );
  }

  if (deviceKey !== '' && adminKey !== '' && deviceKey === adminKey) {
    throw new ConfigError(
      'HYDRAX_ADMIN_KEY must differ from HYDRAX_DEVICE_KEY. The device key is ' +
        'flashed into every controller in the field; the operator key must not be.',
    );
  }

  return {
    host: env.HYDRAX_HOST ?? '0.0.0.0',
    port: intFromEnv(env, 'HYDRAX_PORT', 8080),
    dbPath: env.HYDRAX_DB_PATH ?? defaults.dbPath,
    deviceKey: deviceKey === '' ? null : deviceKey,
    adminKey: adminKey === '' ? null : adminKey,
    offlineTimeoutMs: intFromEnv(env, 'HYDRAX_OFFLINE_TIMEOUT_MS', 60_000),
    offlineSweepIntervalMs: intFromEnv(env, 'HYDRAX_OFFLINE_SWEEP_MS', 15_000),
    retentionDays: intFromEnv(env, 'HYDRAX_RETENTION_DAYS', 30),
    dashboardDir: env.HYDRAX_DASHBOARD_DIR ?? defaults.dashboardDir,
    websiteDir: env.HYDRAX_WEBSITE_DIR ?? defaults.websiteDir,
  };
}
