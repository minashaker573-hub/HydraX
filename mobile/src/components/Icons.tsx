/**
 * HYDRAX Mobile — the icon set.
 *
 * Six stroked paths, drawn with react-native-svg (already a dependency for the
 * chart). No icon font, no icon package: an icon library would ship a thousand
 * glyphs to render five, and these are the same shapes the dashboard sidebar
 * uses, which is what makes the two surfaces feel like one product.
 */

import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '../theme/tokens';

export type IconName = 'home' | 'zones' | 'history' | 'alerts' | 'device' | 'droplet' | 'chevron';

export interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly color?: string;
}

export function Icon({ name, size = 22, color = colors.dim }: IconProps): React.JSX.Element {
  const common = {
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {name === 'home' ? (
        <Path d="M4 11.5 12 4l8 7.5M6 10v9h5v-5h2v5h5v-9" {...common} />
      ) : null}
      {name === 'zones' || name === 'droplet' ? (
        <Path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z" {...common} />
      ) : null}
      {name === 'history' ? <Path d="M3 17l5-6 4 3 5-7 4 4" {...common} /> : null}
      {name === 'alerts' ? (
        <>
          <Path d="M12 3a5 5 0 0 0-5 5v3l-2 4h14l-2-4V8a5 5 0 0 0-5-5Z" {...common} />
          <Path d="M9.5 19a2.5 2.5 0 0 0 5 0" {...common} />
        </>
      ) : null}
      {name === 'device' ? (
        <>
          <Rect x={5} y={3} width={14} height={18} rx={2} {...common} />
          <Path d="M9 7h6M9 11h6M9 15h3" {...common} />
        </>
      ) : null}
      {name === 'chevron' ? <Path d="M9 5l7 7-7 7" {...common} /> : null}
    </Svg>
  );
}

/** The HYDRAX droplet, used as the app's wordmark lockup. */
export function BrandMark({
  size = 26,
  color = colors.accent,
}: {
  size?: number;
  color?: string;
}): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <Path d="M50 14 C50 14 76 44 76 62 a26 26 0 0 1-52 0 C24 44 50 14 50 14Z" fill={color} />
      <Circle cx={50} cy={62} r={9} fill={colors.bg} opacity={0.28} />
    </Svg>
  );
}
