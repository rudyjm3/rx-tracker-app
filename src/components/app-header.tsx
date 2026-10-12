import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlertsSheet } from '@/components/alerts-sheet';
import { ProfileAvatar } from '@/components/profile-avatar';
import { ProfileMenuSheet } from '@/components/profile-menu-sheet';
import { ResumeSetupBanner } from '@/components/ResumeSetupBanner';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useLowSupplyAlerts } from '@/hooks/use-low-supply-alerts';
import { useTheme } from '@/hooks/use-theme';
import { useActiveProfile } from '@/lib/active-profile';
import { getActiveMedications } from '@/lib/medications';
import { useAuth } from '@/lib/supabase/AuthProvider';
import type { Medication } from '@/lib/types/medications';
import { getUserProfile } from '@/lib/user-profile';

// Global header for the tab screens, matching the original build's mobile
// layout (DESIGN.md 7.1): logo + "RxTracker" on the left; notification bell
// (supply alerts, with a count badge) and the profile avatar on the right;
// then the "Viewing {name}'s medications" banner while a family member is
// active and the resume-setup nudge. Medication detail screens have their own
// stack header, so this hides on /medications/<id> and /medications/new.
function ownerDisplayName(
  profile: { display_name: string | null; first_name: string | null; last_name: string | null } | null,
  email: string,
): string {
  const display = profile?.display_name?.trim();
  if (display) return display;
  const first = profile?.first_name?.trim() ?? '';
  const last = profile?.last_name?.trim() ?? '';
  if (first && last) return `${first} ${last.charAt(0).toUpperCase()}.`;
  return first || last || email;
}

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const { activeProfileId, activeProfile, setActiveProfileId } = useActiveProfile();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [ownerProfile, setOwnerProfile] = useState<Awaited<ReturnType<typeof getUserProfile>>>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { alerts, dismiss } = useLowSupplyAlerts(medications);

  // Re-read when the profile or the screen changes so the bell stays current.
  useEffect(() => {
    let cancelled = false;
    getActiveMedications(activeProfileId)
      .then((meds) => {
        if (!cancelled) setMedications(meds);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeProfileId, pathname]);

  useEffect(() => {
    let cancelled = false;
    getUserProfile()
      .then((profile) => {
        if (!cancelled) setOwnerProfile(profile);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  if (/^\/medications\/.+/.test(pathname)) return null;

  const email = session?.user.email ?? '';
  const ownerName = ownerDisplayName(ownerProfile, email);
  const currentLabel = activeProfile?.display_name ?? ownerName;

  return (
    <View className="bg-brand-bg dark:bg-night-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="RxTracker dashboard"
          className="flex-row items-center gap-3"
          onPress={() => router.navigate('/')}
        >
          <Image
            source={require('../../assets/images/icon.png')}
            style={{ width: 42, height: 42, borderRadius: 12 }}
            contentFit="cover"
          />
          <Text className="text-lg font-bold text-brand-navy dark:text-white">RxTracker</Text>
        </Pressable>

        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={alerts.length > 0 ? `Notifications (${alerts.length})` : 'Notifications'}
            className="h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-white dark:border-night-border dark:bg-night-card"
            onPress={() => setAlertsOpen(true)}
          >
            <Ionicons name="notifications-outline" size={20} color={theme.text} />
            {alerts.length > 0 && (
              <View className="absolute -right-1 -top-1 h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1">
                <Text className="text-[10px] font-bold leading-3 text-white dark:text-white">{alerts.length}</Text>
              </View>
            )}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="My profile" onPress={() => setMenuOpen(true)}>
            <ProfileAvatar
              label={currentLabel}
              color={activeProfile?.avatar_color}
              pictureUrl={activeProfile ? activeProfile.profile_picture : ownerProfile?.profile_picture}
              size={40}
            />
          </Pressable>
        </View>
      </View>

      {activeProfile && (
        <View className="flex-row items-center gap-2 border-b border-[#F3E2A9] bg-[#FFFAEB] px-4 py-2 dark:border-amber-900 dark:bg-amber-950">
          <ProfileAvatar
            label={activeProfile.display_name}
            color={activeProfile.avatar_color}
            pictureUrl={activeProfile.profile_picture}
            size={22}
          />
          <Text className="flex-1 text-sm text-[#7A3E0C] dark:text-amber-200">
            Viewing <Text className="text-sm font-semibold text-[#7A3E0C] dark:text-amber-100">{activeProfile.display_name}</Text>
            &apos;s medications
          </Text>
          <Button
            label="Switch back to Me"
            variant="secondary"
            size="compact"
            className="border-[#B7791F] bg-transparent dark:border-amber-600 dark:bg-transparent"
            labelClassName="text-[#7A3E0C] dark:text-amber-200"
            onPress={() => setActiveProfileId(null)}
          />
        </View>
      )}

      {pathname !== '/settings' && (
        <View className="px-4">
          <ResumeSetupBanner profileId={activeProfileId} profileName={activeProfile?.display_name ?? 'your'} />
        </View>
      )}

      {alertsOpen && (
        <AlertsSheet alerts={alerts} onDismiss={dismiss} onClose={() => setAlertsOpen(false)} />
      )}
      {menuOpen && <ProfileMenuSheet ownerName={ownerName} ownerPictureUrl={ownerProfile?.profile_picture ?? null} onSignOut={signOut} onClose={() => setMenuOpen(false)} />}
    </View>
  );
}
