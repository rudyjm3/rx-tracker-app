// Ported subset of rx-tracker-web's lib/side-effects.ts — this app has no
// export-report feature, so getSideEffectsInRange isn't needed, and this
// app's UI (like web's) never exposes editing an existing entry, only add
// + delete, so updateSideEffect isn't ported either.
import { supabase } from '@/lib/supabase/client';
import type { SideEffect, SideEffectSeverity } from '@/lib/types/medications';

// Side effects are manually logged, not auto-generated like dose_logs, so
// a medication realistically accumulates far fewer of them — a generous
// fixed cap is enough on its own, no pagination needed.
const SIDE_EFFECTS_LIMIT = 200;

export async function getSideEffects(medicationId: string): Promise<SideEffect[]> {
  const { data, error } = await supabase
    .from('side_effects')
    .select('*')
    .eq('medication_id', medicationId)
    .order('occurred_date', { ascending: false })
    .limit(SIDE_EFFECTS_LIMIT);
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

export interface SideEffectsInput {
  occurred_date: string;
  descriptions: string[];
  severity: SideEffectSeverity;
  note?: string;
}

// Inserts one side_effects row per description via the add_side_effects
// RPC, all inside a single transaction — a failure partway through (a
// dropped connection, a bad row) rolls back the whole submission instead
// of leaving a partial set that a retry would then duplicate.
export async function addSideEffects(medicationId: string, input: SideEffectsInput): Promise<void> {
  const { error } = await supabase.rpc('add_side_effects', {
    p_medication_id: medicationId,
    p_occurred_date: input.occurred_date,
    p_descriptions: input.descriptions,
    p_severity: input.severity,
    p_note: input.note ?? '',
  });
  if (error) throw error;
}

export async function deleteSideEffect(id: string): Promise<void> {
  const { error } = await supabase.from('side_effects').delete().eq('id', id);
  if (error) throw error;
}
