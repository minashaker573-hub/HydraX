/**
 * HYDRAX Mobile — is the farm being watered right now?
 *
 * Three facts, side by side: the pump, the zone it is serving (if any), and
 * the valve position summary. Everything here comes straight off
 * `DeviceSnapshot` — no state is invented for a controller that hasn't
 * reported one yet.
 */

import type { DeviceSnapshot } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { colors, space } from '../theme/tokens';
import { ABSENT, duration } from '../utils/format';
import { Row, Stack } from './layout';
import { Text } from './Text';

export function IrrigationStatusCard({
  device,
}: {
  readonly device: DeviceSnapshot;
}): React.JSX.Element {
  const { t } = useI18n();
  const irrigation = device.irrigation;
  const openValves = device.zones.filter((zone) => zone.valveOpen).length;
  const isRunning = device.pumpOn === true;

  return (
    <Row justify="space-between" gap={space.lg}>
      <Field
        label={t('home.pump')}
        value={isRunning ? t('home.on') : t('home.off')}
        tint={isRunning ? colors.water : colors.dim}
      />
      <Field
        label={t('home.activeZone')}
        value={
          irrigation?.activeZone == null ? t('common.none') : t('common.zone', { n: irrigation.activeZone })
        }
        tint={irrigation?.activeZone == null ? colors.dim : colors.water}
        hint={
          isRunning && irrigation !== null && irrigation.runMs > 0
            ? duration(irrigation.runMs, t)
            : undefined
        }
      />
      <Field
        label={t('zones.valve')}
        value={
          device.zones.length === 0
            ? ABSENT
            : t('home.valvesOpen', { open: openValves, total: device.zones.length })
        }
        tint={openValves > 0 ? colors.water : colors.dim}
      />
    </Row>
  );
}

function Field({
  label,
  value,
  tint,
  hint,
}: {
  label: string;
  value: string;
  tint: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <Stack gap={2} flex={1}>
      <Text variant="micro" color="dim">
        {label}
      </Text>
      <Text variant="title" tint={tint} numeric mono>
        {value}
      </Text>
      {hint === undefined ? null : (
        <Text variant="micro" color="dim" numeric>
          {hint}
        </Text>
      )}
    </Stack>
  );
}
