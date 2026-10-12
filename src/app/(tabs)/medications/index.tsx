import { useCallback, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';

import { useLowSupplyAlerts } from '@/hooks/use-low-supply-alerts';
import { LowSupplyBanner } from '@/components/LowSupplyBanner';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MedName } from '@/components/ui/med-name';
import { MedTypeBadge } from '@/components/ui/med-type-badge';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
import { useActiveProfile } from '@/lib/active-profile';
import {
  getActiveMedications,
  getGroupDoseOverridesByMedication,
  getInactiveMedications,
} from '@/lib/medications';
import { cn } from '@/lib/cn';
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
  const { activeProfileId } = useActiveProfile();
  const [tab, setTab] = useState<ListTab>('active');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doseOverrides, setDoseOverrides] = useState<Map<string, GroupDoseOverride[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const { alerts: supplyAlerts, dismiss: dismissSupply, dismissError: supplyDismissError } = useLowSupplyAlerts(medications);
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
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(tab, true)} />}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <ScreenTitle>Medication Plan</ScreenTitle>
      </View>

      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <PillTabs
          tabs={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <View className="flex-row items-center gap-2">
          <Button label="Manage groups" variant="secondary" size="compact" onPress={() => router.push('/groups')} />
          <Button
            label="+ Add medication"
            size="compact"
            accessibilityLabel="Add medication"
            onPress={() => router.push('/medications/new')}
          />
        </View>
      </View>

      {(error ?? supplyDismissError) ? (
        <Text className="text-sm text-status-danger dark:text-status-danger">{error ?? supplyDismissError}</Text>
      ) : null}

      {loading ? (
        <ActivityIndicator className="mt-8" />
      ) : (
        <>
          <LowSupplyBanner alerts={supplyAlerts} onDismiss={dismissSupply} />

          {medications.length === 0 ? (
            <Text muted className="text-sm">
              {tab === 'active' ? 'No medications yet. Add your first one to get started.' : 'No inactive medications.'}
            </Text>
          ) : null}
          {medications.map((med) => (
            <MedicationCard key={med.id} medication={med} groupDoseOverrides={doseOverrides.get(med.id)} />
          ))}
        </>
      )}
    </Screen>
  );
}

function MedicationCard({
  medication,
  groupDoseOverrides,
}: {
  medication: Medication;
  groupDoseOverrides?: GroupDoseOverride[];
}) {
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

  // Standard card (DESIGN.md 8.5): name -> dose -> type badge (+ low-supply
  // pill) and the kebab on one row, then schedule, inventory and dates.
  return (
    <>
      <Pressable accessibilityLabel={`${medication.name} details`} onPress={() => goToDetail()}>
        <Card className="gap-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-1">
              <MedName name={medication.name} dose={medication.dose} />
              <MedTypeBadge type={medication.medication_type} />
              {isLowSupply ? (
                <View className="rounded-full bg-status-warning/10 px-2 py-0.5">
                  <Text className="text-xs font-medium text-status-warning dark:text-status-warning">Low supply</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              className="-mr-2 -mt-2 h-11 w-11 items-center justify-center"
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${medication.name} actions`}>
              <Ionicons name="ellipsis-vertical" size={18} color="#60708A" />
            </Pressable>
          </View>

          <Text muted className="text-sm">
            {scheduleSummary(medication)}
          </Text>

          {medication.instructions ? (
            <Text muted className="mt-0.5 text-sm">
              {medication.instructions}
            </Text>
          ) : null}

          {hasInventory ? (
            <View className="mt-2 gap-1">
              <View className="h-1.5 max-w-xs overflow-hidden rounded-full bg-brand-bg dark:bg-night-selected">
                <View
                  className={cn('h-full rounded-full', isLowSupply ? 'bg-status-danger' : fraction <= 0.5 ? 'bg-status-warning' : 'bg-status-success')}
                  style={{ width: `${fraction * 100}%` }}
                />
              </View>
              <Text muted={!isLowSupply} className={cn('text-xs', isLowSupply && 'font-semibold text-status-danger dark:text-status-danger')}>
                {current} {medication.inventory_unit} left
                {daysLeft != null ? ` · ~${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : ''}
                {isLowSupply ? ' · Low supply' : ''}
              </Text>
            </View>
          ) : null}

          <Text muted className="mt-1 text-xs">
            Started: {formatMedDate(medication.start_date ?? medication.created_at)}
            {medication.end_date ? ` · Ended: ${formatMedDate(medication.end_date)}` : ''}
          </Text>
        </Card>
      </Pressable>

      {menuOpen ? (
        <MedicationActionsMenu
          medication={medication}
          hasInventory={hasInventory}
          onClose={() => setMenuOpen(false)}
          onAction={goToDetail}
        />
      ) : null}
    </>
  );
}

function MedicationActionsMenu({
  medication,
  hasInventory,
  onClose,
  onAction,
}: {
  medication: Medication;
  hasInventory: boolean;
  onClose: () => void;
  onAction: (action?: string) => void;
}) {
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
    <ActionSheet
      title={medication.name}
      onClose={onClose}
      items={items.map((item) => ({
        label: item.label,
        destructive: item.destructive,
        onPress: () => onAction(item.action),
      }))}
    />
  );
}
