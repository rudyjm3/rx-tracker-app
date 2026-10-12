import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';

// The "More" tab's bottom sheet, matching the original build's mobile nav:
// Settings, Pain Tracking, Mood & Wellbeing, Help, Terms of Use, Privacy Policy.
// Terms / Privacy open the in-app public pages (/terms, /privacy).
type Item = { label: string; icon: React.ComponentProps<typeof FontAwesome6>['name']; onPress: () => void };

export function MoreSheet({ onClose }: { onClose: () => void }) {
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const items: Item[] = [
    { label: 'Settings', icon: 'gear', onPress: go(() => router.push('/settings')) },
    { label: 'Pain Tracking', icon: 'chart-line', onPress: go(() => router.push('/pain-mood?metric=pain')) },
    { label: 'Mood & Wellbeing', icon: 'face-smile', onPress: go(() => router.push('/pain-mood?metric=mood')) },
    { label: 'Help', icon: 'circle-question', onPress: go(() => router.push('/help')) },
    { label: 'Terms of Use', icon: 'file-lines', onPress: go(() => router.push('/terms')) },
    { label: 'Privacy Policy', icon: 'shield-halved', onPress: go(() => router.push('/privacy')) },
  ];

  return (
    <Sheet onClose={onClose}>
      <View>
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            onPress={item.onPress}
            className="min-h-16 flex-row items-center gap-5 rounded-control px-1 active:bg-brand-bg dark:active:bg-night-selected"
          >
            <View className="w-7 items-center">
              <FontAwesome6 name={item.icon} size={22} color="#0A8AC8" solid />
            </View>
            <Text className="text-lg font-medium">{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
