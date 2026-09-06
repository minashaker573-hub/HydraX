/**
 * HYDRAX Mobile — the one live data source the app shares.
 *
 * Four screens (Home, Zones, Alerts, and the zone detail sheet) all render the
 * same aggregate snapshot, so it is fetched once here and read from context —
 * not fetched four times on four intervals.
 *
 * State model, explicitly:
 *
 *   loading   first fetch in flight, nothing to show yet
 *   success   fresh data from the backend
 *   stale     a fetch failed but earlier data is still on screen, labelled
 *             with its age (including data restored from the phone's cache)
 *   error     nothing to show and the last attempt failed
 *
 * There is no fifth "blank" state: if a fetch fails and anything at all was
 * previously known, the app keeps showing it and says how old it is. A farmer
 * looking at a phone in a field is better served by "this is what the farm
 * looked like four minutes ago" than by an empty screen.
 *
 * No state-management library. One reducer-free provider over four fields is
 * not a problem Redux/Zustand/Jotai solves.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { POLL_INTERVAL_MS } from '../api/config';
import { ApiError } from '../api/errors';
import { fetchSystemSnapshot } from '../api/services';
import type { DeviceSnapshot, SystemSnapshot } from '../api/types';
import { loadSnapshot, saveSnapshot } from './cache';

export type SystemStatus = 'loading' | 'success' | 'stale' | 'error';

export interface SystemValue {
  readonly status: SystemStatus;
  readonly snapshot: SystemSnapshot | null;
  /**
   * The controller being shown. Phase 1 is a single-controller product, so
   * this is the first device the backend reports; the type is a list so
   * multi-controller farms need a picker, not a data-layer rewrite.
   */
  readonly device: DeviceSnapshot | null;
  readonly error: ApiError | null;
  /** Epoch ms of the last successful read, from network or cache. */
  readonly lastUpdatedAt: number | null;
  /** True when what is on screen came from the phone's cache, not the network. */
  readonly fromCache: boolean;
  /** True while a pull-to-refresh is in flight. */
  readonly refreshing: boolean;
  readonly refresh: () => Promise<void>;
}

const SystemContext = createContext<SystemValue | null>(null);

export interface SystemProviderProps {
  readonly children: ReactNode;
  /** Test seam: disables the interval and AppState listener. */
  readonly autoPoll?: boolean;
  /** Test seam: skips reading the on-device cache. */
  readonly useCache?: boolean;
  readonly pollIntervalMs?: number;
}

export function SystemProvider({
  children,
  autoPoll = true,
  useCache = true,
  pollIntervalMs = POLL_INTERVAL_MS,
}: SystemProviderProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [settled, setSettled] = useState(false);

  const mounted = useRef(true);
  const inFlight = useRef<AbortController | null>(null);
  // Read inside the poll callback so a re-render does not restart the interval.
  const hasData = useRef(false);
  hasData.current = snapshot !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inFlight.current?.abort();
    };
  }, []);

  const load = useCallback(async (kind: 'initial' | 'poll' | 'manual') => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    if (kind === 'manual') setRefreshing(true);

    try {
      const next = await fetchSystemSnapshot(20, { signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;

      const at = Date.now();
      setSnapshot(next);
      setError(null);
      setLastUpdatedAt(at);
      setFromCache(false);
      void saveSnapshot(next, at);
    } catch (caught) {
      if (!mounted.current || controller.signal.aborted) return;
      // A failed poll never clears data that is already on screen — it only
      // marks it stale. `status` derives the rest.
      setError(caught instanceof ApiError ? caught : new ApiError('network', 'request failed'));
    } finally {
      if (mounted.current) {
        setSettled(true);
        if (kind === 'manual') setRefreshing(false);
      }
    }
  }, []);

  /* Cold start: show cached data immediately, then go to the network. */
  useEffect(() => {
    let cancelled = false;

    async function start(): Promise<void> {
      if (useCache) {
        const cached = await loadSnapshot();
        // Only fall back to the cache if the live fetch has not already won.
        if (!cancelled && cached !== null && !hasData.current) {
          setSnapshot(cached.snapshot);
          setLastUpdatedAt(cached.at);
          setFromCache(true);
        }
      }
      if (!cancelled) await load('initial');
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, [load, useCache]);

  /* Foreground polling only. */
  useEffect(() => {
    if (!autoPoll) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (timer !== null) return;
      timer = setInterval(() => void load('poll'), pollIntervalMs);
    };
    const stopPolling = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') {
        // Whatever is on screen is at least one interval old by now.
        void load('poll');
        startPolling();
      } else {
        stopPolling();
        inFlight.current?.abort();
      }
    };

    if (AppState.currentState === 'active') startPolling();
    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [autoPoll, load, pollIntervalMs]);

  const refresh = useCallback(async () => {
    await load('manual');
  }, [load]);

  const value = useMemo<SystemValue>(() => {
    const status: SystemStatus =
      snapshot === null
        ? settled && error !== null
          ? 'error'
          : 'loading'
        : error !== null || fromCache
          ? 'stale'
          : 'success';

    return {
      status,
      snapshot,
      device: snapshot?.devices[0] ?? null,
      error,
      lastUpdatedAt,
      fromCache,
      refreshing,
      refresh,
    };
  }, [snapshot, error, lastUpdatedAt, fromCache, refreshing, refresh, settled]);

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}

export function useSystem(): SystemValue {
  const value = useContext(SystemContext);
  if (value === null) {
    throw new Error('useSystem must be used inside <SystemProvider>');
  }
  return value;
}
