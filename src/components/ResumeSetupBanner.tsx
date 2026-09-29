// Ported from rx-tracker-web's components/layout/ResumeSetupBanner.tsx —
// persistent nudge for whichever profile is currently active (owner or a
// family member) toward /onboarding, shown on the dashboard only (web
// mounts it in TopNav so it shows on every screen; scoped down here to
// avoid re-querying onboarding progress on every tab). Medications can
// exist for a profile without a completed profile_onboarding row (e.g. a
// medication added before this screen existed) — "already has
// medications" counts as done too, same as web, so this never nudges
// someone to "finish" setup that's already finished in substance.
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { getOnboardingProgress } from '@/lib/onboarding';
import type { Medication } from '@/lib/types/medications';

export function ResumeSetupBanner({
  profileId,
  profileName,
  medications,
}: {
  profileId?: string | null;
  profileName: string;
  medications: Medication[];
}) {
  // Resets to "not yet known complete" whenever profileId changes —
  // adjusted during render (not inside the effect below) so a profile
  // switch can't render one tick of the *previous* profile's completed
  // state before the effect's setState lands. Same technique used
  // elsewhere in this codebase (e.g. OnboardingShell's hydratedProgressId
  // on web) for state that must derive from data keyed off a changing id.
  const [checked, setChecked] = useState<{ profileId?: string | null; completed: boolean }>({
    profileId: undefined,
    completed: false,
  });
  if (checked.profileId !== profileId) {
    setChecked({ profileId, completed: false });
  }

  useEffect(() => {
    let cancelled = false;
    getOnboardingProgress(profileId)
      .then((progress) => {
        if (cancelled || progress?.status !== 'completed') return;
        setChecked((prev) => (prev.profileId === profileId ? { ...prev, completed: true } : prev));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (checked.completed || medications.length > 0) return null;

  return (
    <Pressable style={styles.banner} onPress={() => router.push('/onboarding')}>
      <View style={styles.textCol}>
        <ThemedText type="smallBold" style={styles.title}>
          Finish setting up {profileName === 'your' ? 'your' : `${profileName}'s`} medications
        </ThemedText>
      </View>
      <ThemedText type="small" style={styles.link}>
        Resume setup
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Brand.warning + '66',
    backgroundColor: Brand.warning + '1A',
    padding: Spacing.three,
  },
  textCol: { flex: 1 },
  title: { color: Brand.warning },
  link: { color: Brand.deepBlue, fontWeight: '600' },
});
