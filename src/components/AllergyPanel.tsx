import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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

// Alert.alert's buttons are a no-op on web (react-native-web's Alert.alert
// is an empty stub), which would make onConfirm unreachable there — fall
// back to window.confirm on that platform, matching the pain/mood screen's
// confirmDestructive helper.
function confirmDestructive(title: string, message: string | undefined, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="smallBold">Allergies & Intolerances</ThemedText>
        <Pressable style={styles.addButton} onPress={() => setEditing('new')}>
          <ThemedText type="small" style={styles.addButtonText}>
            Add
          </ThemedText>
        </Pressable>
      </View>

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : allergies.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No allergies recorded.
        </ThemedText>
      ) : (
        <View style={styles.list}>
          {allergies.map((a) => (
            <ThemedView key={a.id} type="backgroundElement" style={styles.row}>
              <View style={styles.rowMain}>
                <ThemedText type="smallBold">
                  {a.name}
                  {!a.is_active && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {' '}
                      (inactive)
                    </ThemedText>
                  )}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {a.life_threatening ? (
                    <ThemedText type="small" style={styles.danger}>
                      Life-threatening
                    </ThemedText>
                  ) : (
                    a.severity && ALLERGY_SEVERITY_LABELS[a.severity]
                  )}
                  {a.category && ` · ${ALLERGY_CATEGORY_LABELS[a.category]}`}
                </ThemedText>
              </View>
              <View style={styles.rowActions}>
                <Pressable onPress={() => setEditing(a)} hitSlop={8}>
                  <ThemedText type="small" style={styles.editLink}>
                    Edit
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => confirmRemove(a)} hitSlop={8}>
                  <ThemedText type="small" style={styles.danger}>
                    Remove
                  </ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          ))}
        </View>
      )}

      {editing !== null && (
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
      )}
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
  const theme = useTheme();
  const inputThemeStyle = { backgroundColor: theme.backgroundElement, color: theme.text };
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
    <Modal visible animationType="slide" transparent onRequestClose={requestClose}>
      <Pressable style={styles.modalBackdrop} onPress={requestClose}>
        <Pressable style={styles.sheetWrapper} onPress={(e) => e.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <SafeAreaView edges={['bottom']}>
            <ScrollView>
              <ThemedText type="subtitle" style={styles.modalTitle}>
                {existing ? 'Edit allergy' : 'Add allergy'}
              </ThemedText>

              {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

              <FieldLabel>Allergy</FieldLabel>
              <Pressable style={[styles.input, styles.selectField]} onPress={() => setPickerOpen(true)}>
                <ThemedText>
                  {catalogSelection === NEW_ENTRY_VALUE
                    ? '+ Enter a new allergy…'
                    : (selectedCatalogName ?? '+ Enter a new allergy…')}
                </ThemedText>
              </Pressable>

              {catalogSelection === NEW_ENTRY_VALUE && (
                <>
                  <FieldLabel>New allergy name</FieldLabel>
                  <TextInput
                    style={[styles.input, inputThemeStyle]}
                    placeholderTextColor={theme.textSecondary}
                    value={newName}
                    onChangeText={setNewName}
                    maxLength={150}
                    placeholder="e.g. Amoxicillin"
                  />
                </>
              )}

              <FieldLabel>Type</FieldLabel>
              <View style={styles.chipRow}>
                {TYPE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[styles.chip, allergyType === opt.value && styles.chipSelected]}
                    onPress={() => setAllergyType(opt.value)}
                  >
                    <ThemedText
                      type="small"
                      style={allergyType === opt.value ? styles.chipTextSelected : undefined}
                    >
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              <View style={styles.switchRow}>
                <ThemedText type="smallBold">Life-threatening</ThemedText>
                <Switch
                  value={lifeThreatening}
                  onValueChange={setLifeThreatening}
                  trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
                />
              </View>

              {!lifeThreatening && (
                <>
                  <FieldLabel>Severity</FieldLabel>
                  <View style={styles.chipRow}>
                    {ALLERGY_SEVERITIES.map((s) => (
                      <Pressable
                        key={s}
                        style={[styles.chip, severity === s && styles.chipSelected]}
                        onPress={() => setSeverity(severity === s ? null : s)}
                      >
                        <ThemedText type="small" style={severity === s ? styles.chipTextSelected : undefined}>
                          {ALLERGY_SEVERITY_LABELS[s]}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <FieldLabel>Category</FieldLabel>
              <View style={styles.chipRow}>
                {ALLERGY_CATEGORIES.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.chip, category === c && styles.chipSelected]}
                    onPress={() => setCategory(category === c ? null : c)}
                  >
                    <ThemedText type="small" style={category === c ? styles.chipTextSelected : undefined}>
                      {ALLERGY_CATEGORY_LABELS[c]}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              <FieldLabel>Notes (optional)</FieldLabel>
              <TextInput
                style={[styles.input, styles.multiline, inputThemeStyle]}
                placeholderTextColor={theme.textSecondary}
                value={notes}
                onChangeText={setNotes}
                multiline
                maxLength={1000}
              />

              {existing && (
                <View style={styles.switchRow}>
                  <ThemedText type="smallBold">Active</ThemedText>
                  <Switch
                    value={isActive}
                    onValueChange={setIsActive}
                    trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
                  />
                </View>
              )}

              <View style={styles.actions}>
                <Pressable style={styles.secondaryButton} onPress={requestClose} disabled={saving}>
                  <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, saving && styles.disabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText style={styles.primaryButtonText}>Save</ThemedText>
                  )}
                </Pressable>
              </View>
            </ScrollView>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>

      {pickerOpen && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
            <Pressable style={styles.pickerSheetWrapper} onPress={(e) => e.stopPropagation()}>
              <ThemedView style={styles.modalSheet}>
                <SafeAreaView edges={['bottom']}>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Allergy
                </ThemedText>
                <ScrollView style={styles.pickerList}>
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
                <Pressable style={styles.closeButton} onPress={() => setPickerOpen(false)}>
                  <ThemedText style={styles.closeButtonText}>Close</ThemedText>
                </Pressable>
                </SafeAreaView>
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Modal>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
      {children}
    </ThemedText>
  );
}

function PickerRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.pickerRow} onPress={onPress}>
      <ThemedText style={selected ? styles.pickerRowSelected : undefined}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addButton: {
    borderWidth: 1,
    borderColor: Brand.deepBlue,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  addButtonText: { color: Brand.deepBlue, fontWeight: '700' },
  loading: { marginVertical: Spacing.three },
  error: { color: Brand.danger, marginBottom: Spacing.two },
  list: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
  },
  rowMain: { flex: 1, gap: 2 },
  rowActions: { flexDirection: 'row', gap: Spacing.three },
  editLink: { color: Brand.deepBlue, fontWeight: '600' },
  danger: { color: Brand.danger, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheetWrapper: { maxHeight: '90%' },
  pickerSheetWrapper: { maxHeight: '70%' },
  modalSheet: { borderTopLeftRadius: Spacing.four, borderTopRightRadius: Spacing.four, padding: Spacing.four },
  modalTitle: { fontSize: 18, lineHeight: 24, marginBottom: Spacing.three },
  pickerList: { maxHeight: 320 },
  pickerRow: { paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Brand.border },
  pickerRowSelected: { fontWeight: '700', color: Brand.deepBlue },
  closeButton: { marginTop: Spacing.three, alignItems: 'center', paddingVertical: Spacing.two },
  closeButtonText: { fontWeight: '600', color: Brand.deepBlue },
  fieldLabel: { marginTop: Spacing.three, marginBottom: Spacing.one },
  input: {
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  selectField: { justifyContent: 'center' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  chipSelected: { borderColor: Brand.deepBlue, backgroundColor: Brand.bg },
  chipTextSelected: { color: Brand.deepBlue, fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
  },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  primaryButton: {
    flex: 1,
    backgroundColor: Brand.deepBlue,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  secondaryButtonText: { fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
