import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, View } from 'react-native';

import { GroupMemberRow } from '@/components/group-member-row';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
import { useActiveProfile } from '@/lib/active-profile';
import {
  deleteGroup,
  getActiveMedications,
  getGroupMembers,
  getGroups,
  updateGroup,
  type GroupInput,
  type GroupMemberInput,
} from '@/lib/medications';
import { resyncIfRemindersEnabled } from '@/lib/notifications';
import type { Medication, MedicationGroup } from '@/lib/types/medications';
import { to12h } from '@/lib/utils';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeProfileId } = useActiveProfile();

  const [group, setGroup] = useState<MedicationGroup | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [existingMembers, setExistingMembers] = useState<
    { medication_id: string; quantity_per_dose: number | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [groups, members, meds] = await Promise.all([
          getGroups(activeProfileId),
          getGroupMembers(),
          getActiveMedications(activeProfileId),
        ]);
        if (cancelled) return;
        setGroup(groups.find((g) => g.id === id) ?? null);
        setExistingMembers(members.filter((m) => m.group_id === id));
        setMedications(meds);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load group');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, activeProfileId]);

  function handleRemove() {
    if (!group) return;
    Alert.alert(
      `Deactivate ${group.name}?`,
      'This stops the group from combining these medications on the dashboard. The medications themselves keep their own schedules and are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGroup(group.id);
              resyncIfRemindersEnabled();
              router.back();
            } catch (e) {
              Alert.alert('Failed', e instanceof Error ? e.message : 'Something went wrong');
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <Screen edges={['left', 'right', 'bottom']} scroll={false} contentClassName="items-center justify-center">
        <ActivityIndicator />
      </Screen>
    );
  }

  if (loadError || !group) {
    return (
      <Screen edges={['left', 'right', 'bottom']} scroll={false} contentClassName="items-center justify-center">
        <Text className="text-sm text-status-danger dark:text-status-danger">{loadError ?? 'Group not found'}</Text>
      </Screen>
    );
  }

  return (
    <EditForm
      group={group}
      medications={medications}
      existingMembers={existingMembers}
      onRemove={handleRemove}
    />
  );
}

function EditForm({
  group,
  medications,
  existingMembers,
  onRemove,
}: {
  group: MedicationGroup;
  medications: Medication[];
  existingMembers: { medication_id: string; quantity_per_dose: number | null }[];
  onRemove: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [scheduledTime, setScheduledTime] = useState(group.scheduled_time.slice(0, 5));
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const m of existingMembers) {
      initial[m.medication_id] = m.quantity_per_dose != null ? String(m.quantity_per_dose) : '';
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleMedication(id: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = '';
      return next;
    });
  }

  async function handleSave() {
    setFormError(null);

    if (!name.trim()) {
      setFormError('Group name is required.');
      return;
    }
    if (!TIME_RE.test(scheduledTime)) {
      setFormError(`"${scheduledTime}" isn't a valid time — use HH:MM (24h).`);
      return;
    }
    for (const qty of Object.values(selected)) {
      if (!qty.trim()) continue;
      const num = Number(qty);
      if (!Number.isFinite(num) || num <= 0) {
        setFormError('Quantity overrides must be positive numbers.');
        return;
      }
    }

    // Preserve the group's existing profile assignment — editing doesn't
    // move a group between profiles, same as medications.
    const input: GroupInput = {
      name: name.trim(),
      scheduled_time: scheduledTime,
      profile_id: group.profile_id,
    };
    const members: GroupMemberInput[] = Object.entries(selected).map(([medication_id, qty], i) => ({
      medication_id,
      quantity_per_dose: qty.trim() ? Number(qty) : null,
      sort_order: i,
    }));

    setSaving(true);
    try {
      await updateGroup(group.id, input, members);
      resyncIfRemindersEnabled();
      router.back();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen edges={['left', 'right', 'bottom']} keyboardShouldPersistTaps="handled" contentClassName="pt-4">
      <ScreenTitle>{`Edit ${group.name}`}</ScreenTitle>

      {formError ? <Callout kind="danger">{formError}</Callout> : null}

      <Card className="gap-4 p-4">
        <Field label="Group name" value={name} onChangeText={setName} placeholder="e.g. Morning pills" />

        <View className="flex-row items-end gap-2">
          <View className="w-28">
            <Field label="Scheduled time" value={scheduledTime} onChangeText={setScheduledTime} placeholder="HH:MM" />
          </View>
          <Text muted className="mb-3 text-sm">
            {TIME_RE.test(scheduledTime) ? to12h(scheduledTime) : ''}
          </Text>
        </View>

        <View className="gap-1">
          <Text className="text-sm">Members</Text>
          {medications.length === 0 ? (
            <Text muted className="text-sm">No active medications to add yet.</Text>
          ) : (
            <View className="gap-1">
              {medications.map((med) => (
                <GroupMemberRow
                  key={med.id}
                  medication={med}
                  selectedValue={selected[med.id]}
                  onToggle={() => toggleMedication(med.id)}
                  onChangeQuantity={(v) => setSelected((prev) => ({ ...prev, [med.id]: v }))}
                />
              ))}
            </View>
          )}
        </View>
      </Card>

      <View className="flex-row gap-2">
        <Button label="Cancel" variant="ghost" className="flex-1" onPress={() => router.back()} disabled={saving} />
        <Button label={saving ? 'Saving…' : 'Save'} className="flex-1" loading={saving} onPress={handleSave} />
      </View>

      <Button
        label="Deactivate group"
        variant="secondary"
        className="border-status-danger dark:border-status-danger"
        labelClassName="text-status-danger dark:text-status-danger"
        onPress={onRemove}
        disabled={saving}
      />
    </Screen>
  );
}
