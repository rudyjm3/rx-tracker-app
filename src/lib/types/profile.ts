// Ported from rx-tracker-web's lib/types/profile.ts, scoped to just the
// fields the mobile family-management screens, ProfileSwitcher, the
// account owner's own profile screen, and allergy tracking use this round
// (no onboarding — not in scope).

export interface UserProfile {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  height_value: number | null;
  height_unit: string | null;
  weight_value: number | null;
  weight_unit: string | null;
  height_updated_at: string | null;
  weight_updated_at: string | null;
  updated_at: string;
}

export interface FamilyProfile {
  id: string;
  user_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_color: string | null;
  relationship: string | null;
  birth_date: string | null;
  height_value: number | null;
  height_unit: string | null;
  weight_value: number | null;
  weight_unit: string | null;
  height_updated_at: string | null;
  weight_updated_at: string | null;
  created_at: string;
}

export type AllergyType = "allergy" | "intolerance";
export type AllergySeverity = "low" | "moderate" | "high" | "very_high";
export type AllergyCategory = "drug" | "food" | "environment_animal" | "other";

export interface AllergyCatalogEntry {
  id: string;
  owner_user_id: string | null;
  name: string;
  created_at: string;
}

export interface ProfileAllergy {
  id: string;
  owner_user_id: string;
  profile_id: string | null;
  allergy_catalog_id: string;
  allergy_type: AllergyType;
  life_threatening: boolean;
  severity: AllergySeverity | null;
  category: AllergyCategory | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

// profile_allergies joined with the catalog entry's name — the shape
// every allergy list/UI actually consumes, matching rx-tracker-web's
// AllergyPanel.
export type ProfileAllergyWithName = ProfileAllergy & { name: string };
