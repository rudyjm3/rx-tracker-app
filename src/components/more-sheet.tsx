import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, View } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';

// The "More" tab's bottom sheet, matching the original build's mobile nav:
// Settings, Pain Tracking, Mood & Wellbeing, Help, Terms of Use, Privacy Policy.
// Terms / Privacy open external pages; set EXPO_PUBLIC_TERMS_URL and
// EXPO_PUBLIC_PRIVACY_URL (until then the rows say they aren't available).
type Item = { label: string; icon: React.ComponentProps<typeof FontAwesome6>['name']; onPress: () => void };

function openLegal(title: string, url: string | undefined) {
  if (!url) {
    Alert.alert(title, `The ${title} page isn't available in the app yet.`);
    return;
  }
  Linking.openURL(url).catch(() => Alert.alert(title, "Couldn't open the page."));
}

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
    { label: 'Terms of Use', icon: 'file-lines', onPress: go(() => openLegal('Terms of Use', process.env.EXPO_PUBLIC_TERMS_URL)) },
    { label: 'Privacy Policy', icon: 'shield-halved', onPress: go(() => openLegal('Privacy Policy', process.env.EXPO_PUBLIC_PRIVACY_URL)) },
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
