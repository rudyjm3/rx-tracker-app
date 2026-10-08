// Mirrors rx-tracker-web's lib/low-supply-dismissals.ts — same
// low_supply_dismissals table (defined in rx-tracker-web's
// supabase/schema.sql). A dismissal hides a medication's low-supply
// reminder for one local calendar day, account-wide; callers only ever ask
// for today's date, so a still-low medication reappears tomorrow.
import { supabase } from "@/lib/supabase/client";

export async function getDismissedMedicationIds(date: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("low_supply_dismissals")
    .select("medication_id")
    .eq("dismissed_date", date);
  // Non-fatal: if the read fails (or the migration isn't applied yet) the
  // reminders just show undismissed rather than breaking the dashboard.
  if (error) {
    console.error("Failed to load low-supply dismissals", error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.medication_id as string));
}

export async function dismissLowSupply(medicationId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from("low_supply_dismissals")
    .upsert(
      { medication_id: medicationId, dismissed_date: date },
      { onConflict: "medication_id,dismissed_date", ignoreDuplicates: true },
    );
  if (error) throw error;
}
