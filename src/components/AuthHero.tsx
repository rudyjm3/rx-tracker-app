import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';

export function AuthHero({ title, tagline }: { title: string; tagline: string }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={Brand.gradientHero}
      locations={[0, 0.45, 0.75, 1]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={[styles.hero, { paddingTop: insets.top + Spacing.five }]}
    >
      <View style={styles.content}>
        <ThemedText style={styles.brand}>RxTracker</ThemedText>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <ThemedText style={styles.tagline}>{tagline}</ThemedText>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  content: { gap: Spacing.one },
  brand: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5, opacity: 0.9 },
  title: { color: '#ffffff', fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { color: 'rgba(255,255,255,0.8)', fontSize: 16, lineHeight: 22 },
});
