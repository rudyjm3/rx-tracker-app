// Ported from rx-tracker-web's lib/schedule.ts — pure data logic with no
// React/Next dependency, so it's copied verbatim (minus the ad-hoc PRN
// helper, not needed yet) rather than reinvented, to keep the two apps'
// notion of "today's doses" identical.
import type {
  DoseLog,
  DoseLogStatus,
  DosePostpone,
  Medication,
  MedicationGroup,
  MedicationGroupMember,
} from "@/lib/types/medications";
import { timeToMinutes } from "@/lib/utils";

interface ResolveQuantityPerDoseArgs {
  medication: Pick<Medication, "quantity_per_dose">;
  scheduleTimeQuantityOverride?: number | null;
  groupMemberQuantityOverride?: number | null;
}

export function resolveQuantityPerDose({
  medication,
  scheduleTimeQuantityOverride,
  groupMemberQuantityOverride,
}: ResolveQuantityPerDoseArgs): number {
  return (
    groupMemberQuantityOverride ?? scheduleTimeQuantityOverride ?? medication.quantity_per_dose
  );
}

export const SNOOZE_OPTIONS = [5, 10, 15, 30] as const;

export interface DaySlot {
  medicationId: string;
  medicationName: string;
  dose: string;
  scheduledTime: string; // "HH:MM"
  groupId: string | null;
  groupName: string | null;
  quantityPerDose: number;
  status: DoseLogStatus | "pending";
  takenAt: string | null;
  postponedUntil: string | null;
  isPrn: boolean;
  medication: Medication;
}

// `options.ignoreDashboardVisibility` skips the dashboard_enabled filter,
// for callers building the "required adherence" slot set — a medication a
// user hid from their daily view can still be opted into adherence
// tracking, and shouldn't disappear from that calculation entirely.
export function generateDaySlots(
  date: string,
  medications: Medication[],
  groups: MedicationGroup[],
  groupMembers: Pick<MedicationGroupMember, "group_id" | "medication_id" | "quantity_per_dose">[],
  doseLogs: DoseLog[],
  postpones: DosePostpone[],
  options?: { ignoreDashboardVisibility?: boolean },
): DaySlot[] {
  const groupsByMedication = new Map<
    string,
    { group: MedicationGroup; override: number | null }[]
  >();
  for (const member of groupMembers) {
    const group = groups.find((g) => g.id === member.group_id);
    if (group) {
      const existing = groupsByMedication.get(member.medication_id) ?? [];
      existing.push({ group, override: member.quantity_per_dose });
      groupsByMedication.set(member.medication_id, existing);
    }
  }
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  const logsByKey = new Map<string, DoseLog>();
  for (const log of doseLogs) {
    logsByKey.set(`${log.medication_id}|${log.scheduled_time.slice(0, 5)}`, log);
  }
  const postponeByKey = new Map<string, DosePostpone>();
  for (const p of postpones) {
    if (p.resolved_at) continue;
    postponeByKey.set(`${p.medication_id}|${p.scheduled_time.slice(0, 5)}`, p);
  }

  const slots: DaySlot[] = [];

  for (const med of medications) {
    if (!med.dashboard_enabled && !options?.ignoreDashboardVisibility) continue;
    if (med.start_date && date < med.start_date) continue;
    if (med.end_date && date > med.end_date) continue;

    const medGroups = groupsByMedication.get(med.id) ?? [];
    const times: {
      time: string;
      scheduleTimeOverride: number | null;
      groupId: string | null;
    }[] = [];

    if (med.as_needed) {
      for (const { group } of medGroups) {
        times.push({
          time: group.scheduled_time.slice(0, 5),
          scheduleTimeOverride: null,
          groupId: group.id,
        });
      }
    } else if (med.schedule_mode === "fixed_times") {
      for (const st of med.medication_schedule_times ?? []) {
        times.push({
          time: st.reminder_time.slice(0, 5),
          scheduleTimeOverride: st.quantity_per_dose,
          groupId: st.group_id ?? null,
        });
      }
    } else if (med.schedule_mode === "interval" && med.interval_hours && med.first_dose_time) {
      const stepMinutes = med.interval_hours * 60;
      // first_dose_time is the anchor of an ongoing cycle, not "today's
      // first dose" — e.g. an every-8h medication anchored at 20:00 still
      // has occurrences at 04:00 and 12:00 today. Start from the anchor's
      // phase within a 24h day (anchor mod step) rather than literally at
      // the anchor's own time-of-day, so every day replays the same full
      // cycle instead of only the tail from the anchor's clock time to
      // midnight.
      let minutes = timeToMinutes(med.first_dose_time.slice(0, 5)) % stepMinutes;
      while (minutes < 24 * 60) {
        const h = String(Math.floor(minutes / 60)).padStart(2, "0");
        const m = String(minutes % 60).padStart(2, "0");
        const time = `${h}:${m}`;
        const matchedGroup = medGroups.find(
          (g) => g.group.scheduled_time.slice(0, 5) === time,
        );
        times.push({
          time,
          scheduleTimeOverride: null,
          groupId: matchedGroup ? matchedGroup.group.id : null,
        });
        minutes += stepMinutes;
      }
    }

    for (const { time, scheduleTimeOverride, groupId } of times) {
      const group = groupId ? (groupsById.get(groupId) ?? null) : null;
      const membership = groupId ? medGroups.find((g) => g.group.id === groupId) : undefined;
      const quantityPerDose = resolveQuantityPerDose({
        medication: med,
        scheduleTimeQuantityOverride: scheduleTimeOverride,
        groupMemberQuantityOverride: membership ? membership.override : null,
      });

      const log = logsByKey.get(`${med.id}|${time}`);
      const postpone = postponeByKey.get(`${med.id}|${time}`);

      slots.push({
        medicationId: med.id,
        medicationName: med.name,
        dose: med.dose,
        scheduledTime: time,
        groupId: group ? group.id : null,
        groupName: group ? group.name : null,
        quantityPerDose,
        status: log?.status ?? "pending",
        takenAt: log?.taken_at ?? null,
        postponedUntil: postpone?.postponed_until ?? null,
        isPrn: med.as_needed,
        medication: med,
      });
    }
  }

  return slots.sort((a, b) => timeToMinutes(a.scheduledTime) - timeToMinutes(b.scheduledTime));
}

export function slotDueTime(slot: DaySlot, date: string): number {
  return slot.postponedUntil
    ? new Date(slot.postponedUntil).getTime()
    : new Date(`${date}T${slot.scheduledTime}`).getTime();
}

export interface NextDoseGroupEvent {
  kind: "group";
  time: number;
  groupId: string;
  groupName: string;
  members: DaySlot[];
}
export interface NextDoseSingleEvent {
  kind: "single";
  time: number;
  slot: DaySlot;
}
export type NextDoseEvent = NextDoseGroupEvent | NextDoseSingleEvent;

export function buildDoseEvents(slots: DaySlot[], date: string): NextDoseEvent[] {
  const sorted = [...slots].sort((a, b) => slotDueTime(a, date) - slotDueTime(b, date));
  const events: NextDoseEvent[] = [];
  const seenGroupKeys = new Set<string>();

  for (const slot of sorted) {
    const time = slotDueTime(slot, date);
    if (slot.groupId) {
      const key = `${slot.groupId}|${time}`;
      if (seenGroupKeys.has(key)) continue;
      seenGroupKeys.add(key);
      const members = sorted.filter(
        (s) => s.groupId === slot.groupId && slotDueTime(s, date) === time,
      );
      events.push({ kind: "group", time, groupId: slot.groupId, groupName: slot.groupName!, members });
    } else {
      events.push({ kind: "single", time, slot });
    }
  }

  return events;
}
