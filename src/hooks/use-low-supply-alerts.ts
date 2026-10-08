import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [today, setToday] = useState(() => localDateString());
  // Dismissals made locally for `today` that a slower in-flight read could
  // otherwise overwrite with an older server snapshot.
  const localDismissalsRef = useRef<Set<string>>(new Set());

  // A screen left focused across local midnight never re-fires the focus
  // effect, so watch the date and re-key the read when it rolls over.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = localDateString();
      setToday((prev) => {
        if (prev === now) return prev;
        localDismissalsRef.current = new Set();
        setDismissedIds(new Set());
        return now;
      });
    }, 20_000);
    return () => clearInterval(interval);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDismissedMedicationIds(today).then((ids) => {
        if (cancelled) return;
        setDismissedIds(new Set([...ids, ...localDismissalsRef.current]));
      });
      return () => {
        cancelled = true;
      };
    }, [today]),
  );

  const alerts: SupplyAlert[] = getSupplyAlerts(medications).filter(
    (a) => !dismissedIds.has(a.medication.id),
  );

  const dismiss = useCallback(
    async (medicationId: string) => {
      setDismissError(null);
      localDismissalsRef.current.add(medicationId);
      setDismissedIds((prev) => new Set(prev).add(medicationId));
      try {
        await dismissLowSupply(medicationId, today);
      } catch (e) {
        localDismissalsRef.current.delete(medicationId);
        setDismissedIds((prev) => {
          const next = new Set(prev);
          next.delete(medicationId);
          return next;
        });
        setDismissError(e instanceof Error ? e.message : 'Failed to dismiss reminder');
      }
    },
    [today],
  );

  return { alerts, dismiss, dismissError };
}
