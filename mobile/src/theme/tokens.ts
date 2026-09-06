/**
 * HYDRAX Mobile — design tokens.
 *
 * The palette is lifted from the dashboard stylesheet (dashboard/styles.css)
 * so the two surfaces read as one product. It is deliberately dark-only: this
 * app is a control-room instrument that gets looked at in a barn at 05:00 and
 * in direct sun at noon, and a light theme that nobody asked for is a second
 * palette to keep honest for no benefit.
 *
 * Semantic colour (ok / warn / crit / water) is kept separate from the brand
 * accent so a colour never means two things on one screen. Nothing in the app
 * relies on colour alone — every status also carries a word (see StatusPill).
 */

export const colors = {
  bg: '#0A0D0C',
  surface: '#121613',
  surface2: '#1A1F1B',
  surface3: '#242B25',
  border: '#232A25',
  borderStrong: '#333D34',

  ink: '#EEF2EF',
  ink2: '#C3CCC6',
  dim: '#8B968F',

  accent: '#2FBF6E',
  accentInk: '#06120A',
  accentSoft: '#10281A',

  ok: '#34C98F',
  okSoft: '#10281D',
  warn: '#E0A84A',
  warnSoft: '#2F2510',
  crit: '#F0554A',
  critSoft: '#33140F',
  water: '#4DB8F0',
  waterSoft: '#0E2632',
  idle: '#8B968F',
  idleSoft: '#1A1F1B',
} as const;

export type ToneName = 'ok' | 'warn' | 'crit' | 'water' | 'idle' | 'accent';

/** Foreground/background pair for a status tone. */
export const tone: Record<ToneName, { fg: string; bg: string }> = {
  ok: { fg: colors.ok, bg: colors.okSoft },
  warn: { fg: colors.warn, bg: colors.warnSoft },
  crit: { fg: colors.crit, bg: colors.critSoft },
  water: { fg: colors.water, bg: colors.waterSoft },
  idle: { fg: colors.idle, bg: colors.idleSoft },
  accent: { fg: colors.accent, bg: colors.accentSoft },
};

/** 4pt base grid. Generous by default — this is a product, not a table dump. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const layout = {
  /** Horizontal page gutter. */
  gutter: 16,
  /** Minimum height/width for anything tappable (Android guidance is 48dp). */
  touchTarget: 48,
  /** Extra bottom padding so content clears the tab bar. */
  tabBarClearance: 28,
} as const;

export const font = {
  /**
   * `monospace` on Android maps to Droid Sans Mono, which is present on every
   * device — no font file is bundled, so nothing has to be downloaded and
   * nothing fails to load offline.
   */
  mono: 'monospace' as const,
};

export const type = {
  /** Small all-caps technical label — the dashboard's micro-label idiom. */
  micro: { fontSize: 10.5, letterSpacing: 1.1, fontWeight: '700' },
  label: { fontSize: 12, letterSpacing: 0.3, fontWeight: '600' },
  body: { fontSize: 14, fontWeight: '400' },
  bodyStrong: { fontSize: 14, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700' },
  display: { fontSize: 34, fontWeight: '700' },
  displayLg: { fontSize: 44, fontWeight: '700' },
} as const;
