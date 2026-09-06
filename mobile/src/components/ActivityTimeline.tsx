/**
 * HYDRAX Mobile — recent controller events, as a timeline.
 *
 * A thin wrapper around `EventRow` so Home's "recent activity" and History's
 * full event log share one look. All data comes from `GET
 * /api/v1/devices/:id/events` (or the shared snapshot's own tail of it) —
 * nothing here is synthesized.
 */

import type { EventSnapshot } from '../api/types';
import { useI18n } from '../i18n/I18nProvider';
import { space } from '../theme/tokens';
import { EventRow } from './AlertCard';
import { Card } from './Card';
import { Text } from './Text';

export function ActivityTimeline({
  events,
  emptyLabel,
}: {
  readonly events: readonly EventSnapshot[];
  readonly emptyLabel?: string;
}): React.JSX.Element {
  const { t } = useI18n();

  return (
    <Card padded={false} style={{ paddingHorizontal: space.lg }}>
      {events.length === 0 ? (
        <Text variant="body" color="dim" style={{ paddingVertical: space.xl }} center>
          {emptyLabel ?? t('home.noEvents')}
        </Text>
      ) : (
        events.map((event, index) => (
          <EventRow key={event.id} event={event} last={index === events.length - 1} />
        ))
      )}
    </Card>
  );
}
