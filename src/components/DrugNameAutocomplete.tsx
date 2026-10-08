import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { searchDrugSuggestions, type DrugSuggestion } from '@/lib/dailymed';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

interface DrugNameAutocompleteProps {
  value: string;
  /** Called for every keystroke — the field stays free-text. */
  onChangeText: (value: string) => void;
  /** Called when a name+strength suggestion is picked. */
  onSelect: (suggestion: DrugSuggestion) => void;
  placeholder?: string;
}

// A name field that suggests specific name+strength combinations (e.g.
// "Risperidone 3mg") from openFDA's NDC directory. Suggestions are only a
// shortcut: typing never requires a pick, a lookup failure just shows no
// suggestions, and the caller decides which other fields a pick fills in.
export function DrugNameAutocomplete({ value, onChangeText, onSelect, placeholder }: DrugNameAutocompleteProps) {
  const theme = useTheme();
  const styles = getStyles(theme);
  // Results are tagged with the term they were fetched for, so a list for
  // an earlier term is never shown (or tappable) while the next one loads.
  const [results, setResults] = useState<{ term: string; items: DrugSuggestion[] }>({ term: '', items: [] });
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only keystrokes open the list; a programmatic value change (a pick, or
  // the edit form hydrating) must not re-open it.
  const [typed, setTyped] = useState(false);
  const term = value.trim();
  const active = typed && focused && term.length >= MIN_CHARS;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const items = await searchDrugSuggestions(term, controller.signal);
        if (!controller.signal.aborted) setResults({ term, items });
      } catch {
        // Offline, rate-limited or aborted: fall back to plain typing.
        if (!controller.signal.aborted) setResults({ term, items: [] });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [term, active]);

  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  const current = results.term === term ? results : null;

  return (
    <View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(v) => {
          setTyped(true);
          setFocused(true);
          onChangeText(v);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        // Delayed so a tap on a suggestion still lands on web, where the
        // press blurs the input first. Leaving the field closes the list and
        // (via the effect cleanup) cancels any lookup still in flight.
        onBlur={() => {
          blurTimer.current = setTimeout(() => setFocused(false), 200);
        }}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoCorrect={false}
      />
      {active && (!current || current.items.length > 0) && (
        <View style={styles.list}>
          {!current ? (
            <ActivityIndicator style={styles.loading} />
          ) : (
            current.items.map((suggestion) => (
              <Pressable
                key={`${suggestion.label}|${suggestion.setId ?? ''}`}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                onPress={() => {
                  setTyped(false);
                  setResults({ term: '', items: [] });
                  onSelect(suggestion);
                }}
              >
                <ThemedText>{suggestion.label}</ThemedText>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
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
    list: {
      marginTop: Spacing.one,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: BorderRadius.sm,
      backgroundColor: theme.backgroundElement,
    },
    loading: { padding: Spacing.three },
    item: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
    itemPressed: { backgroundColor: theme.backgroundSelected },
  });
}
