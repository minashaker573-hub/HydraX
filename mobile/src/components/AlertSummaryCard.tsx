/**
 * HYDRAX Mobile — the one-line answer to "is anything wrong?".
 *
 * ALL CLEAR is a real, deliberate state — not the absence of a card. It gets
 * the same visual weight as an active alert so a calm farm reads as calm,
 * not as a screen that forgot to load.
 */

import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { AlertSnapshot } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { colors, radius, space, tone as tonePalette } from '../theme/tokens';
import { Icon } from './Icons';
import { Row, Stack } from './layout';
import { Text } from './Text';

export function AlertSummaryCard({
  alerts,
}: {
  readonly alerts: readonly AlertSnapshot[];
}): React.JSX.Element {
  const { t } = useI18n();
  const router = useRouter();
  const active = alerts.filter((alert) => alert.active);
  const hasCritical = active.some((alert) => alert.severity === 'critical');
  const tone = active.length === 0 ? 'ok' : hasCritical ? 'crit' : 'warn';
  const palette = tonePalette[tone];

  return (
    <Pressable
      onPress={() => router.push('/alerts')}
      accessibilityRole="button"
      accessibilityLabel={
        active.length === 0 ? t('alerts.none') : t('home.activeAlertsCount', { n: active.length })
      }
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: `${palette.fg}40`,
        backgroundColor: palette.bg,
        padding: space.lg,
      })}
    >
      <Row gap={space.md} align="center">
        <View
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
          }}
        >
          <Icon name="alerts" size={18} color={palette.fg} />
        </View>
        <Stack gap={1} flex={1}>
          <Text variant="bodyStrong" tint={palette.fg}>
            {active.length === 0 ? t('alerts.none') : t('home.activeAlertsCount', { n: active.length })}
          </Text>
          <Text variant="micro" color="dim">
            {active.length === 0 ? t('home.allClearBody') : t('home.reviewAlerts')}
          </Text>
        </Stack>
        <Icon name="chevron" size={16} color={colors.dim} />
      </Row>
    </Pressable>
  );
}
