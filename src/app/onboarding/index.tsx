import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { MedName } from '@/components/ui/med-name';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useActiveProfile } from '@/lib/active-profile';
import { getActiveMedications } from '@/lib/medications';
import { completeOnboarding, skipOnboarding, startOnboarding } from '@/lib/onboarding';
import type { Medication } from '@/lib/types/medications';

// Scoped mobile equivalent of rx-tracker-web's /onboarding wizard — see
// lib/onboarding.ts's doc comment for why this is one screen that loops
// back to itself after each medication add, rather than a port of web's
// 6-step draft-based wizard.
export default function OnboardingScreen() {
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
      // The dashboard shows its one-time "You're all set" banner for this param.
      router.replace({ pathname: '/(tabs)', params: { setup: 'complete' } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't finish setup");
      setFinishing(false);
    }
  }

  const profileName = activeProfile?.display_name ?? 'your';
  const busy = finishing || skipping;

  return (
    <Screen edges={['left', 'right', 'bottom']} contentClassName="pt-4">
      <View className="flex-row items-start justify-between gap-2">
        <Text accessibilityRole="header" className="flex-1 text-xl font-bold text-brand-navy dark:text-white">
          Set up {activeProfile ? `${profileName}'s` : 'your'} medications
        </Text>
        <Pressable className="min-h-11 justify-center" onPress={handleSkip} disabled={busy} hitSlop={8}>
          <Text muted className="text-sm">
            Skip setup
          </Text>
        </Pressable>
      </View>

      <Text muted className="text-sm">
        Add each medication or supplement {activeProfile ? `${profileName} takes` : 'you take'} — dose, schedule, and
        reminders. You can add more, or finish and come back anytime.
      </Text>

      {error ? <Callout kind="danger">{error}</Callout> : null}

      {loading ? (
        <ActivityIndicator className="mt-4" />
      ) : medications.length === 0 ? (
        <Card flat className="p-3">
          <Text muted className="text-sm">
            No medications added yet.
          </Text>
        </Card>
      ) : (
        <View className="gap-2">
          {medications.map((med) => (
            <Card key={med.id} flat className="p-3">
              <MedName className="text-sm font-semibold" name={med.name} dose={med.dose} />
            </Card>
          ))}
        </View>
      )}

      <Button
        label="+ Add a medication"
        variant="secondary"
        onPress={() => router.push('/medications/new?fromOnboarding=1')}
        disabled={busy}
      />

      <Button
        label={finishing ? 'Finishing…' : 'Finish setup'}
        loading={finishing}
        disabled={medications.length === 0 || busy}
        onPress={handleFinish}
      />
    </Screen>
  );
}
