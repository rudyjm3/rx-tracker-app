// Ported subset of rx-tracker-web's lib/medications.ts — just the reads
// the dashboard/medications screens need so far (getCurrentUserId,
// getActiveMedications, getInactiveMedications, getGroups,
// getGroupMembers). Write paths (add/edit medication, groups) come later
// once the medication CRUD screens are built.
import { supabase } from "@/lib/supabase/client";
import type { Medication, MedicationGroup } from "@/lib/types/medications";

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
