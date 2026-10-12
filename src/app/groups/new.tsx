import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { GroupMemberRow } from '@/components/group-member-row';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
import { useActiveProfile } from '@/lib/active-profile';
import { createGroup, getActiveMedications, type GroupInput, type GroupMemberInput } from '@/lib/medications';
import { resyncIfRemindersEnabled } from '@/lib/notifications';
import type { Medication } from '@/lib/types/medications';
import { to12h } from '@/lib/utils';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export default function NewGroupScreen() {
  const { activeProfileId } = useActiveProfile();

  const [medications, setMedications] = useState<Medication[]>([]);
  const [loadingMedications, setLoadingMedications] = useState(true);

  const [name, setName] = useState('');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  // medication_id -> quantity override string ('' = no override). Presence
  // of a key means the medication is selected, same as GroupModal's UX.
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMedications(true);
      try {
        const data = await getActiveMedications(activeProfileId);
        if (!cancelled) setMedications(data);
      } catch (e) {
        if (!cancelled) setFormError(e instanceof Error ? e.message : 'Failed to load medications');
      } finally {
        if (!cancelled) setLoadingMedications(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfileId]);

  function toggleMedication(id: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = '';
      return next;
    });
  }

  async function handleCreate() {
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

    const input: GroupInput = {
      name: name.trim(),
      scheduled_time: scheduledTime,
      profile_id: activeProfileId,
    };
    const members: GroupMemberInput[] = Object.entries(selected).map(([medication_id, qty], i) => ({
      medication_id,
      quantity_per_dose: qty.trim() ? Number(qty) : null,
      sort_order: i,
    }));

    setSaving(true);
    try {
      await createGroup(input, members);
      resyncIfRemindersEnabled();
      router.back();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create group');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen edges={['left', 'right', 'bottom']} keyboardShouldPersistTaps="handled" contentClassName="pt-4">
      <ScreenTitle>New group</ScreenTitle>

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
          {loadingMedications ? (
            <ActivityIndicator />
          ) : medications.length === 0 ? (
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
        <Button label={saving ? 'Creating…' : 'Create'} className="flex-1" loading={saving} onPress={handleCreate} />
      </View>
    </Screen>
  );
}
