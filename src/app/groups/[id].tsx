import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
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
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (loadError || !group) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText style={styles.error}>{loadError ?? 'Group not found'}</ThemedText>
        </SafeAreaView>
      </ThemedView>
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
      router.back();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Edit {group.name}
          </ThemedText>

          {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

          <FieldLabel>Group name</FieldLabel>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Morning pills" />

          <FieldLabel>Scheduled time</FieldLabel>
          <View style={styles.timeRow}>
            <TextInput
              style={[styles.input, styles.timeInput]}
              value={scheduledTime}
              onChangeText={setScheduledTime}
              placeholder="HH:MM"
            />
            <ThemedText type="small" themeColor="textSecondary">
              {TIME_RE.test(scheduledTime) ? to12h(scheduledTime) : ''}
            </ThemedText>
          </View>

          <FieldLabel>Members</FieldLabel>
          {medications.length === 0 ? (
            <ThemedText themeColor="textSecondary">No active medications to add yet.</ThemedText>
          ) : (
            <View style={styles.memberList}>
              {medications.map((med) => (
                <MemberRow
                  key={med.id}
                  medication={med}
                  selectedValue={selected[med.id]}
                  onToggle={() => toggleMedication(med.id)}
                  onChangeQuantity={(v) => setSelected((prev) => ({ ...prev, [med.id]: v }))}
                />
              ))}
            </View>
          )}

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={() => router.back()} disabled={saving}>
              <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
            </Pressable>
            <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.primaryButtonText}>Save</ThemedText>}
            </Pressable>
          </View>

          <Pressable style={styles.removeButton} onPress={onRemove} disabled={saving}>
            <ThemedText style={styles.removeButtonText}>Deactivate group</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function MemberRow({
  medication,
  selectedValue,
  onToggle,
  onChangeQuantity,
}: {
  medication: Medication;
  selectedValue: string | undefined;
  onToggle: () => void;
  onChangeQuantity: (value: string) => void;
}) {
  const isSelected = selectedValue !== undefined;
  return (
    <View style={styles.memberRow}>
      <Pressable style={styles.memberRowMain} onPress={onToggle} hitSlop={4}>
        <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
          {isSelected && <ThemedText style={styles.checkboxMark}>✓</ThemedText>}
        </View>
        <ThemedText type="small" style={styles.memberName}>
          {medication.name}
          {medication.dose ? ` — ${medication.dose}` : ''}
        </ThemedText>
      </Pressable>
      {isSelected && (
        <TextInput
          style={[styles.input, styles.qtyInput]}
          value={selectedValue}
          onChangeText={onChangeQuantity}
          keyboardType="numeric"
          placeholder="Qty override"
        />
      )}
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.one },
  title: { fontSize: 24, lineHeight: 30, marginBottom: Spacing.half },
  error: { color: Brand.danger, marginVertical: Spacing.two },
  fieldLabel: { marginTop: Spacing.three, marginBottom: Spacing.one },
  input: { borderWidth: 1, borderColor: Brand.border, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  timeInput: { width: 100 },
  memberList: { gap: Spacing.two, marginTop: Spacing.one, maxHeight: 320 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  memberRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Brand.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Brand.deepBlue, borderColor: Brand.deepBlue },
  checkboxMark: { color: '#ffffff', fontSize: 14, lineHeight: 16, fontWeight: '700' },
  memberName: { flex: 1 },
  qtyInput: { width: 110 },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  primaryButton: { flex: 1, backgroundColor: Brand.deepBlue, borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: Brand.border, borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center' },
  secondaryButtonText: { fontWeight: '600' },
  disabled: { opacity: 0.6 },
  removeButton: { borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center', borderWidth: 1, borderColor: Brand.danger, marginTop: Spacing.three },
  removeButtonText: { color: Brand.danger, fontWeight: '600' },
});
