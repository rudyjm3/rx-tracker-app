// Pure helpers for the OAuth deep link Supabase redirects back to
// (rxtrackerapp://auth/callback). No React Native / Supabase imports, so
// this stays easy to reason about and test in isolation.

export type AuthCallbackParams =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string }
  | { kind: 'empty' };

/** True for any form of the auth callback link (full URL or bare path). */
export function isAuthCallbackUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  // rxtrackerapp://auth/callback… parses "auth" as the host, so match on
  // the string rather than URL.pathname.
  return /(^|:\/\/|\/)auth\/callback(?=$|[/?#])/.test(url);
}

function paramsFrom(fragment: string): URLSearchParams {
  return new URLSearchParams(fragment.startsWith('?') || fragment.startsWith('#') ? fragment.slice(1) : fragment);
}

/**
 * Reads what Supabase put on the callback link: a PKCE `code` in the
 * query, implicit-flow tokens in the fragment, or an error in either.
 */
export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  const query = paramsFrom(queryIndex === -1 ? '' : beforeHash.slice(queryIndex));
  const hash = paramsFrom(hashIndex === -1 ? '' : url.slice(hashIndex));
  const get = (key: string) => hash.get(key) ?? query.get(key);

  const errorMessage = get('error_description') ?? get('error');
  if (errorMessage) return { kind: 'error', message: errorMessage };

  const accessToken = get('access_token');
  const refreshToken = get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };

  const code = get('code');
  if (code) return { kind: 'code', code };

  return { kind: 'empty' };
}
