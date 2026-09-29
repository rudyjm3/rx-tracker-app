// Local (on-device) medication reminder scheduling via expo-notifications.
// This is LOCAL scheduling only — no Expo push token is ever requested or
// registered (that needs an eas.projectId this app doesn't have yet; see
// AGENTS.md/task notes). Nothing here touches the `push_subscriptions`
// table, which is a separate, web-only device-list feature.
//
// The "which times get a reminder" math intentionally reuses the same
// interval/fixed_times phase computation as generateDaySlots in
// lib/schedule.ts (`minutes = timeToMinutes(anchor) % stepMinutes`, then
// walk forward by the interval through the 24h day) so the two features
// never disagree about what a medication's daily times are.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Vibration } from "react-native";
import { createAudioPlayer } from "expo-audio";

import { getTodayLogs, getTodayPostpones } from "@/lib/dose-logs";
import { getAllActiveMedicationsAcrossProfiles } from "@/lib/medications";
import { localDateString, timeToMinutes } from "@/lib/utils";
import type { DoseLog, DosePostpone, Medication } from "@/lib/types/medications";

// This preference is intentionally per-device local storage (AsyncStorage),
// NOT the Supabase-backed app_settings get/setSetting helpers used
// elsewhere in this app. Reminders are scheduled with the OS notification
// service on *this* device, so whether they're on has to be a per-device
// fact: an account-wide (Supabase-synced) boolean would mean toggling
// reminders on one phone silently flips them on/off on every other phone
// signed into the same account, without that device's user ever tapping
// the switch or granting notification permission there.
const LOCAL_REMINDERS_ENABLED_KEY = "local_reminders_enabled";

export async function getRemindersEnabledSetting(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(LOCAL_REMINDERS_ENABLED_KEY);
    return value === "1";
  } catch {
    return false;
  }
}

export async function setRemindersEnabledSetting(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(LOCAL_REMINDERS_ENABLED_KEY, enabled ? "1" : "0");
}

// ── In-app "dose due" alarm: sound + vibration ──────────────────────
//
// Port of rx-tracker-web's lib/notifications.ts alarm sound/vibration
// toggles — like the reminders-enabled setting above, these are per-device
// local storage rather than the Supabase-backed app_settings helpers,
// matching web's own per-device (localStorage) scope for the same
// preference. Unlike web, which synthesizes its two-tone beep with the Web
// Audio API (no bundled asset, chosen there to avoid a binary file in that
// repo), this app has no oscillator API available and instead bundles a
// short generated WAV of the same two 880Hz tone bursts — still an
// originally-generated sound, not a licensed asset.
const ALARM_SOUND_KEY = "alarm_sound_enabled";
const VIBRATION_KEY = "vibration_enabled";

async function readToggle(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    // Both toggles default ON (matching web) — a broken/missing read
    // shouldn't silently mute a dose-due alarm.
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

async function writeToggle(key: string, enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(key, enabled ? "1" : "0");
}

export async function isAlarmSoundEnabled(): Promise<boolean> {
  return readToggle(ALARM_SOUND_KEY);
}

export async function setAlarmSoundEnabled(enabled: boolean): Promise<void> {
  await writeToggle(ALARM_SOUND_KEY, enabled);
}

export async function isVibrationEnabled(): Promise<boolean> {
  return readToggle(VIBRATION_KEY);
}

export async function setVibrationEnabled(enabled: boolean): Promise<void> {
  await writeToggle(VIBRATION_KEY, enabled);
}

// Fire-and-forget: creates a short-lived imperative player (createAudioPlayer,
// not the useAudioPlayer hook — this is called from plain event-driven code,
// not component render) and releases it once playback finishes, so repeated
// alarms across a session don't leak players. Best-effort — a device that
// can't play audio right now (e.g. mid-call) just means no sound this time,
// same failure posture as web's tone() catch.
function tone(): void {
  try {
    const player = createAudioPlayer(require("../../assets/sounds/alarm.wav"));
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (!status.didJustFinish) return;
      subscription.remove();
      player.remove();
    });
    player.play();
  } catch {
    // Best-effort — see above.
  }
}

// [200, 100, 200]ms matches web's navigator.vibrate([200, 100, 200]) pattern
// (buzz, pause, buzz) exactly — RN's Vibration.vibrate takes the same
// vibrate-pause-vibrate-... array shape navigator.vibrate does.
function vibrateOnce(): void {
  Vibration.vibrate([200, 100, 200]);
}

export async function playAlarmSound(): Promise<void> {
  if (await isAlarmSoundEnabled()) tone();
}

export async function triggerVibration(): Promise<void> {
  if (await isVibrationEnabled()) vibrateOnce();
}

// Bypasses both toggles — lets the Settings screen's "Test alarm" button
// preview sound/vibration even while deciding whether to turn them on.
export function previewAlarm(): void {
  tone();
  vibrateOnce();
}

export interface ReminderTime {
  medicationId: string;
  medicationName: string;
  dose: string;
  time: string; // "HH:MM", 24h
}

// Every module-level use of expo-notifications is behind this guard (and
// callers additionally wrap in try/catch) — this app also ships a static
// web build (web.output: "static" in app.json) where the native
// notifications module doesn't exist at all, so importing or calling into
// it must never run, let alone throw, on web/SSR.
const isNotificationsSupported = Platform.OS !== "web";
let notificationsModule: typeof import("expo-notifications") | null | undefined;

// Lazily require expo-notifications only on native platforms. A static
// top-level `import * as Notifications from "expo-notifications"` would
// still be fine at import-time on web (Metro/web just resolves the JS
// shim), but every *call* into it is guarded below regardless.
function getNotificationsModule(): typeof import("expo-notifications") | null {
  if (!isNotificationsSupported) return null;
  if (notificationsModule !== undefined) return notificationsModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notificationsModule = require("expo-notifications") as typeof import("expo-notifications");
  } catch (e) {
    notificationsModule = null;
    console.warn("expo-notifications is unavailable in this runtime", e);
  }

  return notificationsModule;
}

/**
 * Computes the set of daily local reminder times for a list of active
 * medications, mirroring generateDaySlots' schedule math but scoped to
 * only what should ever produce a device notification:
 *   - active (caller passes getAllActiveMedicationsAcrossProfiles(), so
 *     always true)
 *   - reminders_enabled
 *   - dashboard_enabled
 *   - NOT as_needed (PRN meds are deferred scope — a PRN dose has no fixed
 *     time to remind about, so it's intentionally skipped here; the web
 *     app's PRN handling doesn't apply to on-device scheduled reminders)
 *   - start_date/end_date cover "today" (same string comparison
 *     generateDaySlots uses against a rendered day's date), so a
 *     future-dated course doesn't start reminding early and a completed
 *     course doesn't keep reminding after its end_date.
 *
 * A local DAILY trigger just repeats forever once scheduled — there's no
 * "expire this trigger on date X" primitive — so a medication that crosses
 * out of its start/end window still gets cleaned up by the next resync
 * (sign-in, app foreground, or a medication edit) rather than instantly,
 * but it's never scheduled fresh while out of range.
 */
export function computeReminderTimes(
  medications: Medication[],
  today: string = localDateString(),
): ReminderTime[] {
  const reminders: ReminderTime[] = [];

  for (const med of medications) {
    if (!med.active) continue;
    if (!med.reminders_enabled) continue;
    if (!med.dashboard_enabled) continue;
    if (med.as_needed) continue;
    if (med.start_date && today < med.start_date) continue;
    if (med.end_date && today > med.end_date) continue;

    const times = new Set<string>();

    if (med.schedule_mode === "fixed_times") {
      for (const st of med.medication_schedule_times ?? []) {
        times.add(st.reminder_time.slice(0, 5));
      }
    } else if (med.schedule_mode === "interval" && med.interval_hours && med.first_dose_time) {
      const stepMinutes = med.interval_hours * 60;
      // Same phase-based walk as generateDaySlots: start from the anchor's
      // phase within a 24h day rather than its literal clock time, so an
      // anchor after midnight (e.g. every-8h from 20:00) still yields the
      // full day's cycle (04:00, 12:00, 20:00) rather than just the tail.
      let minutes = timeToMinutes(med.first_dose_time.slice(0, 5)) % stepMinutes;
      while (minutes < 24 * 60) {
        const h = String(Math.floor(minutes / 60)).padStart(2, "0");
        const m = String(minutes % 60).padStart(2, "0");
        times.add(`${h}:${m}`);
        minutes += stepMinutes;
      }
    }

    for (const time of times) {
      reminders.push({
        medicationId: med.id,
        medicationName: med.name,
        dose: med.dose,
        time,
      });
    }
  }

  return reminders;
}

function notificationContent(reminder: ReminderTime) {
  const [hourStr, minuteStr] = reminder.time.split(":");
  const hour = parseInt(hourStr, 10);
  const displayHour = hour % 12 || 12;
  const period = hour >= 12 ? "PM" : "AM";
  const displayTime = `${displayHour}:${minuteStr} ${period}`;

  const title = reminder.dose ? `${reminder.medicationName} (${reminder.dose})` : reminder.medicationName;

  return {
    title,
    body: `Time for your ${displayTime} dose`,
    data: { medicationId: reminder.medicationId, scheduledTime: reminder.time },
  };
}

/**
 * Cancels every previously scheduled local reminder notification and
 * reschedules fresh ones from the current medication list and today's
 * actual dose state — the same recompute-the-whole-thing-atomically
 * pattern generateDaySlots uses for "today's doses", applied here to
 * "what's currently scheduled on the device". Safe to call repeatedly
 * (sign-in, app foreground, after any medication create/update/
 * discontinue/reactivate, and after a Take/Skip/Snooze).
 *
 * Each of today's occurrences is checked against today's dose_logs and
 * dose_postpones before scheduling, so the device notification agrees
 * with what the Dashboard shows for that occurrence right now:
 *   - already taken/skipped today → suppress today's ping, but schedule
 *     a one-shot DATE trigger for tomorrow's occurrence of the same
 *     time instead of the normal recurring one — a single recurring
 *     DAILY trigger is the only primitive for "this time, every day",
 *     so dropping it entirely to silence today would also silence every
 *     future day until the next resync (app foreground/launch) happens
 *     to run before tomorrow's time arrives.
 *   - snoozed and still pending → a one-shot DATE trigger at the
 *     postponed time, replacing the normal recurring one for today.
 *   - snoozed but the postponed time already passed → skip (missed).
 *   - otherwise → the normal recurring DAILY trigger, unchanged.
 * There's no persisted "this occurrence was resynced" state: the next
 * resync just re-reads dose_logs/dose_postpones, and since
 * getTodayLogs/getTodayPostpones are date-scoped, today's resolution
 * stops matching on its own once today is no longer today — any resync
 * from tomorrow onward falls through to the normal recurring case,
 * which is what the one-shot above bridges the gap until.
 *
 * No-ops (never throws) on web or if anything in expo-notifications
 * fails, since a resync should never crash app launch or a save flow.
 */
export async function resyncReminderNotifications(): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    await Notifications.cancelAllScheduledNotificationsAsync();

    const today = localDateString();
    const [medications, todayLogs, todayPostpones] = await Promise.all([
      getAllActiveMedicationsAcrossProfiles(),
      getTodayLogs(today),
      getTodayPostpones(today),
    ]);
    const reminders = computeReminderTimes(medications, today);
    const medicationsById = new Map(medications.map((med) => [med.id, med]));

    const logsByKey = new Map<string, DoseLog>();
    for (const log of todayLogs) {
      logsByKey.set(`${log.medication_id}|${log.scheduled_time.slice(0, 5)}`, log);
    }
    const postponeByKey = new Map<string, DosePostpone>();
    for (const postpone of todayPostpones) {
      postponeByKey.set(`${postpone.medication_id}|${postpone.scheduled_time.slice(0, 5)}`, postpone);
    }

    for (const reminder of reminders) {
      const key = `${reminder.medicationId}|${reminder.time}`;
      const log = logsByKey.get(key);
      const content = notificationContent(reminder);

      if (log && (log.status === "taken" || log.status === "skipped")) {
        const tomorrow = new Date(`${today}T${reminder.time}`);
        tomorrow.setDate(tomorrow.getDate() + 1);
        // Skip the bridging one-shot if the medication's course ends before
        // tomorrow — otherwise a dose taken on the last day of a course
        // would still ping once more the next day.
        const med = medicationsById.get(reminder.medicationId);
        const tomorrowStr = localDateString(tomorrow);
        if (med?.end_date && tomorrowStr > med.end_date) continue;

        await Notifications.scheduleNotificationAsync({
          content,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: tomorrow.getTime() },
        });
        continue;
      }

      const postpone = postponeByKey.get(key);
      if (postpone) {
        const postponedUntilMs = new Date(postpone.postponed_until).getTime();
        if (postponedUntilMs <= Date.now()) continue;

        await Notifications.scheduleNotificationAsync({
          content,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: postponedUntilMs },
        });
        continue;
      }

      const [hourStr, minuteStr] = reminder.time.split(":");
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: parseInt(hourStr, 10),
          minute: parseInt(minuteStr, 10),
        },
      });
    }
  } catch (e) {
    console.warn("resyncReminderNotifications failed", e);
  }
}

export type PermissionRequestResult = "granted" | "denied" | "unsupported";

/**
 * Requests notification permission (creating the Android notification
 * channel first, required on Android 13+ before the OS will show the
 * runtime POST_NOTIFICATIONS prompt) and returns a simple tri-state result
 * instead of the raw SDK status object, since callers (the Settings
 * screen) only need to branch on granted/denied/unsupported(web).
 */
export async function requestReminderPermissions(): Promise<PermissionRequestResult> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return "unsupported";

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("medication-reminders", {
        name: "Medication reminders",
        importance: Notifications.AndroidImportance.MAX,
      });
    }
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted" ? "granted" : "denied";
  } catch (e) {
    console.warn("requestReminderPermissions failed", e);
    return "denied";
  }
}

/**
 * Registers the tap/response listener (fires when the user taps a
 * delivered notification) and returns an unsubscribe function. No-ops on
 * web. Intended to be called once from the root layout.
 */
export function addNotificationResponseListener(
  onResponse: (data: { medicationId?: string; scheduledTime?: string }) => void,
): () => void {
  const Notifications = getNotificationsModule();
  if (!Notifications) return () => {};

  try {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { medicationId?: string; scheduledTime?: string }
        | undefined;
      if (data) onResponse(data);
    });
    return () => subscription.remove();
  } catch (e) {
    console.warn("addNotificationResponseListener failed", e);
    return () => {};
  }
}

/** Runs resync only if the persisted local_reminders_enabled preference is on. */
export async function resyncIfRemindersEnabled(): Promise<void> {
  try {
    const enabled = await getRemindersEnabledSetting();
    if (!enabled) return;
    await resyncReminderNotifications();
  } catch (e) {
    console.warn("resyncIfRemindersEnabled failed", e);
  }
}

/** Cancels all scheduled local reminders (e.g. when the user turns the setting off). */
export async function cancelAllReminderNotifications(): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn("cancelAllReminderNotifications failed", e);
  }
}
