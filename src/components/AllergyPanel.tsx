import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { SeverityBar } from '@/components/ui/severity-bar';
import { SwitchRow } from '@/components/ui/checkbox';
import { Field, Input } from '@/components/ui/field';
import { FormSheet } from '@/components/ui/form-sheet';
import { PanelTitle } from '@/components/ui/screen-title';
import { Sheet } from '@/components/ui/sheet';
import { TagPill } from '@/components/ui/tag-pill';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { confirmDestructive } from '@/lib/confirm';
import { getActiveMedications } from '@/lib/medications';
import {
  ALLERGY_CATEGORIES,
  ALLERGY_CATEGORY_LABELS,
  ALLERGY_SEVERITIES,
  ALLERGY_SEVERITY_LABELS,
  ALLERGY_TYPE_LABELS,
  allergySeverityLevel,
  allergySeverityText,
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
  /** Hide the in-panel title when the host screen already shows one. */
  showTitle?: boolean;
}

export function AllergyPanel({ profileId, showTitle = true }: AllergyPanelProps) {
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

  // Rows are tappable (open the edit sheet) with a severity label + 4-segment
  // bar on the right; the Add button sits centered under the list.
  return (
    <View className="gap-3">
      {showTitle ? <PanelTitle>Allergies & Intolerances</PanelTitle> : null}

      {error ? <Text className="text-sm text-status-danger dark:text-status-danger">{error}</Text> : null}

      {loading ? (
        <ActivityIndicator className="my-4" />
      ) : allergies.length === 0 ? (
        <Text muted className="text-center text-sm">
          No allergies recorded.
        </Text>
      ) : (
        <View className="gap-2">
          {allergies.map((a) => {
            const label = allergySeverityText(a);
            const meta = [ALLERGY_TYPE_LABELS[a.allergy_type], a.category ? ALLERGY_CATEGORY_LABELS[a.category] : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={`${a.name}${label ? `, ${label}` : ''}. Edit`}
                onPress={() => setEditing(a)}
                className="min-h-14 flex-row items-center gap-3 rounded-card border border-brand-border bg-brand-card p-3 active:bg-brand-bg dark:border-night-border dark:bg-night-card dark:active:bg-night-selected">
                <View className="flex-1 gap-0.5">
                  <Text className="text-sm font-semibold">
                    {a.name}
                    {!a.is_active ? <Text muted className="text-sm font-normal">{' (inactive)'}</Text> : null}
                  </Text>
                  <Text muted className="text-xs">
                    {meta}
                  </Text>
                </View>
                {label ? (
                  <View className="items-end gap-1">
                    <Text
                      className={cn(
                        'text-sm font-semibold',
                        a.life_threatening && 'text-status-danger dark:text-status-danger',
                      )}>
                      {label}
                    </Text>
                    <SeverityBar level={allergySeverityLevel(a)} />
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color="#60708A" />
              </Pressable>
            );
          })}
        </View>
      )}

      <Button label="+ Add" className="self-center rounded-full px-8" onPress={() => setEditing('new')} />

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

  // Substance = pick from the catalog (or enter a new one); Medication = type
  // a name, with suggestions from the active medications list.
  const [medicationMode, setMedicationMode] = useState(false);
  const [catalogSelection, setCatalogSelection] = useState(initialCatalogId ?? NEW_ENTRY_VALUE);
  const [newName, setNewName] = useState('');
  const [medName, setMedName] = useState('');
  const [medNames, setMedNames] = useState<string[]>([]);
  const [allergyType, setAllergyType] = useState<AllergyType>(existing?.allergy_type ?? 'allergy');
  const [lifeThreatening, setLifeThreatening] = useState(existing?.life_threatening ?? false);
  const [severity, setSeverity] = useState<AllergySeverity | null>(existing?.severity ?? null);
  const [category, setCategory] = useState<AllergyCategory | null>(existing?.category ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getActiveMedications(profileId)
      .then((meds) => {
        if (!cancelled) setMedNames([...new Set(meds.map((m) => m.name))]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const selectedCatalogName =
    catalogSelection === NEW_ENTRY_VALUE
      ? null
      : (catalog.find((c) => c.id === catalogSelection)?.name ?? null);

  const typedMed = medName.trim().toLowerCase();
  const suggestions = typedMed
    ? medNames.filter((n) => n.toLowerCase().includes(typedMed) && n.toLowerCase() !== typedMed).slice(0, 5)
    : [];

  function toggleMode(next: boolean) {
    setMedicationMode(next);
    if (next && category === null) setCategory('drug');
  }

  async function handleSave() {
    setFormError(null);
    setSaving(true);
    const input: AllergyInput = medicationMode
      ? { catalogId: null, newAllergyName: medName, allergyType, lifeThreatening, severity: lifeThreatening ? null : severity, category, notes }
      : {
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

  function confirmRemove() {
    if (!existing) return;
    confirmDestructive(`Remove ${existing.name}?`, undefined, 'Remove', async () => {
      try {
        await deleteAllergy(existing.id);
        onSaved();
      } catch (e) {
        Alert.alert('Failed', e instanceof Error ? e.message : "Couldn't remove allergy");
      }
    });
  }

  return (
    <FormSheet
      title="Allergies & Intolerances"
      onClose={requestClose}
      dismissible={!saving}
      error={formError}
      footer={
        existing ? (
          <>
            <Button
              label="Delete"
              variant="ghost"
              labelClassName="text-status-danger dark:text-status-danger"
              onPress={confirmRemove}
              disabled={saving}
            />
            <View className="flex-1" />
            <Button label="Cancel" variant="secondary" onPress={requestClose} disabled={saving} />
            <Button label={saving ? 'Saving…' : 'Update'} loading={saving} onPress={handleSave} />
          </>
        ) : (
          <>
            <Button label="Cancel" variant="secondary" className="flex-1" onPress={requestClose} disabled={saving} />
            <Button label={saving ? 'Saving…' : 'Add'} className="flex-1" loading={saving} onPress={handleSave} />
          </>
        )
      }>
      {existing ? (
        <View className="gap-1">
          <Text muted className="text-sm font-semibold">
            I currently have this
          </Text>
          <View className="flex-row gap-1.5">
            <TagPill label="Yes" selected={isActive} onPress={() => setIsActive(true)} />
            <TagPill label="No" selected={!isActive} onPress={() => setIsActive(false)} />
          </View>
        </View>
      ) : null}

      <SwitchRow
        label={medicationMode ? 'Medication' : 'Substance'}
        value={medicationMode}
        onValueChange={toggleMode}
      />

      {medicationMode ? (
        <View className="gap-1">
          <Text muted className="text-sm font-semibold">
            Medication
          </Text>
          <Input
            value={medName}
            onChangeText={setMedName}
            maxLength={150}
            placeholder="Type a medication, supplement"
            autoCapitalize="words"
          />
          {suggestions.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5">
              {suggestions.map((n) => (
                <TagPill key={n} label={n} onPress={() => setMedName(n)} />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <View className="gap-1">
            <Text muted className="text-sm font-semibold">
              Substance
            </Text>
            <Pressable
              accessibilityRole="button"
              className="min-h-11 flex-row items-center justify-between rounded-control border border-brand-border bg-white px-3 dark:border-night-border dark:bg-night-card"
              onPress={() => setPickerOpen(true)}>
              <Text className="text-sm">{selectedCatalogName ?? '+ Enter a new substance…'}</Text>
              <Ionicons name="chevron-down" size={16} color="#60708A" />
            </Pressable>
          </View>
          {catalogSelection === NEW_ENTRY_VALUE ? (
            <Field label="New substance name" value={newName} onChangeText={setNewName} maxLength={150} placeholder="e.g. Penicillin" />
          ) : null}
        </>
      )}

      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <Text muted className="text-sm font-semibold">
            Type
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Allergy versus intolerance"
            hitSlop={10}
            onPress={() => setInfoOpen(true)}>
            <Ionicons name="information-circle" size={18} color="#0754A8" />
          </Pressable>
        </View>
        <View className="flex-row flex-wrap gap-1.5">
          {TYPE_OPTIONS.map((opt) => (
            <TagPill key={opt.value} label={opt.label} selected={allergyType === opt.value} onPress={() => setAllergyType(opt.value)} />
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: lifeThreatening }}
        onPress={() => setLifeThreatening(!lifeThreatening)}
        className={cn(
          'min-h-11 justify-center rounded-full border px-4',
          lifeThreatening
            ? 'border-status-danger bg-status-danger'
            : 'border-brand-border bg-brand-bg dark:border-night-border dark:bg-night-selected',
        )}>
        <Text className={cn('text-sm font-semibold', lifeThreatening && 'text-white dark:text-white')}>
          Life-threatening (e.g. Anaphylaxis)
        </Text>
      </Pressable>

      {!lifeThreatening ? (
        <View className="gap-1">
          <Text muted className="text-sm font-semibold">
            Estimated Severity
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {ALLERGY_SEVERITIES.map((sv) => (
              <TagPill key={sv} label={ALLERGY_SEVERITY_LABELS[sv]} selected={severity === sv} onPress={() => setSeverity(severity === sv ? null : sv)} />
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-1">
        <Text muted className="text-sm font-semibold">
          Category
        </Text>
        <View className="flex-row flex-wrap gap-1.5">
          {ALLERGY_CATEGORIES.map((c) => (
            <TagPill key={c} label={ALLERGY_CATEGORY_LABELS[c]} selected={category === c} onPress={() => setCategory(category === c ? null : c)} />
          ))}
        </View>
      </View>

      <Field
        label="Notes"
        className="min-h-20"
        style={{ textAlignVertical: 'top' }}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={1000}
      />

      {pickerOpen ? (
        <Sheet onClose={() => setPickerOpen(false)}>
          <Text className="mb-3 text-lg font-bold text-brand-navy dark:text-white">Substance</Text>
          <ScrollView className="max-h-80">
            <PickerRow
              label="+ Enter a new substance…"
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

      {infoOpen ? (
        <Sheet onClose={() => setInfoOpen(false)}>
          <Text accessibilityRole="header" className="mb-3 text-lg font-bold text-brand-navy dark:text-white">
            Allergy vs Intolerance
          </Text>
          <View className="gap-3">
            <Text className="text-sm leading-5">
              Choose <Text className="text-sm font-bold">Allergy</Text> when a reaction involves the immune system,
              since this covers symptoms such as hives, swelling, trouble breathing, or anaphylaxis, and even small
              amounts can trigger a response. If a reaction has ever been sudden, severe, or life-threatening, select
              Allergy so it&apos;s flagged appropriately.
            </Text>
            <Text className="text-sm leading-5">
              Choose <Text className="text-sm font-bold">Intolerance</Text> when the body has trouble processing a
              substance without immune involvement, since this usually leads to milder digestive or discomfort symptoms
              like bloating, gas, or headaches, and the reaction often depends on how much was consumed.
            </Text>
          </View>
          <Button label="Close" variant="ghost" className="mt-3" onPress={() => setInfoOpen(false)} />
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
