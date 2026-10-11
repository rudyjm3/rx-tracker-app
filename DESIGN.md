# RxTracker Design Specification

Source of truth for the **web** UI (`rx-tracker-web`, Next.js 16 + Tailwind CSS v4), written so the **mobile app** (`rx-tracker-app`, Expo / React Native) can reproduce the same look, layout and behavior.

- Every value below was read from the web code. File references are in `code font` so you can verify.
- Tailwind class → pixel conversions use the default 4 px scale (`p-4` = 16 px).
- Section 17 explains how to translate each web pattern to React Native. Section 18 lists known inconsistencies and web-only behavior.

---

## Contents

1. Principles
2. Color
3. Typography
4. Spacing, radius, elevation
5. Iconography and imagery
6. Core components (buttons, cards, inputs, badges, chips, menus)
7. App chrome (navigation, banners)
8. Screens
9. Modals and dialogs
10. Alerts, notifications and toasts
11. Charts and data visualization
12. Status semantics (one table)
13. Copy and tone
14. Motion
15. Accessibility
16. Print and PDF
17. Mobile (React Native) translation guide
18. Gaps and web-only behavior

---

## 1. Principles

1. **Light, clinical-friendly blue.** Page background is a pale blue (`#EAF4FF`); content sits on white cards with a thin blue-gray border.
2. **One gradient identity.** Cyan → blue → deep blue gradient is the signature: primary buttons, active tabs/steps, hero panel, refill reminder banner.
3. **Status color is semantic and consistent.** Green = taken/good, amber = late/pending/skipped/warning, red = missed/danger, blue = snoozed. The same mapping is used on badges, calendar cells, charts and reports (section 12).
4. **Three corner radii:** 10 (controls), 18 (cards), 28 (hero surfaces / dialogs), plus full-round for pills and avatars.
5. **Dense but calm.** Small text (12–14 px) for metadata and list content, bold navy for headings. Actions inside lists are compact buttons.
6. **Confirm destructive actions inline or in a dialog; report outcomes with a toast.**

---

## 2. Color

Defined in `app/globals.css` (`@theme`). Mobile mirrors these in `src/constants/theme.ts` (`Brand`); the values already match.

### 2.1 Brand palette

| Token | Hex | Use |
|---|---|---|
| `brand-cyan` | `#14CFE0` | Gradient start, "Mood" quick-action tint, accent on dark |
| `brand-blue` | `#0A8AC8` | Input focus border, links, snoozed badge, switch "on", today ring |
| `brand-deep-blue` | `#0754A8` | Text links, active nav item bg, checkbox checked, accent icons |
| `brand-navy` | `#102B57` | Headings, secondary-button text, dialog titles |
| `brand-dark-navy` | `#071D3D` | Modal / alarm backdrop (50% / 90% alpha), darkest gradient stop |
| `brand-bg` | `#EAF4FF` | Page background, subtle fills (chips, hover, inset rows) |
| `brand-card` | `#FFFFFF` | Cards, dialogs, header, inputs |
| `brand-border` | `#D7E6F8` | All borders, dividers, switch "off" track |
| `brand-text` | `#172033` | Primary body text |
| `brand-text-muted` | `#60708A` | Secondary text, labels, placeholders (at 75%) |
| `brand-purple` | `#8B5CF6` | "Mood" feedback chip only |

### 2.2 Status colors

| Token | Hex | Meaning |
|---|---|---|
| `status-success` | `#18BFA6` | Taken, on time, healthy supply |
| `status-warning` | `#F5A524` | Late, pending, skipped, low supply (mid), "Pain" chip |
| `status-danger` | `#E5484D` | Missed, errors, destructive actions, critically low supply |

Soft-tint pattern used everywhere: **background = status color at 10% alpha, text = status color** (`bg-status-success/10 text-status-success`). Callout borders use 30–40% alpha.

### 2.3 Gradients

| Name | CSS | Used for |
|---|---|---|
| `bg-gradient-brand` | `135deg, #14CFE0 0%, #0A8AC8 48%, #0754A8 100%` | Primary button, active tab, active wizard step, selected mood tag, PWA banner, group card background |
| `bg-gradient-brand-dark` | `135deg, #102B57 0%, #0754A8 60%, #14CFE0 100%` | Report header |
| `bg-gradient-brand-hero` | `160deg, #071D3D 0%, #0754A8 45%, #0A8AC8 75%, #14CFE0 100%` | Auth screen left panel |
| Dashboard hero / refill banner (inline) | `135deg, #18D0DC 0%, #0A8AC8 38%, #0754A8 68%, #071D3D 100%` | Dashboard hero panel, low-supply reminder banner |

### 2.4 Score colors (pain / mood, 1–10)

Three related color sets exist for different surfaces.

**Badge bands** (`lib/scoreBands.ts`): soft tint pill with a label.

| Level | Pain label / color | Mood label / color |
|---|---|---|
| 1–3 | Low / success | Poor / danger |
| 4–6 | Moderate / warning | Fair / orange (`orange-500/10`, text `orange-600`) |
| 7–8 | High / orange | Good / warning |
| 9–10 | Severe / danger | Great / success |

Rendered as `Pain Score` (muted 12 px) followed by a pill such as `7/10 · High`. Mood is the inverse scale (high = good).

**Level-picker buttons** (`LevelGrid`, solid hex):

| Level | Pain | Mood |
|---|---|---|
| 1–3 | `#2A9D49` | `#C9213C` |
| 4–6 | `#D97706` | `#D97706` |
| 7–8 | `#E05B30` | `#8BB04A` |
| 9–10 | `#C9213C` | `#2A9D49` |

**Chart dots / history score pills** (`levelColor`): pain ≤3 success, ≤6 warning, else danger. Mood "classic": ≤3 danger, ≤6 warning, else success. Mood "teal" (user setting): ≤3 `#A8DCE4`, ≤6 `#4BB8C9`, else `#028AA9`.

### 2.5 Other fixed colors

| Use | Value |
|---|---|
| Default avatar color | `#6366F1` (indigo) when a profile has no color |
| Family avatar palette | `#6366F1`, `#EC4899`, `#10B981`, `#F59E0B`, `#3B82F6`, `#EF4444` |
| Dose suffix (e.g. "10 mg") on light | `#6B7280`, 0.875em, bold |
| Google "G" glyph | `#4285F4` |
| Auth error alert | border `red-200`, bg `red-50`, text `status-danger` |
| "Ending today" callout | border `amber-400`, bg `amber-50`, text `amber-700` |
| Hero required-dose ring | stroke `rgba(196,225,250,0.95)`, track `rgba(167,205,240,0.42)` |
| Hero optional-dose ring and dot | stroke `rgba(255,197,66,0.95)`, track `rgba(255,197,66,0.3)` |

### 2.6 Dark mode

The web app **has no dark mode** (light only; a few stray `dark:` classes exist in the calendar "ending today" callout but nothing toggles them). Mobile's `Colors.dark` in `theme.ts` is a mobile-only extra: keep brand and status hues unchanged and only swap surfaces (see 17.1).

---

## 3. Typography

- **Font family:** Inter (Google Fonts via `next/font`, variable `--font-inter`), fallback `system-ui, -apple-system, sans-serif`.
- **Icon fonts:** `lucide-react` (primary). Font Awesome 6.5.2 is loaded for one icon (`fa-circle-info` on medication cards).
- **Mobile:** use Inter (`@expo-google-fonts/inter`, weights 400 / 500 / 600 / 700 / 800) so weights and numerals match. System font is an acceptable fallback.

### 3.1 Type scale (Tailwind defaults)

| Style | Size / line height | Weight | Color | Where |
|---|---|---|---|---|
| Page title (h1) | 24 / 32 (`text-2xl`) | 700 | navy | "Medication Plan", "History", "Settings", "Manage Family" |
| Onboarding title | 20 / 28 (`text-xl`) | 700 | navy | "Set up your medications" |
| Section / card title (h2) | 18 / 28 (`text-lg`) | 700 | navy | "Today schedule", "Reporting Period" |
| Panel title | 16 / 24 (`text-base`) | 700 | navy | Settings and Profile panels, "Quick actions" |
| Dialog title | 18 / 28 | 700 | navy | every dialog |
| Body | 14 / 20 (`text-sm`) | 400 | text | lists, forms |
| Body emphasis | 14–16 | 500–600 | text | medication names |
| Meta / helper | 12 / 16 (`text-xs`) | 400–500 | muted | times, captions, field errors |
| Micro | 9–11 | 600 | muted | calendar sub-labels (9), feedback chips (10), med-type badge (11) |
| Hero time | 36 / 40 (`text-4xl`) | 800 | white | Next-dose time |
| Hero medication | 24 / 32 | 800 | white | Next-dose name |
| Adherence % | 30 / 36 (`text-3xl`) | 800 | white | inside ring |
| Eyebrow label | 12, uppercase, tracking 0.16em | 800 | white 65–75% | "NEXT DOSE", "TODAY'S ADHERENCE", "UPCOMING" |
| Auth heading | 26.4 (`1.65rem`) | 800 | navy | "Welcome back!" |
| Auth hero headline | 37.6 (`2.35rem`), lh 1.12, tracking −0.04em | 800 | white | left panel |
| Auth field label | 13.9 (`0.87rem`) | 700 | text | login / signup |
| Auth input text | 15.2 (`0.95rem`) | 400 | text | login / signup |

**Medication name + dose.** Always rendered as the name at the parent size/weight followed by the dose at `0.875em`, bold, `#6B7280` (white 75% on dark). On the hero and alarm, the dose becomes a pill: full-round, `border cyan-300/40`, `bg cyan-500/25`, white 12 px extrabold, `px-12 py-4`.

Uppercase labels use `font-semibold uppercase tracking-wide` (med-type badge, feedback chip, table headers, "DOSE HISTORY" caption).

---

## 4. Spacing, radius, elevation

### 4.1 Spacing

Tailwind 4 px base. Values actually used:

| Token | px | Typical use |
|---|---|---|
| `gap-1` / `p-1` | 4 | icon–text in tight rows, dropdown padding |
| `gap-1.5` | 6 | button groups in rows, chips, level-grid gap |
| `gap-2` / `p-2` | 8 | default inline gap, compact button horizontal padding |
| `gap-3` / `p-3` | 12 | list-row padding, form gap in dialogs |
| `gap-4` / `p-4` | 16 | card padding (mobile), page horizontal gutter, form field gap |
| `p-5` | 20 | card padding at ≥640 px |
| `gap-6` / `p-6` | 24 | section gap on a page, dialog horizontal padding, wizard card padding |
| `py-8` | 32 | page top/bottom padding, space above wizard footer |

**Page layout**
- Container: `max-w-6xl` (1152 px), centered, `px-4` (16 px) gutter, `py-8` (32 px).
- Narrow pages: Add/Edit medication `max-w-2xl` (672 px); Profile `max-w-2xl` inside the 6xl container; Onboarding `max-w-2xl`.
- Vertical rhythm between page sections: `gap-6` (24 px). Between list rows: `gap-2` (8 px); taller cards `gap-3`–`gap-4`.

**Dialog layout**
- Width: `max-w-md` (448 px) default, `max-w-2xl` (672 px) for `size="wide"`; day-detail `max-w-lg` (512 px); notes `max-w-3xl`.
- Height: `max-h-[90vh]`; header fixed, body scrolls.
- Padding: header `px-6 pt-6 pb-3`; body `px-6 pb-6`.
- Footer: `mt-6`, `flex justify-end gap-2`.
- Close "×": top-right (`right-4 top-4`), 18 px icon, muted, text color on hover.

### 4.2 Radius

| Token | px | Applied to |
|---|---|---|
| `rounded-control` | 10 | buttons, inputs, selects, inner list rows, calendar cells, tab buttons, dropdown items |
| `rounded-card` | 18 | cards, panels, popovers, dropdown menus, outer list rows |
| `rounded-hero` | 28 | dialogs, lightbox image, group card, auth card on desktop |
| `rounded-full` | ∞ | badges, avatars, step circles, tag pills, switch |
| Hero panel wrapper | 32 | Dashboard hero |
| Hero glass cards, refill banner | 28 | |
| Checkbox | 4 | |

### 4.3 Elevation

| Name | Value | Use |
|---|---|---|
| `shadow-card` | `0 18px 45px rgba(7,29,61,0.14)` | Cards, primary/danger buttons, dialogs, popovers, menus |
| Hero shadow | `0 22px 60px rgba(7,29,61,0.24)` | Dashboard hero wrapper |
| Glass card shadow | `inset 0 1px 0 rgba(255,255,255,0.18), 0 18px 45px rgba(7,29,61,0.20)` + `backdrop-blur-md` | Next-dose and adherence cards |
| Refill banner | `0 16px 40px rgba(7,29,61,0.2)` | |
| Dialog backdrop | `brand-dark-navy` @ 50% + `backdrop-blur-sm` (z-50) | |
| Alarm / lightbox backdrop | `brand-dark-navy` @ 90% + blur (z-100) | |

Rule of thumb: **cards have a 1 px `brand-border` border and `shadow-card`**; flat settings/profile panels and list rows are border-only.

### 4.4 Breakpoints

`sm` 640, `md` 768, `lg` 1024. Key switches: top nav collapses to a menu below `lg`; dashboard becomes two columns at `lg`; auth is split-screen from `md`; calendar cells grow from `min-h-80` to `min-h-96` at `sm`.

---

## 5. Iconography and imagery

- **Library:** Lucide stroke icons, sizes **12 / 14 / 15 / 16 / 18 / 20 px** (12–14 beside meta text, 16 in buttons and rows, 18 in header icon buttons, 20+ in banners). Icon color follows text color (muted by default, deep-blue for interactive accents).
- **Mobile mapping:** use `@expo/vector-icons` Ionicons (already installed), picking the closest glyph (`Clock → time-outline`, `Bell → notifications-outline`, `Layers → layers-outline`, `MoreVertical → ellipsis-vertical`, `ChevronsDown → chevron-down`, `Pencil → create-outline`, `Trash2 → trash-outline`).

| Meaning | Lucide icon |
|---|---|
| Time | `Clock` |
| Group of meds | `Layers`; `Users` on the count chip |
| Calendar | `CalendarDays`, `CalendarCheck`, `CalendarPlus` |
| Notifications | `Bell` |
| Low supply / refill | `PillBottle` |
| Add / manage meds | `Plus` / `Pill` |
| Pain tracking / Mood | `LineChart` / `Smile` |
| Row action menu | `MoreVertical` |
| Expand/collapse | `ChevronsDown` (rotates 180°) |
| Drag handle | `GripVertical` |
| Filter / sort | `SlidersHorizontal` / `ArrowUpDown` |
| Settings / Help / Profile / Family | `Settings`, `HelpCircle`, `CircleUser`, `Users` |
| Success | `CheckCircle2` |
| Show/hide password | `Eye` / `EyeOff` |
| Email / password / name inputs | `Mail`, `Lock`, `User` |
| Download / print | `FileDown`, `Printer` |
| Upload / camera / remove photo | `Upload`, `Camera`, `Trash2` |
| Device | `Smartphone` |
| Setup nudge | `ClipboardList` |

**Dose-form illustrations** (circle-cropped PNGs in `public/images/dose-forms/`): tablet → `med-pill`, capsule → `med-capsule`, liquid → `med-bottle`, inhaler → `med-inhaler`, injection → `med-injection`, patch → `med-patch`, drops → `med-drop`; default `med-pill`. Rendered in a circle with fill `rgba(255,255,255,0.12)`, 3 px `rgba(255,255,255,0.30)` border, shadow `0 8px 24px rgba(0,0,0,0.22)`; **104 px** in the hero, **64 px** in the alarm. The same artwork exists in the app repo (`assets/images/med-*.png`).

**Auth illustrations:** `public/images/auth/med-{bottle,inhaler,pill,capsule,drop,patch}.png`, rotated ±8–20°, `drop-shadow-2xl`, desktop-only on the gradient panel.

**Logo:** `icons/icon-192.png` at 32 px (`rounded-xl`) in the header next to "RxTracker"; `icon-512.png` at 56 px (`rounded-2xl`) on auth (58 px on mobile web).

**Avatar:** circle; photo `object-cover`, else the first initial (white, 14 px semibold) on `avatar_color`. Sizes: 20 (menu rows, banners), 36 (header), 40 (family list), 56 (profile), 64 (photo picker).

---

## 6. Core components

### 6.1 Buttons (`components/ui/Button.tsx`)

Base: inline-flex, centered, `gap-2`, `rounded-control` (10), `font-semibold`, `transition-opacity`; disabled = 50% opacity and no pointer events.

| Variant | Background | Text | Border | Shadow | Hover |
|---|---|---|---|---|---|
| **primary** (default) | brand gradient | white | – | `shadow-card` | opacity 90% |
| **secondary** | white | navy | 1 px `brand-border` | – | bg `brand-bg` |
| **ghost** | transparent | deep-blue | – | – | bg `brand-bg` |
| **danger** | `status-danger` | white | – | `shadow-card` | opacity 90% |

| Size | Padding | Text |
|---|---|---|
| default | 16 × 10 (`px-4 py-2.5`) | 14 px |
| compact | 8 × 4 (`px-2 py-1`) | 12 px |

Variations
- **Full width:** auth submit and Google button; export button is `w-full sm:w-auto`.
- **Inline text buttons:** 12–14 px, deep-blue (or `status-danger`), underline on hover. Used for Edit / Remove / Manage tags / "+ Add comment" / "View all history".
- **Pill link button:** the refill reminder's "Refill ›" is a full-round `white/15` pill with a `white/30` border.
- **Outlined destructive confirm:** secondary with `border-status-danger text-status-danger hover:bg-status-danger/10` ("Confirm delete").
- **On dark surfaces (alarm):** secondary = `border-white/30 bg-white/10 text-white hover:bg-white/20`; ghost = `text-white hover:bg-white/10`.
- **Loading:** replace the label with a present-participle plus ellipsis ("Saving…", "Discontinuing…") and disable the button.
- **Icon buttons:** 36–40 px hit area; header icons use `p-2`, `rounded-control`, `hover:bg-brand-bg`.
- **Stepper (+/−):** 36 × 36, radius 10, 1 px border, navy icon (zero-pill dialog).

### 6.2 Cards and panels

| Type | Style |
|---|---|
| **Standard card** | white, 1 px `brand-border`, radius 18, `shadow-card`, padding 16 (20 at ≥640) |
| **Flat panel** (Settings, Profile) | same without shadow, padding 16, internal `gap-4`, h2 `text-base` bold navy |
| **Danger panel** | flat panel with `border-status-danger/30`, h2 in `status-danger` |
| **List row card** | outer radius 18 (history, tracked meds, allergies, family) or 10 (inner rows), 1 px border, padding 12 |
| **Inset row** | `bg-brand-bg` (or `/60`), radius 10, `px-10 py-8`, used inside cards and groups |
| **Hero panel** | radius 32, dashboard hero gradient, padding 20 × 32 on mobile → 48 at ≥640; contains two glass cards in a `1.4fr / 1fr` grid (stacked on mobile) |
| **Glass card** | radius 28, 1 px `white/20`, bg `white/10`, backdrop blur, padding 24 × 28 → 32 |
| **Refill banner** | radius 28, hero gradient, padding 20–24, 44 px icon disc (`white/20`), eyebrow, title, body, pill CTA, dismiss "×" |
| **Callout** | radius 18, tinted bg with 30–40% tinted border: success (setup complete), warning (drafts, resume-setup, family context), gradient promo (PWA install) |
| **Medication card** | standard card with optional drag handle; contents in 8.5 |
| **Group card** | radius 28, brand gradient background, `#F9F9F9` title, `#333` time, holds medication cards |
| **Stat tile** (report) | 90 px high, radius 10; `brand-bg` top with a 20 px bold value, `brand-border` footer with a 10 px uppercase label |

### 6.3 Form controls

- **Field** (`Field` + `inputClass`): 14 px label in `text` color with 4 px gap above the control; error 12 px `status-danger` below.
- **Input / select / textarea:** radius 10, 1 px `brand-border`, padding 12 × 8, 14 px, no outline, **focus: border → `brand-blue`**; disabled 50%. Textareas `rows` 2–4 (notes `resize-y`, max 5000; dose notes max 255).
- **Auth inputs (larger):** border 1.5 px, `py-12`, `pl-44` with a 16 px leading icon at `left-16`, 15 px text, placeholder = muted @ 75%, **focus: border `brand-blue` plus a 4 px `brand-blue/10` ring**. Password fields have a trailing eye toggle at `right-12`.
- **Native pickers:** `type=date`, `type=time`, `type=number` (unit suffix in 14 px muted to the right).
- **Checkbox:** 16 × 16, radius 4, 1 px border, checked = deep-blue fill with white 12 px check.
- **Radio:** native, 14 px label, stacked with `gap-2`.
- **Switch:** 44 × 24 track, off = `brand-border`, on = `brand-blue`; 20 px white thumb with shadow, travels 2 → 22 px. Focus: 2 px `brand-blue` ring with 2 px offset.
- **Toggle row** (settings): checkbox plus two-line label: title `font-medium` 14 px, description 12 px muted.
- **Range pills / page tabs:** radius 10; range pills `px-12 py-6`, page tabs `px-16 py-8`, 14 px. Active = brand gradient + white text. Inactive = `brand-bg` + muted (range) or white + border (page tabs).
- **Level grid (1–10):** 5 columns × 2 rows, gap 6; each a full-round pill, 2 px border in tier color, `py-6`, 14 px bold. Unselected bg `brand-bg` + muted text; selected = solid tier color + white text.
- **Tag pills (mood / side effects):** full-round, `px-12 py-4`, 12 px medium. Unselected white + border; selected = brand gradient + white. A dashed "+ Tags" pill adds one; "Manage tags" link below.
- **Autocomplete (DailyMed):** input plus an absolutely positioned list (`max-h-56`, scrolls, radius 10, border, `shadow-card`); items 14 px with `hover:bg-brand-bg`; starts at 3 characters, 300 ms debounce.
- **Number stepper:** `[−] n [+] unit` as in the zero-pill dialog.
- **Avatar picker:** 64 px avatar plus outlined small buttons "Upload photo" / "Take a photo" and a red "Remove" text button.
- **Color swatch picker** (family avatar): circular swatches from the palette in 2.5.

### 6.4 Badges, chips and pills

| Component | Shape | Style |
|---|---|---|
| **Status badge** (`Badge`) | full-round, `px-8 py-2`, 12 px medium, nowrap | taken = success tint; late / pending / skipped = warning tint; missed = danger tint; snoozed = `brand-blue/10` + blue text |
| **Med type** (`MedTypeBadge`) | full-round, `px-8 py-2`, 11 px uppercase semibold, tracking-wide | Rx = `deep-blue/10` + deep-blue text; OTC = `blue/10` + blue; Supplement = warning tint. **On dark:** `white/20` bg + `white/40` border (supplement: `amber-400/25` bg, `amber-200/50` border), white text |
| **Feedback chip** | radius 6, **outlined** 1 px, `px-6 py-2`, 10 px uppercase bold | Pain = warning border + text; Mood = purple border + text; "both" shows both |
| **Score pill** | full-round, 12 px medium | band tints from 2.4 |
| **Group-name chip** | full-round, `brand-bg`, 12 px muted, `Layers` 11 px | |
| **Count chip** | same, `Users` icon + "3 medications" | |
| **Low-supply pill** | warning tint, 12 px medium | on medication cards |
| **Date chip** | `brand-bg`, full-round, 12 px muted | "Mon, Oct 12" beside "Today schedule" |
| **Side-effect severity** | full-round tint: mild success, moderate warning, severe danger | |
| **Notification count** | min 16 px circle, `status-danger`, white 10 px bold, offset −2 / −2 on the bell | |

Status badge labels: **Taken, Late, Pending, Snoozed, Missed, Skipped**. With data: `Taken (12 min late)`, `Snoozed until 8:15 AM`.

### 6.5 Menus and popovers

- **Dropdown menu:** radius 18, 1 px border, `p-4`, `shadow-card`, `min-w-160`, aligned to the end, 6 px offset. Items `px-12 py-8`, 14 px, radius 10, optional 18 px leading icon with `gap-8`; highlight `bg-brand-bg`. Destructive item text `status-danger`. Separator 1 px `brand-border`. Group label 12 px semibold muted.
- **Medication actions menu** (wider: `min-w-72`, `p-12`): Edit, Log Dose, Log Refill, Update prescribed dose, Refill History, Adjust Quantity, Notes/Instructions, Side Effects, then red **Discontinue Use**.
- **Snooze menu:** "5 minutes", "10 minutes", "15 minutes", "30 minutes"; the user's default is suffixed "(default)".
- **Popover:** radius 18, border, `p-12`, `shadow-card`. Used by the medication-type filter (width 256).

### 6.6 Lists, tables, dividers

- Divider: 1 px `brand-border`. Dividers inside cards use `border-t pt-12`.
- Simple list: `divide-y divide-brand-border`, rows `py-12`.
- **Report table:** header `brand-bg`, 12 px uppercase semibold muted; cells `px-12 py-8`, 14 px muted; row top border; horizontal scroll with `min-w-640`.
- **Description rows:** label muted on the left, value right-aligned and medium, optional 12 px sub-value ("Last updated Mar 3, 2026").
- **Accordion (`<details>`):** radius 10, border, `p-12`; summary 14 px semibold navy; FAQ open state uses `brand-bg` and rotates a ▾ glyph.
- **Inventory bar:** 6 px high, full-round, track `brand-bg`, fill = danger if low supply, warning if ≤50%, otherwise success; max width 320.
- **Loading / empty states:** plain 14 px muted text ("Loading…", "Nothing scheduled today.", "No dose history for this filter."). No skeletons or illustrations.

---

## 7. App chrome

### 7.1 Header (`TopNav`)

- White bar with a 1 px bottom border; inner container `max-w-6xl`, `px-16 py-12`. It scrolls with the page (not sticky).
- Left: logo 32 px (`rounded-xl`) + "RxTracker" 18 px bold navy; links to the dashboard.
- **≥1024 px:** inline nav links, 14 px medium, `px-12 py-6`, radius 10. Active = deep-blue fill + white text; inactive = text color, `hover:bg-brand-bg`. Order: **Dashboard, Medications, Calendar, Export, Pain Tracking, Mood & Wellbeing**.
- **<1024 px:** hamburger icon button opens a dropdown with the same links.
- Right cluster (gap 8): hamburger (small screens) → **Notification bell** → **avatar button (36 px)** → **Settings gear** → **Help**.
- **Avatar menu:** "My Profile" → account owner row (the active profile is highlighted `brand-bg`) → "Manage Family" → label "Family members" → one row per member (20 px avatar, name, relationship in muted 12 px on the right) → separator → "Sign out".
- Header, banners and controls carry `data-no-print`.

### 7.2 Banners attached to the header

| Banner | Style | Content |
|---|---|---|
| **Resume setup** (above the bar) | `status-warning/10` bg, bottom border, 14 px, `max-w-5xl`, `ClipboardList` icon in warning | "Finish setting up {Name's / your} medications." + "Resume setup" link (deep-blue, medium). Shown when onboarding is incomplete and no medications exist; hidden on /settings |
| **Family context** (below the bar) | `status-warning/10` bg, bottom border, 14 px | 20 px avatar, "Viewing **{Name}**'s medications", compact secondary "Switch back to Me" |

### 7.3 Notification bell menu

Bell 18 px with a count badge when alerts exist. Menu `min-w-18rem`: label "Notifications"; empty state "You're all caught up." (centered muted). Each alert row has a 4 px left border in `status-warning`: name + dose, then a red 12 px line "{Severity} — {n} {unit} remaining", a small deep-blue "Refill" button, and a dismiss "×". Severity strings: **Out of stock**, **Critically low**, **Low supply**.

### 7.4 Page frame

```
[ Header ] [ optional banners ]
<main max-w-6xl px-4 py-8 flex-1>
   <h1 24px bold navy>   (omitted on Dashboard)
   content, gap-6
</main>
```
`body` background `#EAF4FF`, `min-height: 100vh`, flex column.

---

## 8. Screens

`/` redirects to `/dashboard` when signed in, else `/login`. All routes except auth and help require sign-in.

### 8.1 Login `/login`

Split screen (from `md`/768: 55% / 45%).

**Left panel** (desktop only): hero gradient, padding 48; logo 56 px + "RxTracker" (24 px extrabold); headline "Stay on track with every dose." (37.6 px / 800, white); sub-copy 16 px `white/80` "RxTracker helps you manage your medications, set reminders, and build healthier habits."; three feature rows each with a 24 px blue check disc, title (14 px extrabold) and description (`white/75`): *Smart reminders – Never miss a dose again*, *Track with confidence – Log doses and monitor adherence*, *Better health outcomes – Stay informed and in control*. Decorative blurred circles and medication illustrations at the bottom-right. Footer: shield icon + "Your health information is secure with us." / "We use industry-standard encryption to protect your data."

**Right panel:** `brand-bg` on mobile web / white on desktop; centered card, `max-w 420` (520 at md), padding 28 (40 at md), radius 18 (28 at md), `shadow-card`. On small screens the logo (58 px) and "RxTracker" (20 px extrabold navy) sit above the form.

Order inside the card: h1 "Welcome back!" (centered) → "Sign in to continue tracking your medications." (muted, 32 px below) → error alert → form (gap ≈ 17.6): Email (mail icon), Password (lock icon, eye toggle, right-aligned "Forgot password?" 13.4 px semibold blue) → checkbox "Remember me for 30 days" → full-width **Sign in** primary (8 px extra top margin; "Signing in…") → divider with "or" → full-width secondary **G Continue with Google** → "Don't have an account? **Sign up**".

Inline error alert: `role=alert`, radius 10, red-50 bg, red-200 border, `px-16 py-12`, 14 px semibold `status-danger`.

### 8.2 Sign up `/signup`

Same shell. Left copy: "Take control of your health." / "Join thousands of people who trust RxTracker to manage their medications every day." with four features (*Medication reminders, Refill tracking, Dose history, Adherence reports*) and a phone-mockup illustration (75% ring, three time rows with green checks).

Fields: Full name (user icon), Email, Password, Confirm password (both with eye toggles), checkbox "I agree to the Terms of Service and Privacy Policy", **Create account**, divider, Google button, "Already have an account? Sign in".

Validation messages (inline alert): "Passwords do not match." · "Password must be at least 8 characters and include a number." · "Please agree to the Terms of Service and Privacy Policy."

Success replaces the form: h1 "Check your email" and "Confirm your account, then **sign in**."

### 8.3 Forgot / reset password

Same shell with a simple form (standard `rounded-control` inputs, 14 px labels).
- **Forgot:** muted explainer "Enter your email and we'll send you a link to reset your password.", Email field, red 14 px error text, full-width **Send reset link** ("Sending…"), centered "Back to sign in" link (deep-blue). Success text (centered 14 px): "If an account exists for that email, a reset link is on its way."
- **Reset:** muted "Choose a new password for your account.", one "New password" field (min 6 characters), red error text, full-width submit button.

### 8.4 Dashboard `/dashboard`

Single column, `gap-6`, in this order:

1. **Setup-complete banner** (only right after onboarding, `?setup=complete`): success callout with a check icon, "**You're all set.** Your medications are ready to track."
2. **Hero panel** (radius 32). Two glass cards in a `grid lg:[1.4fr_1fr]`, gap 24 (stacked on mobile), each `min-h-330`:
   - **Next dose:** eyebrow with clock "NEXT DOSE"; time in 36 px / 800 (`8:00 AM`); medication name 24 px / 800 with dose pill and type badge (on dark). For groups: group name, "{n} medications in group", a full-width 48 px outlined-white toggle "view group meds / hide group meds" that reveals names + badges. Dose-form illustration 104 px on the right (≥640). Bottom "UPCOMING" block (top border `white/20`): time bold + name (+ dose pill for groups). Empty: "All scheduled doses complete for today."
   - **Today's adherence:** eyebrow with calendar-check; ring 148 px (outer 12 px stroke; optional-dose inner ring 9 px stroke; centered `%` in 30 px extrabold); text stack 16 px `white/90`, line height 32: "Required doses taken: X of Y"; (only when optional doses exist) amber dot + "Non required doses taken: X of Y"; (when X > 0) "On time: n · Late: n · Skipped: n"; "Missed required doses today: n".
3. **Low-supply reminder banners** (one per medication; see 10.2). Dismissible for the rest of the day.
4. **PWA install banner** — gradient bar: "Add RxTracker to your home screen for the best experience" + compact secondary "Install" + dismiss ×. Web only.
5. **Two-column grid** (`minmax(0,1fr) / 320px` at `lg`, gap 24; one column below):
   - **Left — "Today schedule" card:** header = title (18 px bold navy) + date chip ("Mon, Oct 12") on the left; `CalendarDays` + "View calendar" link on the right. Scroll area `max-h-28rem`. Contents: dose rows (below), then an "As needed" section (top border, h3 14 px semibold navy, inset rows with name and compact secondary "Log dose"). Footer link, centered: "View full schedule". Empty: "Nothing scheduled today."
   - **Right — two stacked cards:**
     - *Quick actions*: four rows separated by borders, each = 32 px round tinted icon + 14 px medium label + chevron: **Add medication** (deep-blue), **Pain tracking** (warning), **Mood & Wellbeing** (cyan), **Manage medications** (blue). Pain and Mood open the Log-level dialog.
     - *Medications overview* (title with clipboard icon): stat rows "Active medications", "Today's doses", "Doses taken" (green value), "Doses missed" (red value); deep-blue links with chevrons "View required dose list" and "View non required dose list"; centered "View all medications".
6. **Today's history card** — title "Today's history"; right side: sort icon button (`ArrowUpDown`, toggles newest/oldest first) + "View all history" link. Rows (radius 10, `p-12`): 64 px time column (12 px muted), name + dose, optional score badges, note (14 px muted; hidden if it starts with "Auto-"); on the right a status badge with an "Edit" link below (active medications only). Empty: "No doses logged today yet."

**Dose row (`DoseRow`):** radius 18 card, `p-12`, content left and actions right.
- Left: clock 12 px + time ("8:00 AM", "(PRN)") → name + dose with type badge → optional group chip.
- Right, by state:
  - *Pending:* **Take** (primary compact) · **Skip** (secondary compact) · **Snooze** (ghost compact, menu)
  - *Taken:* green "Taken" badge; late → amber `Taken (12 min late)`
  - *Missed:* red "Missed" badge + **Take**
  - *Skipped:* amber "Skipped" badge
  - *Snoozed:* blue `Snoozed until 8:15 AM`

**Group dose card (`GroupDoseCard`):** same shell. Header: time, `Layers` (deep-blue) + group name, count chip. Actions **Take All / Skip / Snooze** apply to every pending member. When everything is resolved: aggregate badge (precedence missed > skipped > late > taken) and, if any member was missed, **Take All**. A centered 12 px "Show medications ⌄" toggle expands a top-bordered list of inset member rows (name, type badge, "(PRN)", per-member badge); "Manage Individually" reveals per-member Take / Skip / Snooze.

Loading: "Loading dashboard…" (muted). The page re-checks due doses every 20 s.

### 8.5 Medications `/medications` ("Medication Plan")

- h1 "Medication Plan".
- **Draft callout** (if any): warning callout "You have unfinished medications"; each row "Draft updated {date}" (muted) with **Continue** (deep-blue) and **Discard** (red).
- **Toolbar** (wraps, space-between): left tabs **Active (n) · Inactive (n) · Groups (n)** (active = gradient pill, others white + border). Right: filter icon button (36 × 36, with a 10 px deep-blue dot when filtered; opens a popover "MEDICATION TYPE" with Rx / OTC / Supplement checkboxes and "Apply filters"; an empty selection means show all) and the primary link-button **+ Add medication**. The filter is hidden on the Groups tab.
- **Active tab:** group sections first — each has a small header (`Layers` 14 px + "Group name · 8:00 AM", 14 px semibold muted) followed by that group's medication cards; then ungrouped cards in a drag-sortable list (grip handle on the left, 18 px; card drops to 60% opacity while dragging).
- **Inactive tab:** cards whose kebab is replaced by compact secondary **Refill History** and **Reactivate** buttons.
- **Groups tab:** right-aligned secondary **+ New group**, then group cards (radius 28, gradient) with edit (pencil) and delete (trash) icons top-right, containing member cards. Empty group: "No medications in this group yet."
- Empty states: "No medications yet. Add your first one to get started." · "No medications match the selected filter." · "No inactive medications." · "No groups yet. Create one to bundle medications taken together."

**Medication card anatomy**
- Header row: `[grip?] [name + dose, 16 px semibold navy] [type badge] [ⓘ details] [chart icon, only if pain/mood tracked] [Low supply pill] … [⋮ menu]`.
- Below: schedule summary (14 px muted).
- If inventory is enabled: 12 px muted line "Pills: 24 / 60 pills | Refill alert at 10 pills", progress bar (6.6), run-out estimate line, "Last refill: Mar 3 · 30 pills".
- A centered chevron expands the card: top divider, "Started: … · Ended: …" (12 px), caption "DOSE HISTORY" (12 px uppercase semibold muted) and history lines at 12 px ("{date} — Dose changed from 10mg to 20mg — {reason}", "Discontinued — {reason} ({comment})", "Resumed — …").

### 8.6 Add / Edit medication `/medications/new`, `/medications/[id]/edit`

Page: h1 "Add medication" (edit page has its own title), `max-w-2xl`.

- **Stepper:** four equal columns, each a 32 px circle (active = gradient + white; done = `brand-bg` + deep-blue; todo = `brand-bg` + muted) with a 12 px label below: **Identity · Inventory · Schedule · Feedback**.
- **Form card:** standard card, padding 24, content `gap-16`.
  - *Identity:* Medication name (DailyMed autocomplete, placeholder "Start typing a medication name…"); 3-column row **Dose amount / Unit / Form**; Type select (Rx / OTC / Supplement); 2-column **Start date / End date** (end date revealed by a deep-blue link); expandable **Instructions** textarea.
  - *Inventory:* checkbox to track inventory; when on, a 2-column grid **Inventory type / Unit / Starting quantity / Low supply threshold**, then **Quantity per dose**.
  - *Schedule:* checkbox for as-needed (PRN); otherwise **Schedule type** select. Fixed times = list of time inputs with a remove icon and "+ Add time" (self-start) plus error text; interval = 2-column **Every N hours / First dose time**. **Group (optional)** select; when a group is chosen an info box (white, bordered, radius 10, 14 px muted) summarizes the shared time.
  - *Feedback:* "Track how you feel with each dose?" select (none / pain / mood / both) and related checkboxes.
- **Footer** (`mt-32`, space-between, wraps): left **Cancel** (ghost) + **Back** (secondary, disabled on step 1); right **Save draft** (secondary, create mode only) + **Next** (primary), which becomes **Add medication** / **Save changes** on the last step.
- Discard dialog and toasts: see 9.23 and 10.3.

### 8.7 Calendar `/calendar`

One card (padding 16, 24 at sm, `gap-16`): month nav row (chevron icon buttons in deep-blue, month label 18 px bold navy centered) → weekday header (Sun…Sat, 12 px semibold muted, 7-column grid, gap 4 / 6) → day grid (7 columns, gap 4 / 6).

**Day cell:** button, radius 10, padding 6, `min-h-80` (96 at sm), top-left aligned, 14 px. Contents: day number (semibold); 9 px muted "Total doses: Req 3 / Non-req 1"; a counts row, 10 px medium, colored **{n}T** green, **{n}S** amber, **{n}M** red; 9 px semibold deep-blue "Ends today: Name +2 more". Background = worst status: missed → `danger/10`, skipped without any taken → `warning/10`, taken → `success/10`, no data → white, future → `brand-bg` with muted text. **Today** has a 2 px `brand-blue` ring. Days with data are clickable (`hover:opacity-80`) and open the Day-detail dialog (9.6). Legend below: 10 px dots (green Taken, amber Skipped, red Missed) with 12 px muted labels.

### 8.8 History `/history`

h1 "History" → filter row (wraps, gap 12): **Medication** select ("All medications", names with "(inactive)"), **From** and **To** dates → ordered list of radius-18 rows (`p-12`): name + dose with status badge, optional score badges, note, date/time, and an "Edit" link that opens the Edit dose dialog → **Load more** (secondary) when a full page came back. Empty: "No dose history for this filter."

### 8.9 Pain Tracking `/pain-tracking` and Mood & Wellbeing `/mood-wellbeing`

One component, parameterized by metric.
1. h1 ("Pain Tracking" / "Mood & Wellbeing").
2. If no medication tracks the metric: muted explainer that it can still be logged independently.
3. **Log card button:** full-width card (`p-16`, shadow) with a muted sentence and a gradient pill "Log pain level now" / "Log mood level now"; opens the Log-level dialog.
4. **Tracked medications** (h2 18 px bold): rows (radius 18, `p-12`) with name + dose and compact secondary "View pain graph" / "View mood graph" (opens 9.18).
5. **{Pain|Mood} trend** (h2) with a medication selector.
6. Card containing the **TrendChart** (section 11).
7. **Log history card:** header "{Pain|Mood} log history" with "View less"; list with `divide-y`, each row a 3-column grid `[86px, 1fr, auto]`, gap 16: date (12 px semibold muted) over time (bold navy); center column: medication name or a "STANDALONE" pill (`brand-bg`, deep-blue, 12 px bold uppercase), optional "DOSE LOG ENTRY" pill, "Pain Score" label and an outlined score pill `7/10` in the tier color, tag chips (`brand-bg`, 12 px muted), "**Comments:** _note_" (italic), "Last edited …"; right column: edit/delete actions. Empty: "No {metric} levels recorded for this medication yet."

### 8.10 Export `/export`

Three stacked cards (padding 24, shadow):
1. **Reporting Period** — h2, muted "Used for the report below.", From / To date fields inline.
2. **Doctor Visit Report** — h2; description "Generate a branded PDF summary of your medication history, adherence, pain trends, side effects, and (optionally) mood trends — ready to share with your doctor."; two switch rows ("Include Pain tracking", "Include Mood & Wellbeing tracking"); conditional bordered sub-panels listing pain-/mood-tracked medications (inset rows: name + "N days on medication"); **Medications to include** checklist (checkboxes; "Select all" / "Select none" in blue; max-h-160 scroll); full-width (auto at sm) primary **⬇ Generate & Download PDF** ("Generating PDF…"); success callout "Your PDF is downloading — check your Downloads folder." with an "Open PDF" link.
3. **On-page report preview** (`ReportSummary`) — one card with a dark-gradient header (logo 48 + title + period/patient subtitle), then sections separated by 1 px borders (padding 24): section title 16 px bold navy, optional 12 px muted description, content. Sections: adherence (ring + stat tiles), medications table, dose-change history, pain trend, mood trend, side effects, allergies, patient notes grouped by date. Adherence color: ≥80% success, ≥50% warning, else danger.

### 8.11 Settings `/settings`

h1 "Settings" then four flat panels (gap 24):
1. **General Settings** — "Mark dose missed after" (number input, width 96, + "minutes", whole number 5–240; error "Enter a whole number between 5 and 240."), "Default snooze duration" select (5 / 10 / 15 / 30 minutes), "Use device timezone" toggle row (plus a timezone select when off), **Save settings** (primary, self-start).
2. **Alarm & Notification Settings** — muted helper "Alerts you while RxTracker is open in this tab when a dose becomes due."; toggle rows *Alarm sound* (on by default), *Vibration* (on by default), *Teal mood chart*; **Test alarm** (secondary).
3. **Push Notification Status** — explainer that push reminders are delivered by the Android app; empty state "No devices registered for push notifications yet…"; device rows (radius 10, `px-12 py-8`, phone icon, name 14 px medium, "Registered Mar 3, 2026" 12 px muted, compact secondary **Remove** with trash icon).
4. **Help & Documentation** — blurb and an outlined link button "View Help & FAQ" with a help icon.

### 8.12 Profile `/profile`

`max-w-2xl`. h1 "My Profile".
- **Profile Information** panel: title + "Edit" link (deep-blue); avatar 56 + display name (18 px semibold); description rows: Display name, Email, Birthdate ("… (34 years old)"), Height (with feet/inches helper and "Last updated …"), Weight.
- **Allergies & Intolerances** panel: title + compact secondary **Add**; rows (radius 18, `p-12`) show name (+ "(inactive)"), a 12 px muted meta line ("Life-threatening" in red, otherwise severity · category), and "Edit" (blue) / "Remove" (red) text buttons. Empty: "No allergies recorded."
- **Change Password** panel (current / new / confirm fields, secondary submit), **Security** panel (secondary **Sign out of other devices**), **Data & Privacy** panel (secondary link "Go to Export"), **Delete Account** danger panel (red title, explainer, red text link "I want to delete my account" → reveals an email-confirm field plus **Cancel** (ghost) and **Permanently delete my account** (danger, disabled until the email matches)).
- **Edit Profile dialog:** first / last name, display name, birthdate, height (value + in/cm), weight (value + lb/kg), avatar picker; Cancel / Save.
- Tapping the profile photo opens the Image lightbox (9.9).

### 8.13 Family `/family` and `/family/[id]`

- **List:** header row (h1 "Manage Family" + primary **Add Family Member**), muted intro "Track medications for family members under one account — no separate logins needed." Each member = card (radius 18, `p-16`): 40 px colored avatar, name (medium) with "Relationship · 12 yrs" (12 px muted), linking to the detail page; text actions "Switch to this profile", "Edit", "Remove". Remove becomes an inline "Keep / **Confirm**" with a red 12 px warning "This permanently deletes {Name}'s medications, dose history, and logs — not just their profile. This can't be undone." Empty: `No family members yet. Click "Add Family Member" to add one.`
- **Add/Edit Family Member dialog:** first / last / display name, relationship, birthdate (no future dates), height (in/cm), weight (lb/kg), avatar color palette and photo upload with a live preview. Validation errors appear inline in red ("Birthdate cannot be in the future.", "Height value is out of range.", "Weight value is out of range."). Creating a member switches to that profile and routes to `/onboarding`.
- **Detail:** top row "← Back to Family" link + primary **Switch to this profile**; profile information panel (avatar uses the member color), allergies panel scoped to the member, lightbox on photo tap.

### 8.14 Onboarding `/onboarding`

Full screen on `brand-bg`; content `max-w-2xl`, `px-16 py-32`.
- Header: h1 "Set up {Name's / your} medications" (20 px bold navy) and a muted "Skip setup" text button.
- Stepper (`mt-16 mb-24`): **Medications · Tracking · Schedule · Inventory · Today · Activate**. The Inventory step is skipped when no medication tracks inventory and Today (reconcile) is skipped when there are no past slots today. Completed steps are tappable. Same circle style as the wizard.
- Card (padding 24, shadow) holds the step; bottom row **Back** (secondary) / **Next** (primary). The last step shows only Back plus its own action.
- *Medications:* intro, list of added medications (bordered rows) with edit/remove, and secondary **+ Add medication** that expands a compact identity form (Cancel / Save).
- *Tracking:* per medication, secondary buttons for the pain / mood tracking choice.
- *Schedule* and *Inventory:* the same fields as the wizard, per medication.
- *Today (reconcile):* doses already past today, grouped by time in bordered radius-10 blocks (`p-16`, time heading) with compact secondary **Mark all taken / Mark all skipped** and per-dose choices.
- *Activate:* explanatory text and a primary **Activate** (disabled until at least one draft medication exists).

### 8.15 Help `/help`

h1 "Help & FAQ" and a muted intro. One flat panel of `<details>` accordions (radius 10, border, `p-12`; open state `brand-bg`): *What does RxTracker do?*, *How do dose reminders and snoozing work?*, *How does inventory tracking and refill logging work?*, *What does "adherence" mean…*, *How do family profiles work?*, *How do I export a doctor visit report?*. Footer disclaimer (12 px muted): "RxTracker is a tracking aid only and does not provide medical advice — for anything about your treatment itself, please check with your doctor or pharmacist."

---

## 9. Modals and dialogs

All dialogs share the shell in 4.1: radius 28, white, `shadow-card`, navy 50% blurred backdrop, close × top-right, title 18 px bold navy, optional 14 px muted subtitle. Footer buttons are right-aligned. Medication-scoped titles read `{Action} — {Name} {dose}`.

| # | Dialog | Size | Contents and buttons |
|---|---|---|---|
| 9.1 | **Feedback — "How are you feeling?"** (after Take on a pain/mood-tracked med) | default | Subtitle = medication; "{n} of {total}" in deep-blue 12 px when batching; Level grid(s) for Pain and/or Mood with hints "(1 = minimal — 10 = severe)" and "(1 = very low — 10 = excellent)"; Notes textarea (optional, max 255, placeholder "Any notes about this dose…"); footer **Take without logging** (ghost) · **Save & take** (primary) |
| 9.2 | **"What time did you take this?"** | default | Subtitle "Originally due 8:00 AM"; time input "Actual time taken"; **Cancel** (ghost) · **Submit** ("Recording…") |
| 9.3 | **Zero-pill — "Out of {unit}"** | default | Subtitle "{Med} shows 0 {unit} on hand."; "Correct the count, if it's wrong" with `[−] n [+] unit` and compact primary **Update & take**; deep-blue link "Log refill instead" (opens 9.10); footer: muted text link **Not now** (left, takes the dose anyway) · **Cancel dose** (danger) |
| 9.4 | **Required / Non-required doses today** | wide | One `<details open>` per medication listing time + badge rows |
| 9.5 | **Log dose** (past or as-needed) | wide | Step 1: Date (max today), slot buttons (full-width, border, radius 10, time + red "Missed" tag) or an empty message, error callout with Retry. Step 2: dose entry form (time, notes, pain/mood grids as applicable) |
| 9.6 | **Day detail** (calendar) | `max-w-lg` | Title "Monday, October 12"; subtitle "Medications: 4 \| Planned doses — Required: 3 / Non-required: 1"; amber "Regimen(s) ending today" callout; groups as bordered cards with `Layers` title and an "Edit all" link; per-medication bold name, summary "Total doses 2 — Taken: 1 / Late: 0 — Skipped: 1 — Missed: 0", inset rows (time, status badge, "Edit"), note (hidden if it starts with "Auto-"). Future days list planned rows ("Scheduled" / "Planned (as needed)"). Pending as-needed rows offer "Log dose". Empty: "No dose data for this day." / "No doses planned for this day." |
| 9.7 | **Edit dose entry** | default | Subtitle = medication; Status select (Taken / Skipped / Missed); time (when taken); Pain / Mood level grids (taken + tracked only); Notes; footer: **Delete** (red text link, left). Clicking Delete swaps the footer to "Delete this entry?" with **Keep entry** (ghost) · **Confirm delete** (outlined danger). Right side: **Cancel** (ghost) · **Save**. Errors as red inline text |
| 9.8 | **Edit all — {Group}** | default | Subtitle "Applies to all {n} medications in this group for this dose."; shared status, time and note applied to every member; Cancel / Save |
| 9.9 | **Image lightbox** | full screen | Fixed overlay `navy/90` + blur at z-100; image `max-h-75vh`, radius 28, `shadow-card`; 14 px medium white caption; white 28 px × top-right; click outside or Esc closes |
| 9.10 | **Log refill / Adjust quantity** | default | "Log refill — {Med}": Refill date, "Amount added ({unit})" with unit suffix, Note (placeholder "e.g. 30-day supply"); button **Log refill**. "Adjust quantity — {Med}": quantity on hand + Note; button **Save adjustment** |
| 9.11 | **Refill history** | wide | Summary strip (`brand-bg`, radius 10, `px-16 py-12`): "3 refills in 2026 · avg every 30 days"; month navigator ("‹ Sep  **October 2026**  Nov ›"); rows with date (14 px semibold navy), tags (green "Refill: +30 pills", grey "ADJUSTMENT"), days since previous. Empty: "No refill activity this month." |
| 9.12 | **Update prescribed dose** | default | Subtitle "Current dose: 10 mg"; "New dose amount" (number + unit select, grid `1fr / 8rem`); "Reason (optional)" textarea; **Cancel** (ghost compact) · **Save dose change** |
| 9.13 | **Notes / instructions** | `max-w-3xl`, no body padding | Fixed header with bottom border; "Instructions (from medication record)" block; notes as inset cards (radius 10, `brand-bg`, `p-16`) with a kebab (Edit / red Delete note) and "Added … · Edited …" caption; "+ Add new note" underlined link; add form (textarea max 5000, Save / Cancel) |
| 9.14 | **Side effects** | default | Add form: Date + Severity (Mild / Moderate / Severe) in 2 columns, tag picker pills, Notes, compact **Add side effect**; list below (max-h-224) with severity pill, description, date, note and a trash icon. Empty: "No side effects logged yet." |
| 9.15 | **Discontinue** | default | "Discontinue — {Med}"; radio reasons: *End of regimen, Side effects, Doctor's orders, Other*; Comment (optional); **Cancel** (secondary) · **Discontinue Use** (danger → "Discontinuing…") |
| 9.16 | **Resume** (opened by "Reactivate") | default | "Resume — {Med}"; radio reasons: *Doctor's orders, Symptoms returned, Retrying, Restarting regimen, Other*; Comment (optional); Cancel (secondary) · primary confirm |
| 9.17 | **Medication details (DailyMed)** | wide | Title = medication; product image (max-h-144, in a `brand-bg/50` box); scroll list (max-h-65vh) of `<details>` sections; disclaimer 12 px "This information is for general reference only. Always follow your doctor's or pharmacist's instructions."; "Loading details…"; fallback "Detailed information is not available for this medication." |
| 9.18 | **Graph / Trend (printable)** | wide | Header row: "{Pain|Mood} graph — {Med}" + compact secondary **Print** (printer icon); optional metric control (Pain · Mood · Both; active = navy fill with white text); range pills; chart |
| 9.19 | **Log pain / mood level** | default | "Log pain level"; optional "Link to a medication (optional)" select (first option "No medication — log independently"); level grid; Date + Time (2 columns); mood tag picker (mood only); "+ Add comment" → textarea "Comments (optional)"; **Cancel** (ghost) · **Save log** (disabled until a level is chosen) |
| 9.20 | **Manage tags** (mood / side effects) | default | List of tags with rename (pencil), delete (trash) and an "always show" toggle |
| 9.21 | **Group** | default | "New group" / "Edit group": Group name, Scheduled time, Members checklist (max-h-192) with per-member "Qty override" number input (width 128); **Create group** / **Save changes** |
| 9.22 | **Allergy** | default | Allergy select (with "+ Enter a new allergy…" free text), type, life-threatening checkbox, severity, category, notes, active flag; Cancel / Save |
| 9.23 | **Discard this medication?** | default | "Your progress on this medication won't be saved." (edit: "Your changes won't be saved."); **Keep editing** (secondary) · **Discard** (danger, "Discarding…") |

Shared rules: Esc and backdrop-click close a dialog; busy buttons are disabled and relabeled; forms submit on Enter.

**The dose-due alarm is not a dialog** — it is a full-screen overlay; see 10.1.

---

## 10. Alerts, notifications and toasts

### 10.1 Dose-due alarm overlay (`AlarmOverlay`)

Full-screen `role="alertdialog"` (label "Dose due now"), fixed, z-100, `navy/90` + blur, centered column `max-w-md`, `gap-24`, white centered text; page scroll is locked while open.

Top → bottom:
1. 96 px area with a pinging `white/20` ring and a pulsing `white/10` ring around the 64 px dose-form illustration.
2. Eyebrow: bell 13 px + "DOSE DUE NOW" (12 px semibold uppercase, `white/70`).
3. Title 24 px bold: medication name with dose pill; below it the type badge (on-dark). Groups: group name + "{n} medications in group".
4. Actions (wrapping, centered, gap 12): primary **Take Now** (min width 144), on-dark secondary **Skip**, and for groups **Manage Each**; below them an on-dark ghost **Snooze ▾** menu (z-110).
5. *Manage Each* replaces the actions with a `white/10` radius-18 list (`p-12`): each medication shows name + time, with Take / Skip / Snooze, or its status text ("Taken", "Skipped", "Missed" + Take).

Triggering: shows for a pending, non-PRN dose whose window is open (`due ≤ now ≤ due + grace`, grace default 60 min). It is suppressed while the feedback, zero-pill or time-input dialogs are open. Sound: two 880 Hz sine beeps (0.3 s each, 0.35 s apart, peak gain 0.3). Vibration if enabled in Settings. Each due time alarms once (a snooze changes the due time and can alarm again).

### 10.2 Low-supply reminders

Severity per medication: **Out of stock** (0 on hand), **Critically low**, **Low supply** (≤ threshold).
- **Dashboard banner:** gradient card with a `PillBottle` icon in a disc; eyebrow "REMINDER · {Severity}" (12 px semibold uppercase, tracking 0.18em, `white/70`); "Refill: {Name} {dose}" (18 px bold); "Pills Left: {n} {unit}" (14 px `white/80`); pill link "Refill ›" that opens the Refill dialog on the Medications page; dismiss "×". Dismissal is stored per medication per day, account-wide, and shared with the bell.
- **Bell rows:** see 7.3.
- **Medication card:** "Low supply" pill and a red inventory bar.

### 10.3 Toasts (Sonner)

`<Toaster richColors position="top-center" />` — default Sonner styling with rich status colors (green success, red error), top-center, auto-dismiss (~4 s). No custom theme. Messages are sentence case, short, no trailing period (except the two password/family sentences below).

**Success:** "Dose recorded" / "Doses recorded"; "Snoozed for {n} minutes"; "Dose entry updated" / "Dose entry deleted"; "Group dose entries updated"; "Refill logged"; "Quantity adjusted"; "Quantity updated"; "Prescribed dose updated" (or "No dose change to save"); "Side effect logged"; "Group created" / "Group updated"; "{Group} deleted"; "{Med} discontinued"; "{Med} reactivated"; "Medication added" / "Medication updated"; "Draft saved"; "{Med dose} logged"; "Pain level logged" / "Mood level logged"; "Pain log updated" / "Mood log deleted" (etc.); "Settings saved"; "Device removed"; "Password changed successfully."; "Signed out of other devices."; "Allergy removed"; "Family member removed."

**Error:** the server error message if there is one, otherwise a fallback: "Couldn't record dose", "Couldn't snooze dose", "Couldn't save log", "Couldn't save settings", "Couldn't remove device", "Couldn't dismiss reminder", "Couldn't change password", "Couldn't sign out other devices", "Couldn't remove allergy", "Couldn't add tag", "Couldn't rename / delete / update tag", "Couldn't log dose", "Couldn't update quantity", "Couldn't save draft", "Couldn't save medication", "Couldn't remove medication", "Couldn't skip setup", "Something went wrong".

**Validation (toast):** "Amount added must be zero or greater", "Quantity must be zero or greater", "New dose amount must be greater than zero", "Enter how many were dispensed", "Enter the current quantity", "Calculate the estimate first".

Pattern: **toast = outcome of an action the user triggered; inline text = form validation; dialog = decision.**

### 10.4 Inline alerts and callouts

| Kind | Style | Examples |
|---|---|---|
| Error alert (auth) | radius 10, red-50 bg, red-200 border, 14 px semibold red, `role=alert` | sign-in / sign-up errors |
| Error text (form) | 12–14 px `status-danger` under the field or above the buttons | field and dialog errors |
| Success callout | radius 10–18, `status-success/10` bg + `/30–40` border, check icon | setup complete, PDF downloading |
| Warning callout | `status-warning/10` bg + `/40` border | drafts, resume setup, family context |
| Danger callout | `status-danger/10` bg + `/30` border | group-membership load failure |
| Info / promo | brand gradient bar, white text | PWA install |
| Ending-today callout | `amber-50` bg, `amber-400` border | calendar day detail |
| Permanent-delete warning | 12 px `status-danger` paragraph | family remove, delete account |

### 10.5 Push and OS notifications

Not produced by the web app. Push reminders come from the Android app; Settings → *Push Notification Status* lists registered devices and lets the user remove them. In the browser, reminders are limited to the in-app alarm (overlay, sound, vibration) while the tab is open.

---

## 11. Charts and data visualization

- **Library:** Recharts. `ResponsiveContainer` width 100%, **height 220**.
- **Trend line chart:** dashed `3 3` grid in `brand-border`; Y axis domain 1–10 with ticks **1, 3, 5, 7, 10**; line `monotone`, stroke `brand-blue`, no animation; **dots** radius 5, fill = score color (2.4), 1.5 px white stroke; default Recharts tooltip with "7/10" (daily average shows one decimal).
- **Two views:** multi-day shows daily-average points (X = `MM-DD`); **click a point to drill into that day**. Single-day view uses minutes 0–1440 on X, labelled in 12-hour time. A banner (radius 10, `brand-bg` fill, 1 px border, `px-12 py-8`) reads "Showing Oct 12, 2026" with a deep-blue "← Back to trend". Tip under the chart: "Tip: click a point to see that day's levels throughout the day."
- **Range pills:** Today · 7 days · 30 days · 90 days (15 px gap below).
- Empty: centered 14 px muted "No {metric} level data recorded for this period."
- **Adherence rings:** SVG rotated −90°, round caps, 0.6 s ease on `stroke-dashoffset`. Hero version on dark (2.5); report version colored by bucket (≥80 green, ≥50 amber, else red).
- Calendar heat map: 8.7. Inventory bar: 6.6.

---

## 12. Status semantics (single reference)

| State | Color | Badge text | Calendar cell | Count code |
|---|---|---|---|---|
| Taken (on time) | success | Taken | green tint | `T` |
| Taken late | warning | Taken (N min late) | green tint | `T` |
| Pending / due | warning | Pending | none | – |
| Snoozed | brand-blue | Snoozed until {time} | none | – |
| Skipped | warning | Skipped | amber tint (if nothing taken) | `S` |
| Missed | danger | Missed | red tint (wins) | `M` |
| Low supply | warning | Low supply | – | – |
| Critically low / out | danger (text) | Critically low / Out of stock | – | – |

"Late" threshold = the grace minutes in Settings (default 60). Missed is applied automatically once the grace period passes. Group aggregate precedence: **missed > skipped > late > taken**.

---

## 13. Copy and tone

- Sentence case for buttons and labels; Title Case only on page names (nav, h1).
- Buttons are verbs: "Take", "Skip", "Snooze", "Save changes", "Log refill", "Add medication", "Discard". Longer: "Take without logging", "Save & take", "Generate & Download PDF".
- Busy states: "Saving…", "Recording…", "Generating PDF…", "Signing in…", "Loading…" (single ellipsis character).
- Empty states start with "No …" and, when useful, name the next step ("Add your first one to get started.").
- Medical disclaimer language is plain: "RxTracker is a tracking aid only and does not provide medical advice."
- Times are 12-hour with AM/PM (`8:00 AM`). Dates: `Mon, Oct 12` (short), `October 12, 2026` (long). Late: "12 min late".
- Medication type labels: `Rx`, `OTC`, `Supplement`.

---

## 14. Motion

| Where | Motion |
|---|---|
| Buttons | opacity transition on hover (90%) |
| Level pick, tags, tabs | color `transition` (~150 ms) |
| Chevron expanders | 180° rotate, `transition-transform` |
| Switch thumb | translate, ~150 ms |
| Adherence ring | `stroke-dashoffset` 0.6 s ease |
| Alarm overlay | ping (≈1 s loop) + pulse on the ring |
| Drag to reorder | card at 60% opacity, CSS transform follows pointer |
| Dialogs and toasts | Radix / Sonner defaults |

No page transitions, skeleton shimmers or parallax.

---

## 15. Accessibility

- Icon-only buttons carry `aria-label`s ("Open navigation menu", "My profile", "Notifications", "Medication actions", "Dismiss refill reminder for X", "Drag to reorder X", "Previous month", "Show password").
- Dialogs use Radix focus trap, Esc to close and a `DialogTitle`; the alarm is `role="alertdialog"` with an `aria-label`; the lightbox is `role="dialog" aria-modal`.
- Expanders use `aria-expanded`; ring graphics expose `role="img"` with text ("72% required adherence, 50% non-required adherence today").
- Color is never the only status signal: badges include text; calendar counts include letters (T / S / M).
- Focus: inputs get a `brand-blue` border (plus ring on auth); switches show a 2 px ring; menu items highlight with `brand-bg`.
- Icon buttons are 36–40 px; compact text buttons are ≈ 26 px high, so on mobile enlarge to 44 pt (section 17).
- Muted text `#60708A` has ≈ 4.7:1 contrast on white and ≈ 4.3:1 on `#EAF4FF`; keep it ≥ 12 px.

---

## 16. Print and PDF

- `@media print`: elements with `data-no-print` (header, filters, buttons) are hidden; `body` is white; `[data-report-section]` uses `break-inside: avoid`.
- Chart dialogs print only the chart (the page `<main>` is `data-no-print`).
- **PDF report (react-pdf):** Helvetica 9 pt body; header block on `#071D3D` with 24 × 32 padding, 48 px logo, title 20 pt bold white, subtitle 9.5 pt `#CFE6F7`; body margin 0 32; section title 12.5 pt bold navy, description 8.5 pt muted; tables with 1 pt `brand-border` lines, 7.5 pt uppercase muted headers on `brand-bg`, 8.5 pt rows; fixed footer disclaimer at `bottom: 20`; page bottom padding 85.

---

## 17. Mobile (React Native) translation guide

The app is Expo SDK 57 / React Native 0.86 with Expo Router (`src/app`). Existing tabs: Dashboard, Medications, Calendar, Pain & Mood, Settings; stack screens exist for auth, onboarding, groups, export, family, history, profile and help.

### 17.0 Styling: NativeWind

The app styles with **NativeWind 4.2.7** (Tailwind CSS v3). Web uses Tailwind v4, so tokens are defined twice — `@theme` in `rx-tracker-web/app/globals.css` and `tailwind.config.js` in the app — but **class names are shared** (`bg-brand-bg`, `text-status-danger`, `rounded-card`, `shadow-card`, `border-brand-border`, …). Keep the two files in sync with section 2 and 4.

- Prefer `className` over `StyleSheet.create` in new code. Base components live in `src/components/ui/`: `Button` (primary / secondary / ghost / danger, default / compact), `Card` (`flat` drops the shadow), `Badge`, `Field`.
- Not expressible as classes: gradients (use `expo-linear-gradient`, see `Button`), hover states (use `active:`), `backdrop-blur`, web grid layouts.
- Opacity tints work as on web: `bg-status-success/10`.

### 17.1 Tokens

Reuse `Brand`, `BorderRadius` (10 / 18 / 28) and `Spacing` from `src/constants/theme.ts`. Add what is missing:

```ts
export const Status = {
  success: '#18BFA6', warning: '#F5A524', danger: '#E5484D', snoozed: '#0A8AC8',
} as const;

export const Shadow = {
  card: { shadowColor: '#071D3D', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 18 }, elevation: 8 },
  hero: { shadowColor: '#071D3D', shadowOpacity: 0.24, shadowRadius: 30, shadowOffset: { width: 0, height: 22 }, elevation: 12 },
} as const;

export const FontSize = { micro: 10, xs: 12, sm: 14, base: 16, lg: 18, xl: 20, h1: 24, display: 30, hero: 36 } as const;

export const Gradient = {
  brand: ['#14CFE0', '#0A8AC8', '#0754A8'],
  brandDark: ['#102B57', '#0754A8', '#14CFE0'],
  hero: ['#18D0DC', '#0A8AC8', '#0754A8', '#071D3D'],
  auth: ['#071D3D', '#0754A8', '#0A8AC8', '#14CFE0'],
} as const;
```

- Spacing: the mobile scale (`one`=4, `two`=8, `three`=16, `four`=24, `five`=32) covers the web scale; add 6 and 12 for the `gap-1.5` / `gap-3` cases.
- Tint helper: `withAlpha(color, 0.1)` for `bg-status-*/10`.
- Gradients: `expo-linear-gradient` with `start={{x:0,y:0}} end={{x:1,y:1}}` (≈135°); auth hero ≈160° → `start={{x:0.3,y:0}} end={{x:0.7,y:1}}`.
- Dark mode: keep brand and status hues; swap surfaces only (`backgroundElement #212225`, text white). Web has no dark mode.

### 17.2 Layout and navigation mapping

| Web | Mobile |
|---|---|
| Top nav links (Dashboard, Medications, Calendar, Export, Pain Tracking, Mood & Wellbeing) | **Bottom tabs:** Dashboard · Medications · Calendar · Pain & Mood · Settings. Export, History, Family, Profile and Help are stack screens reached from the dashboard, Settings or the avatar sheet |
| Avatar dropdown (Profile, owner/family switch, Manage Family, Sign out) | Header avatar → **bottom sheet** with the same order |
| Bell dropdown | Bell → **bottom sheet** with the same row layout |
| Settings gear / Help icons | Settings tab; Help from Settings |
| Resume-setup and family-context banners | Same banners, pinned under the safe-area top inset above screen content |
| `max-w-6xl` container with `px-4` | Full width with **16 px horizontal padding** and safe-area insets; on tablets center and clamp to `MaxContentWidth` (800) |
| Two-column dashboard grid | Single column: Hero → refill banner(s) → Today schedule → Quick actions → Medications overview → Today's history |
| Hero two-card grid | Stack the Next-dose and Adherence glass cards (ring 148 → 132 on small phones) |
| Hover states | Pressed state: opacity 0.85 (primary / danger) or `brand-bg` fill (secondary / ghost) |

### 17.3 Components

| Web | React Native |
|---|---|
| `Button` | `Pressable` (+ `LinearGradient` for primary), same variants and radius. Heights: default **44**, compact **32–36** with `hitSlop` up to 44 pt |
| Card | `View` with 1 px `#D7E6F8` border, radius 18, `Shadow.card` |
| Input | `TextInput`, 1 px `#D7E6F8` border, radius 10, padding 12 × 8 (16 × 12 on auth); focus → border `#0A8AC8` (auth: wrap with a 4 px `rgba(10,138,200,0.1)` halo) |
| Select | Bottom-sheet picker (iOS wheel / Android modal list) with the same option labels |
| Date / time | `@react-native-community/datetimepicker` |
| Checkbox / radio / switch | Custom 18–20 px checkbox in deep-blue; `Switch` with `trackColor={{ false: '#D7E6F8', true: '#0A8AC8' }}` and a white thumb |
| Dialog (`max-w-md`) | **Centered modal** for short confirmations; **bottom sheet** (28 px top radius, drag handle) for forms and lists. Keep title, subtitle and footer button order; stack footer buttons full-width on narrow screens (primary first is acceptable) and keep destructive actions red |
| Dropdown menu (kebab) | Action sheet / bottom sheet with 48 px rows, icon + label, red destructive row |
| Popover (filter) | Bottom sheet |
| Toast (Sonner) | `react-native-toast-message` (or equivalent) top-center under the safe area; green success / red error; same strings (10.3); ≈ 4 s |
| `window.confirm` / inline confirm | `Alert.alert` (see `src/lib/confirm.ts`) |
| `<details>` accordion | `Pressable` header + Reanimated/LayoutAnimation height; chevron rotation |
| Drag-to-reorder | `react-native-gesture-handler` + a reorderable list; grip handle on the left; 60% opacity while dragging |
| Charts | `react-native-svg` (or victory-native) matching section 11 (height 220, ticks 1 / 3 / 5 / 7 / 10, dashed grid, tier-colored dots, tap a point to drill in) — the app already has `src/components/TrendChart.tsx` |
| Rings | `react-native-svg` circles with `strokeDasharray`; animate `strokeDashoffset` for 600 ms |
| Alarm overlay | Full-screen `Modal` (`navy/90`) + `expo-notifications` for background/lock-screen alerts, haptics/`Vibration`, `expo-audio` for the tone; keep layout and labels (`DueNowOverlay.tsx` is the existing counterpart) |
| Lightbox | Full-screen `Modal`; pinch-to-zoom optional |
| PDF export | Share the generated PDF with `expo-sharing` / `expo-file-system`; same section order |
| Icons | Ionicons per section 5 |
| Circular images | `Image` with `resizeMode="cover"` and `overflow: 'hidden'` |

### 17.4 Touch ergonomics (expected deviations from web)

- Minimum touch target **44 × 44 pt**: add padding or `hitSlop`; compact buttons keep their visual size.
- Dose-row actions (Take / Skip / Snooze) may wrap onto a second line below the medication info on screens narrower than 360 pt; keep the order Take → Skip → Snooze.
- Replace hover-only affordances (tooltips) with visible labels or long-press.
- Calendar cells shrink to roughly 44–52 pt squares showing the day number plus colored dots (green / amber / red); the full detail stays in the day sheet. T / S / M counts may appear beneath at 9–10 pt if space permits.
- Wizard / onboarding stepper keeps the circles but shows a label only for the active step below 360 pt.
- Respect safe areas: header and banners use the top inset; bottom sheets and footers use the bottom inset; add `BottomTabInset` to scroll padding.
- Forms inside bottom sheets use `KeyboardAvoidingView`; keyboard "done" submits.

### 17.5 Behavior parity checklist

- Medication name always rendered as name + dose suffix (0.875em, bold, muted).
- Status colors and labels exactly per section 12.
- Take flow: feedback dialog (if pain/mood tracked) → time-input step (when past due) → zero-pill check (inventory 0) → toast "Dose recorded".
- Group dose card aggregate badge precedence: missed > skipped > late > taken.
- Refill reminders dismissible per day; the bell and the banners share dismissals.
- Settings: grace minutes (5–240), default snooze (5 / 10 / 15 / 30), timezone, alarm sound, vibration (device-local), teal mood chart.
- Family: the active profile persists; the context banner shows whenever a family member is active.

---

## 18. Gaps and web-only behavior

- **Web is light-only.** There is no dark-mode token set on web.
- **Web-only:** PWA install banner, Font Awesome info icon, print stylesheet and `window.print()` buttons on chart dialogs, drag-and-drop via `@dnd-kit` (mobile uses gesture-handler), hover states, `<details>` accordions, browser file/camera input (mobile: `expo-image-picker`).
- **Inconsistencies in the web code** — mobile should follow the *intended* value in bold:
  - The medication actions menu uses `rounded-[2px]`; every other menu uses 18 px → use **18**.
  - The group card uses ad-hoc greys (`#f9f9f9` title, `#333` time, `#d4d4d4` icons) → on mobile use **white** title, **`white/80`** time, white icons.
  - Level-picker colors (`LevelGrid`, solid hex) differ from the badge/chart colors (status tokens) → keep both as documented, but do not mix them on the same surface.
  - The dashboard hero gradient stops (`#18D0DC … #071D3D`) differ from the `bg-gradient-brand-hero` utility → use the **dashboard hero** gradient for hero/refill and the **auth hero** gradient for auth.
  - Some form dialogs use `ghost` for Cancel and others `secondary` → mobile: **ghost for Cancel in form dialogs, secondary for "Keep editing" / "Back" / dismissive choices**.
  - Date/time strings use the user's locale on web → keep the formats in section 13 via one shared formatter on mobile.
- Auth email templates and OAuth consent screens are provided by Supabase/Google and are not specified here.

---

*Generated from `rx-tracker-web` on branch `ccr-0b6005a9-yp7wc9`. When the web UI changes, update this file in the same PR and mirror it to `rx-tracker-app`.*
