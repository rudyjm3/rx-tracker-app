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
import { isRunningInExpoGo } from "expo";

import { getTodayLogs, getTodayPostpones } from "@/lib/dose-logs";
import { getAllActiveGroups, getAllActiveMedicationsAcrossProfiles, getGroupMembers } from "@/lib/medications";
import { localDateString, timeToMinutes } from "@/lib/utils";
import type { DoseLog, DosePostpone, Medication, MedicationGroup } from "@/lib/types/medications";

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

// ── Alarm playback ──────────────────────────────────────────────────
//
// The due-now alarm LOOPS until stopAlarm() (Take/Skip/Snooze closes the
// overlay) instead of beeping once. A safety timeout stops it if nobody
// answers, so a forgotten phone doesn't ring forever.
//
// Volume: expo-audio plays on Android's MEDIA stream (no alarm-usage option),
// so the in-app player follows the media volume slider. Whenever device
// reminders are active on Android, the alarm is therefore delivered by the
// scheduled notification itself, whose channel uses ALARM audio usage and so
// follows the phone's *alarm* volume (see ensureAlarmChannel). The expo-audio
// loop is only the fallback when reminders are off / unsupported.
const ALARM_MAX_RING_MS = 5 * 60_000;

let alarmPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let alarmStopTimer: ReturnType<typeof setTimeout> | null = null;

function startLoopingSound(): void {
  if (alarmPlayer) return;
  try {
    const player = createAudioPlayer(require("../../assets/sounds/alarm.wav"));
    player.loop = true;
    player.volume = 1;
    player.play();
    alarmPlayer = player;
  } catch {
    // Best-effort — a device that can't play audio right now just stays silent.
  }
}

// [0 wait, 600 buzz, 400 pause] repeated (repeat index 0 = loop from start).
const VIBRATION_LOOP_PATTERN = [0, 600, 400];

async function notificationsDeliverAlarm(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const Notifications = getNotificationsModule();
  if (!Notifications) return false;
  try {
    if (!(await getRemindersEnabledSetting())) return false;
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/** Starts the looping alarm (sound + vibration, per the user's toggles). Idempotent. */
export async function startAlarm(): Promise<void> {
  if (alarmStopTimer) return; // already ringing
  alarmStopTimer = setTimeout(stopAlarm, ALARM_MAX_RING_MS);
  const [sound, vibration, viaNotification] = await Promise.all([
    isAlarmSoundEnabled(),
    isVibrationEnabled(),
    notificationsDeliverAlarm(),
  ]);
  if (!alarmStopTimer) return; // stopped while we were checking settings
  if (vibration) Vibration.vibrate(VIBRATION_LOOP_PATTERN, true);
  if (sound && !viaNotification) startLoopingSound();
}

export function stopAlarm(): void {
  if (alarmStopTimer) {
    clearTimeout(alarmStopTimer);
    alarmStopTimer = null;
  }
  Vibration.cancel();
  if (alarmPlayer) {
    try {
      alarmPlayer.pause();
      alarmPlayer.remove();
    } catch {
      // Already released.
    }
    alarmPlayer = null;
  }
  // Answering the dose in-app also silences a notification alarm that is
  // still ringing (removing a notification stops its sound).
  const Notifications = getNotificationsModule();
  Notifications?.dismissAllNotificationsAsync().catch(() => {});
}

/**
 * Settings "Test alarm": bypasses both toggles. On Android with permission it
 * posts a real notification through the alarm channel, so the user hears
 * exactly what a dose reminder sounds like (at alarm volume) and learns
 * whether notifications work at all; otherwise a short in-app preview.
 */
export async function previewAlarm(): Promise<void> {
  const Notifications = getNotificationsModule();
  if (Notifications && Platform.OS === "android") {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") {
        await ensureAlarmChannel();
        await Notifications.scheduleNotificationAsync({
          content: { title: "Test alarm", body: "This is how a dose reminder sounds.", sound: ALARM_SOUND_FILE },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: ALARM_CHANNEL_ID },
        });
        Vibration.vibrate([200, 100, 200]);
        return;
      }
    } catch (e) {
      console.warn("previewAlarm notification failed", e);
    }
  }
  startLoopingSound();
  Vibration.vibrate([200, 100, 200]);
  setTimeout(stopAlarm, 3000);
}

export interface ReminderTime {
  medicationId: string;
  medicationName: string;
  dose: string;
  time: string; // "HH:MM", 24h
  // Set when the dose belongs to an active group at this time — grouped doses
  // get ONE notification per group/time, like the dashboard's group card.
  groupId?: string | null;
}

// Every module-level use of expo-notifications is behind this guard (and
// callers additionally wrap in try/catch) — this app also ships a static
// web build (web.output: "static" in app.json) where the native
// notifications module doesn't exist at all, so importing or calling into
// it must never run, let alone throw, on web/SSR.
//
// Android Expo Go (SDK 53+) also can't load expo-notifications: merely
// requiring it logs an uncaught error, so skip it there and use a
// development build (`npx expo run:android` / EAS) to get reminders.
const isExpoGo = isRunningInExpoGo();
const isNotificationsSupported = Platform.OS !== "web" && !(Platform.OS === "android" && isExpoGo);
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
  groups: MedicationGroup[] = [],
  groupMembers: { group_id: string; medication_id: string }[] = [],
): ReminderTime[] {
  const reminders: ReminderTime[] = [];
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const groupsByMedication = new Map<string, MedicationGroup[]>();
  for (const member of groupMembers) {
    const group = groupsById.get(member.group_id);
    if (!group) continue;
    const list = groupsByMedication.get(member.medication_id) ?? [];
    list.push(group);
    groupsByMedication.set(member.medication_id, list);
  }

  for (const med of medications) {
    if (!med.active) continue;
    if (!med.reminders_enabled) continue;
    if (!med.dashboard_enabled) continue;
    if (med.as_needed) continue;
    if (med.start_date && today < med.start_date) continue;
    if (med.end_date && today > med.end_date) continue;

    // time -> groupId (or null): the same schedule math as before, now
    // remembering which active group (if any) owns each occurrence.
    const times = new Map<string, string | null>();

    if (med.schedule_mode === "fixed_times") {
      for (const st of med.medication_schedule_times ?? []) {
        times.set(st.reminder_time.slice(0, 5), st.group_id && groupsById.has(st.group_id) ? st.group_id : null);
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
        const time = `${h}:${m}`;
        const matched = (groupsByMedication.get(med.id) ?? []).find((g) => g.scheduled_time.slice(0, 5) === time);
        times.set(time, matched ? matched.id : null);
        minutes += stepMinutes;
      }
    }

    for (const [time, groupId] of times) {
      reminders.push({
        medicationId: med.id,
        medicationName: med.name,
        dose: med.dose,
        time,
        groupId,
      });
    }
  }

  return reminders;
}

function formatReminderTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr, 10);
  return `${hour % 12 || 12}:${minuteStr} ${hour >= 12 ? "PM" : "AM"}`;
}

// A reminder "item" is one notification: every member of a group at a time,
// or a single ungrouped medication.
interface ReminderItem {
  key: string;
  groupName: string | null;
  time: string;
  members: ReminderTime[];
}

function notificationContent(item: ReminderItem, members: ReminderTime[], snoozed: boolean) {
  const displayTime = formatReminderTime(item.time);
  const first = members[0];
  let title: string;
  let body: string;
  if (item.groupName) {
    title = item.groupName;
    const names = members.map((m) => m.medicationName);
    body = `${snoozed ? "Snoozed — time" : "Time"} for your ${displayTime} dose: ${names.join(", ")}`;
  } else {
    title = first.dose ? `${first.medicationName} (${first.dose})` : first.medicationName;
    body = `${snoozed ? "Snoozed — time" : "Time"} for your ${displayTime} dose`;
  }

  return {
    title,
    body,
    sound: ALARM_SOUND_FILE,
    priority: "max" as const,
    data: { medicationId: first.medicationId, scheduledTime: item.time, groupId: item.key.startsWith("g|") ? item.key.split("|")[1] : null },
  };
}

// ── Android notification channel ────────────────────────────────────
//
// Reminders used to be scheduled with no channelId, so Android delivered them
// on a generic default channel (no custom sound, ordinary notification
// volume, easy to miss — or dropped to the silent list). This channel is
// MAX importance, plays the bundled alarm sound, and uses ALARM audio usage
// so it follows the device's *alarm* volume rather than media/notification
// volume. Channel settings are immutable once created, so any change to them
// needs a new id plus removing the old one.
const ALARM_CHANNEL_ID = "dose-alarm";
const LEGACY_CHANNEL_IDS = ["medication-reminders"];
const ALARM_SOUND_FILE = "alarm.wav"; // registered in app.json via the expo-notifications plugin `sounds`

async function ensureAlarmChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  for (const id of LEGACY_CHANNEL_IDS) {
    try {
      await Notifications.deleteNotificationChannelAsync(id);
    } catch {
      // Already gone.
    }
  }
  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
    name: "Medication alarms",
    description: "Dose-due alarms. Plays at the alarm volume.",
    importance: Notifications.AndroidImportance.MAX,
    sound: ALARM_SOUND_FILE,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
    vibrationPattern: [0, 600, 400, 600, 400, 600],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
}

/**
 * While the app is in the foreground the OS would otherwise silently swallow
 * a delivered notification (no handler = nothing shown). On Android we let it
 * show and ring on the alarm channel (alarm volume) — unless the user turned
 * the alarm sound off, in which case the in-app overlay is enough. On iOS the
 * in-app overlay + looping alarm handle the foreground. Call once at startup.
 */
export function configureNotificationHandler(): void {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => {
        const ring = Platform.OS === "android" && (await isAlarmSoundEnabled());
        return {
          shouldShowBanner: ring,
          shouldShowList: ring,
          shouldPlaySound: ring,
          shouldSetBadge: false,
        };
      },
    });
  } catch (e) {
    console.warn("configureNotificationHandler failed", e);
  }
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
 * Doses in an active group share ONE notification per group/time (matching
 * the dashboard's group card) instead of one per medication. Each item is
 * checked against today's dose_logs and dose_postpones so the device agrees
 * with the Dashboard:
 *   - every member taken/skipped today → suppress today's ping, but
 *     schedule a one-shot DATE trigger for tomorrow's occurrence instead of
 *     the recurring one (a recurring DAILY trigger is the only primitive for
 *     "this time, every day", so dropping it to silence today would also
 *     silence every future day until the next resync).
 *   - pending members that were snoozed → a one-shot DATE trigger at the
 *     shared postponed time. Because today's recurring ping is consumed by
 *     that, tomorrow's occurrence is bridged with a one-shot too (a snooze
 *     used to leave tomorrow unscheduled until the next app launch).
 *   - snoozed but the postponed time already passed → skip (missed).
 *   - pending members that were not snoozed → the normal recurring DAILY
 *     trigger.
 * There's no persisted "this occurrence was resynced" state: the next
 * resync just re-reads dose_logs/dose_postpones, and since
 * getTodayLogs/getTodayPostpones are date-scoped, today's resolution
 * stops matching on its own once today is no longer today.
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

    await ensureAlarmChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();

    const today = localDateString();
    const [medications, groups, groupMembers, todayLogs, todayPostpones] = await Promise.all([
      getAllActiveMedicationsAcrossProfiles(),
      getAllActiveGroups(),
      getGroupMembers(),
      getTodayLogs(today),
      getTodayPostpones(today),
    ]);
    const reminders = computeReminderTimes(medications, today, groups, groupMembers);
    const medicationsById = new Map(medications.map((med) => [med.id, med]));
    const groupsById = new Map(groups.map((g) => [g.id, g]));

    const logsByKey = new Map<string, DoseLog>();
    for (const log of todayLogs) {
      logsByKey.set(`${log.medication_id}|${log.scheduled_time.slice(0, 5)}`, log);
    }
    const postponeByKey = new Map<string, DosePostpone>();
    for (const postpone of todayPostpones) {
      postponeByKey.set(`${postpone.medication_id}|${postpone.scheduled_time.slice(0, 5)}`, postpone);
    }

    const items = new Map<string, ReminderItem>();
    for (const reminder of reminders) {
      const group = reminder.groupId ? groupsById.get(reminder.groupId) : undefined;
      const key = group ? `g|${group.id}|${reminder.time}` : `m|${reminder.medicationId}|${reminder.time}`;
      const item = items.get(key) ?? { key, groupName: group ? group.name : null, time: reminder.time, members: [] };
      item.members.push(reminder);
      items.set(key, item);
    }

    const channelId = ALARM_CHANNEL_ID;
    const DATE = Notifications.SchedulableTriggerInputTypes.DATE;

    for (const item of items.values()) {
      const [hourStr, minuteStr] = item.time.split(":");

      // Tomorrow's occurrence as a one-shot, skipped once every member's
      // course has ended by then.
      const tomorrow = new Date(`${today}T${item.time}`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = localDateString(tomorrow);
      const scheduleTomorrow = async () => {
        const live = item.members.filter((m) => {
          const end = medicationsById.get(m.medicationId)?.end_date;
          return !end || tomorrowStr <= end;
        });
        if (live.length === 0) return;
        await Notifications.scheduleNotificationAsync({
          content: notificationContent(item, live, false),
          trigger: { type: DATE, date: tomorrow.getTime(), channelId },
        });
      };

      const pending = item.members.filter((m) => {
        const log = logsByKey.get(`${m.medicationId}|${m.time}`);
        return !(log && (log.status === "taken" || log.status === "skipped"));
      });

      if (pending.length === 0) {
        await scheduleTomorrow();
        continue;
      }

      // Bucket the pending members by their snooze instant so members snoozed
      // together stay one notification.
      const unsnoozed: ReminderTime[] = [];
      const snoozedBuckets = new Map<number, ReminderTime[]>();
      for (const m of pending) {
        const postpone = postponeByKey.get(`${m.medicationId}|${m.time}`);
        if (!postpone) {
          unsnoozed.push(m);
          continue;
        }
        const ms = new Date(postpone.postponed_until).getTime();
        snoozedBuckets.set(ms, [...(snoozedBuckets.get(ms) ?? []), m]);
      }

      for (const [ms, members] of snoozedBuckets) {
        if (ms <= Date.now()) continue; // postponed time already passed (missed)
        await Notifications.scheduleNotificationAsync({
          content: notificationContent(item, members, true),
          trigger: { type: DATE, date: ms, channelId },
        });
      }

      if (unsnoozed.length > 0) {
        await Notifications.scheduleNotificationAsync({
          content: notificationContent(item, item.members, false),
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: parseInt(hourStr, 10),
            minute: parseInt(minuteStr, 10),
            channelId,
          },
        });
      } else {
        await scheduleTomorrow();
      }
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
    await ensureAlarmChannel();
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
  onResponse: (data: { medicationId?: string; scheduledTime?: string; groupId?: string | null }) => void,
): () => void {
  const Notifications = getNotificationsModule();
  if (!Notifications) return () => {};

  try {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { medicationId?: string; scheduledTime?: string; groupId?: string | null }
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
