import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

// Circle showing the profile photo when there is one, otherwise a colored
// circle with the first initial (DESIGN.md 5, Avatar). A photo that fails to
// load falls back to the initial.
export function ProfileAvatar({
  label,
  color,
  pictureUrl,
  size = 40,
}: {
  label: string;
  color?: string | null;
  pictureUrl?: string | null;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initial = label.trim().charAt(0).toUpperCase() || '?';

  if (pictureUrl && pictureUrl !== failedUrl) {
    return (
      <Image
        accessibilityElementsHidden
        source={{ uri: pictureUrl }}
        contentFit="cover"
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setFailedUrl(pictureUrl)}
      />
    );
  }

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
