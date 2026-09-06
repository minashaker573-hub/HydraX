/**
 * HYDRAX Mobile — application root.
 *
 * Providers, in the order they depend on each other:
 *   SafeAreaProvider  device insets, needed by every screen frame
 *   I18nProvider      language + direction, needed before any text renders
 *   SystemProvider    the shared telemetry snapshot and its polling loop
 *
 * The stack itself is headerless: each screen draws its own title block, which
 * is what lets the type scale be the same on a screen title as it is on a
 * metric. The zone detail route is the one exception and presents modally.
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider } from '../src/i18n/I18nProvider';
import { SystemProvider } from '../src/state/SystemProvider';
import { colors } from '../src/theme/tokens';

export default function RootLayout(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SystemProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="zone/[zone]"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
          </Stack>
        </SystemProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
