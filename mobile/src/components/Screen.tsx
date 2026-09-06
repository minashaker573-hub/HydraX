/**
 * HYDRAX Mobile — the frame every tab renders inside.
 *
 * Owns the things that must be identical on all five screens: safe-area
 * insets, the scroll container, pull-to-refresh, the page title block, and the
 * bottom clearance that keeps the last card off the tab bar.
 *
 * Screens supply content, not chrome.
 */

import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../i18n/I18nProvider';
import { colors, layout, space } from '../theme/tokens';
import { Row, Stack } from './layout';
import { Text } from './Text';

export interface ScreenProps {
  readonly title: string;
  readonly subtitle?: string;
  /** Rendered at the end of the title row — status chips, language toggle. */
  readonly trailing?: React.ReactNode;
  /** Rendered under the title, outside the scroll padding — banners. */
  readonly banner?: React.ReactNode;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
  readonly children: React.ReactNode;
  readonly testID?: string;
}

export function Screen({
  title,
  subtitle,
  trailing,
  banner,
  onRefresh,
  refreshing = false,
  children,
  testID,
}: ScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { isRTL } = useI18n();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID={testID}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + space.lg,
          paddingBottom: insets.bottom + layout.tabBarClearance + space.xxl,
          paddingHorizontal: layout.gutter,
          rowGap: space.lg,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh === undefined ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.surface}
            />
          )
        }
      >
        <Stack gap={space.xs}>
          <Row justify="space-between" align="flex-start" gap={space.md}>
            <View style={{ flexShrink: 1 }}>
              <Text
                variant="display"
                accessibilityRole="header"
                style={{ writingDirection: isRTL ? 'rtl' : 'ltr' }}
              >
                {title}
              </Text>
              {subtitle === undefined ? null : (
                <Text variant="body" color="dim">
                  {subtitle}
                </Text>
              )}
            </View>
            {trailing}
          </Row>
          {banner}
        </Stack>

        {children}
      </ScrollView>
    </View>
  );
}
