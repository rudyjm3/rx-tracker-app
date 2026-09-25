import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
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
import {
  createStandaloneLog,
  getMoodTags,
  getStandaloneHistory,
  levelColor,
  type StandaloneHistoryEntry,
} from '@/lib/pain-mood';
import type { MoodTag } from '@/lib/types/medications';

const MIN_LEVEL = 1;
const MAX_LEVEL = 10;
const DEFAULT_LEVEL = 5;

export default function PainMoodScreen() {
  const [trackPain, setTrackPain] = useState(false);
  const [trackMood, setTrackMood] = useState(false);
  const [painLevel, setPainLevel] = useState(DEFAULT_LEVEL);
  const [moodLevel, setMoodLevel] = useState(DEFAULT_LEVEL);
  const [note, setNote] = useState('');
  const [moodTags, setMoodTags] = useState<MoodTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [history, setHistory] = useState<StandaloneHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const [tags, entries] = await Promise.all([getMoodTags(), getStandaloneHistory(50)]);
      setMoodTags(tags);
      setHistory(entries);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load pain & mood data');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

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

    setSaving(true);
    try {
      await createStandaloneLog({
        logType: trackPain && trackMood ? 'both' : trackPain ? 'pain' : 'mood',
        painLevel: trackPain ? painLevel : null,
        moodLevel: trackMood ? moodLevel : null,
        note: note.trim(),
        tags: trackMood ? tagNames : '',
      });
      resetForm();
      await load(true);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          <ThemedText type="title" style={styles.title}>
            Pain & Mood
          </ThemedText>

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
              <FieldLabel>Tags</FieldLabel>
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
            style={[styles.input, styles.multiline]}
            value={note}
            onChangeText={setNote}
            placeholder="How are you feeling?"
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
    </ThemedView>
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
});
