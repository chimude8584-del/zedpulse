# VitaTrack — Diabetes & Blood Pressure Companion

## What it does
Private phone-passcode login. Users log blood glucose (mmol/L) and blood pressure (mmHg). The app classifies each reading, warns on hypo/hyper or hypertension, trends readings on a chart, gives AI-personalized diet/treatment advice (GPT-5.6 Terra via Emergent LLM key), and exports a shareable text report for clinicians.

## Stack
- Backend: FastAPI + MongoDB (motor), JWT auth, bcrypt-hashed passcodes
- AI: emergentintegrations (openai/gpt-5.6-terra) with per-user recent-reading context
- Frontend: Expo Router, React Query, lucide icons, react-native-svg for charts
- Theme: Sage botanical palette, light + dark

## API surface (all under /api)
- POST /auth/signup, /auth/login, GET /auth/me
- POST/GET/DELETE /readings/glucose
- POST/GET/DELETE /readings/bp
- GET /stats/summary
- POST /advice, GET /advice/history
- GET /report  (text report for Share/Copy)

## Screens
- /(auth)/login — phone + 4-8 digit passcode, toggles to signup
- /(tabs)/index — dashboard: critical alerts, latest glucose + BP cards with status chips, 30-day avg, in-range %, quick-log/share buttons
- /(tabs)/log — segmented glucose/BP form, context chips, in-range helper, server classification result card
- /(tabs)/history — segmented tabs with SVG line chart (shaded in-range band) + reading list with per-row severity dot + delete
- /(tabs)/advisor — AI chat, quick-action chips (diet/glucose/BP/treatment), disclaimer banner
- /report — shareable/copyable monospaced report
- /settings — profile, report shortcut, sign out

## Thresholds
- Glucose: <3.0 severe hypo; <3.9 hypo; context-sensitive upper (fasting 7.0, after-meal 10.0, bedtime 8.3); 10.0-13.9 high; <20.0 very high; >=20.0 critical
- BP: <90/60 low; <120/80 normal; 120-129 elevated; 130-139/80-89 stage 1; >=140/>=90 stage 2; >=180/>=120 crisis
