/**
 * HYDRAX Mobile — contract check against a RUNNING backend.
 *
 * Not part of `npm test`: it needs a live server, and a test suite that fails
 * because nothing is running is a test suite people learn to ignore. Run it
 * deliberately:
 *
 *     cd backend && npm start          # in one terminal
 *     cd mobile  && npm run check:backend
 *
 * It exercises the app's real service and parsing code against the real
 * endpoints, so it answers the question unit tests cannot: does the backend
 * running on this machine still speak the shape this app was built against?
 *
 * Override the target with HYDRAX_API_URL (default http://127.0.0.1:8080).
 */

import {
  fetchAlerts,
  fetchDeviceDetail,
  fetchDeviceEvents,
  fetchSystemSnapshot,
  fetchTelemetryHistory,
  fetchZoneConfig,
} from '../src/api/services';

const baseUrl = process.env.HYDRAX_API_URL ?? 'http://127.0.0.1:8080';
const options = { baseUrl, timeoutMs: 15_000 };

describe(`live backend at ${baseUrl}`, () => {
  it('serves a dashboard snapshot the app can parse', async () => {
    const snapshot = await fetchSystemSnapshot(5, options);
    expect(typeof snapshot.generatedAt).toBe('string');
    expect(Array.isArray(snapshot.devices)).toBe(true);

    for (const device of snapshot.devices) {
      expect(device.deviceId).toBeTruthy();
      expect(typeof device.online).toBe('boolean');
      expect(typeof device.simulated).toBe('boolean');
      for (const zone of device.zones) {
        expect(Number.isFinite(zone.zone)).toBe(true);
        expect(zone.average === null || Number.isFinite(zone.average)).toBe(true);
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `  devices: ${snapshot.devices
        .map((d) => `${d.deviceId} (${d.online ? 'online' : 'offline'}, ` +
          `${d.simulated ? 'SIMULATED' : 'field'}, ${d.zones.length} zones, ` +
          `${d.alerts.filter((a) => a.active).length} active alerts)`)
        .join('; ') || 'none registered'}`,
    );
  });

  it('serves device detail, telemetry, events, alerts and zone config', async () => {
    const snapshot = await fetchSystemSnapshot(1, options);
    const device = snapshot.devices[0];
    if (device === undefined) {
      // eslint-disable-next-line no-console
      console.log('  no controller registered — start backend/tools/mock-device.ts');
      return;
    }

    const detail = await fetchDeviceDetail(device.deviceId, options);
    expect(detail.deviceId).toBe(device.deviceId);
    expect(Number.isFinite(detail.telemetryCount)).toBe(true);

    const history = await fetchTelemetryHistory(device.deviceId, 20, options);
    expect(Array.isArray(history.samples)).toBe(true);

    const events = await fetchDeviceEvents(device.deviceId, 10, options);
    expect(Array.isArray(events)).toBe(true);

    const alerts = await fetchAlerts(false, 10, options);
    expect(Array.isArray(alerts)).toBe(true);

    const config = await fetchZoneConfig(device.deviceId, options);
    expect(typeof config.appliedByDevice).toBe('boolean');

    // eslint-disable-next-line no-console
    console.log(
      `  ${detail.deviceId}: ${detail.telemetryCount} samples stored, ` +
        `${history.samples.length} returned, ${events.length} events, ` +
        `${alerts.length} alerts, zone config applied_by_device=${config.appliedByDevice}`,
    );
  });

  it('rejects a request for a device that does not exist, without crashing', async () => {
    await expect(fetchDeviceDetail('NOT-A-REAL-DEVICE', options)).rejects.toMatchObject({
      kind: 'server',
      status: 404,
    });
  });
});
