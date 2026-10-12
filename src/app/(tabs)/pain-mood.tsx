import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { TrendChart } from '@/components/TrendChart';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { SwitchRow } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/field';
import { LevelGrid } from '@/components/ui/level-grid';
import { PillTab, PillTabs } from '@/components/ui/pill-tabs';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle, SectionTitle } from '@/components/ui/screen-title';
import { Sheet } from '@/components/ui/sheet';
import { ScoreBadge } from '@/components/ui/score-badge';
import { TagPill } from '@/components/ui/tag-pill';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { useActiveProfile } from '@/lib/active-profile';
import { getMoodChartScheme, type MoodChartScheme } from '@/lib/app-settings';
import { confirmDestructive } from '@/lib/confirm';
import { getActiveMedications, getInactiveMedications } from '@/lib/medications';
import {
  createMoodTag,
  createStandaloneLog,
  deleteMoodTag,
  deleteStandaloneLog,
  getHistory,
  getMoodTags,
  getTrend,
  medicationTracksMood,
  medicationTracksPain,
  RANGE_OPTIONS,
  rangeDatesForDays,
  renameMoodTag,
  setMoodTagAlwaysShow,
  updateStandaloneLog,
  type RangeDays,
  type StandaloneHistoryEntry,
  type TrendPoint,
  type WellbeingMetric,
} from '@/lib/pain-mood';
import type { Medication, MoodTag } from '@/lib/types/medications';
import { localDateString } from '@/lib/utils';

// `undefined` = merged "All" feed (this tab's default, unlike web's
// MedicationSelector which defaults to "Independent"); `null` = web's
// "Independent" (standalone-only); a string = one medication's dose-linked
// entries only. See lib/pain-mood.ts's getHistory/getTrend doc comments.
type MedicationFilter = string | null | undefined;

const DEFAULT_LEVEL = 5;
const DEFAULT_RANGE_DAYS: RangeDays = 7;

export default function PainMoodScreen() {
  const { activeProfileId } = useActiveProfile();
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
  const [editingEntry, setEditingEntry] = useState<StandaloneHistoryEntry | null>(null);

  const [history, setHistory] = useState<StandaloneHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The More menu opens this screen as "Pain Tracking" (?metric=pain) or
  // "Mood & Wellbeing" (?metric=mood).
  const { metric: metricParam } = useLocalSearchParams<{ metric?: string }>();
  const [trendMetric, setTrendMetric] = useState<WellbeingMetric>(metricParam === 'mood' ? 'mood' : 'pain');
  // This tab stays mounted, so follow the param when it changes (adjusting
  // state during render rather than in an effect).
  const [seenMetricParam, setSeenMetricParam] = useState(metricParam);
  if (metricParam !== seenMetricParam) {
    setSeenMetricParam(metricParam);
    if (metricParam === 'mood' || metricParam === 'pain') setTrendMetric(metricParam);
  }
  const [trendRangeDays, setTrendRangeDays] = useState<RangeDays>(DEFAULT_RANGE_DAYS);
  const [moodChartScheme, setMoodChartSchemeState] = useState<MoodChartScheme>('classic');
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState<string | null>(null);

  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationFilter, setMedicationFilter] = useState<MedicationFilter>(undefined);

  // Medications that can produce dose-linked entries for the metric
  // currently shown — mirrors web's MedicationSelector, which only lists
  // medications tracking the page's own metric.
  const filterableMedications = medications.filter((m) =>
    trendMetric === 'pain' ? medicationTracksPain(m) : medicationTracksMood(m),
  );

  // If the metric toggle changes and the selected medication no longer
  // tracks that metric, fall back to "All" rather than silently querying a
  // filter that can never match — adjusted during render (not an effect)
  // per this codebase's established pattern for props/state-driven resets.
  if (
    typeof medicationFilter === 'string' &&
    !filterableMedications.some((m) => m.id === medicationFilter)
  ) {
    setMedicationFilter(undefined);
  }

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

  // Populated by load() below, keyed by the profile it was resolved for —
  // read by loadTrend so it can skip re-resolving the same profile's
  // medication ids a third time. Deliberately a ref (not state): its only
  // consumer reads it inside an async callback, not during render, so it
  // doesn't need to trigger a re-render or be a hook dependency.
  const medicationIdsRef = useRef<{ profileId?: string | null; ids: string[] }>({
    profileId: undefined,
    ids: [],
  });

  const load = useCallback(async (isRefresh = false) => {
    const requestId = ++requestIdRef.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      // Resolved first (rather than alongside getHistory below) so its ids
      // can be handed to getHistory directly instead of getHistory
      // re-resolving the same profile's medications itself — and cached in
      // medicationIdsRef for loadTrend to reuse too, since active+inactive
      // medications don't otherwise change within one profile's session.
      const [activeMeds, inactiveMeds] = await Promise.all([
        getActiveMedications(activeProfileId),
        getInactiveMedications(activeProfileId),
      ]);
      if (requestIdRef.current !== requestId) return;
      const allMeds = [...activeMeds, ...inactiveMeds];
      const medicationIds = allMeds.map((m) => m.id);
      medicationIdsRef.current = { profileId: activeProfileId, ids: medicationIds };

      const [tags, entries, scheme] = await Promise.all([
        getMoodTags(),
        getHistory(50, activeProfileId, medicationFilter, medicationIds),
        getMoodChartScheme(),
      ]);
      if (requestIdRef.current !== requestId) return;
      setMoodTags(tags);
      setHistory(entries);
      setMoodChartSchemeState(scheme);
      setMedications(allMeds);
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
  }, [activeProfileId, medicationFilter]);

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

  // Separate requestId guard from `load` above — the trend query is keyed
  // off metric/range as well as profile, and shouldn't be gated by (or
  // gate) the history/tags load's own race guard.
  const trendRequestIdRef = useRef(0);

  const loadTrend = useCallback(async () => {
    const requestId = ++trendRequestIdRef.current;
    setTrendLoading(true);
    setTrendError(null);
    try {
      const { start, end } = rangeDatesForDays(trendRangeDays, localDateString());
      const cachedIds =
        medicationIdsRef.current.profileId === activeProfileId ? medicationIdsRef.current.ids : undefined;
      const points = await getTrend(trendMetric, start, end, activeProfileId, medicationFilter, cachedIds);
      if (trendRequestIdRef.current !== requestId) return;
      setTrendPoints(points);
    } catch (e) {
      if (trendRequestIdRef.current !== requestId) return;
      setTrendError(e instanceof Error ? e.message : 'Failed to load trend data');
      setTrendPoints([]);
    } finally {
      if (trendRequestIdRef.current !== requestId) return;
      setTrendLoading(false);
    }
  }, [activeProfileId, trendMetric, trendRangeDays, medicationFilter]);

  useFocusEffect(
    useCallback(() => {
      loadTrend();
    }, [loadTrend]),
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
        await Promise.all([load(true), loadTrend()]);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      keyboardShouldPersistTaps="handled"
      contentClassName="gap-6"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            load(true);
            loadTrend();
          }}
        />
      }>
      <ScreenTitle>Pain & Mood</ScreenTitle>

      <Card className="gap-3">
        <SectionTitle>Log how you feel</SectionTitle>
        {formError ? <Callout kind="danger">{formError}</Callout> : null}

        <SwitchRow label="Log pain" value={trackPain} onValueChange={setTrackPain} />
        {trackPain ? (
          <LevelBlock label="Pain level" hint="(1 = minimal — 10 = severe)" metric="pain" value={painLevel} onChange={setPainLevel} />
        ) : null}

        <SwitchRow label="Log mood" value={trackMood} onValueChange={setTrackMood} />
        {trackMood ? (
          <>
            <LevelBlock label="Mood level" hint="(1 = very low — 10 = excellent)" metric="mood" value={moodLevel} onChange={setMoodLevel} />
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <FieldLabel>Tags</FieldLabel>
                <Pressable className="min-h-11 justify-center" hitSlop={8} onPress={() => setManageTagsOpen(true)}>
                  <Text className="text-sm font-semibold text-brand-deep-blue dark:text-brand-cyan">Manage tags</Text>
                </Pressable>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {moodTags.map((tag) => (
                  <TagPill key={tag.id} label={tag.name} selected={selectedTagIds.has(tag.id)} onPress={() => toggleTag(tag.id)} />
                ))}
              </View>
            </View>
          </>
        ) : null}

        <View className="gap-1">
          <FieldLabel>Note (optional)</FieldLabel>
          <Input
            className="min-h-20 py-2"
            style={{ textAlignVertical: 'top' }}
            value={note}
            onChangeText={setNote}
            placeholder="How are you feeling?"
            multiline
          />
        </View>

        <Button
          label={saving ? 'Saving…' : 'Save entry'}
          loading={saving}
          disabled={!trackPain && !trackMood}
          onPress={handleSave}
          className="w-full"
        />
      </Card>

      <View className="gap-3">
        <SectionTitle>Trend</SectionTitle>

        <PillTabs
          tabs={[
            { value: 'pain', label: 'Pain' },
            { value: 'mood', label: 'Mood' },
          ]}
          value={trendMetric}
          onChange={setTrendMetric}
        />

        <View className="flex-row flex-wrap gap-2">
          <PillTab label="All" active={medicationFilter === undefined} onPress={() => setMedicationFilter(undefined)} />
          <PillTab label="Independent" active={medicationFilter === null} onPress={() => setMedicationFilter(null)} />
          {filterableMedications.map((med) => (
            <PillTab key={med.id} label={med.name} active={medicationFilter === med.id} onPress={() => setMedicationFilter(med.id)} />
          ))}
        </View>

        <PillTabs
          variant="range"
          tabs={RANGE_OPTIONS.map((opt) => ({ value: String(opt.days), label: opt.label }))}
          value={String(trendRangeDays)}
          onChange={(v) => setTrendRangeDays(Number(v) as RangeDays)}
        />

        {trendError ? <Text className="text-sm text-status-danger dark:text-status-danger">{trendError}</Text> : null}

        <Card className="p-3">
          {trendLoading ? (
            <ActivityIndicator className="my-8" />
          ) : (
            <TrendChart metric={trendMetric} points={trendPoints} rangeDays={trendRangeDays} moodChartScheme={moodChartScheme} />
          )}
        </Card>
      </View>

      <View className="gap-3">
        <SectionTitle>Recent entries</SectionTitle>

        {loadError ? <Text className="text-sm text-status-danger dark:text-status-danger">{loadError}</Text> : null}

        {loading ? (
          <ActivityIndicator className="my-4" />
        ) : history.length === 0 ? (
          <Text muted className="text-sm">
            No entries yet. Log a pain or mood level above.
          </Text>
        ) : (
          history.map((entry) => <HistoryCard key={entry.id} entry={entry} onEdit={() => setEditingEntry(entry)} />)
        )}
      </View>

      {manageTagsOpen ? <ManageTagsSheet tags={moodTags} onClose={() => setManageTagsOpen(false)} onChanged={() => load()} /> : null}

      {editingEntry ? (
        <EditEntrySheet
          entry={editingEntry}
          moodTags={moodTags}
          onClose={() => setEditingEntry(null)}
          onSaved={async () => {
            setEditingEntry(null);
            await Promise.all([load(true), loadTrend()]);
          }}
          onDeleted={async () => {
            setEditingEntry(null);
            await Promise.all([load(true), loadTrend()]);
          }}
        />
      ) : null}
    </Screen>
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

  // Rows: radius 10, border, p-8 (DESIGN.md 9.20).
  return (
    <Sheet onClose={onClose}>
      <Text className="mb-3 text-lg font-bold text-brand-navy dark:text-white">Manage tags</Text>

      {error ? <Text className="mb-2 text-sm text-status-danger dark:text-status-danger">{error}</Text> : null}

      <ScrollView className="max-h-[360px]">
        <View className="gap-2">
          {localTags.length === 0 ? (
            <Text muted className="text-sm">
              No tags yet.
            </Text>
          ) : null}
          {localTags.map((tag) => (
            <View key={tag.id} className="flex-row items-center justify-between gap-2 rounded-control border border-brand-border p-2 dark:border-night-border">
              {editingId === tag.id ? (
                <Input
                  className="flex-1 py-1"
                  value={editingName}
                  onChangeText={setEditingName}
                  autoFocus
                  onSubmitEditing={() => handleRename(tag.id)}
                />
              ) : (
                <Pressable className="min-h-11 flex-1 justify-center" onPress={() => startEditing(tag)}>
                  <Text className="text-sm">{tag.name}</Text>
                </Pressable>
              )}

              <View className="flex-row items-center gap-3">
                <SwitchRow
                  className="py-0"
                  label="Always show"
                  value={tag.always_show}
                  onValueChange={() => handleToggleAlwaysShow(tag)}
                  disabled={busyId === tag.id}
                />
                {editingId === tag.id ? (
                  <Pressable className="min-h-11 justify-center" onPress={() => handleRename(tag.id)} disabled={busyId === tag.id} hitSlop={8}>
                    <Text className="text-sm font-semibold text-brand-deep-blue dark:text-brand-cyan">Save</Text>
                  </Pressable>
                ) : (
                  <Pressable className="min-h-11 justify-center" onPress={() => confirmDelete(tag)} disabled={busyId === tag.id} hitSlop={8}>
                    <Text className="text-sm font-semibold text-status-danger dark:text-status-danger">Delete</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="mt-3 flex-row items-center gap-2">
        <Input className="flex-1" value={newTagName} onChangeText={setNewTagName} placeholder="New tag name" onSubmitEditing={handleAdd} />
        <Button label="Add" loading={adding} disabled={!newTagName.trim()} onPress={handleAdd} className="min-w-[72px]" />
      </View>

      <Button label="Done" variant="ghost" className="mt-3" onPress={onClose} />
    </Sheet>
  );
}

function EditEntrySheet({
  entry,
  moodTags,
  onClose,
  onSaved,
  onDeleted,
}: {
  entry: StandaloneHistoryEntry;
  moodTags: MoodTag[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [trackPain, setTrackPain] = useState(entry.painLevel != null);
  const [trackMood, setTrackMood] = useState(entry.moodLevel != null);
  const [painLevel, setPainLevel] = useState(entry.painLevel ?? DEFAULT_LEVEL);
  const [moodLevel, setMoodLevel] = useState(entry.moodLevel ?? DEFAULT_LEVEL);
  const [note, setNote] = useState(entry.note);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    () => new Set(moodTags.filter((t) => entry.tags.includes(t.name)).map((t) => t.id)),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      await updateStandaloneLog(entry.id, {
        logType: trackPain && trackMood ? 'both' : trackPain ? 'pain' : 'mood',
        painLevel: trackPain ? painLevel : null,
        moodLevel: trackMood ? moodLevel : null,
        note: note.trim(),
        tags: trackMood ? tagNames : '',
      });
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save changes');
      setSaving(false);
    }
  }

  function handleDelete() {
    confirmDestructive('Delete this entry?', undefined, 'Delete', async () => {
      setFormError(null);
      setDeleting(true);
      try {
        await deleteStandaloneLog(entry.id);
        onDeleted();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Couldn't delete entry");
        setDeleting(false);
      }
    });
  }

  return (
    <Sheet onClose={onClose} dismissible={!saving && !deleting}>
      <ScrollView keyboardShouldPersistTaps="handled" className="max-h-[560px]">
        <Text className="mb-3 text-lg font-bold text-brand-navy dark:text-white">Edit entry</Text>

        {formError ? <Callout kind="danger" className="mb-3">{formError}</Callout> : null}

        <View className="gap-3">
          <SwitchRow label="Log pain" value={trackPain} onValueChange={setTrackPain} />
          {trackPain ? (
            <LevelBlock label="Pain level" hint="(1 = minimal — 10 = severe)" metric="pain" value={painLevel} onChange={setPainLevel} />
          ) : null}

          <SwitchRow label="Log mood" value={trackMood} onValueChange={setTrackMood} />
          {trackMood ? (
            <>
              <LevelBlock label="Mood level" hint="(1 = very low — 10 = excellent)" metric="mood" value={moodLevel} onChange={setMoodLevel} />
              <View className="gap-2">
                <FieldLabel>Tags</FieldLabel>
                <View className="flex-row flex-wrap gap-1.5">
                  {moodTags.map((tag) => (
                    <TagPill key={tag.id} label={tag.name} selected={selectedTagIds.has(tag.id)} onPress={() => toggleTag(tag.id)} />
                  ))}
                </View>
              </View>
            </>
          ) : null}

          <View className="gap-1">
            <FieldLabel>Note (optional)</FieldLabel>
            <Input
              className="min-h-20 py-2"
              style={{ textAlignVertical: 'top' }}
              value={note}
              onChangeText={setNote}
              placeholder="How are you feeling?"
              multiline
            />
          </View>
        </View>

        <View className="mt-4 flex-row gap-2">
          <Button label="Cancel" variant="ghost" className="flex-1" onPress={onClose} disabled={saving || deleting} />
          <Button
            label={saving ? 'Saving…' : 'Save'}
            className="flex-1"
            loading={saving}
            disabled={deleting || (!trackPain && !trackMood)}
            onPress={handleSave}
          />
        </View>

        <Pressable onPress={handleDelete} disabled={saving || deleting} className="mt-2 min-h-11 items-center justify-center">
          <Text className="text-sm font-semibold text-status-danger dark:text-status-danger">{deleting ? 'Deleting…' : 'Delete entry'}</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

// Level picker block: label, hint and the 1–10 grid (DESIGN.md 6.3 / 9.1).
function LevelBlock({
  label,
  hint,
  metric,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  metric: WellbeingMetric;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium">
        {label}{' '}
        <Text muted className="text-xs font-normal">
          {hint}
        </Text>
      </Text>
      <LevelGrid metric={metric} value={value} onChange={onChange} />
    </View>
  );
}

function HistoryCard({ entry, onEdit }: { entry: StandaloneHistoryEntry; onEdit: () => void }) {
  return (
    <Card className="gap-1.5 p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text muted className="text-xs font-semibold">
          {formatLoggedAt(entry.loggedAt)}
        </Text>
        <View className="flex-row gap-1">
          {entry.painLevel != null ? <ScoreBadge type="pain" level={entry.painLevel} /> : null}
          {entry.moodLevel != null ? <ScoreBadge type="mood" level={entry.moodLevel} /> : null}
        </View>
      </View>
      {entry.note ? <Text className="text-sm italic">{entry.note}</Text> : null}
      {entry.tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <View key={tag} className="rounded-full bg-brand-bg px-2 py-0.5 dark:bg-night-selected">
              <Text muted className="text-xs">
                {tag}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {entry.source === 'standalone' ? (
        <Button label="Edit" variant="secondary" size="compact" className="self-start" onPress={onEdit} />
      ) : (
        <Text muted className="text-xs">
          Logged with a dose — edit from the medication&apos;s history
        </Text>
      )}
    </Card>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text className={cn('text-sm font-medium')}>{children}</Text>;
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
