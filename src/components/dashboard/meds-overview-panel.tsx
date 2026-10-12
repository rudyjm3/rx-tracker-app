import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { PanelTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

function StatRow({ label, value, valueClassName }: { label: string; value: number; valueClassName?: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-brand-border py-2 last:border-b-0 dark:border-night-border">
      <Text muted className="text-sm">
        {label}
      </Text>
      <Text className={cn('text-sm font-semibold', valueClassName)}>{value}</Text>
    </View>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" className="min-h-11 flex-row items-center gap-2" onPress={onPress}>
      <Ionicons name="list-outline" size={15} color="#0754A8" />
      <Text className="flex-1 text-sm text-brand-deep-blue dark:text-brand-cyan">{label}</Text>
      <Ionicons name="chevron-forward" size={15} color="#0754A8" />
    </Pressable>
  );
}

// Medications overview (DESIGN.md 8.4): stat rows plus links to the required
// and non-required dose lists and the full medications list.
export function MedsOverviewPanel({
  activeCount,
  todaysDosesCount,
  dosesTaken,
  dosesMissed,
  onViewRequiredDoses,
  onViewNonRequiredDoses,
}: {
  activeCount: number;
  todaysDosesCount: number;
  dosesTaken: number;
  dosesMissed: number;
  onViewRequiredDoses: () => void;
  onViewNonRequiredDoses: () => void;
}) {
  return (
    <Card>
      <View className="mb-1 flex-row items-center gap-2">
        <Ionicons name="clipboard-outline" size={16} color="#102B57" />
        <PanelTitle>Medications overview</PanelTitle>
      </View>
      <View>
        <StatRow label="Active medications" value={activeCount} />
        <StatRow label="Today's doses" value={todaysDosesCount} />
        <StatRow label="Doses taken" value={dosesTaken} valueClassName="text-status-success dark:text-status-success" />
        <StatRow label="Doses missed" value={dosesMissed} valueClassName="text-status-danger dark:text-status-danger" />
      </View>
      <View className="mt-2">
        <LinkRow label="View required dose list" onPress={onViewRequiredDoses} />
        <LinkRow label="View non required dose list" onPress={onViewNonRequiredDoses} />
      </View>
      <Pressable accessibilityRole="link" className="mt-1 min-h-11 items-center justify-center" onPress={() => router.push('/medications')}>
        <Text className="text-sm font-medium text-brand-deep-blue dark:text-brand-cyan">View all medications</Text>
      </Pressable>
    </Card>
  );
}
