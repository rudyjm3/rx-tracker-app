import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { getTodayLogs, recordDoseAtTime, type DoseFeedback } from '@/lib/dose-logs';
import { adjustQuantity, getRefillHistory, logRefill } from '@/lib/inventory';
import {
  activateMedication,
  deactivateMedication,
  getGroupMembers,
  getGroups,
  getMedication,
  updateMedication,
  type MedicationInput,
  type ScheduleTimeInput,
} from '@/lib/medications';
import { MEDICATION_TYPE_LABELS, MEDICATION_TYPE_OPTIONS } from '@/lib/medication-ui';
import { resyncIfRemindersEnabled } from '@/lib/notifications';
import { levelColor, medicationTracksMood, medicationTracksPain } from '@/lib/pain-mood';
import { generateDaySlots, type DaySlot } from '@/lib/schedule';
import {
  addSideEffect,
  deleteSideEffect,
  getSideEffects,
  type SideEffectInput,
} from '@/lib/side-effects';
import {
  createSideEffectTag,
  deleteSideEffectTag,
  getSideEffectTags,
  renameSideEffectTag,
  setSideEffectTagAlwaysShow,
} from '@/lib/side-effect-tags';
import type {
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
import { daysUntilRunout, localDateString, scheduleSummary, to12h } from '@/lib/utils';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_LEVEL = 1;
const MAX_LEVEL = 10;

const SEVERITY_OPTIONS: { value: SideEffectSeverity; label: string }[] = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
];

const SEVERITY_COLOR: Record<SideEffectSeverity, string> = {
  mild: Brand.success,
  moderate: Brand.warning,
  severe: Brand.danger,
};

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [medication, setMedication] = useState<Medication | null>(null);
  const [refillHistory, setRefillHistory] = useState<MedicationRefill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [refillSheetMode, setRefillSheetMode] = useState<'refill' | 'adjust' | null>(null);
  const [logDoseOpen, setLogDoseOpen] = useState(false);
  const [sideEffectsOpen, setSideEffectsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const med = await getMedication(id);
      setMedication(med);
      setRefillHistory(med.inventory_enabled ? await getRefillHistory(id) : []);
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
            resyncIfRemindersEnabled();
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

  const hasInventory = medication.inventory_enabled && medication.starting_quantity != null;
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
            <Pressable style={styles.primaryButton} onPress={() => setLogDoseOpen(true)}>
              <ThemedText style={styles.primaryButtonText}>Log Dose</ThemedText>
            </Pressable>
          </View>

          {hasInventory && (
            <View style={styles.actions}>
              <Pressable style={styles.secondaryButton} onPress={() => setRefillSheetMode('refill')}>
                <ThemedText style={styles.secondaryButtonText}>Log Refill</ThemedText>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => setRefillSheetMode('adjust')}>
                <ThemedText style={styles.secondaryButtonText}>Adjust Quantity</ThemedText>
              </Pressable>
            </View>
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

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={() => setSideEffectsOpen(true)}>
              <ThemedText style={styles.secondaryButtonText}>Side Effects</ThemedText>
            </Pressable>
          </View>

          {hasInventory && refillHistory.length > 0 && (
            <View style={styles.historySection}>
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                Refill History
              </ThemedText>
              {refillHistory.map((entry) => (
                <RefillHistoryRow key={entry.id} entry={entry} unit={medication.inventory_unit} />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {hasInventory && refillSheetMode && (
        <RefillSheet
          mode={refillSheetMode}
          medication={medication}
          onClose={() => setRefillSheetMode(null)}
          onSaved={async () => {
            setRefillSheetMode(null);
            await load();
          }}
        />
      )}

      {logDoseOpen && (
        <LogDoseSheet
          medication={medication}
          onClose={() => setLogDoseOpen(false)}
          onSaved={async () => {
            setLogDoseOpen(false);
            await load();
          }}
        />
      )}

      {sideEffectsOpen && (
        <SideEffectsSheet medication={medication} onClose={() => setSideEffectsOpen(false)} />
      )}
    </ThemedView>
  );
}

function RefillHistoryRow({ entry, unit }: { entry: MedicationRefill; unit: string }) {
  const isAdjustment = entry.entry_type === 'adjustment';
  const sign = entry.amount >= 0 ? '+' : '';
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyMain}>
        <ThemedText type="small">{entry.refill_date}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {isAdjustment ? 'Adjustment' : 'Refill'} · {sign}
          {entry.amount} {unit} · {entry.pills_on_hand} on hand after
        </ThemedText>
        {entry.note ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.historyNote}>
            {entry.note}
          </ThemedText>
        ) : null}
      </View>
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
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheetWrapper} onPress={(e) => e.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <SafeAreaView edges={['bottom']}>
              <ScrollView>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  {mode === 'refill' ? 'Log Refill' : 'Adjust Quantity'}
                </ThemedText>

                {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

                {mode === 'refill' ? (
                  <>
                    <FieldLabel>Refill date</FieldLabel>
                    <TextInput
                      style={styles.input}
                      value={refillDate}
                      onChangeText={setRefillDate}
                      placeholder="YYYY-MM-DD"
                    />
                    <FieldLabel>{`Amount added (${medication.inventory_unit})`}</FieldLabel>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={amount}
                      onChangeText={setAmount}
                      placeholder="e.g. 30"
                    />
                    <FieldLabel>Note (optional)</FieldLabel>
                    <TextInput
                      style={styles.input}
                      value={note}
                      onChangeText={setNote}
                      placeholder="e.g. 30-day supply"
                    />
                  </>
                ) : (
                  <>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                      Current count: {medication.current_quantity ?? 0} {medication.inventory_unit}
                    </ThemedText>
                    <FieldLabel>{`Correct current quantity (${medication.inventory_unit})`}</FieldLabel>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={newQuantity}
                      onChangeText={setNewQuantity}
                    />
                    <FieldLabel>Reason (optional)</FieldLabel>
                    <TextInput
                      style={styles.input}
                      value={note}
                      onChangeText={setNote}
                      placeholder="e.g. recount, dropped a pill"
                    />
                  </>
                )}

                <View style={styles.actions}>
                  <Pressable style={styles.secondaryButton} onPress={onClose} disabled={saving}>
                    <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryButton, saving && styles.disabled]}
                    onPress={handleSubmit}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <ThemedText style={styles.primaryButtonText}>
                        {mode === 'refill' ? 'Log Refill' : 'Save'}
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
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
  onClose,
  onSaved,
}: {
  medication: Medication;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = localDateString();
  const [date, setDate] = useState(today);
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
      setFormError('Enter a valid time (HH:MM).');
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
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheetWrapper} onPress={(e) => e.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <SafeAreaView edges={['bottom']}>
              <ScrollView>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Log Dose
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sheetSubtitle}>
                  {medication.name}
                  {medication.dose ? ` — ${medication.dose}` : ''}
                </ThemedText>

                {!entryStep ? (
                  <>
                    <FieldLabel>Date</FieldLabel>
                    <TextInput
                      style={styles.input}
                      value={date}
                      onChangeText={(v) => {
                        setDate(v);
                        setSlot(null);
                      }}
                      placeholder="YYYY-MM-DD"
                    />
                    {dateError && <ThemedText style={styles.error}>{dateError}</ThemedText>}

                    {contextError ? (
                      <View style={styles.slotErrorBox}>
                        <ThemedText style={styles.error}>
                          Couldn&apos;t load medication groups. Try again before logging this dose.
                        </ThemedText>
                        <Pressable
                          style={styles.secondaryButton}
                          onPress={() => setContextReloadToken((t) => t + 1)}
                        >
                          <ThemedText style={styles.secondaryButtonText}>Retry</ThemedText>
                        </Pressable>
                      </View>
                    ) : dateError ? null : loadingSlots ? (
                      <ActivityIndicator style={styles.loading} />
                    ) : pickableSlots.length > 0 ? (
                      <View style={styles.slotsList}>
                        {pickableSlots.map((s) => (
                          <Pressable key={s.scheduledTime} style={styles.slotButton} onPress={() => pickSlot(s)}>
                            <ThemedText type="smallBold">{to12h(s.scheduledTime)}</ThemedText>
                            {s.status === 'missed' && (
                              <ThemedText type="small" style={styles.slotMissedTag}>
                                Missed
                              </ThemedText>
                            )}
                          </Pressable>
                        ))}
                      </View>
                    ) : (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                        {slots.length === 0
                          ? 'No scheduled doses for this date.'
                          : 'Every scheduled dose for this date is already logged.'}
                      </ThemedText>
                    )}

                    <View style={styles.actions}>
                      <Pressable style={styles.secondaryButton} onPress={onClose}>
                        <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
                      </Pressable>
                      <Pressable
                        style={[styles.secondaryButton, !!dateError && styles.disabled]}
                        onPress={() => pickSlot(null)}
                        disabled={!!dateError}
                      >
                        <ThemedText style={styles.secondaryButtonText}>Log at a custom time instead</ThemedText>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    {contextLabel && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                        {contextLabel}
                      </ThemedText>
                    )}

                    {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

                    <FieldLabel>Actual time taken</FieldLabel>
                    <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder="HH:MM" />

                    {trackPain && (
                      <LevelStepper
                        label="Pain level"
                        value={painLevel}
                        onChange={setPainLevel}
                        color={levelColor('pain', painLevel)}
                      />
                    )}
                    {trackMood && (
                      <LevelStepper
                        label="Mood level"
                        value={moodLevel}
                        onChange={setMoodLevel}
                        color={levelColor('mood', moodLevel)}
                      />
                    )}

                    <FieldLabel>Notes (optional)</FieldLabel>
                    <TextInput
                      style={[styles.input, styles.multiline]}
                      value={note}
                      onChangeText={setNote}
                      multiline
                      maxLength={255}
                    />

                    {!neverScheduled && (
                      <Pressable
                        onPress={() => setEntryStepChosen(false)}
                        disabled={saving}
                        hitSlop={8}
                        style={styles.backLinkWrap}
                      >
                        <ThemedText style={styles.backLink}>← Back</ThemedText>
                      </Pressable>
                    )}

                    <View style={styles.actions}>
                      <Pressable style={styles.secondaryButton} onPress={onClose} disabled={saving}>
                        <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
                      </Pressable>
                      <Pressable
                        style={[styles.primaryButton, saving && styles.disabled]}
                        onPress={handleSave}
                        disabled={saving}
                      >
                        {saving ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <ThemedText style={styles.primaryButtonText}>Log Dose</ThemedText>
                        )}
                      </Pressable>
                    </View>
                  </>
                )}
              </ScrollView>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
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
  const theme = useTheme();
  const inputThemeStyle = { backgroundColor: theme.backgroundElement, color: theme.text };
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

  async function handleSubmit() {
    setFormError(null);
    if (selectedTagIds.size === 0) {
      setFormError('Select at least one side effect.');
      return;
    }
    const descriptions = tags.filter((t) => selectedTagIds.has(t.id)).map((t) => t.name);
    setSaving(true);
    try {
      await Promise.all(
        descriptions.map((description) => {
          const input: SideEffectInput = {
            occurred_date: occurredDate,
            description,
            severity,
            note,
          };
          return addSideEffect(medication.id, input);
        }),
      );
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
    <Modal visible animationType="slide" transparent onRequestClose={requestClose}>
      <Pressable style={styles.modalBackdrop} onPress={requestClose}>
        <Pressable style={styles.editSheetWrapper} onPress={(e) => e.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <SafeAreaView edges={['bottom']}>
              <ScrollView>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Side Effects
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.editSubtitle}>
                  {medication.name}
                  {medication.dose ? ` — ${medication.dose}` : ''}
                </ThemedText>

                {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

                <FieldLabel>Date</FieldLabel>
                <TextInput
                  style={[styles.input, inputThemeStyle]}
                  placeholderTextColor={theme.textSecondary}
                  value={occurredDate}
                  onChangeText={setOccurredDate}
                  placeholder="YYYY-MM-DD"
                />

                <FieldLabel>Severity</FieldLabel>
                <View style={styles.statusRow}>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[styles.statusChip, severity === opt.value && styles.statusChipSelected]}
                      onPress={() => setSeverity(opt.value)}
                    >
                      <ThemedText
                        type="small"
                        style={severity === opt.value ? styles.statusChipTextSelected : undefined}
                      >
                        {opt.label}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.tagsHeaderRow}>
                  <FieldLabel>Side effects</FieldLabel>
                  <View style={styles.tagsHeaderLinks}>
                    <Pressable onPress={() => setShowAddTag((s) => !s)} hitSlop={8}>
                      <ThemedText type="small" style={styles.manageTagsLink}>
                        + Add new tag
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={() => setManageTagsOpen(true)} hitSlop={8}>
                      <ThemedText type="small" style={styles.manageTagsLink}>
                        Manage tags
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
                {loading ? (
                  <ActivityIndicator style={styles.loading} />
                ) : (
                  <View style={styles.tagList}>
                    {tags.map((tag) => {
                      const selected = selectedTagIds.has(tag.id);
                      return (
                        <Pressable
                          key={tag.id}
                          style={[styles.tagChip, selected && styles.tagChipSelected]}
                          onPress={() => toggleTag(tag.id)}
                        >
                          <ThemedText type="small" style={selected ? styles.tagTextSelected : styles.tagText}>
                            {tag.name}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {showAddTag && (
                  <View style={styles.addTagRow}>
                    <TextInput
                      style={[styles.input, styles.addTagInput, inputThemeStyle]}
                      placeholderTextColor={theme.textSecondary}
                      value={newTagName}
                      onChangeText={setNewTagName}
                      placeholder="Side effect name"
                      maxLength={30}
                      onSubmitEditing={handleAddTag}
                    />
                    <Pressable
                      style={[styles.primaryButton, styles.addTagButton, (addingTag || !newTagName.trim()) && styles.disabled]}
                      onPress={handleAddTag}
                      disabled={addingTag || !newTagName.trim()}
                    >
                      {addingTag ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <ThemedText style={styles.primaryButtonText}>Add</ThemedText>
                      )}
                    </Pressable>
                  </View>
                )}

                <FieldLabel>Notes (optional)</FieldLabel>
                <TextInput
                  style={[styles.input, styles.multiline, inputThemeStyle]}
                  placeholderTextColor={theme.textSecondary}
                  value={note}
                  onChangeText={setNote}
                  multiline
                />

                <Pressable
                  style={[styles.primaryButton, (saving || selectedTagIds.size === 0) && styles.disabled]}
                  onPress={handleSubmit}
                  disabled={saving || selectedTagIds.size === 0}
                >
                  {saving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText style={styles.primaryButtonText}>Add side effect</ThemedText>
                  )}
                </Pressable>

                <ThemedText type="smallBold" style={styles.sectionTitle}>
                  Logged side effects
                </ThemedText>

                {loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

                {!loading && entries.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    No side effects logged yet.
                  </ThemedText>
                )}

                {entries.map((entry) => (
                  <ThemedView key={entry.id} type="backgroundElement" style={styles.sideEffectRow}>
                    <View style={styles.sideEffectMain}>
                      <View style={styles.sideEffectHeaderRow}>
                        <View style={[styles.severityBadge, { backgroundColor: SEVERITY_COLOR[entry.severity] }]}>
                          <ThemedText type="small" style={styles.severityBadgeText}>
                            {entry.severity}
                          </ThemedText>
                        </View>
                        <ThemedText type="small">{entry.description}</ThemedText>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {entry.occurred_date}
                      </ThemedText>
                      {entry.note ? (
                        <ThemedText type="small" themeColor="textSecondary" style={styles.historyNote}>
                          {entry.note}
                        </ThemedText>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => confirmDelete(entry)}
                      disabled={deletingId === entry.id}
                      hitSlop={8}
                    >
                      <ThemedText type="small" style={styles.deleteText}>
                        {deletingId === entry.id ? '…' : 'Delete'}
                      </ThemedText>
                    </Pressable>
                  </ThemedView>
                ))}

                <Pressable style={styles.closeButton} onPress={requestClose} disabled={busy}>
                  <ThemedText style={styles.closeButtonText}>Done</ThemedText>
                </Pressable>
              </ScrollView>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>

      {manageTagsOpen && (
        <ManageSideEffectTagsSheet
          tags={tags}
          onClose={() => setManageTagsOpen(false)}
          onChanged={load}
        />
      )}
    </Modal>
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
  const theme = useTheme();
  const inputThemeStyle = { backgroundColor: theme.backgroundElement, color: theme.text };
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
    <Modal visible animationType="slide" transparent onRequestClose={requestClose}>
      <Pressable style={styles.modalBackdrop} onPress={requestClose}>
        <Pressable style={styles.modalSheetWrapper} onPress={(e) => e.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <SafeAreaView edges={['bottom']}>
              <ThemedText type="subtitle" style={styles.modalTitle}>
                Manage tags
              </ThemedText>

              {error && <ThemedText style={styles.error}>{error}</ThemedText>}

              <ScrollView style={styles.manageTagsList}>
                {localTags.map((tag) => (
                  <View key={tag.id} style={styles.manageTagRow}>
                    {editingId === tag.id ? (
                      <TextInput
                        style={[styles.input, styles.manageTagInput, inputThemeStyle]}
                        placeholderTextColor={theme.textSecondary}
                        value={editingName}
                        onChangeText={setEditingName}
                        autoFocus
                        onSubmitEditing={() => handleRename(tag.id)}
                      />
                    ) : (
                      <Pressable style={styles.manageTagNameButton} onPress={() => startEditing(tag)}>
                        <ThemedText>{tag.name}</ThemedText>
                      </Pressable>
                    )}

                    <View style={styles.manageTagActions}>
                      <View style={styles.manageTagAlwaysShow}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Always show
                        </ThemedText>
                        <Switch
                          value={tag.always_show}
                          onValueChange={() => handleToggleAlwaysShow(tag)}
                          disabled={busyId === tag.id}
                        />
                      </View>
                      {editingId === tag.id ? (
                        <Pressable
                          onPress={() => handleRename(tag.id)}
                          disabled={busyId === tag.id}
                          hitSlop={8}
                        >
                          <ThemedText style={styles.manageTagSaveText}>Save</ThemedText>
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => confirmDelete(tag)} disabled={busyId === tag.id} hitSlop={8}>
                          <ThemedText style={styles.deleteText}>Delete</ThemedText>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.addTagRow}>
                <TextInput
                  style={[styles.input, styles.addTagInput, inputThemeStyle]}
                  placeholderTextColor={theme.textSecondary}
                  value={newTagName}
                  onChangeText={setNewTagName}
                  placeholder="New tag name"
                  onSubmitEditing={handleAdd}
                />
                <Pressable
                  style={[styles.primaryButton, styles.addTagButton, (adding || !newTagName.trim()) && styles.disabled]}
                  onPress={handleAdd}
                  disabled={adding || !newTagName.trim()}
                >
                  {adding ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.primaryButtonText}>Add</ThemedText>}
                </Pressable>
              </View>

              <Pressable style={styles.closeButton} onPress={requestClose} disabled={busy}>
                <ThemedText style={styles.closeButtonText}>Done</ThemedText>
              </Pressable>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LevelStepper({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  color: string;
}) {
  return (
    <View style={styles.stepperBlock}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        {label}
      </ThemedText>
      <View style={styles.stepperRow}>
        <Pressable
          style={styles.stepperButton}
          onPress={() => onChange(Math.max(MIN_LEVEL, value - 1))}
          disabled={value <= MIN_LEVEL}
          hitSlop={8}
        >
          <ThemedText style={styles.stepperButtonText}>−</ThemedText>
        </Pressable>
        <View style={[styles.stepperValue, { borderColor: color }]}>
          <ThemedText type="smallBold" style={{ color }}>
            {value}
          </ThemedText>
        </View>
        <Pressable
          style={styles.stepperButton}
          onPress={() => onChange(Math.min(MAX_LEVEL, value + 1))}
          disabled={value >= MAX_LEVEL}
          hitSlop={8}
        >
          <ThemedText style={styles.stepperButtonText}>+</ThemedText>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary">
          out of {MAX_LEVEL}
        </ThemedText>
      </View>
    </View>
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
      resyncIfRemindersEnabled();
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
  error: { color: Brand.danger, marginVertical: Spacing.two },
  inactiveBanner: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2, marginTop: Spacing.two },
  detailRow: { marginTop: Spacing.three, gap: 2 },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  historySection: { marginTop: Spacing.four, gap: Spacing.two },
  sectionTitle: { marginBottom: Spacing.one },
  historyRow: { flexDirection: 'row', paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Brand.border },
  historyMain: { flex: 1, gap: 2 },
  historyNote: { fontStyle: 'italic' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheetWrapper: { maxHeight: '85%' },
  modalSheet: { borderTopLeftRadius: Spacing.four, borderTopRightRadius: Spacing.four, padding: Spacing.four },
  modalTitle: { fontSize: 18, lineHeight: 24, marginBottom: Spacing.two },
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
  hint: { marginTop: Spacing.one },
  sheetSubtitle: { marginTop: -Spacing.two, marginBottom: Spacing.two },
  loading: { marginTop: Spacing.three },
  slotsList: { gap: Spacing.two, marginTop: Spacing.two },
  slotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: BorderRadius.sm,
    padding: Spacing.three,
  },
  slotMissedTag: { color: Brand.danger, fontWeight: '700' },
  slotErrorBox: { gap: Spacing.two, marginTop: Spacing.two },
  backLinkWrap: { marginTop: Spacing.three },
  backLink: { color: Brand.deepBlue, fontWeight: '600' },
  stepperBlock: { marginTop: Spacing.one },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Brand.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 20, fontWeight: '600' },
  stepperValue: {
    width: 48,
    height: 40,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSheetWrapper: { maxHeight: '85%' },
  editSubtitle: { marginTop: -Spacing.two, marginBottom: Spacing.two },
  statusRow: { flexDirection: 'row', gap: Spacing.two },
  statusChip: {
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  statusChipSelected: { borderColor: Brand.deepBlue, backgroundColor: Brand.bg },
  statusChipTextSelected: { fontWeight: '700', color: Brand.deepBlue },
  tagsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.three },
  tagsHeaderLinks: { flexDirection: 'row', gap: Spacing.three },
  manageTagsLink: { color: Brand.deepBlue, fontWeight: '600' },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  tagChip: {
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  tagChipSelected: { backgroundColor: Brand.deepBlue, borderColor: Brand.deepBlue },
  tagText: { color: Brand.textMuted },
  tagTextSelected: { color: '#ffffff', fontWeight: '600' },
  deleteText: { color: Brand.danger, fontWeight: '600' },
  closeButton: { marginTop: Spacing.three, alignItems: 'center', paddingVertical: Spacing.two },
  closeButtonText: { fontWeight: '600', color: Brand.deepBlue },
  manageTagsList: { maxHeight: 360 },
  manageTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.border,
  },
  manageTagNameButton: { flex: 1 },
  manageTagInput: { flex: 1, paddingVertical: Spacing.one },
  manageTagActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  manageTagAlwaysShow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  manageTagSaveText: { color: Brand.deepBlue, fontWeight: '600' },
  addTagRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three, alignItems: 'center' },
  addTagInput: { flex: 1 },
  addTagButton: { marginTop: 0, paddingHorizontal: Spacing.four, minWidth: 72 },
  sideEffectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  sideEffectMain: { flex: 1, gap: 2 },
  sideEffectHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  severityBadge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  severityBadgeText: { color: '#ffffff', fontWeight: '600' },
});
