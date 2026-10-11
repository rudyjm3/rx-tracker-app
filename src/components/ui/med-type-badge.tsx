import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';
import type { MedicationType } from '@/lib/types/medications';

// Rx / OTC / Supplement pill, DESIGN.md 6.4. `onDark` is for the gradient
// hero and navy surfaces, where the tinted default would lose contrast.
const LABEL: Record<MedicationType, string> = { prescription: 'Rx', otc: 'OTC', supplement: 'Supplement' };

const BG: Record<MedicationType, string> = {
  prescription: 'bg-brand-deep-blue/10',
  otc: 'bg-brand-blue/10',
  supplement: 'bg-status-warning/10',
};
const FG: Record<MedicationType, string> = {
  prescription: 'text-brand-deep-blue dark:text-brand-cyan',
  otc: 'text-brand-blue dark:text-sky-400',
  supplement: 'text-status-warning',
};
const ON_DARK_BG: Record<MedicationType, string> = {
  prescription: 'border border-white/40 bg-white/20',
  otc: 'border border-white/40 bg-white/20',
  supplement: 'border border-amber-200/50 bg-amber-400/25',
};

export function MedTypeBadge({ type, onDark, className }: { type: MedicationType; onDark?: boolean; className?: string }) {
  return (
    <View className={cn('self-center rounded-full px-2 py-0.5', onDark ? ON_DARK_BG[type] : BG[type], className)}>
      <Text className={cn('text-[11px] font-semibold uppercase tracking-wide', onDark ? 'text-white' : FG[type])}>
        {LABEL[type]}
      </Text>
    </View>
  );
}
