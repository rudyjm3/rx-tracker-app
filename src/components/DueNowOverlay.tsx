import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Animated, BackHandler, Easing, Modal, Pressable, ScrollView, View } from 'react-native';

import { DoseFormIcon } from '@/components/dashboard/dose-form-icon';
import { Button } from '@/components/ui/button';
import { MedTypeBadge } from '@/components/ui/med-type-badge';
import { SafeArea } from '@/components/ui/safe-area';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
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
  const rep = isGroup ? members[0] : event.slot;

  // Full-screen navy "Dose due now" overlay, DESIGN.md 10.1: pulsing ring
  // around the dose-form icon, eyebrow, title, then Take Now -> Snooze ->
  // Skip (-> Manage Each for groups).
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View accessibilityViewIsModal accessibilityLabel="Dose due now" className="flex-1 bg-brand-dark-navy/90">
        <SafeArea className="flex-1">
          <ScrollView contentContainerClassName="grow items-center justify-center px-6 py-8" showsVerticalScrollIndicator={false}>
            <View className="w-full max-w-md items-center gap-6">
              <View className="h-24 w-24 items-center justify-center">
                <PulseRing />
                {rep ? <DoseFormIcon doseForm={rep.medication.dose_form} size={64} /> : null}
              </View>

              <View className="flex-row items-center gap-1.5">
                <Ionicons name="notifications-outline" size={13} color="rgba(255,255,255,0.7)" />
                <Text className="text-xs font-semibold uppercase tracking-[2px] text-white/70 dark:text-white/70">Dose due now</Text>
              </View>

              <View className="items-center gap-2">
                {isGroup ? (
                  <>
                    <Text className="text-center text-2xl font-bold text-white dark:text-white">{event.groupName}</Text>
                    <Text className="text-sm text-white/75 dark:text-white/75">{members.length} medications in group</Text>
                  </>
                ) : (
                  <>
                    <Text className="text-center text-2xl font-bold text-white dark:text-white">{event.slot.medicationName}</Text>
                    <View className="flex-row items-center gap-2">
                      {event.slot.dose ? <DosePill dose={event.slot.dose} /> : null}
                      <MedTypeBadge type={event.slot.medication.medication_type} onDark />
                    </View>
                  </>
                )}
              </View>

              {error ? <Text className="text-center text-sm font-semibold text-red-300 dark:text-red-300">{error}</Text> : null}

              {manageEach && isGroup ? (
                <View className="w-full gap-3 rounded-card bg-white/10 p-3">
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
                    <View className="flex-row flex-wrap items-center justify-center gap-3">
                      <Button label="Take Now" onDark className="min-w-36" loading={disabled} onPress={onTakeAll} />
                      <Button label="Snooze" variant="ghost" onDark disabled={disabled} onPress={() => setSnoozeTarget('all')} />
                      <Button label="Skip" variant="secondary" onDark loading={disabled} onPress={onSkipAll} />
                      {isGroup && pendingMembers.length > 0 ? (
                        <Button label="Manage Each" variant="ghost" onDark disabled={disabled} onPress={() => setManageEach(true)} />
                      ) : null}
                    </View>
                  )}
                </>
              )}
            </View>
          </ScrollView>
        </SafeArea>
      </View>
    </Modal>
  );
}

// Pinging white/20 ring plus a pulsing white/10 ring behind the icon (the
// web alarm's animate-ping / animate-pulse, DESIGN.md 14).
function PulseRing() {
  const [ping] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const pingLoop = Animated.loop(
      Animated.timing(ping, { toValue: 1, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    pingLoop.start();
    pulseLoop.start();
    return () => {
      pingLoop.stop();
      pulseLoop.stop();
    };
  }, [ping, pulse]);

  return (
    <>
      <Animated.View
        pointerEvents="none"
        className="absolute h-24 w-24 rounded-full bg-white/20"
        style={{
          opacity: ping.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
          transform: [{ scale: ping.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.3] }) }],
        }}
      />
      <Animated.View
        pointerEvents="none"
        className="absolute h-24 w-24 rounded-full bg-white/10"
        style={{ opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }}
      />
    </>
  );
}

// Dose pill on dark surfaces (DESIGN.md 3): cyan-tinted, white 12 px extrabold.
function DosePill({ dose }: { dose: string }) {
  return (
    <View className="rounded-full border border-cyan-300/40 bg-cyan-500/25 px-3 py-1">
      <Text className="text-xs font-extrabold text-white dark:text-white">{dose}</Text>
    </View>
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
  return (
    <View className="gap-2 border-t border-white/15 pt-2 first:border-t-0 first:pt-0">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold text-white dark:text-white">
            {slot.medicationName}
            {slot.dose ? <Text className="text-sm font-bold text-white/75 dark:text-white/75">{` ${slot.dose}`}</Text> : null}
          </Text>
          <View className="flex-row items-center gap-2">
            <MedTypeBadge type={slot.medication.medication_type} onDark />
            {slot.status === 'pending' && slot.postponedUntil ? (
              <Text className="text-xs text-white/70 dark:text-white/70">{`Snoozed until ${formatClockTime(slot.postponedUntil)}`}</Text>
            ) : null}
          </View>
        </View>
        {slot.status !== 'pending' ? (
          <Text className="text-sm capitalize text-white/70 dark:text-white/70">{slot.status}</Text>
        ) : null}
      </View>
      {slot.status === 'pending' ? (
        <View className="flex-row gap-2">
          <Button label="Take" size="compact" onDark disabled={disabled} onPress={onTake} />
          <Button label="Snooze" size="compact" variant="ghost" onDark disabled={disabled} onPress={onSnoozeStart} />
          <Button label="Skip" size="compact" variant="secondary" onDark disabled={disabled} onPress={onSkip} />
        </View>
      ) : null}
      {snoozing ? (
        <SnoozeChipRow defaultMinutes={defaultSnoozeMinutes} disabled={disabled} onSelect={onSnoozeSelect} onCancel={onSnoozeCancel} />
      ) : null}
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
  return (
    <View className="items-center gap-3">
      <View className="flex-row flex-wrap justify-center gap-2">
        {SNOOZE_OPTIONS.map((minutes) => (
          <Pressable
            key={minutes}
            accessibilityRole="button"
            className={cn(
              'min-h-11 justify-center rounded-full border px-4 active:bg-white/20',
              minutes === defaultMinutes ? 'border-white bg-white/25' : 'border-white/30 bg-white/10',
              disabled && 'opacity-50',
            )}
            onPress={() => onSelect(minutes)}
            disabled={disabled}>
            <Text className={cn('text-sm text-white dark:text-white', minutes === defaultMinutes && 'font-bold')}>{minutes} min</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={onCancel} disabled={disabled} hitSlop={8} className="min-h-11 justify-center">
        <Text className="text-sm text-white/70 dark:text-white/70">Cancel</Text>
      </Pressable>
    </View>
  );
}
