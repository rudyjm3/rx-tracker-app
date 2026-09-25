import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  activateMedication,
  deactivateMedication,
  getMedication,
  updateMedication,
  type MedicationInput,
  type ScheduleTimeInput,
} from '@/lib/medications';
import { MEDICATION_TYPE_LABELS, MEDICATION_TYPE_OPTIONS } from '@/lib/medication-ui';
import type { Medication, MedicationType, ScheduleMode } from '@/lib/types/medications';
import { daysUntilRunout, scheduleSummary, to12h } from '@/lib/utils';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [medication, setMedication] = useState<Medication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMedication(await getMedication(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load medication');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleToggleActive() {
    if (!medication) return;
    const action = medication.active ? 'Discontinue' : 'Resume';
    Alert.alert(`${action} ${medication.name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: medication.active ? 'destructive' : 'default',
        onPress: async () => {
          try {
            if (medication.active) await deactivateMedication(medication.id);
            else await activateMedication(medication.id);
            await load();
          } catch (e) {
            Alert.alert('Failed', e instanceof Error ? e.message : 'Something went wrong');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (error || !medication) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText style={styles.error}>{error ?? 'Medication not found'}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (editing) {
    return (
      <EditForm
        medication={medication}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          await load();
        }}
      />
    );
  }

  const hasInventory = medication.inventory_enabled && medication.starting_quantity;
  const daysLeft = hasInventory ? daysUntilRunout(medication) : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            {medication.name}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{medication.dose || MEDICATION_TYPE_LABELS[medication.medication_type]}</ThemedText>

          {!medication.active && (
            <ThemedView type="backgroundSelected" style={styles.inactiveBanner}>
              <ThemedText type="small">Discontinued</ThemedText>
            </ThemedView>
          )}

          <DetailRow label="Type" value={MEDICATION_TYPE_LABELS[medication.medication_type]} />
          <DetailRow label="Schedule" value={scheduleSummary(medication)} />
          {medication.instructions ? <DetailRow label="Instructions" value={medication.instructions} /> : null}
          <DetailRow
            label="Dose per intake"
            value={`${medication.quantity_per_dose} ${medication.inventory_unit || (medication.quantity_per_dose === 1 ? 'unit' : 'units')}`}
          />

          {hasInventory && (
            <DetailRow
              label="Inventory"
              value={`${medication.current_quantity ?? 0} of ${medication.starting_quantity} ${medication.inventory_unit} left${
                daysLeft != null ? ` · ~${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : ''
              }${(medication.current_quantity ?? 0) <= medication.low_supply_threshold ? ' · Low supply' : ''}`}
            />
          )}

          <View style={styles.actions}>
            <Pressable style={styles.primaryButton} onPress={() => setEditing(true)}>
              <ThemedText style={styles.primaryButtonText}>Edit</ThemedText>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleToggleActive}>
              <ThemedText style={styles.secondaryButtonText}>
                {medication.active ? 'Discontinue' : 'Resume'}
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText>{value}</ThemedText>
    </View>
  );
}

interface EditFormState {
  name: string;
  doseAmount: string;
  doseUnit: string;
  doseForm: string;
  medicationType: MedicationType;
  instructions: string;
  asNeeded: boolean;
  scheduleMode: ScheduleMode;
  times: ScheduleTimeFormEntry[]; // fixed_times mode
  intervalHours: string;
  firstDoseTime: string;
  quantityPerDose: string;
  inventoryEnabled: boolean;
  inventoryUnit: string;
  startingQuantity: string;
  lowSupplyThreshold: string;
}

// A per-time quantity_per_dose override isn't editable in this form yet,
// but it must still round-trip through save — otherwise an unrelated edit
// silently resets every schedule row's override to the medication-wide
// default (updateMedication deletes and reinserts all individual schedule
// rows on every save).
interface ScheduleTimeFormEntry {
  time: string; // "HH:MM"
  quantityPerDose: number | null;
}

function toFormState(med: Medication): EditFormState {
  return {
    name: med.name,
    doseAmount: med.dose_amount != null ? String(med.dose_amount) : '',
    doseUnit: med.dose_unit ?? '',
    doseForm: med.dose_form ?? '',
    medicationType: med.medication_type,
    instructions: med.instructions ?? '',
    asNeeded: med.as_needed,
    scheduleMode: med.schedule_mode,
    times: (med.medication_schedule_times ?? [])
      .filter((t) => !t.group_id)
      .map((t) => ({ time: t.reminder_time.slice(0, 5), quantityPerDose: t.quantity_per_dose }))
      .sort((a, b) => a.time.localeCompare(b.time)),
    intervalHours: med.interval_hours != null ? String(med.interval_hours) : '',
    firstDoseTime: med.first_dose_time ? med.first_dose_time.slice(0, 5) : '',
    quantityPerDose: String(med.quantity_per_dose),
    inventoryEnabled: med.inventory_enabled,
    inventoryUnit: med.inventory_unit ?? '',
    startingQuantity: med.starting_quantity != null ? String(med.starting_quantity) : '',
    lowSupplyThreshold: String(med.low_supply_threshold),
  };
}

function EditForm({
  medication,
  onCancel,
  onSaved,
}: {
  medication: Medication;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<EditFormState>(() => toFormState(medication));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof EditFormState>(key: K, value: EditFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addTime() {
    update('times', [...form.times, { time: '08:00', quantityPerDose: null }]);
  }
  function removeTime(index: number) {
    update('times', form.times.filter((_, i) => i !== index));
  }
  function updateTime(index: number, value: string) {
    update('times', form.times.map((t, i) => (i === index ? { ...t, time: value } : t)));
  }

  async function handleSave() {
    setFormError(null);

    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!form.asNeeded && form.scheduleMode === 'fixed_times') {
      const invalid = form.times.find((t) => !TIME_RE.test(t.time));
      if (invalid !== undefined) {
        setFormError(`"${invalid.time}" isn't a valid time — use HH:MM (24h).`);
        return;
      }
    }
    if (!form.asNeeded && form.scheduleMode === 'interval') {
      if (!form.intervalHours || Number(form.intervalHours) <= 0) {
        setFormError('Enter a valid interval in hours.');
        return;
      }
      // generateDaySlots only generates interval slots when
      // first_dose_time is set — an empty one here would save fine but
      // silently drop the medication from every schedule/dashboard view.
      if (!form.firstDoseTime || !TIME_RE.test(form.firstDoseTime)) {
        setFormError('First dose time is required for interval schedules — use HH:MM (24h).');
        return;
      }
    }
    const quantityPerDose = Number(form.quantityPerDose);
    if (!Number.isFinite(quantityPerDose) || quantityPerDose <= 0) {
      setFormError('Dose quantity must be a positive number.');
      return;
    }

    const input: MedicationInput = {
      name: form.name.trim(),
      dose_amount: form.doseAmount ? Number(form.doseAmount) : null,
      dose_unit: form.doseUnit.trim() || null,
      dose_form: form.doseForm.trim() || null,
      instructions: form.instructions,
      medication_type: form.medicationType,
      as_needed: form.asNeeded,
      schedule_mode: form.scheduleMode,
      interval_hours: form.scheduleMode === 'interval' && form.intervalHours ? Number(form.intervalHours) : null,
      first_dose_time: form.scheduleMode === 'interval' && form.firstDoseTime ? form.firstDoseTime : null,
      inventory_enabled: form.inventoryEnabled,
      inventory_type: medication.inventory_type,
      inventory_unit: form.inventoryUnit.trim() || medication.inventory_unit,
      starting_quantity: form.startingQuantity ? Number(form.startingQuantity) : null,
      quantity_per_dose: quantityPerDose,
      low_supply_threshold: form.lowSupplyThreshold ? Number(form.lowSupplyThreshold) : 0,
      feedback_type: medication.feedback_type,
      dashboard_enabled: medication.dashboard_enabled,
      reminders_enabled: medication.reminders_enabled,
      adherence_enabled: medication.adherence_enabled,
      profile_id: medication.profile_id,
    };

    const scheduleTimes: ScheduleTimeInput[] =
      !form.asNeeded && form.scheduleMode === 'fixed_times'
        ? form.times.map((t) => ({ reminder_time: t.time, quantity_per_dose: t.quantityPerDose }))
        : [];

    setSaving(true);
    try {
      await updateMedication(medication.id, input, scheduleTimes);
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Edit medication
          </ThemedText>

          {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

          <FieldLabel>Name</FieldLabel>
          <TextInput style={styles.input} value={form.name} onChangeText={(v) => update('name', v)} />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <FieldLabel>Dose amount</FieldLabel>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={form.doseAmount}
                onChangeText={(v) => update('doseAmount', v)}
              />
            </View>
            <View style={styles.rowItem}>
              <FieldLabel>Dose unit</FieldLabel>
              <TextInput style={styles.input} value={form.doseUnit} onChangeText={(v) => update('doseUnit', v)} placeholder="mg" />
            </View>
          </View>

          <FieldLabel>Type</FieldLabel>
          <View style={styles.segmented}>
            {MEDICATION_TYPE_OPTIONS.map((type) => (
              <Pressable
                key={type}
                style={[styles.segmentButton, form.medicationType === type && styles.segmentButtonActive]}
                onPress={() => update('medicationType', type)}
              >
                <ThemedText type="small" style={form.medicationType === type ? styles.segmentTextActive : styles.segmentText}>
                  {MEDICATION_TYPE_LABELS[type]}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <FieldLabel>Instructions</FieldLabel>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={form.instructions}
            onChangeText={(v) => update('instructions', v)}
            multiline
          />

          <View style={styles.switchRow}>
            <ThemedText>As needed (PRN)</ThemedText>
            <Switch value={form.asNeeded} onValueChange={(v) => update('asNeeded', v)} />
          </View>

          {!form.asNeeded && (
            <>
              <FieldLabel>Schedule</FieldLabel>
              <View style={styles.segmented}>
                <Pressable
                  style={[styles.segmentButton, form.scheduleMode === 'fixed_times' && styles.segmentButtonActive]}
                  onPress={() => update('scheduleMode', 'fixed_times')}
                >
                  <ThemedText type="small" style={form.scheduleMode === 'fixed_times' ? styles.segmentTextActive : styles.segmentText}>
                    Fixed times
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.segmentButton, form.scheduleMode === 'interval' && styles.segmentButtonActive]}
                  onPress={() => update('scheduleMode', 'interval')}
                >
                  <ThemedText type="small" style={form.scheduleMode === 'interval' ? styles.segmentTextActive : styles.segmentText}>
                    Interval
                  </ThemedText>
                </Pressable>
              </View>

              {form.scheduleMode === 'fixed_times' ? (
                <View style={styles.timesList}>
                  {form.times.map((t, i) => (
                    <View key={i} style={styles.timeRow}>
                      <TextInput
                        style={[styles.input, styles.timeInput]}
                        value={t.time}
                        onChangeText={(v) => updateTime(i, v)}
                        placeholder="HH:MM"
                      />
                      <ThemedText type="small" themeColor="textSecondary">
                        {TIME_RE.test(t.time) ? to12h(t.time) : ''}
                      </ThemedText>
                      <Pressable onPress={() => removeTime(i)} hitSlop={8}>
                        <ThemedText style={styles.removeTime}>Remove</ThemedText>
                      </Pressable>
                    </View>
                  ))}
                  <Pressable onPress={addTime}>
                    <ThemedText style={styles.addTime}>+ Add time</ThemedText>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <FieldLabel>Every (hours)</FieldLabel>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={form.intervalHours}
                      onChangeText={(v) => update('intervalHours', v)}
                    />
                  </View>
                  <View style={styles.rowItem}>
                    <FieldLabel>First dose (HH:MM)</FieldLabel>
                    <TextInput
                      style={styles.input}
                      value={form.firstDoseTime}
                      onChangeText={(v) => update('firstDoseTime', v)}
                      placeholder="08:00"
                    />
                  </View>
                </View>
              )}
            </>
          )}

          <FieldLabel>Dose quantity per intake</FieldLabel>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={form.quantityPerDose}
            onChangeText={(v) => update('quantityPerDose', v)}
          />

          <View style={styles.switchRow}>
            <ThemedText>Track inventory</ThemedText>
            <Switch value={form.inventoryEnabled} onValueChange={(v) => update('inventoryEnabled', v)} />
          </View>

          {form.inventoryEnabled && (
            <>
              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <FieldLabel>Starting quantity</FieldLabel>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={form.startingQuantity}
                    onChangeText={(v) => update('startingQuantity', v)}
                    editable={!medication.inventory_enabled}
                  />
                </View>
                <View style={styles.rowItem}>
                  <FieldLabel>Unit</FieldLabel>
                  <TextInput style={styles.input} value={form.inventoryUnit} onChangeText={(v) => update('inventoryUnit', v)} placeholder="pills" />
                </View>
              </View>
              {medication.inventory_enabled && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                  Current balance is tracked separately by doses/refills — starting quantity can&apos;t be edited once tracking is on.
                </ThemedText>
              )}
              <FieldLabel>Low supply threshold</FieldLabel>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={form.lowSupplyThreshold}
                onChangeText={(v) => update('lowSupplyThreshold', v)}
              />
            </>
          )}

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onCancel} disabled={saving}>
              <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
            </Pressable>
            <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.primaryButtonText}>Save</ThemedText>}
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.one },
  title: { fontSize: 24, lineHeight: 30, marginBottom: Spacing.half },
  error: { color: '#D0342C', marginVertical: Spacing.two },
  inactiveBanner: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2, marginTop: Spacing.two },
  detailRow: { marginTop: Spacing.three, gap: 2 },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  primaryButton: { flex: 1, backgroundColor: '#208AEF', borderRadius: Spacing.two, paddingVertical: Spacing.three, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: '#8A8F99', borderRadius: Spacing.two, paddingVertical: Spacing.three, alignItems: 'center' },
  secondaryButtonText: { fontWeight: '600' },
  disabled: { opacity: 0.6 },
  fieldLabel: { marginTop: Spacing.three, marginBottom: Spacing.one },
  input: { borderWidth: 1, borderColor: '#8A8F99', borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: Spacing.two },
  rowItem: { flex: 1 },
  segmented: { flexDirection: 'row', backgroundColor: '#F0F0F3', borderRadius: Spacing.two, padding: 2 },
  segmentButton: { flex: 1, paddingVertical: Spacing.two, alignItems: 'center', borderRadius: Spacing.one },
  segmentButtonActive: { backgroundColor: '#ffffff' },
  segmentText: { color: '#60646C' },
  segmentTextActive: { color: '#000000' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.three },
  timesList: { gap: Spacing.two, marginTop: Spacing.one },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  timeInput: { width: 100 },
  removeTime: { color: '#D0342C', marginLeft: 'auto' },
  addTime: { color: '#208AEF', fontWeight: '600', marginTop: Spacing.one },
  hint: { marginTop: Spacing.one },
});
