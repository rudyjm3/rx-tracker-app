// Ported in full from rx-tracker-web's lib/side-effect-tags.ts — same
// 23505-tolerant one-time seeding pattern as seedMoodTagsIfNeeded in
// lib/pain-mood.ts.
import { supabase } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/medications';
import { getSetting, setSetting } from '@/lib/app-settings';
import type { SideEffectTag } from '@/lib/types/medications';

const SIDE_EFFECT_TAGS_SEEDED_KEY = 'side_effect_tags_seeded';

// One-time seeding of common side effects, gated by an app_settings flag
// so re-fetching never re-adds tags a user has since deleted (mirrors
// PREDEFINED_MOOD_TAGS seeding in lib/pain-mood.ts).
const PREDEFINED_SIDE_EFFECT_TAGS = [
  'Nausea', 'Headache', 'Dizziness', 'Fatigue', 'Drowsiness',
  'Insomnia', 'Dry Mouth', 'Upset Stomach', 'Diarrhea', 'Constipation',
  'Loss of Appetite', 'Weight Gain', 'Weight Loss', 'Rash', 'Anxiety',
  'Blurred Vision',
];

async function seedSideEffectTagsIfNeeded(): Promise<void> {
  const seeded = await getSetting(SIDE_EFFECT_TAGS_SEEDED_KEY);
  if (seeded) return;

  const userId = await getCurrentUserId();
  const results = await Promise.all(
    PREDEFINED_SIDE_EFFECT_TAGS.map((name, i) =>
      supabase
        .from('side_effect_tags')
        .insert({ user_id: userId, name, always_show: true, sort_order: i }),
    ),
  );
  // Supabase resolves (rather than rejects) with an `error` on failure, so a
  // failed insert wouldn't otherwise surface here. Unique-constraint
  // collisions (code 23505 — the tag already exists for this user, e.g. a
  // retry after a partial seed) are expected and fine to ignore; any other
  // error means the tag list may be incomplete, so don't mark it seeded and
  // let the next call retry.
  const hasUnexpectedError = results.some(
    ({ error }) => error && error.code !== '23505',
  );
  if (hasUnexpectedError) return;
  await setSetting(SIDE_EFFECT_TAGS_SEEDED_KEY, '1');
}

export async function getSideEffectTags(): Promise<SideEffectTag[]> {
  await seedSideEffectTagsIfNeeded();
  const { data, error } = await supabase
    .from('side_effect_tags')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data as SideEffectTag[];
}

function assertValidTagName(name: string): void {
  if (!name.trim()) {
    throw new Error("Side effect name can't be empty.");
  }
}

export async function createSideEffectTag(name: string, alwaysShow = true): Promise<SideEffectTag> {
  assertValidTagName(name);
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('side_effect_tags')
    .insert({ user_id: userId, name, always_show: alwaysShow })
    .select()
    .single();
  if (error) throw error;
  return data as SideEffectTag;
}

export async function renameSideEffectTag(id: string, name: string): Promise<void> {
  assertValidTagName(name);
  const { error } = await supabase.from('side_effect_tags').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteSideEffectTag(id: string): Promise<void> {
  const { error } = await supabase.from('side_effect_tags').delete().eq('id', id);
  if (error) throw error;
}

export async function setSideEffectTagAlwaysShow(id: string, alwaysShow: boolean): Promise<void> {
  const { error } = await supabase
    .from('side_effect_tags')
    .update({ always_show: alwaysShow })
    .eq('id', id);
  if (error) throw error;
}
