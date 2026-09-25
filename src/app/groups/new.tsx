import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            New group
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
          {loadingMedications ? (
            <ActivityIndicator style={styles.loading} />
          ) : medications.length === 0 ? (
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
            <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.primaryButtonText}>Create</ThemedText>}
            </Pressable>
          </View>
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
  scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.one },
  title: { fontSize: 24, lineHeight: 30, marginBottom: Spacing.half },
  error: { color: Brand.danger, marginVertical: Spacing.two },
  fieldLabel: { marginTop: Spacing.three, marginBottom: Spacing.one },
  input: { borderWidth: 1, borderColor: Brand.border, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  timeInput: { width: 100 },
  loading: { marginTop: Spacing.three },
  // No maxHeight here — this list flows in the screen's outer ScrollView,
  // so a long list scrolls with the rest of the form instead of being
  // clipped in its own fixed-height box and colliding with the buttons
  // below it.
  memberList: { gap: Spacing.two, marginTop: Spacing.one },
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
});
