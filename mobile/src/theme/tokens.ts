/**
 * HYDRAX Mobile — design tokens.
 *
 * BRAND COLOUR SOURCE OF TRUTH: `website/styles.css`'s `:root` block and the
 * HYDRAX mark (`website/assets/logo.jpeg`) — a warm, editorial identity built
 * around ivory paper, deep forest-green ink, muted sage, and a clear
 * water-blue used as the one accent. This file used to run a separate,
 * dark-only, dashboard-derived palette; it now reuses the website's actual
 * declared values so the phone app reads as the same product as the site and
 * the mark, not a second brand. No hue on this page was invented — every
 * value below is a literal value already used in `website/styles.css`,
 * repointed at a mobile-shaped set of names.
 *
 * Two colours had to be chosen between close relatives because the website
 * itself uses a lighter and a darker shade of the same idea and mobile needs
 * exactly one:
 *   - `accent`/`ok` use the website's `--ink` family (its real primary
 *     interactive colour — active nav link, active language toggle, primary
 *     button fill) rather than `--sage`, which the site only ever uses at
 *     decorative size or as white-on-fill, never as small coloured text.
 *   - `water` uses `--water-deep`, not the lighter `--water`, for the same
 *     reason: `--water` reads well as a big droplet or a thin flourish line,
 *     but fails ordinary text-contrast at the sizes this app's status pills
 *     use it at. `--water-deep` is the shade the website itself reaches for
 *     whenever water-blue has to double as legible text (links, the
 *     "required field" marker, hover states).
 *
 * Semantic colour (ok / warn / crit / water) is kept distinct from the plain
 * brand accent so a colour never means two things on one screen. Nothing in
 * the app relies on colour alone — every status also carries a word (see
 * StatusPill).
 */

export const colors = {
  bg: '#FAF7F0', // website --paper
  surface: '#FFFFFF', // website --surface
  surface2: '#F1EBDD', // website --paper-2
  surface3: '#E3DBC9', // website --line, reused as a third depth step
  border: '#E3DBC9', // website --line
  borderStrong: '#CDBF9F', // website --line-strong

  ink: '#1F3626', // website --ink
  ink2: '#40564A', // website --ink-2
  dim: '#7C8577', // website --dim

  accent: '#1F3626', // website --ink — the site's real primary interactive colour
  accentInk: '#FAF7F0', // website --paper — text/icon colour on a solid accent fill
  accentSoft: '#EEF1E6', // website --sage-soft

  ok: '#40564A', // website --ink-2 — same brand-green family as accent, one step lighter
  okSoft: '#EEF1E6', // website --sage-soft
  warn: '#93692E', // website --warn
  warnSoft: '#F5ECD9', // website --warn-soft
  crit: '#9C4433', // website --danger
  critSoft: '#F6E6E0', // website --danger-soft
  water: '#276C86', // website --water-deep (text-safe shade of the droplet blue)
  waterSoft: '#E6F3F6', // website --water-soft
  idle: '#7C8577', // website --dim
  idleSoft: '#F1EBDD', // website --paper-2
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
