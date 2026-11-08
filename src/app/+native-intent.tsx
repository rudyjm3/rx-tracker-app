// Rewrites incoming deep links before Expo Router resolves them.
//
// The Google OAuth return link (rxtrackerapp://auth/callback…) isn't a
// screen. While the app is running, WebBrowser.openAuthSessionAsync
// already receives that link and completes sign-in (lib/supabase/
// google-auth.ts), so here we just keep the router where it is instead of
// navigating to a non-existent /auth/callback route (which would also
// pull the user off the profile screen after linking Google).
//
// If Android killed the app while the browser was open, the link arrives
// as the initial URL with nothing waiting for it, so finish sign-in here
// and start at the root (which routes to tabs or login).
import { isAuthCallbackUrl } from '@/lib/supabase/auth-callback-url';
import { completeAuthFromUrl } from '@/lib/supabase/google-auth';

export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (!isAuthCallbackUrl(path)) return path;
    if (!initial) return null;
    await completeAuthFromUrl(path);
    return '/';
  } catch {
    return '/';
  }
}
