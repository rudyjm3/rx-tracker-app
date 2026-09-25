// Ported from rx-tracker-web's lib/types/profile.ts, scoped to just the
// fields the mobile family-management screens and ProfileSwitcher use this
// round (no UserProfile/allergies/onboarding — not in scope).

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
