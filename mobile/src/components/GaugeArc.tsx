/**
 * HYDRAX Mobile — an instrument-style arc gauge.
 *
 * A 180° dial rather than a bare percentage: it is the one element on Home
 * that is allowed to dominate, and it reads as a real gauge on a control
 * panel rather than a stat card. Drawn with react-native-svg, the same
 * dependency the moisture chart already uses — no charting/gauge library.
 *
 * Always left-to-right, in both languages, for the same reason as
 * MoistureBar and MoistureChart: a 0–100% scale is a measurement, not prose.
 */

import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, tone as tonePalette, type ToneName } from '../theme/tokens';

export interface GaugeArcProps {
  /** 0–100. null draws an empty track — an unknown reading, not a zero one. */
  readonly value: number | null;
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly tone?: ToneName;
  /** Advisory band start, drawn as a tick on the arc. */
  readonly marker?: number | null;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function arcPoint(cx: number, cy: number, r: number, percent: number): Point {
  const clamped = Math.max(0, Math.min(100, percent));
  const theta = Math.PI * (1 - clamped / 100);
  return { x: cx + r * Math.cos(theta), y: cy - r * Math.sin(theta) };
}

export function GaugeArc({
  value,
  size = 176,
  strokeWidth = 14,
  tone = 'accent',
  marker = null,
}: GaugeArcProps): React.JSX.Element {
  const height = size / 2 + strokeWidth;
  const cx = size / 2;
  const cy = height - strokeWidth / 2;
  const r = size / 2 - strokeWidth;
  const palette = tonePalette[tone];

  const left = arcPoint(cx, cy, r, 0);
  const right = arcPoint(cx, cy, r, 100);
  const trackD = `M ${left.x} ${left.y} A ${r} ${r} 0 1 1 ${right.x} ${right.y}`;

  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value));
  const end = arcPoint(cx, cy, r, clamped);
  const largeArc = clamped >= 100 ? 1 : 0;
  const valueD =
    value === null || clamped <= 0
      ? null
      : `M ${left.x} ${left.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;

  const markerPoint = marker === null || marker === undefined ? null : arcPoint(cx, cy, r, marker);

  return (
    <View aria-hidden style={{ width: size, height }}>
      <Svg width={size} height={height} viewBox={`0 0 ${size} ${height}`}>
        <Path
          d={trackD}
          stroke={colors.surface3}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
        {valueD === null ? null : (
          <Path
            d={valueD}
            stroke={palette.fg}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
          />
        )}
        {markerPoint === null ? null : (
          <Circle
            cx={markerPoint.x}
            cy={markerPoint.y}
            r={strokeWidth / 2 + 2.5}
            fill="none"
            stroke={colors.ink2}
            strokeWidth={2}
            opacity={0.7}
          />
        )}
      </Svg>
    </View>
  );
}
