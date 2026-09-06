/**
 * HYDRAX Mobile — one irrigation zone.
 *
 * Shows only fields the backend actually returns for a zone. The threshold row
 * is the interesting case: `GET /api/v1/dashboard` returns `config: null` when
 * the backend holds no advisory band, and the card then says NO BAND SET
 * rather than inventing a plausible 35%. It also never says "normal" on the
 * strength of a band that does not exist — see `moistureStatus`.
 */

import { useRouter } from 'expo-router';

import type { ZoneSnapshot } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { colors, space, tone as tonePalette } from '../theme/tokens';
import { moistureStatus, percent } from '../utils/format';
import { PressableCard } from './Card';
import { Row, Stack } from './layout';
import { MoistureBar } from './MoistureBar';
import { StatusPill } from './status';
import { Text } from './Text';

export interface ZoneCardProps {
  readonly zone: ZoneSnapshot;
  /** Whether the controller reports this zone as the one being watered. */
  readonly compact?: boolean;
}

export function ZoneCard({ zone, compact = false }: ZoneCardProps): React.JSX.Element {
  const { t } = useI18n();
  const router = useRouter();

  const status = moistureStatus(zone.average, zone.band);
  const statusTone = status?.tone ?? 'idle';
  // The edge marker prioritises "watering right now" over the moisture
  // verdict — irrigating is the more actionable fact — and falls back to the
  // moisture tone only when it means something (dry/wet, not "no band set").
  const edge = zone.irrigating
    ? colors.water
    : statusTone === 'idle'
      ? undefined
      : tonePalette[statusTone].fg;

  return (
    <PressableCard
      onPress={() => router.push(`/zone/${zone.zone}`)}
      accessibilityLabel={`${t('common.zone', { n: zone.zone })}, ${percent(zone.average)}`}
      accessibilityHint={t('common.viewDetails')}
      {...(edge === undefined ? null : { accentEdge: edge })}
    >
      <Stack gap={space.md}>
        <Row justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Text variant="micro" color="dim">
              {t('common.zoneShort', { n: String(zone.zone).padStart(2, '0') })}
            </Text>
            <Row gap={space.sm} align="baseline">
              <Text variant="display" numeric mono tint={tonePalette[statusTone].fg}>
                {percent(zone.average)}
              </Text>
            </Row>
          </Stack>

          <Stack gap={space.sm} style={{ alignItems: 'flex-end' }}>
            {status === null ? null : <StatusPill tone={statusTone} label={t(status.labelKey)} />}
            <StatusPill
              tone={zone.irrigating ? 'water' : 'idle'}
              label={zone.irrigating ? t('zones.irrigating') : t('zones.idle')}
              emphasis="plain"
            />
          </Stack>
        </Row>

        <MoistureBar
          value={zone.average}
          tone={statusTone === 'idle' ? 'accent' : statusTone}
          marker={zone.band?.startPercent ?? null}
        />

        {compact ? null : (
          <Row justify="space-between" wrap gap={space.lg}>
            <Field
              label={t('zones.threshold')}
              value={
                zone.band === null
                  ? t('zones.thresholdMissing')
                  : `${percent(zone.band.startPercent)} / ${percent(zone.band.stopPercent)}`
              }
              dimmed={zone.band === null}
            />
            <Field
              label={t('zones.valve')}
              value={zone.valveOpen ? t('zones.open') : t('zones.closed')}
              tint={zone.valveOpen ? colors.water : undefined}
            />
            <Field
              label={t('zone.coverage')}
              value={`${zone.validSensors}/2`}
              tint={zone.validSensors === 2 ? undefined : colors.warn}
            />
          </Row>
        )}
      </Stack>
    </PressableCard>
  );
}

function Field({
  label,
  value,
  tint,
  dimmed = false,
}: {
  label: string;
  value: string;
  tint?: string;
  dimmed?: boolean;
}): React.JSX.Element {
  return (
    <Stack gap={2}>
      <Text variant="micro" color="dim">
        {label}
      </Text>
      <Text
        variant="bodyStrong"
        numeric
        mono
        {...(tint === undefined ? null : { tint })}
        color={dimmed ? 'dim' : 'ink'}
      >
        {value}
      </Text>
    </Stack>
  );
}
