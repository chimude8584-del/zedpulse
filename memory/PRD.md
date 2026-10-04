# ZedPulse — Diabetes & Blood Pressure Companion (Zambia)

## What it does
Private phone-passcode login (+260 default). Users log blood glucose (mmol/L) and blood pressure (mmHg). The app classifies each reading, warns on hypo/hyper or hypertension, trends readings on a chart, gives Zambia-aware AI diet/treatment advice via GPT-5.6 Terra, tracks medications, sets daily local reminders, scans meals via camera + AI vision, lists ~40 Zambian clinics with GPS, delivers weekly insights, shows typical ZMW pharmacy prices for 34 common items, works offline-first, and shares a read-only 7-day doctor link or exports a PDF.

## Stack
- Backend: FastAPI + MongoDB (motor), JWT auth, bcrypt-hashed passcodes
- AI: emergentintegrations (openai/gpt-5.6-terra) + ImageContent for vision (food scanner)
- Frontend: Expo Router, React Query + persistQueryClient (AsyncStorage), lucide icons, react-native-svg, expo-notifications, expo-print, expo-sharing, expo-clipboard, expo-image-picker, expo-location, @react-native-community/netinfo
- Theme: Sage botanical palette, light + dark

## New in this iteration
- **Pharmacy watch** (`/pharmacy`): 34-item curated list across 3 categories (meds, testing kits, BP monitors) with ZMW price ranges, pack size, usage note, and chip-list of Zambian stockists (Pharmanova, Link Pharmacy, Health Plus, Shoprite, UTH, Government clinics, etc.). Searchable; category chips in a horizontal scroller.
- **Offline-first**: PersistQueryClientProvider at root saves the React Query cache to AsyncStorage (90 days). NetInfo bridges to `onlineManager` so queries use cached data when offline and mutations auto-retry on reconnect. `OfflineBanner` component shows a warm amber banner at the top when the device is offline.

## API surface (/api)
Existing + new:
- GET /pharmacy/items?category=&q= (public)
- GET /pharmacy/stockists (public)

## Testing status
Cumulative 93/93 backend tests pass (31 original + 22 Zambia + 27 ZedPulse + 13 pharmacy).

## Expo Go compatibility
Camera, gallery, location, local notifications, offline cache: all work in Expo Go. Background push / background audio require a native build.
