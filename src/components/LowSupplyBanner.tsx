// Reminder card for a low-supply medication — the mobile counterpart of
// rx-tracker-web's components/dashboard/LowSupplyBanner.tsx. Dismiss (swipe
// or X) is per-medication per-day and account-wide; see
// lib/low-supply-dismissals.ts.
import { useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
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
    <View style={styles.stack}>
      {alerts.map((alert) => (
        <ReminderCard key={alert.medication.id} alert={alert} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

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
    <Animated.View style={[styles.card, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
      <View style={styles.iconCircle}>
        <Ionicons name="medkit-outline" size={22} color="#FFFFFF" />
      </View>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <ThemedText type="small" style={styles.eyebrow}>
            Reminder · {SUPPLY_SEVERITY_LABELS[severity]}
          </ThemedText>
          <ThemedText type="small" style={styles.swipeHint}>
            Swipe to dismiss
          </ThemedText>
        </View>
        <ThemedText type="smallBold" style={styles.title}>
          Refill: {medication.name}
          {medication.dose ? ` ${medication.dose}` : ''}
        </ThemedText>
        <ThemedText type="small" style={styles.subtitle}>
          Pills Left: {medication.current_quantity} {medication.inventory_unit}
        </ThemedText>
        <View style={styles.actions}>
          <Pressable
            style={styles.refillButton}
            accessibilityRole="button"
            accessibilityLabel={`Refill ${medication.name}`}
            onPress={() => router.push(`/medications/${medication.id}?action=refill`)}
          >
            <ThemedText type="smallBold" style={styles.refillText}>
              Refill
            </ThemedText>
            <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
          </Pressable>
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss refill reminder for ${medication.name}`}
            onPress={() => onDismiss(medication.id)}
          >
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  card: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: BorderRadius.lg,
    backgroundColor: Brand.deepBlue,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  body: { flex: 1, gap: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  eyebrow: { color: 'rgba(255,255,255,0.75)', fontWeight: '700', textTransform: 'uppercase', fontSize: 11 },
  swipeHint: { color: 'rgba(255,255,255,0.75)', fontWeight: '700', textTransform: 'uppercase', fontSize: 11 },
  title: { color: '#FFFFFF', fontSize: 17 },
  subtitle: { color: 'rgba(255,255,255,0.85)' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  refillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  refillText: { color: '#FFFFFF' },
});
