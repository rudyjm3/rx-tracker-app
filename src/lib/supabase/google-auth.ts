// Google sign-in / account linking through Supabase OAuth in the system
// browser (Chrome Custom Tabs on Android), mirroring rx-tracker-web's
// signInWithOAuth / linkIdentity calls. Google only ever redirects to
// Supabase's own callback (https://<ref>.supabase.co/auth/v1/callback),
// so this reuses the web app's Google OAuth client — no Android OAuth
// client or SHA-1 registration needed. Supabase then redirects to
// AUTH_REDIRECT_URL, which must be listed under Authentication → URL
// Configuration → Redirect URLs in the Supabase dashboard.
//
// The client keeps supabase-js's default implicit flow (tokens in the
// callback fragment) rather than PKCE: switching the shared client to
// PKCE would also turn this app's sign-up confirmation emails into PKCE
// links that only this device could complete. completeAuthFromUrl()
// accepts either shape, so moving to PKCE later needs no change here.
import type { UserIdentity } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { parseAuthCallbackUrl } from './auth-callback-url';
import { supabase } from './client';

// Closes the auth popup when this module loads on the web target; no-op on native.
WebBrowser.maybeCompleteAuthSession();

/** rxtrackerapp://auth/callback in development and release builds. */
export const AUTH_REDIRECT_URL = Linking.createURL('auth/callback');

export interface OAuthResult {
  error: string | null;
  /** The user closed the browser before finishing. Not an error to show. */
  cancelled?: boolean;
}

/** Turns the callback link's code or tokens into a stored Supabase session. */
export async function completeAuthFromUrl(url: string): Promise<OAuthResult> {
  const params = parseAuthCallbackUrl(url);
  switch (params.kind) {
    case 'error':
      return { error: params.message };
    case 'code': {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code);
      return { error: error?.message ?? null };
    }
    case 'tokens': {
      const { error } = await supabase.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
      });
      return { error: error?.message ?? null };
    }
    case 'empty':
      return { error: 'Google sign-in did not return a session. Please try again.' };
  }
}

async function runBrowserAuth(startUrl: string | null | undefined, startError: { message: string } | null) {
  if (startError || !startUrl) {
    return { error: startError?.message ?? "Couldn't start Google sign-in." };
  }
  const result = await WebBrowser.openAuthSessionAsync(startUrl, AUTH_REDIRECT_URL);
  if (result.type !== 'success') return { error: null, cancelled: true };
  return completeAuthFromUrl(result.url);
}

/** Sign in or sign up with Google. On success onAuthStateChange delivers the session. */
export async function signInWithGoogle(): Promise<OAuthResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: AUTH_REDIRECT_URL,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  return runBrowserAuth(data?.url, error);
}

/**
 * Link Google to the signed-in account (profile → Connected Accounts).
 * Requires "Allow manual linking" in Supabase Auth settings.
 */
export async function linkGoogle(): Promise<OAuthResult> {
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: {
      redirectTo: AUTH_REDIRECT_URL,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  const result = await runBrowserAuth(data?.url, error);
  // Pull the refreshed user (with the new identity) into the session.
  if (!result.error && !result.cancelled) await supabase.auth.refreshSession();
  return result;
}

export async function getIdentities(): Promise<UserIdentity[]> {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  return data.identities;
}

/** Supabase refuses to unlink an account's last identity; callers disable the button in that case. */
export async function unlinkGoogle(identity: UserIdentity): Promise<OAuthResult> {
  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (!error) await supabase.auth.refreshSession();
  return { error: error?.message ?? null };
}
