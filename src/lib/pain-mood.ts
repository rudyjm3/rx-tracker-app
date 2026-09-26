// Ported subset of rx-tracker-web's lib/pain-mood.ts, scoped to this app's
// first pass: standalone (medication_id null) pain/mood logging only. Dose-
// linked logs, medication attachment, family-profile filtering, trend
// charts (groupDailyAverages) and mood tag management (create/rename/
// delete/always-show) aren't reachable from this app yet — see that file
// for the full feature set this is ported from.
import { supabase } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/medications";
import { getSetting, setSetting } from "@/lib/app-settings";
import { Brand } from "@/constants/theme";
import type { Medication, MoodTag, PainMoodLogType, StandalonePainMoodLog } from "@/lib/types/medications";

export type WellbeingMetric = "pain" | "mood";

export function medicationTracksPain(medication: Pick<Medication, "feedback_type">): boolean {
  return medication.feedback_type === "pain" || medication.feedback_type === "both";
}

export function medicationTracksMood(medication: Pick<Medication, "feedback_type">): boolean {
  return medication.feedback_type === "mood" || medication.feedback_type === "both";
}

// 3 severity bands, matching rx-tracker-web's levelColor() classic scheme
// (its "teal mood chart" alternate scheme is out of scope here — see
// AGENTS.md/task notes). Mood is inverted from pain: a low mood score is
// the bad end, a low pain score is the good end.
export function levelColor(metric: WellbeingMetric, level: number): string {
  const rounded = Math.round(level);
  if (metric === "pain") {
    if (rounded <= 3) return Brand.success;
    if (rounded <= 6) return Brand.warning;
    return Brand.danger;
  }
  if (rounded <= 3) return Brand.danger;
  if (rounded <= 6) return Brand.warning;
  return Brand.success;
}

// ── Standalone pain/mood logs ───────────────────────────────────────

export interface CreateStandaloneLogInput {
  logType: PainMoodLogType;
  painLevel?: number | null;
  moodLevel?: number | null;
  note?: string;
  tags?: string;
  loggedAt?: string;
}

export async function createStandaloneLog(input: CreateStandaloneLogInput): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("standalone_pain_mood_logs").insert({
    user_id: userId,
    medication_id: null,
    profile_id: null,
    log_type: input.logType,
    pain_level: input.painLevel ?? null,
    mood_level: input.moodLevel ?? null,
    note: input.note ?? "",
    tags: input.tags ?? "",
    logged_at: input.loggedAt ?? new Date().toISOString(),
  });
  if (error) throw error;
}

// ── Mood tags ────────────────────────────────────────────────────────

const MOOD_TAGS_SEEDED_KEY = "mood_tags_seeded";

// Same predefined tag set as rx-tracker-web's lib/pain-mood.ts (itself
// mirroring the original PHP app's SchemaInstaller), seeded once per user
// and gated by an app_settings flag so re-fetching never re-adds tags a
// user has since deleted.
const PREDEFINED_MOOD_TAGS = [
  "Annoyed", "Anxious", "Bored", "Calm", "Excited", "Grateful",
  "Happy", "In Love", "Indifferent", "Lonely", "Productive", "Sad",
  "Stressed", "Tired", "Angry", "Scared",
];

async function seedMoodTagsIfNeeded(): Promise<void> {
  const seeded = await getSetting(MOOD_TAGS_SEEDED_KEY);
  if (seeded) return;

  const userId = await getCurrentUserId();
  const results = await Promise.all(
    PREDEFINED_MOOD_TAGS.map((name, i) =>
      supabase
        .from("mood_tags")
        .insert({ user_id: userId, name, always_show: true, sort_order: i }),
    ),
  );
  // Supabase resolves (rather than rejects) with an `error` on failure, so a
  // failed insert wouldn't otherwise surface here. Unique-constraint
  // collisions (code 23505 — the tag already exists for this user, e.g. a
  // retry after a partial seed) are expected and fine to ignore; any other
  // error means the tag list may be incomplete, so don't mark it seeded and
  // let the next call retry.
  const hasUnexpectedError = results.some(
    ({ error }) => error && error.code !== "23505",
  );
  if (hasUnexpectedError) return;
  await setSetting(MOOD_TAGS_SEEDED_KEY, "1");
}

export async function getMoodTags(): Promise<MoodTag[]> {
  await seedMoodTagsIfNeeded();
  const { data, error } = await supabase
    .from("mood_tags")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data as MoodTag[];
}

// ── History ──────────────────────────────────────────────────────────

export interface StandaloneHistoryEntry {
  id: string;
  loggedAt: string;
  logType: PainMoodLogType;
  painLevel: number | null;
  moodLevel: number | null;
  note: string;
  tags: string[];
}

function toHistoryEntry(log: StandalonePainMoodLog): StandaloneHistoryEntry {
  return {
    id: log.id,
    loggedAt: log.logged_at,
    logType: log.log_type,
    painLevel: log.pain_level,
    moodLevel: log.mood_level,
    note: log.note,
    tags: log.tags ? log.tags.split(",").filter(Boolean) : [],
  };
}

// Adapted from rx-tracker-web's getStandaloneHistoryPoints, scoped to
// medicationId: null (dose-linked entries aren't reachable from this
// app's UI yet) and generalized to not split by metric column — this
// tab shows one merged pain+mood history rather than web's separate
// pain-tracking/mood-wellbeing pages, so an entry logged as "both" (or
// just "pain"/"mood") is returned whole rather than filtered per-metric.
export async function getStandaloneHistory(limit = 50): Promise<StandaloneHistoryEntry[]> {
  const { data, error } = await supabase
    .from("standalone_pain_mood_logs")
    .select("*")
    .is("medication_id", null)
    .order("logged_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as StandalonePainMoodLog[]).map(toHistoryEntry);
}
