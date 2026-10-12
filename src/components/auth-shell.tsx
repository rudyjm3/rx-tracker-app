import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { SafeArea } from '@/components/ui/safe-area';
import { Text } from '@/components/ui/text';

// Shared frame for the sign-in / sign-up screens (DESIGN.md 8.1 / 8.2, small
// screens): page-background column with the logo and wordmark above a
// centered card (max 420, radius 18, shadow-card, padding 28).
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1 bg-brand-bg dark:bg-night-bg">
      <SafeArea className="flex-1">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="grow justify-center px-4 py-8">
            <View className="mb-6 items-center gap-2">
              <Image
                source={require('../../assets/images/icon.png')}
                style={{ width: 58, height: 58, borderRadius: 16 }}
                contentFit="cover"
              />
              <Text className="text-xl font-extrabold text-brand-navy dark:text-white">RxTracker</Text>
            </View>
            <View className="w-full max-w-[420px] self-center rounded-card border border-brand-border bg-brand-card p-7 shadow-card dark:border-night-border dark:bg-night-card">
              {children}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeArea>
    </View>
  );
}
