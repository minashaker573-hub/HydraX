/**
 * HYDRAX Mobile — recorded soil moisture over time.
 *
 * Drawn with react-native-svg directly rather than a charting library: one
 * chart, one axis, no interaction, and a fixed 0–100% domain. A charting
 * dependency would be several hundred kilobytes to draw a polyline.
 *
 * Always left-to-right, in both languages. Time runs forward to the right and
 * the percentage axis is printed 0 at the bottom, 100 at the top — a
 * measurement, not prose, so it is not mirrored in Arabic.
 *
 * The domain is pinned to 0–100 rather than fitted to the data. An auto-fitted
 * axis would make a 2-point wobble look like a cliff; on a soil moisture chart
 * that is the difference between "stable" and "something is wrong".
 */

import { View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { TelemetrySample } from '../api/types';
import { colors, space } from '../theme/tokens';
import { Row } from './layout';
import { Text } from './Text';

const ZONE_COLORS = [colors.accent, colors.water, '#C9A227', '#B07FE0'] as const;

const PAD_LEFT = 30;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 18;

export interface MoistureChartProps {
  /** Oldest first. */
  readonly samples: readonly TelemetrySample[];
  readonly width: number;
  readonly height?: number;
}

interface Series {
  readonly zone: number;
  readonly color: string;
  readonly points: { x: number; y: number }[];
}

export function MoistureChart({
  samples,
  width,
  height = 190,
}: MoistureChartProps): React.JSX.Element {
  const plotWidth = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
  const plotHeight = Math.max(1, height - PAD_TOP - PAD_BOTTOM);

  const zoneNumbers = [
    ...new Set(samples.flatMap((sample) => sample.zones.map((zone) => zone.zone))),
  ].sort((a, b) => a - b);

  const xFor = (index: number): number =>
    PAD_LEFT + (samples.length <= 1 ? plotWidth / 2 : (index / (samples.length - 1)) * plotWidth);
  const yFor = (value: number): number => PAD_TOP + (1 - value / 100) * plotHeight;

  const series: Series[] = zoneNumbers.map((zoneNumber, index) => ({
    zone: zoneNumber,
    color: ZONE_COLORS[index % ZONE_COLORS.length] ?? colors.accent,
    points: samples.flatMap((sample, sampleIndex) => {
      const zone = sample.zones.find((candidate) => candidate.zone === zoneNumber);
      if (zone?.average === null || zone?.average === undefined) return [];
      return [{ x: xFor(sampleIndex), y: yFor(zone.average) }];
    }),
  }));

  // Contiguous stretches where the controller reported the pump running.
  const runs: { from: number; to: number }[] = [];
  let runStart: number | null = null;
  samples.forEach((sample, index) => {
    if (sample.pumpOn && runStart === null) runStart = index;
    if (!sample.pumpOn && runStart !== null) {
      runs.push({ from: runStart, to: index });
      runStart = null;
    }
  });
  if (runStart !== null) runs.push({ from: runStart, to: samples.length - 1 });

  return (
    <View>
      <Svg width={width} height={height} accessibilityLabel="Soil moisture over time">
        {/* irrigation runs, behind everything */}
        {runs.map((run) => (
          <Rect
            key={`run-${run.from}`}
            x={xFor(run.from)}
            y={PAD_TOP}
            width={Math.max(1.5, xFor(run.to) - xFor(run.from))}
            height={plotHeight}
            fill={colors.water}
            opacity={0.12}
          />
        ))}

        {[0, 25, 50, 75, 100].map((value) => (
          <Line
            key={`grid-${value}`}
            x1={PAD_LEFT}
            y1={yFor(value)}
            x2={PAD_LEFT + plotWidth}
            y2={yFor(value)}
            stroke={colors.border}
            strokeWidth={1}
          />
        ))}
        {[0, 50, 100].map((value) => (
          <SvgText
            key={`axis-${value}`}
            x={PAD_LEFT - 6}
            y={yFor(value) + 3.5}
            fill={colors.dim}
            fontSize={9}
            textAnchor="end"
          >
            {String(value)}
          </SvgText>
        ))}

        {series.map((line) =>
          line.points.length < 2 ? null : (
            <Path
              key={`line-${line.zone}`}
              d={line.points
                .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
                .join(' ')}
              stroke={line.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
          ),
        )}
      </Svg>

      <Row gap={space.lg} wrap style={{ marginTop: space.sm }} fixed>
        {series.map((line) => (
          <Row key={`legend-${line.zone}`} gap={space.xs + 2} fixed>
            <View
              style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: line.color }}
              aria-hidden
            />
            <Text variant="micro" color="dim" numeric>
              {`ZONE ${line.zone}`}
            </Text>
          </Row>
        ))}
        {runs.length === 0 ? null : (
          <Row gap={space.xs + 2} fixed>
            <View
              style={{
                width: 10,
                height: 8,
                borderRadius: 2,
                backgroundColor: colors.water,
                opacity: 0.35,
              }}
              aria-hidden
            />
            <Text variant="micro" color="dim" numeric>
              PUMP ON
            </Text>
          </Row>
        )}
      </Row>
    </View>
  );
}
