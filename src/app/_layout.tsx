import '@/global.css';
import { DarkTheme, DefaultTheme, router, Slot, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ActiveProfileProvider, useActiveProfile } from '@/lib/active-profile';
import { getMedication } from '@/lib/medications';
import {
  addNotificationResponseListener,
  cancelAllReminderNotifications,
  configureNotificationHandler,
  resyncIfRemindersEnabled,
} from '@/lib/notifications';
import { AuthProvider, useAuth } from '@/lib/supabase/AuthProvider';

SplashScreen.preventAutoHideAsync();

// Without a handler, a notification delivered while the app is open is
// dropped silently.
configureNotificationHandler();

// Minimum time between AppState-triggered resyncs, so rapid foreground/
// background flicker (e.g. a system permission dialog, a quick app
// switcher glance) doesn't refire the whole cancel-and-reschedule pass on
// every trivial state change.
const FOREGROUND_RESYNC_MIN_INTERVAL_MS = 60_000;

function RootNavigation() {
  const { loading, session } = useAuth();
  const { setActiveProfileId } = useActiveProfile();
  const lastForegroundResyncAt = useRef(0);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Resync once after sign-in / on launch when a session exists — resync
  // itself checks the local_reminders_enabled setting and no-ops if it's
  // off, and no-ops entirely on web. When the session ends (sign-out) or
  // switches to a different account, cancel every scheduled local
  // reminder instead — otherwise the previous account's medication
  // schedule (names/doses/times) keeps firing on this device even after
  // that account's Supabase session is gone, and signing into a new
  // account whose reminders setting happens to be off would just no-op
  // the resync and leave the old schedules in place.
  useEffect(() => {
    const currentUserId = session?.user.id ?? null;
    const previousUserId = lastUserId.current;
    lastUserId.current = currentUserId;

    if (!currentUserId) {
      if (previousUserId !== null) cancelAllReminderNotifications();
      return;
    }

    if (previousUserId !== null && previousUserId !== currentUserId) {
      cancelAllReminderNotifications();
    }

    lastForegroundResyncAt.current = Date.now();
    resyncIfRemindersEnabled();
  }, [session]);

  // Resync on the app coming back to the foreground, debounced.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || !session) return;
      const now = Date.now();
      if (now - lastForegroundResyncAt.current < FOREGROUND_RESYNC_MIN_INTERVAL_MS) return;
      lastForegroundResyncAt.current = now;
      resyncIfRemindersEnabled();
    });
    return () => subscription.remove();
  }, [session]);

  // Tapping a delivered reminder opens the dashboard, where the due-now
  // overlay offers Take / Snooze / Skip for the whole group (or the single dose).
  // Reminders cover every profile but the dashboard shows only the active one,
  // so switch to the reminded medication's profile first. If that can't be
  // resolved, fall back to the medication's own screen rather than an
  // unrelated profile's dashboard.
  useEffect(() => {
    const unsubscribe = addNotificationResponseListener(async ({ medicationId }) => {
      if (!medicationId) {
        router.navigate('/');
        return;
      }
      try {
        const med = await getMedication(medicationId);
        setActiveProfileId(med.profile_id);
        router.navigate('/');
      } catch {
        router.push(`/medications/${medicationId}`);
      }
    });
    return unsubscribe;
  }, [setActiveProfileId]);

  if (loading) return null;

  return <Slot />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <ActiveProfileProvider>
            <RootNavigation />
          </ActiveProfileProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
