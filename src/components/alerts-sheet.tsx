import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { SUPPLY_SEVERITY_COLORS, SUPPLY_SEVERITY_LABELS, type SupplyAlert } from '@/lib/medication-ui';

// Supply-alerts sheet opened from the header bell (DESIGN.md 7.3).
export function AlertsSheet({
  alerts,
  onDismiss,
  onClose,
}: {
  alerts: SupplyAlert[];
  onDismiss: (medicationId: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Sheet onClose={onClose}>
      <ScrollView>
        <Text className="mb-0.5 text-lg font-bold text-brand-navy dark:text-white">Supply alerts</Text>

        {alerts.length === 0 ? (
          <Text muted className="mb-2 text-sm">
            You&apos;re all caught up.
          </Text>
        ) : (
          alerts.map(({ medication, severity }) => (
            <View
              key={medication.id}
              className="flex-row items-center justify-between gap-2 border-b border-brand-border py-2 dark:border-night-border"
            >
              <View className="flex-1 gap-0.5">
                <Text className="text-sm font-bold">
                  {medication.name}
                  {medication.dose ? ` — ${medication.dose}` : ''}
                </Text>
                <Text className="text-sm font-bold" style={{ color: SUPPLY_SEVERITY_COLORS[severity] }}>
                  {SUPPLY_SEVERITY_LABELS[severity]} — {medication.current_quantity} {medication.inventory_unit} remaining
                </Text>
              </View>
              <Button
                label="Refill"
                size="compact"
                accessibilityLabel={`Refill ${medication.name}`}
                onPress={() => {
                  onClose();
                  router.push(`/medications/${medication.id}?action=refill`);
                }}
              />
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Dismiss alert for ${medication.name}`}
                onPress={() => onDismiss(medication.id)}
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}
