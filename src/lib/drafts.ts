// Ported from rx-tracker-web's lib/drafts.ts. Drafts live in the shared
// medication_drafts table, so one started on web can be resumed here (and
// vice versa) — form_data uses the web wizard's MedicationFormValues shape.
import { supabase } from "@/lib/supabase/client";

export interface ParsedDraft<T = unknown> {
  id: string;
  formData: T;
  currentStep: number;
  furthestStep: number;
  createdAt: string;
  updatedAt: string;
}

interface DraftRow {
  id: string;
  form_data: string;
  current_step: number;
  furthest_step: number;
  created_at: string;
  updated_at: string;
}

function parseDraft<T>(row: DraftRow): ParsedDraft<T> {
  return {
    id: row.id,
    formData: JSON.parse(row.form_data) as T,
    currentStep: row.current_step,
    furthestStep: row.furthest_step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

export async function getDrafts<T = unknown>(profileId?: string | null): Promise<ParsedDraft<T>[]> {
  const userId = await requireUserId();
  let query = supabase.from("medication_drafts").select("*").eq("user_id", userId);
  query = profileId == null ? query.is("profile_id", null) : query.eq("profile_id", profileId);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  // One unreadable draft shouldn't hide the rest.
  const drafts: ParsedDraft<T>[] = [];
  for (const row of data as DraftRow[]) {
    try {
      drafts.push(parseDraft<T>(row));
    } catch {
      // skip malformed form_data
    }
  }
  return drafts;
}

export async function getDraft<T = unknown>(id: string): Promise<ParsedDraft<T> | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("medication_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? parseDraft<T>(data as DraftRow) : null;
}

export async function saveDraft<T>(args: {
  id?: string;
  formData: T;
  currentStep: number;
  furthestStep: number;
  profileId?: string | null;
}): Promise<string> {
  const userId = await requireUserId();
  const payload = {
    form_data: JSON.stringify(args.formData),
    current_step: args.currentStep,
    furthest_step: args.furthestStep,
    updated_at: new Date().toISOString(),
  };

  if (args.id) {
    const { error } = await supabase.from("medication_drafts").update(payload).eq("id", args.id).eq("user_id", userId);
    if (error) throw error;
    return args.id;
  }

  const { data, error } = await supabase
    .from("medication_drafts")
    .insert({ user_id: userId, profile_id: args.profileId ?? null, ...payload })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteDraft(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from("medication_drafts").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}
