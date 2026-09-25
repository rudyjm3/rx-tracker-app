// Ported from rx-tracker-web's components/dashboard/LowSupplyBanner.tsx —
// pure client-side filter over an already-loaded medication list, no extra
// query.
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import type { Medication } from '@/lib/types/medications';

export function LowSupplyBanner({ medications }: { medications: Medication[] }) {
  const lowSupply = medications.filter(
    (m) => m.inventory_enabled && m.current_quantity != null && m.current_quantity <= m.low_supply_threshold,
  );

  if (lowSupply.length === 0) return null;

  return (
    <View style={styles.banner}>
      <ThemedText type="smallBold" style={styles.title}>
        Low supply
      </ThemedText>
      <ThemedText type="small" style={styles.text}>
        {lowSupply
          .map((m) => `${m.name}${m.dose ? ` — ${m.dose}` : ''} (${m.current_quantity} ${m.inventory_unit} left)`)
          .join(', ')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Brand.warning + '66',
    backgroundColor: Brand.warning + '1A',
    padding: Spacing.three,
    gap: 2,
  },
  title: { color: Brand.warning },
  text: { color: Brand.text },
});
