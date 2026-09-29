import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
  const theme = useTheme();
  const styles = getStyles(theme);

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

  function handleAlarmSoundToggle(value: boolean) {
    setAlarmSoundEnabledState(value);
    setAlarmSoundEnabled(value);
  }

  function handleVibrationToggle(value: boolean) {
    setVibrationEnabledState(value);
    setVibrationEnabled(value);
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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Settings
        </ThemedText>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              Signed in as
            </ThemedText>
            <ThemedText>{session?.user.email}</ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.reminderRow}>
              <View style={styles.reminderLabel}>
                <ThemedText type="smallBold">Enable medication reminders</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  Get a notification on this device at each medication&apos;s scheduled time.
                  As-needed medications aren&apos;t reminded.
                </ThemedText>
              </View>
              <Switch
                value={remindersEnabled}
                onValueChange={handleToggle}
                disabled={busy || loadingSetting}
                trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
              />
            </View>

            {permissionDenied && (
              <ThemedView type="backgroundSelected" style={styles.permissionNotice}>
                <ThemedText type="small">
                  Notifications are turned off for RxTracker in your device settings.
                </ThemedText>
                <Pressable style={styles.settingsButton} onPress={() => Linking.openSettings()}>
                  <ThemedText type="linkPrimary">Open Settings</ThemedText>
                </Pressable>
              </ThemedView>
            )}

            {error && (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            )}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Alarm &amp; notification settings</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              Alerts you while the dashboard is open when a dose becomes due.
            </ThemedText>

            <View style={styles.reminderRow}>
              <View style={styles.reminderLabel}>
                <ThemedText type="small">Alarm sound</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  Audible alarm when a dose is due. On by default.
                </ThemedText>
              </View>
              <Switch
                value={alarmSoundEnabled}
                onValueChange={handleAlarmSoundToggle}
                trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
              />
            </View>

            <View style={styles.reminderRow}>
              <View style={styles.reminderLabel}>
                <ThemedText type="small">Vibration</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  Device vibration for in-app alarms. On by default.
                </ThemedText>
              </View>
              <Switch
                value={vibrationEnabled}
                onValueChange={handleVibrationToggle}
                trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
              />
            </View>

            <Pressable style={styles.testAlarmButton} onPress={() => previewAlarm()}>
              <ThemedText style={styles.testAlarmButtonText}>Test alarm</ThemedText>
            </Pressable>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Missed dose grace period</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              How many minutes past the scheduled time before a pending dose is marked missed,
              and after which a taken dose is flagged late.
            </ThemedText>
            <View style={styles.graceRow}>
              <TextInput
                style={styles.graceInput}
                value={graceMinutesInput}
                onChangeText={handleGraceMinutesChange}
                onBlur={handleGraceMinutesBlur}
                keyboardType="number-pad"
                maxLength={3}
              />
              <ThemedText type="small" themeColor="textSecondary">
                minutes
              </ThemedText>
            </View>
            {graceError && (
              <ThemedText type="small" style={styles.error}>
                {graceError}
              </ThemedText>
            )}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Default snooze duration</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              Pre-selected when you snooze a dose from the dashboard.
            </ThemedText>
            <View style={styles.chipRow}>
              {SNOOZE_OPTIONS.map((minutes) => (
                <Pressable
                  key={minutes}
                  style={[styles.chip, snoozeMinutes === minutes && styles.chipSelected]}
                  onPress={() => handleSnoozeSelect(minutes)}
                >
                  <ThemedText
                    type="small"
                    style={snoozeMinutes === minutes ? styles.chipTextSelected : undefined}
                  >
                    {minutes} min
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Time zone</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              Detected: {deviceTimezone}
            </ThemedText>
            <View style={styles.reminderRow}>
              <View style={styles.reminderLabel}>
                <ThemedText type="small">Use device time zone</ThemedText>
              </View>
              <Switch
                value={useDeviceTimezone}
                onValueChange={handleUseDeviceTimezoneToggle}
                trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
              />
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.reminderRow}>
              <View style={styles.reminderLabel}>
                <ThemedText type="smallBold">Teal mood chart</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  Use a teal gradient for the mood trend chart instead of the red-to-green scale.
                </ThemedText>
              </View>
              <Switch
                value={moodChartScheme === 'teal'}
                onValueChange={handleMoodChartSchemeToggle}
                trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
              />
            </View>
            {moodSchemeError && (
              <ThemedText type="small" style={styles.error}>
                {moodSchemeError}
              </ThemedText>
            )}
          </ThemedView>

          <Pressable style={styles.card} onPress={() => router.push('/profile')}>
            <ThemedText type="smallBold">My Profile</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              Edit your name, birth date, height, and weight.
            </ThemedText>
          </Pressable>

          <Pressable style={styles.card} onPress={() => router.push('/family')}>
            <ThemedText type="smallBold">Manage Family</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              Add family members and track their medications from this account.
            </ThemedText>
          </Pressable>

          <Pressable style={styles.card} onPress={() => router.push('/help')}>
            <ThemedText type="smallBold">Help &amp; FAQ</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              Answers to common questions about how RxTracker works.
            </ThemedText>
          </Pressable>

          <Pressable style={styles.button} onPress={signOut}>
            <ThemedText style={styles.buttonText}>Sign out</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  title: { fontSize: 28, lineHeight: 34, marginBottom: Spacing.two },
  scrollContent: { gap: Spacing.three, paddingBottom: Spacing.six },
  card: { borderRadius: BorderRadius.md, padding: Spacing.three, gap: Spacing.one },
  note: { marginTop: Spacing.one },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  reminderLabel: { flex: 1 },
  permissionNotice: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  settingsButton: { alignSelf: 'flex-start' },
  testAlarmButton: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  testAlarmButtonText: { fontWeight: '600' },
  error: { color: Brand.danger, marginTop: Spacing.one },
  graceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  graceInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minWidth: 64,
    textAlign: 'center',
    color: theme.text,
    backgroundColor: theme.backgroundElement,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  chipSelected: { borderColor: Brand.deepBlue, backgroundColor: theme.backgroundSelected },
  chipTextSelected: { fontWeight: '700', color: Brand.deepBlue },
  button: {
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Brand.danger,
    marginTop: Spacing.two,
  },
  buttonText: { color: Brand.danger, fontWeight: '600' },
});
}
