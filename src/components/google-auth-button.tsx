import { useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { signInWithGoogle } from '@/lib/supabase/google-auth';

// "or" divider + full-width secondary "G Continue with Google" button,
// matching rx-tracker-web's sign-in / sign-up order (DESIGN.md 8.1/8.2;
// Google "G" glyph #4285F4). Errors go to the screen's own Callout via
// onError; a closed browser is not treated as an error.
export function GoogleAuthButton({
  label = 'Continue with Google',
  onError,
  disabled,
}: {
  label?: string;
  onError: (message: string | null) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function handlePress() {
    onError(null);
    setBusy(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) onError(error);
      // On success the (auth) layout's session check redirects to (tabs).
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't sign in with Google.");
    } finally {
      setBusy(false);
    }
  }

  const isDisabled = disabled || busy;

  return (
    <>
      <View className="my-5 flex-row items-center gap-2">
        <View className="h-px flex-1 bg-brand-border dark:bg-night-border" />
        <Text muted className="text-xs font-semibold">
          or
        </Text>
        <View className="h-px flex-1 bg-brand-border dark:bg-night-border" />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled, busy }}
        disabled={isDisabled}
        onPress={handlePress}
        className={cn(
          'min-h-[44px] w-full flex-row items-center justify-center gap-2 rounded-control border border-brand-border bg-white px-4 py-2.5 active:bg-brand-bg dark:border-night-border dark:bg-night-card dark:active:bg-night-selected',
          isDisabled && 'opacity-50',
        )}>
        {busy ? (
          <ActivityIndicator size="small" color="#4285F4" />
        ) : (
          <RNText accessibilityElementsHidden importantForAccessibility="no" style={{ color: '#4285F4', fontWeight: '700', fontSize: 15 }}>
            G
          </RNText>
        )}
        <Text className="text-sm font-semibold text-brand-navy dark:text-white">
          {busy ? 'Opening Google…' : label}
        </Text>
      </Pressable>
    </>
  );
}
