import { Image } from 'expo-image';
import { View } from 'react-native';

// Illustrated dose-form graphics shared with the web app (DESIGN.md 5).
const IMAGES = {
  tablet: require('../../../assets/images/dose-forms/med-pill.png'),
  capsule: require('../../../assets/images/dose-forms/med-capsule.png'),
  liquid: require('../../../assets/images/dose-forms/med-bottle.png'),
  inhaler: require('../../../assets/images/dose-forms/med-inhaler.png'),
  injection: require('../../../assets/images/dose-forms/med-injection.png'),
  patch: require('../../../assets/images/dose-forms/med-patch.png'),
  drops: require('../../../assets/images/dose-forms/med-drop.png'),
} as const;

export function DoseFormIcon({ doseForm, size = 72 }: { doseForm: string | null | undefined; size?: number }) {
  const source = IMAGES[(doseForm ?? '') as keyof typeof IMAGES] ?? IMAGES.tablet;
  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full border-[3px] border-white/30 bg-white/10"
      style={{ width: size, height: size }}
    >
      <Image source={source} style={{ width: size, height: size }} contentFit="cover" accessibilityElementsHidden />
    </View>
  );
}
