/**
 * HYDRAX Mobile — bottom tab bar (V2).
 *
 * Five destinations, always visible, which is the Android-native pattern for a
 * flat set of equally important sections. The alert tab carries a live count
 * badge taken from the shared snapshot, so a fault raised while the user is on
 * another screen is visible without opening anything.
 *
 * V2 gives the active tab a real visual anchor — an accent capsule behind the
 * icon — rather than a colour change alone, and draws its own label under the
 * icon (`tabBarShowLabel: false` + a custom `tabBarIcon`) so the active state
 * reads the same way at every text scale. Safe-area insets are read directly
 * so the bar clears a gesture-nav home indicator without guessing a constant.
 *
 * The tab bar does NOT mirror in Arabic. Android's own system navigation stays
 * in place under RTL, and a tab bar that swaps ends while the buttons beneath
 * it do not is more disorienting than a consistent one. Text inside each tab
 * is translated; the order is spatial furniture, not prose.
 */

import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../../src/components/Icons';
import { Text } from '../../src/components/Text';
import { useI18n } from '../../src/i18n/I18nProvider';
import type { StringKey } from '../../src/i18n/strings';
import { useSystem } from '../../src/state/SystemProvider';
import { colors, radius, space } from '../../src/theme/tokens';

const TABS: { name: string; icon: IconName; labelKey: StringKey }[] = [
  { name: 'index', icon: 'home', labelKey: 'nav.home' },
  { name: 'zones', icon: 'zones', labelKey: 'nav.zones' },
  { name: 'history', icon: 'history', labelKey: 'nav.history' },
  { name: 'alerts', icon: 'alerts', labelKey: 'nav.alerts' },
  { name: 'device', icon: 'device', labelKey: 'nav.device' },
];

const BAR_HEIGHT = 58;

export default function TabsLayout(): React.JSX.Element {
  const { t } = useI18n();
  const { device } = useSystem();
  const insets = useSafeAreaInsets();
  const activeAlerts = device?.alerts.filter((alert) => alert.active).length ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.dim,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: BAR_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.labelKey),
            tabBarAccessibilityLabel: t(tab.labelKey),
            tabBarIcon: ({ focused, color }) => (
              <TabIcon
                icon={tab.icon}
                label={t(tab.labelKey)}
                focused={focused}
                color={String(color)}
              />
            ),
            ...(tab.name === 'alerts' && activeAlerts > 0
              ? { tabBarBadge: activeAlerts, tabBarBadgeStyle: { backgroundColor: colors.crit } }
              : null),
          }}
        />
      ))}
    </Tabs>
  );
}

function TabIcon({
  icon,
  label,
  focused,
  color,
}: {
  icon: IconName;
  label: string;
  focused: boolean;
  color: string;
}): React.JSX.Element {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 64, rowGap: 3 }}>
      <View
        style={{
          width: 40,
          height: 26,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? colors.accentSoft : 'transparent',
        }}
      >
        <Icon name={icon} color={color} size={20} />
      </View>
      <Text
        variant="micro"
        tint={color}
        numeric
        style={{ letterSpacing: 0, fontSize: 10, paddingHorizontal: space.xs }}
      >
        {label}
      </Text>
    </View>
  );
}
