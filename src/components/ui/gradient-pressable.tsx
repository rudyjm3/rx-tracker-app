import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Brand } from '@/constants/theme';

type GradientName = 'brand' | 'dark' | 'hero';

const GRADIENTS = {
  brand: { colors: Brand.gradient, locations: [0, 0.48, 1] as const, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  dark: { colors: Brand.gradientDark, locations: [0, 0.6, 1] as const, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  hero: { colors: Brand.gradientHero, locations: [0, 0.45, 0.75, 1] as const, start: { x: 0.2, y: 0 }, end: { x: 0.8, y: 1 } },
};

type Props = PressableProps & { gradient?: GradientName };

// Drop-in replacement for a Pressable that used a flat Brand.deepBlue fill:
// mirrors the web app's `bg-gradient-brand` primary button.
export function GradientPressable({ gradient = 'brand', style, children, ...rest }: Props) {
  const g = GRADIENTS[gradient];
  return (
    <Pressable
      {...rest}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        { backgroundColor: 'transparent', overflow: 'hidden' },
      ]}
    >
      {(state) => (
        <>
          <LinearGradient
            colors={g.colors}
            locations={g.locations}
            start={g.start}
            end={g.end}
            style={StyleSheet.absoluteFill}
          />
          {typeof children === 'function' ? children(state) : children}
        </>
      )}
    </Pressable>
  );
}
