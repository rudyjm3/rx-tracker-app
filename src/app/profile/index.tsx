import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AllergyPanel } from '@/components/AllergyPanel';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { UnitField } from '@/components/ui/unit-field';
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
      <Screen edges={['left', 'right', 'bottom']} scroll={false} contentClassName="items-center justify-center">
        <ActivityIndicator />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen edges={['left', 'right', 'bottom']} scroll={false} contentClassName="items-center justify-center">
        <Text className="text-sm text-status-danger dark:text-status-danger">{loadError}</Text>
      </Screen>
    );
  }

  return <EditForm profile={profile} onSaved={() => router.back()} />;
}

function EditForm({ profile, onSaved }: { profile: UserProfile | null; onSaved: () => void }) {
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
    <Screen edges={['left', 'right', 'bottom']} keyboardShouldPersistTaps="handled" contentClassName="pt-4">
      {formError ? <Callout kind="danger">{formError}</Callout> : null}

      <Card flat className="gap-4 p-4">
        <Field label="First name" value={firstName} onChangeText={setFirstName} maxLength={50} />
        <Field label="Last name" value={lastName} onChangeText={setLastName} maxLength={50} />
        <Field label="Display name (optional — defaults to first name)" value={displayName} onChangeText={setDisplayName} maxLength={100} />
        <Field
          label="Birth date (YYYY-MM-DD)"
          value={birthDate}
          onChangeText={setBirthDate}
          placeholder="1990-01-15"
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
      </Card>

      <Card flat className="p-4">
        <AllergyPanel profileId={null} />
      </Card>

      <View className="flex-row gap-2">
        <Button label="Cancel" variant="ghost" className="flex-1" onPress={() => router.back()} disabled={saving} />
        <Button label={saving ? 'Saving…' : 'Save'} className="flex-1" loading={saving} onPress={handleSave} />
      </View>
    </Screen>
  );
}
