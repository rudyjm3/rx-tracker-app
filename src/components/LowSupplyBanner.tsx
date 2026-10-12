// Reminder card for a low-supply medication — the mobile counterpart of
// rx-tracker-web's components/dashboard/LowSupplyBanner.tsx. Dismiss (swipe
// or X) is per-medication per-day and account-wide; see
// lib/low-supply-dismissals.ts.
import { useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Animated, PanResponder, Pressable, View } from 'react-native';

import { GradientFill } from '@/components/ui/gradient-fill';
import { Text } from '@/components/ui/text';
import { SUPPLY_SEVERITY_LABELS, type SupplyAlert } from '@/lib/medication-ui';

const DISMISS_DISTANCE = 100;

export function LowSupplyBanner({
  alerts,
  onDismiss,
}: {
  alerts: SupplyAlert[];
  onDismiss: (medicationId: string) => void;
}) {
  if (alerts.length === 0) return null;

  return (
    <View className="gap-2">
      {alerts.map((alert) => (
        <ReminderCard key={alert.medication.id} alert={alert} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

// Gradient refill reminder, DESIGN.md 10.2: 44 px icon disc, eyebrow, title,
// body, "Refill ›" pill link and a dismiss ×.
function ReminderCard({
  alert,
  onDismiss,
}: {
  alert: SupplyAlert;
  onDismiss: (medicationId: string) => void;
}) {
  const { medication, severity } = alert;
  const [translateX] = useState(() => new Animated.Value(0));

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Only claim clearly horizontal drags so vertical scrolling still works.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: Animated.event([null, { dx: translateX }], { useNativeDriver: false }),
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) >= DISMISS_DISTANCE) {
            Animated.timing(translateX, {
              toValue: g.dx > 0 ? 500 : -500,
              duration: 160,
              useNativeDriver: true,
            }).start(() => onDismiss(medication.id));
          } else {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [translateX, onDismiss, medication.id],
  );

  return (
    <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
      <View className="flex-row gap-3 overflow-hidden rounded-hero p-5 shadow-card">
        <GradientFill name="hero" />
        <View className="h-11 w-11 items-center justify-center rounded-full bg-white/20">
          <Ionicons name="medkit-outline" size={22} color="#FFFFFF" />
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-xs font-semibold uppercase tracking-[2px] text-white/70 dark:text-white/70">
              Reminder · {SUPPLY_SEVERITY_LABELS[severity]}
            </Text>
            <Pressable
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss refill reminder for ${medication.name}`}
              onPress={() => onDismiss(medication.id)}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </View>
          <Text className="text-lg font-bold text-white dark:text-white">
            Refill: {medication.name}
            {medication.dose ? ` ${medication.dose}` : ''}
          </Text>
          <Text className="text-sm text-white/80 dark:text-white/80">
            Pills Left: {medication.current_quantity} {medication.inventory_unit}
          </Text>
          <View className="mt-2 flex-row items-center">
            <Pressable
              className="min-h-11 flex-row items-center gap-1 self-start rounded-full border border-white/30 bg-white/15 px-4 active:bg-white/25"
              accessibilityRole="button"
              accessibilityLabel={`Refill ${medication.name}`}
              onPress={() => router.push(`/medications/${medication.id}?action=refill`)}>
              <Text className="text-sm font-bold text-white dark:text-white">Refill</Text>
              <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
            </Pressable>
            <Text className="ml-3 text-[11px] font-semibold uppercase text-white/60 dark:text-white/60">Swipe to dismiss</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
