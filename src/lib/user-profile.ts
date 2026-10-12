// Ported from rx-tracker-web's lib/user-profile.ts, using this app's
// `supabase` client import style (see lib/medications.ts) rather than
// web's createClient(). Photo upload follows web's convention: files live in
// the public "avatars" bucket under the owner's own uid folder (family
// members' photos too) and the public URL is stored in profile_picture.
import { supabase } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/medications";
import type { UserProfile } from "@/lib/types/profile";

export async function getUserProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
}

export interface UserProfileInput {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  height_value?: number | null;
  height_unit?: string | null;
  weight_value?: number | null;
  weight_unit?: string | null;
  height_updated_at?: string | null;
  weight_updated_at?: string | null;
  profile_picture?: string | null;
}

export async function upsertUserProfile(input: UserProfileInput): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      { user_id: userId, ...input, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

// What the image picker hands back for a chosen/captured photo.
export interface AvatarAsset {
  uri: string;
  mimeType?: string | null;
}

function avatarMimeType(asset: AvatarAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const ext = asset.uri.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Uploads a picked photo (the owner's own, or a family member's — both live
 * under the owner's uid folder, the only identity storage knows about) and
 * returns its public URL. Same size/type limits as the web app.
 */
export async function uploadAvatar(asset: AvatarAsset): Promise<string> {
  const contentType = avatarMimeType(asset);
  if (!ALLOWED_AVATAR_TYPES.includes(contentType)) {
    throw new Error("Photos must be JPEG, PNG, or WebP.");
  }

  const body = await (await fetch(asset.uri)).arrayBuffer();
  if (body.byteLength > MAX_AVATAR_BYTES) {
    throw new Error("Photo must be 3MB or smaller.");
  }

  const userId = await getCurrentUserId();
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) throw error;

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Deletes a previously-uploaded avatar, identified by its public URL — a
 * no-op for a URL that isn't one of our own avatar objects (null, or an
 * external one such as a Google account photo).
 */
export async function deleteAvatarIfManaged(url: string | null): Promise<void> {
  if (!url) return;
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return;
  await supabase.storage.from(AVATAR_BUCKET).remove([url.slice(index + marker.length)]);
}

export interface AvatarChange {
  asset: AvatarAsset | null;
  remove: boolean;
}

/**
 * Applies a picker selection before a profile save: uploads a new photo or
 * clears the existing one. Returns the value to save plus the old file to
 * delete once the save has succeeded (so a failed save never loses a photo).
 */
export async function resolveAvatarChange(
  current: string | null,
  change: AvatarChange,
): Promise<{ picture: string | null; stale: string | null }> {
  if (change.asset) return { picture: await uploadAvatar(change.asset), stale: current };
  if (change.remove) return { picture: null, stale: current };
  return { picture: current, stale: null };
}
