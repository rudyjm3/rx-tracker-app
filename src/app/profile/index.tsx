import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AllergyPanel } from '@/components/AllergyPanel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { convertHeight, convertWeight } from '@/lib/family';
import { getUserProfile, upsertUserProfile, type UserProfileInput } from '@/lib/user-profile';
import type { UserProfile } from '@/lib/types/profile';

// Profile picture upload is skipped this round — no image picker is
// installed, same deferral already made for family member photos.
export default function MyProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // A null profile is the normal state before a first save, not an
        // error — the row is upserted lazily on first save rather than
        // required to exist up front.
        const data = await getUserProfile();
        if (!cancelled) setProfile(data);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load your profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (loadError) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText style={styles.error}>{loadError}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return <EditForm profile={profile} onSaved={() => router.back()} />;
}

function EditForm({ profile, onSaved }: { profile: UserProfile | null; onSaved: () => void }) {
  const theme = useTheme();
  const inputThemeStyle = { backgroundColor: theme.backgroundElement, color: theme.text };
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [birthDate, setBirthDate] = useState(profile?.birth_date ?? '');
  const [heightValue, setHeightValue] = useState(profile?.height_value != null ? String(profile.height_value) : '');
  const [heightUnit, setHeightUnit] = useState<'in' | 'cm'>((profile?.height_unit as 'in' | 'cm') ?? 'in');
  const [weightValue, setWeightValue] = useState(profile?.weight_value != null ? String(profile.weight_value) : '');
  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>((profile?.weight_unit as 'lb' | 'kg') ?? 'lb');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // Switching units must convert (not reinterpret) any value already
  // typed — tapping "cm" on a field showing 65 (in) should show ~165
  // (cm), not silently turn into 65cm.
  function handleHeightUnitChange(unit: 'in' | 'cm') {
    setHeightValue((prev) => {
      const num = prev.trim() ? Number(prev) : null;
      return num !== null && Number.isFinite(num) ? String(convertHeight(num, heightUnit, unit)) : prev;
    });
    setHeightUnit(unit);
  }

  function handleWeightUnitChange(unit: 'lb' | 'kg') {
    setWeightValue((prev) => {
      const num = prev.trim() ? Number(prev) : null;
      return num !== null && Number.isFinite(num) ? String(convertWeight(num, weightUnit, unit)) : prev;
    });
    setWeightUnit(unit);
  }

  async function handleSave() {
    setFormError(null);

    if (birthDate && birthDate > today) {
      setFormError('Birth date cannot be in the future.');
      return;
    }

    const heightNum = heightValue.trim() ? Number(heightValue) : null;
    if (heightNum !== null) {
      const [min, max] = heightUnit === 'cm' ? [50, 274] : [20, 108];
      if (!Number.isFinite(heightNum) || heightNum < min || heightNum > max) {
        setFormError(`Height must be between ${min} and ${max} ${heightUnit}.`);
        return;
      }
    }

    const weightNum = weightValue.trim() ? Number(weightValue) : null;
    if (weightNum !== null) {
      const [min, max] = weightUnit === 'kg' ? [1, 300] : [1, 660];
      if (!Number.isFinite(weightNum) || weightNum < min || weightNum > max) {
        setFormError(`Weight must be between ${min} and ${max} ${weightUnit}.`);
        return;
      }
    }

    // Only bump the *_updated_at timestamp when the value actually
    // changed, so re-saving the form (e.g. to change just the name)
    // doesn't make an untouched height/weight look freshly measured.
    const heightChanged =
      heightNum !== (profile?.height_value ?? null) ||
      (heightNum !== null && heightUnit !== (profile?.height_unit ?? 'in'));
    const weightChanged =
      weightNum !== (profile?.weight_value ?? null) ||
      (weightNum !== null && weightUnit !== (profile?.weight_unit ?? 'lb'));

    const input: UserProfileInput = {
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      display_name: displayName.trim() || null,
      birth_date: birthDate || null,
      height_value: heightNum,
      height_unit: heightNum === null ? null : heightUnit,
      height_updated_at: heightNum === null ? null : heightChanged ? new Date().toISOString() : (profile?.height_updated_at ?? null),
      weight_value: weightNum,
      weight_unit: weightNum === null ? null : weightUnit,
      weight_updated_at: weightNum === null ? null : weightChanged ? new Date().toISOString() : (profile?.weight_updated_at ?? null),
    };

    setSaving(true);
    try {
      await upsertUserProfile(input);
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
          {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

          <FieldLabel>First name</FieldLabel>
          <TextInput
            style={[styles.input, inputThemeStyle]}
            placeholderTextColor={theme.textSecondary}
            value={firstName}
            onChangeText={setFirstName}
            maxLength={50}
          />

          <FieldLabel>Last name</FieldLabel>
          <TextInput
            style={[styles.input, inputThemeStyle]}
            placeholderTextColor={theme.textSecondary}
            value={lastName}
            onChangeText={setLastName}
            maxLength={50}
          />

          <FieldLabel>Display name (optional — defaults to first name)</FieldLabel>
          <TextInput
            style={[styles.input, inputThemeStyle]}
            placeholderTextColor={theme.textSecondary}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={100}
          />

          <FieldLabel>Birth date (YYYY-MM-DD)</FieldLabel>
          <TextInput
            style={[styles.input, inputThemeStyle]}
            placeholderTextColor={theme.textSecondary}
            value={birthDate}
            onChangeText={setBirthDate}
            placeholder="1990-01-15"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <FieldLabel>Height</FieldLabel>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.rowInput, inputThemeStyle]}
              placeholderTextColor={theme.textSecondary}
              value={heightValue}
              onChangeText={setHeightValue}
              keyboardType="numeric"
              placeholder={heightUnit === 'cm' ? 'e.g. 165' : 'e.g. 65'}
            />
            <View style={styles.unitToggle}>
              <UnitButton label="in" active={heightUnit === 'in'} onPress={() => handleHeightUnitChange('in')} />
              <UnitButton label="cm" active={heightUnit === 'cm'} onPress={() => handleHeightUnitChange('cm')} />
            </View>
          </View>

          <FieldLabel>Weight</FieldLabel>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.rowInput, inputThemeStyle]}
              placeholderTextColor={theme.textSecondary}
              value={weightValue}
              onChangeText={setWeightValue}
              keyboardType="numeric"
              placeholder={weightUnit === 'kg' ? 'e.g. 68' : 'e.g. 150'}
            />
            <View style={styles.unitToggle}>
              <UnitButton label="lb" active={weightUnit === 'lb'} onPress={() => handleWeightUnitChange('lb')} />
              <UnitButton label="kg" active={weightUnit === 'kg'} onPress={() => handleWeightUnitChange('kg')} />
            </View>
          </View>

          <View style={styles.section}>
            <AllergyPanel profileId={null} />
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={() => router.back()} disabled={saving}>
              <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
            </Pressable>
            <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.primaryButtonText}>Save</ThemedText>}
            </Pressable>
          </View>
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

function UnitButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.unitButton, active && styles.unitButtonActive]} onPress={onPress}>
      <ThemedText type="small" style={active ? styles.unitTextActive : styles.unitText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.one },
  error: { color: Brand.danger, marginVertical: Spacing.two },
  fieldLabel: { marginTop: Spacing.three, marginBottom: Spacing.one },
  input: { borderWidth: 1, borderColor: Brand.border, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  rowInput: { flex: 1 },
  unitToggle: { flexDirection: 'row', backgroundColor: Brand.bg, borderRadius: BorderRadius.sm, padding: 2 },
  unitButton: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Spacing.one },
  unitButtonActive: { backgroundColor: Brand.card },
  unitText: { color: Brand.textMuted },
  unitTextActive: { color: Brand.text, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  section: { marginTop: Spacing.five, paddingTop: Spacing.four, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Brand.border },
  primaryButton: { flex: 1, backgroundColor: Brand.deepBlue, borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: Brand.border, borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center' },
  secondaryButtonText: { fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
