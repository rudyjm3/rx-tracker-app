import { Stack } from 'expo-router';

export default function FamilyStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Manage Family' }} />
      <Stack.Screen name="new" options={{ title: 'Add Family Member', headerBackTitle: 'Family', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit Family Member', headerBackTitle: 'Family', presentation: 'modal' }} />
    </Stack>
  );
}
