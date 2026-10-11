import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Bottom sheet (DESIGN.md 17.3): tap the backdrop or Android back to close;
// pass `dismissible={false}` while a request is in flight to block both.
export function Sheet({
  onClose,
  dismissible = true,
  children,
}: {
  onClose: () => void;
  dismissible?: boolean;
  children: ReactNode;
}) {
  const close = dismissible ? onClose : undefined;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={close}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={close}>
        <Pressable className="max-h-[85%]" onPress={(e) => e.stopPropagation()}>
          <View className="rounded-t-hero bg-brand-card p-6 dark:bg-night-card">
            <SafeAreaView edges={['bottom']}>{children}</SafeAreaView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
