import { Stack } from 'expo-router';

export default function HistoryStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'History', headerBackTitle: 'Calendar' }} />
    </Stack>
  );
}
