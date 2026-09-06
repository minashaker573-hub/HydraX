/**
 * HYDRAX Mobile — status indicators.
 *
 * Rule enforced by construction: a status is never communicated by colour
 * alone. `StatusPill` always renders a word next to its dot, and the dot is
 * decorative (hidden from screen readers) precisely because the word carries
 * the meaning. Someone who cannot distinguish the green from the red still
 * reads ONLINE or OFFLINE.
 */

import { View } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { colors, radius, space, tone as tonePalette, type ToneName } from '../theme/tokens';
import { Row } from './layout';
import { Text } from './Text';

export function ToneDot({ tone, size = 8 }: { tone: ToneName; size?: number }): React.JSX.Element {
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tonePalette[tone].fg,
      }}
    />
  );
}

export interface StatusPillProps {
  readonly tone: ToneName;
  readonly label: string;
  /** Solid fill; used for the one primary status on a screen. */
  readonly emphasis?: 'solid' | 'soft' | 'plain';
  readonly mono?: boolean;
}

export function StatusPill({
  tone,
  label,
  emphasis = 'soft',
  mono = false,
}: StatusPillProps): React.JSX.Element {
  const palette = tonePalette[tone];
  return (
    <Row
      gap={space.xs + 2}
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: emphasis === 'plain' ? 0 : space.sm + 2,
        paddingVertical: emphasis === 'plain' ? 0 : 5,
        borderRadius: radius.pill,
        backgroundColor: emphasis === 'plain' ? 'transparent' : palette.bg,
        borderWidth: emphasis === 'soft' ? 1 : 0,
        borderColor: emphasis === 'soft' ? `${palette.fg}33` : 'transparent',
      }}
      accessible
      accessibilityLabel={label}
    >
      <ToneDot tone={tone} />
      <Text variant="micro" tint={palette.fg} numeric={mono} mono={mono}>
        {label}
      </Text>
    </Row>
  );
}

/** A flat tag with no dot — used for provenance (SIMULATION) and filters. */
export function Badge({
  label,
  tone = 'idle',
  outline = false,
}: {
  label: string;
  tone?: ToneName;
  outline?: boolean;
}): React.JSX.Element {
  const palette = tonePalette[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: space.sm,
        paddingVertical: 3,
        borderRadius: radius.sm,
        backgroundColor: outline ? 'transparent' : palette.bg,
        borderWidth: 1,
        borderColor: outline ? colors.borderStrong : `${palette.fg}33`,
      }}
    >
      <Text variant="micro" tint={outline ? colors.dim : palette.fg}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A labelled value. The workhorse of the Device and zone-detail screens.
 * `value` is rendered numeric/mono by default because most of what this shows
 * is a measurement or an identifier.
 */
export function KeyValue({
  label,
  value,
  tint,
  prose = false,
  hint,
}: {
  label: string;
  value: string;
  tint?: string;
  /** Set for values that are sentences, not measurements. */
  prose?: boolean;
  hint?: string;
}): React.JSX.Element {
  // The Row already flips in Arabic, which puts the value column on the visual
  // left; the text inside it should hug the same outer edge either way.
  const { isRTL } = useI18n();
  const outerEdge = isRTL ? 'left' : 'right';

  return (
    <Row justify="space-between" align="flex-start" gap={space.md}>
      <Text variant="body" color="dim" style={{ flexShrink: 1 }}>
        {label}
      </Text>
      <View style={{ flexShrink: 1, maxWidth: '62%' }}>
        <Text
          variant="bodyStrong"
          numeric={!prose}
          mono={!prose}
          {...(tint === undefined ? null : { tint })}
          style={{ textAlign: outerEdge }}
        >
          {value}
        </Text>
        {hint === undefined ? null : (
          <Text variant="micro" color="dim" style={{ textAlign: outerEdge, letterSpacing: 0 }}>
            {hint}
          </Text>
        )}
      </View>
    </Row>
  );
}
