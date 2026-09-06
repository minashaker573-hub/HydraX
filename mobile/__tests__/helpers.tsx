/**
 * HYDRAX Mobile — shared test setup.
 *
 * Renders a screen inside the real providers, with the real parsing and state
 * machinery, over a stubbed `fetch`. The only thing faked is the network.
 */

import { render, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';

import { I18nProvider } from '../src/i18n/I18nProvider';
import type { Language } from '../src/i18n/strings';
import { SystemProvider } from '../src/state/SystemProvider';
import { fixtureFor } from './fixtures';

const INSETS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 40, left: 0, right: 0, bottom: 24 },
};

export interface RenderOptions {
  readonly language?: Language;
  readonly withSystem?: boolean;
}

/**
 * @testing-library/react-native v14 renders asynchronously, so this returns a
 * promise: every test awaits it before querying.
 */
export function renderScreen(
  ui: ReactElement,
  { language = 'en', withSystem = true }: RenderOptions = {},
): Promise<RenderResult> {
  const tree = (
    <SafeAreaProvider initialMetrics={INSETS}>
      <I18nProvider initialLanguage={language}>
        {withSystem ? (
          <SystemProvider autoPoll={false} useCache={false}>
            {ui}
          </SystemProvider>
        ) : (
          ui
        )}
      </I18nProvider>
    </SafeAreaProvider>
  );
  return render(tree);
}

/** Answers every request from the captured backend fixtures. */
export function stubFetchWithFixtures(): jest.Mock {
  const mock = jest.fn(async (url: string) => jsonResponse(fixtureFor(url)));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** Answers every request with one body, whatever the path. */
export function stubFetchWith(body: unknown, status = 200): jest.Mock {
  const mock = jest.fn(async () => jsonResponse(body, status));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** Never answers, the way a request still in flight has not answered yet. */
export function stubFetchPending(): jest.Mock {
  const mock = jest.fn(() => new Promise<Response>(() => {}));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** Fails every request the way a phone off the network does. */
export function stubFetchFailure(message = 'Network request failed'): jest.Mock {
  const mock = jest.fn(async () => {
    throw new TypeError(message);
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}
