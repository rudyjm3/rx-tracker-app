import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, BackHandler, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SNOOZE_OPTIONS, type DaySlot, type NextDoseEvent } from '@/lib/schedule';
import { formatClockTime } from '@/lib/utils';

// A single global overlay whose visibility is driven entirely by whether
// there is a due-now event to show — no user-initiated dismissal exists.
// Every exit path (Take/Skip/Snooze) resolves the underlying dose(s), which
// makes the event itself disappear on the next reload/tick.
type SnoozeTarget = 'all' | DaySlot;

export interface DueNowOverlayProps {
  event: NextDoseEvent | null;
  groupMembers?: DaySlot[] | null;
  onTakeAll: () => void;
  onSkipAll: () => void;
  onSnoozeAll: (minutes: number) => void;
  onTakeOne: (slot: DaySlot) => void;
  onSkipOne: (slot: DaySlot) => void;
  onSnoozeOne: (slot: DaySlot, minutes: number) => void;
  defaultSnoozeMinutes: number | null;
  disabled: boolean;
  // Surfaced from the dashboard's own error state — since this modal blocks
  // all other UI while it's open, a failed Take/Skip/Snooze needs to show
  // its message here rather than in the (hidden-behind-the-overlay) screen.
  error?: string | null;
}

export function DueNowOverlay({
  event,
  groupMembers,
  onTakeAll,
  onSkipAll,
  onSnoozeAll,
  onTakeOne,
  onSkipOne,
  onSnoozeOne,
  defaultSnoozeMinutes,
  disabled,
  error,
}: DueNowOverlayProps) {
  const theme = useTheme();
  const styles = getStyles(theme);
  const [manageEach, setManageEach] = useState(false);
  const [snoozeTarget, setSnoozeTarget] = useState<SnoozeTarget | null>(null);

  // A new due-now event (a different group/time or a different single dose)
  // should start from the collapsed, non-"Manage Each" view rather than
  // carrying over whatever the previous event's overlay was left showing.
  // Reset during render (rather than in an effect) when the key changes,
  // per React's recommended "adjusting state when a prop changes" pattern.
  const eventKey = event ? (event.kind === 'group' ? `${event.groupId}|${event.time}` : `${event.slot.medicationId}|${event.slot.scheduledTime}|${event.time}`) : null;
  const [prevEventKey, setPrevEventKey] = useState(eventKey);
  if (eventKey !== prevEventKey) {
    setPrevEventKey(eventKey);
    setManageEach(false);
    setSnoozeTarget(null);
  }

  // Block the Android hardware back button entirely — this overlay must
  // only close via Take/Skip/Snooze, never a back-button escape.
  useEffect(() => {
    if (!event) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [event]);

  if (!event) return null;

  const isGroup = event.kind === 'group';
  const members = isGroup ? (groupMembers ?? event.members) : [event.slot];
  const pendingMembers = members.filter((m) => m.status === 'pending');

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ScrollView contentContainerStyle={styles.cardContent} showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <View style={styles.badge}>
                  <Ionicons name="medkit-outline" size={28} color="#ffffff" />
                </View>
                <View style={styles.headerText}>
                  <View style={styles.headerTitleRow}>
                    <Ionicons name="notifications-outline" size={16} color={Brand.deepBlue} />
                    <ThemedText type="smallBold" style={{ color: Brand.deepBlue }}>
                      Dose due now
                    </ThemedText>
                  </View>
                  {isGroup ? (
                    <>
                      <ThemedText type="subtitle" style={styles.titleText}>
                        {event.groupName}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {members.length} medications in group
                      </ThemedText>
                    </>
                  ) : (
                    <>
                      <ThemedText type="subtitle" style={styles.titleText}>
                        {event.slot.medicationName}
                      </ThemedText>
                      {event.slot.dose ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          {event.slot.dose}
                        </ThemedText>
                      ) : null}
                    </>
                  )}
                </View>
              </View>

              {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

              {manageEach && isGroup ? (
                <View style={styles.memberList}>
                  {members.map((slot) => (
                    <MemberRow
                      key={`${slot.medicationId}|${slot.scheduledTime}`}
                      slot={slot}
                      disabled={disabled}
                      snoozing={snoozeTarget !== 'all' && snoozeTarget?.medicationId === slot.medicationId && snoozeTarget?.scheduledTime === slot.scheduledTime}
                      defaultSnoozeMinutes={defaultSnoozeMinutes}
                      onTake={() => onTakeOne(slot)}
                      onSkip={() => onSkipOne(slot)}
                      onSnoozeStart={() => setSnoozeTarget(slot)}
                      onSnoozeSelect={(minutes) => {
                        onSnoozeOne(slot, minutes);
                        setSnoozeTarget(null);
                      }}
                      onSnoozeCancel={() => setSnoozeTarget(null)}
                    />
                  ))}
                </View>
              ) : (
                <>
                  {snoozeTarget === 'all' ? (
                    <SnoozeChipRow
                      defaultMinutes={defaultSnoozeMinutes}
                      disabled={disabled}
                      onSelect={(minutes) => {
                        onSnoozeAll(minutes);
                        setSnoozeTarget(null);
                      }}
                      onCancel={() => setSnoozeTarget(null)}
                    />
                  ) : (
                    <View style={styles.mainActions}>
                      <Pressable
                        style={[styles.actionButton, styles.secondaryButton, disabled && styles.actionButtonDisabled]}
                        onPress={onSkipAll}
                        disabled={disabled}
                      >
                        {disabled ? (
                          <ActivityIndicator size="small" color={theme.textSecondary} />
                        ) : (
                          <ThemedText style={styles.secondaryButtonText}>Skip</ThemedText>
                        )}
                      </Pressable>
                      <Pressable
                        style={[styles.actionButton, styles.secondaryButton, disabled && styles.actionButtonDisabled]}
                        onPress={() => setSnoozeTarget('all')}
                        disabled={disabled}
                      >
                        <ThemedText style={styles.secondaryButtonText}>Snooze</ThemedText>
                      </Pressable>
                      <Pressable
                        style={[styles.actionButton, styles.primaryButton, disabled && styles.actionButtonDisabled]}
                        onPress={onTakeAll}
                        disabled={disabled}
                      >
                        {disabled ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <ThemedText style={styles.primaryButtonText}>Take Now</ThemedText>
                        )}
                      </Pressable>
                    </View>
                  )}

                  {isGroup && pendingMembers.length > 0 && (
                    <Pressable style={styles.manageEachButton} onPress={() => setManageEach(true)} disabled={disabled}>
                      <ThemedText type="small" style={{ color: Brand.deepBlue, fontWeight: '600' }}>
                        Manage Each
                      </ThemedText>
                    </Pressable>
                  )}
                </>
              )}
            </ScrollView>
          </ThemedView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function MemberRow({
  slot,
  disabled,
  snoozing,
  defaultSnoozeMinutes,
  onTake,
  onSkip,
  onSnoozeStart,
  onSnoozeSelect,
  onSnoozeCancel,
}: {
  slot: DaySlot;
  disabled: boolean;
  snoozing: boolean;
  defaultSnoozeMinutes: number | null;
  onTake: () => void;
  onSkip: () => void;
  onSnoozeStart: () => void;
  onSnoozeSelect: (minutes: number) => void;
  onSnoozeCancel: () => void;
}) {
  const styles = getStyles(useTheme());
  return (
    <View style={styles.memberRow}>
      <View style={styles.memberRowTop}>
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
            <Pressable
              style={[styles.smallActionButton, styles.secondaryButton, disabled && styles.actionButtonDisabled]}
              onPress={onSkip}
              disabled={disabled}
            >
              <ThemedText type="small" style={styles.secondaryButtonText}>
                Skip
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.smallActionButton, styles.secondaryButton, disabled && styles.actionButtonDisabled]}
              onPress={onSnoozeStart}
              disabled={disabled}
            >
              <ThemedText type="small" style={styles.secondaryButtonText}>
                Snooze
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.smallActionButton, styles.primaryButton, disabled && styles.actionButtonDisabled]}
              onPress={onTake}
              disabled={disabled}
            >
              <ThemedText type="small" style={styles.primaryButtonText}>
                Take
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.statusLabel}>
            {slot.status}
          </ThemedText>
        )}
      </View>
      {snoozing && (
        <SnoozeChipRow
          defaultMinutes={defaultSnoozeMinutes}
          disabled={disabled}
          onSelect={onSnoozeSelect}
          onCancel={onSnoozeCancel}
        />
      )}
    </View>
  );
}

function SnoozeChipRow({
  defaultMinutes,
  disabled,
  onSelect,
  onCancel,
}: {
  defaultMinutes: number | null;
  disabled: boolean;
  onSelect: (minutes: number) => void;
  onCancel: () => void;
}) {
  const styles = getStyles(useTheme());
  return (
    <View style={styles.snoozePicker}>
      <View style={styles.chipRow}>
        {SNOOZE_OPTIONS.map((minutes) => (
          <Pressable
            key={minutes}
            style={[styles.chip, minutes === defaultMinutes && styles.chipSelected]}
            onPress={() => onSelect(minutes)}
            disabled={disabled}
          >
            <ThemedText type="small" style={minutes === defaultMinutes ? styles.chipTextSelected : undefined}>
              {minutes} min
            </ThemedText>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={onCancel} disabled={disabled} hitSlop={8}>
        <ThemedText type="small" themeColor="textSecondary">
          Cancel
        </ThemedText>
      </Pressable>
    </View>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7,29,61,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: { width: '100%', maxHeight: '100%', alignItems: 'center', paddingHorizontal: Spacing.four },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    borderRadius: BorderRadius.md,
  },
  cardContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  errorText: { color: Brand.danger },
  header: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Brand.deepBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: Spacing.half },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  titleText: { fontSize: 22, lineHeight: 28 },
  mainActions: { flexDirection: 'row', gap: Spacing.two },
  actionButton: {
    flex: 1,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  smallActionButton: {
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    minWidth: 56,
  },
  primaryButton: { backgroundColor: Brand.deepBlue },
  primaryButtonText: { color: '#ffffff', fontWeight: '700' },
  secondaryButton: { borderWidth: 1, borderColor: theme.border },
  secondaryButtonText: { fontWeight: '600' },
  actionButtonDisabled: { opacity: 0.6 },
  manageEachButton: { alignSelf: 'center', marginTop: Spacing.one, padding: Spacing.one },
  memberList: { gap: Spacing.three },
  memberRow: { gap: Spacing.two, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: Spacing.two },
  memberRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  slotNameColumn: { flex: 1, gap: Spacing.half },
  slotName: { flex: 1 },
  statusLabel: { textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: Spacing.one },
  snoozePicker: { gap: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  chipSelected: { borderColor: Brand.deepBlue, backgroundColor: theme.backgroundSelected },
  chipTextSelected: { fontWeight: '700', color: Brand.deepBlue },
});
}
