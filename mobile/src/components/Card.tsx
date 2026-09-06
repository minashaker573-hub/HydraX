/**
 * HYDRAX Mobile — the card, and the label above it.
 *
 * One surface, one border, one radius. The dashboard's restraint carried over:
 * no gradients, no glow, no stacked shadows. Depth comes from the border and a
 * single step of surface lightness, which is what keeps a screen full of cards
 * readable in sunlight.
 */

import { Pressable, View, type ViewProps } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { colors, radius, space } from '../theme/tokens';
import { Row } from './layout';
import { Text } from './Text';

export interface CardProps extends ViewProps {
  readonly padded?: boolean;
  /** Slightly lighter surface, for a card that sits on top of another. */
  readonly raised?: boolean;
  readonly accentEdge?: string;
}

export function Card({
  padded = true,
  raised = false,
  accentEdge,
  style,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  // The edge marker hugs the side the reader starts from. It cannot use the
  // `start` style property for that: `start` resolves against `I18nManager`,
  // which this app deliberately never flips (see src/i18n/I18nProvider.tsx),
  // so in Arabic it would resolve to the left and sit at the end of the card.
  const { isRTL } = useI18n();

  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: raised ? colors.surface2 : colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.md,
          padding: padded ? space.lg : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {accentEdge === undefined ? null : (
        <View
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            ...(isRTL ? { right: 0 } : { left: 0 }),
            width: 3,
            backgroundColor: accentEdge,
          }}
        />
      )}
      {children}
    </View>
  );
}

/** A card the whole of which is a tap target. */
export function PressableCard({
  onPress,
  accessibilityLabel,
  accessibilityHint,
  children,
  style,
  accentEdge,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  children: React.ReactNode;
  style?: ViewProps['style'];
  accentEdge?: string;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      {...(accessibilityHint === undefined ? null : { accessibilityHint })}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }, style]}
    >
      <Card {...(accentEdge === undefined ? null : { accentEdge })}>{children}</Card>
    </Pressable>
  );
}

/**
 * The all-caps micro-label that heads a section — the dashboard's idiom for
 * "this is instrumentation, not an article".
 */
export function SectionHeader({
  title,
  caption,
  trailing,
}: {
  title: string;
  caption?: string;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={{ rowGap: 2, marginBottom: space.md, marginTop: space.sm }}>
      <Row justify="space-between" align="center">
        <Text variant="micro" color="dim" accessibilityRole="header">
          {title}
        </Text>
        {trailing}
      </Row>
      {caption === undefined ? null : (
        <Text variant="body" color="dim">
          {caption}
        </Text>
      )}
    </View>
  );
}
