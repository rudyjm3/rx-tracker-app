// Ported subset of rx-tracker-web's lib/dose-logs.ts — today's reads plus
// recordDose (Take/Skip), which is what the dashboard needs. History,
// editing, and calendar queries come later with the calendar screen.
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
