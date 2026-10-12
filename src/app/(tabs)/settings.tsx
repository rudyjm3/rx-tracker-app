import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Linking, Platform, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { SwitchRow } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/field';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Screen } from '@/components/ui/screen';
import { PanelTitle, ScreenTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
import {
  browserTimezone,
  getMissedGraceMinutes,
  getMoodChartScheme,
  getSnoozeMinutes,
  getUseDeviceTimezone,
  MISSED_GRACE_MAX_MINUTES,
  MISSED_GRACE_MIN_MINUTES,
  setMissedGraceMinutes,
  setMoodChartScheme,
  setSnoozeMinutes,
  setUseDeviceTimezone,
  type MoodChartScheme,
} from '@/lib/app-settings';
import {
  cancelAllReminderNotifications,
  getRemindersEnabledSetting,
  isAlarmSoundEnabled,
  isVibrationEnabled,
  previewAlarm,
  requestReminderPermissions,
  resyncReminderNotifications,
  setAlarmSoundEnabled,
  setRemindersEnabledSetting,
  setVibrationEnabled,
} from '@/lib/notifications';
import { SNOOZE_OPTIONS } from '@/lib/schedule';
import { useAuth } from '@/lib/supabase/AuthProvider';

export default function SettingsScreen() {
  const { session, signOut } = useAuth();

  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [loadingSetting, setLoadingSetting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deviceTimezone = browserTimezone();
  const [graceMinutesInput, setGraceMinutesInput] = useState('');
  const [graceError, setGraceError] = useState<string | null>(null);
  const [snoozeMinutes, setSnoozeMinutesState] = useState<number | null>(null);
  const [useDeviceTimezone, setUseDeviceTimezoneState] = useState(true);
  const [moodChartScheme, setMoodChartSchemeState] = useState<MoodChartScheme>('classic');
  const [moodSchemeError, setMoodSchemeError] = useState<string | null>(null);
  const [alarmSoundEnabled, setAlarmSoundEnabledState] = useState(true);
  const [vibrationEnabled, setVibrationEnabledState] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const enabled = await getRemindersEnabledSetting();
        if (!cancelled) setRemindersEnabled(enabled);
      } catch {
        // If we can't read the setting yet (e.g. no session), default off.
      } finally {
        if (!cancelled) setLoadingSetting(false);
      }
    })();
    // Device-local (AsyncStorage), same as remindersEnabled above — not
    // gated on a session, so loaded in their own block rather than the
    // Supabase-backed settings' Promise.all below.
    (async () => {
      const [sound, vibration] = await Promise.all([isAlarmSoundEnabled(), isVibrationEnabled()]);
      if (cancelled) return;
      setAlarmSoundEnabledState(sound);
      setVibrationEnabledState(vibration);
    })();
    (async () => {
      try {
        const [grace, snooze, useDevice, moodScheme] = await Promise.all([
          getMissedGraceMinutes(),
          getSnoozeMinutes(),
          getUseDeviceTimezone(),
          getMoodChartScheme(),
        ]);
        if (cancelled) return;
        setGraceMinutesInput(String(grace));
        setSnoozeMinutesState(snooze);
        setUseDeviceTimezoneState(useDevice);
        setMoodChartSchemeState(moodScheme);
      } catch {
        // No session yet — leave defaults in place.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGraceMinutesChange(text: string) {
    setGraceMinutesInput(text.replace(/[^0-9]/g, ''));
  }

  async function handleGraceMinutesBlur() {
    setGraceError(null);
    const parsed = Number(graceMinutesInput);
    if (
      !Number.isInteger(parsed) ||
      parsed < MISSED_GRACE_MIN_MINUTES ||
      parsed > MISSED_GRACE_MAX_MINUTES
    ) {
      setGraceError(
        `Enter a whole number between ${MISSED_GRACE_MIN_MINUTES} and ${MISSED_GRACE_MAX_MINUTES}.`,
      );
      return;
    }
    try {
      await setMissedGraceMinutes(parsed);
    } catch (e) {
      setGraceError(e instanceof Error ? e.message : 'Failed to save grace period');
    }
  }

  async function handleSnoozeSelect(minutes: number) {
    setSnoozeMinutesState(minutes);
    try {
      await setSnoozeMinutes(minutes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save snooze duration');
    }
  }

  async function handleUseDeviceTimezoneToggle(value: boolean) {
    setUseDeviceTimezoneState(value);
    try {
      await setUseDeviceTimezone(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save time zone setting');
    }
  }

  async function handleMoodChartSchemeToggle(useTeal: boolean) {
    const scheme: MoodChartScheme = useTeal ? 'teal' : 'classic';
    setMoodSchemeError(null);
    setMoodChartSchemeState(scheme);
    try {
      await setMoodChartScheme(scheme);
    } catch (e) {
      setMoodSchemeError(e instanceof Error ? e.message : "Couldn't save mood chart color");
    }
  }

  async function handleAlarmSoundToggle(value: boolean) {
    setError(null);
    setAlarmSoundEnabledState(value);
    try {
      await setAlarmSoundEnabled(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save alarm sound setting");
    }
  }

  async function handleVibrationToggle(value: boolean) {
    setError(null);
    setVibrationEnabledState(value);
    try {
      await setVibrationEnabled(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save vibration setting");
    }
  }

  async function handleToggle(value: boolean) {
    setError(null);
    setPermissionDenied(false);

    if (Platform.OS === 'web') {
      setError('Reminders aren’t available in the web app — open RxTracker on your phone to turn them on.');
      return;
    }

    setBusy(true);
    try {
      if (value) {
        const result = await requestReminderPermissions();
        if (result === 'denied') {
          setPermissionDenied(true);
          return;
        }
        if (result === 'unsupported') {
          setError('Reminders aren’t supported on this device.');
          return;
        }
        await setRemindersEnabledSetting(true);
        setRemindersEnabled(true);
        await resyncReminderNotifications();
      } else {
        await setRemindersEnabledSetting(false);
        setRemindersEnabled(false);
        await cancelAllReminderNotifications();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update reminder setting');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboardShouldPersistTaps="handled" contentClassName="gap-6">
      <ScreenTitle>Settings</ScreenTitle>

      <Card flat className="gap-1">
        <Text muted className="text-xs">
          Signed in as
        </Text>
        <Text className="text-sm font-medium">{session?.user.email}</Text>
      </Card>

      <Card flat className="gap-3">
        <PanelTitle>Reminders</PanelTitle>
        <SwitchRow
          label="Enable medication reminders"
          description="Get a notification on this device at each medication's scheduled time. As-needed medications aren't reminded."
          value={remindersEnabled}
          onValueChange={handleToggle}
          disabled={busy || loadingSetting}
        />

        {permissionDenied ? (
          <Callout kind="warning" icon="notifications-off-outline">
            <Text className="text-sm">Notifications are turned off for RxTracker in your device settings.</Text>
            <Pressable accessibilityRole="link" className="min-h-11 justify-center self-start" onPress={() => Linking.openSettings()}>
              <Text className="text-sm font-semibold text-brand-deep-blue dark:text-brand-cyan">Open Settings</Text>
            </Pressable>
          </Callout>
        ) : null}

        {error ? <Text className="text-sm text-status-danger dark:text-status-danger">{error}</Text> : null}
      </Card>

      <Card flat className="gap-3">
        <PanelTitle>Alarm &amp; Notification Settings</PanelTitle>
        <Text muted className="text-xs">
          Alerts you while the dashboard is open when a dose becomes due.
        </Text>
        <View>
          <SwitchRow
            label="Alarm sound"
            description="Audible alarm when a dose is due. On by default."
            value={alarmSoundEnabled}
            onValueChange={handleAlarmSoundToggle}
          />
          <SwitchRow
            label="Vibration"
            description="Device vibration for in-app alarms. On by default."
            value={vibrationEnabled}
            onValueChange={handleVibrationToggle}
          />
          <SwitchRow
            label="Teal mood chart"
            description="Use a teal gradient for the mood trend chart instead of the red-to-green scale."
            value={moodChartScheme === 'teal'}
            onValueChange={handleMoodChartSchemeToggle}
          />
        </View>
        {moodSchemeError ? <Text className="text-sm text-status-danger dark:text-status-danger">{moodSchemeError}</Text> : null}
        <Button label="Test alarm" variant="secondary" className="self-start" onPress={() => previewAlarm()} />
      </Card>

      <Card flat className="gap-4">
        <PanelTitle>General Settings</PanelTitle>

        <View className="gap-1">
          <Text className="text-sm font-medium">Mark dose missed after</Text>
          <Text muted className="text-xs">
            How many minutes past the scheduled time before a pending dose is marked missed, and after which a taken
            dose is flagged late.
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            <Input
              className="w-24 text-center"
              accessibilityLabel="Mark dose missed after, in minutes"
              value={graceMinutesInput}
              onChangeText={handleGraceMinutesChange}
              onBlur={handleGraceMinutesBlur}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text muted className="text-sm">
              minutes
            </Text>
          </View>
          {graceError ? <Text className="text-xs text-status-danger dark:text-status-danger">{graceError}</Text> : null}
        </View>

        <View className="gap-1">
          <Text className="text-sm font-medium">Default snooze duration</Text>
          <Text muted className="text-xs">
            Pre-selected when you snooze a dose from the dashboard.
          </Text>
          <PillTabs
            variant="range"
            className="mt-1"
            tabs={SNOOZE_OPTIONS.map((m) => ({ value: String(m), label: `${m} min` }))}
            value={snoozeMinutes == null ? '' : String(snoozeMinutes)}
            onChange={(v) => handleSnoozeSelect(Number(v))}
          />
        </View>

        <View>
          <SwitchRow label="Use device time zone" value={useDeviceTimezone} onValueChange={handleUseDeviceTimezoneToggle} />
          <Text muted className="text-xs">
            Detected: {deviceTimezone}
          </Text>
        </View>
      </Card>

      <Card flat className="gap-1 p-2">
        <LinkRow
          title="My Profile"
          description="Edit your name, birth date, height, and weight."
          href="/profile"
        />
        <LinkRow
          title="Manage Family"
          description="Add family members and track their medications from this account."
          href="/family"
        />
        <LinkRow
          title="Doctor Visit Report"
          description="Generate a PDF summary of your medications, adherence, and history to share or print."
          href="/export"
        />
        <LinkRow title="Help & FAQ" description="Answers to common questions about how RxTracker works." href="/help" />
      </Card>

      <Button
        label="Sign out"
        variant="secondary"
        className="border-status-danger dark:border-status-danger"
        labelClassName="text-status-danger dark:text-status-danger"
        onPress={signOut}
      />
    </Screen>
  );
}

function LinkRow({ title, description, href }: { title: string; description: string; href: Href }) {
  return (
    <Pressable
      accessibilityRole="link"
      className="min-h-14 flex-row items-center gap-3 rounded-control px-2 py-2 active:bg-brand-bg dark:active:bg-night-selected"
      onPress={() => router.push(href)}>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-brand-navy dark:text-white">{title}</Text>
        <Text muted className="text-xs">
          {description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#60708A" />
    </Pressable>
  );
}
