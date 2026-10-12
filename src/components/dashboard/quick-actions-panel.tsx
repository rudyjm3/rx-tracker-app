import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { PanelTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

// Quick actions (DESIGN.md 8.4): four rows, each a 32 px round tinted icon, a
// 14 px medium label and a chevron. Pain / Mood open the log form on the
// Pain & Mood screen (the app has no separate Log-level dialog).
const ACTIONS: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; tint: string; href: Href }[] = [
  { label: 'Add medication', icon: 'add', tint: 'bg-brand-deep-blue', href: '/medications/new' },
  { label: 'Pain tracking', icon: 'pulse', tint: 'bg-status-warning', href: '/pain-mood?metric=pain' },
  { label: 'Mood & Wellbeing', icon: 'happy-outline', tint: 'bg-brand-cyan', href: '/pain-mood?metric=mood' },
  { label: 'Manage medications', icon: 'medkit-outline', tint: 'bg-brand-blue', href: '/medications' },
];

export function QuickActionsPanel() {
  return (
    <Card className="gap-1">
      <PanelTitle className="mb-1">Quick actions</PanelTitle>
      {ACTIONS.map((action, i) => (
        <Pressable
          key={action.label}
          accessibilityRole="link"
          className={cn(
            'min-h-12 flex-row items-center gap-3 py-2 active:opacity-80',
            i < ACTIONS.length - 1 && 'border-b border-brand-border dark:border-night-border',
          )}
          onPress={() => router.push(action.href)}>
          <View className={cn('h-8 w-8 items-center justify-center rounded-full', action.tint)}>
            <Ionicons name={action.icon} size={16} color="#FFFFFF" />
          </View>
          <Text className="flex-1 text-sm font-medium">{action.label}</Text>
          <Ionicons name="chevron-forward" size={16} color="#60708A" />
        </Pressable>
      ))}
    </Card>
  );
}
