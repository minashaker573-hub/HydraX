/**
 * HYDRAX Mobile — History.
 *
 * Built from two real endpoints:
 *   GET /api/v1/devices/:id/telemetry   the moisture chart and its span
 *   GET /api/v1/devices/:id/events      the irrigation event log
 *
 * PUMP RUNTIME is summed from the `duration_ms` the controller reported on its
 * own irrigation events. It is the only aggregate on this screen, and it is a
 * sum of reported values rather than an estimate.
 *
 * What is deliberately absent: water volume, flow rate, litres saved, pump
 * health, weather. No flow meter, pressure sensor or current sensor exists on
 * the Phase 1 hardware, so none of those can be measured — and inferring them
 * from runtime would be a fabrication that reads as fact. The card at the
 * bottom says exactly that instead of quietly omitting it.
 */

import { useCallback } from 'react';
import { useWindowDimensions } from 'react-native';

import { ActivityTimeline } from '../../src/components/ActivityTimeline';
import { Card, SectionHeader } from '../../src/components/Card';
import { FadeIn } from '../../src/components/FadeIn';
import { MoistureChart } from '../../src/components/MoistureChart';
import { Row, Stack } from '../../src/components/layout';
import { Screen } from '../../src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/states';
import { Badge } from '../../src/components/status';
import { Text } from '../../src/components/Text';
import { fetchDeviceEvents, fetchTelemetryHistory } from '../../src/api/services';
import type { EventSnapshot, TelemetryHistory } from '../../src/api/types';
import { useI18n } from '../../src/i18n/I18nProvider';
import { useSystem } from '../../src/state/SystemProvider';
import { useAsyncResource } from '../../src/state/useAsyncResource';
import { layout, space } from '../../src/theme/tokens';
import { duration, relativeTime } from '../../src/utils/format';

/**
 * 60 samples, not 180. The backend fetches each sample's zone rows in a
 * separate query, so the endpoint costs roughly 40 ms per sample against a
 * hosted Postgres — 180 samples takes about eight seconds and trips the
 * client timeout. Sixty points is also as many as a phone-width chart can
 * resolve. See docs/MOBILE.md, "Known limitations".
 */
const SAMPLE_LIMIT = 60;
const EVENT_LIMIT = 60;

/** This one endpoint is slow enough to need more headroom than the default. */
const HISTORY_TIMEOUT_MS = 20_000;

export default function HistoryScreen(): React.JSX.Element {
  const { t } = useI18n();
  const { device } = useSystem();
  const { width } = useWindowDimensions();
  const deviceId = device?.deviceId ?? null;

  const loadTelemetry = useCallback(
    (signal: AbortSignal) =>
      deviceId === null
        ? Promise.reject(new Error('no device'))
        : fetchTelemetryHistory(deviceId, SAMPLE_LIMIT, {
            signal,
            timeoutMs: HISTORY_TIMEOUT_MS,
          }),
    [deviceId],
  );
  const loadEvents = useCallback(
    (signal: AbortSignal) =>
      deviceId === null
        ? Promise.reject(new Error('no device'))
        : fetchDeviceEvents(deviceId, EVENT_LIMIT, { signal }),
    [deviceId],
  );

  const telemetry = useAsyncResource<TelemetryHistory>(loadTelemetry, deviceId !== null);
  const events = useAsyncResource<EventSnapshot[]>(loadEvents, deviceId !== null);

  const refresh = () => {
    void telemetry.reload();
    void events.reload();
  };

  const samples = telemetry.data?.samples ?? [];
  const eventList = events.data ?? [];
  const runs = eventList.filter((event) => event.type === 'IRRIGATION_STOPPED');
  const timedRuns = runs.filter((event) => (event.durationMs ?? 0) > 0);
  const totalRuntimeMs = timedRuns.reduce((sum, event) => sum + (event.durationMs ?? 0), 0);
  // The simulated controller reports duration_ms: 0 on every run. Summing
  // those and printing "0s · 12 runs" would read as "the pump ran for no time",
  // which is a different claim from "the controller did not say how long".
  const runtimeReported = timedRuns.length > 0;
  const chartWidth = Math.max(200, width - layout.gutter * 2 - space.lg * 2 - 2);

  return (
    <Screen
      testID="screen-history"
      title={t('history.title')}
      subtitle={t('history.subtitle')}
      onRefresh={refresh}
      refreshing={telemetry.refreshing || events.refreshing}
    >
      {deviceId === null ? (
        <EmptyState title={t('device.none')} body={t('device.noneBody')} />
      ) : (
        <>
          {/* ------------------------------------------------ moisture chart */}
          <Stack gap={0}>
            <SectionHeader
              title={t('history.moistureTrend')}
              trailing={
                samples.length === 0 ? null : (
                  <Text variant="micro" color="dim" numeric>
                    {t('history.samples', { n: samples.length })}
                  </Text>
                )
              }
            />
            {telemetry.status === 'loading' ? (
              <LoadingState />
            ) : telemetry.status === 'error' ? (
              <ErrorState error={telemetry.error} onRetry={() => void telemetry.reload()} />
            ) : samples.length === 0 ? (
              <EmptyState title={t('history.empty')} body={t('history.emptyBody')} />
            ) : (
              <FadeIn>
                <Card>
                  <Stack gap={space.sm}>
                    <MoistureChart samples={samples} width={chartWidth} />
                    <Row justify="space-between" fixed>
                      <Text variant="micro" color="dim" numeric>
                        {relativeTime(samples[0]?.receivedAt ?? null, t)}
                      </Text>
                      <Text variant="micro" color="dim" numeric>
                        {relativeTime(samples[samples.length - 1]?.receivedAt ?? null, t)}
                      </Text>
                    </Row>
                  </Stack>
                </Card>
              </FadeIn>
            )}
          </Stack>

          {/* ------------------------------------------------------- runtime */}
          {runs.length === 0 ? null : (
            <FadeIn delay={60}>
              <Stack gap={0}>
                <SectionHeader title={t('history.runtime')} />
                <Card>
                  <Stack gap={space.sm}>
                    {runtimeReported ? (
                      <>
                        <Row align="baseline" gap={space.sm}>
                          <Text variant="display" numeric mono>
                            {duration(totalRuntimeMs, t)}
                          </Text>
                          <Text variant="body" color="dim" numeric>
                            {t('history.runs', { n: timedRuns.length })}
                          </Text>
                        </Row>
                        <Text variant="body" color="dim">
                          {t('history.runtimeBody')}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Badge label={t('history.runtimeMissing')} />
                        <Text variant="body" color="ink2">
                          {t('history.runtimeMissingBody', { n: runs.length })}
                        </Text>
                      </>
                    )}
                  </Stack>
                </Card>
              </Stack>
            </FadeIn>
          )}

          {/* -------------------------------------------------------- events */}
          <Stack gap={0}>
            <SectionHeader title={t('history.events')} />
            {events.status === 'loading' ? (
              <LoadingState />
            ) : events.status === 'error' ? (
              <ErrorState error={events.error} onRetry={() => void events.reload()} />
            ) : (
              <ActivityTimeline events={eventList} emptyLabel={t('home.noEvents')} />
            )}
          </Stack>

          {/* --------------------------------------------- what is not here */}
          <FadeIn delay={120}>
            <Card>
              <Stack gap={space.sm}>
                <Badge label={t('history.notMeasured')} />
                <Text variant="body" color="ink2">
                  {t('history.noFlowSensor')}
                </Text>
              </Stack>
            </Card>
          </FadeIn>
        </>
      )}
    </Screen>
  );
}
