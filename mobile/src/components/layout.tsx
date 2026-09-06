/**
 * HYDRAX Mobile — layout primitives.
 *
 * `Row` is the reason the app mirrors correctly in Arabic without a native
 * restart: it reads direction from the i18n context and flips its own
 * `flexDirection`, so every horizontal arrangement in the app inherits the
 * right order from one place. Rows that must NOT mirror — a chart axis, a
 * numeric readout — pass `fixed`.
 */

import { View, type ViewProps, type ViewStyle } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { colors, space } from '../theme/tokens';

export interface RowProps extends ViewProps {
  readonly gap?: number;
  readonly align?: ViewStyle['alignItems'];
  readonly justify?: ViewStyle['justifyContent'];
  readonly wrap?: boolean;
  /** Keep left-to-right regardless of language (measurements, axes). */
  readonly fixed?: boolean;
  readonly flex?: number;
}

export function Row({
  gap = space.sm,
  align = 'center',
  justify = 'flex-start',
  wrap = false,
  fixed = false,
  flex,
  style,
  ...rest
}: RowProps): React.JSX.Element {
  const { isRTL } = useI18n();
  return (
    <View
      {...rest}
      style={[
        {
          flexDirection: !fixed && isRTL ? 'row-reverse' : 'row',
          alignItems: align,
          justifyContent: justify,
          columnGap: gap,
          rowGap: wrap ? gap : 0,
          flexWrap: wrap ? 'wrap' : 'nowrap',
          ...(flex === undefined ? null : { flex }),
        },
        style,
      ]}
    />
  );
}

export interface StackProps extends ViewProps {
  readonly gap?: number;
  readonly flex?: number;
}

export function Stack({ gap = space.sm, flex, style, ...rest }: StackProps): React.JSX.Element {
  return (
    <View
      {...rest}
      style={[{ rowGap: gap, ...(flex === undefined ? null : { flex }) }, style]}
    />
  );
}

export function Divider({ inset = 0 }: { inset?: number }): React.JSX.Element {
  return (
    <View
      aria-hidden
      style={{
        height: 1,
        backgroundColor: colors.border,
        marginHorizontal: inset,
      }}
    />
  );
}

/** Pushes whatever follows it to the far end of a Row. */
export function Spacer(): React.JSX.Element {
  return <View style={{ flex: 1 }} />;
}
