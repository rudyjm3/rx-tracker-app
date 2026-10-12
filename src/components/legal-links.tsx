import { router } from 'expo-router';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

// "Terms of Use · Privacy Policy" footer for the sign-in / sign-up screens.
// The pages are public, so this works signed out.
export function LegalLinks() {
  return (
    <View className="mt-4 flex-row items-center justify-center gap-2 self-center">
      <Text muted accessibilityRole="link" className="py-2 text-xs" onPress={() => router.push('/terms')}>
        Terms of Use
      </Text>
      <Text muted className="text-xs">
        {'·'}
      </Text>
      <Text muted accessibilityRole="link" className="py-2 text-xs" onPress={() => router.push('/privacy')}>
        Privacy Policy
      </Text>
    </View>
  );
}
