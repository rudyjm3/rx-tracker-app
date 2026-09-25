// Ported verbatim from rx-tracker-web's lib/adherence.ts — pure data
// logic with no React/Supabase dependency, same as schedule.ts.
import type { DoseLogStatus } from "@/lib/types/medications";

interface AdherenceLog {
  status: DoseLogStatus;
}

/**
 * pct = round(taken / (taken + missed + skipped) * 100), 0 if no logs.
 * There is no separate "late" bucket — a late-but-taken dose still
 * counts as taken (lateness is a UI/badge concern via isLate(), never
 * fed into this formula). Callers must pre-filter out as_needed
 * medications' logs before calling this.
 */
export function computeAdherence(logs: AdherenceLog[]): number {
  const taken = logs.filter((l) => l.status === "taken").length;
  const denom = logs.length;
  return denom === 0 ? 0 : Math.round((taken / denom) * 100);
}

export interface DoseTrackingStats {
  percent: number;
  taken: number;
  total: number;
  onTime: number;
  late: number;
  skipped: number;
  missed: number;
}

export interface AdherenceStats {
  percent: number;
  requiredTaken: number;
  requiredTotal: number;
  onTime: number;
  late: number;
  skipped: number;
  missed: number;
  // "Take as needed" medications that also have "include in adherence
  // tracking" checked: tracked on their own, never folded into the
  // required-dose numbers above.
  nonRequired: DoseTrackingStats;
}

interface TrackedSlot {
  status: DoseLogStatus | "pending";
  late: boolean;
}

function summarize(slots: TrackedSlot[]): DoseTrackingStats {
  const taken = slots.filter((s) => s.status === "taken").length;
  const onTime = slots.filter((s) => s.status === "taken" && !s.late).length;
  const late = slots.filter((s) => s.status === "taken" && s.late).length;
  const skipped = slots.filter((s) => s.status === "skipped").length;
  const missed = slots.filter((s) => s.status === "missed").length;
  const total = slots.length;
  return {
    percent: total === 0 ? 0 : Math.round((taken / total) * 100),
    taken,
    total,
    onTime,
    late,
    skipped,
    missed,
  };
}

/**
 * Full adherence breakdown for the dashboard's "Today's Adherence" card.
 *
 * requiredSlots is every slot generated for today for a required
 * (adherence-tracked, non-PRN) medication, including ones still
 * pending — so requiredTotal reflects the full day's required doses up
 * front rather than growing only as doses get resolved.
 *
 * nonRequiredSlots is the separate "take as needed + include in
 * adherence tracking" bucket — it never contributes to requiredTaken/
 * requiredTotal/percent above.
 */
export function computeAdherenceStats(
  requiredSlots: TrackedSlot[],
  nonRequiredSlots: TrackedSlot[] = [],
): AdherenceStats {
  const required = summarize(requiredSlots);
  return {
    percent: required.percent,
    requiredTaken: required.taken,
    requiredTotal: required.total,
    onTime: required.onTime,
    late: required.late,
    skipped: required.skipped,
    missed: required.missed,
    nonRequired: summarize(nonRequiredSlots),
  };
}
