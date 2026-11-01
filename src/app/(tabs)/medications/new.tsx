import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert } from 'react-native';

import { MedicationWizard, type DraftFormData } from '@/components/medication-wizard';
import { Screen } from '@/components/ui/screen';
import { getDraft, type ParsedDraft } from '@/lib/drafts';

// Add-medication entry point. `?draftId=` resumes a saved draft.
export default function NewMedicationScreen() {
  const { fromOnboarding, draftId } = useLocalSearchParams<{ fromOnboarding?: string; draftId?: string }>();
  const [draft, setDraft] = useState<ParsedDraft<DraftFormData> | null>(null);
  const [loaded, setLoaded] = useState(!draftId);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    getDraft<DraftFormData>(draftId)
      .then((d) => {
        if (cancelled) return;
        if (!d) Alert.alert('Draft not found', 'That draft no longer exists — starting a new medication instead.');
        setDraft(d);
      })
      .catch((e) => {
        if (!cancelled) Alert.alert('Couldn’t load the draft', e instanceof Error ? e.message : 'Starting a new medication instead.');
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  if (!loaded) {
    return (
      <Screen edges={['left', 'right', 'bottom']} scroll={false} contentClassName="items-center justify-center">
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <MedicationWizard
      mode="create"
      draft={draft}
      onCancel={() => router.back()}
      onSaved={(id) => router.replace(fromOnboarding ? '/onboarding' : `/medications/${id}`)}
    />
  );
}
