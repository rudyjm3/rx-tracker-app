import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Input } from './field';
import { Text } from './text';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function toDate(value: string): Date {
  const d = new Date();
  if (TIME_RE.test(value)) {
    const [h, m] = value.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

function toValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function format(value: string): string {
  if (!TIME_RE.test(value)) return '';
  const [h, m] = value.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// Native time picker. The value in and out is the "HH:MM" 24-hour string the
// rest of the app stores; '' means not chosen yet. Android opens the system
// clock dialog, iOS shows the compact native picker, web falls back to typed
// "HH:MM".
export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [webText, setWebText] = useState(value);
  // Web fallback: follow outside changes (e.g. a removed row reusing this
  // component) but never clobber in-progress typing — only resync when the
  // incoming value is valid and differs from what the typed text represents.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    const typed = TIME_RE.test(webText) ? webText : '';
    if (value !== typed) setWebText(value);
  }

  function handle(e: DateTimePickerEvent, d?: Date) {
    if (e.type === 'set' && d) onChange(toValue(d));
  }

  return (
    <View className="gap-1">
      <Text className="text-sm">{label}</Text>
      {Platform.OS === 'ios' ? (
        <View className="flex-row">
          <DateTimePicker value={toDate(value)} mode="time" display="compact" onChange={handle} accessibilityLabel={label} />
        </View>
      ) : Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${format(value) || 'Select time'}`}
          onPress={() => DateTimePickerAndroid.open({ value: toDate(value), mode: 'time', is24Hour: false, onChange: handle })}
          className="min-h-[44px] flex-row items-center justify-between gap-2 rounded-control border border-brand-border bg-white px-3 dark:border-night-border dark:bg-night-card">
          <Text className={cn('text-sm', !value && 'text-brand-text-muted')}>{format(value) || 'Select time'}</Text>
          <Ionicons name="time-outline" size={18} color="#60708A" />
        </Pressable>
      ) : (
        <Input
          value={webText}
          placeholder="HH:MM (24h)"
          onChangeText={(v) => {
            setWebText(v);
            onChange(TIME_RE.test(v) ? v : '');
          }}
        />
      )}
    </View>
  );
}
