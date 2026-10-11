import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { Redirect, Tabs, usePathname } from 'expo-router';
import { useState } from 'react';
import type { ColorValue } from 'react-native';

import { MoreSheet } from '@/components/more-sheet';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Bottom nav matches the original build's mobile layout: Dashboard,
// Medications, Calendar, Export, More. Settings, Pain Tracking and Mood &
// Wellbeing (plus Help, Terms and Privacy) live behind More; the Settings and
// Pain & Mood screens stay in this group as hidden tabs so the bar remains
// visible on them.
const MORE_ROUTES = ['/settings', '/pain-mood'];

function icon(name: React.ComponentProps<typeof FontAwesome6>['name']) {
  function TabIcon({ color }: { color: ColorValue }) {
    return <FontAwesome6 name={name} size={22} color={color} solid />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const { session } = useAuth();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? Colors.dark : Colors.light;
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.accent,
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarStyle: { backgroundColor: theme.backgroundElement, borderTopColor: theme.border },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: icon('house') }} />
        <Tabs.Screen name="medications" options={{ title: 'Medications', tabBarIcon: icon('pills') }} />
        <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: icon('calendar') }} />
        <Tabs.Screen name="export" options={{ title: 'Export', tabBarIcon: icon('file-export') }} />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: icon('ellipsis'),
            // Highlight More while one of its destinations is showing.
            tabBarInactiveTintColor: MORE_ROUTES.includes(pathname) ? theme.accent : theme.textSecondary,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setMoreOpen(true);
            },
          }}
        />
        <Tabs.Screen name="pain-mood" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
    </>
  );
}
