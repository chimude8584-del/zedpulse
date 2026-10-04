# ZedPulse — Diabetes & Blood Pressure Companion (Zambia)

Renamed to ZedPulse. All features now live.

## What it does
Private phone-passcode login (+260 default). Users log blood glucose (mmol/L) and blood pressure (mmHg). The app classifies each reading, warns on hypo/hyper or hypertension, trends readings on a chart, gives Zambia-aware AI diet/treatment advice via GPT-5.6 Terra, tracks medications, sets daily local reminders, scans meals via camera + AI vision, lists ~40 Zambian clinics with GPS distance, delivers weekly insights, and shares a read-only 7-day doctor link or exports a PDF.

## Stack
- Backend: FastAPI + MongoDB (motor), JWT auth, bcrypt-hashed passcodes
- AI: emergentintegrations (openai/gpt-5.6-terra) + ImageContent for vision (food scanner)
- Frontend: Expo Router, React Query, lucide icons, react-native-svg, expo-notifications, expo-print, expo-sharing, expo-clipboard, expo-image-picker, expo-location
- Theme: Sage botanical palette, light + dark

## API surface (/api)
- POST /auth/signup, /auth/login, GET /auth/me
- POST/GET/DELETE /readings/glucose, /readings/bp
- GET /stats/summary (streak_days)
- POST /advice (Zambian context), GET /advice/history
- GET /report (text report)
- POST/GET/PATCH/DELETE /reminders
- POST/GET/DELETE /medications, POST /medications/log, GET /medications/history
- POST /share/create, GET /share/current, POST /share/revoke, GET /share/{token} (public HTML)
- GET/POST/DELETE /profile/emergency-contact
- POST /food/scan (vision), GET /food/scans, GET /food/library (public, 30 items), POST /food/log
- GET /clinics (public, 40 Zambian clinics), GET /clinics?city=X
- GET /insights/weekly (stats + Zambian AI tip)

## Screens
- /(auth)/login — ZedPulse branding, +260 default
- /(tabs)/index — dashboard with streak chip, critical alerts (+ WhatsApp family button when contact saved), quick-action grid (Log, Share, Reminders, Meds, Food, Clinics, Insights)
- /(tabs)/log — segmented glucose/BP
- /(tabs)/history — SVG line chart + list
- /(tabs)/advisor — AI chat with Zambia-aware prompts
- /food-scanner — camera + gallery AI scan OR tap-to-log from 30-item Zambian library
- /clinics — city filter + GPS distance sort + Directions/Call per clinic
- /weekly-insights — glucose/BP/adherence/in-range tiles + Zambian AI tip
- /family-alerts — set/update/remove emergency contact; test WhatsApp
- /reminders, /medications, /share-link, /report, /settings

## Testing status
- Tests through iteration 3: 80/80 passed (31 original + 22 Zambia features + 27 ZedPulse new, after FileContent→ImageContent fix for vision)

## Expo Go compatibility
- Camera, gallery, location, local notifications: all work in Expo Go
- Deep push / background audio: build required
