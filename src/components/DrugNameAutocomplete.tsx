import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Input } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
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
      <Input
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
        autoCorrect={false}
      />
      {active && (!current || current.items.length > 0) && (
        // Suggestion list: radius 10, border, shadow-card (DESIGN.md 6.3).
        <View className="mt-1 max-h-56 overflow-hidden rounded-control border border-brand-border bg-white shadow-card dark:border-night-border dark:bg-night-card">
          {!current ? (
            <ActivityIndicator className="p-4" />
          ) : (
            current.items.map((suggestion) => (
              <Pressable
                key={`${suggestion.label}|${suggestion.setId ?? ''}`}
                accessibilityRole="button"
                className="min-h-11 justify-center px-3 py-2 active:bg-brand-bg dark:active:bg-night-selected"
                onPress={() => {
                  setTyped(false);
                  setResults({ term: '', items: [] });
                  onSelect(suggestion);
                }}
              >
                <Text className="text-sm">{suggestion.label}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}
