import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Input } from './field';
import { Text } from './text';

const BASE_LIMIT = 255;
const EXTRA = 150;

// Multiline note with a "n/limit" counter under its bottom-left corner. Once
// the base limit is reached the user can raise it by EXTRA characters — one
// time only; at the extended limit there is no further option.
export function LimitedNoteField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  /** A string renders as the standard field label; pass a node for a custom one. */
  label: ReactNode;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  // A note saved before limits existed may already be past the base limit.
  const [extended, setExtended] = useState(value.length > BASE_LIMIT);
  const limit = extended ? Math.max(BASE_LIMIT + EXTRA, value.length) : BASE_LIMIT;
  const atLimit = value.length >= limit;

  return (
    <View className="gap-1">
      {typeof label === 'string' ? <Text className="text-sm">{label}</Text> : label}
      <Input
        className="min-h-20 py-2"
        style={{ textAlignVertical: 'top' }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline
        maxLength={limit}
      />
      <View className="flex-row items-center justify-between">
        <Text className={atLimit ? 'text-xs font-semibold text-status-danger' : 'text-xs text-brand-text-muted dark:text-night-muted'}>
          [{value.length}/{limit}]
        </Text>
        {atLimit && !extended ? (
          <Pressable onPress={() => setExtended(true)} accessibilityRole="button" hitSlop={8}>
            <Text className="text-xs font-semibold text-brand-blue">Add {EXTRA} more characters</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
