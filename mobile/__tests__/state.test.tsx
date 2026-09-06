/**
 * HYDRAX Mobile — shared state, staleness and offline behaviour.
 *
 * The rule under test: losing the network must never blank the screen. A
 * failed poll keeps the last good data, labels it with its age, and says that
 * irrigation continues on the controller regardless. That sentence is the
 * whole architecture in one line, and it must be on screen when it matters.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, View } from 'react-native';

import HomeScreen from '../app/(tabs)/index';
import { Text } from '../src/components/Text';
import { I18nProvider, translate } from '../src/i18n/I18nProvider';
import { SystemProvider, useSystem } from '../src/state/SystemProvider';
import { loadSnapshot, saveSnapshot } from '../src/state/cache';
import { parseSystemSnapshot } from '../src/api/parse';
import { DASHBOARD_RESPONSE } from './fixtures';
import {
  jsonResponse,
  renderScreen,
  stubFetchFailure,
  stubFetchPending,
  stubFetchWithFixtures,
} from './helpers';

const en = (key: Parameters<typeof translate>[1]) => translate('en', key);

function Probe(): React.JSX.Element {
  const { status, device, lastUpdatedAt, refresh } = useSystem();
  return (
    <View>
      <Text testID="status">{status}</Text>
      <Text testID="device">{device?.deviceId ?? 'none'}</Text>
      <Text testID="updated">{lastUpdatedAt === null ? 'never' : 'known'}</Text>
      <Pressable testID="refresh" onPress={() => void refresh()}>
        <Text>refresh</Text>
      </Pressable>
    </View>
  );
}

function renderProbe(): Promise<unknown> {
  return render(
    <I18nProvider initialLanguage="en">
      <SystemProvider autoPoll={false} useCache={false}>
        <Probe />
      </SystemProvider>
    </I18nProvider>,
  );
}

describe('SystemProvider', () => {
  it('stays in loading while the first request is in flight', async () => {
    stubFetchPending();
    await renderProbe();

    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    expect(screen.getByTestId('device')).toHaveTextContent('none');
  });

  it('reaches success on a good response', async () => {
    stubFetchWithFixtures();
    await renderProbe();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'));
    expect(screen.getByTestId('device')).toHaveTextContent('HYDRAX-SIM-1');
  });

  it('reports error only when there is nothing to show', async () => {
    stubFetchFailure();
    await renderProbe();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('updated')).toHaveTextContent('never');
  });

  it('keeps the last good data and marks it stale when a refresh fails', async () => {
    let shouldFail = false;
    global.fetch = jest.fn(async () => {
      if (shouldFail) throw new TypeError('Network request failed');
      return jsonResponse(DASHBOARD_RESPONSE);
    }) as unknown as typeof fetch;

    await render(
      <I18nProvider initialLanguage="en">
        <SystemProvider autoPoll={false} useCache={false}>
          <Probe />
        </SystemProvider>
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'));

    // The network drops and the user pulls to refresh. The press kicks off an
    // async refresh, so it is wrapped in `act` for the state updates it causes.
    shouldFail = true;
    await act(async () => {
      fireEvent.press(screen.getByTestId('refresh'));
    });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('stale'));
    // The data itself is still there — only its freshness changed.
    expect(screen.getByTestId('device')).toHaveTextContent('HYDRAX-SIM-1');
    expect(screen.getByTestId('updated')).toHaveTextContent('known');
  });
});

describe('offline messaging', () => {
  it('tells the user the controller keeps irrigating when the app cannot connect', async () => {
    stubFetchFailure();
    await renderScreen(<HomeScreen />);

    await waitFor(() => expect(screen.getByText(en('error.title'))).toBeTruthy());
    // The app never claims to be controlling anything, least of all offline.
    expect(screen.getByText(en('source.monitorOnly'))).toBeTruthy();
  });
});

describe('snapshot cache', () => {
  it('round-trips a snapshot so a cold start has something to show', async () => {
    const snapshot = parseSystemSnapshot(DASHBOARD_RESPONSE);
    const at = Date.now();
    await saveSnapshot(snapshot, at);

    const restored = await loadSnapshot(at + 1000);
    expect(restored?.at).toBe(at);
    expect(restored?.snapshot.devices[0]?.deviceId).toBe('HYDRAX-SIM-1');
  });

  it('drops a snapshot older than a day rather than showing yesterday as now', async () => {
    const snapshot = parseSystemSnapshot(DASHBOARD_RESPONSE);
    const at = Date.now();
    await saveSnapshot(snapshot, at);

    expect(await loadSnapshot(at + 25 * 60 * 60 * 1000)).toBeNull();
  });
});
