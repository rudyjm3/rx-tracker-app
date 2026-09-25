import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/supabase/AuthProvider';

export default function SettingsScreen() {
  const { session, signOut } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Settings
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            Signed in as
          </ThemedText>
          <ThemedText>{session?.user.email}</ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Reminders</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            Push notification delivery isn&apos;t wired up yet — this is where reminder settings
            will live once it is.
          </ThemedText>
        </ThemedView>

        <Pressable style={styles.button} onPress={signOut}>
          <ThemedText style={styles.buttonText}>Sign out</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.three },
  title: { fontSize: 28, lineHeight: 34, marginBottom: Spacing.two },
  card: { borderRadius: BorderRadius.md, padding: Spacing.three, gap: Spacing.one },
  note: { marginTop: Spacing.one },
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
