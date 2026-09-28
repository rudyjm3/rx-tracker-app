import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DueNowOverlay } from '@/components/DueNowOverlay';
import { LowSupplyBanner } from '@/components/LowSupplyBanner';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { computeAdherenceStats } from '@/lib/adherence';
import { useActiveProfile } from '@/lib/active-profile';
import { getMissedGraceMinutes, getSnoozeMinutes } from '@/lib/app-settings';
import {
  postponeDose,
  recordDose,
  getTodayLogs,
  getTodayPostpones,
  type DoseFeedback,
} from '@/lib/dose-logs';
import { getActiveMedications, getGroupMembers, getGroups } from '@/lib/medications';
import { getSupplyAlerts, SUPPLY_SEVERITY_COLORS, SUPPLY_SEVERITY_LABELS } from '@/lib/medication-ui';
import { resyncIfRemindersEnabled } from '@/lib/notifications';
import { levelColor, medicationTracksMood, medicationTracksPain } from '@/lib/pain-mood';
import {
  buildDoseEvents,
  generateDaySlots,
  slotDueTime,
  SNOOZE_OPTIONS,
  type DaySlot,
  type NextDoseEvent,
} from '@/lib/schedule';
import type { Medication } from '@/lib/types/medications';
import { formatClockTime, isLate, localDateString, to12h } from '@/lib/utils';

const MIN_LEVEL = 1;
const MAX_LEVEL = 10;
const DEFAULT_LEVEL = 5;

export default function DashboardScreen() {
  const theme = useTheme();
  const styles = getStyles(theme);
  const { activeProfileId, familyProfiles } = useActiveProfile();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [slots, setSlots] = useState<DaySlot[]>([]);
  const [graceMinutes, setGraceMinutes] = useState(60);
  const [events, setEvents] = useState<NextDoseEvent[]>([]);
  // The date these events were built for — kept alongside them rather than
  // recomputed from localDateString() at action time, so a Take/Skip tap
  // that happens to land right after local midnight still records against
  // the date the on-screen slot actually belongs to, not "today" as of the
  // tap.
  const [scheduleDate, setScheduleDate] = useState(localDateString());
  // null = no required (adherence-tracked, non-PRN) doses today, so the
  // chip is hidden rather than showing a misleading "0%".
  const [adherencePercent, setAdherencePercent] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A medication whose feedback_type !== 'none' needs a quick pain/mood/
  // note capture before the Take actually records — set here to open the
  // sheet instead of calling recordDose immediately; Skip and a 'none'
  // medication's Take bypass this entirely.
  const [feedbackSlot, setFeedbackSlot] = useState<DaySlot | null>(null);
  // Additional feedback-requiring slots queued up behind feedbackSlot by a
  // group "Take Now" — each is shown one at a time only after the previous
  // one's sheet submits, rather than firing setFeedbackSlot once per slot
  // synchronously (which would just overwrite itself down to the last one).
  const [feedbackQueue, setFeedbackQueue] = useState<DaySlot[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  // A pending slot the user tapped Snooze on — opens the duration picker.
  const [snoozeSlot, setSnoozeSlot] = useState<DaySlot | null>(null);
  const [defaultSnoozeMinutes, setDefaultSnoozeMinutes] = useState<number | null>(null);
  // Re-evaluated on a timer (not just on reload) so the due-now overlay
  // appears and clears itself as the grace window is entered/exited while
  // the dashboard sits open in the foreground.
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Bumped on every load() call and captured per-call as requestId — if a
  // newer call starts (e.g. the active profile changes again) before an
  // older one's fetch resolves, the older call's result is a stale
  // response for a profile that's no longer selected and must be
  // discarded rather than overwriting state a newer call already set,
  // which could otherwise show one profile's doses under another's
  // selected chip and let a dose get recorded against the wrong person.
  const requestIdRef = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    const requestId = ++requestIdRef.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const date = localDateString();
      const [activeMedications, groups, groupMembers, doseLogs, postpones, graceMinutes, snoozeMinutes] =
        await Promise.all([
          getActiveMedications(activeProfileId),
          getGroups(activeProfileId),
          getGroupMembers(),
          getTodayLogs(date),
          getTodayPostpones(date),
          getMissedGraceMinutes(),
          getSnoozeMinutes(),
        ]);
      if (requestIdRef.current !== requestId) return;
      setMedications(activeMedications);
      setDefaultSnoozeMinutes(snoozeMinutes);
      setGraceMinutes(graceMinutes);
      const slots = generateDaySlots(date, activeMedications, groups, groupMembers, doseLogs, postpones);
      setSlots(slots);
      setScheduleDate(date);
      setEvents(buildDoseEvents(slots, date));

      // Separate from `slots` above (which stays scoped to what's shown on
      // screen): a medication hidden from the daily schedule but still
      // opted into adherence tracking must still count toward it.
      const requiredSlots = generateDaySlots(
        date,
        activeMedications,
        groups,
        groupMembers,
        doseLogs,
        postpones,
        { ignoreDashboardVisibility: true },
      )
        .filter((s) => !s.isPrn && s.medication.adherence_enabled)
        .map((s) => ({
          status: s.status,
          late: isLate(
            { status: s.status, taken_at: s.takenAt, scheduled_for_date: date, scheduled_time: s.scheduledTime },
            graceMinutes,
          ),
        }));
      const stats = computeAdherenceStats(requiredSlots);
      setAdherencePercent(stats.requiredTotal > 0 ? stats.percent : null);
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      setError(e instanceof Error ? e.message : 'Failed to load today’s schedule');
    } finally {
      if (requestIdRef.current !== requestId) return;
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [activeProfileId]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      // A dashboard left open across local midnight would otherwise keep
      // showing yesterday's slots/scheduleDate — and never surface an
      // early-morning dose in doseEvents — until something else (a
      // profile switch, a manual pull-to-refresh) triggers a reload.
      if (localDateString(new Date(now)) !== scheduleDate) {
        load();
      }
    }, 20_000);
    return () => clearInterval(interval);
  }, [scheduleDate, load]);

  // load() (and this callback) changes identity whenever activeProfileId
  // changes, and useFocusEffect re-invokes its callback on identity
  // changes while the screen is already focused (not just on focus
  // transitions) — so switching profiles from the chip row here reloads
  // immediately, not just the next time this screen regains focus.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function recordAndReload(slot: DaySlot, status: 'taken' | 'skipped', feedback?: DoseFeedback) {
    const key = `${slot.medicationId}|${slot.scheduledTime}`;
    setActingKey(key);
    try {
      await recordDose(
        slot.medication,
        scheduleDate,
        slot.scheduledTime,
        status,
        slot.quantityPerDose,
        feedback,
      );
      resyncIfRemindersEnabled();
      await load(true);
    } finally {
      setActingKey(null);
    }
  }

  async function handleAction(slot: DaySlot, status: 'taken' | 'skipped') {
    if (status === 'taken' && slot.medication.feedback_type !== 'none') {
      setFeedbackSlot(slot);
      return;
    }
    try {
      await recordAndReload(slot, status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record dose');
    }
  }

  async function handleSnooze(slot: DaySlot, minutes: number) {
    const key = `${slot.medicationId}|${slot.scheduledTime}`;
    setActingKey(key);
    try {
      await postponeDose(slot.medicationId, scheduleDate, slot.scheduledTime, minutes);
      resyncIfRemindersEnabled();
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to snooze dose');
    } finally {
      setActingKey(null);
      setSnoozeSlot(null);
    }
  }

  function eventSlots(event: NextDoseEvent): DaySlot[] {
    return event.kind === 'group' ? event.members : [event.slot];
  }

  async function handleTakeAllForEvent(event: NextDoseEvent) {
    const pending = eventSlots(event).filter((s) => s.status === 'pending');
    // Slots needing feedback can't just loop through handleAction: each
    // call would set feedbackSlot synchronously and the next iteration's
    // call would overwrite it before the user ever sees the first sheet.
    // Record the no-feedback ones directly, then queue the rest to be
    // shown one at a time as each sheet is submitted (see feedbackQueue).
    const noFeedback = pending.filter((s) => s.medication.feedback_type === 'none');
    const needsFeedback = pending.filter((s) => s.medication.feedback_type !== 'none');
    for (const slot of noFeedback) {
      await handleAction(slot, 'taken');
    }
    if (needsFeedback.length > 0) {
      setFeedbackSlot(needsFeedback[0]);
      setFeedbackQueue(needsFeedback.slice(1));
    }
  }

  async function handleSkipAllForEvent(event: NextDoseEvent) {
    for (const slot of eventSlots(event)) {
      if (slot.status === 'pending') await handleAction(slot, 'skipped');
    }
  }

  async function handleSnoozeAllForEvent(event: NextDoseEvent, minutes: number) {
    for (const slot of eventSlots(event)) {
      if (slot.status === 'pending') await handleSnooze(slot, minutes);
    }
  }

  // Separate from `events` (which drives "Today's schedule" and includes
  // already-resolved slots so their status still shows there) — the
  // due-now overlay only ever needs to consider doses that are still
  // pending. PRN (as-needed) slots are excluded the same way
  // computeReminderTimes skips med.as_needed for push reminders: an
  // optional dose should never trigger, or be bulk-recorded by, the
  // blocking overlay.
  const doseEvents = useMemo(
    () => buildDoseEvents(slots.filter((s) => s.status === 'pending' && !s.isPrn), scheduleDate),
    [slots, scheduleDate],
  );

  // Suppressed while the feedback sheet is open, so the overlay never
  // stacks on top of it and blocks the user from finishing the Take that
  // opened it.
  const dueNowEvent = feedbackSlot
    ? null
    : (doseEvents.find((e) => e.time <= nowTick && nowTick <= e.time + graceMinutes * 60_000) ?? null);

  // Group membership/size shown on the overlay comes from the full slot
  // set (not doseEvents' own members), so it stays accurate even once some
  // groupmates have already been resolved and dropped out of doseEvents.
  const dueNowGroupMembers =
    dueNowEvent && dueNowEvent.kind === 'group'
      ? slots.filter(
          (s) => s.groupId === dueNowEvent.groupId && !s.isPrn && slotDueTime(s, scheduleDate) === dueNowEvent.time,
        )
      : null;

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const pendingEvents = events.filter((e) =>
    e.kind === 'single' ? e.slot.status === 'pending' : e.members.some((m) => m.status === 'pending'),
  );
  const nextEvent = pendingEvents[0] ?? null;

  const supplyAlerts = getSupplyAlerts(medications);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          <View style={styles.titleRow}>
            <ThemedText type="title" style={styles.title}>
              Today
            </ThemedText>
            <View style={styles.titleActions}>
              {adherencePercent !== null && (
                <View style={styles.adherenceChip}>
                  <ThemedText type="small" style={styles.adherenceChipText}>
                    {adherencePercent}%
                  </ThemedText>
                </View>
              )}
              {supplyAlerts.length > 0 && (
                <Pressable
                  style={styles.bellButton}
                  onPress={() => setAlertsOpen(true)}
                  hitSlop={8}
                  accessibilityLabel={`Supply alerts (${supplyAlerts.length})`}
                >
                  <Ionicons name="notifications-outline" size={22} color={theme.text} />
                  <View style={styles.bellBadge}>
                    <ThemedText type="small" style={styles.bellBadgeText}>
                      {supplyAlerts.length}
                    </ThemedText>
                  </View>
                </Pressable>
              )}
            </View>
          </View>

          {familyProfiles.length > 0 && <ProfileSwitcher />}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <LowSupplyBanner medications={medications} />

          <ThemedView type="backgroundElement" style={styles.heroCard}>
            <ThemedText type="small" themeColor="textSecondary">
              Next dose
            </ThemedText>
            {nextEvent ? (
              <EventRow
                event={nextEvent}
                actingKey={actingKey}
                onAction={handleAction}
                onSnooze={setSnoozeSlot}
                emphasized
              />
            ) : (
              <ThemedText style={styles.doneText}>All done for today 🎉</ThemedText>
            )}
          </ThemedView>

          <ThemedText type="smallBold" style={styles.sectionTitle}>
            Today&apos;s schedule
          </ThemedText>

          {events.length === 0 && (
            <ThemedText themeColor="textSecondary">
              No scheduled doses today. Add a medication to get started.
            </ThemedText>
          )}

          {events.map((event) => (
            <ThemedView
              key={event.kind === 'group' ? `${event.groupId}|${event.time}` : `${event.slot.medicationId}|${event.slot.scheduledTime}`}
              type="backgroundElement"
              style={styles.scheduleCard}
            >
              <EventRow event={event} actingKey={actingKey} onAction={handleAction} onSnooze={setSnoozeSlot} />
            </ThemedView>
          ))}
        </ScrollView>
      </SafeAreaView>

      {snoozeSlot && (
        <SnoozeSheet
          defaultMinutes={defaultSnoozeMinutes}
          busy={actingKey === `${snoozeSlot.medicationId}|${snoozeSlot.scheduledTime}`}
          onClose={() => setSnoozeSlot(null)}
          onSelect={(minutes) => handleSnooze(snoozeSlot, minutes)}
        />
      )}

      {feedbackSlot && (
        <FeedbackSheet
          slot={feedbackSlot}
          onClose={() => {
            setFeedbackSlot(null);
            setFeedbackQueue([]);
          }}
          onSubmit={async (feedback) => {
            await recordAndReload(feedbackSlot, 'taken', feedback);
            const [next, ...rest] = feedbackQueue;
            setFeedbackSlot(next ?? null);
            setFeedbackQueue(rest);
          }}
        />
      )}

      {alertsOpen && <AlertsSheet alerts={supplyAlerts} onClose={() => setAlertsOpen(false)} />}

      <DueNowOverlay
        event={dueNowEvent}
        groupMembers={dueNowGroupMembers}
        onTakeAll={() => dueNowEvent && handleTakeAllForEvent(dueNowEvent)}
        onSkipAll={() => dueNowEvent && handleSkipAllForEvent(dueNowEvent)}
        onSnoozeAll={(minutes) => dueNowEvent && handleSnoozeAllForEvent(dueNowEvent, minutes)}
        onTakeOne={(slot) => handleAction(slot, 'taken')}
        onSkipOne={(slot) => handleAction(slot, 'skipped')}
        onSnoozeOne={(slot, minutes) => handleSnooze(slot, minutes)}
        defaultSnoozeMinutes={defaultSnoozeMinutes}
        disabled={actingKey !== null}
        error={dueNowEvent ? error : null}
      />
    </ThemedView>
  );
}

function AlertsSheet({
  alerts,
  onClose,
}: {
  alerts: ReturnType<typeof getSupplyAlerts>;
  onClose: () => void;
}) {
  const styles = getStyles(useTheme());
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheetWrapper} onPress={(e) => e.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <SafeAreaView edges={['bottom']}>
              <ScrollView>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Supply alerts
                </ThemedText>

                {alerts.length === 0 ? (
                  <ThemedText themeColor="textSecondary" style={styles.sheetSubtitle}>
                    You&apos;re all caught up.
                  </ThemedText>
                ) : (
                  alerts.map(({ medication, severity }) => (
                    <Pressable
                      key={medication.id}
                      style={styles.alertRow}
                      onPress={() => {
                        onClose();
                        router.push(`/medications/${medication.id}`);
                      }}
                    >
                      <View style={styles.alertRowText}>
                        <ThemedText type="smallBold">
                          {medication.name}
                          {medication.dose ? ` — ${medication.dose}` : ''}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {medication.current_quantity} {medication.inventory_unit} left
                        </ThemedText>
                      </View>
                      <ThemedText type="small" style={{ color: SUPPLY_SEVERITY_COLORS[severity], fontWeight: '700' }}>
                        {SUPPLY_SEVERITY_LABELS[severity]}
                      </ThemedText>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FeedbackSheet({
  slot,
  onClose,
  onSubmit,
}: {
  slot: DaySlot;
  onClose: () => void;
  onSubmit: (feedback?: DoseFeedback) => Promise<void>;
}) {
  const theme = useTheme();
  const styles = getStyles(theme);
  const medication = slot.medication;
  const trackPain = medicationTracksPain(medication);
  const trackMood = medicationTracksMood(medication);
  const [painLevel, setPainLevel] = useState(DEFAULT_LEVEL);
  const [moodLevel, setMoodLevel] = useState(DEFAULT_LEVEL);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    setSaving(true);
    const trimmedNote = note.trim();
    const feedback: DoseFeedback | undefined =
      trackPain || trackMood || trimmedNote
        ? {
            ...(trackPain ? { painLevel } : {}),
            ...(trackMood ? { moodLevel } : {}),
            ...(trimmedNote ? { note: trimmedNote } : {}),
          }
        : undefined;
    try {
      await onSubmit(feedback);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't record dose");
      setSaving(false);
    }
  }

  // Dismissing (backdrop tap or Android back) while a save is in flight
  // would unmount this sheet before recordDose settles — if it then fails,
  // the catch above updates only this now-unmounted component's state, so
  // the dashboard would show no error and the user could believe the dose
  // was recorded when it wasn't. Block dismissal until the request settles.
  function handleDismiss() {
    if (saving) return;
    onClose();
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={handleDismiss}>
      <Pressable style={styles.modalBackdrop} onPress={handleDismiss}>
        <Pressable style={styles.modalSheetWrapper} onPress={(e) => e.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <SafeAreaView edges={['bottom']}>
              <ScrollView>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Take {medication.name}
                </ThemedText>
                {medication.dose ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.sheetSubtitle}>
                    {medication.dose}
                  </ThemedText>
                ) : null}

                {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

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

                <FieldLabel>Note (optional)</FieldLabel>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="How are you feeling?"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                />

                <View style={styles.sheetActions}>
                  <Pressable style={styles.secondaryButton} onPress={onClose} disabled={saving}>
                    <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.sheetPrimaryButton, saving && styles.actionButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <ThemedText style={styles.actionText}>Save &amp; take</ThemedText>
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
  const styles = getStyles(useTheme());
  return (
    <View style={styles.stepperBlock}>
      <FieldLabel>{label}</FieldLabel>
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

function FieldLabel({ children }: { children: string }) {
  const styles = getStyles(useTheme());
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
      {children}
    </ThemedText>
  );
}

function formatEventTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return to12h(`${hh}:${mm}`);
}

function EventRow({
  event,
  actingKey,
  onAction,
  onSnooze,
  emphasized,
}: {
  event: NextDoseEvent;
  actingKey: string | null;
  onAction: (slot: DaySlot, status: 'taken' | 'skipped') => void;
  onSnooze: (slot: DaySlot) => void;
  emphasized?: boolean;
}) {
  const styles = getStyles(useTheme());
  const slots = event.kind === 'group' ? event.members : [event.slot];
  const heading = event.kind === 'group' ? event.groupName : event.slot.medicationName;
  // event.time is the slot's effective due time (postponedUntil when
  // snoozed, else its scheduledTime) — use it rather than the slot's own
  // scheduledTime, which stays the original time even after a snooze.
  const displayTime = formatEventTime(event.time);

  return (
    <View style={styles.eventRow}>
      <ThemedText type={emphasized ? 'subtitle' : 'default'} style={emphasized ? styles.emphasizedTime : undefined}>
        {displayTime}
      </ThemedText>
      <ThemedText type={emphasized ? undefined : 'smallBold'}>{heading}</ThemedText>
      {slots.map((slot) => (
        <View key={`${slot.medicationId}|${slot.scheduledTime}`} style={styles.slotRow}>
          <View style={styles.slotNameColumn}>
            <ThemedText type="small" style={styles.slotName}>
              {slot.medicationName} {slot.dose ? `— ${slot.dose}` : ''}
            </ThemedText>
            {slot.status === 'pending' && slot.postponedUntil && (
              <ThemedText type="small" themeColor="textSecondary">
                {`Snoozed until ${formatClockTime(slot.postponedUntil)}`}
              </ThemedText>
            )}
          </View>
          {slot.status === 'pending' ? (
            <View style={styles.actions}>
              <ActionButton
                label="Skip"
                onPress={() => onAction(slot, 'skipped')}
                busy={actingKey === `${slot.medicationId}|${slot.scheduledTime}`}
                variant="secondary"
              />
              <ActionButton
                label="Snooze"
                onPress={() => onSnooze(slot)}
                busy={actingKey === `${slot.medicationId}|${slot.scheduledTime}`}
                variant="secondary"
              />
              <ActionButton
                label="Take"
                onPress={() => onAction(slot, 'taken')}
                busy={actingKey === `${slot.medicationId}|${slot.scheduledTime}`}
              />
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.statusLabel}>
              {slot.status}
            </ThemedText>
          )}
        </View>
      ))}
    </View>
  );
}

function SnoozeSheet({
  defaultMinutes,
  busy,
  onClose,
  onSelect,
}: {
  defaultMinutes: number | null;
  busy: boolean;
  onClose: () => void;
  onSelect: (minutes: number) => void;
}) {
  const styles = getStyles(useTheme());
  return (
    <Modal visible animationType="slide" transparent onRequestClose={busy ? undefined : onClose}>
      <Pressable style={styles.modalBackdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={styles.modalSheetWrapper} onPress={(e) => e.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <SafeAreaView edges={['bottom']}>
              <ThemedText type="subtitle" style={styles.modalTitle}>
                Snooze dose
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sheetSubtitle}>
                Choose how long to delay this dose.
              </ThemedText>
              <View style={styles.chipRow}>
                {SNOOZE_OPTIONS.map((minutes) => (
                  <Pressable
                    key={minutes}
                    style={[styles.chip, minutes === defaultMinutes && styles.chipSelected]}
                    onPress={() => onSelect(minutes)}
                    disabled={busy}
                  >
                    <ThemedText
                      type="small"
                      style={minutes === defaultMinutes ? styles.chipTextSelected : undefined}
                    >
                      {minutes} min
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.secondaryButton} onPress={onClose} disabled={busy}>
                <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
              </Pressable>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionButton({
  label,
  onPress,
  busy,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const theme = useTheme();
  const styles = getStyles(theme);
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[
        styles.actionButton,
        variant === 'secondary' && styles.actionButtonSecondary,
        busy && styles.actionButtonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={variant === 'secondary' ? theme.textSecondary : '#ffffff'} />
      ) : (
        <ThemedText
          type="small"
          style={variant === 'secondary' ? styles.actionTextSecondary : styles.actionText}
        >
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  title: { fontSize: 28, lineHeight: 34 },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bellButton: { padding: Spacing.one },
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Brand.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: '#ffffff', fontSize: 10, lineHeight: 12, fontWeight: '700' },
  adherenceChip: {
    borderRadius: 999,
    backgroundColor: theme.backgroundSelected,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  adherenceChipText: { color: Brand.deepBlue, fontWeight: '700' },
  error: { color: Brand.danger },
  heroCard: { borderRadius: BorderRadius.md, padding: Spacing.three, gap: Spacing.one },
  doneText: { fontSize: 16, marginTop: Spacing.one },
  sectionTitle: { marginTop: Spacing.two },
  scheduleCard: { borderRadius: BorderRadius.md, padding: Spacing.three, gap: Spacing.one },
  eventRow: { gap: Spacing.one },
  emphasizedTime: { marginBottom: Spacing.half },
  slotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  slotNameColumn: { flex: 1, gap: Spacing.half },
  slotName: { flex: 1 },
  statusLabel: { textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two, marginBottom: Spacing.three },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  chipSelected: { borderColor: Brand.deepBlue, backgroundColor: theme.backgroundSelected },
  chipTextSelected: { fontWeight: '700', color: Brand.deepBlue },
  actionButton: {
    backgroundColor: Brand.deepBlue,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    minWidth: 64,
    alignItems: 'center',
  },
  actionButtonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border },
  actionButtonDisabled: { opacity: 0.6 },
  actionText: { color: '#ffffff', fontWeight: '600' },
  actionTextSecondary: { fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheetWrapper: { maxHeight: '85%' },
  modalSheet: { borderTopLeftRadius: Spacing.four, borderTopRightRadius: Spacing.four, padding: Spacing.four },
  modalTitle: { fontSize: 18, lineHeight: 24, marginBottom: Spacing.half },
  sheetSubtitle: { marginBottom: Spacing.two },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  alertRowText: { flex: 1, gap: 2 },
  fieldLabel: { marginTop: Spacing.three, marginBottom: Spacing.one },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    color: theme.text,
    backgroundColor: theme.backgroundElement,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  stepperBlock: { marginTop: Spacing.one },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: theme.border,
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
  sheetActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  sheetPrimaryButton: { flex: 1, paddingVertical: Spacing.three },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  secondaryButtonText: { fontWeight: '600' },
});
}
