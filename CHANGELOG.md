# Changelog

This file summarizes notable product/engineering changes to the Connect CalAIM Tracker App.

## 2026-02-16

### Daily Task Tracker (follow-ups UX improvements)
- Follow-up sync now supports **incremental updates** after initial import (per-staff cursor stored in Firestore).
- Overdue tab now **shows overdue tasks regardless of “This Month/Week/Day”** filter.
- Follow-up tasks: show **Open/Closed** status badge and add visible **Manage** button in the Task column.
- Member Notes modal: added per-note **Open/Closed toggle** to quickly close/reopen Caspio follow-up notes.

### Desktop app (Electron)
- Added a dedicated admin route to render **web-style notification cards** in Electron (`/admin/desktop-notification-window`).
- Bridged card + summary payloads into the notification window via IPC.
- Updated “Open” actions to launch the admin portal in the **default browser** (gateway behavior).
- Published GitHub Release **Desktop v3.0.8** (installer + blockmap + `latest.yml`).

### Admin portal
- Reduced public-site load work by moving real-time notification listeners to the admin shell only.
- Activity Dashboard: removed “Recent Applications” section.
- Application detail: moved **Eligibility check & uploads** to the top of Quick Actions.
- Application detail: added **Email reminders** + **Status updates** controls with simplified cadence (Every 2 days / Weekly / None).

### Staff management
- Added per-user plan flags to support assignment routing:
  - `users/{uid}.isKaiserStaff`
  - `users/{uid}.isHealthNetStaff`
- Updated Assigned Staff dropdown to filter by plan flags and show staff display names (with safe fallback behavior).

### Daily Task Tracker (follow-ups + Caspio notes)
- Added a **follow-up calendar** (month + day agenda) and a details modal with actions (reschedule / close / reopen / delete for Caspio client notes).
- Added **on-demand Caspio sync** controls:
  - “Sync from Caspio” (month-scoped)
  - “Initial import (all open)” (pull all open follow-ups with dates)
- Added a new API endpoint to support on-demand follow-up syncing: `/api/staff/followups/sync`.
- Member Notes modal:
  - Added “Show closed” toggle
  - Added “Sync all notes” (on-demand)
  - Simplified “Add New Note” to **General** vs **Immediate** (notification trigger)

### Notes / Known issues
- GitHub Actions deploy workflow (“Deploy CalAIM Application”) has been failing on recent pushes; the live site build timestamp won’t update until deploy succeeds.

