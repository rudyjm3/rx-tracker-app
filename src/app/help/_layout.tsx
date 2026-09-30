import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/supabase/AuthProvider';

export default function HelpStackLayout() {
  const { session } = useAuth();

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Help & FAQ', headerBackTitle: 'Settings' }} />
    </Stack>
  );
}
