import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile-avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MedName } from '@/components/ui/med-name';
import { Screen } from '@/components/ui/screen';
import { PanelTitle } from '@/components/ui/screen-title';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useActiveProfile } from '@/lib/active-profile';
import { getProfileAllergies } from '@/lib/allergies';
import { getActiveMedications } from '@/lib/medications';
import { useAuth } from '@/lib/supabase/AuthProvider';
import type { Medication } from '@/lib/types/medications';
import type { UserProfile } from '@/lib/types/profile';
import { getUserProfile } from '@/lib/user-profile';
import { formatMemberSince, isoToUsDate } from '@/lib/utils';

export default function MyProfileScreen() {
  const { session } = useAuth();
  const { setActiveProfileId } = useActiveProfile();
  const user = session?.user;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [allergyCount, setAllergyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [medsOpen, setMedsOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoadError(null);
        try {
          // A null profile is the normal state before a first save.
          const [p, m, a] = await Promise.all([getUserProfile(), getActiveMedications(null), getProfileAllergies(null)]);
          if (cancelled) return;
          setProfile(p);
          setMeds(m);
          setAllergyCount(a.filter((x) => x.is_active).length);
        } catch (e) {
          if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load your profile');
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (loading) {
    return (
      <Screen edges={['left', 'right', 'bottom']} scroll={false} contentClassName="items-center justify-center">
        <ActivityIndicator />
      </Screen>
    );
  }

  const email = user?.email ?? '';
  const name =
    profile?.display_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    email;
  const googleConnected = !!user?.identities?.some((i) => i.provider === 'google');

  // Google linking from the app isn't wired up yet (the web app handles it).
  function googleUnavailable() {
    Alert.alert('Not available yet', 'Connecting or disconnecting Google from the app is coming soon. You can manage it from the web app.');
  }

  return (
    <Screen edges={['left', 'right', 'bottom']} contentClassName="pt-4">
      {loadError ? <Text className="text-sm text-status-danger dark:text-status-danger">{loadError}</Text> : null}

      <Card flat className="gap-4 p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Ionicons name="person-outline" size={20} color="#102B57" />
            <PanelTitle>Profile Information</PanelTitle>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            hitSlop={10}
            className="h-11 w-11 items-center justify-center"
            onPress={() => router.push('/profile/edit')}>
            <Ionicons name="settings-sharp" size={22} color="#0754A8" />
          </Pressable>
        </View>

        <View className="items-center gap-2">
          <ProfileAvatar label={name || '?'} pictureUrl={profile?.profile_picture} size={96} />
          <Text className="text-xl font-bold text-brand-blue dark:text-brand-cyan">{name}</Text>
        </View>

        <View className="gap-2">
          <InfoRow label="Display name" value={profile?.display_name || name} />
          <InfoRow label="Email" value={email} />
          {user?.created_at ? <InfoRow label="Member since" value={formatMemberSince(user.created_at)} /> : null}
          {profile?.birth_date ? <InfoRow label="Birth date" value={isoToUsDate(profile.birth_date)} /> : null}
          {profile?.height_value != null ? (
            <InfoRow label="Height" value={`${profile.height_value} ${profile.height_unit ?? ''}`.trim()} />
          ) : null}
          {profile?.weight_value != null ? (
            <InfoRow label="Weight" value={`${profile.weight_value} ${profile.weight_unit ?? ''}`.trim()} />
          ) : null}
        </View>
      </Card>

      <NavCard
        icon="medkit-outline"
        title="Medications and Supplements"
        detail={`${meds.length} active ${meds.length === 1 ? 'med' : 'meds'}`}
        onPress={() => setMedsOpen(true)}
      />
      <NavCard
        icon="alert-circle-outline"
        title="Allergies & Intolerances"
        detail={`${allergyCount} ${allergyCount === 1 ? 'allergy' : 'allergies'}`}
        onPress={() => router.push('/profile/allergies')}
      />

      <Card flat className="gap-3 p-4">
        <View className="flex-row items-center gap-2">
          <Ionicons name="logo-google" size={20} color="#102B57" />
          <PanelTitle>Connected Accounts</PanelTitle>
        </View>
        <Text className="text-lg font-bold text-brand-navy dark:text-white">Google</Text>
        {googleConnected ? (
          <Text className="text-base font-bold text-status-success dark:text-status-success">Connected ✓</Text>
        ) : (
          <Text muted className="text-base">
            Not connected
          </Text>
        )}
        <Button
          label={googleConnected ? 'Disconnect' : 'Connect'}
          variant="secondary"
          className="self-start"
          onPress={googleUnavailable}
        />
      </Card>

      {medsOpen ? (
        <ActiveMedsSheet
          meds={meds}
          onClose={() => setMedsOpen(false)}
          // The sheet lists the account owner's meds, so the medications tab
          // it opens must be scoped to the owner, not a selected family member.
          onViewAll={() => {
            setActiveProfileId(null);
            setMedsOpen(false);
            router.push('/medications');
          }}
        />
      ) : null}
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-3">
      <Text className="w-28 text-sm font-semibold text-brand-text-muted dark:text-night-muted">{label}</Text>
      <Text className="flex-1 text-sm">{value || '—'}</Text>
    </View>
  );
}

function NavCard({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
}): ReactNode {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${detail}`} onPress={onPress}>
      <Card flat className="flex-row items-center gap-3 p-4">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-bg dark:bg-night-selected">
          <Ionicons name={icon} size={20} color="#0754A8" />
        </View>
        <Text className="flex-1 text-base">
          <Text className="font-bold text-brand-navy dark:text-white">{title}</Text>
          <Text muted>{`  ${detail}`}</Text>
        </Text>
        <Ionicons name="chevron-forward" size={18} color="#60708A" />
      </Card>
    </Pressable>
  );
}

function ActiveMedsSheet({ meds, onClose, onViewAll }: { meds: Medication[]; onClose: () => void; onViewAll: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <Text accessibilityRole="header" className="mb-3 text-lg font-bold text-brand-navy dark:text-white">
        Medications and Supplements
      </Text>
      {meds.length === 0 ? (
        <Text muted className="text-sm">
          No active medications.
        </Text>
      ) : (
        <ScrollView className="max-h-80">
          {meds.map((m) => (
            <View key={m.id} className="min-h-12 justify-center border-b border-brand-border py-2 dark:border-night-border">
              <MedName name={m.name} dose={m.dose} />
            </View>
          ))}
        </ScrollView>
      )}
      <View className="mt-4 flex-row gap-2">
        <Button label="Close" variant="ghost" className="flex-1" onPress={onClose} />
        <Button label="View all medications" className="flex-1" onPress={onViewAll} />
      </View>
    </Sheet>
  );
}
