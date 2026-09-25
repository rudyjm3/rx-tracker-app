import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.title}>
            Family
          </ThemedText>
          <Pressable style={styles.addButton} onPress={() => router.push('/family/new')} hitSlop={8}>
            <ThemedText style={styles.addButtonText}>+ Add Family Member</ThemedText>
          </Pressable>
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Track medications for family members under one account.
        </ThemedText>

        {loading && !refreshing ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          >
            {familyProfiles.length === 0 && (
              <ThemedText themeColor="textSecondary">
                No family members yet. Tap &ldquo;Add Family Member&rdquo; to add one.
              </ThemedText>
            )}
            {familyProfiles.map((profile) => (
              <FamilyMemberCard key={profile.id} profile={profile} />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function FamilyMemberCard({ profile }: { profile: FamilyProfile }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/family/[id]', params: { id: profile.id } })}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={[styles.avatar, { backgroundColor: profile.avatar_color ?? Brand.deepBlue }]}>
          <ThemedText style={styles.avatarText}>{profile.display_name.charAt(0).toUpperCase()}</ThemedText>
        </View>
        <View style={styles.cardText}>
          <ThemedText type="smallBold">{profile.display_name}</ThemedText>
          {profile.relationship ? (
            <ThemedText type="small" themeColor="textSecondary">
              {profile.relationship}
            </ThemedText>
          ) : null}
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, marginBottom: Spacing.one },
  title: { fontSize: 28, lineHeight: 34 },
  addButton: { paddingVertical: Spacing.one },
  addButtonText: { color: Brand.deepBlue, fontWeight: '600' },
  subtitle: { marginBottom: Spacing.three },
  loading: { marginTop: Spacing.five },
  scrollContent: { gap: Spacing.two, paddingBottom: Spacing.six },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: BorderRadius.md, padding: Spacing.three },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  cardText: { flex: 1, gap: 2 },
});
