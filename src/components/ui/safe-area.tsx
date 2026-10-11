import type { ComponentType } from 'react';
import { cssInterop } from 'nativewind';
import { SafeAreaView, type SafeAreaViewProps } from 'react-native-safe-area-context';

// react-native-safe-area-context isn't NativeWind-aware out of the box; map
// className onto its style prop.
const Styled = cssInterop(SafeAreaView, { className: 'style' }) as unknown as ComponentType<
  SafeAreaViewProps & { className?: string }
>;

export function SafeArea(props: SafeAreaViewProps & { className?: string }) {
  return <Styled {...props} />;
}
