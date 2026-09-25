// Ported subset of rx-tracker-web's lib/family.ts — plain single-table
// Supabase calls, using this app's `supabase` client import style (see
// lib/medications.ts) rather than web's createClient(). No RPC needed here
// (unlike medication writes): family_profiles rows have no cross-table
// invariants to keep atomic.
import { supabase } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/medications";
import type { FamilyProfile } from "@/lib/types/profile";

export const FAMILY_RELATIONSHIPS = [
  "Spouse",
  "Partner",
  "Child",
  "Parent",
  "Sibling",
  "Caregiver",
  "Other",
] as const;

export const AVATAR_COLOR_PALETTE = [
  "#6366f1",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
];

export interface FamilyProfileInput {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  relationship?: string | null;
  birth_date?: string | null;
  height_value?: number | null;
  height_unit?: string | null;
  weight_value?: number | null;
  weight_unit?: string | null;
  height_updated_at?: string | null;
  weight_updated_at?: string | null;
  avatar_color?: string | null;
}

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;

/** Converts a height value between "in" and "cm", rounded to 1 decimal. */
export function convertHeight(value: number, fromUnit: 'in' | 'cm', toUnit: 'in' | 'cm'): number {
  if (fromUnit === toUnit) return value;
  const cm = fromUnit === 'in' ? value * CM_PER_INCH : value;
  const converted = toUnit === 'in' ? cm / CM_PER_INCH : cm;
  return Math.round(converted * 10) / 10;
}

/** Converts a weight value between "lb" and "kg", rounded to 1 decimal. */
export function convertWeight(value: number, fromUnit: 'lb' | 'kg', toUnit: 'lb' | 'kg'): number {
  if (fromUnit === toUnit) return value;
  const kg = fromUnit === 'lb' ? value * KG_PER_LB : value;
  const converted = toUnit === 'lb' ? kg / KG_PER_LB : kg;
  return Math.round(converted * 10) / 10;
}

function fallbackDisplayName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (first && last) return `${first} ${last.charAt(0).toUpperCase()}.`;
  if (first) return first;
  if (last) return last;
  return "";
}

function resolveDisplayName(input: FamilyProfileInput): string {
  const trimmed = input.display_name?.trim();
  if (trimmed) return trimmed;
  const fallback = fallbackDisplayName(input.first_name, input.last_name);
  if (!fallback) throw new Error("Enter a display name or a first name.");
  return fallback;
}

export async function getFamilyProfiles(): Promise<FamilyProfile[]> {
  const { data, error } = await supabase
    .from("family_profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as FamilyProfile[];
}

export async function getFamilyProfile(id: string): Promise<FamilyProfile> {
  const { data, error } = await supabase
    .from("family_profiles")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as FamilyProfile;
}

export async function createFamilyProfile(input: FamilyProfileInput): Promise<FamilyProfile> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("family_profiles")
    .insert({
      user_id: userId,
      display_name: resolveDisplayName(input),
      first_name: input.first_name ?? null,
      last_name: input.last_name ?? null,
      relationship: input.relationship ?? null,
      birth_date: input.birth_date ?? null,
      height_value: input.height_value ?? null,
      height_unit: input.height_value != null ? (input.height_unit ?? "in") : null,
      weight_value: input.weight_value ?? null,
      weight_unit: input.weight_value != null ? (input.weight_unit ?? "lb") : null,
      height_updated_at: input.height_value != null ? (input.height_updated_at ?? new Date().toISOString()) : null,
      weight_updated_at: input.weight_value != null ? (input.weight_updated_at ?? new Date().toISOString()) : null,
      avatar_color: input.avatar_color ?? AVATAR_COLOR_PALETTE[0],
    })
    .select()
    .single();
  if (error) throw error;
  return data as FamilyProfile;
}

export async function updateFamilyProfile(id: string, input: FamilyProfileInput): Promise<void> {
  const { error } = await supabase
    .from("family_profiles")
    .update({
      display_name: resolveDisplayName(input),
      first_name: input.first_name ?? null,
      last_name: input.last_name ?? null,
      relationship: input.relationship ?? null,
      birth_date: input.birth_date ?? null,
      height_value: input.height_value ?? null,
      height_unit: input.height_value != null ? (input.height_unit ?? "in") : null,
      weight_value: input.weight_value ?? null,
      weight_unit: input.weight_value != null ? (input.weight_unit ?? "lb") : null,
      height_updated_at: input.height_value != null ? (input.height_updated_at ?? null) : null,
      weight_updated_at: input.weight_value != null ? (input.weight_updated_at ?? null) : null,
      avatar_color: input.avatar_color ?? AVATAR_COLOR_PALETTE[0],
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteFamilyProfile(id: string): Promise<void> {
  const { error } = await supabase.from("family_profiles").delete().eq("id", id);
  if (error) throw error;
}
