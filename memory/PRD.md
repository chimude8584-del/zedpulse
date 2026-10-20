# ZedPulse — Diabetes & Blood Pressure Companion (Zambia)

## What it does
Private phone-passcode login (+260 default). Users log blood glucose (mmol/L) and blood pressure (mmHg). The app classifies each reading, warns on hypo/hyper or hypertension, trends readings on a chart, gives Zambia-aware AI diet/treatment advice via GPT-5.6 Terra, tracks medications, sets daily local reminders, scans meals via camera + AI vision, lists ~40 Zambian clinics with GPS, delivers weekly insights, shows typical ZMW pharmacy prices for 34 common items, works offline-first, and shares a read-only 7-day doctor link or exports a PDF.

## Stack
- Backend: FastAPI + MongoDB (motor), JWT auth, bcrypt-hashed passcodes
- AI: emergentintegrations (openai/gpt-5.6-terra) + ImageContent for vision (food scanner)
- Frontend: Expo Router, React Query + persistQueryClient (AsyncStorage), lucide icons, react-native-svg, expo-notifications, expo-print, expo-sharing, expo-clipboard, expo-image-picker, expo-location, @react-native-community/netinfo
- Theme: Sage botanical palette, light + dark

## New in this iteration (v1.3 — Growth features)
- **Daily Health Tip** on dashboard: Sage-green card with lightbulb icon showing a fresh Zambian-context health tip every day (63 tips total, rotates by day-of-year). Covers nutrition (nshima, kapenta, chibwabwa), BP, glucose, foot care, exercise, mental health, clinic & pharmacy advice. New endpoint `GET /api/tips/today` (public).
- **Referral program ("Give 7 days, get 7 days")**: Each user gets a unique 6-char uppercase code at signup. New signup can enter a referral code → **both** users get 7 days of ZedPulse Pro (stackable for the inviter). "PRO" chip shown in dashboard header for Pro users. Full invite screen at `/referral` with code box, WhatsApp/SMS share, invite count stats, "How it works" guide. New endpoint `GET /api/referral/me`.
- **Signup updates**: Optional "Referral code 🎁" field (auto-uppercases, max 6 chars). Signup response and login response now include `referral_code` and `pro_until`.
- **Backfill**: On backend startup, legacy users (including admin) get a referral code backfilled automatically.

## New in previous iteration (v1.2 — Pharmacy contact + Admin)
- **Tap-to-call & WhatsApp in Pharmacy watch**: Each pharmacy in "Where to buy" now shows Call 📞 and WhatsApp 💬 buttons that open the native dialer or wa.me chat. 9 Zambian pharmacies seeded with publicly-known head-office numbers; "numbers may change" disclaimer visible.
- **Crowdsourced pharmacy directory**: Any logged-in user can tap "Suggest a pharmacy or branch" to submit a new branch (name, location, phone, WhatsApp, note) — submissions go into a pending queue for admin review. Users can view their own submission status (Pending/Approved/Rejected) on the submit screen.
- **In-app admin dashboard** (`/admin`): Hidden Settings entry visible ONLY to users with `role=admin`. Three tabs:
  - **Pending** — approve/reject user-submitted pharmacies (approve creates a live pharmacy row).
  - **Pharmacies** — full CRUD: add, edit, delete any pharmacy's name/note/phone/WhatsApp.
  - **Stats** — total users, approved pharmacies, pending submissions, total readings.
- **Admin seeded automatically**: On backend startup, if admin user doesn't exist, it's created at `+260000000000 / 9999`. All existing users without a role field get `role=user` backfilled.
- **Backend**: `role` added to users, `require_admin` dependency, 9 new endpoints (`/pharmacy/submit`, `/pharmacy/submissions/mine`, `/admin/stats`, `/admin/submissions`, `/admin/submissions/{id}/approve|reject`, `/admin/pharmacies` CRUD). Pharmacies now live in a MongoDB collection seeded from `ZAMBIA_PHARMACIES_SEED`.

## New in previous iteration (v1.1 polish)
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
