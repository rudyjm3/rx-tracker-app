// Ported subset of rx-tracker-web's lib/app-settings.ts — the generic
// get/set (used to gate one-time seeding, see seedMoodTagsIfNeeded in
// lib/pain-mood.ts) plus the missed-dose grace period getter used to
// classify History rows as late. Everything else in that file (the
// setter for the grace period, snooze, timezone, mood chart scheme)
// isn't needed yet.
import { supabase } from "@/lib/supabase/client";

export const MISSED_GRACE_MIN_MINUTES = 5;
export const MISSED_GRACE_MAX_MINUTES = 240;
const DEFAULT_MISSED_GRACE_MINUTES = 60;

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

export async function getMissedGraceMinutes(): Promise<number> {
  const raw = await getSetting("missed_grace_minutes");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) &&
    parsed >= MISSED_GRACE_MIN_MINUTES &&
    parsed <= MISSED_GRACE_MAX_MINUTES
    ? parsed
    : DEFAULT_MISSED_GRACE_MINUTES;
}
