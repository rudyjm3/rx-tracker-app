import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Port of rx-tracker-web's app/help/page.tsx FAQ content, verbatim —
// answers to the same questions, since the underlying features (dose
// reminders/snoozing, inventory/refills, adherence, family profiles) work
// identically on both platforms. The one difference: this app has no
// Export feature yet (see AGENTS.md/task notes), so that FAQ entry is
// left out here rather than describing a screen that doesn't exist.
const FAQS: { question: string; answer: string }[] = [
  {
    question: 'What does RxTracker do?',
    answer:
      "RxTracker helps you keep track of medications, supplements, and OTC products — reminding you when a dose is due, logging whether it was taken, skipped, or missed, and tracking how much supply you have on hand. It also lets you log pain and mood alongside doses and manage a family of profiles from one account.",
  },
  {
    question: 'How do dose reminders and snoozing work?',
    answer:
      "Each medication has one or more scheduled times (fixed times of day, or a repeating interval). When a dose becomes due, it appears on your dashboard's Today's schedule with Take, Skip, and Snooze actions. Snoozing postpones the reminder by your chosen duration (5, 10, 15, or 30 minutes by default — set the default under Settings). If a dose isn't logged within your configured grace period after its scheduled time (also set under Settings, default 60 minutes), it's marked missed automatically.",
  },
  {
    question: 'How does inventory tracking and refill logging work?',
    answer:
      "When inventory tracking is enabled for a medication, RxTracker deducts the dose quantity from your on-hand count each time you log a dose as taken. When you refill a prescription, log the refill from the medication's actions menu with the date and new amount — RxTracker updates your current supply and remembers the refill in that medication's history. If your count ever drifts from reality (a manual pill count, for example), use Adjust Quantity to correct it without recording it as a refill. A medication nearing its low-supply threshold shows a refill reminder on the dashboard.",
  },
  {
    question: 'What does "adherence" mean and how is it calculated?',
    answer:
      "Adherence is the share of your required doses that you actually took, out of every required dose that's already come due (taken, skipped, or missed — a dose still pending later today isn't counted yet either way). As-needed (PRN) medications aren't included, since they have no schedule to be adherent to. A dose taken after your grace period is still counted as \"taken\" for adherence — it's just flagged as late in the dose history.",
  },
  {
    question: 'How do family profiles work?',
    answer:
      "From Settings, add a family member under Manage Family to create a profile for them — a name, relationship, and optional details. Switching to a family member's profile (the chip row at the top of most screens) shows their own medications, schedule, and history separately from yours. Each family member's data (medications, dose logs, allergies, and so on) is kept completely separate from yours and everyone else's.",
  },
];

export default function HelpScreen() {
  const theme = useTheme();
  const styles = getStyles(theme);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
            Answers to common questions about how RxTracker works. Tap a question to expand it.
          </ThemedText>

          <View style={styles.list}>
            {FAQS.map((faq) => {
              const open = openQuestion === faq.question;
              return (
                <View key={faq.question} style={styles.item}>
                  <Pressable
                    style={styles.questionRow}
                    onPress={() => setOpenQuestion(open ? null : faq.question)}
                  >
                    <ThemedText type="smallBold" style={styles.question}>
                      {faq.question}
                    </ThemedText>
                    <Ionicons
                      name={open ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                  {open && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.answer}>
                      {faq.answer}
                    </ThemedText>
                  )}
                </View>
              );
            })}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
            Still have a question that isn&apos;t answered here? RxTracker is a tracking aid only
            and does not provide medical advice — for anything about your treatment itself,
            please check with your doctor or pharmacist.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.one },
    intro: { marginBottom: Spacing.three },
    list: { gap: Spacing.two },
    item: {
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: Spacing.three,
    },
    questionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
    question: { flex: 1 },
    answer: { marginTop: Spacing.two, lineHeight: 20 },
    disclaimer: { marginTop: Spacing.four },
  });
}
