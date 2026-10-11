import { View } from 'react-native';

import { Text } from '@/components/ui/text';

// Colored circle with the first initial (DESIGN.md 5, Avatar). Photos aren't
// supported in the app yet, same as family member photos.
export function ProfileAvatar({
  label,
  color,
  size = 40,
}: {
  label: string;
  color?: string | null;
  size?: number;
}) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      accessibilityElementsHidden
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: color ?? '#6366F1' }}
    >
      <Text className="font-semibold text-white dark:text-white" style={{ fontSize: Math.round(size * 0.4) }}>
        {initial}
      </Text>
    </View>
  );
}
