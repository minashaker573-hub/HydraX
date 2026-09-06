/**
 * HYDRAX Mobile — where these numbers came from.
 *
 * Phase 1 has no physical prototype. The only controller reporting to the
 * backend is `tools/mock-device.ts`, and every sample it sends is flagged
 * `simulated: true`. This banner is how the app refuses to let a synthetic
 * reading be mistaken for a field reading — it is shown on every screen that
 * displays telemetry, not hidden behind a settings toggle.
 *
 * The day a real ESP32 posts to the same endpoint, the flag flips to false and
 * this banner turns into the quieter FIELD HARDWARE label. No code changes.
 */

import { View } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { radius, space, tone as tonePalette } from '../theme/tokens';
import { Row } from './layout';
import { Text } from './Text';

export function ProvenanceBanner({
  simulated,
  detailed = false,
}: {
  simulated: boolean;
  /** Include the explanatory sentence. Off in the compact header slot. */
  detailed?: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const palette = simulated ? tonePalette.warn : tonePalette.ok;

  return (
    <View
      accessible
      style={{
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: `${palette.fg}33`,
        backgroundColor: palette.bg,
        paddingHorizontal: space.md,
        paddingVertical: space.sm + 2,
        rowGap: 4,
      }}
    >
      <Row gap={space.sm}>
        <Text variant="micro" tint={palette.fg}>
          {simulated ? t('source.simulation') : t('source.field')}
        </Text>
      </Row>
      {detailed ? (
        <Text variant="body" color="ink2">
          {simulated ? t('source.simulationBody') : t('source.monitorOnly')}
        </Text>
      ) : null}
    </View>
  );
}
