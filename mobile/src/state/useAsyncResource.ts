/**
 * HYDRAX Mobile — loading/success/error for a one-shot fetch.
 *
 * Used by the screens that need something the aggregate snapshot does not
 * carry: telemetry history (History) and device identity detail (Device).
 * Deliberately not a caching query library — these are two screens with one
 * request each, refetched when the user pulls down.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/errors';

export type ResourceStatus = 'loading' | 'success' | 'error';

export interface Resource<T> {
  readonly status: ResourceStatus;
  readonly data: T | null;
  readonly error: ApiError | null;
  readonly refreshing: boolean;
  readonly reload: () => Promise<void>;
}

/**
 * @param fetcher Must be stable (wrap in `useCallback`); it is the dependency
 *                that decides when the resource refetches.
 * @param enabled When false, nothing is fetched and the resource stays in
 *                `loading` — used while the device id is not known yet.
 */
export function useAsyncResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  enabled = true,
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<ResourceStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const mounted = useRef(true);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inFlight.current?.abort();
    };
  }, []);

  const run = useCallback(
    async (manual: boolean) => {
      if (!enabled) return;

      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      if (manual) setRefreshing(true);

      try {
        const next = await fetcher(controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setData(next);
        setError(null);
        setStatus('success');
      } catch (caught) {
        if (!mounted.current || controller.signal.aborted) return;
        setError(caught instanceof ApiError ? caught : new ApiError('network', 'request failed'));
        // Keep whatever is already on screen; only a first failure is fatal.
        setStatus((current) => (current === 'success' ? 'success' : 'error'));
      } finally {
        if (mounted.current && manual) setRefreshing(false);
      }
    },
    [enabled, fetcher],
  );

  useEffect(() => {
    void run(false);
  }, [run]);

  const reload = useCallback(async () => {
    await run(true);
  }, [run]);

  return { status, data, error, refreshing, reload };
}
