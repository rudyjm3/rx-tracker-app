import { LinearGradient } from 'expo-linear-gradient';

import { Gradient } from '@/constants/theme';

// Absolute-fill gradient behind a container's content (DESIGN.md 2.3 / 17.1).
// The parent needs `overflow-hidden` so the corners clip to its radius.
// CSS gradients don't exist in React Native, hence expo-linear-gradient.
export type GradientName = keyof typeof Gradient;

const START = { x: 0, y: 0 };
const END = { x: 1, y: 1 };

export function GradientFill({ name = 'brand' }: { name?: GradientName }) {
  const auth = name === 'auth';
  return (
    <LinearGradient
      colors={[...Gradient[name]]}
      start={auth ? { x: 0.3, y: 0 } : START}
      end={auth ? { x: 0.7, y: 1 } : END}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      pointerEvents="none"
    />
  );
}
