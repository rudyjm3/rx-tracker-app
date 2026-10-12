import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SwitchRow } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { FormSheet } from '@/components/ui/form-sheet';
import { PanelTitle } from '@/components/ui/screen-title';
import { Sheet } from '@/components/ui/sheet';
import { TagPill } from '@/components/ui/tag-pill';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { confirmDestructive } from '@/lib/confirm';
import {
  ALLERGY_CATEGORIES,
  ALLERGY_CATEGORY_LABELS,
  ALLERGY_SEVERITIES,
  ALLERGY_SEVERITY_LABELS,
  addAllergy,
  deleteAllergy,
  getAllergyCatalog,
  getProfileAllergies,
  updateAllergy,
  type AllergyInput,
} from '@/lib/allergies';
import type {
  AllergyCatalogEntry,
  AllergyCategory,
  AllergySeverity,
  AllergyType,
  ProfileAllergyWithName,
} from '@/lib/types/profile';

const NEW_ENTRY_VALUE = '__new__';

const TYPE_OPTIONS: { value: AllergyType; label: string }[] = [
  { value: 'allergy', label: 'Allergy' },
  { value: 'intolerance', label: 'Intolerance' },
];

interface AllergyPanelProps {
  profileId: string | null;
}

export function AllergyPanel({ profileId }: AllergyPanelProps) {
  const [catalog, setCatalog] = useState<AllergyCatalogEntry[]>([]);
  const [allergies, setAllergies] = useState<ProfileAllergyWithName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProfileAllergyWithName | 'new' | null>(null);

  // Bumped on every load() call so a slower, stale response (e.g. from a
  // save that started before a newer one finished) can't overwrite state a
  // newer call already set — same guard as History's identical pattern.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [catalogData, allergyData] = await Promise.all([
        getAllergyCatalog(),
        getProfileAllergies(profileId),
      ]);
      if (requestIdRef.current !== requestId) return;
      setCatalog(catalogData);
      setAllergies(allergyData);
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      setError(e instanceof Error ? e.message : 'Failed to load allergies');
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirmRemove(allergy: ProfileAllergyWithName) {
    confirmDestructive(`Remove ${allergy.name}?`, undefined, 'Remove', async () => {
      try {
        await deleteAllergy(allergy.id);
        load();
      } catch (e) {
        Alert.alert('Failed', e instanceof Error ? e.message : "Couldn't remove allergy");
      }
    });
  }

  // Panel (DESIGN.md 8.12): title + compact Add, rows radius 18 / p-12 with
  // name, a 12 px meta line and Edit / Remove text buttons.
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <PanelTitle>Allergies & Intolerances</PanelTitle>
        <Button label="Add" variant="secondary" size="compact" onPress={() => setEditing('new')} />
      </View>

      {error ? <Text className="text-sm text-status-danger dark:text-status-danger">{error}</Text> : null}

      {loading ? (
        <ActivityIndicator className="my-4" />
      ) : allergies.length === 0 ? (
        <Text muted className="text-sm">
          No allergies recorded.
        </Text>
      ) : (
        <View className="gap-2">
          {allergies.map((a) => (
            <Card key={a.id} flat className="flex-row items-center justify-between gap-2 p-3">
              <View className="flex-1 gap-0.5">
                <Text className="text-sm font-semibold">
                  {a.name}
                  {!a.is_active ? <Text muted className="text-sm font-normal">{' (inactive)'}</Text> : null}
                </Text>
                <Text muted className="text-xs">
                  {a.life_threatening ? (
                    <Text className="text-xs font-semibold text-status-danger dark:text-status-danger">Life-threatening</Text>
                  ) : (
                    a.severity && ALLERGY_SEVERITY_LABELS[a.severity]
                  )}
                  {a.category && ` · ${ALLERGY_CATEGORY_LABELS[a.category]}`}
                </Text>
              </View>
              <View className="flex-row gap-1">
                <Pressable accessibilityRole="button" className="min-h-11 justify-center px-1" onPress={() => setEditing(a)} hitSlop={4}>
                  <Text className="text-sm font-medium text-brand-blue dark:text-brand-cyan">Edit</Text>
                </Pressable>
                <Pressable accessibilityRole="button" className="min-h-11 justify-center px-1" onPress={() => confirmRemove(a)} hitSlop={4}>
                  <Text className="text-sm font-medium text-status-danger dark:text-status-danger">Remove</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      )}

      {editing !== null ? (
        <AllergyFormSheet
          key={editing === 'new' ? 'new' : editing.id}
          profileId={profileId}
          existing={editing === 'new' ? null : editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </View>
  );
}

function AllergyFormSheet({
  profileId,
  existing,
  catalog,
  onClose,
  onSaved,
}: {
  profileId: string | null;
  existing: ProfileAllergyWithName | null;
  catalog: AllergyCatalogEntry[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialCatalogId = existing?.allergy_catalog_id ?? null;

  const [catalogSelection, setCatalogSelection] = useState(initialCatalogId ?? NEW_ENTRY_VALUE);
  const [newName, setNewName] = useState('');
  const [allergyType, setAllergyType] = useState<AllergyType>(existing?.allergy_type ?? 'allergy');
  const [lifeThreatening, setLifeThreatening] = useState(existing?.life_threatening ?? false);
  const [severity, setSeverity] = useState<AllergySeverity | null>(existing?.severity ?? null);
  const [category, setCategory] = useState<AllergyCategory | null>(existing?.category ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedCatalogName =
    catalogSelection === NEW_ENTRY_VALUE
      ? null
      : (catalog.find((c) => c.id === catalogSelection)?.name ?? null);

  async function handleSave() {
    setFormError(null);
    setSaving(true);
    const input: AllergyInput = {
      catalogId: catalogSelection === NEW_ENTRY_VALUE ? null : catalogSelection,
      newAllergyName: catalogSelection === NEW_ENTRY_VALUE ? newName : null,
      allergyType,
      lifeThreatening,
      severity: lifeThreatening ? null : severity,
      category,
      notes,
    };
    try {
      if (existing) {
        await updateAllergy(existing.id, { ...input, isActive });
      } else {
        await addAllergy(profileId, input);
      }
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save allergy");
      setSaving(false);
    }
  }

  function requestClose() {
    if (!saving) onClose();
  }

  return (
    <FormSheet
      title={existing ? 'Edit allergy' : 'Add allergy'}
      onClose={requestClose}
      dismissible={!saving}
      error={formError}
      footer={
        <>
          <Button label="Cancel" variant="ghost" className="flex-1" onPress={requestClose} disabled={saving} />
          <Button label={saving ? 'Saving…' : 'Save'} className="flex-1" loading={saving} onPress={handleSave} />
        </>
      }>
      <View className="gap-1">
        <Text className="text-sm">Allergy</Text>
        <Pressable
          accessibilityRole="button"
          className="min-h-11 justify-center rounded-control border border-brand-border bg-white px-3 dark:border-night-border dark:bg-night-card"
          onPress={() => setPickerOpen(true)}>
          <Text className="text-sm">
            {catalogSelection === NEW_ENTRY_VALUE ? '+ Enter a new allergy…' : (selectedCatalogName ?? '+ Enter a new allergy…')}
          </Text>
        </Pressable>
      </View>

      {catalogSelection === NEW_ENTRY_VALUE ? (
        <Field label="New allergy name" value={newName} onChangeText={setNewName} maxLength={150} placeholder="e.g. Amoxicillin" />
      ) : null}

      <View className="gap-1">
        <Text className="text-sm">Type</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {TYPE_OPTIONS.map((opt) => (
            <TagPill key={opt.value} label={opt.label} selected={allergyType === opt.value} onPress={() => setAllergyType(opt.value)} />
          ))}
        </View>
      </View>

      <SwitchRow label="Life-threatening" value={lifeThreatening} onValueChange={setLifeThreatening} />

      {!lifeThreatening ? (
        <View className="gap-1">
          <Text className="text-sm">Severity</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {ALLERGY_SEVERITIES.map((sv) => (
              <TagPill key={sv} label={ALLERGY_SEVERITY_LABELS[sv]} selected={severity === sv} onPress={() => setSeverity(severity === sv ? null : sv)} />
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-1">
        <Text className="text-sm">Category</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {ALLERGY_CATEGORIES.map((c) => (
            <TagPill key={c} label={ALLERGY_CATEGORY_LABELS[c]} selected={category === c} onPress={() => setCategory(category === c ? null : c)} />
          ))}
        </View>
      </View>

      <Field
        label="Notes (optional)"
        className="min-h-20"
        style={{ textAlignVertical: 'top' }}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={1000}
      />

      {existing ? <SwitchRow label="Active" value={isActive} onValueChange={setIsActive} /> : null}

      {pickerOpen ? (
        <Sheet onClose={() => setPickerOpen(false)}>
          <Text className="mb-3 text-lg font-bold text-brand-navy dark:text-white">Allergy</Text>
          <ScrollView className="max-h-80">
            <PickerRow
              label="+ Enter a new allergy…"
              selected={catalogSelection === NEW_ENTRY_VALUE}
              onPress={() => {
                setCatalogSelection(NEW_ENTRY_VALUE);
                setPickerOpen(false);
              }}
            />
            {catalog.map((c) => (
              <PickerRow
                key={c.id}
                label={c.name}
                selected={catalogSelection === c.id}
                onPress={() => {
                  setCatalogSelection(c.id);
                  setPickerOpen(false);
                }}
              />
            ))}
          </ScrollView>
          <Button label="Close" variant="ghost" className="mt-3" onPress={() => setPickerOpen(false)} />
        </Sheet>
      ) : null}
    </FormSheet>
  );
}

function PickerRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-12 justify-center border-b border-brand-border dark:border-night-border"
      onPress={onPress}>
      <Text className={cn('text-base', selected && 'font-bold text-brand-deep-blue dark:text-brand-cyan')}>{label}</Text>
    </Pressable>
  );
}
