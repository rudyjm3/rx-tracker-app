import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/supabase/AuthProvider';

export default function ExportStackLayout() {
  const { session } = useAuth();

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Doctor Visit Report', headerBackTitle: 'Settings' }} />
    </Stack>
  );
}
