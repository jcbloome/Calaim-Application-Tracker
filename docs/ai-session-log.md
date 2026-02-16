# AI session log

This is a lightweight, append-only log of notable work completed with the Cursor AI agent.

- **Purpose**: help future chats quickly understand what was changed, where, and why.
- **Format**: newest entries at the top.
- **Do not include secrets**: never paste credentials, API keys, or `.env` contents.

---

## 2026-02-16 — Daily Task Tracker follow-up UX + incremental sync

### Follow-up sync improvements (Caspio → Firestore)
- Added a per-staff sync cursor so “Sync from Caspio” can run **incrementally** after the initial import:
  - File: `src/app/api/staff/followups/sync/route.ts`
- Updated the Calendar “Sync from Caspio” button to use incremental mode:
  - File: `src/app/admin/tasks/page.tsx`

### Follow-up workflow UX
- Fixed Overdue tab behavior so overdue items don’t disappear due to the “This Month/Week/Day” filter:
  - File: `src/app/admin/tasks/page.tsx`
- Follow-up tasks now show a clear **Open/Closed** badge, and add a visible **Manage** button on the left (avoids hidden right-side Actions column).
- Follow-up details modal: added **reassign** support (updates `Follow_Up_Assignment`) and a **status toggle** (Open/Closed).
- Member Notes modal: added per-note **Open/Closed toggle** for quick closing/reopening follow-up notes.

## 2026-02-16 — Daily Task Tracker follow-up calendars + Caspio client notes (on-demand)

### Follow-up calendar + on-demand sync
- Added a Follow-up Calendar tab (month picker + day agenda) to the Daily Task Tracker:
  - File: `src/app/admin/tasks/page.tsx`
- Added on-demand sync/import controls (no automatic background refresh):
  - “Sync from Caspio” (month window)
  - “Initial import (all open)” (all open follow-ups with dates)
- Added server-side sync endpoint to pull Caspio follow-up notes into Firestore cache:
  - File: `src/app/api/staff/followups/sync/route.ts`

### Staff tasks API enhancements
- Added `only=follow_up` mode and optional `start`/`end` filtering to support calendar queries and reduce expensive aggregation when only follow-ups are needed:
  - File: `src/app/api/staff/tasks/route.ts`
- Improved follow-up assignment matching by checking UID + staff email/name candidates.

### Member Notes modal (Daily Task Tracker)
- Added “Show closed” toggle and “Sync all notes” (on-demand).
- Simplified “Add New Note” to only:
  - **General**
  - **Immediate** (used to trigger notifications)
- Switched the modal to use the **Caspio client notes system** (`connect_tbl_clientnotes`) via `/api/client-notes` to avoid the separate member-notes module’s table/base-url mismatch.
  - File: `src/app/admin/tasks/page.tsx`

### Caspio module auth/base URL fixes
- Fixed Caspio OAuth token URL construction in the Caspio module (token endpoint must not include `/rest/v2`):
  - File: `src/modules/caspio-integration/services/CaspioAuthService.ts`
- Normalized Caspio REST base URL in the Caspio module to ensure table calls use `.../rest/v2`:
  - File: `src/modules/caspio-integration/config/constants.ts`

### Notes
- This session intentionally avoided committing `.env`.

## 2026-02-16 — Electron web-card notifications + admin UX/perf improvements

### Desktop (Electron)
- Switched the desktop notification UI to reuse the existing web card UI (`WindowsNotification`) via a dedicated admin route:
  - Added `src/app/admin/desktop-notification-window/` (page + client listener).
- Extended IPC/preload to deliver card payloads and summary updates into the notification window:
  - Updated `desktop/main.ts`
  - Updated `desktop/notification-preload.ts`
  - Updated `src/types/desktop-notifications.d.ts`
- Updated navigation behavior to gateway mode:
  - “Open” actions use `shell.openExternal(...)` (opens default browser).
- Created GitHub Release `v3.0.8` and uploaded Windows installer assets.

### Web/admin performance
- Reduced public-site hydration work by mounting notification listeners **only in admin layout**:
  - Updated `src/app/layout.tsx`
  - Updated `src/app/admin/layout.tsx`

### Admin portal UX
- Activity Dashboard: removed “Recent Applications” section:
  - Updated `src/app/admin/page.tsx`
- Application detail Quick Actions:
  - Moved “Eligibility check & uploads” to the top
  - Updated Assigned Staff dropdown to filter by plan-designated staff (Kaiser / Health Net) and display staff names
  - Updated `src/app/admin/applications/[applicationId]/page.tsx`
- Reminders controls (application detail header):
  - Added on/off toggles + simplified cadence (Every 2 days / Weekly / None)
  - Persist cadence via `src/app/api/admin/update-notification-settings/route.ts`
  - Cron reminders now respect per-application `documentReminderFrequencyDays` in `src/app/api/cron/reminders/route.ts`

### Staff management
- Added toggles to mark users as plan-designated staff:
  - Updated `src/app/admin/staff-management/page.tsx`
  - Fields: `isKaiserStaff`, `isHealthNetStaff` on `users/{uid}`

### Operational notes
- `.env` was intentionally **not committed**.
- Deploy workflow failures can prevent the live site build timestamp from updating.

