import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientPressable } from '@/components/ui/gradient-pressable';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useActiveProfile } from '@/lib/active-profile';
import {
  AVATAR_COLOR_PALETTE,
  FAMILY_RELATIONSHIPS,
  convertHeight,
  convertWeight,
  createFamilyProfile,
  type FamilyProfileInput,
} from '@/lib/family';

// profile_picture/photo upload is skipped this round — no image picker is
// installed, and it's a separate scope (see AGENTS task notes for this
// feature).
export default function NewFamilyMemberScreen() {
  const theme = useTheme();
  const styles = getStyles(theme);
  const { refreshFamilyProfiles, setActiveProfileId } = useActiveProfile();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [relationship, setRelationship] = useState<string>('');
  const [birthDate, setBirthDate] = useState('');
  const [heightValue, setHeightValue] = useState('');
  const [heightUnit, setHeightUnit] = useState<'in' | 'cm'>('in');
  const [weightValue, setWeightValue] = useState('');
  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>('lb');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLOR_PALETTE[0]);
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

  async function handleCreate() {
    setFormError(null);

    if (!displayName.trim() && !firstName.trim()) {
      setFormError('Enter a display name or a first name.');
      return;
    }
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

    const input: FamilyProfileInput = {
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      display_name: displayName.trim() || null,
      relationship: relationship || null,
      birth_date: birthDate || null,
      height_value: heightNum,
      height_unit: heightUnit,
      weight_value: weightNum,
      weight_unit: weightUnit,
      avatar_color: avatarColor,
    };

    setSaving(true);
    try {
      const created = await createFamilyProfile(input);
      try {
        // A failed refresh here doesn't mean the create failed — the row
        // is already committed — so it must not land in the outer catch
        // and report the operation as failed (which would invite a
        // duplicate on retry). The family list screen also refreshes on
        // its own focus, so this list is caught up either way.
        await refreshFamilyProfiles();
      } catch {
        // Ignored — see above.
      }
      setActiveProfileId(created.id);
      // Send a brand-new family member straight into onboarding for that
      // profile, mirroring rx-tracker-web's FamilyClient.
      router.replace('/onboarding');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add family member');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Add family member
          </ThemedText>

          {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

          <FieldLabel>First name</FieldLabel>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="e.g. Sarah" placeholderTextColor={theme.textSecondary} maxLength={50} />

          <FieldLabel>Last name</FieldLabel>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="e.g. Johnson" placeholderTextColor={theme.textSecondary} maxLength={50} />

          <FieldLabel>Display name (optional — defaults to first name)</FieldLabel>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="e.g. Sarah" placeholderTextColor={theme.textSecondary} maxLength={100} />

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
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <FieldLabel>Height</FieldLabel>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.rowInput]}
              value={heightValue}
              onChangeText={setHeightValue}
              keyboardType="numeric"
              placeholder={heightUnit === 'cm' ? 'e.g. 165' : 'e.g. 65'}
              placeholderTextColor={theme.textSecondary}
            />
            <View style={styles.unitToggle}>
              <UnitButton label="in" active={heightUnit === 'in'} onPress={() => handleHeightUnitChange('in')} />
              <UnitButton label="cm" active={heightUnit === 'cm'} onPress={() => handleHeightUnitChange('cm')} />
            </View>
          </View>

          <FieldLabel>Weight</FieldLabel>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.rowInput]}
              value={weightValue}
              onChangeText={setWeightValue}
              keyboardType="numeric"
              placeholder={weightUnit === 'kg' ? 'e.g. 68' : 'e.g. 150'}
              placeholderTextColor={theme.textSecondary}
            />
            <View style={styles.unitToggle}>
              <UnitButton label="lb" active={weightUnit === 'lb'} onPress={() => handleWeightUnitChange('lb')} />
              <UnitButton label="kg" active={weightUnit === 'kg'} onPress={() => handleWeightUnitChange('kg')} />
            </View>
          </View>

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
            <GradientPressable style={[styles.primaryButton, saving && styles.disabled]} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.primaryButtonText}>Add</ThemedText>}
            </GradientPressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FieldLabel({ children }: { children: string }) {
  const styles = getStyles(useTheme());
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
      {children}
    </ThemedText>
  );
}

function UnitButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = getStyles(useTheme());
  return (
    <Pressable style={[styles.unitButton, active && styles.unitButtonActive]} onPress={onPress}>
      <ThemedText type="small" style={active ? styles.unitTextActive : styles.unitText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.one },
  title: { fontSize: 24, lineHeight: 30, marginBottom: Spacing.half },
  error: { color: Brand.danger, marginVertical: Spacing.two },
  fieldLabel: { marginTop: Spacing.three, marginBottom: Spacing.one },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16, color: theme.text, backgroundColor: theme.backgroundElement },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  rowInput: { flex: 1 },
  unitToggle: { flexDirection: 'row', backgroundColor: theme.backgroundSelected, borderRadius: BorderRadius.sm, padding: 2 },
  unitButton: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Spacing.one },
  unitButtonActive: { backgroundColor: theme.backgroundElement },
  unitText: { color: theme.textSecondary },
  unitTextActive: { color: theme.text, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  chipSelected: { borderColor: theme.accent, backgroundColor: theme.backgroundSelected },
  chipTextSelected: { color: theme.accent, fontWeight: '700' },
  colorRow: { flexDirection: 'row', gap: Spacing.two },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchSelected: { borderWidth: 3, borderColor: Brand.navy },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  primaryButton: { flex: 1, backgroundColor: Brand.deepBlue, borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center' },
  secondaryButtonText: { fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
}
