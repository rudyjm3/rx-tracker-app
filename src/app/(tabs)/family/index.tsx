import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile-avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
import { useActiveProfile } from '@/lib/active-profile';
import type { FamilyProfile } from '@/lib/types/profile';

export default function FamilyListScreen() {
  const { familyProfiles, loading, refreshFamilyProfiles } = useActiveProfile();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshFamilyProfiles();
    }, [refreshFamilyProfiles]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshFamilyProfiles();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Screen
      contentClassName="pt-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <ScreenTitle>Manage Family</ScreenTitle>
        <Button label="Add Family Member" size="compact" onPress={() => router.push('/family/new')} />
      </View>

      <Text muted className="text-sm">
        Track medications for family members under one account.
      </Text>

      {loading && !refreshing ? (
        <ActivityIndicator className="mt-8" />
      ) : (
        <>
          {familyProfiles.length === 0 ? (
            <Text muted className="text-sm">
              No family members yet. Tap &ldquo;Add Family Member&rdquo; to add one.
            </Text>
          ) : null}
          {familyProfiles.map((profile) => (
            <FamilyMemberCard key={profile.id} profile={profile} />
          ))}
        </>
      )}
    </Screen>
  );
}

function FamilyMemberCard({ profile }: { profile: FamilyProfile }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/family/[id]', params: { id: profile.id } })}>
      <Card flat className="flex-row items-center gap-3">
        <ProfileAvatar label={profile.display_name} color={profile.avatar_color} pictureUrl={profile.profile_picture} size={40} />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-medium">{profile.display_name}</Text>
          {profile.relationship ? (
            <Text muted className="text-xs">
              {profile.relationship}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}
