// Ported subset of rx-tracker-web's lib/app-settings.ts — the generic
// get/set (used to gate one-time seeding, see seedMoodTagsIfNeeded in
// lib/pain-mood.ts), the missed-dose grace period used to classify
// History rows as late, the default snooze duration used by the
// Dashboard's Snooze picker, the timezone toggle/display, and the mood
// chart color scheme toggle.
import { supabase } from "@/lib/supabase/client";
import { SNOOZE_OPTIONS } from "@/lib/schedule";

export const MISSED_GRACE_MIN_MINUTES = 5;
export const MISSED_GRACE_MAX_MINUTES = 240;
const DEFAULT_MISSED_GRACE_MINUTES = 60;

const DEFAULT_SNOOZE_MINUTES = 15;

export type MoodChartScheme = "classic" | "teal";
const MOOD_CHART_SCHEMES: MoodChartScheme[] = ["classic", "teal"];
const DEFAULT_MOOD_CHART_SCHEME: MoodChartScheme = "classic";

export async function getMoodChartScheme(): Promise<MoodChartScheme> {
  const raw = await getSetting("mood_chart_scheme");
  return MOOD_CHART_SCHEMES.includes(raw as MoodChartScheme)
    ? (raw as MoodChartScheme)
    : DEFAULT_MOOD_CHART_SCHEME;
}

export async function setMoodChartScheme(scheme: MoodChartScheme): Promise<void> {
  await setSetting("mood_chart_scheme", scheme);
}

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

export async function setMissedGraceMinutes(minutes: number): Promise<void> {
  if (
    !Number.isInteger(minutes) ||
    minutes < MISSED_GRACE_MIN_MINUTES ||
    minutes > MISSED_GRACE_MAX_MINUTES
  ) {
    throw new Error(
      `Grace period must be a whole number between ${MISSED_GRACE_MIN_MINUTES} and ${MISSED_GRACE_MAX_MINUTES} minutes.`,
    );
  }
  await setSetting("missed_grace_minutes", String(minutes));
}

export async function getSnoozeMinutes(): Promise<number> {
  const raw = await getSetting("snooze_minutes");
  const parsed = raw ? Number(raw) : NaN;
  return SNOOZE_OPTIONS.includes(parsed as (typeof SNOOZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_SNOOZE_MINUTES;
}

export async function setSnoozeMinutes(minutes: number): Promise<void> {
  if (!SNOOZE_OPTIONS.includes(minutes as (typeof SNOOZE_OPTIONS)[number])) {
    throw new Error("Snooze duration must be 5, 10, 15, or 30 minutes.");
  }
  await setSetting("snooze_minutes", String(minutes));
}

// Timezone is stored for parity with the reference app's Settings page
// and for potential future server-side use — schedule generation and
// date math already correctly use the device's local time regardless of
// this setting; see lib/utils.ts and lib/schedule.ts.
export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export async function getUseDeviceTimezone(): Promise<boolean> {
  const raw = await getSetting("use_device_timezone");
  return raw !== "false";
}

export async function setUseDeviceTimezone(useDevice: boolean): Promise<void> {
  await setSetting("use_device_timezone", String(useDevice));
}

export async function getTimezone(): Promise<string> {
  const raw = await getSetting("timezone");
  if (raw && isValidTimezone(raw)) return raw;
  return browserTimezone();
}

export async function setTimezone(timezone: string): Promise<void> {
  if (!isValidTimezone(timezone)) {
    throw new Error("Unrecognized time zone.");
  }
  await setSetting("timezone", timezone);
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
