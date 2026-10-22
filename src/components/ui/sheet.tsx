import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Bottom sheet (DESIGN.md 17.3): tap the backdrop or Android back to close;
// pass `dismissible={false}` while a request is in flight to block both.
export function Sheet({
  onClose,
  dismissible = true,
  handle = false,
  children,
}: {
  onClose: () => void;
  dismissible?: boolean;
  // Draws a drag-handle grabber at the top of the sheet.
  handle?: boolean;
  children: ReactNode;
}) {
  const close = dismissible ? onClose : undefined;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={close}>
      {/* The backdrop is a sibling, not a wrapping Pressable: a Pressable
          around the content competes with inner ScrollViews for the touch
          responder, making scrolling need several attempts. */}
      <View className="flex-1 justify-end bg-black/40">
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={close} />
        <View className="max-h-[85%]">
          <View className="rounded-t-hero bg-brand-card p-6 dark:bg-night-card">
            {handle ? <View className="mb-3 -mt-3 h-1.5 w-10 self-center rounded-full bg-brand-border dark:bg-night-border" /> : null}
            <SafeAreaView edges={['bottom']}>{children}</SafeAreaView>
          </View>
        </View>
      </View>
    </Modal>
  );
}
