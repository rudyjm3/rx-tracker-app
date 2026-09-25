// Ported subset of rx-tracker-web's lib/app-settings.ts — just the
// generic get/set used to gate one-time seeding (see
// seedMoodTagsIfNeeded in lib/pain-mood.ts). The rest of that file
// (grace periods, snooze, timezone, mood chart scheme) isn't needed yet.
import { supabase } from "@/lib/supabase/client";

export async function getSetting(key: string): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("app_settings")
    .select("setting_value")
    .eq("user_id", user.id)
    .eq("setting_key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.setting_value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("app_settings").upsert(
    {
      user_id: user.id,
      setting_key: key,
      setting_value: value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,setting_key" },
  );
  if (error) throw error;
}
