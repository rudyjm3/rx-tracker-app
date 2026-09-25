import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { recordDose, getTodayLogs, getTodayPostpones } from '@/lib/dose-logs';
import { getActiveMedications, getGroupMembers, getGroups } from '@/lib/medications';
import { buildDoseEvents, generateDaySlots, type DaySlot, type NextDoseEvent } from '@/lib/schedule';
import { localDateString, to12h } from '@/lib/utils';

export default function DashboardScreen() {
  const [events, setEvents] = useState<NextDoseEvent[]>([]);
  // The date these events were built for — kept alongside them rather than
  // recomputed from localDateString() at action time, so a Take/Skip tap
  // that happens to land right after local midnight still records against
  // the date the on-screen slot actually belongs to, not "today" as of the
  // tap.
  const [scheduleDate, setScheduleDate] = useState(localDateString());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const date = localDateString();
      const [medications, groups, groupMembers, doseLogs, postpones] = await Promise.all([
        getActiveMedications(null),
        getGroups(null),
        getGroupMembers(),
        getTodayLogs(date),
        getTodayPostpones(date),
      ]);
      const slots = generateDaySlots(date, medications, groups, groupMembers, doseLogs, postpones);
      setScheduleDate(date);
      setEvents(buildDoseEvents(slots, date));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load today’s schedule');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

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
          <ThemedText type="title" style={styles.title}>
            Today
          </ThemedText>

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

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
    <ThemedView style={styles.eventRow}>
      <ThemedText type={emphasized ? 'subtitle' : 'default'} style={emphasized ? styles.emphasizedTime : undefined}>
        {displayTime}
      </ThemedText>
      <ThemedText type={emphasized ? undefined : 'smallBold'}>{heading}</ThemedText>
      {slots.map((slot) => (
        <ThemedView key={`${slot.medicationId}|${slot.scheduledTime}`} style={styles.slotRow}>
          <ThemedText type="small" style={styles.slotName}>
            {slot.medicationName} {slot.dose ? `— ${slot.dose}` : ''}
          </ThemedText>
          {slot.status === 'pending' ? (
            <ThemedView style={styles.actions}>
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
            </ThemedView>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.statusLabel}>
              {slot.status}
            </ThemedText>
          )}
        </ThemedView>
      ))}
    </ThemedView>
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
  title: { fontSize: 28, lineHeight: 34 },
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
