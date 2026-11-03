// Ported from rx-tracker-web's lib/inventory.ts — same RPCs/table, this
// app's supabase client import style instead of web's createClient().
import { supabase } from "@/lib/supabase/client";
import { localDateString } from "@/lib/utils";
import type { MedicationRefill } from "@/lib/types/medications";

// Amounts are always floats — never cast to int. Inventory can be
// fractional (mL, patches, puffs, drops), not just whole pills.

// pillsOnHand of null means "not entered" — the new total is derived as
// current_quantity + amount instead of taking the user's word for it.
// Runs as the log_refill RPC (row-locked, see rx-tracker-web's
// supabase/schema.sql) rather than a client-side read-then-write, so a
// dose taken or another refill logged between the read and the write here
// can't get silently overwritten by a total computed from stale data.
export async function logRefill(
  medicationId: string,
  amount: number,
  pillsOnHand: number | null,
  note = "",
  refillDate?: string,
): Promise<void> {
  const { error } = await supabase.rpc("log_refill", {
    p_medication_id: medicationId,
    p_amount: amount,
    p_pills_on_hand: pillsOnHand,
    p_note: note,
    p_refill_date: refillDate,
  });
  if (error) throw error;
}

export async function getRefillHistory(medicationId: string): Promise<MedicationRefill[]> {
  const { data, error } = await supabase
    .from("medication_refills")
    .select("*")
    .eq("medication_id", medicationId)
    .order("refill_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as MedicationRefill[];
}

// One request for the whole visible medication list instead of one per
// card — rows come back newest-first, so the first row seen per
// medication_id is its latest refill.
export async function getLatestRefills(
  medicationIds: string[],
): Promise<Map<string, MedicationRefill>> {
  const latest = new Map<string, MedicationRefill>();
  if (medicationIds.length === 0) return latest;

  const { data, error } = await supabase
    .from("medication_refills")
    .select("*")
    .in("medication_id", medicationIds)
    .eq("entry_type", "refill")
    .order("refill_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  for (const refill of (data as MedicationRefill[]) ?? []) {
    if (!latest.has(refill.medication_id)) latest.set(refill.medication_id, refill);
  }
  return latest;
}

// Same row-locked shape as log_refill — the stored delta (newQuantity
// minus whatever current_quantity actually was under the lock) needs the
// same atomicity, not a delta computed from a quantity read moments
// earlier on the client.
export async function adjustQuantity(
  medicationId: string,
  newQuantity: number,
  note = "",
  adjustDate: string = localDateString(),
): Promise<void> {
  const { error } = await supabase.rpc("adjust_quantity", {
    p_medication_id: medicationId,
    p_new_quantity: newQuantity,
    p_note: note,
    p_date: adjustDate,
  });
  if (error) throw error;
}

// Edit / delete a logged refill. Both run as row-locked RPCs (see
// rx-tracker-web's supabase/migrations/20261102000000_edit_delete_refill.sql)
// that shift the medication's current_quantity by the change in amount.
export async function updateRefill(
  refillId: string,
  amount: number,
  refillDate: string,
  note = "",
): Promise<void> {
  const { error } = await supabase.rpc("update_refill", {
    p_refill_id: refillId,
    p_amount: amount,
    p_refill_date: refillDate,
    p_note: note,
  });
  if (error) throw error;
}

export async function deleteRefill(refillId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_refill", { p_refill_id: refillId });
  if (error) throw error;
}

// Sets (or clears, with null) a medication's next refill date. A plain
// column update — the date isn't part of the row-locked quantity math.
export async function setNextRefillDate(medicationId: string, date: string | null): Promise<void> {
  const { error } = await supabase
    .from("medications")
    .update({ next_refill_date: date })
    .eq("id", medicationId);
  if (error) throw error;
}
