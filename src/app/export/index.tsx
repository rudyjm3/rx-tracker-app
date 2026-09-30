import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useActiveProfile } from '@/lib/active-profile';
import { buildReportData, renderReportHtml } from '@/lib/export';
import { getActiveMedications, getInactiveMedications } from '@/lib/medications';
import { useAuth } from '@/lib/supabase/AuthProvider';
import type { Medication } from '@/lib/types/medications';
import { getUserProfile } from '@/lib/user-profile';
import { localDateString } from '@/lib/utils';

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
  const theme = useTheme();
  const styles = getStyles(theme);
  const { session } = useAuth();
  const { activeProfileId, activeProfile } = useActiveProfile();

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(localDateString);
  const [includePain, setIncludePain] = useState(true);
  const [includeMood, setIncludeMood] = useState(true);
  const [medications, setMedications] = useState<Medication[]>([]);
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
          if (cancelled) return;
          setMedications([...active, ...inactive]);
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

  const selectedMedications = medications.filter((m) => !excludedIds.has(m.id));

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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
            Compiles your medications, adherence, dose changes, side effects, allergies, and
            (optionally) pain/mood trends into one PDF you can share or print for a doctor visit.
          </ThemedText>

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Reporting period</ThemedText>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <FieldLabel>From</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.dateField}>
                <FieldLabel>To</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.switchRow}>
              <ThemedText type="small">Include pain tracking</ThemedText>
              <Switch
                value={includePain}
                onValueChange={setIncludePain}
                trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
              />
            </View>
            <View style={styles.switchRow}>
              <ThemedText type="small">Include mood tracking</ThemedText>
              <Switch
                value={includeMood}
                onValueChange={setIncludeMood}
                trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
              />
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.medHeaderRow}>
              <ThemedText type="smallBold">Medications to include</ThemedText>
              <View style={styles.medHeaderActions}>
                <Pressable onPress={() => setExcludedIds(new Set())} hitSlop={8}>
                  <ThemedText type="small" style={styles.link}>
                    Select all
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setExcludedIds(new Set(medications.map((m) => m.id)))}
                  hitSlop={8}
                >
                  <ThemedText type="small" style={styles.link}>
                    Select none
                  </ThemedText>
                </Pressable>
              </View>
            </View>
            {loadingMedications ? (
              <ActivityIndicator style={styles.loading} />
            ) : medications.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No medications to include yet.
              </ThemedText>
            ) : (
              <View style={styles.medList}>
                {medications.map((med) => {
                  const selected = !excludedIds.has(med.id);
                  return (
                    <Pressable
                      key={med.id}
                      style={styles.medRow}
                      onPress={() => toggleMedication(med.id)}
                      hitSlop={4}
                    >
                      <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                        {selected && <ThemedText style={styles.checkboxMark}>✓</ThemedText>}
                      </View>
                      <ThemedText type="small" style={styles.medName}>
                        {med.name}
                        {med.dose ? ` — ${med.dose}` : ''}
                        {!med.active ? ' (inactive)' : ''}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ThemedView>

          <Pressable
            style={[styles.primaryButton, generating && styles.disabled]}
            onPress={handleGenerate}
            disabled={generating || loadingMedications}
          >
            {generating ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.primaryButtonText}>Generate &amp; share PDF</ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FieldLabel({ children }: { children: string }) {
  const styles = getStyles(useTheme());
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
      {children}
    </ThemedText>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
    intro: { marginBottom: Spacing.half },
    error: { color: '#E5484D', marginBottom: Spacing.two },
    card: { borderRadius: BorderRadius.md, padding: Spacing.three, gap: Spacing.two },
    fieldLabel: { marginBottom: Spacing.one },
    dateRow: { flexDirection: 'row', gap: Spacing.two },
    dateField: { flex: 1 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.three,
      paddingVertical: Spacing.two,
      fontSize: 16,
      color: theme.text,
      backgroundColor: theme.backgroundElement,
    },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    medHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    medHeaderActions: { flexDirection: 'row', gap: Spacing.three },
    link: { color: theme.accent, fontWeight: '600' },
    loading: { marginTop: Spacing.two },
    medList: { gap: Spacing.two },
    medRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: theme.accent, borderColor: theme.accent },
    checkboxMark: { color: '#ffffff', fontSize: 14, lineHeight: 16, fontWeight: '700' },
    medName: { flex: 1 },
    primaryButton: {
      backgroundColor: theme.accent,
      borderRadius: BorderRadius.sm,
      paddingVertical: Spacing.three,
      alignItems: 'center',
    },
    primaryButtonText: { color: '#ffffff', fontWeight: '600' },
    disabled: { opacity: 0.6 },
  });
}
