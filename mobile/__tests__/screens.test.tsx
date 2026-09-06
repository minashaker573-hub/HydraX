/**
 * HYDRAX Mobile — screen behaviour.
 *
 * Each screen is rendered inside the real providers over a stubbed network, so
 * these tests exercise the actual fetch -> parse -> state -> render path. What
 * they assert is mostly the honesty rules: the SIMULATION label is present
 * when the backend says the device is simulated, a zone with no threshold band
 * says so rather than showing a number, and a failed request produces a
 * readable message instead of a blank screen or a stack trace.
 */

import { screen, waitFor } from '@testing-library/react-native';

import AlertsScreen from '../app/(tabs)/alerts';
import DeviceScreen from '../app/(tabs)/device';
import HistoryScreen from '../app/(tabs)/history';
import HomeScreen from '../app/(tabs)/index';
import ZonesScreen from '../app/(tabs)/zones';
import { translate } from '../src/i18n/I18nProvider';
import { EMPTY_DASHBOARD_RESPONSE, fixtureFor } from './fixtures';
import {
  jsonResponse,
  renderScreen,
  stubFetchFailure,
  stubFetchPending,
  stubFetchWith,
  stubFetchWithFixtures,
} from './helpers';

const en = (key: Parameters<typeof translate>[1]) => translate('en', key);

describe('Home', () => {
  it('renders live telemetry from the backend', async () => {
    stubFetchWithFixtures();
    await renderScreen(<HomeScreen />);

    // Farm average of zone 1 (15.3) and zone 2 (41.2).
    await waitFor(() => expect(screen.getByText('28%')).toBeTruthy());
    // ONLINE appears twice by design: the status headline and the MONITOR stage.
    expect(screen.getAllByText(en('home.online')).length).toBeGreaterThan(0);
    expect(screen.getByText(en('home.on'))).toBeTruthy(); // pump
  });

  it('labels simulated telemetry as simulated', async () => {
    stubFetchWithFixtures();
    await renderScreen(<HomeScreen />);
    await waitFor(() => expect(screen.getByText(en('source.simulation'))).toBeTruthy());
  });

  it('shows the V2 farm-overview sections rather than the old control-loop rail', async () => {
    stubFetchWithFixtures();
    await renderScreen(<HomeScreen />);

    await waitFor(() => expect(screen.getByText(en('home.soilOverview'))).toBeTruthy());
    expect(screen.getByText(en('home.irrigationStatus'))).toBeTruthy();
    expect(screen.getByText(en('home.zoneSnapshot'))).toBeTruthy();
    expect(screen.getByText(en('home.recentActivity'))).toBeTruthy();
    // The SENSE/UNDERSTAND/DECIDE/ACT/MONITOR pipeline moved to Device — see
    // "shows the live control loop stages" under Device below.
    expect(screen.queryByText(en('loop.sense'))).toBeNull();
  });

  it('shows recent events from the backend', async () => {
    stubFetchWithFixtures();
    await renderScreen(<HomeScreen />);
    await waitFor(() => expect(screen.getByText(en('event.IRRIGATION_STARTED'))).toBeTruthy());
  });

  it('shows a loading state while the request is still in flight', async () => {
    stubFetchPending();
    await renderScreen(<HomeScreen />);
    expect(screen.getByText(en('common.loading'))).toBeTruthy();
  });

  it('explains a failed request instead of showing a blank screen', async () => {
    stubFetchFailure();
    await renderScreen(<HomeScreen />);

    await waitFor(() => expect(screen.getByText(en('error.title'))).toBeTruthy());
    expect(screen.getByText(en('error.network'))).toBeTruthy();
    expect(screen.getByText(en('common.retry'))).toBeTruthy();
  });

  it('never shows a raw backend error message', async () => {
    stubFetchWith({ error: 'ECONNREFUSED at Socket.connect (net.js:1141)' }, 500);
    await renderScreen(<HomeScreen />);

    await waitFor(() => expect(screen.getByText(en('error.title'))).toBeTruthy());
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
    expect(screen.queryByText(/net\.js/)).toBeNull();
  });

  it('has an honest empty state when no controller has ever reported', async () => {
    stubFetchWith(EMPTY_DASHBOARD_RESPONSE);
    await renderScreen(<HomeScreen />);
    await waitFor(() => expect(screen.getByText(en('device.none'))).toBeTruthy());
  });
});

describe('Zones', () => {
  it('lists every zone the controller reports', async () => {
    stubFetchWithFixtures();
    await renderScreen(<ZonesScreen />);

    await waitFor(() => expect(screen.getByText('ZONE 01')).toBeTruthy());
    expect(screen.getByText('ZONE 02')).toBeTruthy();
    expect(screen.getByText('15%')).toBeTruthy();
    expect(screen.getByText('41%')).toBeTruthy();
  });

  it('says NO BAND SET rather than inventing a threshold', async () => {
    stubFetchWithFixtures();
    await renderScreen(<ZonesScreen />);
    await waitFor(() => expect(screen.getByText(en('zones.thresholdMissing'))).toBeTruthy());
  });

  it('shows a stored threshold band as advisory', async () => {
    stubFetchWithFixtures();
    await renderScreen(<ZonesScreen />);

    await waitFor(() => expect(screen.getByText('35% / 60%')).toBeTruthy());
    expect(screen.getByText(en('zones.thresholdAdvisory'))).toBeTruthy();
  });

  it('reports valve state and probe coverage', async () => {
    stubFetchWithFixtures();
    await renderScreen(<ZonesScreen />);

    await waitFor(() => expect(screen.getByText(en('zones.open'))).toBeTruthy());
    expect(screen.getByText('1/2')).toBeTruthy(); // zone 2, one failed probe
  });
});

describe('Alerts', () => {
  it('renders real alerts with severity and message', async () => {
    stubFetchWithFixtures();
    await renderScreen(<AlertsScreen />);

    await waitFor(() => expect(screen.getByText(en('alert.DEVICE_OFFLINE'))).toBeTruthy());
    expect(screen.getByText(/No telemetry for 46383s/)).toBeTruthy();
    expect(screen.getByText(en('alerts.warning'))).toBeTruthy();
  });

  it('says so when there is nothing wrong, rather than inventing an alert', async () => {
    stubFetchWith({ alerts: [] });
    await renderScreen(<AlertsScreen />);

    await waitFor(() => expect(screen.getByText(en('alerts.none'))).toBeTruthy());
    expect(screen.getByText(en('alerts.noneBody'))).toBeTruthy();
  });

  it('handles an alerts request failure', async () => {
    stubFetchFailure();
    await renderScreen(<AlertsScreen />);
    await waitFor(() => expect(screen.getByText(en('error.title'))).toBeTruthy());
  });
});

describe('Device', () => {
  it('shows identity and link fields the backend returned', async () => {
    stubFetchWithFixtures();
    await renderScreen(<DeviceScreen />);

    await waitFor(() => expect(screen.getByText('HYDRAX-SIM-1')).toBeTruthy());
    expect(screen.getByText('0.1.0-phase1-sim')).toBeTruthy();
    expect(screen.getByText('-58')).toBeTruthy(); // RSSI
    expect(screen.getByText('19,602')).toBeTruthy(); // stored samples
  });

  it('spells out that the controller is simulated', async () => {
    stubFetchWithFixtures();
    await renderScreen(<DeviceScreen />);

    await waitFor(() => expect(screen.getAllByText(en('source.simulation')).length).toBe(2));
    expect(screen.getByText(en('source.simulationBody'))).toBeTruthy();
  });

  it('shows the live control loop stages (relocated here from Home in V2)', async () => {
    stubFetchWithFixtures();
    await renderScreen(<DeviceScreen />);

    await waitFor(() => expect(screen.getByText(en('loop.sense'))).toBeTruthy());
    for (const stage of ['loop.understand', 'loop.decide', 'loop.act', 'loop.monitor'] as const) {
      expect(screen.getByText(en(stage))).toBeTruthy();
    }
    // 3 of 4 probes are valid in the fixture (zone 2 has one failed probe).
    expect(screen.getByText('3 of 4 probes valid')).toBeTruthy();
  });
});

describe('History', () => {
  it('charts recorded telemetry and lists irrigation events', async () => {
    stubFetchWithFixtures();
    await renderScreen(<HistoryScreen />);

    await waitFor(() => expect(screen.getByText('3 samples')).toBeTruthy());
    expect(screen.getByText(en('event.IRRIGATION_STOPPED'))).toBeTruthy();
    // Runtime is summed from the controller's own reported durations.
    expect(screen.getByText('45s')).toBeTruthy();
  });

  it('says the duration was not reported rather than printing a total of zero', async () => {
    // The simulated controller sends duration_ms: 0 on every stop event.
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/events')) {
        return jsonResponse({
          device_id: 'HYDRAX-SIM-1',
          events: [
            {
              id: 1,
              device_id: 'HYDRAX-SIM-1',
              received_at: '2026-09-05T20:05:40.988Z',
              device_uptime_ms: 1,
              type: 'IRRIGATION_STOPPED',
              zone: 1,
              moisture: 60,
              duration_ms: 0,
              detail: 'stop threshold reached',
            },
          ],
        });
      }
      return jsonResponse(fixtureFor(url));
    }) as unknown as typeof fetch;

    await renderScreen(<HistoryScreen />);

    await waitFor(() => expect(screen.getByText(en('history.runtimeMissing'))).toBeTruthy());
    expect(screen.queryByText('0s')).toBeNull();
  });

  it('states plainly that water volume is not measured', async () => {
    stubFetchWithFixtures();
    await renderScreen(<HistoryScreen />);

    await waitFor(() => expect(screen.getByText(en('history.notMeasured'))).toBeTruthy());
    expect(screen.getByText(en('history.noFlowSensor'))).toBeTruthy();
  });
});
