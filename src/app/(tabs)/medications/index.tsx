import { useCallback, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLowSupplyAlerts } from '@/hooks/use-low-supply-alerts';
import { LowSupplyBanner } from '@/components/LowSupplyBanner';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useActiveProfile } from '@/lib/active-profile';
import {
  getActiveMedications,
  getGroupDoseOverridesByMedication,
  getInactiveMedications,
} from '@/lib/medications';
import { MEDICATION_TYPE_COLORS, MEDICATION_TYPE_LABELS } from '@/lib/medication-ui';
import type { Medication } from '@/lib/types/medications';
import { daysUntilRunout, scheduleSummary, type GroupDoseOverride } from '@/lib/utils';

// Date-only fields (start_date/created_at's date portion) must be parsed in
// local time, not UTC — a UTC-midnight parse displays one day earlier for
// anyone west of UTC. Same fix pattern as rx-tracker-web's MedicationCard
// formatMedDate.
function formatMedDate(value: string | null | undefined): string {
  if (!value) return '—';
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type ListTab = 'active' | 'inactive';

export default function MedicationsScreen() {
  const theme = useTheme();
  const styles = getStyles(theme);
  const { activeProfileId, familyProfiles } = useActiveProfile();
  const [tab, setTab] = useState<ListTab>('active');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doseOverrides, setDoseOverrides] = useState<Map<string, GroupDoseOverride[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const { alerts: supplyAlerts, dismiss: dismissSupply } = useLowSupplyAlerts(medications);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // See the Dashboard's identical guard: bumped on every load() call so a
  // slower, stale response (e.g. from a profile that's no longer selected)
  // can't overwrite state a newer call already set.
  const requestIdRef = useRef(0);

  const load = useCallback(async (activeTab: ListTab, isRefresh = false) => {
    const requestId = ++requestIdRef.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [data, overrides] = await Promise.all([
        activeTab === 'active'
          ? getActiveMedications(activeProfileId)
          : getInactiveMedications(activeProfileId),
        getGroupDoseOverridesByMedication(activeProfileId),
      ]);
      if (requestIdRef.current !== requestId) return;
      setMedications(data);
      setDoseOverrides(overrides);
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      setError(e instanceof Error ? e.message : 'Failed to load medications');
    } finally {
      if (requestIdRef.current !== requestId) return;
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [activeProfileId]);

  // load() (and this callback) changes identity whenever activeProfileId
  // or tab changes, and useFocusEffect re-invokes its callback on identity
  // changes while the screen is already focused (not just on focus
  // transitions) — so switching profiles from the chip row here reloads
  // immediately, not just the next time this screen regains focus.
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
          <View style={styles.titleActions}>
            <Pressable style={styles.groupsButton} onPress={() => router.push('/groups')} hitSlop={8}>
              <ThemedText type="small" style={styles.groupsButtonText}>
                Manage groups
              </ThemedText>
            </Pressable>
            <Pressable
              style={styles.addButton}
              onPress={() => router.push('/medications/new')}
              hitSlop={8}
              accessibilityLabel="Add medication"
            >
              <ThemedText style={styles.addButtonText}>+</ThemedText>
            </Pressable>
          </View>
        </View>

        {familyProfiles.length > 0 && <ProfileSwitcher />}

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
            <LowSupplyBanner alerts={supplyAlerts} onDismiss={dismissSupply} />

            {medications.length === 0 && (
              <ThemedText themeColor="textSecondary">
                {tab === 'active' ? 'No active medications yet.' : 'No inactive medications.'}
              </ThemedText>
            )}
            {medications.map((med) => (
              <MedicationCard key={med.id} medication={med} groupDoseOverrides={doseOverrides.get(med.id)} />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = getStyles(useTheme());
  return (
    <Pressable style={[styles.segmentButton, active && styles.segmentButtonActive]} onPress={onPress}>
      <ThemedText type="smallBold" style={active ? styles.segmentTextActive : styles.segmentText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function MedicationCard({
  medication,
  groupDoseOverrides,
}: {
  medication: Medication;
  groupDoseOverrides?: GroupDoseOverride[];
}) {
  const theme = useTheme();
  const styles = getStyles(theme);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasInventory = medication.inventory_enabled && medication.starting_quantity != null;
  const current = medication.current_quantity ?? 0;
  const starting = medication.starting_quantity ?? 0;
  const fraction = hasInventory && starting > 0 ? Math.max(0, Math.min(1, current / starting)) : 0;
  const isLowSupply = hasInventory && current <= medication.low_supply_threshold;
  const daysLeft = hasInventory ? daysUntilRunout(medication, groupDoseOverrides) : null;

  function goToDetail(action?: string) {
    setMenuOpen(false);
    router.push(action ? `/medications/${medication.id}?action=${action}` : `/medications/${medication.id}`);
  }

  return (
    <Pressable onPress={() => goToDetail()}>
      <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold" style={styles.medName}>
          {medication.name}
          {medication.dose ? ` — ${medication.dose}` : ''}
        </ThemedText>
        <View style={styles.badgeGroup}>
          {isLowSupply && (
            <View style={[styles.typeBadge, { backgroundColor: Brand.warning + '22' }]}>
              <ThemedText type="small" style={{ color: Brand.warning, fontWeight: '700' }}>
                Low supply
              </ThemedText>
            </View>
          )}
          <View style={[styles.typeBadge, { backgroundColor: MEDICATION_TYPE_COLORS[medication.medication_type] + '22' }]}>
            <ThemedText type="small" style={{ color: MEDICATION_TYPE_COLORS[medication.medication_type], fontWeight: '700' }}>
              {MEDICATION_TYPE_LABELS[medication.medication_type]}
            </ThemedText>
          </View>
          <Pressable
            style={styles.menuButton}
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            accessibilityLabel={`${medication.name} actions`}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={theme.textSecondary} />
          </Pressable>
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

      <ThemedText type="small" themeColor="textSecondary" style={styles.datesText}>
        Started: {formatMedDate(medication.start_date ?? medication.created_at)}
        {medication.end_date ? ` · Ended: ${formatMedDate(medication.end_date)}` : ''}
      </ThemedText>
      </ThemedView>

      <MedicationActionsMenu
        visible={menuOpen}
        medication={medication}
        hasInventory={hasInventory}
        onClose={() => setMenuOpen(false)}
        onAction={goToDetail}
      />
    </Pressable>
  );
}

function MedicationActionsMenu({
  visible,
  medication,
  hasInventory,
  onClose,
  onAction,
}: {
  visible: boolean;
  medication: Medication;
  hasInventory: boolean;
  onClose: () => void;
  onAction: (action?: string) => void;
}) {
  const styles = getStyles(useTheme());
  if (!visible) return null;

  const items: { label: string; action?: string; destructive?: boolean }[] = medication.active
    ? [
        { label: 'Edit', action: 'edit' },
        { label: 'Log Dose', action: 'logDose' },
        ...(hasInventory
          ? [
              { label: 'Log Refill', action: 'refill' },
              { label: 'Adjust Quantity', action: 'adjust' },
            ]
          : []),
        { label: 'Update Prescribed Dose', action: 'updateDose' },
        { label: 'Side Effects', action: 'sideEffects' },
        { label: 'Discontinue Use', action: 'discontinue', destructive: true },
      ]
    : [{ label: 'Reactivate', action: 'resume' }];

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <Pressable style={styles.menuSheetWrapper} onPress={(e) => e.stopPropagation()}>
          <ThemedView style={styles.menuSheet}>
            <SafeAreaView edges={['bottom']}>
              <ThemedText type="smallBold" style={styles.menuTitle}>
                {medication.name}
              </ThemedText>
              {items.map((item) => (
                <Pressable key={item.label} style={styles.menuRow} onPress={() => onAction(item.action)}>
                  <ThemedText style={item.destructive ? styles.menuRowDestructive : undefined}>
                    {item.label}
                  </ThemedText>
                </Pressable>
              ))}
              <Pressable style={styles.menuCancel} onPress={onClose}>
                <ThemedText style={styles.menuCancelText}>Cancel</ThemedText>
              </Pressable>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  // flexWrap lets the "Manage groups" + add-medication controls drop to
  // their own row instead of clipping/overlapping the title on narrow
  // screens or with larger accessibility text sizes — three items
  // (title, groups button, add button) don't reliably fit one row at
  // 320pt width the way Calendar's title + single button do.
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.two, alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  title: { fontSize: 28, lineHeight: 34 },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  groupsButton: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  groupsButtonText: { color: Brand.deepBlue, fontWeight: '600' },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Brand.deepBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: '#ffffff', fontSize: 22, lineHeight: 24, fontWeight: '600' },
  segmented: { flexDirection: 'row', backgroundColor: theme.backgroundSelected, borderRadius: BorderRadius.sm, padding: 2, marginBottom: Spacing.three },
  segmentButton: { flex: 1, paddingVertical: Spacing.two, alignItems: 'center', borderRadius: Spacing.one },
  segmentButtonActive: { backgroundColor: theme.backgroundElement },
  segmentText: { color: theme.textSecondary },
  segmentTextActive: { color: theme.text },
  error: { color: Brand.danger, marginBottom: Spacing.two },
  loading: { marginTop: Spacing.five },
  scrollContent: { gap: Spacing.three, paddingBottom: Spacing.six },
  card: {
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    gap: Spacing.one,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.two },
  medName: { flex: 1 },
  badgeGroup: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  typeBadge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  menuButton: { padding: 2 },
  instructions: { marginTop: Spacing.half },
  inventorySection: { marginTop: Spacing.two, gap: Spacing.one },
  inventoryBarTrack: { height: 6, borderRadius: 3, backgroundColor: theme.border, overflow: 'hidden' },
  inventoryBarFill: { height: '100%', borderRadius: 3 },
  lowSupplyText: { color: Brand.danger, fontWeight: '600' },
  datesText: { marginTop: Spacing.one },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheetWrapper: { maxHeight: '70%' },
  menuSheet: { borderTopLeftRadius: Spacing.four, borderTopRightRadius: Spacing.four, padding: Spacing.four },
  menuTitle: { marginBottom: Spacing.two },
  menuRow: { paddingVertical: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  menuRowDestructive: { color: Brand.danger },
  menuCancel: { marginTop: Spacing.two, alignItems: 'center', paddingVertical: Spacing.two },
  menuCancelText: { fontWeight: '600', color: Brand.deepBlue },
});
}
