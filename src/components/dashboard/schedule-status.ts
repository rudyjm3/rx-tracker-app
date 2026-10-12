import type { BadgeVariant } from '@/components/ui/badge';
import type { DaySlot } from '@/lib/schedule';
import { isLate } from '@/lib/utils';

// Which status badge a schedule row shows (DESIGN.md 12): pending slots show
// actions (or "snoozed" while a snooze is running), the rest map one to one.
// Same logic as rx-tracker-web's badgeVariantFor, shared by DoseRow and
// GroupDoseCard's member rows.
export function badgeVariantFor(slot: DaySlot, date: string, graceMinutes: number): BadgeVariant | null {
  if (slot.status === 'pending') {
    if (slot.postponedUntil && new Date(slot.postponedUntil).getTime() > Date.now()) return 'snoozed';
    return null;
  }
  if (slot.status === 'missed') return 'missed';
  if (slot.status === 'skipped') return 'skipped';
  const late = isLate(
    { status: slot.status, taken_at: slot.takenAt, scheduled_for_date: date, scheduled_time: slot.scheduledTime },
    graceMinutes,
  );
  return late ? 'late' : 'taken';
}
