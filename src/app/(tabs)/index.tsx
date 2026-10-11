import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { DueNowOverlay } from '@/components/DueNowOverlay';
import { LowSupplyBanner } from '@/components/LowSupplyBanner';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { ResumeSetupBanner } from '@/components/ResumeSetupBanner';
import { NextDoseHero } from '@/components/dashboard/next-dose-hero';
import { SlotActions } from '@/components/dashboard/slot-actions';
import { Button } from '@/components/ui/button';
import { MedTypeBadge } from '@/components/ui/med-type-badge';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { SafeArea } from '@/components/ui/safe-area';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useLowSupplyAlerts } from '@/hooks/use-low-supply-alerts';
import { useTheme } from '@/hooks/use-theme';
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
import { SUPPLY_SEVERITY_COLORS, SUPPLY_SEVERITY_LABELS, type SupplyAlert } from '@/lib/medication-ui';
import { playAlarmSound, resyncIfRemindersEnabled, triggerVibration } from '@/lib/notifications';
import { levelColor, medicationTracksMood, medicationTracksPain } from '@/lib/pain-mood';
import {
  buildDoseEvents,
  generateAdHocPrnSlots,
  generateDaySlots,
  slotDueTime,
  SNOOZE_OPTIONS,
  type DaySlot,
  type NextDoseEvent,
} from '@/lib/schedule';
import type { Medication } from '@/lib/types/medications';
import { formatClockTime, formatEpochTime, isLate, localDateString, parseTimeInput, to12h } from '@/lib/utils';

const MIN_LEVEL = 1;
const MAX_LEVEL = 10;
const DEFAULT_LEVEL = 5;

export default function DashboardScreen() {
  const theme = useTheme();
  const { activeProfileId, activeProfile, familyProfiles } = useActiveProfile();
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
  const [adherenceStats, setAdherenceStats] = useState<AdherenceStats>(() => computeAdherenceStats([]));
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

      // Separate from `slots` above (which stays scoped to what's shown on
      // screen): a medication hidden from the daily schedule but still
      // opted into adherence tracking must still count toward it.
      const toTracked = (s: DaySlot) => ({
        status: s.status,
        late: isLate(
          { status: s.status, taken_at: s.takenAt, scheduled_for_date: date, scheduled_time: s.scheduledTime },
          graceMinutes,
        ),
      });
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
        .map(toTracked);
      // "Take as needed" medications opted into adherence tracking are
      // tracked separately: scheduled (grouped) PRN slots plus ungrouped
      // ones logged ad hoc.
      const nonRequiredSlots = [
        ...slots.filter((s) => s.isPrn && s.medication.adherence_enabled),
        ...generateAdHocPrnSlots(activeMedications, groupMembers, doseLogs),
      ].map(toTracked);
      setAdherenceStats(computeAdherenceStats(requiredSlots, nonRequiredSlots));
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
          (s) => s.groupId === dueNowEvent.groupId && !s.isPrn && slotDueTime(s, scheduleDate) === dueNowEvent.time,
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

  if (loading) {
    return (
      <View className="flex-1 bg-brand-bg dark:bg-night-bg">
        <SafeArea className="flex-1 items-center justify-center">
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

  return (
    <View className="flex-1 bg-brand-bg dark:bg-night-bg">
      <SafeArea className="flex-1">
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-16 pt-6"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-[28px] font-bold leading-[34px] text-brand-navy dark:text-white">Today</Text>
            <View className="flex-row items-center gap-2">
              {supplyAlerts.length > 0 && (
                <Pressable
                  className="p-1"
                  onPress={() => setAlertsOpen(true)}
                  hitSlop={8}
                  accessibilityLabel={`Supply alerts (${supplyAlerts.length})`}
                >
                  <Ionicons name="notifications-outline" size={22} color={theme.text} />
                  <View className="absolute right-0 top-0 h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-[3px]">
                    <Text className="text-[10px] font-bold leading-3 text-white dark:text-white">
                      {supplyAlerts.length}
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>

          {familyProfiles.length > 0 && <ProfileSwitcher />}

          {(error ?? supplyDismissError) && (
            <Text className="text-status-danger dark:text-status-danger">{error ?? supplyDismissError}</Text>
          )}

          <ResumeSetupBanner
            profileId={activeProfileId}
            profileName={activeProfile?.display_name ?? 'your'}
            medications={medications}
          />

          <NextDoseHero
            next={nextEvent}
            upcoming={upcomingEvent}
            adherence={adherenceStats}
            actingKey={actingKey}
            onAction={handleAction}
            onSnooze={setSnoozeSlot}
            onTakeAll={handleGroupTakeAll}
            takeAllCount={nextEvent ? takeAllSlots(nextEvent).length : 0}
          />

          <LowSupplyBanner alerts={supplyAlerts} onDismiss={handleDismissSupply} />

          <Text className="mt-2 text-lg font-bold text-brand-navy dark:text-white">Today&apos;s schedule</Text>

          {events.length === 0 && (
            <Text muted className="text-sm">
              No scheduled doses today. Add a medication to get started.
            </Text>
          )}

          {events.map((event) => (
            <Card
              key={event.kind === 'group' ? `${event.groupId}|${event.time}` : `${event.slot.medicationId}|${event.slot.scheduledTime}`}
              className="gap-1"
            >
              <EventRow
                event={event}
                actingKey={actingKey}
                onAction={handleAction}
                onSnooze={setSnoozeSlot}
                onTakeAll={handleGroupTakeAll}
                takeAllCount={takeAllSlots(event).length}
              />
            </Card>
          ))}

          {asNeededMeds.length > 0 && (
            <>
              <Text className="mt-2 text-lg font-bold text-brand-navy dark:text-white">As needed</Text>
              {asNeededMeds.map((med) => (
                <Card key={med.id} className="gap-1">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-sm font-bold">
                      {med.name}
                      {med.dose ? ` ${med.dose}` : ''}
                    </Text>
                    <Button
                      label="Log dose"
                      variant="secondary"
                      size="compact"
                      onPress={() => router.push(`/medications/${med.id}?action=logDose`)}
                    />
                  </View>
                </Card>
              ))}
            </>
          )}
        </ScrollView>
      </SafeArea>

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

      {alertsOpen && <AlertsSheet alerts={supplyAlerts} onDismiss={handleDismissSupply} onClose={() => setAlertsOpen(false)} />}

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
    </View>
  );
}

function AlertsSheet({
  alerts,
  onDismiss,
  onClose,
}: {
  alerts: SupplyAlert[];
  onDismiss: (medicationId: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Sheet onClose={onClose}>
      <ScrollView>
        <Text className="mb-0.5 text-lg font-bold text-brand-navy dark:text-white">Supply alerts</Text>

        {alerts.length === 0 ? (
          <Text muted className="mb-2 text-sm">
            You&apos;re all caught up.
          </Text>
        ) : (
          alerts.map(({ medication, severity }) => (
            <View
              key={medication.id}
              className="flex-row items-center justify-between gap-2 border-b border-brand-border py-2 dark:border-night-border"
            >
              <View className="flex-1 gap-0.5">
                <Text className="text-sm font-bold">
                  {medication.name}
                  {medication.dose ? ` — ${medication.dose}` : ''}
                </Text>
                <Text className="text-sm font-bold" style={{ color: SUPPLY_SEVERITY_COLORS[severity] }}>
                  {SUPPLY_SEVERITY_LABELS[severity]} — {medication.current_quantity} {medication.inventory_unit} remaining
                </Text>
              </View>
              <Button
                label="Refill"
                size="compact"
                accessibilityLabel={`Refill ${medication.name}`}
                onPress={() => {
                  onClose();
                  router.push(`/medications/${medication.id}?action=refill`);
                }}
              />
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Dismiss alert for ${medication.name}`}
                onPress={() => onDismiss(medication.id)}
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </Sheet>
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
  return (
    <Sheet onClose={onClose} dismissible={!saving}>
      <ScrollView>
        <Text className="mb-0.5 text-lg font-bold text-brand-navy dark:text-white">Take {medication.name}</Text>
        {medication.dose ? (
          <Text muted className="mb-2 text-sm">
            {medication.dose}
          </Text>
        ) : null}

        {formError && <Text className="text-status-danger dark:text-status-danger">{formError}</Text>}

        {trackPain && (
          <LevelStepper label="Pain level" value={painLevel} onChange={setPainLevel} color={levelColor('pain', painLevel)} />
        )}
        {trackMood && (
          <LevelStepper label="Mood level" value={moodLevel} onChange={setMoodLevel} color={levelColor('mood', moodLevel)} />
        )}

        <Field
          label="Note (optional)"
          className="min-h-20 py-2"
          style={{ textAlignVertical: 'top' }}
          value={note}
          onChangeText={setNote}
          placeholder="How are you feeling?"
          multiline
        />

        <View className="mt-6 flex-row gap-2">
          <Button label="Cancel" variant="secondary" className="flex-1" onPress={onClose} disabled={saving} />
          <Button label="Save & take" className="flex-1" onPress={handleSubmit} loading={saving} />
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
    <View className="mt-3 gap-1">
      <Text muted className="text-sm font-medium">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-control border border-brand-border dark:border-night-border"
          onPress={() => onChange(Math.max(MIN_LEVEL, value - 1))}
          disabled={value <= MIN_LEVEL}
          hitSlop={8}
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text className="text-xl font-semibold">−</Text>
        </Pressable>
        <View className="h-11 w-12 items-center justify-center rounded-control border-2" style={{ borderColor: color }}>
          <Text className="text-sm font-bold" style={{ color }}>
            {value}
          </Text>
        </View>
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-control border border-brand-border dark:border-night-border"
          onPress={() => onChange(Math.min(MAX_LEVEL, value + 1))}
          disabled={value >= MAX_LEVEL}
          hitSlop={8}
          accessibilityLabel={`Increase ${label}`}
        >
          <Text className="text-xl font-semibold">+</Text>
        </Pressable>
        <Text muted className="text-sm">
          out of {MAX_LEVEL}
        </Text>
      </View>
    </View>
  );
}

function EventRow({
  event,
  actingKey,
  onAction,
  onSnooze,
  onTakeAll,
  takeAllCount = 0,
}: {
  event: NextDoseEvent;
  actingKey: string | null;
  onAction: (slot: DaySlot, status: 'taken' | 'skipped') => void;
  onSnooze: (slot: DaySlot) => void;
  onTakeAll?: (event: NextDoseEvent) => void;
  takeAllCount?: number;
}) {
  const slots = event.kind === 'group' ? event.members : [event.slot];
  const heading = event.kind === 'group' ? event.groupName : event.slot.medicationName;
  // event.time is the slot's effective due time (postponedUntil when
  // snoozed, else its scheduledTime) — use it rather than the slot's own
  // scheduledTime, which stays the original time even after a snooze.
  const displayTime = formatEpochTime(event.time);

  return (
    <View className="gap-1">
      <Text className="text-base font-semibold">
        {displayTime}
      </Text>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-bold">{heading}</Text>
        {event.kind === 'group' && onTakeAll && takeAllCount > 0 && (
          <Button label="Take All" size="compact" onPress={() => onTakeAll(event)} loading={actingKey !== null} />
        )}
      </View>
      {slots.map((slot) => {
        const key = `${slot.medicationId}|${slot.scheduledTime}`;
        return (
          <View key={key} className="flex-row items-center justify-between gap-2">
            <View className="flex-1 gap-0.5">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-sm font-medium">
                  {slot.medicationName} {slot.dose ? `— ${slot.dose}` : ''}
                </Text>
                <MedTypeBadge type={slot.medication.medication_type} />
              </View>
              {slot.status === 'pending' && slot.postponedUntil && (
                <Text muted className="text-sm">
                  {`Snoozed until ${formatClockTime(slot.postponedUntil)}`}
                </Text>
              )}
            </View>
            {slot.status === 'pending' ? (
              <SlotActions slot={slot} actingKey={actingKey} onAction={onAction} onSnooze={onSnooze} />
            ) : (
              <Text muted className="text-sm font-medium capitalize">
                {slot.status}
              </Text>
            )}
          </View>
        );
      })}
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
