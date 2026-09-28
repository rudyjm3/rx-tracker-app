// Ported subset of rx-tracker-web's lib/pain-mood.ts. Unlike web, which
// scopes dose-linked trend/history to one selected medication at a time,
// this app's Pain & Mood tab shows one merged pain+mood feed for the
// active profile, so getHistory/getTrend below resolve that profile's
// medication ids (active + inactive, so a discontinued medication's past
// feedback still shows) and pull dose-linked pain_level/mood_level
// entries across all of them, merged with standalone entries — see
// getDoseHistoryEntries/getDoseTrendPoints.
import { supabase } from "@/lib/supabase/client";
import { getActiveMedications, getCurrentUserId, getInactiveMedications } from "@/lib/medications";
import { getSetting, setSetting } from "@/lib/app-settings";
import { Brand } from "@/constants/theme";
import { localDateString } from "@/lib/utils";
import type { DoseLog, Medication, MoodTag, PainMoodLogType, StandalonePainMoodLog } from "@/lib/types/medications";

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
  profileId?: string | null;
}

export async function createStandaloneLog(input: CreateStandaloneLogInput): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("standalone_pain_mood_logs").insert({
    user_id: userId,
    medication_id: null,
    profile_id: input.profileId ?? null,
    log_type: input.logType,
    pain_level: input.painLevel ?? null,
    mood_level: input.moodLevel ?? null,
    note: input.note ?? "",
    tags: input.tags ?? "",
    logged_at: input.loggedAt ?? new Date().toISOString(),
  });
  if (error) throw error;
}

export interface UpdateStandaloneLogInput {
  logType: PainMoodLogType;
  painLevel?: number | null;
  moodLevel?: number | null;
  note?: string;
  tags?: string;
}

// Adapted from rx-tracker-web's updateStandaloneLog, scoped to this app's
// standalone (medication_id null) entries only — this app has no
// medication-attachment picker for a standalone log the way web's
// MedicationSelector does, so medication_id is never touched here.
export async function updateStandaloneLog(id: string, input: UpdateStandaloneLogInput): Promise<void> {
  const { error } = await supabase
    .from("standalone_pain_mood_logs")
    .update({
      log_type: input.logType,
      pain_level: input.painLevel ?? null,
      mood_level: input.moodLevel ?? null,
      note: input.note ?? "",
      tags: input.tags ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteStandaloneLog(id: string): Promise<void> {
  const { error } = await supabase.from("standalone_pain_mood_logs").delete().eq("id", id);
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

// Standalone logs serialize a mood entry's tags as a comma-joined string
// (see createStandaloneLog/toHistoryEntry), so a comma inside a tag's own
// name would split it into two tags on the way back out. Reject it here
// rather than at serialization time, since that's the only point a tag
// name is ever actually chosen.
function assertValidTagName(name: string): void {
  if (name.includes(",")) {
    throw new Error("Tag names can't contain commas.");
  }
}

export async function createMoodTag(name: string, alwaysShow = true): Promise<MoodTag> {
  assertValidTagName(name);
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("mood_tags")
    .insert({ user_id: userId, name, always_show: alwaysShow })
    .select()
    .single();
  if (error) throw error;
  return data as MoodTag;
}

export async function renameMoodTag(id: string, name: string): Promise<void> {
  assertValidTagName(name);
  const { error } = await supabase.from("mood_tags").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteMoodTag(id: string): Promise<void> {
  const { error } = await supabase.from("mood_tags").delete().eq("id", id);
  if (error) throw error;
}

export async function setMoodTagAlwaysShow(id: string, alwaysShow: boolean): Promise<void> {
  const { error } = await supabase
    .from("mood_tags")
    .update({ always_show: alwaysShow })
    .eq("id", id);
  if (error) throw error;
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
  // "standalone" entries (logged directly on this tab) can be edited/
  // deleted here via updateStandaloneLog/deleteStandaloneLog. "dose"
  // entries were captured through the "mark dose taken with feedback"
  // flow and are edited from a medication's own dose history instead
  // (History tab / medications/[id]'s dose history) — this tab shows them
  // read-only rather than duplicating that edit flow.
  source: "dose" | "standalone";
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
    source: "standalone",
  };
}

// dose_logs has no profile_id of its own (see lib/dose-logs.ts's
// getCalendarMarkers doc comment) — resolve the profile's medication ids
// first, the same way the calendar tab scopes dose_logs to a profile, so
// a dose-linked pain/mood entry logged against one of this profile's
// medications is reachable. Includes inactive (discontinued) medications
// too, since their past feedback is still real history for this profile.
async function resolveProfileMedicationIds(profileId?: string | null): Promise<string[]> {
  const [active, inactive] = await Promise.all([
    getActiveMedications(profileId),
    getInactiveMedications(profileId),
  ]);
  return [...active, ...inactive].map((m) => m.id);
}

function mapDoseLogToHistoryEntry(log: DoseLog): StandaloneHistoryEntry {
  return {
    id: log.id,
    // scheduled_for_date/scheduled_time are local calendar values, unlike
    // standalone logs' logged_at (a UTC instant that toHistoryEntry passes
    // through as-is) — the `new Date("...T...")` constructor below reads
    // a timezone-less datetime as local time, so this converts the pair to
    // the same real UTC instant standalone entries already store. Merging
    // the two lists by raw string comparison (below) or formatting them
    // (formatLoggedAt's own `new Date(iso)`) only sorts/displays correctly
    // if both loggedAt values are actual instants, not a naive local string
    // compared byte-for-byte against a real one.
    loggedAt: new Date(`${log.scheduled_for_date}T${log.scheduled_time.slice(0, 5)}:00`).toISOString(),
    logType: log.pain_level != null && log.mood_level != null ? "both" : log.mood_level != null ? "mood" : "pain",
    painLevel: log.pain_level,
    moodLevel: log.mood_level,
    note: log.note,
    tags: [], // dose_logs carries no mood-tag column, unlike standalone entries.
    source: "dose",
  };
}

// Most recent `limit` dose-linked pain/mood entries across a profile's
// medications (active + inactive) — analogous to rx-tracker-web's
// getDoseHistoryPoints, but not scoped to one medication since this tab
// merges every medication's feedback into a single feed.
async function getDoseHistoryEntries(medicationIds: string[], limit: number): Promise<StandaloneHistoryEntry[]> {
  if (medicationIds.length === 0) return [];
  const { data, error } = await supabase
    .from("dose_logs")
    .select("*")
    .in("medication_id", medicationIds)
    .or("pain_level.not.is.null,mood_level.not.is.null")
    .order("scheduled_for_date", { ascending: false })
    .order("scheduled_time", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as DoseLog[]).map(mapDoseLogToHistoryEntry);
}

// Merges dose-linked (via the profile's medications) and standalone
// entries into one recent-first feed, capped at `limit` overall —
// matches rx-tracker-web's getHistory, generalized to not split by
// metric column since this tab shows one merged pain+mood history rather
// than web's separate pain-tracking/mood-wellbeing pages.
export async function getHistory(limit = 50, profileId?: string | null): Promise<StandaloneHistoryEntry[]> {
  const medicationIds = await resolveProfileMedicationIds(profileId);
  let standaloneQuery = supabase
    .from("standalone_pain_mood_logs")
    .select("*")
    .is("medication_id", null)
    .order("logged_at", { ascending: false })
    .limit(limit);
  if (profileId !== undefined) {
    standaloneQuery =
      profileId === null ? standaloneQuery.is("profile_id", null) : standaloneQuery.eq("profile_id", profileId);
  }
  const [doseEntries, standaloneResult] = await Promise.all([
    getDoseHistoryEntries(medicationIds, limit),
    standaloneQuery,
  ]);
  if (standaloneResult.error) throw standaloneResult.error;
  const standaloneEntries = (standaloneResult.data as StandalonePainMoodLog[]).map(toHistoryEntry);
  return [...doseEntries, ...standaloneEntries]
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
    .slice(0, limit);
}

// ── Trend chart (date-range, ported from rx-tracker-web's TrendChart.tsx
// and lib/pain-mood.ts) ─────────────────────────────────────────────

export const RANGE_OPTIONS = [
  { label: "Today", days: 0 as const },
  { label: "7 days", days: 7 as const },
  { label: "30 days", days: 30 as const },
  { label: "90 days", days: 90 as const },
];
export type RangeDays = (typeof RANGE_OPTIONS)[number]["days"];

export function rangeDatesForDays(
  rangeDays: RangeDays,
  today: string,
): { start: string; end: string } {
  if (rangeDays === 0) return { start: today, end: today };
  const end = new Date(`${today}T00:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - (rangeDays - 1));
  return { start: localDateString(start), end: today };
}

export interface TrendPoint {
  id: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
  level: number;
}

function levelColumn(metric: WellbeingMetric): "pain_level" | "mood_level" {
  return metric === "pain" ? "pain_level" : "mood_level";
}

// logged_at is stored as a UTC instant (timestamptz); bucket it into the
// device's local date/time (matching localDateString/to12h elsewhere in
// this file) rather than splitting the raw ISO string, which would read
// off UTC components and misplace entries near local midnight for any
// user not on UTC.
function mapStandaloneLogToTrendPoint(
  log: StandalonePainMoodLog,
  col: "pain_level" | "mood_level",
): TrendPoint {
  const loggedAt = new Date(log.logged_at);
  const hours = String(loggedAt.getHours()).padStart(2, "0");
  const minutes = String(loggedAt.getMinutes()).padStart(2, "0");
  return {
    id: log.id,
    date: localDateString(loggedAt),
    time: `${hours}:${minutes}`,
    level: log[col] as number,
  };
}

// scheduled_for_date is already a local calendar date column (unlike
// standalone logs' logged_at, a UTC instant), so it's filtered directly
// against startDate/endDate with no timezone conversion — the same way
// lib/dose-logs.ts's getCalendarMarkers bounds dose_logs by month.
function mapDoseLogToTrendPoint(log: DoseLog, col: "pain_level" | "mood_level"): TrendPoint {
  return {
    id: log.id,
    date: log.scheduled_for_date,
    time: log.scheduled_time.slice(0, 5),
    level: log[col] as number,
  };
}

// Dose-linked trend points across a profile's medications (active +
// inactive) for one metric within a date range — analogous to
// rx-tracker-web's getDoseTrendPoints, but not scoped to one medication
// since this tab merges every medication's feedback into a single chart.
async function getDoseTrendPoints(
  metric: WellbeingMetric,
  medicationIds: string[],
  startDate: string,
  endDate: string,
): Promise<TrendPoint[]> {
  if (medicationIds.length === 0) return [];
  const col = levelColumn(metric);
  const { data, error } = await supabase
    .from("dose_logs")
    .select("*")
    .in("medication_id", medicationIds)
    .not(col, "is", null)
    .gte("scheduled_for_date", startDate)
    .lte("scheduled_for_date", endDate);
  if (error) throw error;
  return (data as DoseLog[]).map((log) => mapDoseLogToTrendPoint(log, col));
}

async function getStandaloneTrendPoints(
  metric: WellbeingMetric,
  startDate: string,
  endDate: string,
  profileId?: string | null,
): Promise<TrendPoint[]> {
  const col = levelColumn(metric);
  // startDate/endDate are local calendar dates — convert their local
  // midnight/end-of-day boundaries to UTC instants before querying, so the
  // range matches what the user sees as "today"/"the last N days" rather
  // than UTC's version of those dates.
  const startIso = new Date(`${startDate}T00:00:00`).toISOString();
  const endIso = new Date(`${endDate}T23:59:59.999`).toISOString();
  let query = supabase
    .from("standalone_pain_mood_logs")
    .select("*")
    .is("medication_id", null)
    .gte("logged_at", startIso)
    .lte("logged_at", endIso);
  if (profileId !== undefined) {
    query = profileId === null ? query.is("profile_id", null) : query.eq("profile_id", profileId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as StandalonePainMoodLog[])
    .filter((log) => log[col] !== null)
    .map((log) => mapStandaloneLogToTrendPoint(log, col));
}

// Merges dose-linked (via the profile's medications) and standalone trend
// points for one metric within a date range, chronologically sorted —
// matches rx-tracker-web's getTrend.
export async function getTrend(
  metric: WellbeingMetric,
  startDate: string,
  endDate: string,
  profileId?: string | null,
): Promise<TrendPoint[]> {
  const medicationIds = await resolveProfileMedicationIds(profileId);
  const [dosePoints, standalonePoints] = await Promise.all([
    getDoseTrendPoints(metric, medicationIds, startDate, endDate),
    getStandaloneTrendPoints(metric, startDate, endDate, profileId),
  ]);
  return [...dosePoints, ...standalonePoints].sort((a, b) =>
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
  );
}

export interface DailyAverage {
  date: string;
  level: number;
}

/**
 * Groups trend points into one averaged level per date, sorted
 * chronologically — the multi-day view's data shape, matching
 * rx-tracker-web's groupDailyAverages.
 */
export function groupDailyAverages(points: TrendPoint[]): DailyAverage[] {
  const byDate = new Map<string, { sum: number; count: number }>();
  for (const p of points) {
    const acc = byDate.get(p.date) ?? { sum: 0, count: 0 };
    acc.sum += p.level;
    acc.count += 1;
    byDate.set(p.date, acc);
  }
  return Array.from(byDate.entries())
    .map(([date, { sum, count }]) => ({ date, level: sum / count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
