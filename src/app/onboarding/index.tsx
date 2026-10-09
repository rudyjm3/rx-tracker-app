import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientPressable } from '@/components/ui/gradient-pressable';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useActiveProfile } from '@/lib/active-profile';
import { getActiveMedications } from '@/lib/medications';
import { completeOnboarding, skipOnboarding, startOnboarding } from '@/lib/onboarding';
import type { Medication } from '@/lib/types/medications';

// Scoped mobile equivalent of rx-tracker-web's /onboarding wizard — see
// lib/onboarding.ts's doc comment for why this is one screen that loops
// back to itself after each medication add, rather than a port of web's
// 6-step draft-based wizard.
export default function OnboardingScreen() {
  const theme = useTheme();
  const styles = getStyles(theme);
  const { activeProfileId, activeProfile } = useActiveProfile();

  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const requestIdRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const requestId = ++requestIdRef.current;
      let cancelled = false;
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const [progress, meds] = await Promise.all([
            startOnboarding(activeProfileId),
            getActiveMedications(activeProfileId),
          ]);
          if (cancelled || requestIdRef.current !== requestId) return;
          // A direct revisit after finishing (or after already being
          // marked complete from web) bounces back to the dashboard
          // rather than re-showing a finished setup screen — matching
          // web's OnboardingShell redirect. "skipped" is left alone, same
          // as web: that's the state the dashboard's resume-setup nudge
          // links back into this screen from.
          if (progress?.status === 'completed') {
            router.replace('/(tabs)');
            return;
          }
          setMedications(meds);
        } catch (e) {
          if (cancelled || requestIdRef.current !== requestId) return;
          setError(e instanceof Error ? e.message : 'Failed to load setup progress');
        } finally {
          if (!cancelled && requestIdRef.current === requestId) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeProfileId]),
  );

  async function handleSkip() {
    setSkipping(true);
    try {
      await skipOnboarding(activeProfileId);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't skip setup");
      setSkipping(false);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      await completeOnboarding(activeProfileId);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't finish setup");
      setFinishing(false);
    }
  }

  const profileName = activeProfile?.display_name ?? 'your';
  const busy = finishing || skipping;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerRow}>
            <ThemedText type="title" style={styles.title}>
              Set up {activeProfile ? `${profileName}'s` : 'your'} medications
            </ThemedText>
            <Pressable onPress={handleSkip} disabled={busy} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                Skip setup
              </ThemedText>
            </Pressable>
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
            Add each medication or supplement {activeProfile ? `${profileName} takes` : 'you take'} — dose,
            schedule, and reminders. You can add more, or finish and come back anytime.
          </ThemedText>

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {loading ? (
            <ActivityIndicator style={styles.loading} />
          ) : medications.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText type="small" themeColor="textSecondary">
                No medications added yet.
              </ThemedText>
            </ThemedView>
          ) : (
            <View style={styles.medList}>
              {medications.map((med) => (
                <ThemedView key={med.id} type="backgroundElement" style={styles.medRow}>
                  <ThemedText type="smallBold">{med.name}</ThemedText>
                  {med.dose ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {med.dose}
                    </ThemedText>
                  ) : null}
                </ThemedView>
              ))}
            </View>
          )}

          <Pressable
            style={styles.addButton}
            onPress={() => router.push('/medications/new?fromOnboarding=1')}
            disabled={busy}
          >
            <ThemedText style={styles.addButtonText}>+ Add a medication</ThemedText>
          </Pressable>

          <GradientPressable
            style={[styles.primaryButton, (medications.length === 0 || busy) && styles.disabled]}
            onPress={handleFinish}
            disabled={medications.length === 0 || busy}
          >
            {finishing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.primaryButtonText}>Finish setup</ThemedText>
            )}
          </GradientPressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.one },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.two },
    title: { fontSize: 22, lineHeight: 28, flex: 1 },
    intro: { marginTop: Spacing.two, marginBottom: Spacing.one },
    error: { color: Brand.danger, marginVertical: Spacing.two },
    loading: { marginTop: Spacing.four },
    emptyCard: { borderRadius: BorderRadius.md, padding: Spacing.three, marginTop: Spacing.three },
    medList: { gap: Spacing.two, marginTop: Spacing.three },
    medRow: { borderRadius: BorderRadius.md, padding: Spacing.three, gap: 2 },
    addButton: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      paddingVertical: Spacing.three,
      alignItems: 'center',
      marginTop: Spacing.four,
    },
    addButtonText: { color: Brand.deepBlue, fontWeight: '600' },
    primaryButton: {
      backgroundColor: Brand.deepBlue,
      borderRadius: BorderRadius.sm,
      paddingVertical: Spacing.three,
      alignItems: 'center',
      marginTop: Spacing.two,
    },
    primaryButtonText: { color: '#ffffff', fontWeight: '600' },
    disabled: { opacity: 0.6 },
  });
}
