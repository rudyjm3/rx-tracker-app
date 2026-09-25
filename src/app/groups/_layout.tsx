import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/supabase/AuthProvider';

export default function GroupsStackLayout() {
  const { session } = useAuth();

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Medication Groups', headerBackTitle: 'Medications' }} />
      <Stack.Screen name="new" options={{ title: 'New Group', headerBackTitle: 'Groups', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit Group', headerBackTitle: 'Groups', presentation: 'modal' }} />
    </Stack>
  );
}
