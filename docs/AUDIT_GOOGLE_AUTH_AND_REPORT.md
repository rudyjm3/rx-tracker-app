# RxTracker cross-repo audit: Google auth and the Doctor Visit Report

**Date:** 2026-11-08
**Scope:** `rx-tracker-web` @ `e909c56`, `rx-tracker-app` @ `bc57f5d`, the PHP reference `rx-tracker` (default branch), and the Supabase project `rx-tracker-web` (`mabtmqhqtsuiglxwxsnu`). I only read these.
**Mode:** Audit only. No source, config, or database objects were changed in either repo or in Supabase.

> Note: the prompt mentions a "Deliverables" section and "Areas" 1–6, but only the four Known Issues came through. This report covers those four issues. Areas 5 (Android OAuth) and 6 (report parity) are covered as far as the issues describe them.

---

## TL;DR

| # | Issue | Verdict | Severity |
|---|---|---|---|
| 1a | Web Google sign-in fails | **Root cause confirmed: Google returns `Error 400: redirect_uri_mismatch`.** The Google OAuth client set in Supabase (`747694774840-h9uajpco…`) does not list `https://mabtmqhqtsuiglxwxsnu.supabase.co/auth/v1/callback` as an Authorized redirect URI. | Blocker |
| 1b | Web `/auth/callback` sends users to the wrong host | **Confirmed.** The route redirects to `https://0.0.0.0:3000/...` in production because `new URL(request.url).origin` is Hostinger's internal address. Once 1a is fixed, Google sign-in will **still** fail at the last step until this is fixed too. | Blocker |
| 1c | `/auth/callback` open redirect via `next` | Code issue: `${origin}${next}` with `next=@evil.com` builds `https://host@evil.com`. | High (security) |
| 1d | Login page never shows `?error=auth-callback-failed` | Code issue: failures are silent. | Low |
| 2 | Android has no Google sign-in | Design below. It reuses the same Supabase Google provider, needs no new Google client, and adds no new native dependencies (`expo-web-browser` and `expo-linking` are already installed). | Feature |
| 3 | Mobile Doctor Visit Report differs from web | 40+ differences across layout, content, section order, and data logic. Full table and a fix plan below. | High (UX) |
| 4 | PHP reference | It uses **Google Identity Services (ID-token / One Tap popup)**, not a redirect flow, with a **different** client (`960922216742-0air42eq…`). That client has JavaScript origins only, so reusing it as-is would fail the same way. | Info |

**Evidence (all read-only):**
- `auth.identities` grouped by provider shows **only `email` (9)** and **zero `google`**. No Google sign-in has ever completed.
- Supabase edge logs show `GET /auth/v1/authorize?provider=google&redirect_to=https://rx-tracker-web.dwdrm.com/auth/callback…` → **302**, and there is **no** `/auth/v1/callback` request afterwards. So the user never returned from Google.
- I fetched `/auth/v1/authorize?provider=google` myself. It returns a 302 to `accounts.google.com/o/oauth2/v2/auth?client_id=747694774840-h9uajpco868nd3dja87brcnd2v5l2rqs.apps.googleusercontent.com&redirect_uri=https://mabtmqhqtsuiglxwxsnu.supabase.co/auth/v1/callback&scope=email+profile`. Following it, Google answers **"Access blocked … Error 400: redirect_uri_mismatch"**.
- `GET https://rx-tracker-web.dwdrm.com/auth/callback?code=bogus` → `307 Location: https://0.0.0.0:3000/login?error=auth-callback-failed`.
- The PHP live login page embeds `data-google-client-id="960922216742-0air42eq50ok3jr1muf0l5hrr3gld82r.apps.googleusercontent.com"`.

---

## Issue 1: Web Google sign-in/sign-up is broken

### What the code does (it is correct up to the callback)

- `app/(auth)/login/page.tsx:51-63` and `app/(auth)/signup/page.tsx:64-77` call `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: <origin>/auth/callback?next=… } })` using `@supabase/ssr`'s browser client. That client uses PKCE, and the code verifier is stored in a cookie.
- `proxy.ts` (Next 16's replacement for `middleware.ts`) runs `lib/supabase/proxy.ts`. `/auth/callback` is in `PUBLIC_PATHS` (line 9), so the guard does **not** block the callback.
- `app/auth/callback/route.ts` calls `exchangeCodeForSession(code)` and then redirects to `${origin}${next}`.

### Root cause A: Google Cloud redirect URI missing (confirmed)

Supabase is configured with client **`747694774840-h9uajpco868nd3dja87brcnd2v5l2rqs`**. Google rejects it with `redirect_uri_mismatch`. That means the client exists and is enabled; otherwise you'd see `invalid_client` / "OAuth client was not found". But its **Authorized redirect URIs** list does not contain exactly:

```
https://mabtmqhqtsuiglxwxsnu.supabase.co/auth/v1/callback
```

#### Google Cloud Console: what to check

Go to APIs & Services → Credentials → OAuth 2.0 Client IDs and open the client whose ID starts `747694774840-h9uajpco`.

| Field | Correct value | What a wrong value looks like |
|---|---|---|
| Application type | **Web application** | "Android" or "iOS" (those have no redirect-URI field, so Supabase can't use them), or "Desktop" |
| Authorized redirect URIs | `https://mabtmqhqtsuiglxwxsnu.supabase.co/auth/v1/callback` (exact; no trailing slash; `https`) | Empty; the web app's own URL (`https://rx-tracker-web.dwdrm.com/auth/callback`). That is a common mistake: Google redirects to **Supabase**, not to your app. Other wrong forms: `…/auth/v1/callback/`, `http://…`, a different project ref, or the PHP site URL |
| Authorized JavaScript origins | Optional for this flow. Add `https://rx-tracker-web.dwdrm.com` if you want | Not the cause |
| Client secret | Must equal the secret pasted in Supabase | A mismatch shows up *after* this is fixed, as a Supabase callback error `invalid_client` / "Unable to exchange external code" |

Then go to **OAuth consent screen** (Google Auth Platform → Audience / Branding):

| Field | Correct | Wrong / symptom |
|---|---|---|
| Publishing status | **In production** | "Testing": only listed test users (max 100) can sign in. Anyone else gets "Access blocked: … has not completed the Google verification process" / `access_denied`. Scopes are `email profile` (non-sensitive), so publishing needs no Google review unless you upload a logo |
| User type | External | "Internal": only accounts in your Workspace org can sign in (`org_internal`) |
| Scopes | `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid` | — |
| Authorized domains | `supabase.co`, `dwdrm.com` | Missing domains block publishing / branding |

#### Supabase dashboard: what to check

1. **Authentication → Sign In / Providers → Google**
   - Enabled = **on**. Confirmed on: authorize returns 302 to Google. If it were off you'd get `400 {"msg":"Unsupported provider: provider is not enabled"}`.
   - Client ID = `747694774840-h9uajpco…apps.googleusercontent.com`. Confirmed.
   - Client Secret = the secret of **that same** client. Can't be checked from outside. A wrong value fails only after the redirect-URI fix, at `/auth/v1/callback` with "Unable to exchange external code".
   - "Callback URL (for OAuth)" shown on this page is `https://mabtmqhqtsuiglxwxsnu.supabase.co/auth/v1/callback`. Copy this exact string into Google.
   - "Skip nonce check" can stay off for the web redirect flow.
2. **Authentication → URL Configuration**
   - **Site URL** should be `https://rx-tracker-web.dwdrm.com`. A wrong value such as `http://localhost:3000` means confirmation and recovery emails, plus any OAuth redirect whose `redirect_to` is not allow-listed, land on localhost.
   - **Redirect URLs** must allow-list the callback, including its query string. Add:
     ```
     https://rx-tracker-web.dwdrm.com/auth/callback**
     http://localhost:3000/auth/callback**
     rxtrackerapp://auth/callback            (for Android, Issue 2)
     ```
     If this is missing, Supabase silently **ignores** `redirect_to` and sends the user to the Site URL with `?code=…`. The user lands on `/` (or `/login`), the code is never exchanged, and they look "not signed in". The current redirect_to includes `?next=%2F…`, so you need the `**` wildcard (or `?**`). An exact entry without the query string won't match.
3. **Authentication → Sign In / Providers → (Auth settings)** has **"Allow manual linking"**. This must be **on** for the profile page's "Connect Google" (`components/profile/ProfileClient.tsx:295`, `linkIdentity`). Otherwise you get `Manual linking is disabled`.
4. **Account matching / auto-linking:** Supabase automatically links a Google identity to an existing user with the **same verified email**. Google emails are verified. So the 9 existing email/password users who click "Continue with Google" with the same address will land in their existing account, not a duplicate. This matches the PHP behaviour (Issue 4). An email user who **never confirmed** their address will *not* be auto-linked. Supabase may then create a separate account or error, depending on settings.

### Root cause B: callback redirects to `0.0.0.0:3000` (confirmed)

`app/auth/callback/route.ts:10` uses `const { origin } = new URL(request.url)`. On Hostinger, the Node server listens on `0.0.0.0:3000` behind a reverse proxy, so `request.url`'s origin is `https://0.0.0.0:3000`. I confirmed this live with a `307 → https://0.0.0.0:3000/login?...`. Even after Google and Supabase are fixed, the session cookie gets set and then the browser is sent to an unreachable host.

The `proxy.ts` redirects are fine. They emit a *relative* `Location: /login?...` (also confirmed live). Only the callback route builds an absolute URL.

**Recommended fix:** build the redirect from the forwarded host, or from a configured site URL. Validate `next` in the same change (Issue 1c):

```ts
// app/auth/callback/route.ts
function safeNext(raw: string | null): string {
  // Only same-site absolute paths: "/x", never "//x", "/\\x", "@x", "https:…"
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;          // e.g. https://rx-tracker-web.dwdrm.com
  if (configured) return configured.replace(/\/$/, "");
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = siteOrigin(request);
  const next = safeNext(searchParams.get("next"));
  // …unchanged exchange / verifyOtp logic…
  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`);
}
```

Add `NEXT_PUBLIC_SITE_URL=` to `.env.local.example` and set it in Hostinger. Also check `/auth/callback` after the fix: the `next` value from `login/page.tsx` comes from `?redirectTo=`, which is attacker-controllable. Apply the same `safeNext` check client-side before `router.push(redirectTo)` (`login/page.tsx:20,47`).

### 1c. Open redirect (security)

`NextResponse.redirect(`${origin}${next}`)` with `next=@evil.example` produces `https://rx-tracker-web.dwdrm.com@evil.example`. Browsers treat the part before `@` as userinfo, so this navigates to `evil.example` right after a successful sign-in. That makes it a phishing vector. `safeNext` above fixes it.

### 1d. Silent failure UX

Nothing reads `?error=auth-callback-failed`; it only appears at `app/auth/callback/route.ts:32`. Add to `LoginForm`:

```ts
const callbackError = searchParams.get("error");
const [error, setError] = useState<string | null>(
  callbackError === "auth-callback-failed" ? "Google sign-in couldn't be completed. Please try again." : null,
);
```

Also forward Supabase's own `error_description` param, which Supabase appends when it fails at its callback.

### Related (non-blocking) observations

- The "Remember me for 30 days" checkbox (`login/page.tsx:24,141`) is never used. Session length is governed by Supabase (Auth → Sessions), not this flag. Remove it or wire it up.
- The Google consent screen will say "to continue to **mabtmqhqtsuiglxwxsnu.supabase.co**". To show your own domain, use a Supabase custom domain (paid add-on), or accept it.
- Supabase security advisor (read-only):
  - Leaked-password protection disabled.
  - 17 functions with mutable `search_path`.
  - 5 `SECURITY DEFINER` functions executable by `anon`: `reorder_medications`, `sync_medication_group_schedule_time*`, `propagate_group_scheduled_time`, `cleanup_medication_group_schedule_time`. These look like trigger helpers that shouldn't be exposed over RPC.
  - Not auth-blocking, but worth a follow-up pass: `revoke execute … from anon, authenticated` and `set search_path = ''`.

### Verification checklist after fixing

1. In an incognito window, open `https://mabtmqhqtsuiglxwxsnu.supabase.co/auth/v1/authorize?provider=google`. You should see the Google account chooser, not "Error 400".
2. Complete sign-in. Supabase logs should show `GET /auth/v1/callback` 302 → `https://rx-tracker-web.dwdrm.com/auth/callback?code=…&next=…`.
3. `/auth/callback` should 307 to `https://rx-tracker-web.dwdrm.com/dashboard`, not `0.0.0.0`.
4. `select provider, count(*) from auth.identities group by 1` should now include `google`.

---

## Issue 2: Android Google sign-in (design)

**Current state:**
- No Google button exists in `src/app/(auth)/login.tsx` or `src/app/(auth)/signup.tsx`.
- `AuthProvider` has only email/password.
- `src/app/profile/index.tsx:73-76` shows a "coming soon" alert for Connect/Disconnect.
- Supabase client: `src/lib/supabase/client.ts` uses `detectSessionInUrl: false` and does not set `flowType`, so it defaults to `implicit`.
- App scheme `rxtrackerapp`, package `com.anonymous.rxtrackerapp`, Expo SDK **57**. Docs checked: `docs.expo.dev/versions/v57.0.0/sdk/webbrowser`, `…/linking`.
- `expo-web-browser` and `expo-linking` are already dependencies, so **no new native module and no dev-build change** is needed.

### Recommended approach: browser-based Supabase OAuth with PKCE (Custom Tabs)

Why this approach instead of native Google Sign-In (`@react-native-google-signin` + `signInWithIdToken`):
- It reuses the **same** Supabase Google provider and **same** Web OAuth client as the web app.
- Google sees `redirect_uri = https://…supabase.co/auth/v1/callback` exactly as it does on web. So you need **no Android OAuth client, no SHA-1 fingerprint registration, and no extra Google Cloud work** beyond Issue 1's fix.
- Sideloaded APKs signed with varying EAS or local keys would otherwise each need their SHA-1 registered.
- It works the same in the dev client and release APK.

**Flow:**

```
App ──signInWithOAuth({skipBrowserRedirect, redirectTo: rxtrackerapp://auth/callback})──▶ gets Supabase authorize URL
App ──WebBrowser.openAuthSessionAsync(url, redirectTo)──▶ Chrome Custom Tab → Google → supabase.co/auth/v1/callback
Supabase ──302──▶ rxtrackerapp://auth/callback?code=XYZ   (Custom Tab closes, promise resolves {type:'success', url})
App ──supabase.auth.exchangeCodeForSession(code)──▶ session persisted in AsyncStorage → onAuthStateChange → AuthProvider
```

**Code sketch** (not applied):

```ts
// src/lib/supabase/client.ts — add PKCE
export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: isServer ? undefined : AsyncStorage, autoRefreshToken: !isServer,
          persistSession: !isServer, detectSessionInUrl: false, flowType: 'pkce' },
});
```

```ts
// src/lib/supabase/google-auth.ts (new)
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './client';

WebBrowser.maybeCompleteAuthSession(); // no-op on native; needed for the web target

export const AUTH_REDIRECT = Linking.createURL('auth/callback'); // release/dev build → rxtrackerapp://auth/callback

async function runOAuth(getUrl: () => Promise<{ url: string | null; error: Error | null }>) {
  const { url, error } = await getUrl();
  if (error || !url) return { error: error?.message ?? 'Could not start Google sign-in' };
  const result = await WebBrowser.openAuthSessionAsync(url, AUTH_REDIRECT);
  if (result.type !== 'success') return { error: null, cancelled: true };
  const { queryParams } = Linking.parse(result.url);
  if (queryParams?.error_description) return { error: String(queryParams.error_description) };
  const code = queryParams?.code;
  if (typeof code !== 'string') return { error: 'Google did not return an authorization code' };
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  return { error: exErr?.message ?? null };
}

export const signInWithGoogle = () =>
  runOAuth(async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true,
                 queryParams: { prompt: 'select_account' } },
    });
    return { url: data?.url ?? null, error };
  });

// Profile "Connect" — same pattern with linkIdentity (requires "Allow manual linking")
export const linkGoogle = () =>
  runOAuth(async () => {
    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'google', options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true },
    });
    return { url: data?.url ?? null, error };
  });
```

- Expose `signInWithGoogle` from `AuthProvider`.
- In `login.tsx` and `signup.tsx`, add the divider plus a secondary full-width "**G** Continue with Google" button, matching DESIGN.md §auth and the web order.
- On `profile/index.tsx`, replace `googleUnavailable` with `linkGoogle`. For Disconnect use `supabase.auth.unlinkIdentity(identity)`, keeping the web rule that Disconnect is disabled when Google is the only identity. Refresh with `supabase.auth.getUserIdentities()` afterwards.

**Expo Router deep-link catch:**
- When Supabase redirects to `rxtrackerapp://auth/callback`, Android also delivers the intent to the app. Expo Router may try to navigate to `/auth/callback` and show the not-found screen.
- Add a tiny route `src/app/auth/callback.tsx` that renders a spinner and does `<Redirect href="/" />`. The session is handled by `openAuthSessionAsync`'s result.
- Alternatively, handle it in `src/app/+native-intent.tsx`. This would also cover a cold start where the custom tab outlived the JS context: read `code`, exchange it, then return `/`.

**Supabase config:**
- Add `rxtrackerapp://auth/callback` to Redirect URLs. For Expo Go testing, also add `exp://**`, though Expo Go isn't the target.
- No Google Cloud change is needed beyond Issue 1.

**Optional hardening:**
- Change `android.package` from `com.anonymous.rxtrackerapp` to a real reverse-DNS ID (e.g. `com.dwdrm.rxtracker`) **before** distributing widely, since changing it later means a new app install.
- Not required for the browser flow.

**Testing:** run `npx expo run:android` or an EAS `development` build. Expected result: the Custom Tab opens the Google chooser, closes, and the dashboard loads. `auth.identities` should show `google` for the user.

---

## Issue 3: Doctor Visit Report, mobile vs web

**Web (source of truth):**
- `components/export/ExportClient.tsx`: controls plus on-screen preview.
- `components/export/ReportSummary.tsx`: the on-screen report.
- `components/export/DoctorVisitReportPdf.tsx`: the A4 PDF via `@react-pdf/renderer`.
- `ReportAdherenceRing.tsx` and `ReportTrendChart.tsx`.

**Mobile:**
- `src/app/(tabs)/export.tsx`: controls only.
- `src/lib/export.ts`: data plus a plain HTML string sent to `expo-print`.

### 3.1 Export screen (controls) differences

| # | Web | Mobile | Fix |
|---|---|---|---|
| S1 | Reporting Period: native `<input type="date">` pickers | Free-text `YYYY-MM-DD` fields with no validation feedback | Use a date picker. `@expo/ui` is already installed and has a native DatePicker, or use a tappable Field that opens `DateTimePicker`. Show `formatShortDate` text |
| S2 | Card copy: "Generate a branded PDF summary of your medication history, adherence, pain trends, side effects, and (optionally) mood trends — ready to share with your doctor." | Different copy ("Compiles your medications…") | Use the web string verbatim |
| S3 | When Pain is on: a bordered **"Pain-tracked medications"** panel listing each med with "**N days on medication**" (`activeDaysOnMedication`) | Missing | Port the panel. Mobile already has `medication-days.ts`; add `activeDaysOnMedication` if absent |
| S4 | Same for **"Mood-tracked medications"** | Missing | Same |
| S5 | Medication chips: name + dose via `MedicationNameWithDose`, "(inactive)" as a muted separate span | Inactive marker is concatenated into the dose string | Render "(inactive)" as a separate muted `Text` |
| S6 | Button "**Generate & Download PDF**" with FileDown icon | "Generate & share PDF", no icon | Use "Generate & Share PDF" (sharing is the platform reason) with a `FileDown` lucide icon |
| S7 | Success callout "Your PDF is downloading… / Open PDF" | None after the share sheet closes | Add a success Callout with "Share again" / "Open" (re-share the saved `uri`) |
| S8 | **Full on-screen report preview** (`ReportSummary`) below the controls; it updates live as options change | **No preview at all.** The report is only visible inside the PDF | **Biggest visual gap.** Build `src/components/export/report-summary.tsx` (see 3.4) |
| S9 | Button disabled while any query is loading | Disabled only while meds load | Fine as-is, since mobile builds the data on tap; once a preview exists, gate on preview loading |
| S10 | PDF filename `RxTracker-Doctor-Visit-Report-MM-DD-YYYY-to-MM-DD-YYYY.pdf` | expo-print's random UUID filename in the share sheet; the web-target fallback uses `RxTracker-report-YYYY-MM-DD…` | After `printToFileAsync`, move the file to `${Paths.cache}/RxTracker-Doctor-Visit-Report-….pdf` with `expo-file-system` (already a transitive Expo dep; add via `npx expo install expo-file-system`), then share. Pass `dialogTitle` |

### 3.2 PDF document: structure and visuals

| # | Area | Web PDF | Mobile HTML/PDF | Fix |
|---|---|---|---|---|
| P1 | Page size | **A4**, 32pt side margins, 85pt bottom reserved for footer | expo-print default (US Letter on Android) with `body{padding:24px}` | `Print.printToFileAsync({ html, width: 595, height: 842, margins: {left:0,right:0,top:0,bottom:0} })` and use CSS `@page { size: A4; margin: 0 }` |
| P2 | Header | **Dark navy band** (`#071d3d`), 48×48 rounded **app logo**, white title "Doctor Visit Report", two `#cfe6f7` subtitle lines: "Prepared by RxTracker • Patient: X" / "Reporting period: Mon D, YYYY – … • Generated: …". **Repeats on every page** (`fixed`) | Plain h1 "RxTracker Doctor Visit Report" in navy, one muted subtitle "Name · dates · Generated", no logo, not repeated | Use the HTML header below. To repeat it per page, use a `<table>` with `<thead>` (Chromium print repeats `thead`) or accept first-page-only |
| P3 | Logo | `/icons/icon-512.png` | None | Embed `assets/images/icon.png` as a base64 data URI. Either generate a constant once, or resolve at runtime with `Asset.fromModule(require(...))` + `File(...).base64()` |
| P4 | Font | Helvetica 9pt body, 12.5pt bold navy section titles, 8.5pt muted descriptions | System font 12px, h2 14px with an underline border | `font-family: Helvetica, Arial, sans-serif; font-size: 9pt;` h2 `12.5pt; font-weight:700; color:#102b57; border:none; margin-bottom:4pt` |
| P5 | Section order | Allergies → Adherence → Current Meds → **Side Effects** → Discontinued → Dose Changes → Missed Dose Detail → Pain → Mood | Adherence → Current → Discontinued → Dose Changes → Missed → Side Effects → **Allergies** → Pain → Mood | Reorder to match web. Allergies first matters clinically |
| P6 | Empty sections | **Always rendered** with an italic empty label ("No allergies recorded.", "No side effects logged for this period.", "No discontinued medications for this profile.", "No dose changes recorded during this period.", "No missed or skipped doses for this period.") | Discontinued, Dose Changes, Missed, and Side Effects are **omitted** when empty; others use different labels ("None recorded.", "No active medications.") | Always render; copy the labels verbatim |
| P7 | Section titles | "Known Allergies & Intolerances", "Reported Side Effects", "Missed Dose Detail", "Pain Level Tracking", "Mood & Wellbeing Tracking" | "Allergies", "Side Effects", "Missed Doses", "Pain Trend", "Mood Trend" | Rename |
| P8 | Section descriptions | Side Effects, Discontinued, Missed, Pain, and Mood each have a muted 8.5pt description line (see `ReportSummary.tsx`) | None | Add the same strings |
| P9 | Tables | Header row on `#f6faff`, 7.5pt **UPPERCASE** bold muted `th`; rows separated by `#d7e6f8` 1pt borders; 6pt/8pt padding; flex column weights | Plain table, `th` 600 weight, `#EAF4FF` borders | CSS: `th{background:#f6faff;font-size:7.5pt;font-weight:700;text-transform:uppercase;color:#60708a;padding:6pt 8pt}` `td{font-size:8.5pt;padding:6pt 8pt;border-bottom:1pt solid #d7e6f8;vertical-align:top}` plus `<colgroup>` widths matching the flex ratios |
| P10 | Footer | **Fixed on every page**: disclaimer "RxTracker is a self-tracking aid and does not provide medical advice…" + "Generated … · **Page N of M**" | None (no disclaimer, no page numbers) | Add the disclaimer at minimum (a compliance/UX need). Android's `printToFileAsync` can't do CSS page counters reliably, so put the disclaimer and "Generated …" at the end, or repeat via `<tfoot>`. Page numbers: accept as a platform limitation or post-process |

### 3.3 Section-by-section content differences

| # | Section | Web | Mobile | Fix |
|---|---|---|---|---|
| C1 | Allergies | Table **Substance / Type** (Allergy vs Intolerance) | Bullet list "Name (severity)" / "(life-threatening)" | Use the web table. If you want severity shown, add it to **both** platforms |
| C2 | Adherence | **Ring** (overall %, color by band ≥80 green / ≥50 amber / else red) + **4 stat tiles** (Scheduled navy, Taken `#18bfa6`, Missed `#e5484d`, Skipped `#f5a524`; 90pt tall with a `#d7e6f8` label bar) | One sentence: "**X%** overall (a taken / b scheduled — c missed, d skipped)" | HTML/SVG version below |
| C3 | Adherence breakout | Intro line "Adherence by medication is broken out below where rates differ from the overall average." Columns **Medication** (name + type badge + feedback chips) / **Adherence** (colored %) / **Missed** ("m of n") | No intro; columns Medication / Adherence / Scheduled / Missed/Skipped; plain % | Match web |
| C4 | Medication label (everywhere) | Bold name + gray dose, then a row of **Rx/OTC/Supplement badge** + **feedback chips**; optional "(Resumed use on …)" annotation | "Name — dose" plain text using legacy `m.dose` | Port `MedicationLabel`: badge colors `MED_TYPE_STYLES` (Rx `#0754a8`, OTC `#0a8ac8`, Supplement `#f5a524`, all at 10% bg); chips from `feedbackChipTypes`. Use `formatPrescribedDose` (dose_amount + unit), not `m.dose` |
| C5 | Current Medications | Columns **Medication / Dose / Start Date / Schedule / Instructions**; "Resumed use on" annotation | Medication / Schedule only | Add Dose, Start Date, Instructions, and the resumed annotation (latest `resumed` status event) |
| C6 | Side Effects | **Date / Medication / Severity / Side Effect / Notes**, newest first | Medication / Date / Severity / Description; **no Notes** | Reorder columns; add `note` |
| C7 | Discontinued | **Medication / Dose / Reason / Notes (comment) / Date Discontinued** | Medication / Discontinued on / Reason | Add Dose and Notes (`event.comment`); reorder |
| C8 | Dose Changes | **Date / Medication / Change / Comment**; "a → b", "Set to b", "Removed from a" | Medication / Date / Change / Comment; prints "—mg → 5mg" when old is null | Reorder; port the three-way change text |
| C9 | Missed Dose Detail | **Date / Medication / Scheduled Time (12h) / Status badge**; includes **missed AND skipped** | Medication / Date / Time (24h "08:00"); **missed only** | Include skipped; use `to12h`; add a status pill (Missed red / Skipped amber) |
| C10 | Missed overflow note | "+ N additional missed/skipped doses in this period (full list available in app)." | "Showing X of Y missed doses in this period." | Use web copy |
| C11 | Pain/Mood granularity | **One block per tracked medication**: label + "Reporting period … \| Avg pain: x/10 \| Days logged: n" + **line chart** + **Patient notes** grouped by date ("8:00 AM (dose — Med 5mg): note [edited …]") | **One merged block** per metric with a Date / Level (avg) **table**, no notes, no average, no chart | Call `getTrend(metric, start, end, profileId, med.id)` per tracked med (`medicationTracksPain/Mood`). Render the SVG chart and notes (see 3.4). Standalone logs with `medication_id = null` currently appear only in the mobile merged view; on web they appear per medication only when tied to one. Decide on one rule for both |
| C12 | Mood chart scheme | Honors `app_settings.mood_chart_scheme` | N/A | Read the same setting via mobile `app-settings.ts` |
| C13 | Patient name | Same resolution logic on both | Same | OK |

### 3.4 How to make mobile match: recommended implementation

1. **Share one report-data shape.** Rename mobile `ReportData` to mirror web's `DoctorVisitReportData`: `currentMedications: {medication, resumedOn}[]`, `painTrends`/`moodTrends` per med with `notes`, `missedDoseDetail` rows carrying `status`, and `moodChartScheme`. Then both the PDF HTML and an on-screen preview consume it.
2. **Rewrite `renderReportHtml`** as a port of `DoctorVisitReportPdf.tsx`, using the same color constants and section order. Key fragments:

   ```ts
   const C = { NAVY:'#102b57', DARK:'#071d3d', TEXT:'#172033', MUTED:'#60708a', BORDER:'#d7e6f8',
               CARD:'#f6faff', SUCCESS:'#18bfa6', WARNING:'#f5a524', DANGER:'#e5484d' };

   const header = (d: ReportData, logo: string) => `
     <div class="hdr"><img src="${logo}" class="logo"/><div>
       <div class="title">Doctor Visit Report</div>
       <div class="sub">Prepared by RxTracker • Patient: ${esc(d.patientName)}</div>
       <div class="sub">Reporting period: ${fmtShort(d.startDate)} – ${fmtShort(d.endDate)} • Generated: ${esc(d.generatedAt)}</div>
     </div></div>`;

   const ring = (pct: number) => {           // approximates ReportAdherenceRing — copy its exact geometry when implementing
     const r = 30, c = 2 * Math.PI * r, col = pct >= 80 ? C.SUCCESS : pct >= 50 ? C.WARNING : C.DANGER;
     return `<svg width="76" height="76" viewBox="0 0 76 76">
       <circle cx="38" cy="38" r="${r}" fill="none" stroke="${C.BORDER}" stroke-width="8"/>
       <circle cx="38" cy="38" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round"
         stroke-dasharray="${(c * pct) / 100} ${c}" transform="rotate(-90 38 38)"/>
       <text x="38" y="43" text-anchor="middle" font-size="15" font-weight="700" fill="${C.NAVY}">${pct}%</text></svg>`;
   };

   const tile = (label: string, value: number, color = C.NAVY) =>
     `<div class="tile"><div class="tv" style="color:${color}">${value}</div><div class="tl">${label}</div></div>`;
   ```
   ```css
   @page { size: A4; margin: 0 }
   body { margin:0; font: 9pt Helvetica, Arial, sans-serif; color:#172033 }
   .hdr { display:flex; align-items:center; gap:16pt; background:#071d3d; padding:24pt 32pt; margin-bottom:20pt }
   .logo { width:48pt; height:48pt; border-radius:12pt } .title { font-size:20pt; font-weight:700; color:#fff }
   .sub { font-size:9.5pt; color:#cfe6f7; margin-top:4pt } .body { padding:0 32pt }
   h2 { font-size:12.5pt; font-weight:700; color:#102b57; margin:0 0 4pt } .desc { font-size:8.5pt; color:#60708a; margin-bottom:8pt }
   .stats { display:flex; gap:10pt; page-break-inside:avoid } .tile { flex:1; height:90pt; background:#f6faff; border-radius:8pt; overflow:hidden; display:flex; flex-direction:column }
   .tv { flex:1; display:flex; align-items:center; justify-content:center; font-size:16pt; font-weight:700 }
   .tl { background:#d7e6f8; padding:4pt 0; font-size:6.5pt; text-transform:uppercase; text-align:center; color:#102b57 }
   .badge { font-size:7pt; font-weight:700; text-transform:uppercase; padding:1.5pt 4pt; border-radius:3pt; margin-right:4pt }
   section { margin-bottom:16pt } .empty { font-style:italic; color:#60708a }
   ```
3. **Trend chart:** port `ReportTrendChart.tsx` / the PDF's SVG chart into a pure function `trendChartSvg(points, metric, scheme): string`. It needs no charting library: x scaled by day index over the period, y 1–10, polyline plus circles, hollow circles for standalone entries. Inline the SVG in the HTML. Android's WebView-based print renders inline SVG correctly.
4. **On-screen preview (S8):** add `src/components/export/report-summary.tsx` in React Native, fed by the same data. Use the existing `Card`, `MedTypeBadge` (`ui/med-type-badge.tsx`), `ScoreBadge`, `SeverityBar`, and `TrendChart` (`components/TrendChart.tsx`, already used by the Pain & Mood tab).
   - Phone width can't fit 5-column tables. Web itself scrolls tables horizontally (`min-w-[640px]`). Render each row as a stacked "row card" with label: value pairs, or wrap tables in a horizontal `ScrollView` to match web literally.
   - The header band uses `GradientFill` (`ui/gradient-fill.tsx`) with `bg-gradient-brand-dark`, matching web's `ReportSummary` header.
   - Build data reactively when dates and toggles change (debounced), not only on "Generate".
5. **Missed-dose data logic (cross-platform discrepancy, flagged):**
   - **Web** reads `dose_logs` rows only (`getDoseLogStatusesInRange`, `getMissedDoseLogsInRange`). It depends on `finalizeMissedDoses` having written `missed` rows, which happens only when the web dashboard or calendar is opened for that date range.
   - **Mobile** never writes `missed` rows, and synthesizes misses in the report (`reportSlotsForDate`).
   - Result: a mostly-mobile user's **web** report under-counts misses and over-states adherence, and the two platforms give different numbers for the same period. Mobile also reconstructs slots only for *currently active* meds.
   - Recommendation: pick one source of truth. Best is a server-side finalizer: a scheduled Supabase function or `pg_cron`. `cron.job` does not exist today, so `pg_cron` is not enabled. Otherwise, share the synthesis logic on both platforms. This is beyond the visual fix, but it affects whether the reports "match".
6. **Web bug spotted while comparing:** web `doseChanges` is **not filtered by the reporting period** (`ExportClient.tsx:219-237` keeps every change for in-period meds). The empty label still says "during this period". Mobile filters by date correctly. Fix web by adding `.filter(c => { const d = localDateFromTimestamp(c.at); return d >= startDate && d <= endDate; })`, or retitle the section "Dose Change History".

---

## Issue 4: PHP reference implementation (`rx-tracker`)

| Aspect | PHP app |
|---|---|
| Flow | **Google Identity Services** (`https://accounts.google.com/gsi/client`), `google.accounts.id.initialize({ client_id, ux_mode:'popup', use_fedcm_for_prompt:true })`. The browser receives a signed **ID token** (`credential`) and POSTs it to `index.php?page=google-login` (`assets/js/google-auth.js`). **No redirect URI** is involved |
| Server verification | `includes/GoogleAuthService.php`: hand-rolled RS256 verification against Google JWKS (disk-cached). Checks `iss` ∈ {accounts.google.com}, `aud == GOOGLE_CLIENT_ID`, `exp`/`iat`/`nbf`, and requires `email_verified` |
| Scopes | Implicit GSI defaults: `openid email profile` |
| Account matching | 1) match `users.google_id = sub`; 2) else match `users.email = email` (lower-cased) and attach `google_id`; 3) else create a user with `password_hash = NULL`, `email_verified = 1`, name and picture from claims. Linking (`google_link.php`) rejects a Google account already linked elsewhere **and requires the same email**. Unlinking requires a password to exist |
| OAuth client | `GOOGLE_CLIENT_ID = 960922216742-0air42eq50ok3jr1muf0l5hrr3gld82r.apps.googleusercontent.com`, read from the live page. Configured on origin `https://rx-tracker.dwdrm.com` (`APP_URL`) |
| Redirect URIs used | **None.** GSI popup needs only **Authorized JavaScript origins** (`https://rx-tracker.dwdrm.com`) |

**Implications:**
- Supabase currently uses a **different** client (`747694774840-…`), likely in a different Google Cloud project, since the project-number prefixes differ.
- **Reusing the PHP client is possible**: same consent screen, already in whatever publishing state it's in. You would:
  1. Add redirect URI `https://mabtmqhqtsuiglxwxsnu.supabase.co/auth/v1/callback` to client `960922216742-…`.
  2. Create or get its client secret.
  3. Put that ID and secret into Supabase's Google provider.
  4. Optionally add `rx-tracker-web.dwdrm.com` to its JS origins.
- If the PHP site's consent screen is already **In production**, this is the fastest path and avoids the Testing-mode trap. Otherwise just fix the `747694774840` client as in Issue 1. Either works; don't mix (the ID and secret must come from the same client).
- **Supabase reproduces the PHP matching logic:**
  - Auto-link by verified email ≈ PHP step 2.
  - `identities` ≈ `google_id`.
  - "Can't unlink last identity" ≈ PHP's "create a password first".
  - PHP's "link must use the same email" check has **no** Supabase equivalent: `linkIdentity` will link a Google account with a different email. Decide whether that's acceptable. If not, after `linkIdentity` succeeds, compare `identity.identity_data.email` to `user.email`, and `unlinkIdentity` plus show an error on mismatch.
- Do **not** port the hand-rolled JWT verification. If you later want a GSI-style One Tap on web, use `supabase.auth.signInWithIdToken({ provider:'google', token })` with the same Web client ID. It's not needed to fix the current problem.

---

## Prioritized fix list

1. **Google Cloud:** add `https://mabtmqhqtsuiglxwxsnu.supabase.co/auth/v1/callback` to the client configured in Supabase. Confirm the secret matches and the consent screen is In production. *(Unblocks web; 5 min.)*
2. **Supabase URL config:** Site URL = `https://rx-tracker-web.dwdrm.com`. Redirect URLs include `https://rx-tracker-web.dwdrm.com/auth/callback**`, the localhost equivalent, and `rxtrackerapp://auth/callback`. Enable "Allow manual linking".
3. **Web code:** fix the `/auth/callback` origin (`NEXT_PUBLIC_SITE_URL` / forwarded host) and add `safeNext` (open redirect). Show callback errors on `/login`.
4. **Android:** add the PKCE + `openAuthSessionAsync` Google sign-in, a profile Connect/Disconnect, and an `auth/callback` route.
5. **Mobile report:** reorder and rename sections; always render sections; add the header band, logo, stat tiles, ring, badges, and missing columns; per-medication SVG trend charts plus patient notes; A4; disclaimer footer; on-screen preview; date pickers; filename.
6. **Cross-platform data:** unify missed-dose finalization. Fix web dose changes not being period-filtered.
7. **Supabase hygiene** (advisors): revoke `anon` execute on `SECURITY DEFINER` helpers, set `search_path`, enable leaked-password protection.
