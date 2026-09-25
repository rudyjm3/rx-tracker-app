import { Stack } from 'expo-router';

export default function MedicationsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Medications', headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Medication', headerBackTitle: 'Medications' }} />
    </Stack>
  );
}
