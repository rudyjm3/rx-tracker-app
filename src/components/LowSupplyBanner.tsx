// Ported from rx-tracker-web's components/layout/NotificationBell.tsx —
// pure client-side filter over an already-loaded medication list, no extra
// query. Web derives its live alerts the same way (the user_notifications
// table exists but nothing populates it).
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { getSupplyAlerts, SUPPLY_SEVERITY_COLORS, SUPPLY_SEVERITY_LABELS } from '@/lib/medication-ui';
import type { Medication } from '@/lib/types/medications';

export function LowSupplyBanner({ medications }: { medications: Medication[] }) {
  const alerts = getSupplyAlerts(medications);

  if (alerts.length === 0) return null;

  const worstColor = alerts.some((a) => a.severity !== 'low_stock') ? Brand.danger : Brand.warning;

  return (
    <View style={[styles.banner, { borderColor: worstColor + '66', backgroundColor: worstColor + '1A' }]}>
      <ThemedText type="smallBold" style={{ color: worstColor }}>
        Supply alerts
      </ThemedText>
      {alerts.map((a) => (
        <ThemedText key={a.medication.id} type="small">
          <ThemedText type="small" style={{ color: SUPPLY_SEVERITY_COLORS[a.severity], fontWeight: '700' }}>
            {SUPPLY_SEVERITY_LABELS[a.severity]}
          </ThemedText>
          {': '}
          {a.medication.name}
          {a.medication.dose ? ` — ${a.medication.dose}` : ''} ({a.medication.current_quantity} {a.medication.inventory_unit} left)
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 2,
  },
});
