import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { dismissFlash, useFlash } from '@/lib/flash';

const AUTO_DISMISS_MS = 4000;

// Transient confirmation pinned under the header; closes itself or via "x".
export function FlashMessage() {
  const message = useFlash();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismissFlash, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 top-0 z-50 px-4"
      style={{ paddingTop: insets.top + 8 }}
      accessibilityLiveRegion="polite">
      <View className="flex-row items-center gap-2 rounded-card border border-status-success/40 bg-status-success/10 px-4 py-3">
        <Ionicons name="checkmark-circle" size={20} color="#18BFA6" />
        <Text className="flex-1 text-sm text-brand-text dark:text-white">{message}</Text>
        <Pressable onPress={dismissFlash} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss message">
          <Text className="text-lg leading-5 text-brand-text dark:text-white">×</Text>
        </Pressable>
      </View>
    </View>
  );
}
