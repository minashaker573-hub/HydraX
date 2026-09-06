/**
 * HYDRAX Mobile — test environment.
 *
 * Only three things are faked, and each is a native module Jest cannot load:
 * device storage, device locale, and the expo-router navigation object. The
 * app's own code — parsing, formatting, state, components — runs for real.
 *
 * Jest matchers from @testing-library/react-native v14 are built in, so no
 * extend-expect import is needed.
 *
 * `fetch` is deliberately NOT faked globally. Tests that exercise the network
 * stub it explicitly so it is always obvious which response a test is asserting
 * against.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-GB', languageCode: 'en' }],
}));

/**
 * Route params a test wants a screen to see. `zone/[zone].tsx` is the only
 * screen that reads them; a test sets this before rendering it.
 */
(globalThis as unknown as { __routeParams: Record<string, string> }).__routeParams = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () =>
    (globalThis as unknown as { __routeParams: Record<string, string> }).__routeParams,
  Link: ({ children }: { children: React.ReactNode }) => children,
  Stack: Object.assign(() => null, { Screen: () => null }),
  Tabs: Object.assign(() => null, { Screen: () => null }),
}));

// React 19 refuses to flush state updates outside `act` unless the environment
// declares itself a test environment. Without this, an async state update
// (every fetch this app makes) never reaches the rendered tree.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
