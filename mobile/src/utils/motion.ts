/**
 * HYDRAX Mobile — motion, and the setting that switches it off.
 *
 * Animation in this app is limited to entrance fades and status transitions.
 * Nothing waits on an animation to finish, and no piece of system logic is
 * driven by one: if every animation were removed, the app would behave
 * identically and only look flatter. That is the point — a monitoring tool
 * should never make someone wait to read a number.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when the phone's "remove animations" / "reduce motion" setting is on.
 * Every animated component checks this and jumps straight to the end state.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduced(enabled);
      })
      .catch(() => {
        // Platform could not answer; assume motion is fine.
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduced(enabled);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/** Entrance timings. Short — this is instrumentation, not a title sequence. */
export const motion = {
  fadeMs: 260,
  /** Per-item stagger for a list of cards, capped so long lists stay snappy. */
  staggerMs: 45,
  maxStaggerSteps: 6,
} as const;

export function staggerDelay(index: number): number {
  return Math.min(index, motion.maxStaggerSteps) * motion.staggerMs;
}
