/**
 * HYDRAX Mobile — the system status strip.
 *
 * Answers "is my farm online, and is this real hardware?" in one glance,
 * combining what used to be two separate cards (an ONLINE/OFFLINE headline
 * card and a standalone provenance banner) into a single compact instrument
 * strip. This is the first thing Home shows, deliberately small — the brief
 * is a 2-second read, not a dashboard hero.
 */

import { View } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { colors, radius, space, tone as tonePalette } from '../theme/tokens';
import { Row } from './layout';
import { StatusPill } from './status';
import { Text } from './Text';

export function SystemStatusBar({
  online,
  simulated,
}: {
  readonly online: boolean;
  readonly simulated: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const provenancePalette = simulated ? tonePalette.warn : tonePalette.ok;

  return (
    <View
      style={{
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
      }}
    >
      <Row justify="space-between" align="center" wrap gap={space.sm}>
        <Row gap={space.sm}>
          <StatusPill
            tone={online ? 'ok' : 'warn'}
            label={online ? t('home.online') : t('home.offline')}
            emphasis="solid"
          />
        </Row>
        <Row gap={space.xs + 2}>
          <View
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: radius.pill,
              backgroundColor: provenancePalette.fg,
            }}
          />
          <Text variant="micro" tint={provenancePalette.fg}>
            {simulated ? t('source.simulation') : t('source.field')}
          </Text>
        </Row>
      </Row>
    </View>
  );
}
