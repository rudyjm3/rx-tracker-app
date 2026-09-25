import { ScrollView, StyleSheet, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/active-profile';

// Horizontal chip row for switching between the account owner and family
// members. Only rendered by callers when familyProfiles.length > 0 — solo
// users (no family members added) see no UI change at all.
export function ProfileSwitcher() {
  const { activeProfileId, familyProfiles, setActiveProfileId } = useActiveProfile();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.container}
    >
      <Chip
        label="Me"
        initial={null}
        color={null}
        selected={activeProfileId === null}
        onPress={() => setActiveProfileId(null)}
      />
      {familyProfiles.map((profile) => (
        <Chip
          key={profile.id}
          label={profile.display_name}
          initial={profile.display_name.charAt(0).toUpperCase()}
          color={profile.avatar_color}
          selected={activeProfileId === profile.id}
          onPress={() => setActiveProfileId(profile.id)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  initial,
  color,
  selected,
  onPress,
}: {
  label: string;
  initial: string | null;
  color: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, selected && styles.chipSelected]} onPress={onPress}>
      <View style={[styles.avatar, { backgroundColor: color ?? Brand.deepBlue }]}>
        <ThemedText type="small" style={styles.avatarText}>
          {initial ?? 'Me'.charAt(0)}
        </ThemedText>
      </View>
      <ThemedText type="small" style={selected ? styles.labelSelected : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // flexGrow: 0 keeps this ScrollView sized to its content on web — as a
  // bare sibling in a flex:1 column (e.g. the medications list's
  // SafeAreaView, unlike the dashboard where it sits inside another
  // ScrollView), react-native-web otherwise stretches it to fill the
  // remaining column height, and alignItems: 'center' below then stretches
  // each chip's cross-axis to match, rendering them as tall ovals.
  scrollView: { flexGrow: 0, flexShrink: 0 },
  container: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  chipSelected: {
    borderColor: Brand.deepBlue,
    backgroundColor: Brand.bg,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#ffffff', fontWeight: '700' },
  labelSelected: { fontWeight: '700' },
});
