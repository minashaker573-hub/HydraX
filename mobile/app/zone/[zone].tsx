/**
 * HYDRAX Mobile — one zone in detail.
 *
 * Presented modally from a zone card. Shows every field the backend currently
 * carries for a zone and nothing else:
 *
 *   probe 1 / probe 2 readings and their validity flags
 *   the zone average and how many probes it was computed from
 *   valve position, and whether this zone is the one being irrigated
 *   the controller's current run time, when this zone is the active one
 *   the backend's advisory threshold band, labelled advisory
 *
 * EXTENSION POINT: when the hardware gains a sensor — flow, pressure, pump
 * current, a third probe — it arrives inside the same `zones[]` object from
 * the same endpoint, and shows up as one more `KeyValue` in the SOIL PROBES or
 * a new section here. Nothing about the navigation, fetching or state model
 * has to change. What must NOT happen is a row appearing before the hardware
 * does: an empty "Flow: —" teaches the reader that the farm has a flow meter.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, SectionHeader } from '../../src/components/Card';
import { FadeIn } from '../../src/components/FadeIn';
import { GaugeArc } from '../../src/components/GaugeArc';
import { Row, Stack } from '../../src/components/layout';
import { EmptyState } from '../../src/components/states';
import { KeyValue, StatusPill } from '../../src/components/status';
import { Text } from '../../src/components/Text';
import { useI18n } from '../../src/i18n/I18nProvider';
import { useSystem } from '../../src/state/SystemProvider';
import { colors, layout, radius, space, tone as tonePalette } from '../../src/theme/tokens';
import {
  ABSENT,
  coverageStatus,
  decimal,
  duration,
  enumLabel,
  moistureStatus,
  percent,
  relativeTime,
} from '../../src/utils/format';

export default function ZoneDetailScreen(): React.JSX.Element {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ zone?: string }>();
  const { device } = useSystem();

  const zoneNumber = Number(params.zone);
  const zone = device?.zones.find((candidate) => candidate.zone === zoneNumber) ?? null;

  const status = zone === null ? null : moistureStatus(zone.average, zone.band);
  const coverage = zone === null ? null : coverageStatus(zone.validSensors);
  const isActiveZone = device?.irrigation?.activeZone === zoneNumber;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: insets.top + space.lg,
        paddingHorizontal: layout.gutter,
        rowGap: space.lg,
      }}
    >
      <Row justify="space-between" align="center">
        <Text variant="display" accessibilityRole="header">
          {zone === null ? t('zone.notFound') : t('common.zone', { n: zoneNumber })}
        </Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text variant="title" color="ink2">
            ×
          </Text>
        </Pressable>
      </Row>

      {zone === null ? (
        <EmptyState title={t('zone.notFound')} body={t('zone.notFoundBody')} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ rowGap: space.lg, paddingBottom: insets.bottom + space.xxl }}
          showsVerticalScrollIndicator={false}
        >
          <FadeIn>
            <Card>
              <Stack gap={space.lg} style={{ alignItems: 'center' }}>
                <Row justify="space-between" style={{ width: '100%' }}>
                  {status === null ? <View /> : <StatusPill tone={status.tone} label={t(status.labelKey)} />}
                  <StatusPill
                    tone={zone.irrigating ? 'water' : 'idle'}
                    label={zone.irrigating ? t('zones.irrigating') : t('zones.idle')}
                  />
                </Row>

                <GaugeArc
                  value={zone.average}
                  marker={zone.band?.startPercent ?? null}
                  tone={status === null || status.tone === 'idle' ? 'accent' : status.tone}
                />
                <Stack gap={2} style={{ alignItems: 'center', marginTop: -space.xxl }}>
                  <Text
                    variant="displayLg"
                    numeric
                    mono
                    tint={status === null ? colors.ink : tonePalette[status.tone].fg}
                  >
                    {percent(zone.average)}
                  </Text>
                  <Text variant="micro" color="dim">
                    {t('zones.soilMoisture')}
                  </Text>
                </Stack>

                <Stack gap={space.md} style={{ width: '100%' }}>
                  <KeyValue
                    label={t('zone.average')}
                    value={
                      zone.average === null
                        ? t('common.notAvailable')
                        : `${decimal(zone.average)}% · ${zone.validSensors}/2`
                    }
                  />
                  <KeyValue
                    label={t('zone.coverage')}
                    value={coverage === null ? ABSENT : t(coverage.labelKey)}
                    prose
                    tint={coverage === null ? undefined : tonePalette[coverage.tone].fg}
                  />
                </Stack>
              </Stack>
            </Card>
          </FadeIn>

          {/* ------------------------------------------------------- probes */}
          <FadeIn delay={60}>
            <Stack gap={0}>
              <SectionHeader title={t('zone.sensors')} />
              <Card>
                <Stack gap={space.md}>
                  <ProbeRow
                    label={t('zone.sensor1')}
                    value={zone.sensor1}
                    valid={zone.sensor1Valid}
                  />
                  <ProbeRow
                    label={t('zone.sensor2')}
                    value={zone.sensor2}
                    valid={zone.sensor2Valid}
                  />
                </Stack>
              </Card>
            </Stack>
          </FadeIn>

          {/* -------------------------------------------------------- state */}
          <FadeIn delay={120}>
            <Stack gap={0}>
              <SectionHeader title={t('zone.state')} />
              <Card>
                <Stack gap={space.md}>
                  <KeyValue
                    label={t('zones.valve')}
                    value={zone.valveOpen ? t('zones.open') : t('zones.closed')}
                    tint={zone.valveOpen ? colors.water : undefined}
                  />
                  <KeyValue
                    label={t('zones.irrigation')}
                    value={
                      device?.irrigation === null || device?.irrigation === undefined
                        ? ABSENT
                        : enumLabel('state', device.irrigation.state, t)
                    }
                    prose
                  />
                  <KeyValue
                    label={t('zone.runtime')}
                    value={
                      isActiveZone && device?.irrigation
                        ? duration(device.irrigation.runMs, t)
                        : t('zone.noRun')
                    }
                    prose={!isActiveZone}
                  />
                  <KeyValue
                    label={t('zones.threshold')}
                    value={
                      zone.band === null
                        ? t('zones.thresholdMissing')
                        : t('zones.startStop', {
                            start: Math.round(zone.band.startPercent),
                            stop: Math.round(zone.band.stopPercent),
                          })
                    }
                    prose
                  />
                  <Text variant="micro" color="dim" style={{ letterSpacing: 0, lineHeight: 15 }}>
                    {zone.band === null ? t('zones.thresholdNote') : t('zones.thresholdAdvisory')}
                  </Text>
                  {device === null ? null : (
                    <KeyValue
                      label={t('device.lastSeen')}
                      value={relativeTime(device.lastSeenAt, t)}
                    />
                  )}
                </Stack>
              </Card>
            </Stack>
          </FadeIn>

          <Text variant="micro" color="dim" style={{ letterSpacing: 0, lineHeight: 15 }}>
            {t('zone.extensible')}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function ProbeRow({
  label,
  value,
  valid,
}: {
  label: string;
  value: number | null;
  valid: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <Row justify="space-between" align="center">
      <Text variant="body" color="dim">
        {label}
      </Text>
      <Row gap={space.md}>
        <Text variant="bodyStrong" numeric mono color={valid ? 'ink' : 'dim'}>
          {value === null ? t('common.notAvailable') : `${decimal(value)}%`}
        </Text>
        <StatusPill
          tone={valid ? 'ok' : 'crit'}
          label={valid ? t('zone.valid') : t('zone.invalid')}
        />
      </Row>
    </Row>
  );
}
