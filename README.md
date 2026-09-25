# rx-tracker-app

Expo/React Native Android app for RxTracker, the medication tracking project. Talks to the
same Supabase project as [rx-tracker-web](https://github.com/rudyjm3/rx-tracker-web) (the
Next.js web rebuild) — shared auth, shared data, no separate backend. The original
[rudyjm3/rx-tracker](https://github.com/rudyjm3/rx-tracker) (PHP/MySQL) is the functional
reference for feature parity.

## Why a separate app

RxTracker's medication reminders are delivered via push notification from this app rather
than web push — rx-tracker-web's Supabase schema already has an Expo-token
`push_subscriptions` table reserved for it. That wiring isn't built yet; this first phase
focuses on getting core screens (auth, dashboard, dose logging) working against real data.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the Supabase project URL + publishable/anon key
npx expo start
```

## Stack

- Expo (SDK 57) + Expo Router, TypeScript
- Supabase Auth + Postgres (`@supabase/supabase-js`), session persisted via
  `@react-native-async-storage/async-storage`
- `src/lib/schedule.ts`, `src/lib/types/medications.ts` etc. are ported from
  rx-tracker-web's equivalents so "today's doses" logic stays identical between the two apps
