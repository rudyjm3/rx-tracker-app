import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { getActiveMedications, getInactiveMedications } from '@/lib/medications';
import { MEDICATION_TYPE_COLORS, MEDICATION_TYPE_LABELS } from '@/lib/medication-ui';
import type { Medication } from '@/lib/types/medications';
import { daysUntilRunout, scheduleSummary } from '@/lib/utils';

type ListTab = 'active' | 'inactive';

export default function MedicationsScreen() {
  const [tab, setTab] = useState<ListTab>('active');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (activeTab: ListTab, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data =
        activeTab === 'active' ? await getActiveMedications(null) : await getInactiveMedications(null);
      setMedications(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load medications');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [tab, load]),
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.title}>
            Medications
          </ThemedText>
          <Pressable
            style={styles.addButton}
            onPress={() => router.push('/medications/new')}
            hitSlop={8}
            accessibilityLabel="Add medication"
          >
            <ThemedText style={styles.addButtonText}>+</ThemedText>
          </Pressable>
        </View>

        <View style={styles.segmented}>
          <SegmentButton label="Active" active={tab === 'active'} onPress={() => setTab('active')} />
          <SegmentButton label="Inactive" active={tab === 'inactive'} onPress={() => setTab('inactive')} />
        </View>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {loading ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(tab, true)} />}
          >
            {medications.length === 0 && (
              <ThemedText themeColor="textSecondary">
                {tab === 'active' ? 'No active medications yet.' : 'No inactive medications.'}
              </ThemedText>
            )}
            {medications.map((med) => (
              <MedicationCard key={med.id} medication={med} />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.segmentButton, active && styles.segmentButtonActive]} onPress={onPress}>
      <ThemedText type="smallBold" style={active ? styles.segmentTextActive : styles.segmentText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function MedicationCard({ medication }: { medication: Medication }) {
  const hasInventory = medication.inventory_enabled && medication.starting_quantity;
  const current = medication.current_quantity ?? 0;
  const starting = medication.starting_quantity ?? 0;
  const fraction = hasInventory && starting > 0 ? Math.max(0, Math.min(1, current / starting)) : 0;
  const isLowSupply = hasInventory && current <= medication.low_supply_threshold;
  const daysLeft = hasInventory ? daysUntilRunout(medication) : null;

  return (
    <Pressable onPress={() => router.push(`/medications/${medication.id}`)}>
      <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold" style={styles.medName}>
          {medication.name}
          {medication.dose ? ` — ${medication.dose}` : ''}
        </ThemedText>
        <View style={[styles.typeBadge, { backgroundColor: MEDICATION_TYPE_COLORS[medication.medication_type] + '22' }]}>
          <ThemedText type="small" style={{ color: MEDICATION_TYPE_COLORS[medication.medication_type], fontWeight: '700' }}>
            {MEDICATION_TYPE_LABELS[medication.medication_type]}
          </ThemedText>
        </View>
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {scheduleSummary(medication)}
      </ThemedText>

      {medication.instructions ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.instructions}>
          {medication.instructions}
        </ThemedText>
      ) : null}

      {hasInventory && (
        <View style={styles.inventorySection}>
          <View style={styles.inventoryBarTrack}>
            <View
              style={[
                styles.inventoryBarFill,
                { width: `${fraction * 100}%`, backgroundColor: isLowSupply ? Brand.danger : Brand.success },
              ]}
            />
          </View>
          <ThemedText type="small" themeColor={isLowSupply ? undefined : 'textSecondary'} style={isLowSupply ? styles.lowSupplyText : undefined}>
            {current} {medication.inventory_unit} left
            {daysLeft != null ? ` · ~${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : ''}
            {isLowSupply ? ' · Low supply' : ''}
          </ThemedText>
        </View>
      )}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  title: { fontSize: 28, lineHeight: 34 },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Brand.deepBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: '#ffffff', fontSize: 22, lineHeight: 24, fontWeight: '600' },
  segmented: { flexDirection: 'row', backgroundColor: Brand.bg, borderRadius: BorderRadius.sm, padding: 2, marginBottom: Spacing.three },
  segmentButton: { flex: 1, paddingVertical: Spacing.two, alignItems: 'center', borderRadius: Spacing.one },
  segmentButtonActive: { backgroundColor: Brand.card },
  segmentText: { color: Brand.textMuted },
  segmentTextActive: { color: Brand.text },
  error: { color: Brand.danger, marginBottom: Spacing.two },
  loading: { marginTop: Spacing.five },
  scrollContent: { gap: Spacing.three, paddingBottom: Spacing.six },
  card: { borderRadius: BorderRadius.md, padding: Spacing.three, gap: Spacing.one },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.two },
  medName: { flex: 1 },
  typeBadge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  instructions: { marginTop: Spacing.half },
  inventorySection: { marginTop: Spacing.two, gap: Spacing.one },
  inventoryBarTrack: { height: 6, borderRadius: 3, backgroundColor: Brand.border, overflow: 'hidden' },
  inventoryBarFill: { height: '100%', borderRadius: 3 },
  lowSupplyText: { color: Brand.danger, fontWeight: '600' },
});
