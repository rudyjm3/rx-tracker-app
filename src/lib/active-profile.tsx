// Adapted from rx-tracker-web's components/layout/ActiveProfileProvider.tsx
// — same "which profile am I currently viewing" pattern, but:
//   - persisted via AsyncStorage (per-device), not localStorage, for the
//     same reason lib/notifications.ts's local_reminders_enabled is
//     per-device local storage rather than a Supabase-synced setting:
//     which profile you're looking at is a per-device UI fact, not account
//     data, and must not sync across a user's other phones.
//   - no react-query (not a dependency here) — a plain useEffect/useState
//     keyed off the session, with an explicit refreshFamilyProfiles() for
//     the family-management screens to call after create/update/delete.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { useAuth } from "@/lib/supabase/AuthProvider";
import { getFamilyProfiles } from "@/lib/family";
import type { FamilyProfile } from "@/lib/types/profile";

const STORAGE_KEY = "active_profile_id";

interface ActiveProfileContextValue {
  activeProfileId: string | null; // null = the account owner
  activeProfile: FamilyProfile | null;
  familyProfiles: FamilyProfile[];
  setActiveProfileId: (id: string | null) => void;
  loading: boolean;
  refreshFamilyProfiles: () => Promise<void>;
}

const ActiveProfileContext = createContext<ActiveProfileContextValue | null>(null);

export function ActiveProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [storedProfileId, setStoredProfileId] = useState<string | null>(null);
  const [familyProfiles, setFamilyProfiles] = useState<FamilyProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshFamilyProfiles = useCallback(async () => {
    if (!userId) {
      setFamilyProfiles([]);
      return;
    }
    const profiles = await getFamilyProfiles();
    setFamilyProfiles(profiles);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        if (cancelled) return;
        setStoredProfileId(null);
        setFamilyProfiles([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [storedId, profiles] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          getFamilyProfiles(),
        ]);
        if (cancelled) return;
        setStoredProfileId(storedId);
        setFamilyProfiles(profiles);
      } catch {
        // Leave storedProfileId/familyProfiles at their defaults (owner,
        // empty list) — a failed fetch shouldn't block the rest of the app.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Deriving activeProfile from storedProfileId + the live family list
  // (rather than eagerly resetting storedProfileId when a member is
  // removed) means a stale id just stops matching anything — this falls
  // back to the owner on its own, no corrective effect needed.
  const activeProfile = storedProfileId
    ? (familyProfiles.find((p) => p.id === storedProfileId) ?? null)
    : null;
  const activeProfileId = activeProfile?.id ?? null;

  function setActiveProfileId(id: string | null) {
    setStoredProfileId(id);
    if (id) AsyncStorage.setItem(STORAGE_KEY, id);
    else AsyncStorage.removeItem(STORAGE_KEY);
  }

  return (
    <ActiveProfileContext.Provider
      value={{ activeProfileId, activeProfile, familyProfiles, setActiveProfileId, loading, refreshFamilyProfiles }}
    >
      {children}
    </ActiveProfileContext.Provider>
  );
}

export function useActiveProfile() {
  const ctx = useContext(ActiveProfileContext);
  if (!ctx) throw new Error("useActiveProfile must be used within an ActiveProfileProvider");
  return ctx;
}
