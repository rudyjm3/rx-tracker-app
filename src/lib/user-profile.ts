// Ported from rx-tracker-web's lib/user-profile.ts, using this app's
// `supabase` client import style (see lib/medications.ts) rather than
// web's createClient(). Photo upload (uploadAvatar/deleteAvatarIfManaged)
// is out of scope this round — no image picker is installed yet, same
// deferral already made for family member photos.
import { supabase } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/medications";
import type { UserProfile } from "@/lib/types/profile";

export async function getUserProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
}

export interface UserProfileInput {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  height_value?: number | null;
  height_unit?: string | null;
  weight_value?: number | null;
  weight_unit?: string | null;
  height_updated_at?: string | null;
  weight_updated_at?: string | null;
}

export async function upsertUserProfile(input: UserProfileInput): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      { user_id: userId, ...input, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}
