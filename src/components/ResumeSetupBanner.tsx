// Ported from rx-tracker-web's components/layout/ResumeSetupBanner.tsx —
// persistent nudge for whichever profile is currently active (owner or a
// family member) toward /onboarding. Mounted in the app header (like web's
// TopNav) so it shows on every tab; it fetches its own medications. Medications can
// exist for a profile without a completed profile_onboarding row (e.g. a
// medication added before this screen existed) — "already has
// medications" counts as done too, same as web, so this never nudges
// someone to "finish" setup that's already finished in substance.
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from 'react-native';

import { Text } from '@/components/ui/text';
import { getActiveMedications } from '@/lib/medications';
import { getOnboardingProgress } from '@/lib/onboarding';

export function ResumeSetupBanner({
  profileId,
  profileName,
}: {
  profileId?: string | null;
  profileName: string;
}) {
  const [hasMedications, setHasMedications] = useState(false);
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
    getActiveMedications(profileId)
      .then((meds) => {
        if (!cancelled) setHasMedications(meds.length > 0);
      })
      .catch(() => undefined);
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

  if (checked.completed || hasMedications) return null;

  // Warning callout, DESIGN.md 7.2: status-warning/10 with a ClipboardList icon.
  return (
    <Pressable
      accessibilityRole="link"
      className="min-h-11 flex-row items-center gap-2 rounded-card border border-status-warning/40 bg-status-warning/10 px-4 py-2"
      onPress={() => router.push('/onboarding')}>
      <Ionicons name="clipboard-outline" size={18} color="#F5A524" />
      <Text className="flex-1 text-sm font-semibold">
        Finish setting up {profileName === 'your' ? 'your' : `${profileName}'s`} medications
      </Text>
      <Text className="text-sm font-medium text-brand-deep-blue dark:text-brand-cyan">Resume setup</Text>
    </Pressable>
  );
}
