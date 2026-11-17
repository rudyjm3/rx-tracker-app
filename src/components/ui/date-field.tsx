import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Input } from './field';
import { Text } from './text';

// ISO "YYYY-MM-DD" <-> a local-midnight Date (never via toISOString, which
// would shift the day across timezones).
function isoToDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function display(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}-${m[3]}-${m[1]}` : '';
}

// Native date picker. Value in/out is an ISO "YYYY-MM-DD" string ('' = unset).
// Android opens the system dialog from a tappable field; iOS shows the compact
// native picker inline; web falls back to a typed ISO input.
export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Select date',
  maximumDate,
  minimumDate,
  clearable,
  error,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  maximumDate?: Date;
  minimumDate?: Date;
  /** Show a Clear button when a value is set (for optional dates). */
  clearable?: boolean;
  error?: string;
}) {
  const current = value ? isoToDate(value) : new Date();
  // Web fallback keeps the raw typed text so partial input isn't wiped; it
  // follows outside changes only when they differ from what the text means.
  const [webText, setWebText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    const typed = /^\d{4}-\d{2}-\d{2}$/.test(webText) ? webText : '';
    if (value !== typed) setWebText(value);
  }

  function handle(e: DateTimePickerEvent, d?: Date) {
    if (e.type === 'set' && d) onChange(dateToIso(d));
  }

  return (
    <View className="gap-1">
      <Text className="text-sm">{label}</Text>
      {Platform.OS === 'ios' ? (
        <View className="flex-row items-center gap-2">
          <DateTimePicker
            value={current}
            mode="date"
            display="compact"
            maximumDate={maximumDate}
            minimumDate={minimumDate}
            onChange={handle}
            accessibilityLabel={label}
          />
          {clearable && value ? <ClearButton label={label} onPress={() => onChange('')} /> : null}
        </View>
      ) : Platform.OS === 'android' ? (
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${value ? display(value) : placeholder}`}
            onPress={() =>
              DateTimePickerAndroid.open({ value: current, mode: 'date', maximumDate, minimumDate, onChange: handle })
            }
            className="min-h-[44px] flex-1 flex-row items-center justify-between rounded-control border border-brand-border bg-white px-3 dark:border-night-border dark:bg-night-card">
            <Text className={cn('text-sm', !value && 'text-brand-text-muted')}>{value ? display(value) : placeholder}</Text>
            <Ionicons name="calendar-outline" size={18} color="#60708A" />
          </Pressable>
          {clearable && value ? <ClearButton label={label} onPress={() => onChange('')} /> : null}
        </View>
      ) : (
        <Input
          value={webText}
          placeholder="YYYY-MM-DD"
          onChangeText={(v) => {
            setWebText(v);
            onChange(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
          }}
        />
      )}
      {error ? <Text className="text-xs text-status-danger">{error}</Text> : null}
    </View>
  );
}

function ClearButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={8} onPress={onPress} className="min-h-[44px] justify-center px-2">
      <Text className="text-sm font-semibold text-brand-blue dark:text-brand-blue">Clear</Text>
    </Pressable>
  );
}
