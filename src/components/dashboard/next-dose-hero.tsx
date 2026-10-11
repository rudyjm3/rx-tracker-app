import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { MedTypeBadge } from '@/components/ui/med-type-badge';
import { Text } from '@/components/ui/text';
import type { AdherenceStats } from '@/lib/adherence';
import type { DaySlot, NextDoseEvent } from '@/lib/schedule';
import { formatClockTime, formatEpochTime } from '@/lib/utils';

import { AdherenceCard } from './adherence-card';
import { DoseFormIcon } from './dose-form-icon';
import { SlotActions } from './slot-actions';

// Dashboard hero (DESIGN.md 8.4): brand-hero gradient panel holding a glass
// "Next dose" card — time, medication (+ dose pill) or group, the actions for
// each pending slot, and the following dose under "Upcoming" — followed by
// the "Today's adherence" glass card in the same gradient panel.

const HERO_GRADIENT = ['#18D0DC', '#0A8AC8', '#0754A8', '#071D3D'] as const;

function DosePill({ dose }: { dose: string }) {
  if (!dose) return null;
  return (
    <View className="self-center rounded-full border border-cyan-300/40 bg-cyan-500/25 px-3 py-1">
      <Text className="text-xs font-extrabold text-white dark:text-white">{dose}</Text>
    </View>
  );
}

function Eyebrow({ children }: { children: string }) {
  return (
    <Text className="text-xs font-extrabold uppercase tracking-[2.5px] text-white/75 dark:text-white/75">{children}</Text>
  );
}

// A group's pending representative drives the illustration, like the web hero.
function representativeSlot(event: NextDoseEvent): DaySlot {
  return event.kind === 'group'
    ? (event.members.find((m) => m.status === 'pending') ?? event.members[0])
    : event.slot;
}

export function NextDoseHero({
  next,
  upcoming,
  adherence,
  actingKey,
  onAction,
  onSnooze,
  onTakeAll,
  takeAllCount,
}: {
  next: NextDoseEvent | null;
  upcoming: NextDoseEvent | null;
  adherence: AdherenceStats;
  actingKey: string | null;
  onAction: (slot: DaySlot, status: 'taken' | 'skipped') => void;
  onSnooze: (slot: DaySlot) => void;
  onTakeAll: (event: NextDoseEvent) => void;
  takeAllCount: number;
}) {
  const rep = next ? representativeSlot(next) : null;
  const slots = next ? (next.kind === 'group' ? next.members : [next.slot]) : [];

  return (
    <LinearGradient
      colors={HERO_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 32,
        padding: 16,
        shadowColor: '#071D3D',
        shadowOpacity: 0.24,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 22 },
        elevation: 12,
      }}
    >
      <View className="gap-4">
        <View className="rounded-hero border border-white/20 bg-white/10 p-6">
          <View className="flex-row items-center gap-2">
            <Ionicons name="time-outline" size={15} color="rgba(255,255,255,0.75)" />
            <Eyebrow>Next dose</Eyebrow>
          </View>

          {!next || !rep ? (
            <Text className="mt-6 text-2xl font-bold text-white dark:text-white">All scheduled doses complete for today.</Text>
          ) : (
            <>
              <View className="mt-3 flex-row items-start justify-between gap-4">
                <View className="flex-1 gap-1">
                  <Text className="text-4xl font-extrabold text-white dark:text-white">{formatEpochTime(next.time)}</Text>
                  {next.kind === 'single' ? (
                    <View className="mt-1 flex-row flex-wrap items-center gap-2">
                      <Text className="text-2xl font-extrabold text-white dark:text-white">{next.slot.medicationName}</Text>
                      <DosePill dose={next.slot.dose} />
                      <MedTypeBadge type={next.slot.medication.medication_type} onDark />
                    </View>
                  ) : (
                    <>
                      <Text className="mt-1 text-2xl font-extrabold text-white dark:text-white">{next.groupName}</Text>
                      <Text className="text-base font-bold text-white/80 dark:text-white/80">
                        {next.members.length} medications in group
                      </Text>
                    </>
                  )}
                </View>
                <DoseFormIcon doseForm={rep.medication.dose_form} size={72} />
              </View>

              <View className="mt-4 gap-3">
                {next.kind === 'group' && takeAllCount > 0 && (
                  <Button label="Take All" size="compact" onDark className="self-start" onPress={() => onTakeAll(next)} loading={actingKey !== null} />
                )}
                {slots.map((slot) => (
                  <View key={`${slot.medicationId}|${slot.scheduledTime}`} className="gap-2">
                    {next.kind === 'group' && (
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-sm font-bold text-white dark:text-white">
                          {slot.medicationName}
                          {slot.dose ? ` — ${slot.dose}` : ''}
                        </Text>
                        <MedTypeBadge type={slot.medication.medication_type} onDark />
                      </View>
                    )}
                    {slot.status === 'pending' && slot.postponedUntil && (
                      <Text className="text-sm font-medium text-white/75 dark:text-white/75">
                        {`Snoozed until ${formatClockTime(slot.postponedUntil)}`}
                      </Text>
                    )}
                    {slot.status === 'pending' ? (
                      <SlotActions slot={slot} actingKey={actingKey} onAction={onAction} onSnooze={onSnooze} onDark />
                    ) : (
                      <Text className="text-sm font-medium capitalize text-white/75 dark:text-white/75">{slot.status}</Text>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}

          {upcoming && (
            <View className="mt-6 gap-2 border-t border-white/20 pt-4">
              <Eyebrow>Upcoming</Eyebrow>
              <View className="flex-row items-center gap-2">
                <Text className="text-base font-extrabold text-white/95 dark:text-white/95">{formatEpochTime(upcoming.time)}</Text>
                <Text className="flex-1 text-base font-extrabold text-white/95 dark:text-white/95" numberOfLines={1}>
                  {upcoming.kind === 'single' ? upcoming.slot.medicationName : upcoming.groupName}
                </Text>
              </View>
            </View>
          )}
        </View>
        <AdherenceCard stats={adherence} />
      </View>
    </LinearGradient>
  );
}
