// Ported from rx-tracker-web's lib/types/profile.ts, scoped to just the
// fields the mobile family-management screens, ProfileSwitcher, and the
// account owner's own profile screen use this round (no allergies/
// onboarding — not in scope).

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
