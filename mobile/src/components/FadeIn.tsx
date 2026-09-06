/**
 * HYDRAX Mobile — entrance animation.
 *
 * React Native's built-in `Animated` with `useNativeDriver`, not a third-party
 * animation library: this app needs a fade and an 8px rise, and pulling in a
 * runtime for that would be more machinery than motion.
 *
 * When the phone asks for reduced motion, the component renders its children
 * in the final state on the first frame — no animation, no delay, no layout
 * difference.
 */

import { useEffect, useRef } from 'react';
import { Animated, type ViewProps } from 'react-native';

import { motion, useReducedMotion } from '../utils/motion';

export interface FadeInProps extends ViewProps {
  /** Milliseconds to wait before starting; use `staggerDelay(index)` in lists. */
  readonly delay?: number;
  /** Distance in dp the content rises from. */
  readonly rise?: number;
}

export function FadeIn({
  delay = 0,
  rise = 8,
  style,
  children,
  ...rest
}: FadeInProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.fadeMs,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reduced]);

  return (
    <Animated.View
      {...rest}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [rise, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
