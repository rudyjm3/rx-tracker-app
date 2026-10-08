import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { dismissLowSupply, getDismissedMedicationIds } from '@/lib/low-supply-dismissals';
import { getSupplyAlerts, type SupplyAlert } from '@/lib/medication-ui';
import type { Medication } from '@/lib/types/medications';
import { localDateString } from '@/lib/utils';

// Low-supply alerts minus the ones dismissed today. Dismissals live in
// Supabase (account-wide), so they're re-read whenever the screen gains
// focus — a dismissal made on another device shows up here on return.
// Shared by the dashboard and the medications list so both stay in step.
export function useLowSupplyAlerts(medications: Medication[]) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dismissError, setDismissError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDismissedMedicationIds(localDateString()).then((ids) => {
        if (!cancelled) setDismissedIds(ids);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const alerts: SupplyAlert[] = getSupplyAlerts(medications).filter(
    (a) => !dismissedIds.has(a.medication.id),
  );

  const dismiss = useCallback(async (medicationId: string) => {
    setDismissError(null);
    setDismissedIds((prev) => new Set(prev).add(medicationId));
    try {
      await dismissLowSupply(medicationId, localDateString());
    } catch (e) {
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.delete(medicationId);
        return next;
      });
      setDismissError(e instanceof Error ? e.message : 'Failed to dismiss reminder');
    }
  }, []);

  return { alerts, dismiss, dismissError };
}
