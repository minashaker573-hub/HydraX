/**
 * HYDRAX Mobile — the farm's soil moisture at a glance.
 *
 * Replaces the old Home layout's giant bare percentage: the same number, on
 * an instrument dial, with a per-zone breakdown underneath so the farm
 * average never hides a zone that badly needs water. Every value here is
 * `overallMoisture()` / each zone's own `average` — nothing computed beyond
 * what `src/utils/format.ts` already does for the rest of the app.
 */

import type { ZoneSnapshot } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { space, tone as tonePalette } from '../theme/tokens';
import { moistureStatus, percent } from '../utils/format';
import { GaugeArc } from './GaugeArc';
import { Row, Stack } from './layout';
import { MoistureBar } from './MoistureBar';
import { Text } from './Text';

export function MoistureOverview({
  average,
  zones,
}: {
  readonly average: number | null;
  readonly zones: readonly ZoneSnapshot[];
}): React.JSX.Element {
  const { t } = useI18n();

  return (
    <Stack gap={space.lg} style={{ alignItems: 'center' }}>
      <GaugeArc value={average} tone="water" />
      <Stack gap={2} style={{ alignItems: 'center', marginTop: -space.xxl }}>
        <Text variant="displayLg" numeric mono>
          {percent(average)}
        </Text>
        <Text variant="micro" color="dim">
          {t('home.acrossZones', { n: zones.length })}
        </Text>
      </Stack>

      {zones.length === 0 ? null : (
        <Stack gap={space.sm} style={{ width: '100%' }}>
          {zones.map((zone) => {
            const status = moistureStatus(zone.average, zone.band);
            const tone = status?.tone ?? 'idle';
            return (
              <Row key={zone.zone} gap={space.md} align="center">
                <Text variant="micro" color="dim" numeric style={{ width: 58 }}>
                  {t('common.zoneShort', { n: String(zone.zone).padStart(2, '0') })}
                </Text>
                <Row flex={1}>
                  <MoistureBar
                    value={zone.average}
                    tone={tone === 'idle' ? 'accent' : tone}
                    marker={zone.band?.startPercent ?? null}
                    height={6}
                  />
                </Row>
                <Text
                  variant="label"
                  numeric
                  mono
                  tint={tonePalette[tone].fg}
                  style={{ width: 42, textAlign: 'right' }}
                >
                  {percent(zone.average)}
                </Text>
              </Row>
            );
          })}
        </Stack>
      )}

      {average === null && zones.length === 0 ? (
        <Text variant="body" color="dim" center>
          {t('loop.awaitingTelemetry')}
        </Text>
      ) : null}
    </Stack>
  );
}
