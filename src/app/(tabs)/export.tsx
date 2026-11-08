import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { ReportSummary } from '@/components/export/report-summary';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { Checkbox, SwitchRow } from '@/components/ui/checkbox';
import { MedName } from '@/components/ui/med-name';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle, SectionTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
import { useActiveProfile } from '@/lib/active-profile';
import { buildReportData, type ReportData } from '@/lib/export';
import { activeDaysOnMedication, wasActiveDuring, type MedicationStatusEventLike } from '@/lib/medication-days';
import { getActiveMedications, getDoseHistory, getInactiveMedications } from '@/lib/medications';
import { medicationTracksMood, medicationTracksPain } from '@/lib/pain-mood';
import { renderReportHtml } from '@/lib/report-html';
import { useAuth } from '@/lib/supabase/AuthProvider';
import type { Medication } from '@/lib/types/medications';
import { getUserProfile } from '@/lib/user-profile';
import { formatPrescribedDose, formatShortDate, localDateString } from '@/lib/utils';

// A4 at 72 PPI — the web report is A4 (expo-print defaults to US Letter).
const A4_WIDTH = 595;
const A4_HEIGHT = 842;
// Rebuilding the preview runs several queries; wait for the user to stop
// toggling before refetching.
const PREVIEW_DEBOUNCE_MS = 400;

function defaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return localDateString(d);
}

// "MM-DD-YYYY", for the PDF filename (matches web's download name).
function filenameDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}-${d}-${y}`;
}

async function resolvePatientName(
  activeProfileId: string | null,
  activeProfileName: string | null,
  userEmail: string | null | undefined,
): Promise<string> {
  if (activeProfileId !== null) return activeProfileName ?? '';
  const profile = await getUserProfile();
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
  return fullName || profile?.display_name || userEmail?.split('@')[0] || '';
}

// Tappable date field that opens the native date picker. The Android picker
// reports the chosen day as UTC midnight, so it's read back with UTC getters,
// and the current value is handed to it as UTC midnight of that same day.
function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: string;
  maximumDate?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className="flex-1 gap-1.5">
      <Text className="text-sm font-semibold">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatShortDate(value)}. Change date`}
        onPress={() => setOpen(true)}
        className="min-h-11 justify-center rounded-control border border-brand-border bg-white px-3 py-2.5 active:bg-brand-bg dark:border-night-border dark:bg-night-card">
        <Text className="text-sm">{formatShortDate(value)}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={new Date(`${value}T00:00:00Z`)}
          mode="date"
          minimumDate={minimumDate ? new Date(`${minimumDate}T00:00:00`) : undefined}
          maximumDate={maximumDate ? new Date(`${maximumDate}T00:00:00`) : undefined}
          onChange={(event, date) => {
            setOpen(false);
            if (event.type === 'set' && date) onChange(date.toISOString().slice(0, 10));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}

function TrackedMedsPanel({
  title,
  emptyLabel,
  medications,
  daysFor,
}: {
  title: string;
  emptyLabel: string;
  medications: Medication[];
  daysFor: (med: Medication) => number | null;
}) {
  return (
    <View className="rounded-control border border-brand-border p-3 dark:border-night-border">
      <Text className="mb-2 text-sm font-semibold text-brand-navy dark:text-white">{title}</Text>
      {medications.length === 0 ? (
        <Text muted className="text-sm">
          {emptyLabel}
        </Text>
      ) : (
        <View className="gap-1.5">
          {medications.map((med) => (
            <View
              key={med.id}
              className="flex-row items-center justify-between gap-3 rounded-control bg-brand-bg px-3 py-2 dark:bg-night-bg">
              <MedName className="flex-1 text-sm" name={med.name} dose={formatPrescribedDose(med)} />
              <Text muted className="text-sm">
                {daysFor(med) ?? '—'} days on medication
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ExportScreen() {
  const { session } = useAuth();
  const { activeProfileId, activeProfile } = useActiveProfile();
  const activeProfileName = activeProfile?.display_name ?? null;
  const userEmail = session?.user.email;

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(localDateString);
  const [includePain, setIncludePain] = useState(true);
  const [includeMood, setIncludeMood] = useState(true);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [statusEventsById, setStatusEventsById] = useState<Map<string, MedicationStatusEventLike[]>>(new Map());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [patientName, setPatientName] = useState('');
  const [loadingMedications, setLoadingMedications] = useState(true);
  // The preview's data, tagged with the inputs it was built from.
  const [built, setBuilt] = useState<{ key: string; data: ReportData } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sharedUri, setSharedUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoadingMedications(true);
        try {
          const [active, inactive, name] = await Promise.all([
            getActiveMedications(activeProfileId),
            getInactiveMedications(activeProfileId),
            resolvePatientName(activeProfileId, activeProfileName, userEmail),
          ]);
          const all = [...active, ...inactive];
          const histories = await Promise.all(all.map((m) => getDoseHistory(m.id)));
          if (cancelled) return;
          setMedications(all);
          setPatientName(name);
          setStatusEventsById(
            new Map(
              all.map((m, i) => [
                m.id,
                histories[i].flatMap((e) => (e.type === 'status_event' ? [e.data] : [])),
              ]),
            ),
          );
          setExcludedIds(new Set());
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load medications');
        } finally {
          if (!cancelled) setLoadingMedications(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeProfileId, activeProfileName, userEmail]),
  );

  // Only medications in use on at least one day of the reporting period
  // can appear in the report, so only those are offered here.
  const periodMedications = useMemo(
    () =>
      medications.filter((m) =>
        wasActiveDuring(
          m.start_date ?? m.created_at.slice(0, 10),
          statusEventsById.get(m.id) ?? [],
          startDate,
          endDate,
          m.end_date,
        ),
      ),
    [medications, statusEventsById, startDate, endDate],
  );
  const selectedMedications = useMemo(
    () => periodMedications.filter((m) => !excludedIds.has(m.id)),
    [periodMedications, excludedIds],
  );
  const painTrackedMeds = includePain ? selectedMedications.filter(medicationTracksPain) : [];
  const moodTrackedMeds = includeMood ? selectedMedications.filter(medicationTracksMood) : [];
  const daysOnMedicationFor = (med: Medication) =>
    activeDaysOnMedication(med.start_date, statusEventsById.get(med.id) ?? [], endDate);

  // Live preview: rebuild the report whenever its inputs change. The
  // preview is stale (dimmed) until a build for the current inputs lands.
  const inputsKey = JSON.stringify([
    activeProfileId,
    patientName,
    startDate,
    endDate,
    selectedMedications.map((m) => m.id),
    includePain,
    includeMood,
  ]);
  const report = built?.data ?? null;
  const reportLoading = loadingMedications || built?.key !== inputsKey;

  useEffect(() => {
    if (loadingMedications) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await buildReportData({
          profileId: activeProfileId,
          patientName,
          startDate,
          endDate,
          medications: selectedMedications,
          includePain,
          includeMood,
        });
        if (!cancelled) {
          setBuilt({ key: inputsKey, data });
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to build report');
          // Stop showing the preview as "updating" for inputs that failed.
          setBuilt((prev) => (prev ? { ...prev, key: inputsKey } : prev));
        }
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // inputsKey captures every input the build reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMedications, inputsKey]);

  function toggleMedication(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sharePdf(uri: string) {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Share Doctor Visit Report',
      });
    } else if (Platform.OS === 'web') {
      // expo-sharing has no file share sheet on most browsers; download instead.
      const link = document.createElement('a');
      link.href = uri;
      link.download = `RxTracker-Doctor-Visit-Report-${filenameDate(startDate)}-to-${filenameDate(endDate)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      throw new Error('Sharing is not available on this device — the report was generated but could not be sent.');
    }
  }

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      // Reuse the preview's data when it's current; otherwise build fresh.
      const data =
        report && !reportLoading
          ? { ...report, generatedAt: new Date().toLocaleString() }
          : await buildReportData({
              profileId: activeProfileId,
              patientName,
              startDate,
              endDate,
              medications: selectedMedications,
              includePain,
              includeMood,
            });
      const { uri } = await Print.printToFileAsync({
        html: renderReportHtml(data),
        width: A4_WIDTH,
        height: A4_HEIGHT,
      });
      let shareUri = uri;
      if (Platform.OS !== 'web') {
        // printToFileAsync names the file with a random id; give it the
        // same readable name the web download uses.
        const named = new File(
          Paths.cache,
          `RxTracker-Doctor-Visit-Report-${filenameDate(startDate)}-to-${filenameDate(endDate)}.pdf`,
        );
        await new File(uri).copy(named, { overwrite: true });
        shareUri = named.uri;
      }
      await sharePdf(shareUri);
      setSharedUri(shareUri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  }

  const today = localDateString();

  return (
    <Screen keyboardShouldPersistTaps="handled" contentClassName="gap-6">
      <ScreenTitle>Export</ScreenTitle>

      {error ? <Callout kind="danger">{error}</Callout> : null}

      <Card className="gap-3 p-4">
        <SectionTitle>Reporting Period</SectionTitle>
        <Text muted className="text-sm">
          Used for the report below.
        </Text>
        <View className="flex-row gap-2">
          <DateField
            label="From"
            value={startDate}
            maximumDate={endDate}
            onChange={(iso) => {
              setStartDate(iso);
              setSharedUri(null);
            }}
          />
          <DateField
            label="To"
            value={endDate}
            minimumDate={startDate}
            maximumDate={today}
            onChange={(iso) => {
              setEndDate(iso);
              setSharedUri(null);
            }}
          />
        </View>
      </Card>

      <Card className="gap-4 p-4">
        <View className="gap-1">
          <SectionTitle>Doctor Visit Report</SectionTitle>
          <Text muted className="text-sm">
            Generate a branded PDF summary of your medication history, adherence, pain trends, side effects, and
            (optionally) mood trends — ready to share with your doctor.
          </Text>
        </View>

        <View>
          <SwitchRow label="Include Pain tracking" value={includePain} onValueChange={setIncludePain} />
          <SwitchRow label="Include Mood & Wellbeing tracking" value={includeMood} onValueChange={setIncludeMood} />
        </View>

        {includePain ? (
          <TrackedMedsPanel
            title="Pain-tracked medications"
            emptyLabel="No pain-tracked medications selected."
            medications={painTrackedMeds}
            daysFor={daysOnMedicationFor}
          />
        ) : null}
        {includeMood ? (
          <TrackedMedsPanel
            title="Mood-tracked medications"
            emptyLabel="No mood-tracked medications selected."
            medications={moodTrackedMeds}
            daysFor={daysOnMedicationFor}
          />
        ) : null}

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-brand-navy dark:text-white">Medications to include</Text>
            <View className="flex-row gap-4">
              <Pressable className="min-h-11 justify-center" onPress={() => setExcludedIds(new Set())} hitSlop={8}>
                <Text className="text-sm font-semibold text-brand-blue dark:text-brand-cyan">Select all</Text>
              </Pressable>
              <Pressable
                className="min-h-11 justify-center"
                onPress={() => setExcludedIds(new Set(periodMedications.map((m) => m.id)))}
                hitSlop={8}>
                <Text className="text-sm font-semibold text-brand-blue dark:text-brand-cyan">Select none</Text>
              </Pressable>
            </View>
          </View>
          {loadingMedications ? (
            <ActivityIndicator className="mt-2" />
          ) : periodMedications.length === 0 ? (
            <Text muted className="text-sm">
              No medications to include for this period.
            </Text>
          ) : (
            <View className="rounded-control border border-brand-border dark:border-night-border">
              {periodMedications.map((med, i) => {
                const selected = !excludedIds.has(med.id);
                return (
                  <Pressable
                    key={med.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    className={`min-h-11 flex-row items-center gap-3 px-3 py-2 ${i > 0 ? 'border-t border-brand-border dark:border-night-border' : ''}`}
                    onPress={() => toggleMedication(med.id)}>
                    <Checkbox checked={selected} />
                    <View className="flex-1 flex-row flex-wrap items-baseline gap-x-1.5">
                      <MedName className="text-sm font-medium" name={med.name} dose={formatPrescribedDose(med)} />
                      {!med.active ? (
                        <Text muted className="text-xs">
                          (inactive)
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Button
          label={generating ? 'Generating PDF…' : 'Generate & Share PDF'}
          loading={generating}
          disabled={loadingMedications}
          onPress={handleGenerate}
          className="w-full"
        />

        {sharedUri && !generating ? (
          <View className="flex-row items-center justify-between gap-3 rounded-control border border-status-success/30 bg-status-success/10 px-4 py-3">
            <Text className="flex-1 text-sm text-status-success dark:text-status-success">Your PDF is ready.</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              className="min-h-11 justify-center"
              onPress={() => sharePdf(sharedUri).catch((e) => setError(e instanceof Error ? e.message : String(e)))}>
              <Text className="text-sm font-semibold text-status-success underline dark:text-status-success">
                Share again
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Card>

      {loadingMedications || (!report && reportLoading) ? (
        <Text muted>Loading report…</Text>
      ) : report ? (
        <View style={{ opacity: reportLoading ? 0.6 : 1 }}>
          <ReportSummary data={report} />
        </View>
      ) : null}
    </Screen>
  );
}
