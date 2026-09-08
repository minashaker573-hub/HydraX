/**
 * HYDRAX Mobile — the farm's soil moisture at a glance.
 *
 * Replaces the old Home layout's giant bare percentage: the same number, on
 * an instrument dial, with a per-zone breakdown underneath so the farm
 * average never hides a zone that badly needs water. Every value here is
 * `overallMoisture()` / each zone's own `average` — nothing computed beyond
 * what `src/utils/format.ts` already does for the rest of the app.
 *
 * The dial's colour follows the driest zone's status, not a fixed blue: a
 * farm with one badly dry zone should not look identical to a farm that is
 * evenly, comfortably wet. Zones with no advisory band still read as neutral
 * — the dial never invents a verdict a band doesn't support.
 */

import { View } from 'react-native';

import type { ZoneSnapshot } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { space, tone as tonePalette } from '../theme/tokens';
import { driestZone, moistureStatus, percent } from '../utils/format';
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

  const driest = driestZone(zones);
  const driestStatus = driest === null ? null : moistureStatus(driest.average, driest.band);
  const dialTone = driestStatus === null || driestStatus.tone === 'idle' ? 'water' : driestStatus.tone;

  return (
    <Stack gap={space.lg} style={{ alignItems: 'center' }}>
      <View style={{ alignItems: 'center' }}>
        <GaugeArc value={average} tone={dialTone} />
        {/* Anchored to the gauge's own empty inner arc rather than pulled up
            with a negative margin — stays centred whatever the font scale or
            translation length does to the label's own height. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 6, alignItems: 'center' }}
        >
          <Text variant="displayLg" numeric mono>
            {percent(average)}
          </Text>
          <Text variant="micro" color="dim">
            {t('home.acrossZones', { n: zones.length })}
          </Text>
        </View>
      </View>

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
                  numberOfLines={1}
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
