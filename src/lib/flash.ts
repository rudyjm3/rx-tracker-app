import { useSyncExternalStore } from 'react';

// One-off confirmation message that outlives the screen that raised it (e.g.
// "Draft saved." shown on the page the wizard returns to). Module-level so it
// works from any route; <FlashMessage /> renders it.
let current: string | null = null;
const listeners = new Set<() => void>();

export function showFlash(message: string) {
  current = message;
  listeners.forEach((l) => l());
}

export function dismissFlash() {
  current = null;
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

// useSyncExternalStore reads the current message on mount (so one raised
// before the component mounted still shows) and re-renders on every change.
export function useFlash(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
