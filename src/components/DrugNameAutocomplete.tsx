import { useEffect, useState } from 'react';
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
  const [suggestions, setSuggestions] = useState<DrugSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  // Only keystrokes open the list; a programmatic value change (a pick, or
  // the edit form hydrating) must not re-open it.
  const [typed, setTyped] = useState(false);
  const term = value.trim();
  const active = typed && term.length >= MIN_CHARS;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchDrugSuggestions(term, controller.signal);
        if (!controller.signal.aborted) setSuggestions(results);
      } catch {
        // Offline, rate-limited or aborted: fall back to plain typing.
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [term, active]);

  return (
    <View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(v) => {
          setTyped(true);
          onChangeText(v);
        }}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoCorrect={false}
      />
      {active && (loading || suggestions.length > 0) && (
        <View style={styles.list}>
          {loading && suggestions.length === 0 ? (
            <ActivityIndicator style={styles.loading} />
          ) : (
            suggestions.map((suggestion) => (
              <Pressable
                key={`${suggestion.label}|${suggestion.setId ?? ''}`}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                onPress={() => {
                  setTyped(false);
                  setSuggestions([]);
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
