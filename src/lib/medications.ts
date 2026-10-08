// Ported subset of rx-tracker-web's lib/medications.ts — the reads, the
// single-medication edit path, and the Add Medication create path. Group
// management comes later.
import { supabase } from "@/lib/supabase/client";
import type { GroupDoseOverride } from "@/lib/utils";
import type {
  DoseHistoryEntry,
  FeedbackType,
  Medication,
  MedicationDoseChange,
  MedicationGroup,
  MedicationStatusEvent,
  MedicationType,
  ScheduleMode,
} from "@/lib/types/medications";

export interface ScheduleTimeInput {
  reminder_time: string;
  quantity_per_dose?: number | null;
}

export interface MedicationInput {
  name: string;
  dose_amount?: number | null;
  dose_unit?: string | null;
  dose_form?: string | null;
  // Omit to leave the stored value untouched on update; null clears it.
  dailymed_setid?: string | null;
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
        dailymed_setid: input.dailymed_setid ?? null,
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
      ...(input.dailymed_setid !== undefined && { dailymed_setid: input.dailymed_setid }),
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
export async function deactivateMedication(id: string, reason = "", comment = ""): Promise<void> {
  const { error } = await supabase.rpc("set_medication_status", {
    p_medication_id: id,
    p_active: false,
    p_event: "discontinued",
    p_reason: reason,
    p_comment: comment,
  });
  if (error) throw error;
}

export async function activateMedication(id: string, reason = "", comment = ""): Promise<void> {
  const { error } = await supabase.rpc("set_medication_status", {
    p_medication_id: id,
    p_active: true,
    p_event: "resumed",
    p_reason: reason,
    p_comment: comment,
  });
  if (error) throw error;
}

function normalizeDoseAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeDoseUnit(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

// Records a dose_amount/dose_unit change as its own medication_dose_changes
// event (surfaced in getDoseHistory below), distinct from a full Edit —
// port of rx-tracker-web's updatePrescribedDose. Runs as the atomic
// update_prescribed_dose RPC, which no-ops (returns false) when the new
// amount/unit match the current ones, so a reason-only submission with no
// actual change doesn't create a spurious history entry.
export async function updatePrescribedDose(
  id: string,
  doseAmount: number | null,
  doseUnit: string | null,
  reason = "",
): Promise<boolean> {
  const { data, error } = await supabase.rpc("update_prescribed_dose", {
    p_medication_id: id,
    p_dose_amount: normalizeDoseAmount(doseAmount),
    p_dose_unit: normalizeDoseUnit(doseUnit),
    p_comment: reason,
  });
  if (error) throw error;
  return data === true;
}

// ── Dose history (dose changes + status events, merged) ────────────

export async function getDoseHistory(medicationId: string): Promise<DoseHistoryEntry[]> {
  const [changesResult, eventsResult] = await Promise.all([
    supabase.from("medication_dose_changes").select("*").eq("medication_id", medicationId),
    supabase.from("medication_status_events").select("*").eq("medication_id", medicationId),
  ]);
  if (changesResult.error) throw changesResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const entries: DoseHistoryEntry[] = [
    ...(changesResult.data as MedicationDoseChange[]).map((c) => ({
      type: "dose_change" as const,
      at: c.changed_at,
      data: c,
    })),
    ...(eventsResult.data as MedicationStatusEvent[]).map((e) => ({
      type: "status_event" as const,
      at: e.event_at,
      data: e,
    })),
  ];

  entries.sort((a, b) => b.at.localeCompare(a.at));
  return entries;
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

/**
 * Every group-level dose override for each medication, keyed by medication id,
 * for daysUntilRunout — group-owned schedule rows no longer carry their own
 * quantity, so callers must supply the membership overrides.
 */
export async function getGroupDoseOverridesByMedication(
  profileId?: string | null,
): Promise<Map<string, GroupDoseOverride[]>> {
  const [groups, members] = await Promise.all([getGroups(profileId), getGroupMembers()]);
  const byMedication = new Map<string, GroupDoseOverride[]>();
  for (const member of members) {
    const group = groups.find((g) => g.id === member.group_id);
    if (!group) continue;
    const list = byMedication.get(member.medication_id) ?? [];
    list.push({ scheduled_time: group.scheduled_time, quantity_per_dose: member.quantity_per_dose });
    byMedication.set(member.medication_id, list);
  }
  return byMedication;
}

// ── Medication groups (create/edit/delete) ─────────────────────────

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

/**
 * Runs as the atomic `create_group` RPC (see rx-tracker-web's
 * supabase/schema.sql) rather than separate insert/insert client
 * requests, so a dropped connection between them can't leave a group
 * created with no members.
 */
export async function createGroup(
  input: GroupInput,
  members: GroupMemberInput[],
): Promise<MedicationGroup> {
  const { data, error } = await supabase
    .rpc("create_group", {
      p_group: {
        profile_id: input.profile_id ?? null,
        name: input.name,
        scheduled_time: input.scheduled_time,
      },
      p_members: members.map((m, i) => ({
        medication_id: m.medication_id,
        quantity_per_dose: m.quantity_per_dose ?? null,
        sort_order: m.sort_order ?? i,
      })),
    })
    .select()
    .single();
  if (error) throw error;
  return data as MedicationGroup;
}

/**
 * Runs as the atomic `update_group` RPC (see rx-tracker-web's
 * supabase/schema.sql) rather than separate update/delete/insert client
 * requests, so a dropped connection or constraint violation partway
 * through the reinsert can't leave the group with zero members — which
 * trg_cleanup_group_schedule_on_member_remove would then react to by
 * clearing those medications' schedule times too. A failure anywhere
 * inside the RPC rolls back the whole update and leaves the original
 * membership untouched.
 */
export async function updateGroup(
  id: string,
  input: GroupInput,
  members: GroupMemberInput[],
): Promise<void> {
  const { error } = await supabase.rpc("update_group", {
    p_group_id: id,
    p_group: {
      profile_id: input.profile_id ?? null,
      name: input.name,
      scheduled_time: input.scheduled_time,
    },
    p_members: members.map((m, i) => ({
      medication_id: m.medication_id,
      quantity_per_dose: m.quantity_per_dose ?? null,
      sort_order: m.sort_order ?? i,
    })),
  });
  if (error) throw error;
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
