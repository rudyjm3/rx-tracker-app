import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { DueNowOverlay } from '@/components/DueNowOverlay';
import { LowSupplyBanner } from '@/components/LowSupplyBanner';
import { NextDoseHero } from '@/components/dashboard/next-dose-hero';
import { DoseListSheet } from '@/components/dashboard/dose-list-sheet';
import { DoseRow } from '@/components/dashboard/dose-row';
import { GroupDoseCard } from '@/components/dashboard/group-dose-card';
import { MedsOverviewPanel } from '@/components/dashboard/meds-overview-panel';
import { QuickActionsPanel } from '@/components/dashboard/quick-actions-panel';
import { SetupCompleteBanner } from '@/components/dashboard/setup-complete-banner';
import { TodayHistoryPanel } from '@/components/dashboard/today-history-panel';
import { ZeroPillSheet } from '@/components/dashboard/zero-pill-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { LevelGrid } from '@/components/ui/level-grid';
import { MedName } from '@/components/ui/med-name';
import { SafeArea } from '@/components/ui/safe-area';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useLowSupplyAlerts } from '@/hooks/use-low-supply-alerts';
import { computeAdherenceStats, type AdherenceStats } from '@/lib/adherence';
import { useActiveProfile } from '@/lib/active-profile';
import { getMissedGraceMinutes, getSnoozeMinutes } from '@/lib/app-settings';
import {
  postponeDose,
  recordDose,
  recordDoseAtTime,
  getTodayLogs,
  getTodayPostpones,
  type DoseFeedback,
} from '@/lib/dose-logs';
import { getActiveMedications, getGroupMembers, getGroups } from '@/lib/medications';
import { playAlarmSound, resyncIfRemindersEnabled, triggerVibration } from '@/lib/notifications';
import { medicationTracksMood, medicationTracksPain } from '@/lib/pain-mood';
import {
  buildDoseEvents,
  generateAdHocPrnSlots,
  generateDaySlots,
  slotDueTime,
  slotGroupTime,
  SNOOZE_OPTIONS,
  type DaySlot,
  type NextDoseEvent,
} from '@/lib/schedule';
import type { Medication, MedicationGroup } from '@/lib/types/medications';
import { formatEpochTime, isLate, localDateString, parseTimeInput, to12h } from '@/lib/utils';

const DEFAULT_LEVEL = 5;

export default function DashboardScreen() {
  const { activeProfileId } = useActiveProfile();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [asNeededMeds, setAsNeededMeds] = useState<Medication[]>([]);
  const [slots, setSlots] = useState<DaySlot[]>([]);
  const [graceMinutes, setGraceMinutes] = useState(60);
  const [events, setEvents] = useState<NextDoseEvent[]>([]);
  // The date these events were built for — kept alongside them rather than
  // recomputed from localDateString() at action time, so a Take/Skip tap
  // that happens to land right after local midnight still records against
  // the date the on-screen slot actually belongs to, not "today" as of the
  // tap.
  const [scheduleDate, setScheduleDate] = useState(localDateString());
  // Slots feeding the adherence card, kept raw so the stats can be recomputed
  // as time passes (an untouched required dose turns "missed" once its grace
  // period expires, with no dose_logs row written — see lib/export.ts).
  const [adherenceSlots, setAdherenceSlots] = useState<{ required: DaySlot[]; nonRequired: DaySlot[] }>({
    required: [],
    nonRequired: [],
  });
  // Active groups and their members, kept for the Today's history panel's
  // dose-entry editor (it resolves historical quantities from them).
  const [groupList, setGroupList] = useState<MedicationGroup[]>([]);
  const [groupMemberList, setGroupMemberList] = useState<
    { group_id: string; medication_id: string; quantity_per_dose: number | null }[]
  >([]);
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
  // A group "Take All" past its due time acts on pending members *and*
  // non-PRN members already auto-finalized as missed, and records them at a
  // user-entered time (recordDoseAtTime) rather than now. This holds the
  // in-progress batch: the slots to record, the feedback-requiring ones
  // still to be asked about (the one currently shown lives in
  // feedbackSlot), the answers so far, and whether the shared time-entry
  // step is up.
  const [batch, setBatch] = useState<{
    // The schedule date the slots belong to, captured at creation so a
    // midnight rollover reload can't re-home them under the new date.
    date: string;
    slots: DaySlot[];
    queue: DaySlot[];
    answers: Map<string, DoseFeedback | undefined>;
    timeStep: boolean;
  } | null>(null);
  // A pending slot the user tapped Snooze on — opens the duration picker.
  const [snoozeSlot, setSnoozeSlot] = useState<DaySlot | null>(null);
  // A group card's Snooze: the same duration picker, applied to every
  // pending member of that group dose.
  const [snoozeEvent, setSnoozeEvent] = useState<NextDoseEvent | null>(null);
  // Take on a medication whose tracked inventory is at zero asks first
  // (zero-pill dialog) before falling through to handleAction.
  // `queue` are the zero-count slots still to ask about (the first is the one
  // on screen); `rest` are the slots to record once the queue is answered
  // (the non-blocked ones plus any the user chose to take anyway).
  const [zeroFlow, setZeroFlow] = useState<{ queue: DaySlot[]; rest: DaySlot[] } | null>(null);
  const zeroPillSlot = zeroFlow?.queue[0] ?? null;
  const [doseList, setDoseList] = useState<'required' | 'non-required' | null>(null);
  // ?setup=complete is passed once, right after onboarding. Captured into
  // state so the banner stays up after the param is stripped below.
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const [showSetupBanner, setShowSetupBanner] = useState(setup === 'complete');
  // The param can arrive a render after mount; once seen, the banner stays.
  if (setup === 'complete' && !showSetupBanner) setShowSetupBanner(true);
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
  const { alerts: supplyAlerts, dismiss: handleDismissSupply, dismissError: supplyDismissError } = useLowSupplyAlerts(medications);

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
      setGroupList(groups);
      setGroupMemberList(groupMembers);
      // Ungrouped as_needed medications never get a schedule slot, so
      // surface them separately with a Log dose action.
      // Only memberships of active groups count — `groups` excludes
      // deactivated ones, which generateDaySlots can't slot a med into.
      const activeGroupIds = new Set(groups.map((g) => g.id));
      const groupedIds = new Set(
        groupMembers.filter((m) => activeGroupIds.has(m.group_id)).map((m) => m.medication_id),
      );
      setAsNeededMeds(
        activeMedications.filter(
          (m) =>
            m.as_needed &&
            m.dashboard_enabled &&
            !groupedIds.has(m.id) &&
            (!m.start_date || date >= m.start_date) &&
            (!m.end_date || date <= m.end_date),
        ),
      );
      setDefaultSnoozeMinutes(snoozeMinutes);
      setGraceMinutes(graceMinutes);
      const slots = generateDaySlots(date, activeMedications, groups, groupMembers, doseLogs, postpones);
      setSlots(slots);
      setScheduleDate(date);
      setEvents(buildDoseEvents(slots, date));

      // Visibility-independent slots: a medication hidden from the daily
      // schedule (or an as-needed one in a group hidden from it) can still be
      // opted into adherence tracking, so required AND optional tracking are
      // both built from this set rather than the on-screen `slots`.
      const adherenceSource = generateDaySlots(
        date,
        activeMedications,
        groups,
        groupMembers,
        doseLogs,
        postpones,
        { ignoreDashboardVisibility: true },
      ).filter((s) => s.medication.adherence_enabled);
      setAdherenceSlots({
        required: adherenceSource.filter((s) => !s.isPrn),
        // "Take as needed" medications opted into adherence tracking are
        // tracked separately: scheduled (grouped) PRN slots plus ungrouped
        // ones logged ad hoc. Only memberships of active groups count — a
        // deleted group leaves its membership rows behind, and its meds are
        // ungrouped again.
        nonRequired: [
          ...adherenceSource.filter((s) => s.isPrn),
          ...generateAdHocPrnSlots(
            activeMedications,
            groupMembers.filter((m) => activeGroupIds.has(m.group_id)),
            doseLogs,
          ),
        ],
      });
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

  // Strip ?setup=complete so a refresh doesn't re-show the one-time banner.
  useEffect(() => {
    if (setup) router.setParams({ setup: undefined });
  }, [setup]);

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

  // Take from a schedule row or the due-now overlay: a zero-count tracked
  // medication asks first (zero-pill dialog).
  function handleTake(slot: DaySlot) {
    startTake([slot]);
  }

  function isZeroCount(slot: DaySlot): boolean {
    return slot.medication.inventory_enabled && (slot.medication.current_quantity ?? 0) <= 0;
  }

  // Zero-count slots are asked about one at a time before anything is
  // recorded; everything else goes straight to takeSlots.
  function startTake(toTake: DaySlot[]) {
    const blocked = toTake.filter(isZeroCount);
    const rest = toTake.filter((s) => !isZeroCount(s));
    if (blocked.length === 0) {
      takeSlots(rest);
      return;
    }
    setZeroFlow({ queue: blocked, rest });
  }

  // Answer for the zero-pill slot on screen: take it anyway (joins `rest`) or
  // drop it; once the queue is empty, record what's left.
  function resolveZeroPill(takeAnyway: boolean) {
    if (!zeroFlow) return;
    const [current, ...queue] = zeroFlow.queue;
    const rest = takeAnyway ? [...zeroFlow.rest, current] : zeroFlow.rest;
    if (queue.length > 0) {
      setZeroFlow({ queue, rest });
      return;
    }
    setZeroFlow(null);
    takeSlots(rest);
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

  function handleTakeAllForEvent(event: NextDoseEvent) {
    startTake(eventSlots(event).filter((s) => s.status === 'pending'));
  }

  async function takeSlots(pending: DaySlot[]) {
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

  // Non-PRN members that are missed (correctable in place) plus anything
  // still pending, PRN or not — same set as rx-tracker-web's group card.
  function takeAllSlots(event: NextDoseEvent): DaySlot[] {
    return eventSlots(event).filter((s) => s.status === 'pending' || (!s.isPrn && s.status === 'missed'));
  }

  function handleGroupTakeAll(event: NextDoseEvent) {
    // Still on time: nothing can be missed yet, so keep the instant path.
    if (event.time > Date.now()) {
      handleTakeAllForEvent(event);
      return;
    }
    const slots = takeAllSlots(event);
    if (slots.length === 0) return;
    const needsFeedback = slots.filter((s) => s.medication.feedback_type !== 'none');
    setBatch({ date: scheduleDate, slots, queue: needsFeedback.slice(1), answers: new Map(), timeStep: needsFeedback.length === 0 });
    setFeedbackSlot(needsFeedback[0] ?? null);
  }

  function batchKey(slot: DaySlot) {
    return `${slot.medicationId}|${slot.scheduledTime}`;
  }

  async function handleBatchTimeSubmit(takenAtIso: string) {
    if (!batch) return;
    await Promise.all(
      batch.slots.map((slot) =>
        recordDoseAtTime(
          slot.medication,
          batch.date,
          slot.scheduledTime,
          takenAtIso,
          slot.quantityPerDose,
          batch.answers.get(batchKey(slot)),
        ),
      ),
    );
    setBatch(null);
    resyncIfRemindersEnabled();
    await load(true);
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
    setSnoozeEvent(null);
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
  const dueNowEvent = feedbackSlot || batch
    ? null
    : (doseEvents.find((e) => e.time <= nowTick && nowTick <= e.time + graceMinutes * 60_000) ?? null);

  // Group membership/size shown on the overlay comes from the full slot
  // set (not doseEvents' own members), so it stays accurate even once some
  // groupmates have already been resolved and dropped out of doseEvents.
  const dueNowGroupMembers =
    dueNowEvent && dueNowEvent.kind === 'group'
      ? slots.filter(
          (s) => s.groupId === dueNowEvent.groupId && !s.isPrn && slotGroupTime(s, scheduleDate, slots) === dueNowEvent.time,
        )
      : null;

  // In-app "dose due" alarm (sound + vibration) — port of rx-tracker-web's
  // identical effect in DashboardClient.tsx. Fires once per slot, keyed by
  // its exact due time (slotDueTime, which is postponedUntil when snoozed)
  // rather than its scheduled time, so a later snooze can alarm again
  // instead of being permanently suppressed by the first alarm's key. Only
  // alarms while the due time has passed but the missed-dose grace cutoff
  // hasn't, so a backlog of already-overdue-past-grace slots doesn't all
  // alarm at once on load — those are about to be finalized as missed by
  // recordAndReload's own load() cycle instead. Driven by nowTick (already
  // ticking every 20s above for the midnight-rollover check) rather than
  // just `slots` changing reference, since a slot's due time can newly
  // pass without `slots` itself changing.
  const alarmedKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = nowTick;
    for (const slot of slots) {
      if (slot.status !== 'pending' || slot.isPrn) continue;
      const due = slotDueTime(slot, scheduleDate);
      if (due > now) continue;
      if (now > due + graceMinutes * 60_000) continue;
      const key = `${slot.medicationId}|${due}`;
      if (alarmedKeysRef.current.has(key)) continue;
      alarmedKeysRef.current.add(key);
      playAlarmSound();
      triggerVibration();
    }
  }, [slots, scheduleDate, graceMinutes, nowTick]);

  const adherenceStats: AdherenceStats = useMemo(() => {
    const track = (s: DaySlot, required: boolean) => ({
      // Required doses nobody acted on are missed once due time + grace has
      // passed (as-needed doses never are).
      status:
        required && s.status === 'pending' && nowTick > slotDueTime(s, scheduleDate) + graceMinutes * 60_000
          ? ('missed' as const)
          : s.status,
      late: isLate(
        { status: s.status, taken_at: s.takenAt, scheduled_for_date: scheduleDate, scheduled_time: s.scheduledTime },
        graceMinutes,
      ),
    });
    return computeAdherenceStats(
      adherenceSlots.required.map((s) => track(s, true)),
      adherenceSlots.nonRequired.map((s) => track(s, false)),
    );
  }, [adherenceSlots, nowTick, graceMinutes, scheduleDate]);

  if (loading) {
    return (
      <View className="flex-1 bg-brand-bg dark:bg-night-bg">
        <SafeArea edges={['left', 'right']} className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </SafeArea>
      </View>
    );
  }

  const pendingEvents = events.filter((e) =>
    e.kind === 'single' ? e.slot.status === 'pending' : e.members.some((m) => m.status === 'pending'),
  );
  const nextEvent = pendingEvents[0] ?? null;
  const upcomingEvent = nextEvent ? (pendingEvents.find((e) => e.time > nextEvent.time) ?? null) : null;

  const todayLabel = new Date(`${scheduleDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const dosesTaken = slots.filter((s) => s.status === 'taken').length;
  // Same effective state as the adherence card: an untouched non-PRN dose past
  // its grace period counts as missed even before a log row is written.
  const dosesMissed = slots.filter(
    (s) =>
      s.status === 'missed' ||
      (s.status === 'pending' && !s.isPrn && nowTick > slotDueTime(s, scheduleDate) + graceMinutes * 60_000),
  ).length;

  return (
    <View className="flex-1 bg-brand-bg dark:bg-night-bg">
      <SafeArea edges={['left', 'right']} className="flex-1">
        <ScrollView
          contentContainerClassName="gap-6 px-4 pb-16 pt-6"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          {(error ?? supplyDismissError) && (
            <Text className="text-status-danger dark:text-status-danger">{error ?? supplyDismissError}</Text>
          )}

          {showSetupBanner ? <SetupCompleteBanner /> : null}

          <NextDoseHero next={nextEvent} upcoming={upcomingEvent} adherence={adherenceStats} />

          <LowSupplyBanner alerts={supplyAlerts} onDismiss={handleDismissSupply} />

          <Card className="gap-3">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <View className="flex-row items-center gap-2">
                <Text className="text-lg font-bold text-brand-navy dark:text-white">Today&apos;s schedule</Text>
                <View className="rounded-full bg-brand-bg px-2 py-0.5 dark:bg-night-selected">
                  <Text muted className="text-xs">
                    {todayLabel}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="link"
                className="min-h-11 flex-row items-center gap-1"
                onPress={() => router.navigate('/calendar')}>
                <Ionicons name="calendar-outline" size={14} color="#0754A8" />
                <Text className="text-sm font-medium text-brand-deep-blue dark:text-brand-cyan">View calendar</Text>
              </Pressable>
            </View>

            {events.length === 0 ? (
              <Text muted className="text-sm">
                Nothing scheduled today.
              </Text>
            ) : (
              <View className="gap-2">
                {events.map((event) =>
                  event.kind === 'single' ? (
                    <DoseRow
                      key={`${event.slot.medicationId}|${event.slot.scheduledTime}`}
                      slot={event.slot}
                      date={scheduleDate}
                      graceMinutes={graceMinutes}
                      actingKey={actingKey}
                      onTake={handleTake}
                      onSkip={(slot) => handleAction(slot, 'skipped')}
                      onSnooze={setSnoozeSlot}
                    />
                  ) : (
                    <GroupDoseCard
                      key={`${event.groupId}|${event.time}`}
                      event={event}
                      date={scheduleDate}
                      graceMinutes={graceMinutes}
                      actingKey={actingKey}
                      takeAllCount={takeAllSlots(event).length}
                      onTakeAll={handleGroupTakeAll}
                      onSnoozeAll={setSnoozeEvent}
                      onSkipAll={handleSkipAllForEvent}
                      onTake={handleTake}
                      onSkip={(slot) => handleAction(slot, 'skipped')}
                      onSnooze={setSnoozeSlot}
                    />
                  ),
                )}
              </View>
            )}

            {asNeededMeds.length > 0 ? (
              <View className="gap-2 border-t border-brand-border pt-3 dark:border-night-border">
                <Text className="text-sm font-semibold text-brand-navy dark:text-white">As needed</Text>
                {asNeededMeds.map((med) => (
                  <View
                    key={med.id}
                    className="flex-row items-center justify-between gap-2 rounded-control bg-brand-bg px-3 py-2 dark:bg-night-selected">
                    <MedName className="flex-1 text-sm font-semibold" name={med.name} dose={med.dose} />
                    <Button
                      label="Log dose"
                      variant="secondary"
                      size="compact"
                      onPress={() => router.push(`/medications/${med.id}?action=logDose`)}
                    />
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable accessibilityRole="link" className="min-h-11 items-center justify-center" onPress={() => router.navigate('/calendar')}>
              <Text className="text-sm font-medium text-brand-deep-blue dark:text-brand-cyan">View full schedule</Text>
            </Pressable>
          </Card>

          <QuickActionsPanel />

          <MedsOverviewPanel
            activeCount={medications.length}
            todaysDosesCount={slots.length}
            dosesTaken={dosesTaken}
            dosesMissed={dosesMissed}
            onViewRequiredDoses={() => setDoseList('required')}
            onViewNonRequiredDoses={() => setDoseList('non-required')}
          />

          <TodayHistoryPanel
            date={scheduleDate}
            profileId={activeProfileId}
            medications={medications}
            groups={groupList}
            groupMembers={groupMemberList}
            refreshKey={slots}
          />
        </ScrollView>
      </SafeArea>

      {doseList ? (
        <DoseListSheet
          title={doseList === 'required' ? 'Required doses today' : 'Non-required doses today'}
          emptyText={doseList === 'required' ? 'No required doses scheduled today.' : 'No non-required doses scheduled today.'}
          slots={doseList === 'required' ? adherenceSlots.required : adherenceSlots.nonRequired}
          onClose={() => setDoseList(null)}
        />
      ) : null}

      {zeroPillSlot ? (
        <ZeroPillSheet
          // Remount per slot so the corrected count starts from zero.
          key={`${zeroPillSlot.medicationId}|${zeroPillSlot.scheduledTime}`}
          slot={zeroPillSlot}
          onClose={() => resolveZeroPill(false)}
          onCancelDose={() => resolveZeroPill(false)}
          onTakeAnyway={() => resolveZeroPill(true)}
        />
      ) : null}

      {snoozeSlot || snoozeEvent ? (
        <SnoozeSheet
          defaultMinutes={defaultSnoozeMinutes}
          busy={actingKey !== null}
          onClose={() => {
            setSnoozeSlot(null);
            setSnoozeEvent(null);
          }}
          onSelect={(minutes) => {
            if (snoozeEvent) handleSnoozeAllForEvent(snoozeEvent, minutes);
            else if (snoozeSlot) handleSnooze(snoozeSlot, minutes);
          }}
        />
      ) : null}

      {feedbackSlot && (
        <FeedbackSheet
          // Remount per slot so saving/pain/mood/note state doesn't carry
          // over when a batch or queue advances to the next medication.
          key={`${feedbackSlot.medicationId}|${feedbackSlot.scheduledTime}`}
          slot={feedbackSlot}
          onClose={() => {
            if (batch) {
              // Dismissing means "don't take this one" — drop it from the
              // batch and move on to the next feedback slot / the time step.
              const remaining = batch.slots.filter((s) => s !== feedbackSlot);
              const [next, ...rest] = batch.queue;
              setBatch(remaining.length === 0 ? null : { ...batch, slots: remaining, queue: rest, timeStep: !next });
              setFeedbackSlot(remaining.length === 0 ? null : (next ?? null));
              return;
            }
            setFeedbackSlot(null);
            setFeedbackQueue([]);
          }}
          onSubmit={async (feedback) => {
            if (batch) {
              const answers = new Map(batch.answers).set(batchKey(feedbackSlot), feedback);
              const [next, ...rest] = batch.queue;
              setBatch({ ...batch, answers, queue: rest, timeStep: !next });
              setFeedbackSlot(next ?? null);
              return;
            }
            await recordAndReload(feedbackSlot, 'taken', feedback);
            const [next, ...rest] = feedbackQueue;
            setFeedbackSlot(next ?? null);
            setFeedbackQueue(rest);
          }}
        />
      )}

      {batch?.timeStep && !feedbackSlot && (
        <TimeEntrySheet
          slotCount={batch.slots.length}
          dueTime={events.find((e) => e.kind === 'group' && e.members.includes(batch.slots[0]))?.time ?? null}
          date={batch.date}
          onClose={() => setBatch(null)}
          onSubmit={handleBatchTimeSubmit}
        />
      )}

      <DueNowOverlay
        event={dueNowEvent}
        groupMembers={dueNowGroupMembers}
        onTakeAll={() => dueNowEvent && handleTakeAllForEvent(dueNowEvent)}
        onSkipAll={() => dueNowEvent && handleSkipAllForEvent(dueNowEvent)}
        onSnoozeAll={(minutes) => dueNowEvent && handleSnoozeAllForEvent(dueNowEvent, minutes)}
        onTakeOne={handleTake}
        onSkipOne={(slot) => handleAction(slot, 'skipped')}
        onSnoozeOne={(slot, minutes) => handleSnooze(slot, minutes)}
        defaultSnoozeMinutes={defaultSnoozeMinutes}
        disabled={actingKey !== null}
        error={dueNowEvent ? error : null}
      />
    </View>
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
  // "Take without logging" records the dose with no pain/mood/note (DESIGN.md
  // 9.1); Cancel still means "don't take this one".
  async function handleSkipFeedback() {
    setFormError(null);
    setSaving(true);
    try {
      await onSubmit(undefined);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't record dose");
      setSaving(false);
    }
  }

  return (
    <Sheet onClose={onClose} dismissible={!saving}>
      <ScrollView keyboardShouldPersistTaps="handled" className="max-h-[560px]">
        <Text accessibilityRole="header" className="text-lg font-bold text-brand-navy dark:text-white">
          How are you feeling?
        </Text>
        <MedName className="mt-0.5 text-sm font-normal" doseClassName="font-normal" name={medication.name} dose={medication.dose} />

        {formError ? <Text className="mt-2 text-sm text-status-danger dark:text-status-danger">{formError}</Text> : null}

        <View className="mt-4 gap-4">
          {trackPain ? (
            <View className="gap-1.5">
              <Text className="text-sm font-medium">
                Pain level{' '}
                <Text muted className="text-xs font-normal">
                  (1 = minimal — 10 = severe)
                </Text>
              </Text>
              <LevelGrid metric="pain" value={painLevel} onChange={setPainLevel} />
            </View>
          ) : null}
          {trackMood ? (
            <View className="gap-1.5">
              <Text className="text-sm font-medium">
                Mood level{' '}
                <Text muted className="text-xs font-normal">
                  (1 = very low — 10 = excellent)
                </Text>
              </Text>
              <LevelGrid metric="mood" value={moodLevel} onChange={setMoodLevel} />
            </View>
          ) : null}

          <Field
            label="Notes (optional)"
            className="min-h-20 py-2"
            style={{ textAlignVertical: 'top' }}
            value={note}
            onChangeText={setNote}
            placeholder="Any notes about this dose…"
            maxLength={255}
            multiline
          />
        </View>

        <View className="mt-5 gap-2">
          <Button label="Save & take" onPress={handleSubmit} loading={saving} />
          <Button label="Take without logging" variant="secondary" onPress={handleSkipFeedback} disabled={saving} />
          <Button label="Cancel" variant="ghost" onPress={onClose} disabled={saving} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

function TimeEntrySheet({
  slotCount,
  dueTime,
  date,
  onClose,
  onSubmit,
}: {
  slotCount: number;
  dueTime: number | null;
  date: string;
  onClose: () => void;
  onSubmit: (takenAtIso: string) => Promise<void>;
}) {
  const [value, setValue] = useState(() => {
    const now = new Date();
    return to12h(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    const parsed = parseTimeInput(value);
    if (!parsed) {
      setFormError('Enter a time like 8:30 PM or 20:30');
      return;
    }
    const taken = new Date(`${date}T${parsed}`);
    if (taken.getTime() > Date.now()) {
      setFormError("The time taken can't be in the future");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(taken.toISOString());
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't record doses");
      setSaving(false);
    }
  }

  return (
    <Sheet onClose={onClose} dismissible={!saving}>
      <Text className="mb-0.5 text-lg font-bold text-brand-navy dark:text-white">
        What time did you take {slotCount === 1 ? 'this' : 'these'}?
      </Text>
      {dueTime !== null && (
        <Text muted className="mb-2 text-sm">
          Originally due {formatEpochTime(dueTime)}
        </Text>
      )}
      {formError && <Text className="text-status-danger dark:text-status-danger">{formError}</Text>}
      <Field
        label="Actual time taken"
        value={value}
        onChangeText={setValue}
        placeholder="8:30 PM"
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!saving}
      />
      <View className="mt-6 flex-row gap-2">
        <Button label="Cancel" variant="secondary" className="flex-1" onPress={onClose} disabled={saving} />
        <Button label="Submit" className="flex-1" onPress={handleSubmit} loading={saving} />
      </View>
    </Sheet>
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
  return (
    <Sheet onClose={onClose} dismissible={!busy}>
      <Text className="mb-0.5 text-lg font-bold text-brand-navy dark:text-white">Snooze dose</Text>
      <Text muted className="mb-2 text-sm">
        Choose how long to delay this dose.
      </Text>
      <View className="mb-4 mt-2 flex-row flex-wrap gap-2">
        {SNOOZE_OPTIONS.map((minutes) => {
          const selected = minutes === defaultMinutes;
          return (
            <Pressable
              key={minutes}
              className={
                selected
                  ? 'min-h-11 justify-center rounded-full border border-brand-deep-blue bg-brand-bg px-4 dark:border-brand-cyan dark:bg-night-selected'
                  : 'min-h-11 justify-center rounded-full border border-brand-border px-4 dark:border-night-border'
              }
              onPress={() => onSelect(minutes)}
              disabled={busy}
            >
              <Text className={selected ? 'text-sm font-bold text-brand-deep-blue dark:text-brand-cyan' : 'text-sm font-medium'}>
                {minutes} min
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button label="Cancel" variant="secondary" onPress={onClose} disabled={busy} />
    </Sheet>
  );
}
