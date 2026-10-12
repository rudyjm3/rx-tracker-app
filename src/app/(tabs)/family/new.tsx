import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { ColorSwatches } from '@/components/ui/color-swatches';
import { Field } from '@/components/ui/field';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { TagPill } from '@/components/ui/tag-pill';
import { Text } from '@/components/ui/text';
import { UnitField } from '@/components/ui/unit-field';
import { useActiveProfile } from '@/lib/active-profile';
import { maskBirthDateInput, usDateToIso } from '@/lib/utils';
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
    const birthIso = usDateToIso(birthDate);
    if (birthDate && !birthIso) {
      setFormError('Enter the birth date as MM-DD-YYYY.');
      return;
    }
    if (birthIso && birthIso > today) {
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
      birth_date: birthIso,
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
    <Screen edges={['left', 'right', 'bottom']} keyboardShouldPersistTaps="handled" contentClassName="pt-4">
      <ScreenTitle>Add family member</ScreenTitle>

      {formError ? <Callout kind="danger">{formError}</Callout> : null}

      <Card className="gap-4 p-4">
        <Field label="First name" value={firstName} onChangeText={setFirstName} maxLength={50} placeholder="e.g. Sarah" />
        <Field label="Last name" value={lastName} onChangeText={setLastName} maxLength={50} placeholder="e.g. Johnson" />
        <Field label="Display name (optional — defaults to first name)" value={displayName} onChangeText={setDisplayName} maxLength={100} placeholder="e.g. Sarah" />

        <View className="gap-1">
          <Text className="text-sm">Relationship</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {FAMILY_RELATIONSHIPS.map((rel) => (
              <TagPill
                key={rel}
                label={rel}
                selected={relationship === rel}
                onPress={() => setRelationship(relationship === rel ? '' : rel)}
              />
            ))}
          </View>
        </View>

        <Field
          label="Birth date (MM-DD-YYYY)"
          value={birthDate}
          onChangeText={(v) => setBirthDate(maskBirthDateInput(v))}
          placeholder="01-15-1990"
          keyboardType="number-pad"
          maxLength={10}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <UnitField
          label="Height"
          value={heightValue}
          onChangeText={setHeightValue}
          placeholder={heightUnit === 'cm' ? 'e.g. 165' : 'e.g. 65'}
          units={['in', 'cm'] as const}
          unit={heightUnit}
          onUnitChange={handleHeightUnitChange}
        />

        <UnitField
          label="Weight"
          value={weightValue}
          onChangeText={setWeightValue}
          placeholder={weightUnit === 'kg' ? 'e.g. 68' : 'e.g. 150'}
          units={['lb', 'kg'] as const}
          unit={weightUnit}
          onUnitChange={handleWeightUnitChange}
        />

        <View className="gap-1">
          <Text className="text-sm">Avatar color</Text>
          <ColorSwatches colors={AVATAR_COLOR_PALETTE} value={avatarColor} onChange={setAvatarColor} />
        </View>
      </Card>

      <View className="flex-row gap-2">
        <Button label="Cancel" variant="ghost" className="flex-1" onPress={() => router.back()} disabled={saving} />
        <Button label={saving ? 'Adding…' : 'Add'} className="flex-1" loading={saving} onPress={handleCreate} />
      </View>
    </Screen>
  );
}
