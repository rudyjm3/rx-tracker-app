import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { DrugNameAutocomplete } from '@/components/DrugNameAutocomplete';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { SwitchRow } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
import { TimeField } from '@/components/ui/time-field';
import { useActiveProfile } from '@/lib/active-profile';
import type { DrugSuggestion } from '@/lib/dailymed';
import { createMedication, type MedicationInput, type ScheduleTimeInput } from '@/lib/medications';
import { MEDICATION_TYPE_LABELS, MEDICATION_TYPE_OPTIONS } from '@/lib/medication-ui';
import { resyncIfRemindersEnabled } from '@/lib/notifications';
import type { MedicationType, ScheduleMode } from '@/lib/types/medications';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface NewMedicationFormState {
  name: string;
  doseAmount: string;
  doseUnit: string;
  doseForm: string;
  dailymedSetId: string;
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
  endDate: string;
}

// Matches rx-tracker-web's components/medications/wizard/schema.ts
// defaultFormValues, scoped to the fields this single-screen form covers.
const initialState: NewMedicationFormState = {
  name: '',
  doseAmount: '',
  doseUnit: '',
  doseForm: '',
  dailymedSetId: '',
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
  endDate: '',
};

export default function NewMedicationScreen() {
  const { activeProfileId } = useActiveProfile();
  const { fromOnboarding } = useLocalSearchParams<{ fromOnboarding?: string }>();
  const [form, setForm] = useState<NewMedicationFormState>(initialState);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof NewMedicationFormState>(key: K, value: NewMedicationFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // A suggestion is a shortcut, not a lock: it fills the name (without the
  // strength) and, separately, the dose amount/unit and the matched DailyMed
  // SPL set id, all still editable. A pick with no plain per-unit strength
  // (a concentration like "1 mg/mL") leaves the dose fields as they were.
  function applySuggestion(s: DrugSuggestion) {
    setForm((prev) => ({
      ...prev,
      name: s.name,
      ...(s.doseAmount != null && s.doseUnit ? { doseAmount: String(s.doseAmount), doseUnit: s.doseUnit } : {}),
      dailymedSetId: s.setId ?? '',
    }));
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
        setFormError('Enter a valid reminder time (hour 1–12, minute 00–59).');
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
        setFormError('First dose time is required for interval schedules.');
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
    if (form.endDate && !DATE_RE.test(form.endDate)) {
      setFormError('End date must be in YYYY-MM-DD format.');
      return;
    }

    const input: MedicationInput = {
      name: form.name.trim(),
      dailymed_setid: form.dailymedSetId || null,
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
      end_date: form.endDate || null,
    };

    const scheduleTimes: ScheduleTimeInput[] =
      !form.asNeeded && form.scheduleMode === 'fixed_times'
        ? form.times.map((t) => ({ reminder_time: t.time, quantity_per_dose: null }))
        : [];

    setSaving(true);
    try {
      const created = await createMedication(input, scheduleTimes);
      resyncIfRemindersEnabled();
      router.replace(fromOnboarding ? '/onboarding' : `/medications/${created.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create medication');
    } finally {
      setSaving(false);
    }
  }

  // Stack screen with its own header: keep the bottom inset only.
  return (
    <Screen edges={['left', 'right', 'bottom']} keyboardShouldPersistTaps="handled">
      <ScreenTitle>New medication</ScreenTitle>

      {formError ? <Callout kind="danger">{formError}</Callout> : null}

      <Card className="gap-4 p-4">
        <View className="gap-1">
          <Text className="text-sm">Name</Text>
          <DrugNameAutocomplete
            value={form.name}
            // Typing a different name drops the match picked for the old one.
            onChangeText={(v) => setForm((prev) => ({ ...prev, name: v, dailymedSetId: '' }))}
            onSelect={applySuggestion}
            placeholder="e.g. Lisinopril"
          />
        </View>

        <View className="flex-row gap-2">
          <View className="flex-1">
            <Field
              label="Dose amount"
              keyboardType="numeric"
              value={form.doseAmount}
              onChangeText={(v) => setForm((prev) => ({ ...prev, doseAmount: v, dailymedSetId: '' }))}
            />
          </View>
          <View className="flex-1">
            <Field
              label="Dose unit"
              value={form.doseUnit}
              onChangeText={(v) => setForm((prev) => ({ ...prev, doseUnit: v, dailymedSetId: '' }))}
              placeholder="mg"
            />
          </View>
        </View>

        <Field label="Dose form" value={form.doseForm} onChangeText={(v) => update('doseForm', v)} placeholder="tablet" />

        <View className="gap-1">
          <Text className="text-sm">Type</Text>
          <PillTabs
            tabs={MEDICATION_TYPE_OPTIONS.map((type) => ({ value: type, label: MEDICATION_TYPE_LABELS[type] }))}
            value={form.medicationType}
            onChange={(type) => update('medicationType', type)}
          />
        </View>

        <Field
          label="Instructions"
          className="min-h-20"
          style={{ textAlignVertical: 'top' }}
          value={form.instructions}
          onChangeText={(v) => update('instructions', v)}
          multiline
        />

        <SwitchRow label="As needed (PRN)" value={form.asNeeded} onValueChange={(v) => update('asNeeded', v)} />

        {!form.asNeeded ? (
          <View className="gap-3">
            <View className="gap-1">
              <Text className="text-sm">Schedule</Text>
              <PillTabs
                tabs={[
                  { value: 'fixed_times', label: 'Fixed times' },
                  { value: 'interval', label: 'Interval' },
                ]}
                value={form.scheduleMode}
                onChange={(mode) => update('scheduleMode', mode)}
              />
            </View>

            {form.scheduleMode === 'fixed_times' ? (
              <View className="gap-2">
                {form.times.map((t, i) => (
                  <View key={i} className="flex-row items-end gap-2">
                    <TimeField label={`Time ${i + 1}`} value={t.time} onChange={(v) => updateTime(i, v)} />
                    <Pressable className="ml-auto min-h-11 justify-center" onPress={() => removeTime(i)} hitSlop={8}>
                      <Text className="text-sm font-semibold text-status-danger dark:text-status-danger">Remove</Text>
                    </Pressable>
                  </View>
                ))}
                <Button label="+ Add time" variant="secondary" size="compact" className="self-start" onPress={addTime} />
              </View>
            ) : (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Field
                    label="Every (hours)"
                    keyboardType="numeric"
                    value={form.intervalHours}
                    onChangeText={(v) => update('intervalHours', v)}
                  />
                </View>
                <View className="flex-1">
                  <TimeField label="First dose" value={form.firstDoseTime} onChange={(v) => update('firstDoseTime', v)} />
                </View>
              </View>
            )}
          </View>
        ) : null}

        <Field
          label="Dose quantity per intake"
          keyboardType="numeric"
          value={form.quantityPerDose}
          onChangeText={(v) => update('quantityPerDose', v)}
        />

        <View className="gap-1">
          <Field label="End date (optional)" value={form.endDate} onChangeText={(v) => update('endDate', v)} placeholder="YYYY-MM-DD" />
          <Text muted className="text-xs">
            The regimen stops generating doses after this date. Leave blank for an ongoing medication.
          </Text>
        </View>

        <SwitchRow label="Track inventory" value={form.inventoryEnabled} onValueChange={(v) => update('inventoryEnabled', v)} />

        {form.inventoryEnabled ? (
          <View className="gap-4">
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Field
                  label="Starting quantity"
                  keyboardType="numeric"
                  value={form.startingQuantity}
                  onChangeText={(v) => update('startingQuantity', v)}
                />
              </View>
              <View className="flex-1">
                <Field label="Unit" value={form.inventoryUnit} onChangeText={(v) => update('inventoryUnit', v)} placeholder="pills" />
              </View>
            </View>
            <Field
              label="Low supply threshold"
              keyboardType="numeric"
              value={form.lowSupplyThreshold}
              onChangeText={(v) => update('lowSupplyThreshold', v)}
            />
          </View>
        ) : null}
      </Card>

      <View className="flex-row gap-2">
        <Button label="Cancel" variant="ghost" className="flex-1" onPress={() => router.back()} disabled={saving} />
        <Button label={saving ? 'Saving…' : 'Create'} className="flex-1" loading={saving} onPress={handleCreate} />
      </View>
    </Screen>
  );
}
