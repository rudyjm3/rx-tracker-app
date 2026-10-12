import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Input } from './field';
import { Text } from './text';

type Period = 'AM' | 'PM';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function parse(value: string): { hour: string; minute: string; period: Period } | null {
  if (!TIME_RE.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return { hour: String(h % 12 || 12), minute: String(m).padStart(2, '0'), period: h >= 12 ? 'PM' : 'AM' };
}

// Returns "HH:MM" (24h) or '' when the typed pieces aren't a complete, valid
// 12-hour time yet.
function compose(hour: string, minute: string, period: Period): string {
  const h = Number(hour);
  const m = Number(minute);
  if (!hour || !minute || !Number.isInteger(h) || !Number.isInteger(m) || h < 1 || h > 12 || m < 0 || m > 59) return '';
  const h24 = (h % 12) + (period === 'PM' ? 12 : 0);
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 12-hour time entry: hour, minute and an AM/PM toggle. The value in and out
// is the "HH:MM" 24-hour string the rest of the app stores; it's '' while the
// input is incomplete or invalid, so callers' existing validation still works.
export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const initial = parse(value);
  const [hour, setHour] = useState(initial?.hour ?? '');
  const [minute, setMinute] = useState(initial?.minute ?? '');
  const [period, setPeriod] = useState<Period>(initial?.period ?? 'AM');

  // Follow outside changes to the value (e.g. picking a different slot) without
  // fighting the user's in-progress typing: only resync when the incoming value
  // is a valid time that differs from what the typed pieces already compose to.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    const parsed = parse(value);
    if (parsed && compose(hour, minute, period) !== compose(parsed.hour, parsed.minute, parsed.period)) {
      setHour(parsed.hour);
      setMinute(parsed.minute);
      setPeriod(parsed.period);
    }
  }

  function emit(nextHour: string, nextMinute: string, nextPeriod: Period) {
    onChange(compose(nextHour, nextMinute, nextPeriod));
  }

  return (
    <View className="gap-1">
      <Text className="text-sm">{label}</Text>
      <View className="flex-row items-center gap-1.5">
        <Input
          accessibilityLabel={`${label} hour`}
          className="w-14 text-center"
          keyboardType="number-pad"
          maxLength={2}
          placeholder="12"
          value={hour}
          onChangeText={(v) => {
            const next = v.replace(/\D/g, '');
            setHour(next);
            emit(next, minute, period);
          }}
        />
        <Text className="text-base font-semibold">:</Text>
        <Input
          accessibilityLabel={`${label} minute`}
          className="w-14 text-center"
          keyboardType="number-pad"
          maxLength={2}
          placeholder="00"
          value={minute}
          onChangeText={(v) => {
            const next = v.replace(/\D/g, '');
            setMinute(next);
            emit(hour, next, period);
          }}
          onBlur={() => {
            if (minute.length === 1) {
              const padded = minute.padStart(2, '0');
              setMinute(padded);
              emit(hour, padded, period);
            }
          }}
        />
        <View className="flex-row overflow-hidden rounded-control border border-brand-border dark:border-night-border">
          {(['AM', 'PM'] as const).map((p) => (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityState={{ selected: period === p }}
              onPress={() => {
                setPeriod(p);
                emit(hour, minute, p);
              }}
              className={cn(
                'min-h-[44px] items-center justify-center px-3',
                period === p ? 'bg-brand-blue' : 'bg-white dark:bg-night-card',
              )}>
              <Text
                className={cn(
                  'text-sm font-semibold',
                  period === p ? 'text-white dark:text-white' : 'text-brand-text dark:text-white',
                )}>
                {p}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
