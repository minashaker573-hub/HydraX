/**
 * HYDRAX Mobile — loading, empty, error and stale.
 *
 * These are first-class screens, not afterthoughts. Between them they cover
 * every state the app can be in, and each says three things: what is true,
 * why, and — where there is one — what the user can do about it. None of them
 * ever shows the backend's own error text.
 *
 * The stale banner also carries the sentence that matters most when a phone
 * loses signal: the controller keeps irrigating on its own. The app going dark
 * is a monitoring outage, not a farm outage.
 */

import { ActivityIndicator, Pressable, View } from 'react-native';

import { API_BASE_URL } from '../api/config';
import { errorMessageKey } from '../api/errors';
import { useI18n } from '../i18n/I18nProvider';
import { colors, radius, space, tone as tonePalette } from '../theme/tokens';
import { relativeTime } from '../utils/format';
import { Card } from './Card';
import { Row, Stack } from './layout';
import { Text } from './Text';

export function LoadingState({ label }: { label?: string }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <Card>
      <Stack gap={space.md} style={{ alignItems: 'center', paddingVertical: space.xl }}>
        <ActivityIndicator color={colors.accent} accessibilityLabel={t('common.loading')} />
        <Text variant="body" color="dim" center>
          {label ?? t('common.loading')}
        </Text>
      </Stack>
    </Card>
  );
}

export function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body?: string;
  icon?: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card>
      <Stack gap={space.sm} style={{ alignItems: 'center', paddingVertical: space.xl }}>
        {icon}
        <Text variant="title" center>
          {title}
        </Text>
        {body === undefined ? null : (
          <Text variant="body" color="dim" center style={{ maxWidth: 320 }}>
            {body}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <Card accentEdge={colors.crit}>
      <Stack gap={space.md}>
        <Text variant="title">{t('error.title')}</Text>
        <Text variant="body" color="ink2">
          {t(errorMessageKey(error))}
        </Text>
        <Text variant="micro" color="dim" numeric mono>
          {t('error.serverUrl', { url: API_BASE_URL })}
        </Text>
        <Text variant="body" color="dim">
          {t('source.monitorOnly')}
        </Text>
        {onRetry === undefined ? null : (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              borderRadius: radius.sm,
              backgroundColor: pressed ? colors.surface3 : colors.surface2,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              minHeight: 44,
              justifyContent: 'center',
            })}
          >
            <Text variant="label">{t('common.retry')}</Text>
          </Pressable>
        )}
      </Stack>
    </Card>
  );
}

/**
 * Shown above the content whenever what is on screen is not live: a failed
 * poll, or data restored from the phone's cache on a cold start.
 */
export function StaleBanner({
  lastUpdatedAt,
}: {
  lastUpdatedAt: number | null;
}): React.JSX.Element {
  const { t } = useI18n();
  const when =
    lastUpdatedAt === null
      ? t('common.unknown')
      : relativeTime(new Date(lastUpdatedAt).toISOString(), t);

  return (
    <View
      accessible
      accessibilityRole="alert"
      style={{
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: `${tonePalette.warn.fg}33`,
        backgroundColor: tonePalette.warn.bg,
        paddingHorizontal: space.md,
        paddingVertical: space.sm + 2,
        rowGap: 2,
      }}
    >
      <Row gap={space.sm}>
        <Text variant="micro" tint={tonePalette.warn.fg}>
          {t('error.offlineBadge')}
        </Text>
        <Text variant="micro" color="dim" numeric>
          {t('common.lastUpdated', { when })}
        </Text>
      </Row>
      <Text variant="body" color="ink2">
        {t('error.stale')}
      </Text>
    </View>
  );
}
