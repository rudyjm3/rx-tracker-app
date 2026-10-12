import { useCallback, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
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
    <Screen
      edges={['left', 'right', 'bottom']}
      contentClassName="pt-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <ScreenTitle>Groups</ScreenTitle>
        <Button label="+ Add Group" size="compact" onPress={() => router.push('/groups/new')} />
      </View>

      <Text muted className="text-sm">
        Combine medications taken together at the same time into one dashboard event.
      </Text>

      {error ? <Text className="text-sm text-status-danger dark:text-status-danger">{error}</Text> : null}

      {loading && !refreshing ? (
        <ActivityIndicator className="mt-8" />
      ) : (
        <>
          {groups.length === 0 ? (
            <Text muted className="text-sm">
              No groups yet. Tap &ldquo;Add Group&rdquo; to combine medications taken at the same time.
            </Text>
          ) : null}
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} memberCount={memberCounts[group.id] ?? 0} />
          ))}
        </>
      )}
    </Screen>
  );
}

function GroupCard({ group, memberCount }: { group: MedicationGroup; memberCount: number }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/groups/${group.id}`)}>
      <Card flat className="flex-row items-center gap-3">
        <Ionicons name="layers-outline" size={20} color="#0754A8" />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-semibold text-brand-navy dark:text-white">{group.name}</Text>
          <Text muted className="text-xs">
            {to12h(group.scheduled_time.slice(0, 5))} · {memberCount} {memberCount === 1 ? 'medication' : 'medications'}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}
