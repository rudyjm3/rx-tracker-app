import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { MedTypeBadge } from '@/components/ui/med-type-badge';
import { Text } from '@/components/ui/text';
import type { AdherenceStats } from '@/lib/adherence';
import type { DaySlot, NextDoseEvent } from '@/lib/schedule';
import { formatEpochTime } from '@/lib/utils';

import { AdherenceCard } from './adherence-card';
import { DoseFormIcon } from './dose-form-icon';

// Dashboard hero (DESIGN.md 8.4): brand-hero gradient panel holding a glass
// "Next dose" card — time, medication (name, dose pill, type badge) or group
// (with a view/hide toggle for its members), and the following dose under
// "Upcoming" — followed by the "Today's adherence" glass card. Display only:
// Take / Snooze / Skip live in Today's schedule.

const HERO_GRADIENT = ['#18D0DC', '#0A8AC8', '#0754A8', '#071D3D'] as const;
const WHITE = 'text-white dark:text-white';

function DosePill({ dose }: { dose: string }) {
  if (!dose) return null;
  return (
    <View className="self-center rounded-full border border-cyan-300/40 bg-cyan-500/25 px-3 py-1">
      <Text className={`text-xs font-extrabold ${WHITE}`}>{dose}</Text>
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
}: {
  next: NextDoseEvent | null;
  upcoming: NextDoseEvent | null;
  adherence: AdherenceStats;
}) {
  const [expanded, setExpanded] = useState(false);
  const rep = next ? representativeSlot(next) : null;

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
            <Text className={`mt-6 text-2xl font-bold ${WHITE}`}>All scheduled doses complete for today.</Text>
          ) : (
            <View className="mt-3 flex-row items-start justify-between gap-4">
              <View className="flex-1 gap-1">
                <Text className={`text-4xl font-extrabold ${WHITE}`}>{formatEpochTime(next.time)}</Text>
                {next.kind === 'single' ? (
                  <View className="mt-1 flex-row flex-wrap items-center gap-2">
                    <Text className={`text-2xl font-extrabold ${WHITE}`}>{next.slot.medicationName}</Text>
                    <DosePill dose={next.slot.dose} />
                    <MedTypeBadge type={next.slot.medication.medication_type} onDark />
                  </View>
                ) : (
                  <>
                    <Text className={`mt-1 text-2xl font-extrabold ${WHITE}`}>{next.groupName}</Text>
                    <Text className="text-base font-bold text-white/80 dark:text-white/80">
                      {next.members.length} medications in group
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      onPress={() => setExpanded((e) => !e)}
                      className="mt-3 min-h-12 items-center justify-center rounded-control border border-white/25 bg-white/15 active:bg-white/20"
                    >
                      <Text className={`text-sm font-extrabold underline ${WHITE}`}>
                        {expanded ? 'view less' : 'view more'}
                      </Text>
                    </Pressable>
                    {expanded && (
                      <View className="mt-3 gap-3">
                        {next.members.map((m) => (
                          <View key={`${m.medicationId}|${m.scheduledTime}`} className="flex-row flex-wrap items-center gap-2">
                            <Text className="text-base font-medium text-white/95 dark:text-white/95">
                              {m.medicationName}
                              {m.dose ? <Text className="text-sm font-bold text-white/75 dark:text-white/75">{` ${m.dose}`}</Text> : null}
                            </Text>
                            <MedTypeBadge type={m.medication.medication_type} onDark />
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
              <DoseFormIcon doseForm={rep.medication.dose_form} size={72} />
            </View>
          )}

          {upcoming && (
            <View className="mt-6 gap-2 border-t border-white/20 pt-4">
              <Eyebrow>Upcoming</Eyebrow>
              <View className="flex-row flex-wrap items-center gap-x-2">
                <Text className="text-base font-extrabold text-white/95 dark:text-white/95">{formatEpochTime(upcoming.time)}</Text>
                <Text className="text-base font-extrabold text-white/95 dark:text-white/95">
                  {upcoming.kind === 'single' ? upcoming.slot.medicationName : upcoming.groupName}
                  {upcoming.kind === 'single' && upcoming.slot.dose ? (
                    <Text className="text-sm font-bold text-white/75 dark:text-white/75">{` ${upcoming.slot.dose}`}</Text>
                  ) : null}
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
