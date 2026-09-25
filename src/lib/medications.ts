// Ported subset of rx-tracker-web's lib/medications.ts — the reads and
// the single-medication edit path the app needs so far. createMedication
// (the Add Medication wizard) and group management come later.
import { supabase } from "@/lib/supabase/client";
import type { FeedbackType, Medication, MedicationGroup, MedicationType, ScheduleMode } from "@/lib/types/medications";

export interface ScheduleTimeInput {
  reminder_time: string;
  quantity_per_dose?: number | null;
}

export interface MedicationInput {
  name: string;
  dose_amount?: number | null;
  dose_unit?: string | null;
  dose_form?: string | null;
  instructions?: string;
  medication_type: MedicationType;
  as_needed: boolean;
  schedule_mode: ScheduleMode;
  interval_hours?: number | null;
  first_dose_time?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  inventory_enabled: boolean;
  inventory_type: string;
  inventory_unit: string;
  starting_quantity?: number | null;
  quantity_per_dose: number;
  low_supply_threshold: number;
  feedback_type: FeedbackType;
  dashboard_enabled: boolean;
  reminders_enabled: boolean;
  adherence_enabled: boolean;
  profile_id?: string | null;
}

function formatDose(input: Pick<MedicationInput, "dose_amount" | "dose_unit" | "dose_form">) {
  return [input.dose_amount, input.dose_unit, input.dose_form].filter(Boolean).join(" ");
}

function normalizeDoseAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeDoseUnit(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

export async function getActiveMedications(profileId?: string | null): Promise<Medication[]> {
  let query = supabase
    .from("medications")
    .select("*, medication_schedule_times(*)")
    .eq("active", true);
  query = profileId == null ? query.is("profile_id", null) : query.eq("profile_id", profileId);
  const { data, error } = await query.order("sort_order");
  if (error) throw error;
  return data as Medication[];
}

export async function getInactiveMedications(profileId?: string | null): Promise<Medication[]> {
  let query = supabase
    .from("medications")
    .select("*, medication_schedule_times(*)")
    .eq("active", false);
  query = profileId == null ? query.is("profile_id", null) : query.eq("profile_id", profileId);
  const { data, error } = await query.order("name");
  if (error) throw error;
  return data as Medication[];
}

export async function getMedication(id: string): Promise<Medication> {
  const { data, error } = await supabase
    .from("medications")
    .select("*, medication_schedule_times(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Medication;
}

export async function updateMedication(
  id: string,
  input: MedicationInput,
  scheduleTimes: ScheduleTimeInput[],
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("medications")
    .select("dose_amount, dose_unit, inventory_enabled, current_quantity, starting_quantity")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;

  // current_quantity is the live balance doses/refills deduct from — an
  // edit here should only (re)initialize it when inventory tracking is
  // being turned on for the first time, never silently reset it just
  // because the form resubmits a starting_quantity value.
  const inventoryJustEnabled = input.inventory_enabled && !existing.inventory_enabled;
  const startingQuantity = input.inventory_enabled
    ? inventoryJustEnabled
      ? input.starting_quantity
      : existing.starting_quantity
    : null;
  const currentQuantity = input.inventory_enabled
    ? inventoryJustEnabled || existing.current_quantity == null
      ? input.starting_quantity
      : existing.current_quantity
    : null;

  const { error } = await supabase
    .from("medications")
    .update({
      profile_id: input.profile_id ?? null,
      name: input.name,
      dose: formatDose(input),
      dose_amount: input.dose_amount ?? null,
      dose_unit: input.dose_unit ?? null,
      dose_form: input.dose_form ?? null,
      instructions: input.instructions ?? "",
      schedule_mode: input.schedule_mode,
      interval_hours: input.interval_hours ?? null,
      first_dose_time: input.first_dose_time ?? null,
      as_needed: input.as_needed,
      medication_type: input.medication_type,
      inventory_type: input.inventory_type,
      inventory_unit: input.inventory_unit,
      starting_quantity: startingQuantity,
      current_quantity: currentQuantity,
      quantity_per_dose: input.quantity_per_dose,
      low_supply_threshold: input.low_supply_threshold,
      track_dose_feedback: input.feedback_type !== "none",
      feedback_type: input.feedback_type,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      dashboard_enabled: input.dashboard_enabled,
      reminders_enabled: input.reminders_enabled,
      adherence_enabled: input.adherence_enabled,
      inventory_enabled: input.inventory_enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  const oldDoseAmount = normalizeDoseAmount(existing.dose_amount);
  const newDoseAmount = normalizeDoseAmount(input.dose_amount);
  const oldDoseUnit = normalizeDoseUnit(existing.dose_unit);
  const newDoseUnit = normalizeDoseUnit(input.dose_unit);
  const doseChanged = oldDoseAmount !== newDoseAmount || oldDoseUnit !== newDoseUnit;
  if (doseChanged) {
    const { error: doseChangeError } = await supabase.from("medication_dose_changes").insert({
      medication_id: id,
      old_dose_amount: oldDoseAmount,
      old_dose_unit: oldDoseUnit,
      new_dose_amount: newDoseAmount,
      new_dose_unit: newDoseUnit,
    });
    if (doseChangeError) throw doseChangeError;
  }

  // Only touch this medication's individual (group_id is null) schedule
  // times here — group-owned rows are managed exclusively by the group
  // sync trigger, not by this form (which has no group editing yet).
  const { error: deleteError } = await supabase
    .from("medication_schedule_times")
    .delete()
    .eq("medication_id", id)
    .is("group_id", null);
  if (deleteError) throw deleteError;

  if (scheduleTimes.length > 0) {
    const { error: scheduleError } = await supabase.from("medication_schedule_times").insert(
      scheduleTimes.map((t) => ({
        medication_id: id,
        reminder_time: t.reminder_time,
        quantity_per_dose: t.quantity_per_dose ?? null,
      })),
    );
    if (scheduleError) throw scheduleError;
  }
}

export async function deactivateMedication(id: string): Promise<void> {
  const { error } = await supabase
    .from("medications")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  const { error: eventError } = await supabase
    .from("medication_status_events")
    .insert({ medication_id: id, event: "discontinued", reason: "", comment: "" });
  if (eventError) throw eventError;
}

export async function activateMedication(id: string): Promise<void> {
  const { error } = await supabase
    .from("medications")
    .update({ active: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  const { error: eventError } = await supabase
    .from("medication_status_events")
    .insert({ medication_id: id, event: "resumed", reason: "", comment: "" });
  if (eventError) throw eventError;
}

export async function getGroups(profileId?: string | null): Promise<MedicationGroup[]> {
  let query = supabase.from("medication_groups").select("*").eq("active", true);
  query = profileId == null ? query.is("profile_id", null) : query.eq("profile_id", profileId);
  const { data, error } = await query.order("scheduled_time");
  if (error) throw error;
  return data as MedicationGroup[];
}

export async function getGroupMembers(): Promise<
  { group_id: string; medication_id: string; quantity_per_dose: number | null }[]
> {
  const { data, error } = await supabase
    .from("medication_group_members")
    .select("group_id, medication_id, quantity_per_dose");
  if (error) throw error;
  return data;
}
