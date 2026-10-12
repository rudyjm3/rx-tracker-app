import { Badge } from '@/components/ui/badge';
import type { DaySlot } from '@/lib/schedule';
import { formatClockTime, formatLate, minutesLate } from '@/lib/utils';

import { badgeVariantFor } from './schedule-status';

// Status badge for a resolved slot: "Taken (12 min late)", "Snoozed until
// 8:15 AM", Missed / Skipped / Taken. Returns null for a plain pending slot.
export function SlotStatusBadge({ slot, date, graceMinutes }: { slot: DaySlot; date: string; graceMinutes: number }) {
  const variant = badgeVariantFor(slot, date, graceMinutes);
  if (!variant) return null;
  if (variant === 'snoozed' && slot.postponedUntil) {
    return <Badge variant="snoozed">{`Snoozed until ${formatClockTime(slot.postponedUntil)}`}</Badge>;
  }
  if (variant === 'late') {
    const late = minutesLate(
      { status: slot.status, taken_at: slot.takenAt, scheduled_for_date: date, scheduled_time: slot.scheduledTime },
      graceMinutes,
    );
    if (late != null) return <Badge variant="late">{`Taken (${formatLate(late)})`}</Badge>;
  }
  return <Badge variant={variant} />;
}
