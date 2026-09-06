/**
 * HYDRAX Mobile — Zones.
 *
 * Every zone the controller reports, in full: moisture, the backend's advisory
 * threshold band (or an explicit NO BAND SET), valve position and whether the
 * controller says this zone is being irrigated right now.
 *
 * There is no "water this zone" button, and its absence is deliberate rather
 * than unfinished. The backend exposes no command endpoint, the controller
 * owns irrigation decisions locally, and a remote button that quietly did
 * nothing — or worse, fought the controller's hysteresis — would be a lie in
 * the shape of a feature. The note at the foot of the screen says so.
 */

import { Card, SectionHeader } from '../../src/components/Card';
import { FadeIn } from '../../src/components/FadeIn';
import { ProvenanceBanner } from '../../src/components/ProvenanceBanner';
import { Screen } from '../../src/components/Screen';
import { Row, Stack } from '../../src/components/layout';
import { EmptyState, ErrorState, LoadingState, StaleBanner } from '../../src/components/states';
import { Text } from '../../src/components/Text';
import { ZoneCard } from '../../src/components/ZoneCard';
import { useI18n } from '../../src/i18n/I18nProvider';
import { useSystem } from '../../src/state/SystemProvider';
import { colors, space } from '../../src/theme/tokens';
import { staggerDelay } from '../../src/utils/motion';

export default function ZonesScreen(): React.JSX.Element {
  const { t } = useI18n();
  const { status, device, error, refresh, refreshing, lastUpdatedAt } = useSystem();
  const zones = device?.zones ?? [];
  const irrigatingCount = zones.filter((zone) => zone.irrigating).length;

  return (
    <Screen
      testID="screen-zones"
      title={t('zones.title')}
      subtitle={t('zones.subtitle')}
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      banner={status === 'stale' ? <StaleBanner lastUpdatedAt={lastUpdatedAt} /> : undefined}
    >
      {status === 'loading' ? <LoadingState /> : null}
      {status === 'error' ? <ErrorState error={error} onRetry={() => void refresh()} /> : null}

      {device === null ? null : <ProvenanceBanner simulated={device.simulated} />}

      {zones.length === 0 ? null : (
        <Row
          justify="space-between"
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: space.lg,
            paddingVertical: space.md,
          }}
        >
          <Stack gap={2}>
            <Text variant="micro" color="dim">
              {t('zones.configured')}
            </Text>
            <Text variant="title" numeric mono>
              {zones.length}
            </Text>
          </Stack>
          <Stack gap={2} style={{ alignItems: 'flex-end' }}>
            <Text variant="micro" color="dim">
              {t('zones.irrigatingNow')}
            </Text>
            <Text variant="title" numeric mono tint={irrigatingCount > 0 ? colors.water : colors.dim}>
              {irrigatingCount}
            </Text>
          </Stack>
        </Row>
      )}

      {device !== null && zones.length === 0 ? (
        <EmptyState title={t('zones.none')} body={t('zones.noneBody')} />
      ) : null}

      {zones.map((zone, index) => (
        <FadeIn key={zone.zone} delay={staggerDelay(index)}>
          <ZoneCard zone={zone} />
        </FadeIn>
      ))}

      {zones.length === 0 ? null : (
        <Stack gap={0}>
          <SectionHeader title={t('zones.thresholdSection')} />
          <Card>
            <Stack gap={space.sm}>
              <Text variant="body" color="ink2">
                {t('zones.thresholdAdvisory')}
              </Text>
              <Text variant="body" color="dim">
                {t('source.monitorOnly')}
              </Text>
            </Stack>
          </Card>
        </Stack>
      )}
    </Screen>
  );
}
