import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/active-profile';
import { getGroupMembers, getGroups } from '@/lib/medications';
import type { MedicationGroup } from '@/lib/types/medications';
import { to12h } from '@/lib/utils';

export default function GroupsListScreen() {
  const { activeProfileId } = useActiveProfile();
  const [groups, setGroups] = useState<MedicationGroup[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // See the Dashboard's identical guard: bumped on every load() call so a
  // slower, stale response (e.g. from a profile that's no longer selected)
  // can't overwrite state a newer call already set.
  const requestIdRef = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    const requestId = ++requestIdRef.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [groupData, members] = await Promise.all([getGroups(activeProfileId), getGroupMembers()]);
      if (requestIdRef.current !== requestId) return;
      setGroups(groupData);
      const counts: Record<string, number> = {};
      for (const m of members) {
        counts[m.group_id] = (counts[m.group_id] ?? 0) + 1;
      }
      setMemberCounts(counts);
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      setError(e instanceof Error ? e.message : 'Failed to load groups');
    } finally {
      if (requestIdRef.current !== requestId) return;
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [activeProfileId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.title}>
            Groups
          </ThemedText>
          <Pressable style={styles.addButton} onPress={() => router.push('/groups/new')} hitSlop={8}>
            <ThemedText style={styles.addButtonText}>+ Add Group</ThemedText>
          </Pressable>
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Combine medications taken together at the same time into one dashboard event.
        </ThemedText>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {loading && !refreshing ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          >
            {groups.length === 0 && (
              <ThemedText themeColor="textSecondary">
                No groups yet. Tap &ldquo;Add Group&rdquo; to combine medications taken at the same time.
              </ThemedText>
            )}
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} memberCount={memberCounts[group.id] ?? 0} />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function GroupCard({ group, memberCount }: { group: MedicationGroup; memberCount: number }) {
  return (
    <Pressable onPress={() => router.push(`/groups/${group.id}`)}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.cardText}>
          <ThemedText type="smallBold">{group.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {to12h(group.scheduled_time.slice(0, 5))} · {memberCount} {memberCount === 1 ? 'medication' : 'medications'}
          </ThemedText>
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
  error: { color: Brand.danger, marginBottom: Spacing.two },
  loading: { marginTop: Spacing.five },
  scrollContent: { gap: Spacing.two, paddingBottom: Spacing.six },
  card: { borderRadius: BorderRadius.md, padding: Spacing.three, gap: 2 },
  cardText: { gap: 2 },
});
