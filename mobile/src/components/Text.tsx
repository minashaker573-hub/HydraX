/**
 * HYDRAX Mobile — the only text primitive.
 *
 * Every string on screen goes through here, which is what keeps type scale,
 * colour and reading direction consistent without a component ever setting a
 * raw `fontSize`.
 *
 * Direction: Arabic prose is right-aligned and gets `writingDirection: 'rtl'`.
 * `numeric` opts a value out of that — a percentage, an RSSI, a device id or a
 * firmware string is a measurement or a hardware identifier, and stays
 * left-to-right in both languages so it reads the same way it is printed on
 * the hardware and in the logs.
 */

import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { colors, font, type as typeScale } from '../theme/tokens';

export type TextVariant =
  | 'micro'
  | 'label'
  | 'body'
  | 'bodyStrong'
  | 'title'
  | 'display'
  | 'displayLg';

export type TextColor = 'ink' | 'ink2' | 'dim' | 'accent' | 'inherit';

export interface TextProps extends RNTextProps {
  readonly variant?: TextVariant;
  readonly color?: TextColor;
  /** Force a literal colour (status tones). Wins over `color`. */
  readonly tint?: string;
  /** Keep left-to-right in both languages: numbers, ids, enum tokens. */
  readonly numeric?: boolean;
  /** Monospace face, for values that should line up column-to-column. */
  readonly mono?: boolean;
  readonly center?: boolean;
}

const COLOR_MAP: Record<Exclude<TextColor, 'inherit'>, string> = {
  ink: colors.ink,
  ink2: colors.ink2,
  dim: colors.dim,
  accent: colors.accent,
};

export function Text({
  variant = 'body',
  color = 'ink',
  tint,
  numeric = false,
  mono = false,
  center = false,
  style,
  ...rest
}: TextProps): React.JSX.Element {
  const { isRTL } = useI18n();

  const base: TextStyle = {
    ...typeScale[variant],
    fontWeight: typeScale[variant].fontWeight as TextStyle['fontWeight'],
    color: tint ?? (color === 'inherit' ? undefined : COLOR_MAP[color]),
  };

  const directional: TextStyle = numeric
    ? { writingDirection: 'ltr' }
    : { writingDirection: isRTL ? 'rtl' : 'ltr' };

  if (mono) base.fontFamily = font.mono;

  const alignment: TextStyle = center
    ? { textAlign: 'center' }
    : { textAlign: isRTL && !numeric ? 'right' : 'left' };

  return <RNText {...rest} style={[base, directional, alignment, style]} />;
}
