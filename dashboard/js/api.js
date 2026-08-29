/**
 * HYDRAX dashboard — backend access.
 *
 * Every endpoint here already exists in the Phase 1 backend; the dashboard
 * redesign added none. Transport is plain polling over the existing REST API,
 * which is the simplest mechanism the backend already supports.
 */

/** Aggregate view: everything the dashboard renders, in one request. */
export async function fetchDashboard(eventLimit = 60) {
  return getJson(`/api/v1/dashboard?events=${eventLimit}`);
}

/** Telemetry history — the source for the real moisture chart. */
export async function fetchHistory(deviceId, limit = 120) {
  return getJson(`/api/v1/devices/${encodeURIComponent(deviceId)}/telemetry?limit=${limit}`);
}

/** Alerts including resolved ones, for the alert history list. */
export async function fetchAllAlerts(limit = 200) {
  return getJson(`/api/v1/alerts?active=false&limit=${limit}`);
}

/** Device detail — adds uptime and telemetry count the aggregate omits. */
export async function fetchDevice(deviceId) {
  return getJson(`/api/v1/devices/${encodeURIComponent(deviceId)}`);
}

export async function fetchHealth() {
  return getJson('/health');
}

async function getJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}
