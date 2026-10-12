import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';

import { dismissLowSupply, getDismissedMedicationIds } from '@/lib/low-supply-dismissals';
import { getSupplyAlerts, type SupplyAlert } from '@/lib/medication-ui';
import type { Medication } from '@/lib/types/medications';
import { localDateString } from '@/lib/utils';

// Today's dismissed alert ids live in one module-level store shared by every
// consumer of the hook (the header bell, the dashboard banner, the medications
// list), so dismissing an alert in one place updates the others immediately
// instead of waiting for their next focus read.
let sharedDate = localDateString();
let sharedIds: Set<string> = new Set();
// Dismissals made locally for `sharedDate` that a slower in-flight server read
// could otherwise overwrite with an older snapshot.
const localDismissals = new Set<string>();
const listeners = new Set<() => void>();

function publish(date: string, ids: Set<string>) {
  sharedDate = date;
  sharedIds = ids;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function getSnapshot() {
  return sharedIds;
}

// Low-supply alerts minus the ones dismissed today. Dismissals live in
// Supabase (account-wide), so they're re-read whenever the screen gains
// focus — a dismissal made on another device shows up here on return.
// Shared by the header, the dashboard and the medications list so all stay in step.
export function useLowSupplyAlerts(medications: Medication[]) {
  const dismissedIds = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [today, setToday] = useState(() => localDateString());

  // A screen left focused across local midnight never re-fires the focus
  // effect, so watch the date and re-key the read when it rolls over.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = localDateString();
      if (sharedDate !== now) {
        localDismissals.clear();
        publish(now, new Set());
      }
      setToday((prev) => (prev === now ? prev : now));
    }, 20_000);
    return () => clearInterval(interval);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDismissedMedicationIds(today).then((ids) => {
        if (cancelled) return;
        if (sharedDate !== today) localDismissals.clear();
        publish(today, new Set([...ids, ...localDismissals]));
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
      localDismissals.add(medicationId);
      publish(today, new Set(sharedIds).add(medicationId));
      try {
        await dismissLowSupply(medicationId, today);
      } catch (e) {
        localDismissals.delete(medicationId);
        const next = new Set(sharedIds);
        next.delete(medicationId);
        publish(today, next);
        setDismissError(e instanceof Error ? e.message : 'Failed to dismiss reminder');
      }
    },
    [today],
  );

  return { alerts, dismiss, dismissError };
}
