# CalAIM Tracker — Quick Reference Card

> **Emergency rebuild / onboarding cheat sheet.**  
> Keep this in Google Drive. Last updated: April 2026.

---

## 🔑 Critical Logins & Access

| Service | Who manages it | Where to find credentials |
|---|---|---|
| Firebase Console | Project owner | console.firebase.google.com — project ID: `studio-2881432245-f1d94` |
| GitHub repo | Project owner | github.com/jcbloome/Calaim-Application-Tracker |
| Caspio account | Project owner | caspio.com — REST app holds CLIENT_ID + CLIENT_SECRET |
| Resend (email) | Project owner | resend.com — API key in Firebase App Hosting secrets |
| Google Cloud | Project owner | console.cloud.google.com — Maps + Geocoding API keys |
| SendGrid (functions email) | Project owner | sendgrid.com — SENDGRID_API_KEY |

---

## 📧 Hardcoded Key Emails

| Role | Email | Purpose |
|---|---|---|
| ALFT Manager (John) | `john@carehomefinders.com` | Notified on every new ALFT submission |
| RN (Leslie) | `leslie@carehomefinders.com` | Default RN for signature requests |
| ILS Staff (Jocelyn) | `jocelyn@ilshealth.com` | Receives completed signed ALFT packet |

> To change these, search the codebase for the email string and update in `src/app/api/alft/`.

---

## ⚙️ Environment Variables (must be set)

### Firebase App Hosting secrets (`apphosting.yaml`)
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID          → studio-2881432245-f1d94
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET      → studio-2881432245-f1d94.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
CASPIO_BASE_URL
CASPIO_CLIENT_ID
CASPIO_CLIENT_SECRET
CASPIO_TABLE_NAME                        → CalAIM_tbl_Members
NEXT_PUBLIC_CASPIO_BASE_URL
RESEND_API_KEY
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
GOOGLE_GEOCODING_API_KEY
CRON_SECRET                              → used for cron job auth header
```

### Firebase Functions (set via `firebase functions:secrets:set`)
```
SENDGRID_API_KEY
CASPIO_BASE_URL
CASPIO_CLIENT_ID
CASPIO_CLIENT_SECRET
```

---

## 🚀 Deploy Commands

```bash
# Full deploy
firebase deploy --only "apphosting,functions" --force

# Functions only
firebase deploy --only functions

# Local dev
npm install && npm run dev
```

---

## 🗄️ Key Firestore Collections

| Collection | What's in it |
|---|---|
| `standalone_upload_submissions` | All ALFT intake forms + workflow state |
| `alft_assignments` | Kaiser member → SW assignments (John creates these) |
| `alft_signature_requests` | Signature sessions — tokens, signed PDFs, signer records |
| `caspio_members_cache` | Synced Kaiser/Caspio member data |
| `users` | User profiles — includes `isKaiserAssignmentManager` flag |
| `roles_admin` | Admin role grants (doc id = uid or email) |
| `roles_super_admin` | Super-admin role grants |
| `socialWorkers` | Social worker profiles |
| `sw_visit_records` | SW visit records |
| `sw-claims` | Monthly SW claims |
| `staff_notifications` | In-app notifications for admin/staff |
| `system_settings` | Global config (app access, notification recipients) |

---

## 👥 User Roles & How to Grant Them

| Role | How to grant |
|---|---|
| Admin | Add doc to `roles_admin` with uid as doc id |
| Super Admin | Add doc to `roles_super_admin` with uid as doc id |
| Kaiser Manager (Deydry, etc.) | Set `isKaiserAssignmentManager: true` on `users/{uid}` doc |
| Social Worker | Add to `socialWorkers` collection + Firebase Auth account |

---

## 🔄 ALFT Workflow — 60-Second Summary

```
1. John  → /admin/alft-assignment       Assign Kaiser member to SW
2. SW    → /sw-portal/alft-upload       Fill out 13-page ALFT form, submit
3. John  → /admin/alft-tracker          Review, then "Send to Leslie for signatures"
4. SW    → email link /sw-portal/alft-sign/{token}   MSW signs first
5. Leslie→ email link /admin/alft-sign/{token}        RN signs second
6. Deydry→ /admin/alft-tracker          "Manager Final Review" → Approve
7. Admin → /admin/alft-tracker          "Email completed to Jocelyn"
8. Jocelyn receives email with signed PDF → submits to Kaiser
```

**If revision needed:** "Return to SW for revision" button (Leslie, Deydry, or any admin)

---

## 🗓️ Cron Jobs (must be scheduled externally)

| Endpoint | Frequency | Purpose |
|---|---|---|
| `GET /api/cron/caspio-members-sync` | Daily | Sync Caspio → Firestore cache |
| `GET /api/cron/ils-weekly-list` | Weekly | ILS weekly list email |
| `GET /api/cron/kaiser-rcfe-weekly-confirm` | Weekly | Kaiser RCFE confirmations |
| `GET /api/cron/kaiser-staff-process-digest` | Daily | Staff inactivity reminders + Kaiser daily digest |
| `GET /api/cron/reminders` | As needed | General reminders |

All require header: `Authorization: Bearer {CRON_SECRET}`

---

## 🆘 If the App Goes Down

1. Check Firebase Console → App Hosting → look for build/deploy errors
2. Check Firebase Console → Functions → look for crash logs
3. Check that all App Hosting secrets are still set (`apphosting.yaml`)
4. Redeploy: `firebase deploy --only "apphosting,functions" --force`
5. If total rebuild needed → see `ARCHITECTURE.md` Section 15

---

## 📁 Key File Locations

| What | File |
|---|---|
| ALFT signature capture | `src/components/alft/AlftSignatureClient.tsx` |
| ALFT 13-page form | `src/components/alft/ExactAlftQuestionnaire.tsx` |
| ALFT submit API | `src/app/api/alft/submit/route.ts` |
| Email sending | `src/app/actions/send-email.ts` |
| Admin email list | `src/lib/admin-emails.ts` |
| Caspio auth | `src/lib/caspio-api-utils.ts` |
| Firebase Admin SDK | `src/firebase-admin.ts` |
| Firestore rules | `firestore.rules` |
| Full architecture | `ARCHITECTURE.md` |
| Full changelog | `CHANGELOG.md` |
