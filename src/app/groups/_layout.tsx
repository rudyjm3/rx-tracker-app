import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { useAuth } from '@/lib/supabase/AuthProvider';

export default function GroupsStackLayout() {
  const { session } = useAuth();

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Medication Groups',
          // First screen of this root-level stack, so there's no automatic
          // back button — return to the Medication Plan explicitly.
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to Medication Plan"
              hitSlop={8}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/medications'))}>
              <Ionicons name="chevron-back" size={24} color="#0754A8" />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="new" options={{ title: 'New Group', headerBackTitle: 'Groups', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit Group', headerBackTitle: 'Groups', presentation: 'modal' }} />
    </Stack>
  );
}
