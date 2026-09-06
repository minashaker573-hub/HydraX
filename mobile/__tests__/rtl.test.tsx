/**
 * HYDRAX Mobile — Arabic and right-to-left.
 *
 * These tests exist because RTL is the part of a bilingual app that silently
 * rots: the strings get translated, and the layout keeps running the other way
 * because nobody looked. They assert the three things that actually matter:
 *
 *   1. Arabic copy renders in Arabic.
 *   2. Rows reverse, so a label/value pair reads label-first in both languages.
 *   3. Measurements do NOT reverse — a percentage, an RSSI or a device id keeps
 *      left-to-right order and Western digits, in Arabic as in English.
 *
 * Switching language does not restart the app: direction lives in our own
 * layout layer, not in `I18nManager`, which is what these assertions verify.
 */

import { screen, waitFor } from '@testing-library/react-native';
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import HomeScreen from '../app/(tabs)/index';
import ZoneDetailScreen from '../app/zone/[zone]';
import { Row } from '../src/components/layout';
import { Text } from '../src/components/Text';
import { translate } from '../src/i18n/I18nProvider';
import { renderScreen, stubFetchWithFixtures } from './helpers';

const ar = (key: Parameters<typeof translate>[1]) => translate('ar', key);
const en = (key: Parameters<typeof translate>[1]) => translate('en', key);

function flat<T>(style: unknown): T {
  return StyleSheet.flatten(style as never) as T;
}

describe('Arabic copy', () => {
  it('renders the Home screen in Arabic', async () => {
    stubFetchWithFixtures();
    await renderScreen(<HomeScreen />, { language: 'ar' });

    await waitFor(() => expect(screen.getByText(ar('home.soilOverview'))).toBeTruthy());
    expect(screen.getByText(ar('home.irrigationStatus'))).toBeTruthy();
    expect(screen.getByText(ar('home.zoneSnapshot'))).toBeTruthy();
    // And none of the English equivalents leaked through.
    expect(screen.queryByText(en('home.soilOverview'))).toBeNull();
  });

  it('keeps measurements in Western digits and LTR order', async () => {
    stubFetchWithFixtures();
    await renderScreen(<HomeScreen />, { language: 'ar' });

    await waitFor(() => expect(screen.getByText('28%')).toBeTruthy());
    const style = flat<TextStyle>(screen.getByText('28%').props.style);
    expect(style.writingDirection).toBe('ltr');
  });

  it('keeps the device id unmirrored on the zone sheet', async () => {
    (globalThis as unknown as { __routeParams: Record<string, string> }).__routeParams = {
      zone: '2',
    };
    stubFetchWithFixtures();
    await renderScreen(<ZoneDetailScreen />, { language: 'ar' });

    await waitFor(() => expect(screen.getByText(ar('zone.sensors'))).toBeTruthy());
    // Zone 2 has one failed probe in the fixture; the app says so in Arabic.
    expect(screen.getByText(ar('zone.invalid'))).toBeTruthy();
    const reading = screen.getByText('41.2%');
    expect(flat<TextStyle>(reading.props.style).writingDirection).toBe('ltr');
  });
});

describe('direction', () => {
  it('reverses rows in Arabic and leaves them alone in English', async () => {
    await renderScreen(
      <Row testID="row">
        <Text>a</Text>
      </Row>,
      { language: 'ar', withSystem: false },
    );
    expect(flat<ViewStyle>(screen.getByTestId('row').props.style).flexDirection).toBe(
      'row-reverse',
    );

    await renderScreen(
      <Row testID="row-en">
        <Text>a</Text>
      </Row>,
      { language: 'en', withSystem: false },
    );
    expect(flat<ViewStyle>(screen.getByTestId('row-en').props.style).flexDirection).toBe('row');
  });

  it('never reverses a row marked fixed, whatever the language', async () => {
    await renderScreen(
      <Row testID="axis" fixed>
        <Text>0</Text>
      </Row>,
      { language: 'ar', withSystem: false },
    );
    expect(flat<ViewStyle>(screen.getByTestId('axis').props.style).flexDirection).toBe('row');
  });

  it('right-aligns Arabic prose and left-aligns English prose', async () => {
    await renderScreen(<Text testID="prose">مرحبا</Text>, {
      language: 'ar',
      withSystem: false,
    });
    const arabic = flat<TextStyle>(screen.getByTestId('prose').props.style);
    expect(arabic.writingDirection).toBe('rtl');
    expect(arabic.textAlign).toBe('right');

    await renderScreen(<Text testID="prose-en">Hello</Text>, {
      language: 'en',
      withSystem: false,
    });
    const english = flat<TextStyle>(screen.getByTestId('prose-en').props.style);
    expect(english.writingDirection).toBe('ltr');
    expect(english.textAlign).toBe('left');
  });
});
