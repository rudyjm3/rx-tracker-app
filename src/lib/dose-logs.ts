// Ported subset of rx-tracker-web's lib/dose-logs.ts — today's reads,
// recordDose (Take/Skip), and the calendar's month-range reads. History
// and editing queries come later with the dose-history screen.
import { supabase } from "@/lib/supabase/client";
import type { DoseLog, DoseLogStatus, DosePostpone, Medication } from "@/lib/types/medications";

export async function getTodayLogs(date: string): Promise<DoseLog[]> {
  const { data, error } = await supabase
    .from("dose_logs")
    .select("*")
    .eq("scheduled_for_date", date);
  if (error) throw error;
  return data as DoseLog[];
}

export async function getTodayPostpones(date: string): Promise<DosePostpone[]> {
  const { data, error } = await supabase
    .from("dose_postpones")
    .select("*")
    .eq("scheduled_for_date", date)
    .is("resolved_at", null);
  if (error) throw error;
  return data as DosePostpone[];
}

/**
 * Take/Skip. Runs as the same atomic `record_dose` Postgres RPC the web
 * app uses (see rx-tracker-web's supabase/schema.sql) rather than a
 * client-side read-then-write, so a double-tap or two devices acting on
 * the same slot can't both read "no existing log" and both deduct
 * inventory for what should be a single dose.
 */
export async function recordDose(
  medication: Pick<Medication, "id" | "inventory_enabled">,
  scheduledForDate: string,
  scheduledTime: string,
  status: Extract<DoseLogStatus, "taken" | "skipped">,
  quantityPerDose: number,
): Promise<void> {
  const { error } = await supabase.rpc("record_dose", {
    p_medication_id: medication.id,
    p_scheduled_for_date: scheduledForDate,
    p_scheduled_time: scheduledTime,
    p_status: status,
    p_quantity_per_dose: quantityPerDose,
    p_inventory_enabled: medication.inventory_enabled,
    p_pain_level: null,
    p_mood_level: null,
    p_note: null,
  });
  if (error) throw error;
}

export interface CalendarDayMarker {
  taken: number;
  skipped: number;
  missed: number;
}

export type CalendarLogRow = DoseLog & {
  medications: { name: string; dose: string | null; dose_amount: number | null; dose_unit: string | null };
};

/**
 * Per-day taken/skipped/missed counts for a month, keyed by date.
 *
 * medicationIds, when provided, scopes the query to that set via
 * `.in("medication_id", ...)` — dose_logs has no profile_id of its own, so
 * callers wanting a profile-scoped view (e.g. the active family member)
 * resolve that profile's medication ids themselves (getActiveMedications +
 * getInactiveMedications) and pass them in here. Omitted, this behaves
 * exactly as before: every medication across every profile.
 */
export async function getCalendarMarkers(
  monthStart: string,
  monthEnd: string,
  medicationIds?: string[],
): Promise<Record<string, CalendarDayMarker>> {
  // A provided-but-empty scope (e.g. a profile with no medications at all)
  // means "match nothing" — short-circuit rather than send
  // `medication_id=in.()`, which PostgREST rejects as malformed instead of
  // treating as an empty result.
  if (medicationIds && medicationIds.length === 0) return {};

  let query = supabase
    .from("dose_logs")
    .select("scheduled_for_date, status")
    .gte("scheduled_for_date", monthStart)
    .lte("scheduled_for_date", monthEnd);
  if (medicationIds) query = query.in("medication_id", medicationIds);
  const { data, error } = await query;
  if (error) throw error;

  const markers: Record<string, CalendarDayMarker> = {};
  for (const row of data as { scheduled_for_date: string; status: DoseLogStatus }[]) {
    const marker = (markers[row.scheduled_for_date] ??= { taken: 0, skipped: 0, missed: 0 });
    marker[row.status]++;
  }
  return markers;
}

/**
 * Edits an existing dose_logs row via the edit_dose_log RPC — same
 * atomic inventory-adjustment shape as recordDose, but keyed by the
 * log's own id (the row already exists). See rx-tracker-web's
 * supabase/schema.sql for the function definition.
 */
export interface DoseLogEditInput {
  status: DoseLogStatus;
  takenAt?: string | null; // ISO; only applied when status === "taken"
  painLevel?: number | null;
  moodLevel?: number | null;
  note?: string;
  quantityPerDose?: number;
  inventoryEnabled?: boolean;
}

export async function editDoseLog(logId: string, input: DoseLogEditInput): Promise<void> {
  const { error } = await supabase.rpc("edit_dose_log", {
    p_log_id: logId,
    p_status: input.status,
    p_taken_at: input.takenAt ?? null,
    p_pain_level: input.painLevel ?? null,
    p_mood_level: input.moodLevel ?? null,
    p_note: input.note ?? null,
    p_quantity_per_dose: input.quantityPerDose ?? null,
    p_inventory_enabled: input.inventoryEnabled ?? false,
  });
  if (error) throw error;
}

/**
 * Deletes a dose_logs row via the delete_dose_log RPC, restoring
 * deducted inventory if it was a 'taken' entry on an inventory-tracked
 * medication.
 */
export async function deleteDoseLog(logId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_dose_log", { p_log_id: logId });
  if (error) throw error;
}

const CALENDAR_LOGS_PAGE_SIZE = 1000;

/**
 * Raw dose_logs for a date range, joined with medication name/dose, for
 * the calendar's day-detail view and the History screen's list (which
 * passes an arbitrary range, not necessarily a calendar month).
 *
 * Paged via .range() rather than a single query: History's 90-day preset
 * can exceed Supabase's default row cap on a profile with a lot of
 * dose_logs, and since the query orders oldest-first, a silently
 * truncated response would be missing the newest rows — exactly backwards
 * for a history feature. getCalendarMarkers doesn't need this: it only
 * selects two narrow columns for aggregation and its callers only ever
 * pass single-month ranges, so it stays well under the row cap.
 *
 * See getCalendarMarkers above for the medicationIds scoping convention.
 */
export async function getCalendarLogs(
  monthStart: string,
  monthEnd: string,
  medicationIds?: string[],
): Promise<CalendarLogRow[]> {
  // See getCalendarMarkers above: a provided-but-empty scope means "match
  // nothing," short-circuited rather than sent as `medication_id=in.()`.
  if (medicationIds && medicationIds.length === 0) return [];

  const rows: CalendarLogRow[] = [];
  for (let page = 0; ; page++) {
    let query = supabase
      .from("dose_logs")
      .select("*, medications(name, dose, dose_amount, dose_unit)")
      .gte("scheduled_for_date", monthStart)
      .lte("scheduled_for_date", monthEnd);
    if (medicationIds) query = query.in("medication_id", medicationIds);
    const from = page * CALENDAR_LOGS_PAGE_SIZE;
    const { data, error } = await query
      .order("scheduled_for_date", { ascending: true })
      .order("scheduled_time", { ascending: true })
      // scheduled_for_date + scheduled_time alone aren't unique — multiple
      // medications can share a slot — so without a final unique tie-breaker
      // a row tied at a page boundary can shift between requests and end up
      // duplicated in one page and skipped in the next. `id` is unique and
      // stable across all pages.
      .order("id", { ascending: true })
      .range(from, from + CALENDAR_LOGS_PAGE_SIZE - 1);
    if (error) throw error;
    const pageRows = data as CalendarLogRow[];
    rows.push(...pageRows);
    if (pageRows.length < CALENDAR_LOGS_PAGE_SIZE) break;
  }
  return rows;
}
