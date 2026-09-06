/**
 * HYDRAX Mobile — a zone, reduced to a glance.
 *
 * Used on Home's zone snapshot strip, where the point is "how many zones,
 * roughly how are they doing" rather than the full breakdown `ZoneCard`
 * gives on the Zones tab. Tapping still opens the same zone detail sheet.
 */

import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import type { ZoneSnapshot } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { colors, radius, space, tone as tonePalette } from '../theme/tokens';
import { moistureStatus, percent } from '../utils/format';
import { Stack } from './layout';
import { ToneDot } from './status';
import { Text } from './Text';

export function ZoneChip({ zone }: { readonly zone: ZoneSnapshot }): React.JSX.Element {
  const { t } = useI18n();
  const router = useRouter();
  const status = moistureStatus(zone.average, zone.band);
  const tone = status?.tone ?? 'idle';
  const palette = tonePalette[tone];

  return (
    <Pressable
      onPress={() => router.push(`/zone/${zone.zone}`)}
      accessibilityRole="button"
      accessibilityLabel={`${t('common.zone', { n: zone.zone })}, ${percent(zone.average)}`}
      style={({ pressed }) => ({
        opacity: pressed ? 0.75 : 1,
        width: 108,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: zone.irrigating ? colors.water : colors.border,
        backgroundColor: colors.surface,
        paddingVertical: space.md,
        paddingHorizontal: space.md,
      })}
    >
      <Stack gap={space.xs}>
        <Text variant="micro" color="dim" numeric>
          {t('common.zoneShort', { n: String(zone.zone).padStart(2, '0') })}
        </Text>
        <Text variant="display" numeric mono tint={palette.fg} style={{ fontSize: 24 }}>
          {percent(zone.average)}
        </Text>
        <Stack gap={2} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 4 }}>
          <ToneDot tone={zone.irrigating ? 'water' : tone} size={6} />
          <Text variant="micro" color="dim">
            {zone.irrigating ? t('zones.irrigating') : status === null ? t('moisture.noBand') : t(status.labelKey)}
          </Text>
        </Stack>
      </Stack>
    </Pressable>
  );
}
