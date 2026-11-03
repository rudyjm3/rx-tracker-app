import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

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
import { WizardStepper } from '@/components/ui/wizard-stepper';
import { useActiveProfile } from '@/lib/active-profile';
import { confirmDestructive } from '@/lib/confirm';
import type { DrugSuggestion } from '@/lib/dailymed';
import { showFlash } from '@/lib/flash';
import { deleteDraft, saveDraft, type ParsedDraft } from '@/lib/drafts';
import { DOSE_FORM_OPTIONS, DOSE_UNIT_OPTIONS, hasInventoryWording, inventoryWordingForForm } from '@/lib/dose-forms';
import {
  createMedication,
  getGroupMembers,
  getGroups,
  setMedicationGroup,
  updateMedication,
  type MedicationInput,
  type ScheduleTimeInput,
} from '@/lib/medications';
import { MEDICATION_TYPE_LABELS, MEDICATION_TYPE_OPTIONS } from '@/lib/medication-ui';
import { resyncIfRemindersEnabled } from '@/lib/notifications';
import type { FeedbackType, Medication, MedicationGroup, MedicationType, ScheduleMode } from '@/lib/types/medications';
import { isoToUsDate, localDateString, maskBirthDateInput, usDateToIso } from '@/lib/utils';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// One wizard for both adding and editing a medication (mirrors
// rx-tracker-web's components/medications/wizard). Create mode autosaves
// drafts to the shared medication_drafts table.

interface WizardFormState {
  name: string;
  doseAmount: string;
  doseUnit: string;
  doseForm: string;
  dailymedSetId: string;
  medicationType: MedicationType;
  instructions: string;
  startDate: string; // MM-DD-YYYY
  endDate: string;
  asNeeded: boolean;
  scheduleMode: ScheduleMode;
  // quantityPerDose is a per-time override; it isn't editable here but must
  // round-trip through save, otherwise an unrelated edit silently resets
  // every schedule row's override to the medication-wide default.
  times: { time: string; quantityPerDose: number | null }[];
  intervalHours: string;
  firstDoseTime: string;
  groupId: string; // '' = no group
  inventoryEnabled: boolean;
  startingQuantity: string;
  lowSupplyThreshold: string;
  nextRefillDate: string; // MM-DD-YYYY
  quantityPerDose: string;
  feedbackType: FeedbackType;
  dashboardEnabled: boolean;
  remindersEnabled: boolean;
  adherenceEnabled: boolean;
}

const initialState: WizardFormState = {
  name: '',
  doseAmount: '',
  doseUnit: 'mg',
  doseForm: 'tablet',
  dailymedSetId: '',
  medicationType: 'prescription',
  instructions: '',
  startDate: '',
  endDate: '',
  asNeeded: false,
  scheduleMode: 'fixed_times',
  times: [],
  intervalHours: '',
  firstDoseTime: '',
  groupId: '',
  inventoryEnabled: false,
  startingQuantity: '',
  lowSupplyThreshold: '5',
  nextRefillDate: '',
  quantityPerDose: '1',
  feedbackType: 'none',
  dashboardEnabled: true,
  remindersEnabled: true,
  adherenceEnabled: true,
};

function stateFromMedication(med: Medication): WizardFormState {
  return {
    name: med.name,
    doseAmount: med.dose_amount != null ? String(med.dose_amount) : '',
    doseUnit: med.dose_unit ?? '',
    doseForm: med.dose_form ?? '',
    dailymedSetId: med.dailymed_setid ?? '',
    medicationType: med.medication_type,
    instructions: med.instructions ?? '',
    startDate: isoToUsDate(med.start_date),
    endDate: isoToUsDate(med.end_date),
    asNeeded: med.as_needed,
    scheduleMode: med.schedule_mode,
    // Group-owned schedule rows are driven by the group's own time (kept in
    // sync by a DB trigger); surfacing them as editable would let them drift.
    times: (med.medication_schedule_times ?? [])
      .filter((t) => !t.group_id)
      .map((t) => ({ time: t.reminder_time.slice(0, 5), quantityPerDose: t.quantity_per_dose }))
      .sort((a, b) => a.time.localeCompare(b.time)),
    intervalHours: med.interval_hours != null ? String(med.interval_hours) : '',
    firstDoseTime: med.first_dose_time ? med.first_dose_time.slice(0, 5) : '',
    groupId: '', // filled in once memberships load
    inventoryEnabled: med.inventory_enabled,
    startingQuantity: med.starting_quantity != null ? String(med.starting_quantity) : '',
    lowSupplyThreshold: String(med.low_supply_threshold),
    nextRefillDate: isoToUsDate(med.next_refill_date),
    quantityPerDose: String(med.quantity_per_dose),
    feedbackType: med.feedback_type,
    dashboardEnabled: med.dashboard_enabled,
    remindersEnabled: med.reminders_enabled,
    adherenceEnabled: med.adherence_enabled,
  };
}

// ── Draft (de)serialisation ────────────────────────────────────────────
// Drafts use the web wizard's MedicationFormValues shape (ISO dates, string
// numbers, scheduleTimes) so either client can resume the other's draft.
export type DraftFormData = Partial<{
  name: string;
  doseAmount: string;
  doseUnit: string;
  doseForm: string;
  dailymedSetId: string;
  instructions: string;
  medicationType: MedicationType;
  startDate: string;
  endDate: string;
  asNeeded: boolean;
  scheduleMode: ScheduleMode;
  scheduleTimes: { reminderTime: string; quantityPerDose?: string }[];
  intervalHours: string;
  firstDoseTime: string;
  groupId: string;
  inventoryEnabled: boolean;
  inventoryType: string;
  inventoryUnit: string;
  startingQuantity: string;
  quantityPerDose: string;
  lowSupplyThreshold: string;
  nextRefillDate: string;
  feedbackType: FeedbackType;
  dashboardEnabled: boolean;
  remindersEnabled: boolean;
  adherenceEnabled: boolean;
}>;

function toDraftData(f: WizardFormState): DraftFormData {
  const wording = inventoryWordingForForm(f.doseForm);
  return {
    name: f.name,
    doseAmount: f.doseAmount,
    doseUnit: f.doseUnit,
    doseForm: f.doseForm,
    dailymedSetId: f.dailymedSetId,
    instructions: f.instructions,
    medicationType: f.medicationType,
    startDate: usDateToIso(f.startDate) ?? '',
    endDate: usDateToIso(f.endDate) ?? '',
    asNeeded: f.asNeeded,
    scheduleMode: f.scheduleMode,
    scheduleTimes: f.times.map((t) => ({
      reminderTime: t.time,
      quantityPerDose: t.quantityPerDose != null ? String(t.quantityPerDose) : '',
    })),
    intervalHours: f.intervalHours,
    firstDoseTime: f.firstDoseTime,
    groupId: f.groupId,
    inventoryEnabled: f.inventoryEnabled,
    inventoryType: wording.type,
    inventoryUnit: wording.unit,
    startingQuantity: f.startingQuantity,
    quantityPerDose: f.quantityPerDose,
    lowSupplyThreshold: f.lowSupplyThreshold,
    nextRefillDate: usDateToIso(f.nextRefillDate) ?? '',
    feedbackType: f.feedbackType,
    dashboardEnabled: f.dashboardEnabled,
    remindersEnabled: f.remindersEnabled,
    adherenceEnabled: f.adherenceEnabled,
  };
}

function fromDraftData(d: DraftFormData): WizardFormState {
  const i = initialState;
  return {
    name: d.name ?? i.name,
    doseAmount: d.doseAmount ?? i.doseAmount,
    doseUnit: d.doseUnit ?? i.doseUnit,
    doseForm: d.doseForm ?? i.doseForm,
    dailymedSetId: d.dailymedSetId ?? '',
    medicationType: d.medicationType ?? i.medicationType,
    instructions: d.instructions ?? '',
    startDate: isoToUsDate(d.startDate),
    endDate: isoToUsDate(d.endDate),
    asNeeded: d.asNeeded ?? i.asNeeded,
    scheduleMode: d.scheduleMode ?? i.scheduleMode,
    times: (d.scheduleTimes ?? []).map((t) => {
      const q = t.quantityPerDose ? Number(t.quantityPerDose) : null;
      return { time: t.reminderTime, quantityPerDose: q != null && Number.isFinite(q) ? q : null };
    }),
    intervalHours: d.intervalHours ?? '',
    firstDoseTime: d.firstDoseTime ?? '',
    groupId: d.groupId ?? '',
    inventoryEnabled: d.inventoryEnabled ?? i.inventoryEnabled,
    startingQuantity: d.startingQuantity ?? '',
    lowSupplyThreshold: d.lowSupplyThreshold ?? i.lowSupplyThreshold,
    nextRefillDate: isoToUsDate(d.nextRefillDate),
    quantityPerDose: d.quantityPerDose ?? i.quantityPerDose,
    feedbackType: d.feedbackType ?? i.feedbackType,
    dashboardEnabled: d.dashboardEnabled ?? i.dashboardEnabled,
    remindersEnabled: d.remindersEnabled ?? i.remindersEnabled,
    adherenceEnabled: d.adherenceEnabled ?? i.adherenceEnabled,
  };
}

/** Option list for a chip selector, keeping a legacy/free-typed saved value selectable. */
function withCurrent<T extends string>(options: readonly { value: T; label: string }[], current: string) {
  return current && !options.some((o) => o.value === current)
    ? [...options, { value: current as T, label: current }]
    : options;
}

const STEP_LABELS = ['Medication', 'Inventory', 'Schedule', 'Feedback'] as const;

const FEEDBACK_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'none', label: 'Not tracking' },
  { value: 'pain', label: 'Pain level' },
  { value: 'mood', label: 'Mood' },
  { value: 'both', label: 'Pain and mood' },
];


interface ValidationContext {
  mode: 'create' | 'edit';
  medication?: Medication;
}

// Blank start date: create = today; edit = keep the saved value (including
// null on legacy rows, which the calendar/reports read as the creation date)
// rather than inventing one.
function validateDates(form: WizardFormState, ctx: ValidationContext): { error: string | null; startDate: string | null; endDate: string | null } {
  const fallback = ctx.mode === 'edit' ? (ctx.medication?.start_date ?? null) : localDateString();
  const startDate = form.startDate ? usDateToIso(form.startDate) : fallback;
  if (form.startDate && !startDate) return { error: 'Start date must be a valid date in MM-DD-YYYY format.', startDate: null, endDate: null };
  const endDate = form.endDate ? usDateToIso(form.endDate) : null;
  if (form.endDate && !endDate) return { error: 'End date must be a valid date in MM-DD-YYYY format.', startDate, endDate: null };
  if (endDate && startDate && endDate < startDate) return { error: 'End date can’t be before the start date.', startDate, endDate };
  return { error: null, startDate, endDate };
}

// Returns an error message, or null when the step is valid. Each step only
// checks its own fields so the stepper can gate forward navigation.
function validateStep(step: number, form: WizardFormState, ctx: ValidationContext): string | null {
  if (step === 1) {
    if (!form.name.trim()) return 'Name is required.';
    return validateDates(form, ctx).error;
  }
  if (step === 2) {
    const quantityPerDose = Number(form.quantityPerDose);
    if (!Number.isFinite(quantityPerDose) || quantityPerDose <= 0) return 'Dose quantity must be a positive number.';
    if (form.inventoryEnabled) {
      // Starting quantity is locked (and may be null on legacy rows) once
      // tracking was already on, so only require it when it can be entered.
      const locked = ctx.mode === 'edit' && ctx.medication?.inventory_enabled;
      if (!locked) {
        const startingQuantity = Number(form.startingQuantity);
        if (!form.startingQuantity || !Number.isFinite(startingQuantity) || startingQuantity < 0) {
          return 'Starting quantity must be zero or greater.';
        }
      }
      const threshold = Number(form.lowSupplyThreshold || '0');
      if (!Number.isFinite(threshold) || threshold < 0) return 'Low supply threshold must be zero or greater.';
      if (form.nextRefillDate && !usDateToIso(form.nextRefillDate)) return 'Next refill date must be a valid date in MM-DD-YYYY format.';
    }
    return null;
  }
  if (step === 3 && !form.asNeeded) {
    if (form.scheduleMode === 'fixed_times') {
      if (form.times.some((t) => !TIME_RE.test(t.time))) return 'Enter a valid reminder time (hour 1–12, minute 00–59).';
      // A medication whose only dose is its group's has no individual times.
      if (form.times.length === 0 && !form.groupId) return 'Add at least one reminder time.';
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

export function MedicationWizard({
  mode,
  medication,
  draft,
  onCancel,
  onSaved,
}: {
  mode: 'create' | 'edit';
  medication?: Medication;
  /** Create mode: a saved draft to resume. */
  draft?: ParsedDraft<DraftFormData> | null;
  onCancel: () => void;
  /** Called with the saved medication's id. */
  onSaved: (id: string) => void;
}) {
  const { activeProfileId } = useActiveProfile();
  const profileId = mode === 'edit' ? (medication?.profile_id ?? null) : activeProfileId;
  const ctx: ValidationContext = { mode, medication };

  const [initial] = useState<{ form: WizardFormState; step: number; furthest: number }>(() => {
    if (mode === 'edit' && medication) {
      // The saved medication already passed validation: every step is reachable.
      return { form: stateFromMedication(medication), step: 1, furthest: STEP_LABELS.length };
    }
    if (draft) {
      const clamp = (n: number) => Math.min(Math.max(Math.round(n) || 1, 1), STEP_LABELS.length);
      return { form: fromDraftData(draft.formData), step: clamp(draft.currentStep), furthest: clamp(draft.furthestStep) };
    }
    return { form: initialState, step: 1, furthest: 1 };
  });
  const [form, setForm] = useState<WizardFormState>(initial.form);
  const [step, setStep] = useState(initial.step);
  const [furthestStep, setFurthestStep] = useState(initial.furthest);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [groups, setGroups] = useState<MedicationGroup[]>([]);
  // Edit: the group the medication belonged to when opened, so group
  // membership is only rewritten when it actually changed.
  const [originalGroupId, setOriginalGroupId] = useState<string | null>(null);

  const isLastStep = step === STEP_LABELS.length;
  // Inventory type/unit aren't asked for again — they follow the dose form
  // picked in the Medication step (an unmapped form keeps the saved wording).
  const wording = hasInventoryWording(form.doseForm)
    ? inventoryWordingForForm(form.doseForm)
    : mode === 'edit' && medication
      ? { type: medication.inventory_type, unit: medication.inventory_unit }
      : inventoryWordingForForm(null);

  // Groups for the Schedule step's picker (and, in edit mode, the current membership).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [groupList, members] = await Promise.all([
          getGroups(profileId),
          mode === 'edit' ? getGroupMembers() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setGroups(groupList);
        if (mode === 'edit' && medication) {
          const current = members.find(
            (m) => m.medication_id === medication.id && groupList.some((g) => g.id === m.group_id),
          )?.group_id;
          setOriginalGroupId(current ?? '');
          if (current) setForm((prev) => ({ ...prev, groupId: current }));
        }
      } catch {
        // The group picker is optional — the rest of the wizard still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, medication, profileId]);

  // ── Drafts (create mode) ────────────────────────────────────────────
  const draftIdRef = useRef<string | undefined>(draft?.id);
  const finishedRef = useRef(false);
  // Every draft write goes through this chain, so they run one at a time in
  // call order: the first insert finishes (and yields the id) before any
  // update, and an older snapshot can never overwrite a newer one.
  const draftChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const [baseline] = useState(() => JSON.stringify(initial.form));

  function persistDraft(f: WizardFormState, s: number, furthest: number): Promise<void> {
    if (mode !== 'create') return Promise.resolve();
    const run = draftChainRef.current.then(async () => {
      if (finishedRef.current) return;
      draftIdRef.current = await saveDraft({
        id: draftIdRef.current,
        formData: toDraftData(f),
        currentStep: s,
        furthestStep: Math.max(furthest, s),
        profileId,
      });
    });
    draftChainRef.current = run.catch(() => {});
    return run;
  }

  // Stops further draft writes, waits for any in flight, then removes the
  // draft — so a pending first insert can't land after the cleanup.
  async function finishDraft(): Promise<void> {
    finishedRef.current = true;
    await draftChainRef.current;
    if (draftIdRef.current) await deleteDraft(draftIdRef.current);
  }

  // Best-effort autosave: a transient failure isn't worth interrupting the
  // user over; the next step change or "Save draft" retries.
  function autosave(f: WizardFormState, s: number, furthest: number) {
    persistDraft(f, s, furthest).catch(() => {});
  }

  useEffect(() => {
    if (mode !== 'create' || JSON.stringify(form) === baseline) return;
    const timer = setTimeout(() => autosave(form, step, furthestStep), 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  async function handleSaveDraft() {
    setSavingDraft(true);
    setFormError(null);
    try {
      await persistDraft(form, step, furthestStep);
      // Saved: stop autosaves and return to wherever the wizard was opened from.
      finishedRef.current = true;
      showFlash('Draft saved.');
      onCancel();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Couldn’t save draft');
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleCancel() {
    if (mode !== 'create') {
      finishedRef.current = true;
      onCancel();
      return;
    }
    // Let a pending first save settle so we know whether a draft exists.
    await draftChainRef.current;
    if (!draftIdRef.current) {
      finishedRef.current = true;
      onCancel();
      return;
    }
    confirmDestructive('Discard this medication?', 'Your saved draft will be deleted.', 'Discard', async () => {
      try {
        await finishDraft();
      } catch {
        // The draft is stale either way; leaving the screen is what matters.
      }
      onCancel();
    });
  }

  // ── Form helpers ────────────────────────────────────────────────────
  function update<K extends keyof WizardFormState>(key: K, value: WizardFormState[K]) {
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
    update('times', [...form.times, { time: '08:00', quantityPerDose: null }]);
  }
  function removeTime(index: number) {
    update('times', form.times.filter((_, i) => i !== index));
  }
  function updateTime(index: number, value: string) {
    update('times', form.times.map((t, i) => (i === index ? { ...t, time: value } : t)));
  }

  // ── Navigation ──────────────────────────────────────────────────────
  function goTo(target: number, furthest = furthestStep) {
    // Errors and notices belong to the step they were raised on.
    setFormError(null);
    setNotice(null);
    setStep(target);
    setFurthestStep(furthest);
    autosave(form, target, furthest);
  }

  function handleNext() {
    const error = validateStep(step, form, ctx);
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
      const error = validateStep(step, form, ctx);
      if (error) {
        setFormError(error);
        return;
      }
    }
    goTo(target);
  }

  // ── Submit ──────────────────────────────────────────────────────────
  async function handleSubmit() {
    setFormError(null);
    setNotice(null);

    // Re-check every step: the stepper lets users edit earlier steps.
    for (let s = 1; s <= STEP_LABELS.length; s += 1) {
      const error = validateStep(s, form, ctx);
      if (error) {
        setStep(s);
        setFormError(error);
        return;
      }
    }
    const { startDate, endDate } = validateDates(form, ctx);

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
      quantity_per_dose: Number(form.quantityPerDose),
      low_supply_threshold: form.lowSupplyThreshold ? Number(form.lowSupplyThreshold) : 0,
      next_refill_date: form.inventoryEnabled && form.nextRefillDate ? usDateToIso(form.nextRefillDate) : null,
      feedback_type: form.feedbackType,
      dashboard_enabled: form.dashboardEnabled,
      reminders_enabled: form.remindersEnabled,
      adherence_enabled: form.adherenceEnabled,
      // Editing doesn't move a medication between profiles.
      profile_id: profileId,
      start_date: startDate,
      end_date: endDate,
    };

    const scheduleTimes: ScheduleTimeInput[] =
      !form.asNeeded && form.scheduleMode === 'fixed_times'
        ? form.times.map((t) => ({ reminder_time: t.time, quantity_per_dose: t.quantityPerDose }))
        : [];

    setSaving(true);
    try {
      let savedId: string;
      if (mode === 'edit' && medication) {
        await updateMedication(medication.id, input, scheduleTimes);
        savedId = medication.id;
      } else {
        savedId = (await createMedication(input, scheduleTimes)).id;
      }
      // The medication itself is saved; a group-assignment failure is
      // reported without blocking (retrying would create a duplicate).
      let groupError: string | null = null;
      const groupChanged = mode === 'edit' ? form.groupId !== (originalGroupId ?? '') : Boolean(form.groupId);
      if (groupChanged) {
        try {
          await setMedicationGroup(savedId, form.groupId || null);
        } catch (e) {
          groupError = e instanceof Error ? e.message : 'Unknown error';
        }
      }
      if (mode === 'create') {
        try {
          await finishDraft();
        } catch {
          // A leftover draft is harmless — it can be discarded from the list.
        }
      } else {
        finishedRef.current = true;
      }
      resyncIfRemindersEnabled();
      if (groupError) {
        Alert.alert('Saved, but the group wasn’t set', `${groupError}\n\nYou can assign the group by editing the medication.`);
      }
      onSaved(savedId);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : mode === 'edit' ? 'Failed to save changes' : 'Failed to create medication');
    } finally {
      setSaving(false);
    }
  }

  // ── Steps ───────────────────────────────────────────────────────────
  const startingQuantityLocked = mode === 'edit' && Boolean(medication?.inventory_enabled);

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
              tabs={withCurrent(
                DOSE_UNIT_OPTIONS.map((u) => ({ value: u as string, label: u })),
                form.doseUnit,
              )}
              value={form.doseUnit}
              onChange={(u) => setForm((prev) => ({ ...prev, doseUnit: u, dailymedSetId: '' }))}
            />
          </View>

          <View className="gap-1">
            <Text className="text-sm">Form</Text>
            <PillTabs
              variant="range"
              tabs={withCurrent(
                DOSE_FORM_OPTIONS.map((f) => ({ value: f.value as string, label: f.label })),
                form.doseForm,
              )}
              value={form.doseForm}
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
              label={mode === 'edit' ? 'Start date (MM-DD-YYYY, blank = unchanged)' : 'Start date (MM-DD-YYYY, blank = today)'}
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
                    editable={!startingQuantityLocked}
                    className={startingQuantityLocked ? 'opacity-60' : undefined}
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
              <Field
                label="Next refill date (optional, MM-DD-YYYY)"
                value={form.nextRefillDate}
                onChangeText={(v) => update('nextRefillDate', maskBirthDateInput(v))}
                placeholder="MM-DD-YYYY"
                keyboardType="number-pad" maxLength={10} autoCapitalize="none" autoCorrect={false}
              />
              <Text muted className="text-xs">
                Marked on the calendar. Leave the low supply threshold at 0 and this date is used for the refill
                alert instead of the pill count — set a threshold to be reminded before it.
              </Text>
              {startingQuantityLocked ? (
                <Text muted className="text-xs">
                  Current balance is tracked separately by doses/refills — starting quantity can&apos;t be edited once tracking is on.
                </Text>
              ) : null}
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
                  onChange={(m) => update('scheduleMode', m)}
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
                    <Field label="Every (hours)" keyboardType="numeric" value={form.intervalHours} onChangeText={(v) => update('intervalHours', v)} />
                  </View>
                  <View className="flex-1">
                    <TimeField label="First dose" value={form.firstDoseTime} onChange={(v) => update('firstDoseTime', v)} />
                  </View>
                </View>
              )}
            </View>
          ) : null}

          {groups.length > 0 ? (
            <View className="gap-1">
              <Text className="text-sm">Group (optional)</Text>
              <PillTabs
                tabs={[{ value: '', label: 'No group' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
                value={form.groupId}
                onChange={(g) => update('groupId', g)}
              />
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
      <ScreenTitle>{mode === 'edit' ? 'Edit medication' : 'New medication'}</ScreenTitle>

      <WizardStepper labels={STEP_LABELS} step={step} furthestStep={furthestStep} onSelect={handleStepSelect} />

      {formError ? <Callout kind="danger">{formError}</Callout> : null}
      {notice ? <Callout kind="success">{notice}</Callout> : null}

      <Card className="gap-4 p-4">{renderStep()}</Card>

      <View className="flex-row flex-wrap gap-2">
        <Button label="Cancel" variant="ghost" className="flex-1" onPress={handleCancel} disabled={saving} />
        {step > 1 ? <Button label="Back" variant="secondary" className="flex-1" onPress={() => goTo(step - 1)} disabled={saving} /> : null}
        {mode === 'create' ? (
          <Button
            label={savingDraft ? 'Saving…' : 'Save draft'}
            variant="secondary"
            className="flex-1"
            onPress={handleSaveDraft}
            disabled={saving || savingDraft}
          />
        ) : null}
        <Button
          label={isLastStep ? (saving ? 'Saving…' : mode === 'edit' ? 'Save' : 'Create') : 'Next'}
          className="flex-1"
          loading={saving}
          onPress={isLastStep ? handleSubmit : handleNext}
        />
      </View>
    </Screen>
  );
}
