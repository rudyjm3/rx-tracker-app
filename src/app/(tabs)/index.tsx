import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LowSupplyBanner } from '@/components/LowSupplyBanner';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { computeAdherenceStats } from '@/lib/adherence';
import { useActiveProfile } from '@/lib/active-profile';
import { getMissedGraceMinutes } from '@/lib/app-settings';
import { recordDose, getTodayLogs, getTodayPostpones } from '@/lib/dose-logs';
import { getActiveMedications, getGroupMembers, getGroups } from '@/lib/medications';
import { buildDoseEvents, generateDaySlots, type DaySlot, type NextDoseEvent } from '@/lib/schedule';
import type { Medication } from '@/lib/types/medications';
import { isLate, localDateString, to12h } from '@/lib/utils';

export default function DashboardScreen() {
  const { activeProfileId, familyProfiles } = useActiveProfile();
  const [medications, setMedications] = useState<Medication[]>([]);
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
      const [activeMedications, groups, groupMembers, doseLogs, postpones, graceMinutes] = await Promise.all([
        getActiveMedications(activeProfileId),
        getGroups(activeProfileId),
        getGroupMembers(),
        getTodayLogs(date),
        getTodayPostpones(date),
        getMissedGraceMinutes(),
      ]);
      if (requestIdRef.current !== requestId) return;
      setMedications(activeMedications);
      const slots = generateDaySlots(date, activeMedications, groups, groupMembers, doseLogs, postpones);
      setScheduleDate(date);
      setEvents(buildDoseEvents(slots, date));

      const requiredSlots = slots
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

  async function handleAction(slot: DaySlot, status: 'taken' | 'skipped') {
    const key = `${slot.medicationId}|${slot.scheduledTime}`;
    setActingKey(key);
    try {
      await recordDose(
        slot.medication,
        scheduleDate,
        slot.scheduledTime,
        status,
        slot.quantityPerDose,
      );
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record dose');
    } finally {
      setActingKey(null);
    }
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

  const pendingEvents = events.filter((e) =>
    e.kind === 'single' ? e.slot.status === 'pending' : e.members.some((m) => m.status === 'pending'),
  );
  const nextEvent = pendingEvents[0] ?? null;

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
            {adherencePercent !== null && (
              <View style={styles.adherenceChip}>
                <ThemedText type="small" style={styles.adherenceChipText}>
                  {adherencePercent}%
                </ThemedText>
              </View>
            )}
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
              <EventRow event={event} actingKey={actingKey} onAction={handleAction} />
            </ThemedView>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
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
  emphasized,
}: {
  event: NextDoseEvent;
  actingKey: string | null;
  onAction: (slot: DaySlot, status: 'taken' | 'skipped') => void;
  emphasized?: boolean;
}) {
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
          <ThemedText type="small" style={styles.slotName}>
            {slot.medicationName} {slot.dose ? `— ${slot.dose}` : ''}
          </ThemedText>
          {slot.status === 'pending' ? (
            <View style={styles.actions}>
              <ActionButton
                label="Skip"
                onPress={() => onAction(slot, 'skipped')}
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
        <ActivityIndicator size="small" color={variant === 'secondary' ? Brand.textMuted : '#ffffff'} />
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { fontSize: 28, lineHeight: 34 },
  adherenceChip: {
    borderRadius: 999,
    backgroundColor: Brand.bg,
    borderWidth: 1,
    borderColor: Brand.border,
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
  slotName: { flex: 1 },
  statusLabel: { textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: Spacing.two },
  actionButton: {
    backgroundColor: Brand.deepBlue,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    minWidth: 64,
    alignItems: 'center',
  },
  actionButtonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Brand.border },
  actionButtonDisabled: { opacity: 0.6 },
  actionText: { color: '#ffffff', fontWeight: '600' },
  actionTextSecondary: { fontWeight: '600' },
});
