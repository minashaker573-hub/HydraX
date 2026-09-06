/**
 * HYDRAX Mobile — unknown route.
 *
 * Reachable only from a bad deep link (the app's scheme is `hydrax://`). It
 * exists so a mistyped link lands somewhere that still looks like HYDRAX and
 * offers a way back, rather than on a red error screen.
 */

import { Link } from 'expo-router';
import { View } from 'react-native';

import { Stack } from '../src/components/layout';
import { Text } from '../src/components/Text';
import { useI18n } from '../src/i18n/I18nProvider';
import { colors, layout, space } from '../src/theme/tokens';

export default function NotFoundScreen(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: layout.gutter,
      }}
    >
      <Stack gap={space.md} style={{ alignItems: 'center' }}>
        <Text variant="title" center>
          {t('device.notFoundTitle')}
        </Text>
        <Text variant="body" color="dim" center>
          {t('device.notFoundBody')}
        </Text>
        <Link href="/" accessibilityRole="link">
          <Text variant="label" color="accent">
            {t('nav.home')}
          </Text>
        </Link>
      </Stack>
    </View>
  );
}
