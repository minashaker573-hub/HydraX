/**
 * HYDRAX Mobile — last-known-good snapshot, kept on the phone.
 *
 * Purpose is narrow: on a cold start with no connection, show the farm as it
 * was last seen instead of a spinner that never resolves. Cached data is
 * always labelled with its age and marked stale — it is a memory of the farm,
 * never presented as the farm right now.
 *
 * This is not an offline database and does not attempt one. Irrigation runs on
 * the controller; the phone holding a stale reading changes nothing about it.
 *
 * What is stored is the already-parsed app snapshot, not the wire body. It is
 * re-checked on read anyway (shape, and a version tag), because a cache
 * written by an older build of the app is exactly the kind of thing that
 * quietly renders `undefined` three components deep.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SystemSnapshot } from '../api/types';

const KEY = 'hydrax.snapshot.v1';
const VERSION = 1;

/** Older than this and the cache is dropped rather than shown. */
export const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

interface CachedEnvelope {
  readonly version: number;
  readonly at: number;
  readonly snapshot: SystemSnapshot;
}

export interface CachedSnapshot {
  readonly snapshot: SystemSnapshot;
  /** Epoch ms the snapshot was received from the backend. */
  readonly at: number;
}

function looksLikeSnapshot(value: unknown): value is SystemSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { generatedAt?: unknown; devices?: unknown };
  return typeof candidate.generatedAt === 'string' && Array.isArray(candidate.devices);
}

export async function saveSnapshot(snapshot: SystemSnapshot, at: number): Promise<void> {
  try {
    const envelope: CachedEnvelope = { version: VERSION, at, snapshot };
    await AsyncStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    // A phone with no room to spare still gets to monitor its farm.
  }
}

export async function loadSnapshot(now: number = Date.now()): Promise<CachedSnapshot | null> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored === null) return null;

    const envelope = JSON.parse(stored) as Partial<CachedEnvelope>;
    if (envelope.version !== VERSION) return null;
    if (typeof envelope.at !== 'number') return null;
    if (now - envelope.at > MAX_CACHE_AGE_MS) return null;
    if (!looksLikeSnapshot(envelope.snapshot)) return null;

    return { snapshot: envelope.snapshot, at: envelope.at };
  } catch {
    // Unreadable cache is the same as no cache.
    return null;
  }
}

export async function clearSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
