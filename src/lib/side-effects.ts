// Ported subset of rx-tracker-web's lib/side-effects.ts — this app has no
// export-report feature, so getSideEffectsInRange isn't needed, and this
// app's UI (like web's) never exposes editing an existing entry, only add
// + delete, so updateSideEffect isn't ported either.
import { supabase } from '@/lib/supabase/client';
import type { SideEffect, SideEffectSeverity } from '@/lib/types/medications';

export async function getSideEffects(medicationId: string): Promise<SideEffect[]> {
  const { data, error } = await supabase
    .from('side_effects')
    .select('*')
    .eq('medication_id', medicationId)
    .order('occurred_date', { ascending: false });
  if (error) throw error;
  return data as SideEffect[];
}

export interface SideEffectInput {
  occurred_date: string;
  description: string;
  severity: SideEffectSeverity;
  note?: string;
}

export async function addSideEffect(medicationId: string, input: SideEffectInput): Promise<void> {
  const { error } = await supabase.from('side_effects').insert({
    medication_id: medicationId,
    occurred_date: input.occurred_date,
    description: input.description,
    severity: input.severity,
    note: input.note ?? '',
  });
  if (error) throw error;
}

export async function deleteSideEffect(id: string): Promise<void> {
  const { error } = await supabase.from('side_effects').delete().eq('id', id);
  if (error) throw error;
}
