import { useEffect, useState } from 'react';

// One-off confirmation message that outlives the screen that raised it (e.g.
// "Draft saved." shown on the page the wizard returns to). Module-level so it
// works from any route; <FlashMessage /> renders it.
let current: string | null = null;
const listeners = new Set<(m: string | null) => void>();

export function showFlash(message: string) {
  current = message;
  listeners.forEach((l) => l(current));
}

export function dismissFlash() {
  current = null;
  listeners.forEach((l) => l(current));
}

export function useFlash(): string | null {
  const [message, setMessage] = useState(current);
  useEffect(() => {
    listeners.add(setMessage);
    setMessage(current);
    return () => {
      listeners.delete(setMessage);
    };
  }, []);
  return message;
}
