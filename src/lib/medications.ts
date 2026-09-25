// Ported subset of rx-tracker-web's lib/medications.ts — the reads, the
// single-medication edit path, and the Add Medication create path. Group
// management comes later.
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

/**
 * Like getActiveMedications, but returns active medications across every
 * profile (the owner and every family member) rather than being scoped to
 * one. Used only by the local reminder resync (lib/notifications.ts),
 * which schedules device notifications from every profile's medications
 * — not just whichever profile happens to be selected in the UI — so an
 * omitted profileId there must not silently fall back to "owner only".
 */
export async function getAllActiveMedicationsAcrossProfiles(): Promise<Medication[]> {
  const { data, error } = await supabase
    .from("medications")
    .select("*, medication_schedule_times(*)")
    .eq("active", true)
    .order("sort_order");
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

/**
 * Runs as the atomic `create_medication` RPC (see rx-tracker-web's
 * supabase/schema.sql) rather than separate insert/insert client
 * requests, so a dropped connection between them can't leave a
 * medication created with no schedule times, silently missing from
 * every schedule/dashboard view. The RPC also computes `dose`
 * server-side, matching updateMedication below.
 */
export async function createMedication(
  input: MedicationInput,
  scheduleTimes: ScheduleTimeInput[],
): Promise<Medication> {
  const { data, error } = await supabase
    .rpc("create_medication", {
      p_medication: {
        profile_id: input.profile_id ?? null,
        name: input.name,
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
        starting_quantity: input.starting_quantity ?? null,
        quantity_per_dose: input.quantity_per_dose,
        low_supply_threshold: input.low_supply_threshold,
        feedback_type: input.feedback_type,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        dashboard_enabled: input.dashboard_enabled,
        reminders_enabled: input.reminders_enabled,
        adherence_enabled: input.adherence_enabled,
        inventory_enabled: input.inventory_enabled,
      },
      p_schedule_times: scheduleTimes.map((t) => ({
        reminder_time: t.reminder_time,
        quantity_per_dose: t.quantity_per_dose ?? null,
      })),
    })
    .select()
    .single();
  if (error) throw error;
  return data as Medication;
}

/**
 * Runs as the atomic `update_medication` RPC (see rx-tracker-web's
 * supabase/schema.sql) rather than separate update/insert/delete/insert
 * client requests, so a dropped connection or constraint violation
 * partway through can't leave the medication updated but its individual
 * schedule times wiped and never replaced. The RPC also computes `dose`
 * and handles the "only (re)initialize current_quantity when inventory
 * tracking is newly enabled" rule server-side, so both apps share one
 * implementation instead of duplicating it in each client.
 */
export async function updateMedication(
  id: string,
  input: MedicationInput,
  scheduleTimes: ScheduleTimeInput[],
): Promise<void> {
  const { error } = await supabase.rpc("update_medication", {
    p_medication_id: id,
    p_medication: {
      profile_id: input.profile_id ?? null,
      name: input.name,
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
      starting_quantity: input.starting_quantity ?? null,
      quantity_per_dose: input.quantity_per_dose,
      low_supply_threshold: input.low_supply_threshold,
      feedback_type: input.feedback_type,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      dashboard_enabled: input.dashboard_enabled,
      reminders_enabled: input.reminders_enabled,
      adherence_enabled: input.adherence_enabled,
      inventory_enabled: input.inventory_enabled,
    },
    p_schedule_times: scheduleTimes.map((t) => ({
      reminder_time: t.reminder_time,
      quantity_per_dose: t.quantity_per_dose ?? null,
    })),
  });
  if (error) throw error;
}

// Runs as the atomic set_medication_status RPC rather than a separate
// update + insert, so a dropped connection between them can't leave a
// medication discontinued/resumed with no matching audit event.
export async function deactivateMedication(id: string): Promise<void> {
  const { error } = await supabase.rpc("set_medication_status", {
    p_medication_id: id,
    p_active: false,
    p_event: "discontinued",
  });
  if (error) throw error;
}

export async function activateMedication(id: string): Promise<void> {
  const { error } = await supabase.rpc("set_medication_status", {
    p_medication_id: id,
    p_active: true,
    p_event: "resumed",
  });
  if (error) throw error;
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

// ── Medication groups (create/edit/delete) ─────────────────────────
// Plain multi-step table writes, matching rx-tracker-web's
// lib/medications.ts — medication_groups/medication_group_members are
// ordinary RLS-scoped tables with no cross-table invariants that need an
// atomic RPC (unlike medications, which has create_medication/
// update_medication). A trigger on the member/group tables
// (trg_sync_group_schedule_on_member_change, see rx-tracker-web's
// supabase/schema.sql) keeps each member's medication_schedule_times row
// in sync automatically.

export interface GroupInput {
  name: string;
  scheduled_time: string;
  profile_id?: string | null;
}

export interface GroupMemberInput {
  medication_id: string;
  quantity_per_dose?: number | null;
  sort_order?: number;
}

export async function createGroup(
  input: GroupInput,
  members: GroupMemberInput[],
): Promise<MedicationGroup> {
  const userId = await getCurrentUserId();

  const { data: group, error } = await supabase
    .from("medication_groups")
    .insert({
      user_id: userId,
      profile_id: input.profile_id ?? null,
      name: input.name,
      scheduled_time: input.scheduled_time,
      active: true,
    })
    .select()
    .single();
  if (error) throw error;

  if (members.length > 0) {
    const { error: memberError } = await supabase.from("medication_group_members").insert(
      members.map((m, i) => ({
        group_id: group.id,
        medication_id: m.medication_id,
        quantity_per_dose: m.quantity_per_dose ?? null,
        sort_order: m.sort_order ?? i,
      })),
    );
    if (memberError) throw memberError;
  }

  return group as MedicationGroup;
}

export async function updateGroup(
  id: string,
  input: GroupInput,
  members: GroupMemberInput[],
): Promise<void> {
  const { error } = await supabase
    .from("medication_groups")
    .update({
      name: input.name,
      scheduled_time: input.scheduled_time,
      profile_id: input.profile_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  const { error: deleteError } = await supabase
    .from("medication_group_members")
    .delete()
    .eq("group_id", id);
  if (deleteError) throw deleteError;

  if (members.length > 0) {
    const { error: memberError } = await supabase.from("medication_group_members").insert(
      members.map((m, i) => ({
        group_id: id,
        medication_id: m.medication_id,
        quantity_per_dose: m.quantity_per_dose ?? null,
        sort_order: m.sort_order ?? i,
      })),
    );
    if (memberError) throw memberError;
  }
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabase
    .from("medication_groups")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Assigns (or removes) a single medication's group membership — always
 * replaces any existing membership row for the medication rather than
 * appending to a possibly-multi-group set the way the group form's
 * checklist does. Pass groupId = null for "No group". Ported from
 * rx-tracker-web's lib/medications.ts for parity, even though this app's
 * group membership is currently only edited from the group's own form.
 */
export async function setMedicationGroup(
  medicationId: string,
  groupId: string | null,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("medication_group_members")
    .delete()
    .eq("medication_id", medicationId);
  if (deleteError) throw deleteError;

  if (!groupId) return;

  const { data: existing, error: fetchError } = await supabase
    .from("medication_group_members")
    .select("sort_order")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (fetchError) throw fetchError;
  const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { error } = await supabase.from("medication_group_members").insert({
    group_id: groupId,
    medication_id: medicationId,
    sort_order: nextSortOrder,
  });
  if (error) throw error;
}
