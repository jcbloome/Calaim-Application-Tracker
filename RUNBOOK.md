## Operations Runbook (full app)

This is the practical checklist for **running, debugging, deploying, and recovering** the entire CalAIM Tracker system:
- **Web app**: Next.js (Firebase App Hosting)
- **Backend**: Firebase Functions (Node 22) + Firestore + Storage + Auth
- **Integrations**: Caspio REST API, Google Drive API, Google Maps API, email (Resend / legacy SendGrid)
- **Desktop companion**: Electron + `electron-updater` (GitHub Releases)

### Quick links (in-repo)
- **Session context**: `SESSION_LOG.md`, `PROJECT_LOG.md`
- **Recovery**: `DISASTER_RECOVERY.md`
- **Setup guides**: `CASPIO_SETUP.md`, `CASPIO_WEBHOOK_SETUP.md`, `GOOGLE_DRIVE_SETUP.md`, `GOOGLE_MAPS_SETUP.md`, `DNS_SETUP_GUIDE.md`
- **Desktop**: `desktop/`, `desktop/CODE_SIGNING.md`

---

## Local development

### Web app (Next.js)
- **Install**: `npm install`
- **Run**: `npm run dev`
- **Build**: `npm run build`

Key routes to sanity-check locally:
- **Admin login**: `/admin/login`
- **Admin applications**: `/admin/applications`
- **CS Summary form**: `/forms/cs-summary-form`
- **SW visit verification**: `/sw-visit-verification`
- **SW claims (auto-generated daily drafts)**: `/admin/sw-claims`

### Firebase Functions (emulator / deploy)
From `functions/`:
- **Install**: `npm install`
- **Build**: `npm run build`
- **Emulator**: `npm run serve`
- **Logs**: `npm run logs`
- **Deploy**: `npm run deploy`

### Desktop app (Electron)
From repo root:
- **Run**: `npm run desktop:dev`
- **Build**: `npm run desktop:build`
- **Create Windows installer**: `npm run desktop:dist:win`

Desktop URL override:
- **`CALAIM_DESKTOP_URL`** (defaults to `https://connectcalaim.com` per `README.md`)

---

## Environments, secrets, and config

### Firebase App Hosting (web)
The web app is configured for **Firebase App Hosting** and uses secret-mapped env vars via `apphosting.yaml`.

`apphosting.yaml` expects these as **secrets** (mapped into runtime env):
- `CASPIO_BASE_URL`
- `CASPIO_CLIENT_ID`
- `CASPIO_CLIENT_SECRET`
- `CASPIO_TABLE_NAME`

### Web app environment variables (common)
These show up in the Next.js codebase (do not commit real values):
- **Firebase client**: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
- **App URLs**: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BASE_URL`
- **Caspio base (public override)**: `NEXT_PUBLIC_CASPIO_BASE_URL` (optional; server values are preferred)
- **Google Maps**: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- **Desktop installer metadata**: `NEXT_PUBLIC_DESKTOP_INSTALLER_URL`, `NEXT_PUBLIC_DESKTOP_INSTALLER_VERSION` (optional)

### Server-only environment variables (web runtime)
- **Caspio**: `CASPIO_BASE_URL`, `CASPIO_CLIENT_ID`, `CASPIO_CLIENT_SECRET`, `CASPIO_TABLE_NAME`
- **Email**: `RESEND_API_KEY` (required for most email flows); `SENDGRID_API_KEY` exists in Functions code (legacy)
- **Cron auth**: `CRON_SECRET` (guards `/api/cron/reminders`)
- **AI** (if used): `ANTHROPIC_API_KEY`
- **Firebase Admin credentials** (only needed in certain local/self-host contexts):
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON` (preferred for local) or `GOOGLE_APPLICATION_CREDENTIALS` (path)
  - `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_URL`, `FIREBASE_STORAGE_BUCKET` (optional overrides)

### Firebase Functions secrets
Functions use `defineSecret(...)` for Caspio creds (see `functions/src/index.ts`):
- `CASPIO_BASE_URL`
- `CASPIO_CLIENT_ID`
- `CASPIO_CLIENT_SECRET`

Google Drive integration uses additional secrets/vars (see `GOOGLE_DRIVE_SETUP.md`).

### Never commit secrets
- Do not commit `.env`, `.env.local`, `.env.development` (these exist locally and may contain secrets).

---

## Deployment (web + functions)

### Web app (Firebase App Hosting)
- **Build**: `npm run build` (CI validation)
- **Deploy**: deploy via Firebase App Hosting pipeline/console for the configured backend.
- **Post-deploy smoke test**:
  - `/admin/login`
  - `/admin/applications`
  - `/forms/cs-summary-form`
  - `/admin/my-notes` (if staff notes are critical for ops)

### Functions
Deploy after web deploy **when API or scheduled jobs changed**.
- **Deploy** (from `functions/`): `npm run deploy`
- **Verify**:
  - Function logs show no startup failures
  - Webhook endpoints respond (see `CASPIO_WEBHOOK_SETUP.md`)
  - Reminder schedules are firing (if enabled)

---

## Core systems (what “healthy” looks like)

### Applications + admin workflow
- Firestore collection: `applications`
- Admin UI: `src/app/admin/**`
- Caspio is generally the “system of record” for member/staff datasets; app caches/augments data in Firestore for real-time UX.

### Staff notes + notifications (Caspio webhooks)
- Webhook setup: `CASPIO_WEBHOOK_SETUP.md`
- Expectation:
  - A new Caspio note triggers email + in-app notification for configured recipients
  - Super admins can view system note log

### Google Drive integration (migration + matching)
- Setup guide: `GOOGLE_DRIVE_SETUP.md`
- Expectation:
  - Service account can scan the CalAIM Members folder
  - Matching utilities can compare folders against Caspio member records

### Google Maps
- Setup guide: `GOOGLE_MAPS_SETUP.md`
- Expectation:
  - With `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, geolocation address resolution works in admin visit tracking UI

---

## Social Worker (SW) system runbook (visits + daily claims)

### Data model
- **Visits**: `sw_visit_records/{visitId}`
  - Key fields: `socialWorkerUid/email/name`, `submittedAtTs` (Timestamp), `flagged`, `flagReasons`, `status`, plus claim linkage fields (`claimId`, `claimStatus`, paid/submitted fields)
- **Claims**: `sw-claims/{claimId}` (deterministic daily claim id)
  - `claimId` format: `swClaim_${swKey}_${yyyyMMdd}` where `swKey` prefers **uid**, else **email**, else SW id
  - Key fields: `claimDate` (Timestamp), `claimMonth`, `visitIds`, `visitCount`, `memberVisits`, totals, `status`, `submittedAt`, `paidAt`

### Rates (current policy)
- **$45 per visit**
- **+$20 gas once per day** (if at least one visit occurred that day)

### Happy-path verification checklist
- Submit SW visit questionnaire (`/sw-visit-verification`)
  - Confirm Firestore visit doc exists in `sw_visit_records`
- Confirm a same-day claim draft exists in `sw-claims` with expected totals
- Submit the daily claim from SW claims UI (`/admin/sw-claims`)
  - Server route: `POST /api/sw-claims/submit` verifies Firebase ID token and claim ownership
  - Linked visit docs should reflect submitted fields (`claimSubmitted`, `claimSubmittedAt`, `claimStatus`)
- Mark claim **paid** in admin claims management (`/admin/sw-claims-management`)
  - Paid fields propagate to linked visit docs (`claimPaid`, `claimPaidAt`, `claimStatus: paid`)

### Key routes (source of truth)
- Visit submission + claim upsert: `src/app/api/sw-visits/route.ts` (POST)
- Visit records query: `src/app/api/sw-visits/records/route.ts` (GET)
- Claim submit: `src/app/api/sw-claims/submit/route.ts` (POST)
- Admin visit tracking UI: `src/app/admin/sw-visit-tracking/page.tsx`
- SW claims UI: `src/app/admin/sw-claims/page.tsx`

---

## Desktop companion app (Electron) + update feed

### Release artifacts (GitHub Releases)
A desktop release should include at minimum:
- `.exe` installer
- `.exe.blockmap`
- `latest.yml`

The web app provides a “download installer” experience via:
- `src/app/admin/desktop-installer/route.ts` (serves local fallback or redirects to latest GitHub asset)
- `src/app/admin/desktop-installer/meta/route.ts` (JSON metadata: version/url/sha256)

### Preparing local fallback installer bundle
- Build desktop installer (creates `desktop/release/*`)
- Run: `npm run desktop:installer:prepare`
  - Copies latest installer + metadata into `public/downloads/`
  - Writes `public/downloads/installer.json` and sha256 file

### Windows code signing (recommended)
See `desktop/CODE_SIGNING.md` and set:
- `CSC_LINK`
- `CSC_KEY_PASSWORD`

---

## Routine maintenance (weekly / monthly)
- Verify **Firestore export backups** are running (nightly) and retention is correct.
- Check Cloud Logging for spikes in 5xx and auth failures.
- Confirm Caspio webhook health (recent events, successful processing).
- Confirm desktop download route works (`/admin/desktop-installer` redirect/metadata).
- Add notable changes to `PROJECT_LOG.md` and update `SESSION_LOG.md` after major ships.

---

## Monitoring and alerting (minimum viable)
- **Web**: watch error rates and “blank page” reports; verify critical admin routes.
- **Functions**: watch deploy failures, webhook processing errors, scheduled job failures.
- **Email**: Resend dashboard delivery failures/bounces for operational notifications.
- **Desktop**: update failures via user reports/logs; ensure GitHub release assets are present.

---

## Incident response

### First 15 minutes
- Confirm impact (web vs functions vs auth vs desktop update feed).
- Capture timestamps, error samples, and recent deploy/release identifiers.
- Decide fast rollback vs hotfix.

### Rollback options
- **Web (App Hosting)**: roll back in App Hosting console to last known good release.
- **Functions**: redeploy last known good version (prefer a git tag).
- **Desktop**: ensure GitHub release has correct `latest.yml` + installer; if not, re-point metadata or republish assets.

### After stabilization
- Write a short summary in `PROJECT_LOG.md`.
- If new failure mode: update `DISASTER_RECOVERY.md` and this `RUNBOOK.md`.

---

## Troubleshooting (common)

### GitHub / CLI fails due to localhost proxy
Symptom: requests try to hit `127.0.0.1:<port>` and fail.
- Fix: clear proxy environment variables for the session before running `git`/`gh`.

### Caspio “only 1000 records returned”
- Use the utilities in `src/lib/caspio-api-utils.ts` (partition + pagination strategy).

### Desktop installer label/version seems stale
- Hard refresh the page (Ctrl+F5).
- Check `/admin/desktop-installer/meta` to confirm what version/url the server is returning.

---

## Key paths
- `RUNBOOK.md` — this document
- `DISASTER_RECOVERY.md` — high-level recovery steps
- `SESSION_LOG.md` — newest-first session snapshot for AI continuity
- `PROJECT_LOG.md` — chronological development log
- `apphosting.yaml` — App Hosting secret/env mapping
- `public/downloads/` — desktop installer fallback bundle

