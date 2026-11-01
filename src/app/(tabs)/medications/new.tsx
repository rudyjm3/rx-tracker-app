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
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { TimeField } from '@/components/ui/time-field';
import { useActiveProfile } from '@/lib/active-profile';
import type { DrugSuggestion } from '@/lib/dailymed';
import { DOSE_FORM_OPTIONS, DOSE_UNIT_OPTIONS, hasInventoryWording, inventoryWordingForForm } from '@/lib/dose-forms';
import { createMedication, type MedicationInput, type ScheduleTimeInput } from '@/lib/medications';
import { MEDICATION_TYPE_LABELS, MEDICATION_TYPE_OPTIONS } from '@/lib/medication-ui';
import { resyncIfRemindersEnabled } from '@/lib/notifications';
import type { FeedbackType, MedicationType, ScheduleMode } from '@/lib/types/medications';
import { localDateString, maskBirthDateInput, usDateToIso } from '@/lib/utils';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

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
  startingQuantity: string;
  lowSupplyThreshold: string;
  startDate: string;
  endDate: string;
  feedbackType: FeedbackType;
  dashboardEnabled: boolean;
  remindersEnabled: boolean;
  adherenceEnabled: boolean;
}

// Matches rx-tracker-web's components/medications/wizard/schema.ts
// defaultFormValues, scoped to the fields this single-screen form covers.
const initialState: NewMedicationFormState = {
  name: '',
  doseAmount: '',
  doseUnit: 'mg',
  doseForm: 'tablet',
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
  startingQuantity: '',
  lowSupplyThreshold: '5',
  startDate: '',
  endDate: '',
  feedbackType: 'none',
  dashboardEnabled: true,
  remindersEnabled: true,
  adherenceEnabled: true,
};

const STEP_LABELS = ['Medication', 'Inventory', 'Schedule', 'Feedback'] as const;

const FEEDBACK_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'none', label: 'Not tracking' },
  { value: 'pain', label: 'Pain level' },
  { value: 'mood', label: 'Mood' },
  { value: 'both', label: 'Pain and mood' },
];

type Dates = { startDate: string; endDate: string | null };

// Returns an error message, or null when the step is valid. Each step only
// checks its own fields so the stepper can gate forward navigation.
function validateStep(step: number, form: NewMedicationFormState): string | null {
  if (step === 1) {
    if (!form.name.trim()) return 'Name is required.';
    return validateDates(form).error;
  }
  if (step === 2) {
    const quantityPerDose = Number(form.quantityPerDose);
    if (!Number.isFinite(quantityPerDose) || quantityPerDose <= 0) return 'Dose quantity must be a positive number.';
    if (form.inventoryEnabled) {
      const startingQuantity = Number(form.startingQuantity);
      if (!form.startingQuantity || !Number.isFinite(startingQuantity) || startingQuantity < 0) {
        return 'Starting quantity must be zero or greater.';
      }
      const threshold = Number(form.lowSupplyThreshold || '0');
      if (!Number.isFinite(threshold) || threshold < 0) return 'Low supply threshold must be zero or greater.';
    }
    return null;
  }
  if (step === 3 && !form.asNeeded) {
    if (form.scheduleMode === 'fixed_times') {
      if (form.times.some((t) => !TIME_RE.test(t.time))) return 'Enter a valid reminder time (hour 1–12, minute 00–59).';
      if (form.times.length === 0) return 'Add at least one reminder time.';
      if (new Set(form.times.map((t) => t.time)).size !== form.times.length) return 'Reminder times must be unique.';
    } else {
      const intervalHours = Number(form.intervalHours);
      if (!form.intervalHours || !Number.isFinite(intervalHours) || intervalHours <= 0) return 'Enter a valid interval in hours.';
      // generateDaySlots only generates interval slots when first_dose_time
      // is set — an empty one would save fine but silently drop the
      // medication from every schedule/dashboard view.
      if (!form.firstDoseTime || !TIME_RE.test(form.firstDoseTime)) return 'First dose time is required for interval schedules.';
    }
  }
  return null;
}

function validateDates(form: NewMedicationFormState): { error: string | null } & Partial<Dates> {
  // Blank start date = today; dates are typed as MM-DD-YYYY, stored as YYYY-MM-DD.
  const startDate = form.startDate ? usDateToIso(form.startDate) : localDateString();
  if (!startDate) return { error: 'Start date must be a valid date in MM-DD-YYYY format.' };
  const endDate = form.endDate ? usDateToIso(form.endDate) : null;
  if (form.endDate && !endDate) return { error: 'End date must be a valid date in MM-DD-YYYY format.' };
  if (endDate && endDate < startDate) return { error: 'End date can’t be before the start date.' };
  return { error: null, startDate, endDate };
}

export default function NewMedicationScreen() {
  const { activeProfileId } = useActiveProfile();
  const { fromOnboarding } = useLocalSearchParams<{ fromOnboarding?: string }>();
  const [form, setForm] = useState<NewMedicationFormState>(initialState);
  const [step, setStep] = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isLastStep = step === STEP_LABELS.length;
  // Inventory type/unit aren't asked for again — they follow the dose form
  // picked in the Medication step.
  const wording = inventoryWordingForForm(form.doseForm);

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

  function goTo(target: number, furthest = furthestStep) {
    // Errors belong to the step they were raised on.
    setFormError(null);
    setStep(target);
    setFurthestStep(furthest);
  }

  function handleNext() {
    const error = validateStep(step, form);
    if (error) {
      setFormError(error);
      return;
    }
    const next = Math.min(step + 1, STEP_LABELS.length);
    goTo(next, Math.max(furthestStep, next));
  }

  // Stepper taps: back is always allowed; forward only to a step already
  // reached, and only if the step being left is valid.
  function handleStepSelect(target: number) {
    if (target === step) return;
    if (target > step) {
      if (target > furthestStep) return;
      const error = validateStep(step, form);
      if (error) {
        setFormError(error);
        return;
      }
    }
    goTo(target);
  }

  async function handleCreate() {
    setFormError(null);

    // Re-check every step: the stepper lets users edit earlier steps.
    for (let s = 1; s <= STEP_LABELS.length; s += 1) {
      const error = validateStep(s, form);
      if (error) {
        goTo(s);
        setFormError(error);
        return;
      }
    }
    const dates = validateDates(form);
    const startDate = dates.startDate as string;
    const endDate = dates.endDate ?? null;
    const quantityPerDose = Number(form.quantityPerDose);

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
      inventory_type: wording.type,
      inventory_unit: wording.unit,
      starting_quantity: form.inventoryEnabled && form.startingQuantity ? Number(form.startingQuantity) : null,
      quantity_per_dose: quantityPerDose,
      low_supply_threshold: form.lowSupplyThreshold ? Number(form.lowSupplyThreshold) : 0,
      feedback_type: form.feedbackType,
      dashboard_enabled: form.dashboardEnabled,
      reminders_enabled: form.remindersEnabled,
      adherence_enabled: form.adherenceEnabled,
      profile_id: activeProfileId,
      start_date: startDate,
      end_date: endDate,
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

  function renderStep() {
    if (step === 1) {
      return (
        <>
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

          <Field
            label="Dose amount"
            keyboardType="numeric"
            value={form.doseAmount}
            onChangeText={(v) => setForm((prev) => ({ ...prev, doseAmount: v, dailymedSetId: '' }))}
          />

          <View className="gap-1">
            <Text className="text-sm">Unit</Text>
            <PillTabs
              variant="range"
              tabs={DOSE_UNIT_OPTIONS.map((u) => ({ value: u, label: u }))}
              value={form.doseUnit as (typeof DOSE_UNIT_OPTIONS)[number]}
              onChange={(u) => setForm((prev) => ({ ...prev, doseUnit: u, dailymedSetId: '' }))}
            />
          </View>

          <View className="gap-1">
            <Text className="text-sm">Form</Text>
            <PillTabs
              variant="range"
              tabs={DOSE_FORM_OPTIONS}
              value={form.doseForm as (typeof DOSE_FORM_OPTIONS)[number]['value']}
              onChange={(f) => update('doseForm', f)}
            />
          </View>

          <View className="gap-1">
            <Text className="text-sm">Type</Text>
            <PillTabs
              tabs={MEDICATION_TYPE_OPTIONS.map((type) => ({ value: type, label: MEDICATION_TYPE_LABELS[type] }))}
              value={form.medicationType}
              onChange={(type) => update('medicationType', type)}
            />
          </View>

          <View className="gap-1">
            <Field
              label="Start date (MM-DD-YYYY, blank = today)"
              value={form.startDate}
              onChangeText={(v) => update('startDate', maskBirthDateInput(v))}
              placeholder="MM-DD-YYYY"
              keyboardType="number-pad" maxLength={10} autoCapitalize="none" autoCorrect={false}
            />
            <Field
              label="End date (optional, MM-DD-YYYY)"
              value={form.endDate}
              onChangeText={(v) => update('endDate', maskBirthDateInput(v))}
              placeholder="MM-DD-YYYY"
              keyboardType="number-pad" maxLength={10} autoCapitalize="none" autoCorrect={false}
            />
            <Text muted className="text-xs">
              The regimen stops generating doses after this date. Leave blank for an ongoing medication.
            </Text>
          </View>

          <Field
            label="Instructions"
            className="min-h-20"
            style={{ textAlignVertical: 'top' }}
            value={form.instructions}
            onChangeText={(v) => update('instructions', v)}
            multiline
          />
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <SwitchRow label="Track inventory / supply" value={form.inventoryEnabled} onValueChange={(v) => update('inventoryEnabled', v)} />

          {form.inventoryEnabled ? (
            <>
              <Text muted className="text-sm">
                Tracking supply in {wording.unit}
                {hasInventoryWording(form.doseForm) ? ' (from the form chosen in the Medication step).' : ' — choose a form in the Medication step to change this.'}
              </Text>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Field
                    label={`Starting quantity (${wording.unit})`}
                    keyboardType="numeric"
                    value={form.startingQuantity}
                    onChangeText={(v) => update('startingQuantity', v)}
                  />
                </View>
                <View className="flex-1">
                  <Field
                    label="Low supply threshold"
                    keyboardType="numeric"
                    value={form.lowSupplyThreshold}
                    onChangeText={(v) => update('lowSupplyThreshold', v)}
                  />
                </View>
              </View>
            </>
          ) : null}

          <Field
            label="Quantity per dose"
            keyboardType="numeric"
            value={form.quantityPerDose}
            onChangeText={(v) => update('quantityPerDose', v)}
          />
        </>
      );
    }

    if (step === 3) {
      return (
        <>
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
        </>
      );
    }

    return (
      <>
        <View className="gap-1">
          <Text className="text-sm">Track how you feel with each dose?</Text>
          <PillTabs tabs={FEEDBACK_OPTIONS} value={form.feedbackType} onChange={(v) => update('feedbackType', v)} />
        </View>
        <SwitchRow label="Show on dashboard" value={form.dashboardEnabled} onValueChange={(v) => update('dashboardEnabled', v)} />
        <SwitchRow label="Send reminders" value={form.remindersEnabled} onValueChange={(v) => update('remindersEnabled', v)} />
        <SwitchRow
          label={form.asNeeded ? 'Track as a non-required (optional) dose' : 'Include in adherence tracking'}
          value={form.adherenceEnabled}
          onValueChange={(v) => update('adherenceEnabled', v)}
        />
      </>
    );
  }

  // Stack screen with its own header: keep the bottom inset only.
  return (
    <Screen edges={['left', 'right', 'bottom']} keyboardShouldPersistTaps="handled">
      <ScreenTitle>New medication</ScreenTitle>

      <WizardStepper labels={STEP_LABELS} step={step} furthestStep={furthestStep} onSelect={handleStepSelect} />

      {formError ? <Callout kind="danger">{formError}</Callout> : null}

      <Card className="gap-4 p-4">{renderStep()}</Card>

      <View className="flex-row gap-2">
        <Button label="Cancel" variant="ghost" className="flex-1" onPress={() => router.back()} disabled={saving} />
        {step > 1 ? <Button label="Back" variant="secondary" className="flex-1" onPress={() => goTo(step - 1)} disabled={saving} /> : null}
        <Button
          label={isLastStep ? (saving ? 'Saving…' : 'Create') : 'Next'}
          className="flex-1"
          loading={saving}
          onPress={isLastStep ? handleCreate : handleNext}
        />
      </View>
    </Screen>
  );
}
