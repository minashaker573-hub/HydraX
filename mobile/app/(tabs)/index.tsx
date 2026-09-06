/**
 * HYDRAX Mobile — Home (V2).
 *
 * The one screen that answers, in under two seconds:
 *   1. Is the system online?
 *   2. What is the soil condition?
 *   3. Is irrigation running?
 *   4. Are there alerts?
 *   5. How many zones, and how are they doing?
 *   6. What happened recently?
 *
 * V2 deliberately removes the vertical SENSE→UNDERSTAND→DECIDE→ACT→MONITOR
 * rail that used to dominate this screen. It was accurate but it read as
 * engineering instrumentation on the one screen that most needs to be
 * readable at a glance; the same pipeline now lives on the Device screen,
 * where a diagnostic reading is exactly what's expected. Nothing it showed
 * is gone — see app/(tabs)/device.tsx.
 *
 * Every value here comes from GET /api/v1/dashboard. Nothing on this screen
 * is derived from anything the backend does not report — no water saved, no
 * efficiency score, no forecast.
 */

import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { AlertSummaryCard } from '../../src/components/AlertSummaryCard';
import { Card, SectionHeader } from '../../src/components/Card';
import { ActivityTimeline } from '../../src/components/ActivityTimeline';
import { FadeIn } from '../../src/components/FadeIn';
import { IrrigationStatusCard } from '../../src/components/IrrigationStatusCard';
import { LanguageToggle } from '../../src/components/LanguageToggle';
import { MoistureOverview } from '../../src/components/MoistureOverview';
import { Stack } from '../../src/components/layout';
import { Screen } from '../../src/components/Screen';
import { EmptyState, ErrorState, LoadingState, StaleBanner } from '../../src/components/states';
import { SystemStatusBar } from '../../src/components/SystemStatusBar';
import { Text } from '../../src/components/Text';
import { ZoneChip } from '../../src/components/ZoneChip';
import { useI18n } from '../../src/i18n/I18nProvider';
import { useSystem } from '../../src/state/SystemProvider';
import { space } from '../../src/theme/tokens';
import { greetingKey, overallMoisture } from '../../src/utils/format';
import { staggerDelay } from '../../src/utils/motion';

const RECENT_EVENT_COUNT = 6;

export default function HomeScreen(): React.JSX.Element {
  const { t } = useI18n();
  const router = useRouter();
  const { status, device, error, refresh, refreshing, lastUpdatedAt } = useSystem();

  const stale = status === 'stale';
  const zones = device?.zones ?? [];
  const farmMoisture = overallMoisture(zones);
  const events = device?.events.slice(0, RECENT_EVENT_COUNT) ?? [];

  return (
    <Screen
      testID="screen-home"
      title={t('common.appName')}
      subtitle={t(greetingKey(new Date().getHours()))}
      trailing={<LanguageToggle />}
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      banner={stale ? <StaleBanner lastUpdatedAt={lastUpdatedAt} /> : undefined}
    >
      {status === 'loading' ? <LoadingState /> : null}
      {status === 'error' ? <ErrorState error={error} onRetry={() => void refresh()} /> : null}

      {device === null ? (
        status === 'loading' || status === 'error' ? null : (
          <EmptyState title={t('device.none')} body={t('device.noneBody')} />
        )
      ) : (
        <>
          {/* --------------------------------------------------- system status */}
          <FadeIn>
            <SystemStatusBar online={device.online} simulated={device.simulated} />
          </FadeIn>

          {/* ------------------------------------------- primary soil overview */}
          <FadeIn delay={staggerDelay(1)}>
            <Stack gap={0}>
              <SectionHeader title={t('home.soilOverview')} />
              <Card>
                <MoistureOverview average={farmMoisture} zones={zones} />
              </Card>
            </Stack>
          </FadeIn>

          {/* ---------------------------------------------- irrigation status */}
          <FadeIn delay={staggerDelay(2)}>
            <Stack gap={0}>
              <SectionHeader title={t('home.irrigationStatus')} />
              <Card>
                <IrrigationStatusCard device={device} />
              </Card>
            </Stack>
          </FadeIn>

          {/* -------------------------------------------------- zone snapshot */}
          <FadeIn delay={staggerDelay(3)}>
            <Stack gap={0}>
              <SectionHeader
                title={t('home.zoneSnapshot')}
                trailing={
                  zones.length === 0 ? null : (
                    <Text
                      variant="micro"
                      color="accent"
                      onPress={() => router.push('/zones')}
                      accessibilityRole="link"
                    >
                      {t('common.seeAll')}
                    </Text>
                  )
                }
              />
              {zones.length === 0 ? (
                <EmptyState title={t('zones.none')} body={t('zones.noneBody')} />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ columnGap: space.sm }}
                >
                  {zones.map((zone) => (
                    <ZoneChip key={zone.zone} zone={zone} />
                  ))}
                </ScrollView>
              )}
            </Stack>
          </FadeIn>

          {/* ------------------------------------------------------- alerts */}
          <FadeIn delay={staggerDelay(4)}>
            <AlertSummaryCard alerts={device.alerts} />
          </FadeIn>

          {/* ------------------------------------------------ recent activity */}
          <FadeIn delay={staggerDelay(5)}>
            <Stack gap={0}>
              <SectionHeader
                title={t('home.recentActivity')}
                trailing={
                  events.length === 0 ? null : (
                    <Text
                      variant="micro"
                      color="accent"
                      onPress={() => router.push('/history')}
                      accessibilityRole="link"
                    >
                      {t('common.seeAll')}
                    </Text>
                  )
                }
              />
              <ActivityTimeline events={events} />
            </Stack>
          </FadeIn>

          <View>
            <Text variant="micro" color="dim" style={{ letterSpacing: 0, lineHeight: 16 }}>
              {t('source.monitorOnly')}
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}
