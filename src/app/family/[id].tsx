import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/active-profile';
import {
  AVATAR_COLOR_PALETTE,
  FAMILY_RELATIONSHIPS,
  deleteFamilyProfile,
  getFamilyProfile,
  updateFamilyProfile,
  type FamilyProfileInput,
} from '@/lib/family';
import type { FamilyProfile } from '@/lib/types/profile';

// Height/weight and profile_picture/photo upload are skipped this round —
// no image picker is installed, and they're a separate scope (see AGENTS
// task notes for this feature).
export default function EditFamilyMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeProfileId, refreshFamilyProfiles, setActiveProfileId } = useActiveProfile();

  const [profile, setProfile] = useState<FamilyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await getFamilyProfile(id);
        if (!cancelled) setProfile(data);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load family member');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function handleRemove() {
    if (!profile) return;
    Alert.alert(
      `Remove ${profile.display_name}?`,
      'This permanently deletes their medications, dose history, and logs — not just their profile. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFamilyProfile(profile.id);
              if (activeProfileId === profile.id) setActiveProfileId(null);
              try {
                // A failed refresh here doesn't mean the delete failed —
                // the row is already gone — so it must not report the
                // operation as failed. The family list screen also
                // refreshes on its own focus, so this list is caught up
                // either way.
                await refreshFamilyProfiles();
              } catch {
                // Ignored — see above.
              }
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

  if (loadError || !profile) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText style={styles.error}>{loadError ?? 'Family member not found'}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <EditForm
      profile={profile}
      onSaved={async () => {
        try {
          // A failed refresh here doesn't mean the save failed — the row
          // is already committed — so it must not report the operation
          // as failed to the form's caller. The family list screen also
          // refreshes on its own focus, so this list is caught up either
          // way.
          await refreshFamilyProfiles();
        } catch {
          // Ignored — see above.
        }
        router.back();
      }}
      onRemove={handleRemove}
    />
  );
}

function EditForm({
  profile,
  onSaved,
  onRemove,
}: {
  profile: FamilyProfile;
  onSaved: () => void;
  onRemove: () => void;
}) {
  const [firstName, setFirstName] = useState(profile.first_name ?? '');
  const [lastName, setLastName] = useState(profile.last_name ?? '');
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [relationship, setRelationship] = useState(profile.relationship ?? '');
  const [birthDate, setBirthDate] = useState(profile.birth_date ?? '');
  const [avatarColor, setAvatarColor] = useState(profile.avatar_color ?? AVATAR_COLOR_PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  async function handleSave() {
    setFormError(null);

    if (!displayName.trim() && !firstName.trim()) {
      setFormError('Enter a display name or a first name.');
      return;
    }
    if (birthDate && birthDate > today) {
      setFormError('Birth date cannot be in the future.');
      return;
    }

    const input: FamilyProfileInput = {
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      display_name: displayName.trim() || null,
      relationship: relationship || null,
      birth_date: birthDate || null,
      avatar_color: avatarColor,
    };

    setSaving(true);
    try {
      await updateFamilyProfile(profile.id, input);
      onSaved();
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
            Edit {profile.display_name}
          </ThemedText>

          {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

          <FieldLabel>First name</FieldLabel>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} maxLength={50} />

          <FieldLabel>Last name</FieldLabel>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} maxLength={50} />

          <FieldLabel>Display name (optional — defaults to first name)</FieldLabel>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} maxLength={100} />

          <FieldLabel>Relationship</FieldLabel>
          <View style={styles.chipRow}>
            {FAMILY_RELATIONSHIPS.map((rel) => (
              <Pressable
                key={rel}
                style={[styles.chip, relationship === rel && styles.chipSelected]}
                onPress={() => setRelationship(relationship === rel ? '' : rel)}
              >
                <ThemedText type="small" style={relationship === rel ? styles.chipTextSelected : undefined}>
                  {rel}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <FieldLabel>Birth date (YYYY-MM-DD)</FieldLabel>
          <TextInput
            style={styles.input}
            value={birthDate}
            onChangeText={setBirthDate}
            placeholder="1990-01-15"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <FieldLabel>Avatar color</FieldLabel>
          <View style={styles.colorRow}>
            {AVATAR_COLOR_PALETTE.map((color) => (
              <Pressable
                key={color}
                onPress={() => setAvatarColor(color)}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  avatarColor === color && styles.colorSwatchSelected,
                ]}
                accessibilityLabel={`Use color ${color}`}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={() => router.back()} disabled={saving}>
              <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
            </Pressable>
            <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.primaryButtonText}>Save</ThemedText>}
            </Pressable>
          </View>

          <Pressable style={styles.removeButton} onPress={onRemove} disabled={saving}>
            <ThemedText style={styles.removeButtonText}>Remove family member</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 1, borderColor: Brand.border, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  chipSelected: { borderColor: Brand.deepBlue, backgroundColor: Brand.bg },
  chipTextSelected: { color: Brand.deepBlue, fontWeight: '700' },
  colorRow: { flexDirection: 'row', gap: Spacing.two },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchSelected: { borderWidth: 3, borderColor: Brand.navy },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  primaryButton: { flex: 1, backgroundColor: Brand.deepBlue, borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: Brand.border, borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center' },
  secondaryButtonText: { fontWeight: '600' },
  disabled: { opacity: 0.6 },
  removeButton: { borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center', borderWidth: 1, borderColor: Brand.danger, marginTop: Spacing.three },
  removeButtonText: { color: Brand.danger, fontWeight: '600' },
});
