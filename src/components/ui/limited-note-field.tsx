import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Field } from './field';
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
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  const [extended, setExtended] = useState(false);
  const limit = extended ? BASE_LIMIT + EXTRA : BASE_LIMIT;
  const atLimit = value.length >= limit;

  return (
    <View className="gap-1">
      <Field
        label={label}
        className="min-h-20"
        style={{ textAlignVertical: 'top' }}
        value={value}
        onChangeText={onChangeText}
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
