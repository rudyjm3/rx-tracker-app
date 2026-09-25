import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/active-profile';
import { createMedication, type MedicationInput, type ScheduleTimeInput } from '@/lib/medications';
import { MEDICATION_TYPE_LABELS, MEDICATION_TYPE_OPTIONS } from '@/lib/medication-ui';
import { resyncIfRemindersEnabled } from '@/lib/notifications';
import type { MedicationType, ScheduleMode } from '@/lib/types/medications';
import { to12h } from '@/lib/utils';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

interface NewMedicationFormState {
  name: string;
  doseAmount: string;
  doseUnit: string;
  doseForm: string;
  medicationType: MedicationType;
  instructions: string;
  asNeeded: boolean;
  scheduleMode: ScheduleMode;
  times: { time: string }[];
  intervalHours: string;
  firstDoseTime: string;
  quantityPerDose: string;
  inventoryEnabled: boolean;
  inventoryUnit: string;
  startingQuantity: string;
  lowSupplyThreshold: string;
}

// Matches rx-tracker-web's components/medications/wizard/schema.ts
// defaultFormValues, scoped to the fields this single-screen form covers.
const initialState: NewMedicationFormState = {
  name: '',
  doseAmount: '',
  doseUnit: '',
  doseForm: '',
  medicationType: 'prescription',
  instructions: '',
  asNeeded: false,
  scheduleMode: 'fixed_times',
  times: [],
  intervalHours: '',
  firstDoseTime: '',
  quantityPerDose: '1',
  inventoryEnabled: false,
  inventoryUnit: 'tablets',
  startingQuantity: '',
  lowSupplyThreshold: '5',
};

export default function NewMedicationScreen() {
  const { activeProfileId } = useActiveProfile();
  const [form, setForm] = useState<NewMedicationFormState>(initialState);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof NewMedicationFormState>(key: K, value: NewMedicationFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addTime() {
    update('times', [...form.times, { time: '08:00' }]);
  }
  function removeTime(index: number) {
    update('times', form.times.filter((_, i) => i !== index));
  }
  function updateTime(index: number, value: string) {
    update('times', form.times.map((t, i) => (i === index ? { ...t, time: value } : t)));
  }

  async function handleCreate() {
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
      if (form.times.length === 0) {
        setFormError('Add at least one reminder time.');
        return;
      }
      const uniqueTimes = new Set(form.times.map((t) => t.time));
      if (uniqueTimes.size !== form.times.length) {
        setFormError('Reminder times must be unique.');
        return;
      }
    }
    if (!form.asNeeded && form.scheduleMode === 'interval') {
      const intervalHours = Number(form.intervalHours);
      if (!form.intervalHours || !Number.isFinite(intervalHours) || intervalHours <= 0) {
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
    if (form.inventoryEnabled) {
      const startingQuantity = Number(form.startingQuantity);
      if (!form.startingQuantity || !Number.isFinite(startingQuantity) || startingQuantity < 0) {
        setFormError('Starting quantity must be zero or greater.');
        return;
      }
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
      inventory_type: 'pills',
      inventory_unit: form.inventoryUnit.trim() || 'tablets',
      starting_quantity: form.inventoryEnabled && form.startingQuantity ? Number(form.startingQuantity) : null,
      quantity_per_dose: quantityPerDose,
      low_supply_threshold: form.lowSupplyThreshold ? Number(form.lowSupplyThreshold) : 0,
      feedback_type: 'none',
      dashboard_enabled: true,
      reminders_enabled: true,
      adherence_enabled: true,
      profile_id: activeProfileId,
    };

    const scheduleTimes: ScheduleTimeInput[] =
      !form.asNeeded && form.scheduleMode === 'fixed_times'
        ? form.times.map((t) => ({ reminder_time: t.time, quantity_per_dose: null }))
        : [];

    setSaving(true);
    try {
      const created = await createMedication(input, scheduleTimes);
      resyncIfRemindersEnabled();
      router.replace(`/medications/${created.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create medication');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            New medication
          </ThemedText>

          {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

          <FieldLabel>Name</FieldLabel>
          <TextInput style={styles.input} value={form.name} onChangeText={(v) => update('name', v)} placeholder="e.g. Lisinopril" />

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

          <FieldLabel>Dose form</FieldLabel>
          <TextInput style={styles.input} value={form.doseForm} onChangeText={(v) => update('doseForm', v)} placeholder="tablet" />

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
                  />
                </View>
                <View style={styles.rowItem}>
                  <FieldLabel>Unit</FieldLabel>
                  <TextInput style={styles.input} value={form.inventoryUnit} onChangeText={(v) => update('inventoryUnit', v)} placeholder="pills" />
                </View>
              </View>
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
            <Pressable style={styles.secondaryButton} onPress={() => router.back()} disabled={saving}>
              <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
            </Pressable>
            <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.primaryButtonText}>Create</ThemedText>}
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
  scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.one },
  title: { fontSize: 24, lineHeight: 30, marginBottom: Spacing.half },
  error: { color: Brand.danger, marginVertical: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  primaryButton: { flex: 1, backgroundColor: Brand.deepBlue, borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: Brand.border, borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center' },
  secondaryButtonText: { fontWeight: '600' },
  disabled: { opacity: 0.6 },
  fieldLabel: { marginTop: Spacing.three, marginBottom: Spacing.one },
  input: { borderWidth: 1, borderColor: Brand.border, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: Spacing.two },
  rowItem: { flex: 1 },
  segmented: { flexDirection: 'row', backgroundColor: Brand.bg, borderRadius: BorderRadius.sm, padding: 2 },
  segmentButton: { flex: 1, paddingVertical: Spacing.two, alignItems: 'center', borderRadius: Spacing.one },
  segmentButtonActive: { backgroundColor: Brand.card },
  segmentText: { color: Brand.textMuted },
  segmentTextActive: { color: Brand.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.three },
  timesList: { gap: Spacing.two, marginTop: Spacing.one },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  timeInput: { width: 100 },
  removeTime: { color: Brand.danger, marginLeft: 'auto' },
  addTime: { color: Brand.deepBlue, fontWeight: '600', marginTop: Spacing.one },
});
