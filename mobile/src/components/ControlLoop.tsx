/**
 * HYDRAX Mobile — SENSE / UNDERSTAND / DECIDE / ACT / MONITOR.
 *
 * The product story told as live state rather than as a diagram: each stage
 * shows what the controller actually has, concluded or did on the most recent
 * sample. Laid out as a vertical rail, which is the mobile-native shape for a
 * sequence — not the dashboard's horizontal strip squeezed onto a phone.
 *
 * HONESTY BOUNDARY, carried over from the dashboard: the DECIDE stage reports
 * the controller's reported state and never guesses a reason for it. The app
 * can see that a zone reads dry while nothing is running; it cannot see
 * whether that is a cooldown, a timeout lockout or degraded probe coverage —
 * only the controller knows, and it does not report which. So the stage shows
 * the state and stops there.
 */

import { View } from 'react-native';

import type { DeviceSnapshot } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { colors, radius, space, tone as tonePalette, type ToneName } from '../theme/tokens';
import {
  ABSENT,
  driestZone,
  enumLabel,
  moistureStatus,
  percent,
  probeCoverage,
  relativeTime,
} from '../utils/format';
import { Row, Stack } from './layout';
import { Text } from './Text';

interface Stage {
  readonly key: string;
  readonly name: string;
  readonly value: string;
  readonly detail: string;
  readonly active: boolean;
  readonly tone: ToneName;
}

export function ControlLoop({ device }: { device: DeviceSnapshot | null }): React.JSX.Element {
  const { t } = useI18n();
  const stages = buildStages(device, t);

  return (
    <Stack gap={0}>
      {stages.map((stage, index) => (
        <StageRow key={stage.key} stage={stage} last={index === stages.length - 1} />
      ))}
    </Stack>
  );
}

function StageRow({ stage, last }: { stage: Stage; last: boolean }): React.JSX.Element {
  const palette = tonePalette[stage.tone];

  return (
    <Row align="stretch" gap={space.md} accessible accessibilityRole="text">
      {/* rail */}
      <View style={{ width: 14, alignItems: 'center' }}>
        <View
          style={{
            width: stage.active ? 12 : 8,
            height: stage.active ? 12 : 8,
            borderRadius: radius.pill,
            marginTop: 6,
            backgroundColor: stage.active ? palette.fg : colors.surface3,
            borderWidth: stage.active ? 0 : 1,
            borderColor: colors.borderStrong,
          }}
        />
        {last ? null : (
          <View style={{ flex: 1, width: 1, backgroundColor: colors.border, marginTop: 4 }} />
        )}
      </View>

      {/* content */}
      <Stack gap={1} flex={1} style={{ paddingBottom: last ? 0 : space.lg }}>
        <Text variant="micro" color="dim">
          {stage.name}
        </Text>
        <Text variant="bodyStrong" tint={stage.active ? palette.fg : colors.ink}>
          {stage.value}
        </Text>
        <Text variant="body" color="dim">
          {stage.detail}
        </Text>
      </Stack>
    </Row>
  );
}

type T = ReturnType<typeof useI18n>['t'];

export function buildStages(device: DeviceSnapshot | null, t: T): Stage[] {
  const zones = device?.zones ?? [];
  const irrigation = device?.irrigation ?? null;
  const { valid, total } = probeCoverage(zones);
  const driest = driestZone(zones);
  const driestStatus = driest ? moistureStatus(driest.average, driest.band) : null;
  const openValve = zones.some((zone) => zone.valveOpen);

  const sense: Stage = {
    key: 'sense',
    name: t('loop.sense'),
    value: total === 0 ? ABSENT : t('loop.probesValid', { valid, total }),
    detail: total === 0 ? t('loop.awaitingTelemetry') : t('home.acrossZones', { n: zones.length }),
    active: total > 0 && valid === total,
    tone: total === 0 ? 'idle' : valid === total ? 'ok' : valid === 0 ? 'crit' : 'warn',
  };

  const understand: Stage = {
    key: 'understand',
    name: t('loop.understand'),
    value:
      driest === null
        ? ABSENT
        : `${t('common.zone', { n: driest.zone })} · ${percent(driest.average)}`,
    detail: driestStatus === null ? t('loop.noReadings') : t(driestStatus.labelKey),
    active: driest !== null,
    tone: driestStatus?.tone ?? 'idle',
  };

  const decide: Stage = {
    key: 'decide',
    name: t('loop.decide'),
    value: irrigation === null ? ABSENT : enumLabel('state', irrigation.state, t),
    detail:
      irrigation === null
        ? t('loop.awaitingTelemetry')
        : irrigation.activeZone === null
          ? t('loop.holding')
          : t('common.zone', { n: irrigation.activeZone }),
    active: irrigation?.state === 'IRRIGATING' || irrigation?.state === 'STARTING',
    tone:
      irrigation === null
        ? 'idle'
        : irrigation.state === 'IRRIGATING' || irrigation.state === 'STARTING'
          ? 'water'
          : irrigation.state === 'SENSOR_ERROR' ||
              irrigation.state === 'ACTUATOR_ERROR' ||
              irrigation.state === 'TIMEOUT'
            ? 'crit'
            : 'idle',
  };

  const act: Stage = {
    key: 'act',
    name: t('loop.act'),
    value: device?.pumpOn === true ? t('loop.running') : t('loop.holding'),
    detail: openValve ? t('loop.valveOpen') : t('loop.valveClosed'),
    active: device?.pumpOn === true,
    tone: device?.pumpOn === true ? 'water' : 'idle',
  };

  const monitor: Stage = {
    key: 'monitor',
    name: t('loop.monitor'),
    value: device?.online === true ? t('home.online') : t('home.offline'),
    detail: device === null ? t('loop.awaitingTelemetry') : relativeTime(device.lastSeenAt, t),
    active: device?.online === true,
    tone: device?.online === true ? 'ok' : 'warn',
  };

  return [sense, understand, decide, act, monitor];
}
