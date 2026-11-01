import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

import { GradientFill } from './gradient-fill';
import { Text } from './text';

// Wizard step indicator: numbered circles joined by a line that fills as steps
// are completed. A completed step shows a check mark. Tapping a step jumps to
// it — backward always, forward only to steps already reached. Mirrors
// rx-tracker-web components/medications/wizard/WizardStepper.tsx.
const CIRCLE = 32;

function ConnectorFill({ filled }: { filled: boolean }) {
  const [progress] = useState(() => new Animated.Value(filled ? 1 : 0));
  const [width] = useState(() => progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }));
  useEffect(() => {
    Animated.timing(progress, {
      toValue: filled ? 1 : 0,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animating width
    }).start();
  }, [filled, progress]);
  return (
    <View
      pointerEvents="none"
      className="absolute h-0.5 overflow-hidden rounded-full bg-brand-border dark:bg-night-border"
      style={{ left: '50%', width: '100%', top: CIRCLE / 2 - 1 }}>
      <Animated.View className="h-full overflow-hidden" style={{ width }}>
        <GradientFill name="brand" />
      </Animated.View>
    </View>
  );
}

export function WizardStepper({
  labels,
  step,
  furthestStep,
  onSelect,
}: {
  labels: readonly string[];
  /** 1-based current step. */
  step: number;
  /** 1-based furthest step reached (validated up to). */
  furthestStep: number;
  onSelect: (step: number) => void;
}) {
  return (
    <View className="flex-row" accessibilityRole="tablist">
      {labels.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const complete = n < furthestStep;
        const reachable = n <= Math.max(furthestStep, step);
        return (
          <View key={label} className="flex-1">
            {i < labels.length - 1 ? <ConnectorFill filled={n < furthestStep} /> : null}
            <Pressable
              accessibilityRole="tab"
              accessibilityLabel={`${label}, step ${n} of ${labels.length}${complete ? ', completed' : ''}`}
              accessibilityState={{ selected: active, disabled: !reachable }}
              disabled={!reachable || active}
              hitSlop={4}
              onPress={() => onSelect(n)}
              className="items-center gap-1 py-1">
              <View
                className={cn(
                  'items-center justify-center overflow-hidden rounded-full',
                  !active && complete && 'bg-brand-deep-blue',
                  !active && !complete && 'border border-brand-border bg-white dark:border-night-border dark:bg-night-card',
                )}
                style={{ width: CIRCLE, height: CIRCLE }}>
                {active ? <GradientFill name="brand" /> : null}
                {complete && !active ? (
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                ) : (
                  <Text className={cn('text-sm font-semibold', active ? 'text-white dark:text-white' : 'text-brand-text-muted')}>{n}</Text>
                )}
              </View>
              <Text
                className={cn(
                  'text-xs',
                  active ? 'font-semibold text-brand-navy dark:text-white' : complete ? 'text-brand-text' : 'text-brand-text-muted',
                )}>
                {label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
