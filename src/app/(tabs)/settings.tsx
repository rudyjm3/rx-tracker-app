import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  cancelAllReminderNotifications,
  getRemindersEnabledSetting,
  requestReminderPermissions,
  resyncReminderNotifications,
  setRemindersEnabledSetting,
} from '@/lib/notifications';
import { useAuth } from '@/lib/supabase/AuthProvider';

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const theme = useTheme();

  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [loadingSetting, setLoadingSetting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, []);

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

          <Pressable style={styles.button} onPress={signOut}>
            <ThemedText style={styles.buttonText}>Sign out</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
  error: { color: Brand.danger, marginTop: Spacing.one },
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
