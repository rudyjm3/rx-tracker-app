import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { Checkbox, SwitchRow } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { MedName } from '@/components/ui/med-name';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle, SectionTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
import { useActiveProfile } from '@/lib/active-profile';
import { buildReportData, renderReportHtml } from '@/lib/export';
import { wasActiveDuring, type MedicationStatusEventLike } from '@/lib/medication-days';
import { getActiveMedications, getDoseHistory, getInactiveMedications } from '@/lib/medications';
import { useAuth } from '@/lib/supabase/AuthProvider';
import type { Medication } from '@/lib/types/medications';
import { getUserProfile } from '@/lib/user-profile';
import { localDateString } from '@/lib/utils';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return localDateString(d);
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

export default function ExportScreen() {
  const { session } = useAuth();
  const { activeProfileId, activeProfile } = useActiveProfile();

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(localDateString);
  const [includePain, setIncludePain] = useState(true);
  const [includeMood, setIncludeMood] = useState(true);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [statusEventsById, setStatusEventsById] = useState<Map<string, MedicationStatusEventLike[]>>(new Map());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [loadingMedications, setLoadingMedications] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoadingMedications(true);
        try {
          const [active, inactive] = await Promise.all([
            getActiveMedications(activeProfileId),
            getInactiveMedications(activeProfileId),
          ]);
          const all = [...active, ...inactive];
          const histories = await Promise.all(all.map((m) => getDoseHistory(m.id)));
          if (cancelled) return;
          setMedications(all);
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
    }, [activeProfileId]),
  );

  function toggleMedication(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Only medications in use on at least one day of the reporting period
  // can appear in the report, so only those are offered here.
  const periodMedications = useMemo(
    () =>
      // Dates are free-text, so don't filter while one is half-typed.
      !DATE_RE.test(startDate) || !DATE_RE.test(endDate)
        ? medications
        : medications.filter((m) =>
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
  const selectedMedications = periodMedications.filter((m) => !excludedIds.has(m.id));

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const patientName = await resolvePatientName(
        activeProfileId,
        activeProfile?.display_name ?? null,
        session?.user.email,
      );
      const data = await buildReportData({
        profileId: activeProfileId,
        patientName,
        startDate,
        endDate,
        medications: selectedMedications,
        includePain,
        includeMood,
      });
      const html = renderReportHtml(data);
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      } else if (Platform.OS === 'web') {
        // expo-sharing has no native share sheet on web (it's built on the
        // Web Share API, which has very limited browser support for
        // files) — isAvailableAsync() commonly returns false there, which
        // would otherwise discard the generated PDF silently even though
        // it was created successfully. printToFileAsync's web `uri` is a
        // directly downloadable blob/data URL, so trigger a normal browser
        // download instead of the native share sheet.
        const link = document.createElement('a');
        link.href = uri;
        link.download = `RxTracker-report-${startDate}-to-${endDate}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        setError('Sharing is not available on this device — the report was generated but could not be sent.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  }

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
          <View className="flex-1">
            <Field
              label="From"
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View className="flex-1">
            <Field
              label="To"
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
      </Card>

      <Card className="gap-3 p-4">
        <SectionTitle>Doctor Visit Report</SectionTitle>
        <Text muted className="text-sm">
          Compiles your medications, adherence, dose changes, side effects, allergies, and (optionally) pain/mood trends
          into one PDF you can share or print for a doctor visit.
        </Text>

        <View>
          <SwitchRow label="Include Pain tracking" value={includePain} onValueChange={setIncludePain} />
          <SwitchRow label="Include Mood & Wellbeing tracking" value={includeMood} onValueChange={setIncludeMood} />
        </View>

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
                    <MedName
                      className="flex-1 text-sm font-medium"
                      name={`${med.name}`}
                      dose={`${med.dose ?? ''}${!med.active ? ' (inactive)' : ''}`.trim()}
                    />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Button
          label={generating ? 'Generating PDF…' : 'Generate & share PDF'}
          loading={generating}
          disabled={loadingMedications}
          onPress={handleGenerate}
          className="w-full"
        />
      </Card>
    </Screen>
  );
}
