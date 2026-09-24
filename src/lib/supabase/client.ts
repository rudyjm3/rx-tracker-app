import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Falls back to placeholder values when Supabase isn't configured yet, so
// the client can always be constructed. Calls against the placeholder URL
// fail as a normal network error (surfaced via each method's `error`
// return value) rather than throwing at construction time. Mirrors
// rx-tracker-web's lib/supabase/client.ts.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

// AsyncStorage (not expo-secure-store) per Supabase's own React
// Native/Expo guidance — a persisted session (access + refresh token
// plus user metadata) commonly exceeds SecureStore's ~2KB per-key limit
// on Android.
//
// On web, app.json's `web.output: "static"` pre-renders this module on
// the server (no `window`), and @react-native-async-storage/async-storage's
// web shim reaches for `window.localStorage` unconditionally — passing it
// as `storage` there crashes the whole dev/render server. Only use it once
// there's a real `window` to back it; supabase-js's own browser check
// already no-ops persistence safely when `storage` is left undefined.
const isServer = typeof window === "undefined";

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});
