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
import { Platform } from "react-native";

import { getAllActiveMedicationsAcrossProfiles } from "@/lib/medications";
import { localDateString, timeToMinutes } from "@/lib/utils";
import type { Medication } from "@/lib/types/medications";

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

// Lazily require expo-notifications only on native platforms. A static
// top-level `import * as Notifications from "expo-notifications"` would
// still be fine at import-time on web (Metro/web just resolves the JS
// shim), but every *call* into it is guarded below regardless.
function getNotificationsModule(): typeof import("expo-notifications") | null {
  if (!isNotificationsSupported) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-notifications") as typeof import("expo-notifications");
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
 * reschedules fresh ones from the current medication list — the same
 * recompute-the-whole-thing-atomically pattern generateDaySlots uses for
 * "today's doses", applied here to "what's currently scheduled on the
 * device". Safe to call repeatedly (sign-in, app foreground, after any
 * medication create/update/discontinue/reactivate).
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

    const medications = await getAllActiveMedicationsAcrossProfiles();
    const reminders = computeReminderTimes(medications);

    for (const reminder of reminders) {
      const [hourStr, minuteStr] = reminder.time.split(":");
      const content = notificationContent(reminder);
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
