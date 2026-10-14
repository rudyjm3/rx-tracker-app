import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { DrugNameAutocomplete } from '@/components/DrugNameAutocomplete';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { SwitchRow } from '@/components/ui/checkbox';
import { Field, Input } from '@/components/ui/field';
import { FormSheet } from '@/components/ui/form-sheet';
import { LevelGrid } from '@/components/ui/level-grid';
import { MedName } from '@/components/ui/med-name';
import { MedTypeBadge } from '@/components/ui/med-type-badge';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/screen-title';
import { Sheet } from '@/components/ui/sheet';
import { TagPill } from '@/components/ui/tag-pill';
import { Text } from '@/components/ui/text';
import { TimeField } from '@/components/ui/time-field';
import { cn } from '@/lib/cn';
import { confirmDestructive } from '@/lib/confirm';
import type { DrugSuggestion } from '@/lib/dailymed';
import { getTodayLogs, recordDoseAtTime, type DoseFeedback } from '@/lib/dose-logs';
import { adjustQuantity, getRefillHistory, logRefill } from '@/lib/inventory';
import {
  activateMedication,
  deactivateMedication,
  getDoseHistory,
  getGroupDoseOverridesByMedication,
  getGroupMembers,
  getGroups,
  getMedication,
  updateMedication,
  updatePrescribedDose,
  type MedicationInput,
  type ScheduleTimeInput,
} from '@/lib/medications';
import { MEDICATION_TYPE_LABELS, MEDICATION_TYPE_OPTIONS } from '@/lib/medication-ui';
import { resyncIfRemindersEnabled } from '@/lib/notifications';
import { medicationTracksMood, medicationTracksPain, type WellbeingMetric } from '@/lib/pain-mood';
import { generateDaySlots, type DaySlot } from '@/lib/schedule';
import {
  addSideEffects,
  deleteSideEffect,
  getSideEffects,
} from '@/lib/side-effects';
import {
  createSideEffectTag,
  deleteSideEffectTag,
  getSideEffectTags,
  renameSideEffectTag,
  setSideEffectTagAlwaysShow,
} from '@/lib/side-effect-tags';
import type {
  DoseHistoryEntry,
  DoseLog,
  Medication,
  MedicationGroup,
  MedicationRefill,
  MedicationType,
  ScheduleMode,
  SideEffect,
  SideEffectSeverity,
  SideEffectTag,
} from '@/lib/types/medications';
import {
  daysUntilRunout,
  isoToUsDate,
  localDateString,
  maskBirthDateInput,
  scheduleSummary,
  to12h,
  usDateToIso,
  type GroupDoseOverride,
} from '@/lib/utils';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SEVERITY_OPTIONS: { value: SideEffectSeverity; label: string }[] = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
];

// Side-effect severity pills (DESIGN.md 6.4): mild success, moderate warning,
// severe danger — soft tint with the status color as text.
const SEVERITY_BG: Record<SideEffectSeverity, string> = {
  mild: 'bg-status-success/10',
  moderate: 'bg-status-warning/10',
  severe: 'bg-status-danger/10',
};
const SEVERITY_FG: Record<SideEffectSeverity, string> = {
  mild: 'text-status-success dark:text-status-success',
  moderate: 'text-status-warning dark:text-status-warning',
  severe: 'text-status-danger dark:text-status-danger',
};

const DISCONTINUE_REASONS = ["End of regimen", "Side effects", "Doctor's orders", "Other"] as const;
const RESUME_REASONS = ["Doctor's orders", "Symptoms returned", "Retrying", "Restarting regimen", "Other"] as const;

export default function MedicationDetailScreen() {
  const { id, action, date: actionDate } = useLocalSearchParams<{ id: string; action?: string; date?: string }>();
  const [medication, setMedication] = useState<Medication | null>(null);
  const [refillHistory, setRefillHistory] = useState<MedicationRefill[]>([]);
  const [doseHistory, setDoseHistory] = useState<DoseHistoryEntry[]>([]);
  const [groupDoseOverrides, setGroupDoseOverrides] = useState<GroupDoseOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [refillSheetMode, setRefillSheetMode] = useState<'refill' | 'adjust' | null>(null);
  const [logDoseOpen, setLogDoseOpen] = useState(false);
  const [sideEffectsOpen, setSideEffectsOpen] = useState(false);
  const [statusSheetDirection, setStatusSheetDirection] = useState<'discontinue' | 'resume' | null>(null);
  const [updateDoseOpen, setUpdateDoseOpen] = useState(false);

  // Lets the medications list's quick-actions menu jump straight into a
  // specific sheet (?action=logDose etc.) instead of just landing on this
  // screen and making the user tap the right button themselves. Adjusted
  // during render (React's documented pattern for "adjusting state when a
  // prop changes", same as EditForm-adjacent screens' lastProfileId reset
  // elsewhere in this app) rather than in an effect, so it can't cause the
  // extra render pass a setState-in-effect would. consumedAction guards
  // against reopening the same sheet every time this screen regains focus
  // (e.g. after the opened sheet's own onClose navigates back here) — the
  // URL still carries ?action=..., but only a *new* value re-triggers.
  const [consumedAction, setConsumedAction] = useState<string | null>(null);
  if (action && action !== consumedAction) {
    setConsumedAction(action);
    switch (action) {
      case 'edit':
        setEditing(true);
        break;
      case 'logDose':
        setLogDoseOpen(true);
        break;
      case 'refill':
      case 'adjust':
        setRefillSheetMode(action);
        break;
      case 'sideEffects':
        setSideEffectsOpen(true);
        break;
      case 'updateDose':
        setUpdateDoseOpen(true);
        break;
      case 'discontinue':
      case 'resume':
        setStatusSheetDirection(action);
        break;
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const med = await getMedication(id);
      setMedication(med);
      setRefillHistory(med.inventory_enabled ? await getRefillHistory(id) : []);
      setDoseHistory(await getDoseHistory(id));
      setGroupDoseOverrides((await getGroupDoseOverridesByMedication(med.profile_id)).get(id) ?? []);
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

  if (loading) {
    return (
      <Screen edges={['left', 'right', 'bottom']} scroll={false} contentClassName="items-center justify-center">
        <ActivityIndicator />
      </Screen>
    );
  }

  if (error || !medication) {
    return (
      <Screen edges={['left', 'right', 'bottom']} scroll={false} contentClassName="items-center justify-center">
        <Text className="text-sm text-status-danger dark:text-status-danger">{error ?? 'Medication not found'}</Text>
      </Screen>
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

  const hasInventory = medication.inventory_enabled && medication.starting_quantity != null;
  const daysLeft = hasInventory ? daysUntilRunout(medication, groupDoseOverrides) : null;

  // Stack screen with its own header: bottom inset only.
  return (
    <Screen edges={['left', 'right', 'bottom']} contentClassName="gap-4 pt-4">
      <View className="gap-2">
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <MedName name={medication.name} dose={medication.dose} className="text-2xl font-bold" />
          <MedTypeBadge type={medication.medication_type} />
          {!medication.active ? (
            <View className="rounded-full bg-status-warning/10 px-2 py-0.5">
              <Text className="text-xs font-medium text-status-warning dark:text-status-warning">Discontinued</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Card flat className="gap-3">
        <DetailRow label="Type" value={MEDICATION_TYPE_LABELS[medication.medication_type]} />
        <DetailRow label="Schedule" value={scheduleSummary(medication)} />
        {medication.instructions ? <DetailRow label="Instructions" value={medication.instructions} /> : null}
        <DetailRow
          label="Dose per intake"
          value={`${medication.quantity_per_dose} ${medication.inventory_unit || (medication.quantity_per_dose === 1 ? 'unit' : 'units')}`}
        />

        {hasInventory ? (
          <DetailRow
            label="Inventory"
            value={`${medication.current_quantity ?? 0} of ${medication.starting_quantity} ${medication.inventory_unit} left${
              daysLeft != null ? ` · ~${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : ''
            }${(medication.current_quantity ?? 0) <= medication.low_supply_threshold ? ' · Low supply' : ''}`}
          />
        ) : null}
      </Card>

      <View className="gap-2">
        <Button label="Log Dose" onPress={() => setLogDoseOpen(true)} />

        {hasInventory ? (
          <View className="flex-row gap-2">
            <Button label="Log Refill" variant="secondary" className="flex-1" onPress={() => setRefillSheetMode('refill')} />
            <Button label="Adjust Quantity" variant="secondary" className="flex-1" onPress={() => setRefillSheetMode('adjust')} />
          </View>
        ) : null}

        <View className="flex-row gap-2">
          <Button label="Edit" variant="secondary" className="flex-1" onPress={() => setEditing(true)} />
          <Button
            label={medication.active ? 'Discontinue' : 'Resume'}
            variant="secondary"
            className="flex-1"
            labelClassName={medication.active ? 'text-status-danger dark:text-status-danger' : undefined}
            onPress={() => setStatusSheetDirection(medication.active ? 'discontinue' : 'resume')}
          />
        </View>

        <View className="flex-row gap-2">
          <Button label="Update Prescribed Dose" variant="secondary" className="flex-1" onPress={() => setUpdateDoseOpen(true)} />
          <Button label="Side Effects" variant="secondary" className="flex-1" onPress={() => setSideEffectsOpen(true)} />
        </View>
      </View>

      {hasInventory && refillHistory.length > 0 ? (
        <View className="gap-2">
          <SectionTitle>Refill History</SectionTitle>
          <Card flat className="p-3">
            {refillHistory.map((entry) => (
              <RefillHistoryRow key={entry.id} entry={entry} unit={medication.inventory_unit} />
            ))}
          </Card>
        </View>
      ) : null}

      {doseHistory.length > 0 ? (
        <View className="gap-2">
          <SectionTitle>Dose & Status History</SectionTitle>
          <Card flat className="p-3">
            {doseHistory.map((entry) => (
              <DoseHistoryRow key={`${entry.type}-${entry.data.id}`} entry={entry} />
            ))}
          </Card>
        </View>
      ) : null}

      {hasInventory && refillSheetMode ? (
        <RefillSheet
          mode={refillSheetMode}
          medication={medication}
          onClose={() => setRefillSheetMode(null)}
          onSaved={async () => {
            setRefillSheetMode(null);
            await load();
          }}
        />
      ) : null}

      {logDoseOpen ? (
        <LogDoseSheet
          medication={medication}
          initialDate={actionDate && DATE_RE.test(actionDate) ? actionDate : undefined}
          onClose={() => setLogDoseOpen(false)}
          onSaved={async () => {
            setLogDoseOpen(false);
            await load();
          }}
        />
      ) : null}

      {sideEffectsOpen ? <SideEffectsSheet medication={medication} onClose={() => setSideEffectsOpen(false)} /> : null}

      {statusSheetDirection ? (
        <StatusChangeSheet
          direction={statusSheetDirection}
          medication={medication}
          onClose={() => setStatusSheetDirection(null)}
          onSaved={async () => {
            setStatusSheetDirection(null);
            resyncIfRemindersEnabled();
            await load();
          }}
        />
      ) : null}

      {updateDoseOpen ? (
        <UpdatePrescribedDoseSheet
          medication={medication}
          onClose={() => setUpdateDoseOpen(false)}
          onSaved={async () => {
            setUpdateDoseOpen(false);
            await load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function RefillHistoryRow({ entry, unit }: { entry: MedicationRefill; unit: string }) {
  const isAdjustment = entry.entry_type === 'adjustment';
  const sign = entry.amount >= 0 ? '+' : '';
  return (
    <View className="gap-0.5 border-b border-brand-border py-2 last:border-b-0 dark:border-night-border">
      <Text className="text-sm font-semibold text-brand-navy dark:text-white">{entry.refill_date}</Text>
      <Text muted className="text-xs">
        {isAdjustment ? 'Adjustment' : 'Refill'} · {sign}
        {entry.amount} {unit} · {entry.pills_on_hand} on hand after
      </Text>
      {entry.note ? (
        <Text muted className="text-xs italic">
          {entry.note}
        </Text>
      ) : null}
    </View>
  );
}

function DoseHistoryRow({ entry }: { entry: DoseHistoryEntry }) {
  return (
    <View className="gap-0.5 border-b border-brand-border py-2 last:border-b-0 dark:border-night-border">
      <Text className="text-xs font-semibold text-brand-navy dark:text-white">{new Date(entry.at).toLocaleDateString()}</Text>
      {entry.type === 'dose_change' ? (
        <Text muted className="text-xs">
          Dose changed
          {entry.data.old_dose_amount != null && ` from ${entry.data.old_dose_amount}${entry.data.old_dose_unit}`}
          {entry.data.new_dose_amount != null && ` to ${entry.data.new_dose_amount}${entry.data.new_dose_unit}`}
          {entry.data.comment && ` — ${entry.data.comment}`}
        </Text>
      ) : (
        <Text muted className="text-xs">
          {entry.data.event === 'discontinued' ? 'Discontinued' : 'Resumed'}
          {entry.data.reason && ` — ${entry.data.reason}`}
          {entry.data.comment && ` (${entry.data.comment})`}
        </Text>
      )}
    </View>
  );
}

function RefillSheet({
  mode,
  medication,
  onClose,
  onSaved,
}: {
  mode: 'refill' | 'adjust';
  medication: Medication;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [refillDate, setRefillDate] = useState(localDateString());
  const [amount, setAmount] = useState('');
  const [newQuantity, setNewQuantity] = useState(
    medication.current_quantity != null ? String(medication.current_quantity) : '0',
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (mode === 'refill') {
      const amountValue = Number(amount);
      if (!amount || !Number.isFinite(amountValue) || amountValue < 0) {
        setFormError('Amount added must be zero or greater.');
        return;
      }
      setSaving(true);
      try {
        await logRefill(medication.id, amountValue, null, note, refillDate);
        onSaved();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : 'Failed to log refill');
      } finally {
        setSaving(false);
      }
    } else {
      const quantityValue = Number(newQuantity);
      if (!newQuantity || !Number.isFinite(quantityValue) || quantityValue < 0) {
        setFormError('Quantity must be zero or greater.');
        return;
      }
      setSaving(true);
      try {
        await adjustQuantity(medication.id, quantityValue, note);
        onSaved();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : 'Failed to adjust quantity');
      } finally {
        setSaving(false);
      }
    }
  }

  return (
    <FormSheet
      title={mode === 'refill' ? 'Log Refill' : 'Adjust Quantity'}
      subtitle={`${medication.name}${medication.dose ? ` ${medication.dose}` : ''}`}
      onClose={onClose}
      error={formError}
      footer={
        <>
          <Button label="Cancel" variant="ghost" className="flex-1" onPress={onClose} disabled={saving} />
          <Button
            label={saving ? 'Saving…' : mode === 'refill' ? 'Log Refill' : 'Save'}
            className="flex-1"
            loading={saving}
            onPress={handleSubmit}
          />
        </>
      }>
      {mode === 'refill' ? (
        <>
          <Field label="Refill date" value={refillDate} onChangeText={setRefillDate} placeholder="YYYY-MM-DD" />
          <Field
            label={`Amount added (${medication.inventory_unit})`}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            placeholder="e.g. 30"
          />
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. 30-day supply" />
        </>
      ) : (
        <>
          <Text muted className="text-sm">
            Current count: {medication.current_quantity ?? 0} {medication.inventory_unit}
          </Text>
          <Field
            label={`Correct current quantity (${medication.inventory_unit})`}
            keyboardType="numeric"
            value={newQuantity}
            onChangeText={setNewQuantity}
          />
          <Field label="Reason (optional)" value={note} onChangeText={setNote} placeholder="e.g. recount, dropped a pill" />
        </>
      )}
    </FormSheet>
  );
}

// Records a dose_amount/dose_unit change as its own history event, distinct
// from a full Edit — port of rx-tracker-web's UpdatePrescribedDoseModal.
function UpdatePrescribedDoseSheet({
  medication,
  onClose,
  onSaved,
}: {
  medication: Medication;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(medication.dose_amount != null ? String(medication.dose_amount) : '');
  const [unit, setUnit] = useState(medication.dose_unit ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    const amountValue = Number(amount);
    if (!amount.trim() || !Number.isFinite(amountValue) || amountValue <= 0) {
      setFormError('New dose amount must be greater than zero.');
      return;
    }
    setSaving(true);
    try {
      await updatePrescribedDose(medication.id, amountValue, unit, reason.trim());
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't update prescribed dose");
      setSaving(false);
    }
  }

  return (
    <FormSheet
      title="Update prescribed dose"
      subtitle={`Current dose: ${medication.dose_amount ?? ''} ${medication.dose_unit ?? ''}`.trim()}
      onClose={onClose}
      error={formError}
      footer={
        <>
          <Button label="Cancel" variant="ghost" className="flex-1" onPress={onClose} disabled={saving} />
          <Button label={saving ? 'Saving…' : 'Save dose change'} className="flex-1" loading={saving} onPress={handleSubmit} />
        </>
      }>
      <View className="flex-row gap-2">
        <View className="flex-[2]">
          <Field label="New dose amount" keyboardType="numeric" value={amount} onChangeText={setAmount} />
        </View>
        <View className="flex-1">
          <Field label="Unit" value={unit} onChangeText={setUnit} placeholder="mg" />
        </View>
      </View>
      <Field
        label="Reason (optional)"
        className="min-h-20"
        style={{ textAlignVertical: 'top' }}
        value={reason}
        onChangeText={setReason}
        placeholder="e.g. Doctor increased dose at last visit"
        multiline
      />
    </FormSheet>
  );
}

function StatusChangeSheet({
  direction,
  medication,
  onClose,
  onSaved,
}: {
  direction: 'discontinue' | 'resume';
  medication: Medication;
  onClose: () => void;
  onSaved: () => void;
}) {
  const reasons = direction === 'discontinue' ? DISCONTINUE_REASONS : RESUME_REASONS;
  const [reason, setReason] = useState<string>(reasons[0]);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function requestClose() {
    if (!saving) onClose();
  }

  async function handleSubmit() {
    setFormError(null);
    setSaving(true);
    try {
      if (direction === 'discontinue') await deactivateMedication(medication.id, reason, comment);
      else await activateMedication(medication.id, reason, comment);
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      title={`${direction === 'discontinue' ? 'Discontinue' : 'Resume'} — ${medication.name}`}
      onClose={requestClose}
      dismissible={!saving}
      error={formError}
      footer={
        <>
          <Button label="Cancel" variant="secondary" className="flex-1" onPress={requestClose} disabled={saving} />
          <Button
            label={saving ? (direction === 'discontinue' ? 'Discontinuing…' : 'Resuming…') : direction === 'discontinue' ? 'Discontinue Use' : 'Resume'}
            variant={direction === 'discontinue' ? 'danger' : 'primary'}
            className="flex-1"
            loading={saving}
            onPress={handleSubmit}
          />
        </>
      }>
      <View className="gap-1">
        <Text className="text-sm">Reason</Text>
        <PillTabs
          variant="range"
          tabs={reasons.map((r) => ({ value: r, label: r }))}
          value={reason}
          onChange={setReason}
        />
      </View>
      <Field
        label="Comment (optional)"
        className="min-h-20"
        style={{ textAlignVertical: 'top' }}
        value={comment}
        onChangeText={setComment}
        multiline
      />
    </FormSheet>
  );
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Pads a single-digit hour ("9:05") to the two-digit form ("09:05") the
// ECMAScript date-time string format requires.
function normalizeTime(time: string): string {
  const [hours, minutes] = time.split(':');
  return `${hours.padStart(2, '0')}:${minutes}`;
}

function isTerminalSlot(status: DaySlot['status']): boolean {
  return status === 'taken' || status === 'skipped';
}

type GroupMemberRow = { group_id: string; medication_id: string; quantity_per_dose: number | null };

/**
 * Two-step "Log Dose" flow, ported from rx-tracker-web's LogPastDoseModal +
 * DoseEntryForm: step 1 picks a date and one of that date's non-terminal
 * (pending/missed) slots via generateDaySlots — the same slot list the
 * dashboard's Take flow uses — or "Log at a custom time instead" for a
 * free-form entry; step 2 records the actual time taken (and pain/mood/
 * note, when tracked) via recordDoseAtTime. An as_needed medication with
 * no group membership never gets a generateDaySlots slot at all, so it
 * skips straight to step 2.
 */
function LogDoseSheet({
  medication,
  initialDate,
  onClose,
  onSaved,
}: {
  medication: Medication;
  // Set when opened from a specific calendar day (?date=YYYY-MM-DD).
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = localDateString();
  const [date, setDate] = useState(initialDate && initialDate <= today ? initialDate : today);
  const [slot, setSlot] = useState<DaySlot | null>(null);
  const [entryStepChosen, setEntryStepChosen] = useState(false);

  const [groups, setGroups] = useState<MedicationGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMemberRow[]>([]);
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const [time, setTime] = useState(nowHHMM);
  const [painLevel, setPainLevel] = useState(5);
  const [moodLevel, setMoodLevel] = useState(5);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [contextReloadToken, setContextReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingContext(true);
      setContextError(null);
      try {
        const [groupList, groupMemberList] = await Promise.all([
          getGroups(medication.profile_id),
          getGroupMembers(),
        ]);
        if (cancelled) return;
        setGroups(groupList);
        setGroupMembers(groupMemberList);
      } catch (e) {
        if (!cancelled) {
          setContextError(e instanceof Error ? e.message : 'Failed to load medication groups');
        }
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [medication.profile_id, contextReloadToken]);

  const isGrouped = groupMembers.some((m) => m.medication_id === medication.id);
  // Gated on loadingContext so a PRN medication doesn't briefly skip to
  // step 2 before groupMembers has loaded and isGrouped is known.
  const resolvingPrnGrouping = medication.as_needed && loadingContext;
  const neverScheduled = medication.as_needed && !loadingContext && !contextError && !isGrouped;
  const entryStep = entryStepChosen || neverScheduled;

  const dateError = !DATE_RE.test(date)
    ? 'Enter a valid date (YYYY-MM-DD).'
    : date > today
      ? "Date can't be in the future."
      : null;
  const canLoadSlots = !dateError && !neverScheduled && !resolvingPrnGrouping && !contextError;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canLoadSlots) {
        setLogs([]);
        return;
      }
      setLoadingLogs(true);
      try {
        const logData = await getTodayLogs(date);
        if (!cancelled) setLogs(logData);
      } catch (e) {
        if (!cancelled) {
          setContextError(e instanceof Error ? e.message : 'Failed to load doses for this date');
        }
      } finally {
        if (!cancelled) setLoadingLogs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canLoadSlots, date]);

  const slots = useMemo<DaySlot[]>(() => {
    if (!canLoadSlots) return [];
    // This is the medication's own detail screen, not the Dashboard, so a
    // medication hidden from the dashboard (dashboard_enabled: false) must
    // still generate its normal slots here — same reasoning as History's
    // resolveHistoricalQuantityPerDose.
    return generateDaySlots(date, [medication], groups, groupMembers, logs, [], {
      ignoreDashboardVisibility: true,
    });
  }, [canLoadSlots, date, medication, groups, groupMembers, logs]);

  const pickableSlots = slots.filter((s) => !isTerminalSlot(s.status));
  const loadingSlots = resolvingPrnGrouping || loadingContext || loadingLogs;

  const trackPain = medicationTracksPain(medication);
  const trackMood = medicationTracksMood(medication);

  function pickSlot(s: DaySlot | null) {
    setSlot(s);
    setTime(s ? s.scheduledTime : nowHHMM());
    setEntryStepChosen(true);
  }

  async function handleSave() {
    setFormError(null);
    if (!TIME_RE.test(time)) {
      setFormError('Enter a valid time (hour 1–12, minute 00–59).');
      return;
    }
    const normalizedTime = normalizeTime(time);
    const takenAtIso = new Date(`${date}T${normalizedTime}:00`).toISOString();
    if (new Date(takenAtIso).getTime() > Date.now()) {
      setFormError("Time taken can't be in the future.");
      return;
    }
    setSaving(true);
    try {
      const scheduledTime = slot ? slot.scheduledTime : normalizedTime;
      const quantityPerDose = slot?.quantityPerDose ?? medication.quantity_per_dose;
      const trimmedNote = note.trim();
      const feedback: DoseFeedback | undefined =
        trackPain || trackMood || trimmedNote
          ? {
              ...(trackPain ? { painLevel } : {}),
              ...(trackMood ? { moodLevel } : {}),
              ...(trimmedNote ? { note: trimmedNote } : {}),
            }
          : undefined;
      await recordDoseAtTime(medication, date, scheduledTime, takenAtIso, quantityPerDose, feedback);
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't log dose");
      setSaving(false);
    }
  }

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const contextLabel = slot
    ? `${dateLabel} · scheduled for ${to12h(slot.scheduledTime)}`
    : neverScheduled
      ? undefined
      : dateLabel;

  return (
    <FormSheet
      title="Log Dose"
      subtitle={`${medication.name}${medication.dose ? ` — ${medication.dose}` : ''}`}
      onClose={onClose}
      error={entryStep ? formError : null}
      footer={
        !entryStep ? (
          <>
            <Button label="Cancel" variant="ghost" className="flex-1" onPress={onClose} />
            <Button
              label="Log at a custom time instead"
              variant="secondary"
              className="flex-[2]"
              disabled={!!dateError}
              onPress={() => pickSlot(null)}
            />
          </>
        ) : (
          <>
            <Button label="Cancel" variant="ghost" className="flex-1" onPress={onClose} disabled={saving} />
            <Button label={saving ? 'Saving…' : 'Log Dose'} className="flex-1" loading={saving} onPress={handleSave} />
          </>
        )
      }>
      {!entryStep ? (
        <>
          <Field
            label="Date"
            error={dateError ?? undefined}
            value={date}
            onChangeText={(v) => {
              setDate(v);
              setSlot(null);
            }}
            placeholder="YYYY-MM-DD"
          />

          {contextError ? (
            <View className="gap-2">
              <Text className="text-sm text-status-danger dark:text-status-danger">
                Couldn&apos;t load medication groups. Try again before logging this dose.
              </Text>
              <Button label="Retry" variant="secondary" size="compact" className="self-start" onPress={() => setContextReloadToken((t) => t + 1)} />
            </View>
          ) : dateError ? null : loadingSlots ? (
            <ActivityIndicator />
          ) : pickableSlots.length > 0 ? (
            <View className="gap-2">
              {pickableSlots.map((s) => (
                <Pressable
                  key={s.scheduledTime}
                  accessibilityRole="button"
                  className="min-h-11 flex-row items-center justify-between rounded-control border border-brand-border px-3 py-2 active:bg-brand-bg dark:border-night-border dark:active:bg-night-selected"
                  onPress={() => pickSlot(s)}>
                  <Text className="text-sm font-semibold">{to12h(s.scheduledTime)}</Text>
                  {s.status === 'missed' ? <Badge variant="missed" /> : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <Text muted className="text-sm">
              {slots.length === 0
                ? 'No scheduled doses for this date.'
                : 'Every scheduled dose for this date is already logged.'}
            </Text>
          )}
        </>
      ) : (
        <>
          {contextLabel ? (
            <Text muted className="text-sm">
              {contextLabel}
            </Text>
          ) : null}

          <TimeField label="Actual time taken" value={time} onChange={setTime} />

          {trackPain ? <LevelBlock label="Pain level" metric="pain" value={painLevel} onChange={setPainLevel} /> : null}
          {trackMood ? <LevelBlock label="Mood level" metric="mood" value={moodLevel} onChange={setMoodLevel} /> : null}

          <Field
            label="Notes (optional)"
            className="min-h-20"
            style={{ textAlignVertical: 'top' }}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={255}
          />

          {!neverScheduled ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-11 justify-center self-start"
              onPress={() => setEntryStepChosen(false)}
              disabled={saving}
              hitSlop={8}>
              <Text className="text-sm font-semibold text-brand-deep-blue dark:text-brand-cyan">← Back</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </FormSheet>
  );
}

/**
 * Mirrors web's SideEffectModal: one form (date + severity + a multi-select
 * tag picker + a note) submitting one `side_effects` row per selected tag,
 * plus a delete-able list of this medication's existing entries below it.
 */
function SideEffectsSheet({
  medication,
  onClose,
}: {
  medication: Medication;
  onClose: () => void;
}) {
  const [occurredDate, setOccurredDate] = useState(localDateString());
  const [severity, setSeverity] = useState<SideEffectSeverity>('mild');
  const [tags, setTags] = useState<SideEffectTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [entries, setEntries] = useState<SideEffect[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [addingTag, setAddingTag] = useState(false);

  // See RefillSheet/Dashboard's identical guard: bumped on every load() call
  // so a slower, stale response can't overwrite state a newer call already
  // set.
  const requestIdRef = useRef(0);

  const busy = saving || deletingId !== null || addingTag;

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [tagList, sideEffects] = await Promise.all([
        getSideEffectTags(),
        getSideEffects(medication.id),
      ]);
      if (requestIdRef.current !== requestId) return;
      setTags(tagList);
      setEntries(sideEffects);
      // A tag deleted (e.g. via Manage tags) while still checked in the
      // picker would otherwise linger in selectedTagIds — resolving to no
      // descriptions at submit time, so it'd silently "succeed" without
      // writing anything.
      const validTagIds = new Set(tagList.map((t) => t.id));
      setSelectedTagIds((prev) => {
        const next = new Set([...prev].filter((id) => validTagIds.has(id)));
        return next.size === prev.size ? prev : next;
      });
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      setLoadError(e instanceof Error ? e.message : 'Failed to load side effects');
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [medication.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddTag() {
    const name = newTagName.trim();
    if (!name) return;
    setFormError(null);
    setAddingTag(true);
    try {
      const tag = await createSideEffectTag(name);
      setTags((prev) => [...prev, tag]);
      setSelectedTagIds((prev) => new Set(prev).add(tag.id));
      setNewTagName('');
      setShowAddTag(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't add side effect");
    } finally {
      setAddingTag(false);
    }
  }

  function requestClose() {
    if (!busy) onClose();
  }

  // Mirrors web's SideEffectTagPicker visibleTags: always-show tags, plus
  // any selected tag whose always_show is off — so picking one doesn't
  // make it disappear from this same form before it's saved.
  const visibleTags = [
    ...tags.filter((t) => t.always_show),
    ...tags.filter((t) => !t.always_show && selectedTagIds.has(t.id)),
  ];

  async function handleSubmit() {
    setFormError(null);
    // Resolve against the current tag list rather than trusting
    // selectedTagIds.size alone — a stale id (e.g. from a tag deleted
    // elsewhere) would otherwise pass this guard and then submit as a
    // silent no-op.
    const descriptions = tags.filter((t) => selectedTagIds.has(t.id)).map((t) => t.name);
    if (descriptions.length === 0) {
      setFormError('Select at least one side effect.');
      return;
    }
    setSaving(true);
    try {
      await addSideEffects(medication.id, {
        occurred_date: occurredDate,
        descriptions,
        severity,
        note,
      });
      setSelectedTagIds(new Set());
      setNote('');
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to log side effect');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(entry: SideEffect) {
    confirmDestructive(
      'Delete this entry?',
      `"${entry.description}" on ${entry.occurred_date} will be removed.`,
      'Delete',
      async () => {
        setFormError(null);
        setDeletingId(entry.id);
        try {
          await deleteSideEffect(entry.id);
          await load();
        } catch (e) {
          setFormError(e instanceof Error ? e.message : "Couldn't delete this entry");
        } finally {
          setDeletingId(null);
        }
      },
    );
  }

  return (
    <FormSheet
      title="Side Effects"
      subtitle={`${medication.name}${medication.dose ? ` — ${medication.dose}` : ''}`}
      onClose={requestClose}
      dismissible={!busy}
      error={formError}
      footer={<Button label="Done" variant="ghost" className="flex-1" onPress={requestClose} disabled={busy} />}>
      <Field label="Date" value={occurredDate} onChangeText={setOccurredDate} placeholder="YYYY-MM-DD" />

      <View className="gap-1">
        <Text className="text-sm">Severity</Text>
        <PillTabs variant="range" tabs={SEVERITY_OPTIONS} value={severity} onChange={setSeverity} />
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm">Side effects</Text>
          <View className="flex-row gap-4">
            <Pressable className="min-h-11 justify-center" onPress={() => setShowAddTag((v) => !v)} hitSlop={8}>
              <Text className="text-sm font-semibold text-brand-deep-blue dark:text-brand-cyan">+ Add new tag</Text>
            </Pressable>
            <Pressable className="min-h-11 justify-center" onPress={() => setManageTagsOpen(true)} hitSlop={8}>
              <Text className="text-sm font-semibold text-brand-deep-blue dark:text-brand-cyan">Manage tags</Text>
            </Pressable>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <View className="flex-row flex-wrap gap-1.5">
            {visibleTags.length === 0 ? (
              <Text muted className="text-sm">
                No side effects yet.
              </Text>
            ) : null}
            {visibleTags.map((tag) => (
              <TagPill key={tag.id} label={tag.name} selected={selectedTagIds.has(tag.id)} onPress={() => toggleTag(tag.id)} />
            ))}
          </View>
        )}
      </View>

      {showAddTag ? (
        <View className="flex-row items-center gap-2">
          <Input
            className="flex-1"
            value={newTagName}
            onChangeText={setNewTagName}
            placeholder="Side effect name"
            maxLength={30}
            onSubmitEditing={handleAddTag}
          />
          <Button label="Add" size="compact" loading={addingTag} disabled={!newTagName.trim()} onPress={handleAddTag} />
        </View>
      ) : null}

      <Field
        label="Notes (optional)"
        className="min-h-20"
        style={{ textAlignVertical: 'top' }}
        value={note}
        onChangeText={setNote}
        multiline
      />

      <Button
        label={saving ? 'Saving…' : 'Add side effect'}
        size="compact"
        className="self-start"
        loading={saving}
        disabled={selectedTagIds.size === 0}
        onPress={handleSubmit}
      />

      <View className="gap-2">
        <Text className="text-sm font-bold text-brand-navy dark:text-white">Logged side effects</Text>

        {loadError ? <Text className="text-sm text-status-danger dark:text-status-danger">{loadError}</Text> : null}

        {!loading && entries.length === 0 ? (
          <Text muted className="text-sm">
            No side effects logged yet.
          </Text>
        ) : null}

        {entries.map((entry) => (
          <View
            key={entry.id}
            className="flex-row items-start justify-between gap-2 rounded-card border border-brand-border p-3 dark:border-night-border">
            <View className="flex-1 gap-0.5">
              <View className="flex-row flex-wrap items-center gap-2">
                <View className={cn('rounded-full px-2 py-0.5', SEVERITY_BG[entry.severity])}>
                  <Text className={cn('text-xs font-medium capitalize', SEVERITY_FG[entry.severity])}>{entry.severity}</Text>
                </View>
                <Text className="text-sm">{entry.description}</Text>
              </View>
              <Text muted className="text-xs">
                {entry.occurred_date}
              </Text>
              {entry.note ? (
                <Text muted className="text-xs italic">
                  {entry.note}
                </Text>
              ) : null}
            </View>
            <Pressable className="min-h-11 justify-center" onPress={() => confirmDelete(entry)} disabled={deletingId === entry.id} hitSlop={8}>
              <Text className="text-sm font-semibold text-status-danger dark:text-status-danger">
                {deletingId === entry.id ? '…' : 'Delete'}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      {manageTagsOpen ? (
        <ManageSideEffectTagsSheet tags={tags} onClose={() => setManageTagsOpen(false)} onChanged={load} />
      ) : null}
    </FormSheet>
  );
}

/**
 * Reuses PR #16's mood-tag-management sheet (pain-mood.tsx's
 * ManageTagsSheet) as the template — same structure, different
 * table/functions (side_effect_tags instead of mood_tags).
 */
function ManageSideEffectTagsSheet({
  tags,
  onClose,
  onChanged,
}: {
  tags: SideEffectTag[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [localTags, setLocalTags] = useState(tags);
  const [newTagName, setNewTagName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = adding || busyId !== null;

  function requestClose() {
    if (!busy) onClose();
  }

  async function handleAdd() {
    const name = newTagName.trim();
    if (!name) return;
    setError(null);
    setAdding(true);
    try {
      const tag = await createSideEffectTag(name);
      setLocalTags((prev) => [...prev, tag]);
      setNewTagName('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add tag");
    } finally {
      setAdding(false);
    }
  }

  function startEditing(tag: SideEffectTag) {
    setEditingId(tag.id);
    setEditingName(tag.name);
  }

  async function handleRename(id: string) {
    const name = editingName.trim();
    if (!name) return;
    setError(null);
    setBusyId(id);
    try {
      await renameSideEffectTag(id, name);
      setLocalTags((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
      setEditingId(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't rename tag");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleAlwaysShow(tag: SideEffectTag) {
    setError(null);
    setBusyId(tag.id);
    try {
      await setSideEffectTagAlwaysShow(tag.id, !tag.always_show);
      setLocalTags((prev) =>
        prev.map((t) => (t.id === tag.id ? { ...t, always_show: !t.always_show } : t)),
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update tag");
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(tag: SideEffectTag) {
    confirmDestructive(
      'Delete this tag?',
      `"${tag.name}" will be removed from the tag picker.`,
      'Delete',
      async () => {
        setError(null);
        setBusyId(tag.id);
        try {
          await deleteSideEffectTag(tag.id);
          setLocalTags((prev) => prev.filter((t) => t.id !== tag.id));
          onChanged();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't delete tag");
        } finally {
          setBusyId(null);
        }
      },
    );
  }

  return (
    <Sheet onClose={requestClose} dismissible={!busy}>
      <Text className="mb-3 text-lg font-bold text-brand-navy dark:text-white">Manage tags</Text>

      {error ? <Text className="mb-2 text-sm text-status-danger dark:text-status-danger">{error}</Text> : null}

      <ScrollView className="max-h-[360px]">
        <View className="gap-2">
          {localTags.length === 0 ? (
            <Text muted className="text-sm">
              No tags yet.
            </Text>
          ) : null}
          {localTags.map((tag) => (
            <View key={tag.id} className="flex-row items-center justify-between gap-2 rounded-control border border-brand-border p-2 dark:border-night-border">
              {editingId === tag.id ? (
                <Input
                  className="flex-1 py-1"
                  value={editingName}
                  onChangeText={setEditingName}
                  autoFocus
                  onSubmitEditing={() => handleRename(tag.id)}
                />
              ) : (
                <Pressable className="min-h-11 flex-1 justify-center" onPress={() => startEditing(tag)}>
                  <Text className="text-sm">{tag.name}</Text>
                </Pressable>
              )}

              <View className="flex-row items-center gap-3">
                <SwitchRow
                  className="py-0"
                  label="Always show"
                  value={tag.always_show}
                  onValueChange={() => handleToggleAlwaysShow(tag)}
                  disabled={busyId === tag.id}
                />
                {editingId === tag.id ? (
                  <Pressable className="min-h-11 justify-center" onPress={() => handleRename(tag.id)} disabled={busyId === tag.id} hitSlop={8}>
                    <Text className="text-sm font-semibold text-brand-deep-blue dark:text-brand-cyan">Save</Text>
                  </Pressable>
                ) : (
                  <Pressable className="min-h-11 justify-center" onPress={() => confirmDelete(tag)} disabled={busyId === tag.id} hitSlop={8}>
                    <Text className="text-sm font-semibold text-status-danger dark:text-status-danger">Delete</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="mt-3 flex-row items-center gap-2">
        <Input className="flex-1" value={newTagName} onChangeText={setNewTagName} placeholder="New tag name" onSubmitEditing={handleAdd} />
        <Button label="Add" loading={adding} disabled={!newTagName.trim()} onPress={handleAdd} className="min-w-[72px]" />
      </View>

      <Button label="Done" variant="ghost" className="mt-3" onPress={requestClose} disabled={busy} />
    </Sheet>
  );
}

// Level picker block: label plus the 1–10 grid (DESIGN.md 6.3 / 9.1).
function LevelBlock({
  label,
  metric,
  value,
  onChange,
}: {
  label: string;
  metric: WellbeingMetric;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm">{label}</Text>
      <LevelGrid metric={metric} value={value} onChange={onChange} />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5">
      <Text muted className="text-xs">
        {label}
      </Text>
      <Text className="text-sm font-medium">{value}</Text>
    </View>
  );
}

interface EditFormState {
  name: string;
  doseAmount: string;
  doseUnit: string;
  doseForm: string;
  dailymedSetId: string;
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
  startDate: string;
  endDate: string;
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
    dailymedSetId: med.dailymed_setid ?? '',
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
    startDate: isoToUsDate(med.start_date),
    endDate: isoToUsDate(med.end_date),
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

  async function handleSave() {
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
        setFormError('First dose time is required for interval schedules.');
        return;
      }
    }
    const quantityPerDose = Number(form.quantityPerDose);
    if (!Number.isFinite(quantityPerDose) || quantityPerDose <= 0) {
      setFormError('Dose quantity must be a positive number.');
      return;
    }
    // Dates are typed as MM-DD-YYYY, stored as YYYY-MM-DD. A blank start
    // date keeps the saved value (including null on legacy rows, which the
    // calendar and reports read as the creation date) rather than inventing one.
    const startDate = form.startDate ? usDateToIso(form.startDate) : medication.start_date;
    if (form.startDate && !startDate) {
      setFormError('Start date must be a valid date in MM-DD-YYYY format.');
      return;
    }
    const endDate = form.endDate ? usDateToIso(form.endDate) : null;
    if (form.endDate && !endDate) {
      setFormError('End date must be a valid date in MM-DD-YYYY format.');
      return;
    }
    if (endDate && startDate && endDate < startDate) {
      setFormError('End date can’t be before the start date.');
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
      start_date: startDate,
      end_date: endDate,
    };

    const scheduleTimes: ScheduleTimeInput[] =
      !form.asNeeded && form.scheduleMode === 'fixed_times'
        ? form.times.map((t) => ({ reminder_time: t.time, quantity_per_dose: t.quantityPerDose }))
        : [];

    setSaving(true);
    try {
      await updateMedication(medication.id, input, scheduleTimes);
      resyncIfRemindersEnabled();
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen edges={['left', 'right', 'bottom']} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" className="text-2xl font-bold text-brand-navy dark:text-white">
        Edit medication
      </Text>

      {formError ? <Callout kind="danger">{formError}</Callout> : null}

      <Card className="gap-4 p-4">
        <View className="gap-1">
          <Text className="text-sm">Name</Text>
          <DrugNameAutocomplete
            value={form.name}
            // Typing a different name drops the match picked for the old one.
            onChangeText={(v) => setForm((prev) => ({ ...prev, name: v, dailymedSetId: '' }))}
            onSelect={applySuggestion}
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
                  <Field label="Every (hours)" keyboardType="numeric" value={form.intervalHours} onChangeText={(v) => update('intervalHours', v)} />
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
          <Field
            label="Start date (MM-DD-YYYY, blank = unchanged)"
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
                  editable={!medication.inventory_enabled}
                  className={cn(medication.inventory_enabled && 'opacity-60')}
                />
              </View>
              <View className="flex-1">
                <Field label="Unit" value={form.inventoryUnit} onChangeText={(v) => update('inventoryUnit', v)} placeholder="pills" />
              </View>
            </View>
            {medication.inventory_enabled ? (
              <Text muted className="text-xs">
                Current balance is tracked separately by doses/refills — starting quantity can&apos;t be edited once tracking is on.
              </Text>
            ) : null}
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
        <Button label="Cancel" variant="ghost" className="flex-1" onPress={onCancel} disabled={saving} />
        <Button label={saving ? 'Saving…' : 'Save'} className="flex-1" loading={saving} onPress={handleSave} />
      </View>
    </Screen>
  );
}
