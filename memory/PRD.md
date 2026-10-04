# VitaTrack — Diabetes & Blood Pressure Companion (Zambia)

## What it does
Private phone-passcode login (+260 default). Users log blood glucose (mmol/L) and blood pressure (mmHg). The app classifies each reading, warns on hypo/hyper or hypertension, trends readings on a chart, gives Zambia-aware AI diet/treatment advice (nshima, kapenta, chibwabwa, rape, etc.) via GPT-5.6 Terra, tracks medication adherence, lets users set daily local reminders, and shares a read-only 7-day doctor link or exports PDFs for clinicians.

## Stack
- Backend: FastAPI + MongoDB (motor), JWT auth, bcrypt-hashed passcodes
- AI: emergentintegrations (openai/gpt-5.6-terra) with per-user recent-reading context tuned to Zambia
- Frontend: Expo Router, React Query, lucide icons, react-native-svg charts, expo-notifications, expo-print, expo-sharing, expo-clipboard
- Theme: Sage botanical palette, light + dark

## API surface (all under /api)
- POST /auth/signup, /auth/login, GET /auth/me
- POST/GET/DELETE /readings/glucose
- POST/GET/DELETE /readings/bp
- GET /stats/summary (now includes streak_days using Africa/Lusaka day boundary)
- POST /advice (Zambian food context), GET /advice/history
- GET /report (text) — frontend PDF export via expo-print
- POST/GET/PATCH/DELETE /reminders
- POST/GET/DELETE /medications, POST /medications/log, GET /medications/history
- POST /share/create, GET /share/current, POST /share/revoke
- Public: GET /api/share/{token} → read-only HTML page (7-day expiry)

## Screens
- /(auth)/login — phone (+260 default) + 4-8 digit passcode
- /(tabs)/index — dashboard with streak chip, critical alerts, latest glucose + BP cards, quick actions (Log, Share, Reminders, Medications)
- /(tabs)/log — segmented glucose/BP form with Zambia-friendly helpers
- /(tabs)/history — SVG line chart with in-range band + reading list
- /(tabs)/advisor — AI chat with Zambian food guidance
- /reminders — daily local notifications (schedule via expo-notifications)
- /medications — track name/dose/times-per-day, log each dose
- /share-link — create/revoke 7-day read-only doctor link
- /report — text + PDF export + share
- /settings — profile, quick links, sign out

## Testing status
- 31/31 original backend tests pass
- 22/22 new-feature backend tests pass (reminders, meds, share, streak, Zambia advice)
