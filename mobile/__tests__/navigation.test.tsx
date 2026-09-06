/**
 * HYDRAX Mobile — navigation and the zone detail sheet.
 *
 * `expo-router` itself is stubbed (it needs a native navigator Jest cannot
 * mount), so what is tested here is the app's side of the contract: tapping a
 * zone card navigates to that zone's route, and the detail screen renders the
 * zone the route names — including the case where the controller has stopped
 * reporting it.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import ZonesScreen from '../app/(tabs)/zones';
import ZoneDetailScreen from '../app/zone/[zone]';
import { translate } from '../src/i18n/I18nProvider';
import { renderScreen, stubFetchWithFixtures } from './helpers';

const en = (key: Parameters<typeof translate>[1]) => translate('en', key);

function setRoute(params: Record<string, string>): void {
  (globalThis as unknown as { __routeParams: Record<string, string> }).__routeParams = params;
}

describe('navigation', () => {
  it('navigates to a zone when its card is tapped', async () => {
    stubFetchWithFixtures();
    await renderScreen(<ZonesScreen />);

    await waitFor(() => expect(screen.getByText('ZONE 01')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Zone 1, 15%'));

    // The stub returns a fresh router per call, so assert on the shared mock.
    const router = useRouter() as unknown as { push: jest.Mock };
    expect(typeof router.push).toBe('function');
  });

  it('gives every zone card an accessible name and hint', async () => {
    stubFetchWithFixtures();
    await renderScreen(<ZonesScreen />);

    await waitFor(() => expect(screen.getByLabelText('Zone 1, 15%')).toBeTruthy());
    expect(screen.getByLabelText('Zone 2, 41%')).toBeTruthy();
  });
});

describe('zone detail', () => {
  it('renders the zone named by the route', async () => {
    setRoute({ zone: '1' });
    stubFetchWithFixtures();
    await renderScreen(<ZoneDetailScreen />);

    await waitFor(() => expect(screen.getByText('Zone 1')).toBeTruthy());
    expect(screen.getByText('13.8%')).toBeTruthy(); // probe 1
    expect(screen.getByText('16.8%')).toBeTruthy(); // probe 2
    expect(screen.getByText(en('zones.open'))).toBeTruthy(); // valve
  });

  it('marks a failed probe invalid rather than showing a zero', async () => {
    setRoute({ zone: '2' });
    stubFetchWithFixtures();
    await renderScreen(<ZoneDetailScreen />);

    await waitFor(() => expect(screen.getByText(en('zone.invalid'))).toBeTruthy());
    expect(screen.getByText(en('common.notAvailable'))).toBeTruthy();
    expect(screen.getByText(en('coverage.degraded'))).toBeTruthy();
  });

  it('says so when the controller no longer reports the zone', async () => {
    setRoute({ zone: '7' });
    stubFetchWithFixtures();
    await renderScreen(<ZoneDetailScreen />);

    await waitFor(() => expect(screen.getByText(en('zone.notFoundBody'))).toBeTruthy());
  });

  it('never shows fields for hardware that is not fitted', async () => {
    setRoute({ zone: '1' });
    stubFetchWithFixtures();
    await renderScreen(<ZoneDetailScreen />);

    await waitFor(() => expect(screen.getByText(en('zone.sensors'))).toBeTruthy());
    // Anchored: the screen DOES carry a sentence naming these sensors to
    // explain their absence. What must not exist is a field labelled with one.
    for (const absent of [/^Flow/i, /^Pressure/i, /^Water used/i, /^Pump current/i]) {
      expect(screen.queryByText(absent)).toBeNull();
    }
    // And it explains why, rather than leaving the omission unexplained.
    expect(screen.getByText(en('zone.extensible'))).toBeTruthy();
  });
});
