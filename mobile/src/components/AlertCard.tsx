/**
 * HYDRAX Mobile — one alert, and one controller event.
 *
 * Alerts carry the backend's own id, severity, type, message and timestamps.
 * The message is the backend's operator-facing sentence (written in
 * backend/src/domain/alerts.ts), which is deliberately shown as-is: it is
 * product copy, not an exception string, and it already explains what to check.
 */

import type { AlertSnapshot, EventSnapshot } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { colors, space, tone as tonePalette } from '../theme/tokens';
import { enumLabel, relativeTime, severityTone } from '../utils/format';
import { Card } from './Card';
import { Row, Stack } from './layout';
import { Badge, StatusPill } from './status';
import { Text } from './Text';

export function AlertCard({ alert }: { alert: AlertSnapshot }): React.JSX.Element {
  const { t } = useI18n();
  const severity = severityTone(alert.severity);
  const displayTone = alert.active ? severity : 'idle';
  const palette = tonePalette[displayTone];

  return (
    <Card accentEdge={palette.fg}>
      <Stack gap={space.sm}>
        <Row justify="space-between" align="flex-start" gap={space.sm}>
          <Stack gap={2} flex={1}>
            <Text variant="micro" color="dim" numeric>
              {alert.type}
            </Text>
            <Text variant="title">{enumLabel('alert', alert.type, t)}</Text>
          </Stack>
          <StatusPill
            tone={displayTone}
            label={
              alert.active
                ? alert.severity === 'critical'
                  ? t('alerts.critical')
                  : t('alerts.warning')
                : t('alerts.resolved')
            }
          />
        </Row>

        <Text variant="body" color="ink2">
          {alert.message}
        </Text>

        <Row gap={space.md} wrap>
          <Text variant="micro" color="dim" numeric>
            {t('alerts.raised', { when: relativeTime(alert.raisedAt, t) })}
          </Text>
          {alert.resolvedAt === null ? null : (
            <Text variant="micro" color="dim" numeric>
              {t('alerts.resolvedAt', { when: relativeTime(alert.resolvedAt, t) })}
            </Text>
          )}
          {alert.deviceId === '' ? null : <Badge label={alert.deviceId} outline />}
        </Row>
      </Stack>
    </Card>
  );
}

export function EventRow({ event, last = false }: { event: EventSnapshot; last?: boolean }) {
  const { t } = useI18n();
  const isFault =
    event.type === 'SENSOR_ERROR' ||
    event.type === 'ACTUATOR_ERROR' ||
    event.type === 'IRRIGATION_TIMEOUT';
  const isWater = event.type === 'IRRIGATION_STARTED' || event.type === 'ZONE_ACTIVATED';

  return (
    <Row
      align="flex-start"
      gap={space.md}
      style={{
        paddingVertical: space.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Stack gap={2} flex={1}>
        <Text variant="bodyStrong">{enumLabel('event', event.type, t)}</Text>
        <Row gap={space.sm} wrap>
          {event.zone === null ? null : (
            <Text variant="micro" color="dim">
              {t('common.zone', { n: event.zone })}
            </Text>
          )}
          {event.detail === null || event.detail === '' ? null : (
            <Text variant="micro" color="dim">
              {event.detail}
            </Text>
          )}
        </Row>
      </Stack>
      <Stack gap={2} style={{ alignItems: 'flex-end' }}>
        <Text
          variant="micro"
          numeric
          tint={isFault ? colors.crit : isWater ? colors.water : colors.dim}
        >
          {relativeTime(event.receivedAt, t)}
        </Text>
        {event.moisture === null ? null : (
          <Text variant="micro" color="dim" numeric mono>
            {`${Math.round(event.moisture)}%`}
          </Text>
        )}
      </Stack>
    </Row>
  );
}
