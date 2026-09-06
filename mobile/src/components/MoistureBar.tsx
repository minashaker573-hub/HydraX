/**
 * HYDRAX Mobile — a moisture reading as a bar.
 *
 * Always left-to-right, in both languages, and always against a fixed 0–100%
 * track. A moisture percentage is a measurement on a printed scale; mirroring
 * it in Arabic would make it disagree with its own axis labels and with the
 * dashboard showing the same value. Same call the dashboard makes for its
 * gauges (`.ltr-scale`).
 *
 * When the backend holds an advisory threshold band for the zone, its start
 * marker is drawn on the track — clearly a marker, and labelled advisory
 * wherever the number itself is shown, because Phase 1 firmware does not read
 * these values.
 */

import { View } from 'react-native';

import { colors, radius, tone as tonePalette, type ToneName } from '../theme/tokens';

export interface MoistureBarProps {
  /** 0–100. null draws an empty track — an unknown reading, not a zero one. */
  readonly value: number | null;
  readonly tone?: ToneName;
  /** Advisory start threshold, drawn as a tick. */
  readonly marker?: number | null;
  readonly height?: number;
}

export function MoistureBar({
  value,
  tone = 'accent',
  marker = null,
  height = 8,
}: MoistureBarProps): React.JSX.Element {
  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value));
  const palette = tonePalette[tone];

  return (
    <View
      aria-hidden
      style={{
        height,
        borderRadius: radius.pill,
        backgroundColor: colors.surface3,
        overflow: 'hidden',
        // Fixed LTR: the fill always grows from the 0% end of the scale.
        flexDirection: 'row',
      }}
    >
      {value === null ? null : (
        <View
          style={{
            width: `${clamped}%`,
            backgroundColor: palette.fg,
            borderRadius: radius.pill,
          }}
        />
      )}
      {marker === null || marker === undefined ? null : (
        <View
          style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(100, marker))}%`,
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: colors.ink2,
            opacity: 0.65,
          }}
        />
      )}
    </View>
  );
}
