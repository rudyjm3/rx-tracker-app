import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, View } from 'react-native';

import { AllergyPanel } from '@/components/AllergyPanel';
import { AvatarPicker } from '@/components/avatar-picker';
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
import {
  AVATAR_COLOR_PALETTE,
  FAMILY_RELATIONSHIPS,
  convertHeight,
  convertWeight,
  deleteFamilyProfile,
  getFamilyProfile,
  updateFamilyProfile,
  type FamilyProfileInput,
} from '@/lib/family';
import type { FamilyProfile } from '@/lib/types/profile';
import { deleteAvatarIfManaged, resolveAvatarChange, type AvatarChange } from '@/lib/user-profile';
import { isoToUsDate, maskBirthDateInput, usDateToIso } from '@/lib/utils';

// profile_picture/photo upload is skipped this round — no image picker is
// installed, and it's a separate scope (see AGENTS task notes for this
// feature).
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
      <Screen edges={['left', 'right', 'bottom']} scroll={false} contentClassName="items-center justify-center">
        <ActivityIndicator />
      </Screen>
    );
  }

  if (loadError || !profile) {
    return (
      <Screen edges={['left', 'right', 'bottom']} scroll={false} contentClassName="items-center justify-center">
        <Text className="text-sm text-status-danger dark:text-status-danger">{loadError ?? 'Family member not found'}</Text>
      </Screen>
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
  const [birthDate, setBirthDate] = useState(isoToUsDate(profile.birth_date));
  const [heightValue, setHeightValue] = useState(profile.height_value != null ? String(profile.height_value) : '');
  const [heightUnit, setHeightUnit] = useState<'in' | 'cm'>((profile.height_unit as 'in' | 'cm') ?? 'in');
  const [weightValue, setWeightValue] = useState(profile.weight_value != null ? String(profile.weight_value) : '');
  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>((profile.weight_unit as 'lb' | 'kg') ?? 'lb');
  const [avatarColor, setAvatarColor] = useState(profile.avatar_color ?? AVATAR_COLOR_PALETTE[0]);
  const [avatar, setAvatar] = useState<AvatarChange>({ asset: null, remove: false });
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

    // Only bump the *_updated_at timestamp when the value actually
    // changed, so re-saving the form (e.g. to change just the
    // relationship) doesn't make an untouched height/weight look
    // freshly measured.
    const heightChanged =
      heightNum !== (profile.height_value ?? null) ||
      (heightNum !== null && heightUnit !== (profile.height_unit ?? 'in'));
    const weightChanged =
      weightNum !== (profile.weight_value ?? null) ||
      (weightNum !== null && weightUnit !== (profile.weight_unit ?? 'lb'));

    const input: FamilyProfileInput = {
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      display_name: displayName.trim() || null,
      relationship: relationship || null,
      birth_date: birthIso,
      height_value: heightNum,
      height_unit: heightUnit,
      height_updated_at: heightNum === null ? null : heightChanged ? new Date().toISOString() : profile.height_updated_at,
      weight_value: weightNum,
      weight_unit: weightUnit,
      weight_updated_at: weightNum === null ? null : weightChanged ? new Date().toISOString() : profile.weight_updated_at,
      avatar_color: avatarColor,
    };

    setSaving(true);
    let uploaded: string | null = null;
    try {
      const { picture, stale } = await resolveAvatarChange(profile.profile_picture, avatar);
      if (avatar.asset) uploaded = picture;
      await updateFamilyProfile(profile.id, { ...input, profile_picture: picture });
      // Best effort: a leftover old file is harmless, a failed save is not.
      deleteAvatarIfManaged(stale).catch(() => undefined);
      onSaved();
    } catch (e) {
      // The new photo was uploaded but the member wasn't saved — drop it.
      deleteAvatarIfManaged(uploaded).catch(() => undefined);
      setFormError(e instanceof Error ? e.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen edges={['left', 'right', 'bottom']} keyboardShouldPersistTaps="handled" contentClassName="pt-4">
      <ScreenTitle>{`Edit ${profile.display_name}`}</ScreenTitle>

      {formError ? <Callout kind="danger">{formError}</Callout> : null}

      <Card className="gap-4 p-4">
        <AvatarPicker
          currentUrl={profile.profile_picture}
          label={displayName || firstName || profile.display_name}
          color={avatarColor}
          value={avatar}
          onChange={setAvatar}
        />
        <Field label="First name" value={firstName} onChangeText={setFirstName} maxLength={50} />
        <Field label="Last name" value={lastName} onChangeText={setLastName} maxLength={50} />
        <Field label="Display name (optional — defaults to first name)" value={displayName} onChangeText={setDisplayName} maxLength={100} />

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

      <Card flat className="p-4">
        <AllergyPanel profileId={profile.id} />
      </Card>

      <View className="flex-row gap-2">
        <Button label="Cancel" variant="ghost" className="flex-1" onPress={() => router.back()} disabled={saving} />
        <Button label={saving ? 'Saving…' : 'Save'} className="flex-1" loading={saving} onPress={handleSave} />
      </View>

      <Button
        label="Remove family member"
        variant="secondary"
        className="border-status-danger dark:border-status-danger"
        labelClassName="text-status-danger dark:text-status-danger"
        onPress={onRemove}
        disabled={saving}
      />
    </Screen>
  );
}
