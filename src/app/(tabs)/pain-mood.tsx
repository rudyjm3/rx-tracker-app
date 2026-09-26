import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useActiveProfile } from '@/lib/active-profile';
import { confirmDestructive } from '@/lib/confirm';
import {
  createMoodTag,
  createStandaloneLog,
  deleteMoodTag,
  getMoodTags,
  getStandaloneHistory,
  levelColor,
  renameMoodTag,
  setMoodTagAlwaysShow,
  type StandaloneHistoryEntry,
} from '@/lib/pain-mood';
import type { MoodTag } from '@/lib/types/medications';

const MIN_LEVEL = 1;
const MAX_LEVEL = 10;
const DEFAULT_LEVEL = 5;

export default function PainMoodScreen() {
  const theme = useTheme();
  const { activeProfileId, familyProfiles } = useActiveProfile();
  const [trackPain, setTrackPain] = useState(false);
  const [trackMood, setTrackMood] = useState(false);
  const [painLevel, setPainLevel] = useState(DEFAULT_LEVEL);
  const [moodLevel, setMoodLevel] = useState(DEFAULT_LEVEL);
  const [note, setNote] = useState('');
  const [moodTags, setMoodTags] = useState<MoodTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);

  const [history, setHistory] = useState<StandaloneHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // See the Dashboard's identical guard: bumped on every load() call so a
  // slower, stale response (e.g. from a profile that's no longer selected)
  // can't overwrite state a newer call already set.
  const requestIdRef = useRef(0);

  // Always holds the latest activeProfileId, independent of any async
  // closure's stale snapshot of it — read by handleSave below to detect a
  // profile switch that happened mid-save.
  const activeProfileIdRef = useRef(activeProfileId);
  useEffect(() => {
    activeProfileIdRef.current = activeProfileId;
  }, [activeProfileId]);

  const load = useCallback(async (isRefresh = false) => {
    const requestId = ++requestIdRef.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const [tags, entries] = await Promise.all([
        getMoodTags(),
        getStandaloneHistory(50, activeProfileId),
      ]);
      if (requestIdRef.current !== requestId) return;
      setMoodTags(tags);
      setHistory(entries);
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      setLoadError(e instanceof Error ? e.message : 'Failed to load pain & mood data');
    } finally {
      // Unlike the data above, the loading/refreshing flags aren't scoped
      // to whichever request is newest — each call only ever owns the one
      // flag matching its own isRefresh, so it must always release that
      // flag itself. Gating this on requestId (like the data updates
      // above) would leave a stale refresh's flag stuck on forever once a
      // newer call — e.g. from a profile switch — became current.
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [activeProfileId]);

  // load() (and this callback) changes identity whenever activeProfileId
  // changes, and useFocusEffect re-invokes its callback on identity
  // changes while the screen is already focused — so switching profiles
  // from the chip row here reloads immediately, not just the next time
  // this screen regains focus.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetForm() {
    setTrackPain(false);
    setTrackMood(false);
    setPainLevel(DEFAULT_LEVEL);
    setMoodLevel(DEFAULT_LEVEL);
    setNote('');
    setSelectedTagIds(new Set());
  }

  async function handleSave() {
    setFormError(null);

    if (!trackPain && !trackMood) {
      setFormError('Log at least a pain level or a mood level.');
      return;
    }

    const tagNames = moodTags
      .filter((t) => selectedTagIds.has(t.id))
      .map((t) => t.name)
      .join(',');

    const profileIdAtSave = activeProfileId;
    setSaving(true);
    try {
      await createStandaloneLog({
        logType: trackPain && trackMood ? 'both' : trackPain ? 'pain' : 'mood',
        painLevel: trackPain ? painLevel : null,
        moodLevel: trackMood ? moodLevel : null,
        note: note.trim(),
        tags: trackMood ? tagNames : '',
        profileId: profileIdAtSave,
      });
      resetForm();
      // Skip the reload if the active profile changed while the insert was
      // in flight — that switch already triggered its own load() for the
      // new profile, and this stale one (still scoped to profileIdAtSave)
      // would otherwise win the requestId race and show the old profile's
      // history under the new profile's chip.
      if (activeProfileIdRef.current === profileIdAtSave) {
        await load(true);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          <ThemedText type="title" style={styles.title}>
            Pain & Mood
          </ThemedText>

          {familyProfiles.length > 0 && <ProfileSwitcher />}

          {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

          <View style={styles.switchRow}>
            <ThemedText>Log pain</ThemedText>
            <Switch value={trackPain} onValueChange={setTrackPain} />
          </View>
          {trackPain && (
            <LevelStepper
              label="Pain level"
              value={painLevel}
              onChange={setPainLevel}
              color={levelColor('pain', painLevel)}
            />
          )}

          <View style={styles.switchRow}>
            <ThemedText>Log mood</ThemedText>
            <Switch value={trackMood} onValueChange={setTrackMood} />
          </View>
          {trackMood && (
            <>
              <LevelStepper
                label="Mood level"
                value={moodLevel}
                onChange={setMoodLevel}
                color={levelColor('mood', moodLevel)}
              />
              <View style={styles.tagsHeaderRow}>
                <FieldLabel>Tags</FieldLabel>
                <Pressable onPress={() => setManageTagsOpen(true)}>
                  <ThemedText type="small" style={styles.manageTagsLink}>
                    Manage tags
                  </ThemedText>
                </Pressable>
              </View>
              <View style={styles.tagList}>
                {moodTags.map((tag) => {
                  const selected = selectedTagIds.has(tag.id);
                  return (
                    <Pressable
                      key={tag.id}
                      style={[styles.tagChip, selected && styles.tagChipSelected]}
                      onPress={() => toggleTag(tag.id)}
                    >
                      <ThemedText type="small" style={selected ? styles.tagTextSelected : styles.tagText}>
                        {tag.name}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <FieldLabel>Note (optional)</FieldLabel>
          <TextInput
            style={[styles.input, styles.multiline, { color: theme.text }]}
            value={note}
            onChangeText={setNote}
            placeholder="How are you feeling?"
            placeholderTextColor={theme.textSecondary}
            multiline
          />

          <Pressable
            style={[styles.primaryButton, (saving || (!trackPain && !trackMood)) && styles.disabled]}
            onPress={handleSave}
            disabled={saving || (!trackPain && !trackMood)}
          >
            {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.primaryButtonText}>Save entry</ThemedText>}
          </Pressable>

          <ThemedText type="smallBold" style={styles.sectionTitle}>
            Recent entries
          </ThemedText>

          {loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

          {loading ? (
            <ActivityIndicator style={styles.historyLoading} />
          ) : history.length === 0 ? (
            <ThemedText themeColor="textSecondary">No entries yet. Log a pain or mood level above.</ThemedText>
          ) : (
            history.map((entry) => <HistoryCard key={entry.id} entry={entry} />)
          )}
        </ScrollView>
      </SafeAreaView>

      {manageTagsOpen && (
        <ManageTagsSheet
          tags={moodTags}
          onClose={() => setManageTagsOpen(false)}
          onChanged={() => load()}
        />
      )}
    </ThemedView>
  );
}

function ManageTagsSheet({
  tags,
  onClose,
  onChanged,
}: {
  tags: MoodTag[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [localTags, setLocalTags] = useState(tags);
  const [newTagName, setNewTagName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const name = newTagName.trim();
    if (!name) return;
    setError(null);
    setAdding(true);
    try {
      const tag = await createMoodTag(name);
      setLocalTags((prev) => [...prev, tag]);
      setNewTagName('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add tag");
    } finally {
      setAdding(false);
    }
  }

  function startEditing(tag: MoodTag) {
    setEditingId(tag.id);
    setEditingName(tag.name);
  }

  async function handleRename(id: string) {
    const name = editingName.trim();
    if (!name) return;
    setError(null);
    setBusyId(id);
    try {
      await renameMoodTag(id, name);
      setLocalTags((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
      setEditingId(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't rename tag");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleAlwaysShow(tag: MoodTag) {
    setError(null);
    setBusyId(tag.id);
    try {
      await setMoodTagAlwaysShow(tag.id, !tag.always_show);
      setLocalTags((prev) =>
        prev.map((t) => (t.id === tag.id ? { ...t, always_show: !t.always_show } : t)),
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update tag");
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(tag: MoodTag) {
    confirmDestructive(
      'Delete this tag?',
      `"${tag.name}" will be removed from the tag picker.`,
      'Delete',
      async () => {
        setError(null);
        setBusyId(tag.id);
        try {
          await deleteMoodTag(tag.id);
          setLocalTags((prev) => prev.filter((t) => t.id !== tag.id));
          onChanged();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't delete tag");
        } finally {
          setBusyId(null);
        }
      },
    );
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheetWrapper} onPress={(e) => e.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <SafeAreaView edges={['bottom']}>
              <ThemedText type="subtitle" style={styles.modalTitle}>
                Manage tags
              </ThemedText>

              {error && <ThemedText style={styles.error}>{error}</ThemedText>}

              <ScrollView style={styles.manageTagsList}>
                {localTags.map((tag) => (
                  <View key={tag.id} style={styles.manageTagRow}>
                    {editingId === tag.id ? (
                      <TextInput
                        style={[styles.input, styles.manageTagInput]}
                        value={editingName}
                        onChangeText={setEditingName}
                        autoFocus
                        onSubmitEditing={() => handleRename(tag.id)}
                      />
                    ) : (
                      <Pressable style={styles.manageTagNameButton} onPress={() => startEditing(tag)}>
                        <ThemedText>{tag.name}</ThemedText>
                      </Pressable>
                    )}

                    <View style={styles.manageTagActions}>
                      <View style={styles.manageTagAlwaysShow}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Always show
                        </ThemedText>
                        <Switch
                          value={tag.always_show}
                          onValueChange={() => handleToggleAlwaysShow(tag)}
                          disabled={busyId === tag.id}
                        />
                      </View>
                      {editingId === tag.id ? (
                        <Pressable
                          onPress={() => handleRename(tag.id)}
                          disabled={busyId === tag.id}
                          hitSlop={8}
                        >
                          <ThemedText style={styles.manageTagSaveText}>Save</ThemedText>
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => confirmDelete(tag)} disabled={busyId === tag.id} hitSlop={8}>
                          <ThemedText style={styles.deleteText}>Delete</ThemedText>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.addTagRow}>
                <TextInput
                  style={[styles.input, styles.addTagInput]}
                  value={newTagName}
                  onChangeText={setNewTagName}
                  placeholder="New tag name"
                  onSubmitEditing={handleAdd}
                />
                <Pressable
                  style={[styles.primaryButton, styles.addTagButton, (adding || !newTagName.trim()) && styles.disabled]}
                  onPress={handleAdd}
                  disabled={adding || !newTagName.trim()}
                >
                  {adding ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.primaryButtonText}>Add</ThemedText>}
                </Pressable>
              </View>

              <Pressable style={styles.closeButton} onPress={onClose}>
                <ThemedText style={styles.closeButtonText}>Done</ThemedText>
              </Pressable>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LevelStepper({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  color: string;
}) {
  return (
    <View style={styles.stepperBlock}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.stepperRow}>
        <Pressable
          style={styles.stepperButton}
          onPress={() => onChange(Math.max(MIN_LEVEL, value - 1))}
          disabled={value <= MIN_LEVEL}
          hitSlop={8}
        >
          <ThemedText style={styles.stepperButtonText}>−</ThemedText>
        </Pressable>
        <View style={[styles.stepperValue, { borderColor: color }]}>
          <ThemedText type="smallBold" style={{ color }}>
            {value}
          </ThemedText>
        </View>
        <Pressable
          style={styles.stepperButton}
          onPress={() => onChange(Math.min(MAX_LEVEL, value + 1))}
          disabled={value >= MAX_LEVEL}
          hitSlop={8}
        >
          <ThemedText style={styles.stepperButtonText}>+</ThemedText>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary">
          out of {MAX_LEVEL}
        </ThemedText>
      </View>
    </View>
  );
}

function HistoryCard({ entry }: { entry: StandaloneHistoryEntry }) {
  return (
    <ThemedView type="backgroundElement" style={styles.historyCard}>
      <View style={styles.historyHeaderRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatLoggedAt(entry.loggedAt)}
        </ThemedText>
        <View style={styles.historyBadges}>
          {entry.painLevel != null && (
            <LevelBadge label="Pain" value={entry.painLevel} color={levelColor('pain', entry.painLevel)} />
          )}
          {entry.moodLevel != null && (
            <LevelBadge label="Mood" value={entry.moodLevel} color={levelColor('mood', entry.moodLevel)} />
          )}
        </View>
      </View>
      {entry.note ? <ThemedText style={styles.historyNote}>{entry.note}</ThemedText> : null}
      {entry.tags.length > 0 && (
        <View style={styles.tagList}>
          {entry.tags.map((tag) => (
            <View key={tag} style={styles.historyTagChip}>
              <ThemedText type="small" themeColor="textSecondary">
                {tag}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </ThemedView>
  );
}

function LevelBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.levelBadge, { backgroundColor: color }]}>
      <ThemedText type="small" style={styles.levelBadgeText}>
        {label} {value}
      </ThemedText>
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

function formatLoggedAt(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.one },
  title: { fontSize: 24, lineHeight: 30, marginBottom: Spacing.half },
  error: { color: Brand.danger, marginVertical: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.three },
  fieldLabel: { marginTop: Spacing.three, marginBottom: Spacing.one },
  stepperBlock: { marginTop: Spacing.one },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Brand.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 20, fontWeight: '600' },
  stepperValue: {
    width: 48,
    height: 40,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  tagChip: {
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  tagChipSelected: { backgroundColor: Brand.deepBlue, borderColor: Brand.deepBlue },
  tagText: { color: Brand.textMuted },
  tagTextSelected: { color: '#ffffff', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: Brand.border, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  primaryButton: { backgroundColor: Brand.deepBlue, borderRadius: BorderRadius.sm, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.four },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  disabled: { opacity: 0.6 },
  sectionTitle: { marginTop: Spacing.five },
  historyLoading: { marginTop: Spacing.three },
  historyCard: { borderRadius: BorderRadius.md, padding: Spacing.three, gap: Spacing.one, marginTop: Spacing.two },
  historyHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  historyBadges: { flexDirection: 'row', gap: Spacing.one },
  levelBadge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  levelBadgeText: { color: '#ffffff', fontWeight: '600' },
  historyNote: { marginTop: Spacing.half },
  historyTagChip: { borderWidth: 1, borderColor: Brand.border, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  tagsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  manageTagsLink: { color: Brand.deepBlue, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheetWrapper: { maxHeight: '85%' },
  modalSheet: { borderTopLeftRadius: Spacing.four, borderTopRightRadius: Spacing.four, padding: Spacing.four },
  modalTitle: { fontSize: 18, lineHeight: 24, marginBottom: Spacing.three },
  manageTagsList: { maxHeight: 360 },
  manageTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.border,
  },
  manageTagNameButton: { flex: 1 },
  manageTagInput: { flex: 1, paddingVertical: Spacing.one },
  manageTagActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  manageTagAlwaysShow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  manageTagSaveText: { color: Brand.deepBlue, fontWeight: '600' },
  deleteText: { color: Brand.danger, fontWeight: '600' },
  addTagRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three, alignItems: 'center' },
  addTagInput: { flex: 1 },
  addTagButton: { marginTop: 0, paddingHorizontal: Spacing.four, minWidth: 72 },
  closeButton: { marginTop: Spacing.three, alignItems: 'center', paddingVertical: Spacing.two },
  closeButtonText: { fontWeight: '600', color: Brand.deepBlue },
});
