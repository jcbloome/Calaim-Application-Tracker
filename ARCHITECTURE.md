# CalAIM Application Tracker — Architecture Reference

> **Last updated:** April 2026  
> **Purpose:** Full technical blueprint for onboarding, handoffs, and disaster recovery.  
> If the codebase needs to be recreated, this document is the marching order.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Environment Variables](#2-environment-variables)
3. [Directory Structure](#3-directory-structure)
4. [Firebase Project Setup](#4-firebase-project-setup)
5. [Firestore Collections](#5-firestore-collections)
6. [Admin Portal Pages](#6-admin-portal-pages)
7. [Social Worker Portal Pages](#7-social-worker-portal-pages)
8. [API Routes](#8-api-routes)
9. [Firebase Cloud Functions](#9-firebase-cloud-functions)
10. [Key Shared Components](#10-key-shared-components)
11. [Key Library Utilities](#11-key-library-utilities)
12. [External Integrations](#12-external-integrations)
13. [ALFT Workflow (End-to-End)](#13-alft-workflow-end-to-end)
14. [Authentication Model](#14-authentication-model)
15. [Recreating the App from Scratch](#15-recreating-the-app-from-scratch)

---

## 1. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Web framework | Next.js (App Router) | 15.0.7 |
| Language | TypeScript | ~5.x |
| Styling | Tailwind CSS + Radix UI | 3.4 |
| Forms | react-hook-form + zod | — |
| Charts | recharts | — |
| PDF generation | pdf-lib, html2pdf.js, react-pdf, pdfjs-dist | — |
| AI / GenKit | Genkit + Google Generative AI (Gemini) + Anthropic | — |
| Database | Cloud Firestore | — |
| Auth | Firebase Authentication | — |
| Storage | Firebase Storage | — |
| Serverless | Firebase Cloud Functions v2 (Node 22) | — |
| Hosting | Firebase App Hosting + Firebase Hosting | — |
| Email (app) | Resend | — |
| Email (functions) | SendGrid + Gmail (Nodemailer) | — |
| Desktop | Electron (calaim-desktop) | — |
| External data | Caspio REST API v3 | — |
| Maps | Google Maps + Google Geocoding API | — |
| Push notifications | Firebase Cloud Messaging (FCM) | — |

---

## 2. Environment Variables

All secrets are managed via **Firebase App Hosting secrets** (`apphosting.yaml`) and `.env.development` locally.

### Required (Next.js app)

```
# Firebase client SDK
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# Caspio REST API
CASPIO_BASE_URL
CASPIO_CLIENT_ID
CASPIO_CLIENT_SECRET
CASPIO_TABLE_NAME
NEXT_PUBLIC_CASPIO_BASE_URL

# Resend (transactional email)
RESEND_API_KEY

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
GOOGLE_GEOCODING_API_KEY

# Cron job authentication
CRON_SECRET

# AI (optional)
GEMINI_API_KEY
GOOGLE_API_KEY
```

### Required (Firebase Functions)

```
SENDGRID_API_KEY        # Functions email
CASPIO_BASE_URL
CASPIO_CLIENT_ID
CASPIO_CLIENT_SECRET
```

### Firebase Admin SDK

The Admin SDK (`src/firebase-admin.ts`) uses the default Application Default Credentials in Cloud Functions / App Hosting.  
Locally, point `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON.

Storage bucket: `studio-2881432245-f1d94.firebasestorage.app`

---

## 3. Directory Structure

```
/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── admin/              # Admin portal pages (~80 routes)
│   │   ├── sw-portal/          # Social Worker portal pages
│   │   ├── api/                # ~180 API route handlers
│   │   ├── sw-login/           # SW login page
│   │   └── layout.tsx          # Root layout
│   ├── components/
│   │   ├── ui/                 # Radix-based primitives (button, dialog, table…)
│   │   ├── alft/               # ALFT questionnaire + signature components
│   │   ├── admin/              # Admin-specific components
│   │   ├── emails/             # React Email templates
│   │   ├── forms/              # Printable forms
│   │   └── agreements/         # Room & board agreement components
│   ├── lib/                    # Server/shared utilities
│   ├── hooks/                  # Client React hooks (16 files)
│   ├── modules/                # Bounded modules (caspio-integration, firebase-integration)
│   ├── ai/                     # Genkit AI flows
│   ├── firebase/               # Firebase client SDK initialization
│   └── firebase-admin.ts       # Firebase Admin SDK initialization
├── functions/
│   └── src/                    # Firebase Cloud Functions source (~40 modules)
├── desktop/                    # Electron desktop app
├── public/                     # Static assets (logos, icons)
├── scripts/ / tools/           # One-off scripts (ERA parser, PDF tooling)
├── firebase.json               # Firebase project configuration
├── apphosting.yaml             # App Hosting backend + secrets
├── firestore.rules             # Firestore security rules
├── storage.rules               # Storage security rules
└── middleware.ts               # Edge middleware (debug API key gating)
```

---

## 4. Firebase Project Setup

**Project ID:** `studio-2881432245-f1d94`  
**App Hosting backend ID:** `studio`  
**Hosting site ID:** `studio-2881432245-f1d94`

### Services enabled
- Firestore (native mode)
- Firebase Authentication (email/password)
- Firebase Storage
- Firebase Cloud Functions (2nd gen)
- Firebase Hosting
- Firebase App Hosting
- Firebase Cloud Messaging (FCM)

### Deploying

```bash
# Full deploy (app hosting + functions)
firebase deploy --only "apphosting,functions" --force

# Functions only
firebase deploy --only functions

# Hosting only
firebase deploy --only hosting
```

### Local development

```bash
npm install
npm run dev          # Next.js dev server
```

---

## 5. Firestore Collections

### Core application data

| Collection | Purpose |
|---|---|
| `applications` | Member applications (main records) |
| `users` | Firebase user profiles; `alftSigningProfile`, `isKaiserAssignmentManager` flag |
| `roles_admin` | Admin role grants (doc id = uid or email) |
| `roles_super_admin` | Super-admin role grants |
| `socialWorkers` | SW profile documents |
| `syncedSocialWorkers` | Synced SW data from Caspio |
| `caspio_members_cache` | Denormalized Caspio member cache |

### ALFT workflow

| Collection | Purpose |
|---|---|
| `standalone_upload_submissions` | All ALFT (and other) intake docs; primary ALFT workflow record |
| `alft_assignments` | Kaiser member → SW assignments (created by ALFT manager John) |
| `alft_signature_requests` | Per-intake signature sessions with RN + MSW signer records, token hashes, outputs |

### SW visit & claims

| Collection | Purpose |
|---|---|
| `sw_visit_records` | Individual visit records |
| `sw-claims` | Monthly claims per SW |
| `sw_claim_events` | Audit events for claims |
| `sw_claim_override_requests` | Override requests submitted by SWs |
| `sw_assignment_overrides` | Admin-set override assignments |
| `sw_assignment_override_events` | Override event log |
| `sw_signoff_records` | RCFE/member sign-off records |
| `sw_member_monthly_visits` | Monthly visit rollup (locks) |
| `sw_member_last_submitted_visit` | Last submitted visit per member |
| `sw_visit_deletions` | Audit log of deleted visits |
| `sw_sync_requests` | Manual sync request queue |
| `sw_counters` | Counter documents |
| `rcfe_monthly_ccl_checks` | RCFE CCL check records |
| `rcfe_daily_followup_status` | Daily RCFE follow-up status |
| `rcfe_verification_email_send_log` | RCFE verification email logs |

### Notifications & activity

| Collection | Purpose |
|---|---|
| `staff_notifications` | In-app notifications for admin/staff |
| `notifications` | Generic notification store |
| `notification-logs` | Notification delivery logs |
| `member_activities` | Member activity timeline events |
| `staff-preferences` | Per-staff preference docs |
| `system_settings` | Global config (docs: `notifications`, `ils_member_access`, `kaiser_rcfe_weekly_confirm`, `review_notifications`, `app_access`) |
| `admin-settings` | Admin-specific settings (docs: `caspio-table-fields`, `caspio-members-sync`) |

### Notes & tasks

| Collection | Purpose |
|---|---|
| `client_notes` | Client/member notes |
| `staff` | Legacy staff notes collection (Functions) |
| `systemNotes` | System-level notes |
| `system_note_log` | System note audit log |
| `memberNotes` | Per-member notes (Functions) |
| `memberTasks` | Per-member tasks (Functions) |
| `noteReplies` | Replies to notes |
| `ils_member_comments` | ILS member comments |
| `ils_change_log` | ILS report change log |

### Auth & session

| Collection | Purpose |
|---|---|
| `loginLogs` | Login activity log |
| `activeSessions` | Active session tracking |
| `passwordResets` | Password reset tokens |
| `passwordResetTokens` | Secondary token store |
| `2fa-codes` | 2FA verification codes |
| `2fa-logs` | 2FA audit log |
| `user-fcm-tokens` | FCM push tokens per user |
| `user-stats` | User usage statistics |

### Other

| Collection | Purpose |
|---|---|
| `chat_conversations` + `messages` subcollection | Admin chat |
| `desktop_presence` | Electron desktop presence beacons |
| `eligibilityChecks` | Eligibility check records |
| `eligibilityVerifications` | Eligibility verification docs |
| `emailLogs` | Email send logs |
| `era_parser_cache` + `chunks` subcollection | Health Net ERA PDF parse cache |
| `room_board_agreement_requests` | Room & board agreement signature requests |
| `caspio_note_logs` / `caspio_notes` | Caspio note webhook logs |
| `caspio_api_usage_daily` | Caspio API usage tracking |
| `sync-status` / `sync-logs` | Drive/Caspio sync status |
| `application_mrn_change_events` | MRN change audit events |

---

## 6. Admin Portal Pages

All routes are under `/admin`. Accessible to users with `roles_admin` or `roles_super_admin`.

### ALFT

| Route | Purpose |
|---|---|
| `/admin/alft-tracker` | Operational ALFT intake tracker; manage RN assignment, signatures, Kaiser review |
| `/admin/alft-assignment` | ALFT manager assigns Kaiser members to social workers |
| `/admin/alft-documents` | ALFT documents hub |
| `/admin/alft-log` | Full audit log of all ALFT forms across all statuses |
| `/admin/alft-view/[id]` | Read-only ALFT form viewer (all 13 pages, printable) |
| `/admin/alft-sign/[token]` | Tokenized RN/MSW signature page |
| `/admin/alft-tracker/dummy-preview` | Dummy ALFT form for testing PDF output |

### Applications & members

| Route | Purpose |
|---|---|
| `/admin/applications` | Application list |
| `/admin/applications/[applicationId]` | Single application detail |
| `/admin/applications/create` | Create application flow |
| `/admin/kaiser-tracker` | Kaiser member lifecycle tracker |
| `/admin/authorization-tracker` | Member authorization tracking |
| `/admin/missing-documents` | Missing documents workflow |
| `/admin/standalone-uploads` | Non-ALFT standalone upload intake queue |
| `/admin/member-activity` | Member activity feed |
| `/admin/member-notes` | Member notes management |
| `/admin/eligibility-checks` | Eligibility check list |

### Social worker management

| Route | Purpose |
|---|---|
| `/admin/sw-roster` | Social worker roster |
| `/admin/social-worker-assignments` | SW assignment management |
| `/admin/sw-user-management` | SW user accounts |
| `/admin/sw-visit-tracking` | SW visit tracker |
| `/admin/sw-visit-verification` | SW visit verification admin |
| `/admin/sw-claims` | SW claims admin view |
| `/admin/sw-claims-management` | SW claims management |
| `/admin/sw-claims-tracking` | SW claims tracking |

### Caspio / data sync

| Route | Purpose |
|---|---|
| `/admin/caspio-field-mapping` | Map Caspio fields to app fields |
| `/admin/batch-sync` | Batch sync operations |
| `/admin/intelligent-matching` | Drive ↔ Caspio intelligent matching |
| `/admin/comprehensive-matching` | Comprehensive matching UI |
| `/admin/caspio-test` | Caspio integration testing |
| `/admin/kaiser-tier-backfill` | Backfill Kaiser tier data |

### Reporting & tools

| Route | Purpose |
|---|---|
| `/admin/dashboard` | Main admin dashboard |
| `/admin/statistics` | Statistics dashboard |
| `/admin/reports` | Reports hub |
| `/admin/reports/ils` | ILS-specific reports |
| `/admin/ils-report-editor` | ILS report editor |
| `/admin/era-parser` | Health Net ERA PDF parser |
| `/admin/managerial-overview` | Managerial overview |
| `/admin/progress-tracker` | Progress tracker |
| `/admin/tools` | Admin tools index |
| `/admin/tools/rcfe-data` | RCFE data tooling |
| `/admin/tools/ils-status-check` | ILS status check |
| `/admin/tools/sw-proximity` | SW geographic proximity |
| `/admin/california-map` | California member map |
| `/admin/rcfe-bulk-email` | Bulk RCFE email sender |

### System configuration

| Route | Purpose |
|---|---|
| `/admin/system-configuration` | Global system settings |
| `/admin/system-configuration/review-notifications` | ALFT review notification recipients |
| `/admin/notification-settings` | Notification preferences |
| `/admin/staff-management` | Staff management |
| `/admin/user-staff-management` | User + staff combined management |
| `/admin/registered-users` | All registered users |
| `/admin/super-admin-tools` | Super-admin only tooling |
| `/admin/login-activity` | Login/session activity log |
| `/admin/email-logs` | Email send logs |
| `/admin/activity-log` | General activity log |

---

## 7. Social Worker Portal Pages

All routes under `/sw-portal`. Accessible to authenticated social workers.

| Route | Purpose |
|---|---|
| `/sw-portal/home` | Task-driven home dashboard (visits, assignments, CCL checks) |
| `/sw-portal/queue` | Redirects to `/sw-portal/home` |
| `/sw-portal/roster` | Member roster for signed-in SW |
| `/sw-portal/alft-upload` | ALFT form for Kaiser members assigned via `alft_assignments` |
| `/sw-portal/alft-sign/[token]` | MSW (SW) signature link |
| `/sw-portal/ccl-checks` | RCFE/CCL check tool |
| `/sw-portal/visit-verification` | Visit verification flow |
| `/sw-portal/sign-off` | RCFE staff sign-off with geolocation |
| `/sw-portal/claims` | Claims overview |
| `/sw-portal/submit-claims` | Monthly claim submission |
| `/sw-portal/monthly-visits` | Monthly visit view |
| `/sw-portal/wrap-up` | Guided end-of-day wrap-up |
| `/sw-portal/history` | Past visit history |
| `/sw-portal/end-of-day` | End-of-day workflow |
| `/sw-portal/status-log` | SW activity status log |
| `/sw-portal/instructions` | Help / instructions |

---

## 8. API Routes

All routes under `/api`. See code files for full request/response shapes.

### ALFT (`/api/alft/`)

| Route | Method | Purpose |
|---|---|---|
| `/api/alft/submit` | POST | SW creates ALFT intake in `standalone_upload_submissions`; emails John |
| `/api/alft/edit` | POST | Collaborative field edits; checks `isKaiserAssignmentManager`, RN email, admin roles |
| `/api/alft/view` | POST | Authorized read of intake for viewers (admin, Kaiser mgr, RN, SW) |
| `/api/alft/signatures/request` | POST | Creates `alft_signature_requests`; notifies RN (Leslie) and SW |
| `/api/alft/signatures/lookup` | POST | Resolves signature request by token hash |
| `/api/alft/signatures/sign` | POST | Captures drawn signature + printed name + license number; generates PDF; advances workflow |
| `/api/alft/signatures/download` | GET | Downloads signature page or packet PDF |
| `/api/alft/workflow/final-review` | POST | Kaiser manager approves final form |
| `/api/alft/workflow/send-completed` | POST | Emails signed packet to `jocelyn@ilshealth.com` |
| `/api/alft/workflow/reject-to-sw` | POST | Returns form to SW for revision (admin, Kaiser mgr, or assigned RN) |

### Auth (`/api/auth/`)

| Route | Purpose |
|---|---|
| `/api/auth/admin-session` | Admin session cookie create/destroy |
| `/api/auth/sw-session` | SW session cookie + `socialWorkers` profile merge |
| `/api/auth/password-reset` | Password reset flow |
| `/api/auth/validate-reset-token` | Token validation |
| `/api/auth/check-user` | User existence check |

### Caspio & member cache

| Route | Method | Purpose |
|---|---|---|
| `/api/kaiser-members` | GET | List Kaiser members from `caspio_members_cache` |
| `/api/kaiser-members/update-status` | POST | Update Kaiser status in cache + Caspio |
| `/api/all-members` | GET | Read full `caspio_members_cache` |
| `/api/caspio/members-cache/sync` | POST | Full/incremental cache sync |
| `/api/caspio-note-webhook` | POST | Inbound Caspio notes webhook |
| `/api/admin/caspio/push-cs-summary` | POST | Push CS summary to Caspio |

### SW visits & claims

| Route | Method | Purpose |
|---|---|---|
| `/api/sw-visits` | GET / POST | Fetch or record SW visit data |
| `/api/sw-visits/rcfe-ccl-check` | GET / POST | CCL check records |
| `/api/sw-visits/sign-off` | POST | Submit visit sign-off |
| `/api/sw-visits/monthly-export` | POST | Monthly visit export |
| `/api/sw-claims/submit` | POST | Submit finalized claim |
| `/api/sw-claims/list` | GET | List claims for SW |

### Cron jobs

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/caspio-members-sync` | Daily | Full/incremental Caspio → Firestore cache sync |
| `/api/cron/ils-weekly-list` | Weekly | ILS weekly list email |
| `/api/cron/kaiser-rcfe-weekly-confirm` | Weekly | Kaiser RCFE confirmation |
| `/api/cron/reminders` | Periodic | General reminders |

All cron routes require `Authorization: Bearer {CRON_SECRET}` header.

### Admin operations

| Route | Purpose |
|---|---|
| `/api/admin/era/parse` | Health Net ERA PDF parsing |
| `/api/admin/staff/create` | Create Firebase user + admin roles |
| `/api/admin/sw-claims/*` | Claims admin operations |
| `/api/admin/sw-visits/*` | Visit admin operations |
| `/api/admin/parse-service-request-vision` | Gemini vision parsing of service request docs |

---

## 9. Firebase Cloud Functions

All functions exported from `functions/src/index.ts`. Deployed with `firebase deploy --only functions`.

### Caspio / Kaiser

| Function | Type | Purpose |
|---|---|---|
| `fetchKaiserMembersFromCaspio` | Callable | Fetch Kaiser members from Caspio REST |
| `updateKaiserMemberDates` | Callable | Update Kaiser ILS dates in Caspio |
| `syncCaspioMembersCacheIncremental` | Scheduled | Incremental cache sync |
| `syncCaspioMembersCacheFull` | Scheduled | Full cache rebuild |
| `monitorCaspioPriorityNotes` | Callable | Monitor Caspio for priority notes |
| `caspioWebhook` | HTTP | Caspio webhook receiver |
| `caspioCalAIMNotesWebhook` | HTTP | CalAIM notes webhook |

### Notifications & email

| Function | Purpose |
|---|---|
| `sendMorningNoteDigest` | Morning digest email to staff |
| `sendManualNotification` | On-demand notification dispatch |
| `sendResendNotification` | Resend API wrapper |
| `sendDocumentUploadNotifications` | Notify on document uploads |
| `sendCsSummaryNotifications` | CS summary completion notifications |
| `checkMissingForms` | Scheduled: flag applications with missing forms > 7 days |

### Auth / 2FA

| Function | Purpose |
|---|---|
| `send2FACode` | Send 2FA verification code |
| `verify2FACode` | Verify submitted code |
| `check2FAStatus` | Check if 2FA is enabled for user |

### Google Drive / matching

| Function | Purpose |
|---|---|
| `scanCalAIMDriveFolders` | Scan CalAIM Google Drive folders |
| `matchDriveFoldersWithCaspio` | Match Drive folders to Caspio members |
| `generateComprehensiveMatching` | Full AI-assisted matching |
| `applyConfirmedMatches` | Write confirmed matches |

### Notes & tasks

| Function | Purpose |
|---|---|
| `createMemberNote` | Create note in `memberNotes` |
| `getMemberNotes` | Fetch member notes |
| `createMemberTask` | Create task in `memberTasks` |
| `getDailyTasks` | Get daily task list |

### ERA

| Function | Purpose |
|---|---|
| `parseEraPdfFromStorage` | Parse Health Net ERA PDF from Storage |

---

## 10. Key Shared Components

### ALFT

| Component | Purpose |
|---|---|
| `components/alft/ExactAlftQuestionnaire.tsx` | 13-page ALFT form with all questions and `EXACT_ALFT_PAGES` data structure |
| `components/alft/AlftSignatureClient.tsx` | Signature capture UI (drawn signature, printed name, license number, date); saves signing profile to `users/{uid}.alftSigningProfile` |

### Email templates (React Email)

| Component | Purpose |
|---|---|
| `emails/AlftUploadEmail.tsx` | Notify John on new ALFT submission |
| `emails/AlftSignatureRequestEmail.tsx` | Notify RN/SW of signature request |
| `emails/SwClaimReminderEmail.tsx` | SW claim reminder |
| `emails/CsSummaryReminderEmail.tsx` | CS summary reminder |
| `emails/StaffAssignmentEmail.tsx` | Staff assignment notification |

### Notifications

| Component | Purpose |
|---|---|
| `StaffNotificationBell.tsx` | Real-time notification bell for admin |
| `NotificationManager.tsx` | Notification lifecycle management |
| `PushNotificationManager.tsx` | FCM push setup |
| `ReviewNotificationPoller.tsx` | Polls for ALFT/form review notifications |

### Forms & print

| Component | Purpose |
|---|---|
| `forms/PrintableFullPackage.tsx` | Full printable CalAIM application package |
| `agreements/RoomBoardAgreementSignatureClient.tsx` | Room & board agreement signature |

---

## 11. Key Library Utilities

| File | Purpose |
|---|---|
| `lib/caspio-api-utils.ts` | Caspio REST v3 token (OAuth2 Basic Auth) + generic query helper |
| `lib/caspio-server-auth.ts` | Server-side Caspio auth wrapper |
| `lib/admin-emails.ts` | `isHardcodedAdminEmail()` — bypass for known admin emails |
| `lib/kaiser-status-progression.ts` | Valid Kaiser status transitions |
| `lib/rcfe-utils.ts` | RCFE data helpers |
| `lib/sw-visit-status.ts` | SW visit status computation |
| `lib/notification-utils.ts` | Notification normalization |
| `lib/room-board-ils-dispatch.ts` | Room/board ILS dispatch |
| `lib/pdf/generatePdfFromHtmlSections.ts` | HTML → PDF assembly |
| `lib/api-paths.ts` | Central API path constants |
| `lib/google-maps-loader.ts` | Google Maps script loader |
| `lib/geo/geocode-cache.ts` | Geocode result cache |

---

## 12. External Integrations

### Caspio REST API v3

- **Auth:** OAuth2 Client Credentials — HTTP Basic Auth (`clientId:clientSecret` base64 encoded), `grant_type=client_credentials`, endpoint `{CASPIO_BASE_URL}/oauth/token`
- **Primary table:** `CalAIM_tbl_Members`
- **Used for:** member data source of truth, Kaiser status updates, CS summary pushes, priority note monitoring
- **Key files:** `src/lib/caspio-api-utils.ts`, `src/lib/caspio-server-auth.ts`, `functions/src/caspio-kaiser.ts`

### Resend (email)

- **API key:** `RESEND_API_KEY`
- **Used for:** ALFT workflow emails (John, Leslie, Jocelyn), ILS weekly list, RCFE verification, SW claim reminders
- **Key file:** `src/app/actions/send-email.ts`
- **Hardcoded recipients:**
  - John (ALFT manager): `john@carehomefinders.com`
  - Leslie (RN): `leslie@carehomefinders.com` (default RN)
  - Jocelyn (ILS staff): `jocelyn@ilshealth.com`

### Google Maps / Geocoding

- **Browser key:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- **Server key:** `GOOGLE_GEOCODING_API_KEY`
- **Used for:** RCFE mapping, SW proximity tool, visit geolocation sign-offs, reverse geocoding

### Google Generative AI (Gemini)

- **API key:** `GEMINI_API_KEY` / `GOOGLE_API_KEY`
- **Used for:** Service request document parsing (`/api/admin/parse-service-request-vision`), Drive matching scripts

### Health Net ERA Parser

- **Flow:** Upload ERA PDF → `functions/src/era-parser.ts` → cached in `era_parser_cache` (Firestore) with `chunks` subcollection
- **UI:** `/admin/era-parser`

### CCL / RCFE Data

- **Source:** California Community Care Licensing website (external link provided to SW)
- **Internal tracking:** `rcfe_monthly_ccl_checks`, `rcfe_daily_followup_status` collections
- **UI:** `/sw-portal/ccl-checks`

---

## 13. ALFT Workflow (End-to-End)

The ALFT (Assisted Living Facility Transition) tool manages Kaiser member transitions.

### Roles

| Role | Person | Access |
|---|---|---|
| ALFT Manager | John (`john@carehomefinders.com`) | Assigns members to SWs, initiates signature request |
| Social Worker | Various | Fills out ALFT form, signs as MSW |
| RN | Leslie (`leslie@carehomefinders.com`) | Reviews, edits, signs as RN, can kick back to SW |
| Kaiser Manager | Deydry (and others with `isKaiserAssignmentManager: true`) | Final review, approval, can edit and kick back to SW |
| ILS Staff | Jocelyn (`jocelyn@ilshealth.com`) | Receives completed signed packet via email |

### Workflow Steps

```
1. ASSIGNMENT
   John → /admin/alft-assignment
   • Pulls Kaiser members with Kaiser_Status = "RN Visit Needed" from Caspio
   • Selects a SW, writes to alft_assignments collection
   • Pre-populates member data (name, DOB, MRN, ILS location, contact)

2. SW FORM COMPLETION
   SW → /sw-portal/alft-upload
   • Loads assigned members from alft_assignments (filtered by assignedSwEmail)
   • Pre-fills member fields from assignment data
   • Fills out all 13 ALFT pages (exactPacketAnswers)
   • Draft auto-saved to localStorage
   • Types signature (printed name) and submits

3. INTAKE CREATED
   → POST /api/alft/submit
   • Creates standalone_upload_submissions doc
   • workflowStatus: 'awaiting_manager_review_pre_rn'
   • Emails John notification
   • Creates staff_notifications for alftReviewer recipients

4. COLLABORATIVE EDITING (any time)
   → POST /api/alft/edit
   • Permitted: SW uploader, assigned RN (by email/UID), Kaiser managers, admins
   • Saves to alftForm.exactPacketAnswers + top-level fields
   • Logs edit to alftEditHistory with editedByRole

5. SIGNATURE REQUEST
   John/Admin → /admin/alft-tracker → "Send to Leslie for final changes + signatures"
   → POST /api/alft/signatures/request
   • Creates alft_signature_requests with MSW + RN signer records
   • Token hashes stored for secure links
   • SW signs at: /sw-portal/alft-sign/{mswToken}
   • RN signs at: /admin/alft-sign/{rnToken}
   • workflowStatus → 'awaiting_sw_then_rn_signature'

6. MSW (SW) SIGNS FIRST
   → POST /api/alft/signatures/sign
   • SW draws signature, provides printed name, license number
   • workflowStatus → 'awaiting_rn_final_signature'

7. RN (LESLIE) SIGNS SECOND
   → POST /api/alft/signatures/sign
   • RN draws signature, provides printed name, license number
   • Both signed → generates signature page PDF + merged packet PDF
   • PDFs saved to Storage: alft-signatures/requests/{requestId}/
   • workflowStatus → 'awaiting_kaiser_manager_final_review'
   • alftManagerReview: { status: 'pending' }
   • Notifies Kaiser managers via staff_notifications

8. KAISER MANAGER FINAL REVIEW (Deydry)
   → /admin/alft-tracker → "Manager Final Review"
   → POST /api/alft/workflow/final-review
   • Requires signed packet PDFs present
   • alftManagerReview.status → 'approved'
   • workflowStatus → 'manager_review_complete_ready_to_send'

9. SEND TO JOCELYN
   → /admin/alft-tracker → "Email completed to Jocelyn"
   → POST /api/alft/workflow/send-completed
   • Builds 7-day signed URLs for PDFs from Storage
   • Sends sendAlftCompletedWorkflowEmail to jocelyn@ilshealth.com
   • workflowStatus → 'completed_sent_to_jocelyn'
   • status → 'completed'

--- ALTERNATE PATH: KICK BACK TO SW ---

   → /admin/alft-tracker → "Return to SW for revision"
   → POST /api/alft/workflow/reject-to-sw
   • Permitted: admin, isKaiserAssignmentManager, or assigned RN
   • Invalidates signature token hashes
   • workflowStatus → 'returned_to_sw_for_revision'
   • SW notification created; SW must revise and resubmit
```

### Signature PDF structure

Each signer block in the generated PDF contains:
- **Signature image** (drawn on canvas, PNG embedded)
- **Printed name** (typed, required)
- **License number** (typed, required — `RN-XXXXXX` or `MSW-XXXXXX`)
- **Date of submission** (auto-recorded timestamp at signing)

### Saved signing profile

After a successful signature, `users/{uid}.alftSigningProfile` is written with:
```json
{
  "printedName": "Leslie Smith",
  "licenseNumber": "RN-123456",
  "savedAt": "2026-04-07T..."
}
```
This auto-populates the form on all future signings.

---

## 14. Authentication Model

### Admin users

- Firebase Authentication (email/password)
- Session cookie via `POST /api/auth/admin-session` (7-day expiry)
- Role checked via:
  1. Firebase custom claims (`admin`, `superAdmin`)
  2. Hardcoded emails in `src/lib/admin-emails.ts`
  3. `roles_admin` Firestore collection (doc id = uid or email)
  4. `roles_super_admin` Firestore collection
- Kaiser managers: `users/{uid}.isKaiserAssignmentManager = true`

### Social Workers

- Firebase Authentication (email/password)
- Session cookie via `POST /api/auth/sw-session`
- Profile merged from `socialWorkers` collection on login
- Redirects to `/sw-portal/home` after login

### 2FA

- `send2FACode` / `verify2FACode` Firebase Functions
- Codes stored in `2fa-codes` collection with TTL

---

## 15. Recreating the App from Scratch

### Step 1 — Firebase project

1. Create a new Firebase project
2. Enable: Authentication, Firestore, Storage, Functions, Hosting, App Hosting
3. Copy Firebase config keys to environment variables (see §2)

### Step 2 — External accounts

1. **Caspio:** Create REST API app, get `CLIENT_ID`, `CLIENT_SECRET`, `BASE_URL`, table name
2. **Resend:** Create account, get `API_KEY`, verify sender domain
3. **Google Maps:** Enable Maps JavaScript API + Geocoding API, get keys
4. **SendGrid:** (Functions email fallback) Create account, get API key

### Step 3 — Clone and configure

```bash
git clone https://github.com/jcbloome/Calaim-Application-Tracker.git
cd Calaim-Application-Tracker
npm install
# Create .env.development with all vars from §2
```

### Step 4 — Firestore security rules

Deploy `firestore.rules` — contains access rules for all collections.

### Step 5 — Initial Firestore documents

Create these manually or via seed script:

```
system_settings/app_access          { enabled: true }
system_settings/notifications       { alftReviewer: true, ... }
system_settings/review_notifications { recipients: [...] }
admin-settings/caspio-table-fields  { ... }
```

### Step 6 — First admin user

1. Create a user in Firebase Authentication
2. Add doc to `roles_super_admin` with uid as doc id
3. OR add email to `src/lib/admin-emails.ts` hardcoded list

### Step 7 — Deploy Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### Step 8 — Deploy app

```bash
firebase deploy --only "apphosting,functions" --force
```

### Step 9 — Configure cron jobs

Set up external cron (Google Cloud Scheduler or similar) to call:
- `GET /api/cron/caspio-members-sync` — daily, with `Authorization: Bearer {CRON_SECRET}`
- `GET /api/cron/ils-weekly-list` — weekly
- `GET /api/cron/kaiser-rcfe-weekly-confirm` — weekly
- `GET /api/cron/reminders` — as needed

### Step 10 — Seed social workers

Import SW records into `socialWorkers` collection with fields:
`email`, `firstName`, `lastName`, `displayName`, `active: true`

---

*This document should be updated whenever a major feature is added, a collection is created, or an external integration changes.*
