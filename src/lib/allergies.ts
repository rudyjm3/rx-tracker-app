// Ported from rx-tracker-web's lib/allergies.ts, using this app's
// `supabase` client import style (see lib/medications.ts) rather than
// web's createClient(). Plain single-table Supabase calls against
// allergy_catalog/profile_allergies (RLS-scoped) — no RPC needed.
import { supabase } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/medications";
import type {
  AllergyCatalogEntry,
  AllergyCategory,
  AllergySeverity,
  AllergyType,
  ProfileAllergyWithName,
} from "@/lib/types/profile";

export const ALLERGY_TYPES: AllergyType[] = ["allergy", "intolerance"];
export const ALLERGY_SEVERITIES: AllergySeverity[] = ["low", "moderate", "high", "very_high"];
export const ALLERGY_CATEGORIES: AllergyCategory[] = [
  "drug",
  "food",
  "environment_animal",
  "other",
];

export const ALLERGY_SEVERITY_LABELS: Record<AllergySeverity, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  very_high: "Very High",
};

export const ALLERGY_CATEGORY_LABELS: Record<AllergyCategory, string> = {
  drug: "Drug",
  food: "Food",
  environment_animal: "Environment / Animal",
  other: "Other",
};

/**
 * Every catalog entry visible to this user: global entries (owner_user_id
 * null) plus any this user has added themselves.
 */
export async function getAllergyCatalog(): Promise<AllergyCatalogEntry[]> {
  const { data, error } = await supabase
    .from("allergy_catalog")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as AllergyCatalogEntry[];
}

export async function getProfileAllergies(
  profileId: string | null,
): Promise<ProfileAllergyWithName[]> {
  let query = supabase
    .from("profile_allergies")
    .select("*, allergy_catalog(name)")
    .order("name", { ascending: true, referencedTable: "allergy_catalog" });
  query = profileId === null ? query.is("profile_id", null) : query.eq("profile_id", profileId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as (ProfileAllergyWithName & { allergy_catalog: { name: string } })[]).map(
    ({ allergy_catalog, ...row }) => ({ ...row, name: allergy_catalog.name }),
  );
}

async function resolveCatalogId(
  catalogId: string | null,
  newName: string | null,
): Promise<string> {
  if (catalogId) return catalogId;
  const trimmed = newName?.trim();
  if (!trimmed) throw new Error("Choose an allergy or enter a new one.");

  const userId = await getCurrentUserId();
  const { data: existing, error: findError } = await supabase
    .from("allergy_catalog")
    .select("id")
    .or(`owner_user_id.is.null,owner_user_id.eq.${userId}`)
    .ilike("name", trimmed)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id as string;

  const { data: created, error: insertError } = await supabase
    .from("allergy_catalog")
    .insert({ owner_user_id: userId, name: trimmed.slice(0, 150) })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id as string;
}

export interface AllergyInput {
  catalogId?: string | null;
  newAllergyName?: string | null;
  allergyType: AllergyType;
  lifeThreatening: boolean;
  severity?: AllergySeverity | null;
  category?: AllergyCategory | null;
  notes?: string | null;
}

// profile_allergies has a unique (owner_user_id, profile_id,
// allergy_catalog_id) constraint — Postgres error 23505 on that is the
// "already on the list" case; every other error passes through unchanged.
function rethrowFriendly(error: { code?: string; message: string }): never {
  if (error.code === "23505") {
    throw new Error("That allergy is already on the list.");
  }
  throw error;
}

export async function addAllergy(
  profileId: string | null,
  input: AllergyInput,
): Promise<void> {
  const userId = await getCurrentUserId();
  const catalogId = await resolveCatalogId(input.catalogId ?? null, input.newAllergyName ?? null);
  const { error } = await supabase.from("profile_allergies").insert({
    owner_user_id: userId,
    profile_id: profileId,
    allergy_catalog_id: catalogId,
    allergy_type: input.allergyType,
    life_threatening: input.lifeThreatening,
    severity: input.severity ?? null,
    category: input.category ?? null,
    notes: input.notes?.trim() || null,
  });
  if (error) rethrowFriendly(error);
}

export async function updateAllergy(
  id: string,
  input: AllergyInput & { isActive: boolean },
): Promise<void> {
  const catalogId = await resolveCatalogId(input.catalogId ?? null, input.newAllergyName ?? null);
  const { error } = await supabase
    .from("profile_allergies")
    .update({
      allergy_catalog_id: catalogId,
      allergy_type: input.allergyType,
      life_threatening: input.lifeThreatening,
      severity: input.severity ?? null,
      category: input.category ?? null,
      notes: input.notes?.trim() || null,
      is_active: input.isActive,
    })
    .eq("id", id);
  if (error) rethrowFriendly(error);
}

export async function deleteAllergy(id: string): Promise<void> {
  const { error } = await supabase.from("profile_allergies").delete().eq("id", id);
  if (error) throw error;
}
