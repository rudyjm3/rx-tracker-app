// Scoped port of rx-tracker-web's lib/onboarding.ts. Web runs a 6-step
// draft-based wizard (medications → tracking → schedule → inventory →
// reconcile → activate) that stages every medication as a row in a
// separate `drafts` table before converting them all to real medications
// at once. This app already has a full-featured single-medication add
// screen (medications/new.tsx) that writes straight to `medications`, so
// rather than duplicating that as a parallel draft/wizard system, the
// app's onboarding screen (src/app/onboarding) reuses it directly — add
// one medication at a time, "Finish setup" when done. That screen still
// reads/writes the same shared `profile_onboarding` table as web, so
// status (and the "resume setup" nudge) stays consistent for an account
// used from both apps; it just never uses web's more granular
// intermediate current_step values, only "medications" (in progress) and
// "activate" (right before completing).
import { supabase } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/medications";
import type { OnboardingStep, ProfileOnboarding } from "@/lib/types/profile";

export async function getOnboardingProgress(profileId?: string | null): Promise<ProfileOnboarding | null> {
  let query = supabase.from("profile_onboarding").select("*");
  query = profileId == null ? query.is("profile_id", null) : query.eq("profile_id", profileId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as ProfileOnboarding | null;
}

// Same atomic upsert-with-ignoreDuplicates approach as web's
// getOrCreateProgress, for the same reason: profile_onboarding's
// (user_id, profile_id) unique constraint is "nulls not distinct", so this
// is race-safe for the account owner's row (profile_id null) too.
async function getOrCreateProgress(profileId?: string | null): Promise<ProfileOnboarding> {
  const userId = await getCurrentUserId();
  const { data: inserted, error: insertError } = await supabase
    .from("profile_onboarding")
    .upsert(
      { user_id: userId, profile_id: profileId ?? null, status: "in_progress", current_step: "medications" },
      { onConflict: "user_id,profile_id", ignoreDuplicates: true },
    )
    .select();
  if (insertError) throw insertError;
  if (inserted && inserted.length > 0) return inserted[0] as ProfileOnboarding;

  const existing = await getOnboardingProgress(profileId);
  if (!existing) throw new Error("Failed to load onboarding progress");
  return existing;
}

export async function startOnboarding(profileId?: string | null): Promise<ProfileOnboarding> {
  return getOrCreateProgress(profileId);
}

export async function saveOnboardingStep(step: OnboardingStep, profileId?: string | null): Promise<void> {
  const progress = await getOrCreateProgress(profileId);
  const { error } = await supabase
    .from("profile_onboarding")
    .update({ current_step: step, status: "in_progress" })
    .eq("id", progress.id);
  if (error) throw error;
}

export async function completeOnboarding(profileId?: string | null): Promise<void> {
  const progress = await getOrCreateProgress(profileId);
  const { error } = await supabase
    .from("profile_onboarding")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", progress.id);
  if (error) throw error;
}

export async function skipOnboarding(profileId?: string | null): Promise<void> {
  const progress = await getOrCreateProgress(profileId);
  const { error } = await supabase.from("profile_onboarding").update({ status: "skipped" }).eq("id", progress.id);
  if (error) throw error;
}
