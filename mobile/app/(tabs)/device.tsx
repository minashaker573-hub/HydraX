/**
 * HYDRAX Mobile — Device.
 *
 * Identity and link health for the controller, from GET /api/v1/devices/:id
 * (which carries uptime and the stored sample count that the aggregate
 * dashboard view omits) plus the shared snapshot.
 *
 * The DATA SOURCE section is the point of this screen in Phase 1. The backend
 * marks every sample with `simulated`, and this is where that flag is spelled
 * out in full: what is reporting, and whether anything physical is behind it.
 * Nothing here is inferred — every row is a field the backend returned.
 */

import { useCallback } from 'react';

import { Card, SectionHeader } from '../../src/components/Card';
import { ControlLoop } from '../../src/components/ControlLoop';
import { FadeIn } from '../../src/components/FadeIn';
import { ProvenanceBanner } from '../../src/components/ProvenanceBanner';
import { Stack } from '../../src/components/layout';
import { Screen } from '../../src/components/Screen';
import { EmptyState, ErrorState, LoadingState, StaleBanner } from '../../src/components/states';
import { KeyValue, StatusPill } from '../../src/components/status';
import { Text } from '../../src/components/Text';
import { API_BASE_URL } from '../../src/api/config';
import { fetchDeviceDetail } from '../../src/api/services';
import type { DeviceDetail } from '../../src/api/types';
import { useI18n } from '../../src/i18n/I18nProvider';
import { useSystem } from '../../src/state/SystemProvider';
import { useAsyncResource } from '../../src/state/useAsyncResource';
import { colors, space, tone as tonePalette } from '../../src/theme/tokens';
import {
  ABSENT,
  absoluteTime,
  duration,
  enumLabel,
  relativeTime,
  stateTone,
} from '../../src/utils/format';

export default function DeviceScreen(): React.JSX.Element {
  const { t } = useI18n();
  const { device, status, refresh, refreshing, lastUpdatedAt } = useSystem();
  const deviceId = device?.deviceId ?? null;

  const load = useCallback(
    (signal: AbortSignal) =>
      deviceId === null
        ? Promise.reject(new Error('no device'))
        : fetchDeviceDetail(deviceId, { signal }),
    [deviceId],
  );
  const detail = useAsyncResource<DeviceDetail>(load, deviceId !== null);

  const onRefresh = () => {
    void refresh();
    void detail.reload();
  };

  const controllerStatus = device?.controllerStatus ?? detail.data?.current?.controllerStatus ?? null;
  const rssi = device?.wifi?.rssi ?? detail.data?.current?.rssi ?? null;
  const wifiConnected = device?.wifi?.connected ?? detail.data?.current?.wifiConnected ?? null;

  return (
    <Screen
      testID="screen-device"
      title={t('device.title')}
      subtitle={t('device.subtitle')}
      onRefresh={onRefresh}
      refreshing={refreshing || detail.refreshing}
      banner={status === 'stale' ? <StaleBanner lastUpdatedAt={lastUpdatedAt} /> : undefined}
    >
      {device === null && status === 'loading' ? <LoadingState /> : null}

      {device === null && status !== 'loading' ? (
        <EmptyState title={t('device.none')} body={t('device.noneBody')} />
      ) : null}

      {device === null ? null : (
        <>
          <FadeIn>
            <ProvenanceBanner simulated={device.simulated} detailed />
          </FadeIn>

          {/* ----------------------------------------------------- identity */}
          <FadeIn delay={60}>
            <Stack gap={0}>
              <SectionHeader title={t('device.identity')} />
              <Card>
                <Stack gap={space.md}>
                  <KeyValue label={t('device.deviceId')} value={device.deviceId} />
                  <KeyValue
                    label={t('device.firmware')}
                    value={device.firmware ?? t('common.notAvailable')}
                  />
                  <KeyValue
                    label={t('device.controllerStatus')}
                    value={enumLabel('status', controllerStatus, t)}
                    prose
                    tint={
                      controllerStatus === null
                        ? undefined
                        : tonePalette[stateTone(controllerStatus)].fg
                    }
                  />
                  <KeyValue
                    label={t('device.firstSeen')}
                    value={
                      detail.data === null ? ABSENT : absoluteTime(detail.data.firstSeenAt)
                    }
                  />
                  <KeyValue
                    label={t('device.samples')}
                    value={
                      detail.data === null ? ABSENT : detail.data.telemetryCount.toLocaleString('en-US')
                    }
                  />
                </Stack>
              </Card>
            </Stack>
          </FadeIn>

          {/* --------------------------------------------------------- link */}
          <FadeIn delay={120}>
            <Stack gap={0}>
              <SectionHeader title={t('device.link')} />
              <Card>
                <Stack gap={space.md}>
                  <Stack gap={space.sm}>
                    <StatusPill
                      tone={device.online ? 'ok' : 'warn'}
                      label={device.online ? t('home.online') : t('home.offline')}
                    />
                  </Stack>
                  <KeyValue label={t('device.lastSeen')} value={relativeTime(device.lastSeenAt, t)} />
                  <KeyValue
                    label={t('device.wifi')}
                    value={
                      wifiConnected === null
                        ? t('common.notAvailable')
                        : wifiConnected
                          ? t('device.connected')
                          : t('device.disconnected')
                    }
                    tint={wifiConnected === false ? colors.warn : undefined}
                  />
                  <KeyValue
                    label={t('device.rssi')}
                    value={rssi === null ? t('common.notAvailable') : String(rssi)}
                    hint={rssi === null ? undefined : t('device.rssiScale')}
                  />
                  <KeyValue
                    label={t('device.uptime')}
                    value={
                      detail.data?.current?.deviceUptimeMs == null
                        ? t('common.notAvailable')
                        : duration(detail.data.current.deviceUptimeMs, t)
                    }
                  />
                </Stack>
              </Card>
            </Stack>
          </FadeIn>

          {/* ---------------------------------------------------- pipeline
              Relocated from Home in V2: a diagnostic reading of what the
              controller has sensed, concluded and done belongs on the
              diagnostics screen, not on the at-a-glance farm overview. */}
          <FadeIn delay={180}>
            <Stack gap={0}>
              <SectionHeader
                title={t('device.controlPipeline')}
                caption={t('device.controlPipelineCaption')}
              />
              <Card>
                <ControlLoop device={device} />
              </Card>
            </Stack>
          </FadeIn>

          {/* --------------------------------------------------- provenance */}
          <FadeIn delay={240}>
            <Stack gap={0}>
              <SectionHeader title={t('device.provenance')} />
              <Card>
                <Stack gap={space.md}>
                  <KeyValue
                    label={t('source.simulation')}
                    value={device.simulated ? t('home.on') : t('home.off')}
                    tint={device.simulated ? colors.warn : colors.ok}
                  />
                  <KeyValue label={t('device.backend')} value={API_BASE_URL} />
                  <Text variant="body" color="dim">
                    {t('source.monitorOnly')}
                  </Text>
                </Stack>
              </Card>
            </Stack>
          </FadeIn>

          {detail.status === 'error' ? (
            <ErrorState error={detail.error} onRetry={() => void detail.reload()} />
          ) : null}
        </>
      )}
    </Screen>
  );
}
