import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile-avatar';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useActiveProfile } from '@/lib/active-profile';

// Avatar menu (DESIGN.md 7.1): My Profile, the account owner, Manage Family,
// family members, Sign out. Selecting a person switches the active profile.
const ROW = 'min-h-14 flex-row items-center gap-4 rounded-control px-1 active:bg-brand-bg dark:active:bg-night-selected';

export function ProfileMenuSheet({
  ownerName,
  ownerPictureUrl,
  onSignOut,
  onClose,
}: {
  ownerName: string;
  ownerPictureUrl: string | null;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const { activeProfileId, familyProfiles, setActiveProfileId } = useActiveProfile();
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Sheet onClose={onClose}>
      <ScrollView>
        <Pressable accessibilityRole="button" className={ROW} onPress={go(() => router.push('/profile'))}>
          <View className="w-9 items-center">
            <FontAwesome6 name="circle-user" size={22} color="#0A8AC8" solid />
          </View>
          <Text className="text-base font-medium">My Profile</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          className={`${ROW} ${activeProfileId === null ? 'bg-brand-bg dark:bg-night-selected' : ''}`}
          onPress={go(() => setActiveProfileId(null))}
        >
          <ProfileAvatar label={ownerName} pictureUrl={ownerPictureUrl} size={36} />
          <Text className="flex-1 text-base font-medium">{ownerName}</Text>
        </Pressable>

        <Pressable accessibilityRole="button" className={ROW} onPress={go(() => router.push('/family'))}>
          <View className="w-9 items-center">
            <FontAwesome6 name="users" size={20} color="#0A8AC8" solid />
          </View>
          <Text className="text-base font-medium">Manage Family</Text>
        </Pressable>

        {familyProfiles.length > 0 && (
          <>
            <Text muted className="px-1 pb-1 pt-3 text-xs font-semibold">
              Family members
            </Text>
            {familyProfiles.map((fp) => (
              <Pressable
                key={fp.id}
                accessibilityRole="button"
                className={`${ROW} ${activeProfileId === fp.id ? 'bg-brand-bg dark:bg-night-selected' : ''}`}
                onPress={go(() => setActiveProfileId(fp.id))}
              >
                <ProfileAvatar label={fp.display_name} color={fp.avatar_color} pictureUrl={fp.profile_picture} size={36} />
                <Text className="flex-1 text-base font-medium">{fp.display_name}</Text>
                {fp.relationship ? (
                  <Text muted className="text-xs">
                    {fp.relationship}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </>
        )}

        <View className="my-2 h-px bg-brand-border dark:bg-night-border" />
        <Pressable accessibilityRole="button" className={ROW} onPress={go(onSignOut)}>
          <View className="w-9 items-center">
            <FontAwesome6 name="right-from-bracket" size={20} color="#0A8AC8" solid />
          </View>
          <Text className="text-base font-medium">Sign out</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}
