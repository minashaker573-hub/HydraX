/**
 * HYDRAX Mobile — Alerts.
 *
 * Real alerts from GET /api/v1/alerts, carrying the backend's own ids so an
 * alert keeps its identity across refreshes and a genuinely new one is
 * distinguishable from a re-render of an old one.
 *
 * The empty state is honest: when the simulated controller is behaving, there
 * are no alerts, and the screen says so rather than manufacturing a plausible
 * warning to make the UI look busy.
 *
 * Alerts cannot be resolved from here. Resolution is an operator action gated
 * behind X-Admin-Key on the backend, and this app holds no operator key by
 * design — see the note at the foot of the screen and docs/MOBILE.md.
 */

import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AlertCard } from '../../src/components/AlertCard';
import { Card } from '../../src/components/Card';
import { FadeIn } from '../../src/components/FadeIn';
import { Icon } from '../../src/components/Icons';
import { Row, Stack } from '../../src/components/layout';
import { Screen } from '../../src/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '../../src/components/states';
import { Text } from '../../src/components/Text';
import { fetchAlerts } from '../../src/api/services';
import type { AlertSnapshot } from '../../src/api/types';
import { useI18n } from '../../src/i18n/I18nProvider';
import { useAsyncResource } from '../../src/state/useAsyncResource';
import { colors, radius, space, tone as tonePalette } from '../../src/theme/tokens';
import { staggerDelay } from '../../src/utils/motion';

type Filter = 'active' | 'all';

export default function AlertsScreen(): React.JSX.Element {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('active');

  // `active=false` on the backend means "include resolved", so the history
  // view asks for everything and the active view asks for open alerts only.
  const load = useCallback(
    (signal: AbortSignal) => fetchAlerts(filter === 'active', 100, { signal }),
    [filter],
  );
  const alerts = useAsyncResource<AlertSnapshot[]>(load);

  const list = alerts.data ?? [];

  return (
    <Screen
      testID="screen-alerts"
      title={t('alerts.title')}
      subtitle={t('alerts.subtitle')}
      onRefresh={() => void alerts.reload()}
      refreshing={alerts.refreshing}
      trailing={
        <Row gap={space.xs} style={{ backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: colors.border }}>
          <FilterTab
            label={t('alerts.filterActive')}
            selected={filter === 'active'}
            onPress={() => setFilter('active')}
          />
          <FilterTab
            label={t('alerts.filterAll')}
            selected={filter === 'all'}
            onPress={() => setFilter('all')}
          />
        </Row>
      }
    >
      {alerts.status === 'loading' ? <LoadingState /> : null}
      {alerts.status === 'error' ? (
        <ErrorState error={alerts.error} onRetry={() => void alerts.reload()} />
      ) : null}

      {alerts.status === 'success' && list.length === 0 ? (
        filter === 'active' ? (
          <AllClearHero title={t('alerts.none')} body={t('alerts.noneBody')} />
        ) : (
          <EmptyState title={t('alerts.noneAtAll')} />
        )
      ) : null}

      {list.map((alert, index) => (
        <FadeIn key={alert.id} delay={staggerDelay(index)}>
          <AlertCard alert={alert} />
        </FadeIn>
      ))}

      {list.length === 0 ? null : (
        <Card>
          <Text variant="body" color="dim">
            {t('alerts.resolveNote')}
          </Text>
        </Card>
      )}
    </Screen>
  );
}

/**
 * A calm farm gets a state as visually deliberate as a fault does — an "ALL
 * CLEAR" reads as confirmation, not as a screen that failed to load anything.
 */
function AllClearHero({ title, body }: { title: string; body: string }): React.JSX.Element {
  const palette = tonePalette.ok;
  return (
    <Card>
      <Stack gap={space.md} style={{ alignItems: 'center', paddingVertical: space.xl }}>
        <View
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.bg,
          }}
        >
          <Icon name="alerts" size={26} color={palette.fg} />
        </View>
        <Text variant="title" tint={palette.fg}>
          {title}
        </Text>
        <Text variant="body" color="ink2" center style={{ maxWidth: 300 }}>
          {body}
        </Text>
      </Stack>
    </Card>
  );
}

function FilterTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={6}
      style={{
        minHeight: 32,
        paddingHorizontal: space.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.surface3 : 'transparent',
      }}
    >
      <Stack gap={0}>
        <Text variant="label" color={selected ? 'ink' : 'dim'}>
          {label}
        </Text>
      </Stack>
    </Pressable>
  );
}
