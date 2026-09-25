import { DarkTheme, DefaultTheme, router, Slot, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { addNotificationResponseListener, resyncIfRemindersEnabled } from '@/lib/notifications';
import { AuthProvider, useAuth } from '@/lib/supabase/AuthProvider';

SplashScreen.preventAutoHideAsync();

// Minimum time between AppState-triggered resyncs, so rapid foreground/
// background flicker (e.g. a system permission dialog, a quick app
// switcher glance) doesn't refire the whole cancel-and-reschedule pass on
// every trivial state change.
const FOREGROUND_RESYNC_MIN_INTERVAL_MS = 60_000;

function RootNavigation() {
  const { loading, session } = useAuth();
  const lastForegroundResyncAt = useRef(0);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Resync once after sign-in / on launch when a session exists — resync
  // itself checks the local_reminders_enabled setting and no-ops if it's
  // off, and no-ops entirely on web.
  useEffect(() => {
    if (!session) return;
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

  // Tapping a delivered reminder opens that medication's detail screen.
  useEffect(() => {
    const unsubscribe = addNotificationResponseListener(({ medicationId }) => {
      if (medicationId) router.push(`/medications/${medicationId}`);
    });
    return unsubscribe;
  }, []);

  if (loading) return null;

  return <Slot />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigation />
      </AuthProvider>
    </ThemeProvider>
  );
}
