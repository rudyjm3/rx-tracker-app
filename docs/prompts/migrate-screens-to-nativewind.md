Migrate the rest of the RxTracker mobile app's screens and components from `StyleSheet` / `ThemedText` / `ThemedView` to NativeWind, so the app's styling follows the same conventions as the web app. Behavior and data logic must not change — this is a styling migration.

## Repos and context

- App (the one you'll change): `rudyjm3/rx-tracker-app` — Expo SDK 57 / React Native 0.86 / Expo Router (`src/app`). Start from the latest `main`.
- Web (reference only): `rudyjm3/rx-tracker-web` — Next.js + Tailwind v4. Its `DESIGN.md` is mirrored in the app repo's `DESIGN.md` (identical). **Read `DESIGN.md` first** (colors, type, spacing, component specs, every screen, dialogs, alerts, and section 17 = the React Native translation guide).
- Read `AGENTS.md` / `CLAUDE.md` in the app repo before touching Expo APIs (Expo changes a lot — check the versioned docs rather than trusting memory). Use `npx expo install` for new packages.
- Follow the branch name your session assigns. Commit in small, logical batches. Do **not** open a PR unless I ask; when I do, use the repo's PR conventions.

## What's already done (don't redo, reuse)

NativeWind 4.2.7 (Tailwind v3) is set up: `tailwind.config.js` (brand/status/`night-*` dark tokens, radii `control` 10 / `card` 18 / `hero` 28, `shadow-card`), `babel.config.js`, `metro.config.js`, `nativewind-env.d.ts`, `src/global.css` (imported in `src/app/_layout.tsx`). Tokens mirror the web `@theme` — **class names are shared with web** (`bg-brand-bg`, `text-brand-text-muted`, `text-status-danger`, `rounded-card`, `shadow-card`, `border-brand-border`, `bg-status-success/10`, …). Dark mode uses `dark:` variants with the `night-*` surface tokens (`bg-night-bg`, `bg-night-card`, `border-night-border`, `bg-night-selected`, `text-night-muted`).

Already on NativeWind: `src/app/(tabs)/index.tsx` (dashboard), `src/components/ui/*` (`Button` with `onDark`/`labelClassName`, `Card`, `Badge`, `MedTypeBadge`, `Field`, `Text`, `Sheet`, `SafeArea`), `src/components/dashboard/*`, `app-header.tsx`, `alerts-sheet.tsx`, `more-sheet.tsx`, `profile-menu-sheet.tsx`, `profile-avatar.tsx`, `legal-document.tsx`, `legal-links.tsx`. Use these as the pattern. Bottom nav (Dashboard, Medications, Calendar, Export, More) and the global header (logo, bell, avatar, family banner) are in `src/app/(tabs)/_layout.tsx` + `src/components/app-header.tsx`.

## Still to migrate (files that still use StyleSheet/ThemedText/ThemedView; line counts)

Do them in this order, committing after each batch:

1. Auth: `src/app/(auth)/login.tsx` (129), `signup.tsx` (152) — follow the web auth look in DESIGN.md 8.1/8.2 (card, gradient primary button, labeled inputs, error alert, footer `LegalLinks`). The app has no Google sign-in; skip that button.
2. Banners/overlays: `src/components/LowSupplyBanner.tsx` (151) → the gradient refill reminder (DESIGN.md 10.2); `ResumeSetupBanner.tsx` (89) → warning callout; `DueNowOverlay.tsx` (408) → the full-screen navy "Dose due now" overlay (DESIGN.md 10.1; it is currently a light card — match the spec: pulsing ring, dose-form icon, Take Now → Snooze → Skip, Manage Each). Keep every handler/prop and behavior.
3. Tab screens: `src/app/(tabs)/medications/index.tsx` (386), `calendar.tsx` (612), `export.tsx` (321), `settings.tsx` (493), `pain-mood.tsx` (1127; one screen with a Pain/Mood metric toggle — keep it; `TrendChart.tsx` (291) only restyle containers/labels, don't change chart logic).
4. Medication flows: `medications/new.tsx` (441), `medications/[id].tsx` (2265 — very large; migrate in place section by section, and extract its inline sheets/modals into `src/components/` files only if it makes the diff clearer), `DrugNameAutocomplete.tsx` (139).
5. Everything else: `family/*` (index, new, [id]), `groups/*` (index, new, [id]), `history/index.tsx` (731), `profile/index.tsx` (302), `onboarding/index.tsx` (196), `help/index.tsx` (115), `AllergyPanel.tsx` (532), `ui/collapsible.tsx`.
6. Cleanup: when nothing imports them, delete `src/components/themed-text.tsx` and `themed-view.tsx`; keep `src/constants/theme.ts` (`Brand`, `Colors`, `Spacing` are still used by the tab bar/icons — remove only what is truly unused); update `DESIGN.md` section 17.0/17.2 and mirror the change to the web repo's `DESIGN.md` so the two stay identical (open that as a separate small web change when I ask for PRs).

## Rules and conventions

- **No behavior changes.** Don't alter data fetching, state, validation, navigation, or copy except to match DESIGN.md (e.g. action order is always **Take → Snooze → Skip**; a medication is always shown as **name → dose → type badge**; use `MedTypeBadge`/`Badge` rather than ad-hoc pills).
- Build small shared components in `src/components/ui/` instead of repeating classes: likely `Switch`/`Checkbox` rows, segmented tabs (active = brand gradient, inactive = `bg-brand-bg`), tag pills, a level/score picker, a flat settings/profile panel (`Card flat`), list rows, a screen title/section heading. Reuse `Sheet` for modals/bottom sheets and `Button`/`Field`/`Card`/`Badge` everywhere.
- Follow DESIGN.md for look: radii 10/18/28, status colors and badge text (section 12), buttons (6.1), forms (6.3), dialogs (9), toasts/alerts (10). Support light **and** dark (`dark:` + `night-*`). Touch targets ≥ 44 pt (use `min-h-11` or `hitSlop`).
- Don't use `ThemedText`/`ThemedView` in migrated code: they set color via inline `style`, which overrides `className` colors. Use `Text` from `src/components/ui/text.tsx` (has a `muted` prop) and plain `View` with classes.
- Tab screens must **not** add a top safe-area inset (the global header handles it): use `SafeArea` (or `SafeAreaView`) with `edges={['left','right']}`. Stack screens outside the tabs keep their own header/insets.
- `react-native-safe-area-context` isn't NativeWind-aware — use `src/components/ui/safe-area.tsx`. For other third-party components that need `className`, wrap with `cssInterop` the same way.
- Gradients need `expo-linear-gradient` (CSS gradients don't exist in RN); shadows use `shadow-card`/`Shadow` tokens; no `backdrop-blur`. Use `cn()` from `src/lib/cn.ts` (tailwind-merge) to merge classes so a caller's `className` wins.
- Lint rules that bit before: `react-hooks/set-state-in-effect` (no synchronous `setState` in an effect — adjust state during render or set it from a promise callback) and `react/display-name` (name inner components, e.g. icon factories).
- Expo Router typed routes: after adding/removing route files, `.expo/types` is stale until the dev server runs — run `npx expo start --web --port 8099` briefly, then kill it with `fuser -k 8099/tcp` (**don't** `pkill -f "expo start"`; it kills your own shell).
- Keep the PR reviewable: batches above are separate commits. If a screen is risky to restyle blind (e.g. big forms), say so in the PR description instead of guessing.

## Verify each batch (all must pass before committing)

- `npx tsc --noEmit` and `npx expo lint` — clean.
- `npx expo export --platform android --output-dir <tmp>` bundles successfully.
- Visual check: this environment has no native simulator, but Chromium is at `/opt/pw-browsers`. Create a **temporary** route (e.g. `src/app/preview.tsx`) that renders the screen/component with mock data (auth-gated screens can't render without a session), run `npx expo start --web --port 8099`, and screenshot at 390×844 (and a tall viewport for long screens) in light and dark with `playwright-core` (`npm i playwright-core` in a scratch dir outside the repo; launch `chromium` from `/opt/pw-browsers/chromium-*/chrome-linux/chrome` with `--no-sandbox`, `colorScheme: 'light'|'dark'`, `deviceScaleFactor: 2`). **Delete the preview route before committing.** Compare against DESIGN.md and fix contrast/overflow issues you see.
- Be explicit in your summary about what you could and could not verify: web-rendered screenshots are not a native device check (Android elevation/shadows, SVG on native, haptics, sound, safe areas and keyboard behavior are unverified).

## Definition of done

Every file in the list above uses `className` (no `StyleSheet.create`, `ThemedText`, or `ThemedView` left except where a short comment explains why), light and dark both look right in the web renders, `tsc`/`lint`/Android bundle pass, `DESIGN.md` is updated, and the summary lists each batch, what was verified, and anything that needs a real-device look.
