import { twMerge } from 'tailwind-merge';

// Joins class names, skipping falsy values, and lets later classes win over
// conflicting earlier ones (so a caller's `className` overrides a default).
export function cn(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(' '));
}
