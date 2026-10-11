import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { AdherenceStats } from '@/lib/adherence';

import { AdherenceRing } from './adherence-ring';

// "Today's adherence" glass card, DESIGN.md 8.4.
export function AdherenceCard({ stats }: { stats: AdherenceStats }) {
  const hasNonRequired = stats.nonRequired.total > 0;
  const line = 'text-base leading-8 text-white/90 dark:text-white/90';

  return (
    <View className="rounded-hero border border-white/20 bg-white/10 p-6">
      <View className="flex-row items-center gap-2">
        <Ionicons name="calendar-outline" size={15} color="rgba(255,255,255,0.7)" />
        <Text className="text-xs font-extrabold uppercase tracking-[2.5px] text-white/70 dark:text-white/70">
          Today&apos;s adherence
        </Text>
      </View>

      <View className="items-center py-4">
        <AdherenceRing percent={stats.percent} innerPercent={hasNonRequired ? stats.nonRequired.percent : undefined} />
      </View>

      <View className="items-center">
        <View>
          <Text className={line}>
            Required doses taken: {stats.requiredTaken} of {stats.requiredTotal}
          </Text>
          {hasNonRequired && (
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-2 rounded-full bg-[rgba(255,197,66,0.95)]" />
              <Text className={line}>
                Non required doses taken: {stats.nonRequired.taken} of {stats.nonRequired.total}
              </Text>
            </View>
          )}
          {stats.requiredTaken > 0 && (
            <Text className={line}>
              On time: {stats.onTime} · Late: {stats.late} · Skipped: {stats.skipped}
            </Text>
          )}
          <Text className={line}>Missed required doses today: {stats.missed}</Text>
        </View>
      </View>
    </View>
  );
}
