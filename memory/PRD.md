# ZedPulse — Diabetes & Blood Pressure Companion (Zambia)

## What it does
Private phone-passcode login (+260 default). Users log blood glucose (mmol/L) and blood pressure (mmHg). The app classifies each reading, warns on hypo/hyper or hypertension, trends readings on a chart, gives Zambia-aware AI diet/treatment advice via GPT-5.6 Terra, tracks medications, sets daily local reminders, scans meals via camera + AI vision, lists ~40 Zambian clinics with GPS, delivers weekly insights, shows typical ZMW pharmacy prices for 34 common items, works offline-first, and shares a read-only 7-day doctor link or exports a PDF.

## Stack
- Backend: FastAPI + MongoDB (motor), JWT auth, bcrypt-hashed passcodes
- AI: emergentintegrations (openai/gpt-5.6-terra) + ImageContent for vision (food scanner)
- Frontend: Expo Router, React Query + persistQueryClient (AsyncStorage), lucide icons, react-native-svg, expo-notifications, expo-print, expo-sharing, expo-clipboard, expo-image-picker, expo-location, @react-native-community/netinfo
- Theme: Sage botanical palette, light + dark

## New in this iteration (v1.1 polish)
- **Onboarding tour** (`/onboarding`): 4-slide pager shown after first signup — "Log in seconds", "See your trends", "Zambia-aware AI tips", "Share with your doctor". Skip or step through; "onboarded" flag stored in AsyncStorage so returning users go straight to the dashboard.
- **Hypo rescue timer** (`src/components/hypo-rescue-card.tsx`): When glucose < 3.9 mmol/L is logged, a terracotta-bordered card appears with 15:00 countdown, context-appropriate rescue instructions (15 g for warning, 20 g for severe), "I had rescue carbs" tap-to-confirm, and "Recheck now" shortcut that resets the Log form. Timer rolls over to a success "Time to recheck" banner at 00:00.
- **Theme preference** (System/Light/Dark): Three-chip toggle in Settings → Appearance. Persisted to AsyncStorage; applies instantly across all screens via a tiny subscription in `src/theme.ts`.
- **Delete account**: Inline Cancel/Yes-delete confirm card in Settings. Soft-deletes the user (phone renamed to `deleted-{id}`), stamps `deleted_at` on all their readings/meds/reminders, revokes share links, removes emergency contact; token immediately rejected server-side. Phone number is freed so they can re-sign up.
- **New brand assets**: Sage green rounded-square icon with white heartbeat + droplet + endpoint dot; matching adaptive icon (sage background) and a splash screen with "ZedPulse — Diabetes & BP · Zambia" wordmark on warm off-white.
- **Backend**: `DELETE /api/auth/account` + `get_current_user` now rejects soft-deleted users.

## API surface (/api)
Existing + new:
- GET /pharmacy/items?category=&q= (public)
- GET /pharmacy/stockists (public)

## Testing status
Cumulative 96/96 backend tests pass (31 original + 22 Zambia + 27 ZedPulse + 13 pharmacy + 3 delete account).

## Expo Go compatibility
Camera, gallery, location, local notifications, offline cache: all work in Expo Go. Background push / background audio require a native build.
