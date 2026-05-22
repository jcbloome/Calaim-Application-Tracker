# Session Log

Use this file to quickly resume context in a new chat. Entries are chronological (newest first).

## 2026-05-22

### Follow-up pass (queue/tracker/toggle decisions)
- **ALFT UI copy/order confirmation pass completed**:
  - Tracker copy now clarifies this page is Step 4 after Queue push.
  - Workflow action copy normalized (`Open Workflow Page`) and verification-step wording tightened for prefill review.
  - Stage-level dummy email labels now explicitly map to SW, RN, CS Manager final review, and completed packet send actions.
- **End-to-end ALFT technical validation pass completed**:
  - Production build validation succeeded (`npm run build`) with no compile-time failures.
  - Queue -> tracker -> workflow gating remains intact:
    - Queue requires verification + manual sync before push.
    - Tracker workflow start requires verification checkbox.
    - Stage-specific test email overrides remain correctly wired to SW, RN, CS Manager, and completed send endpoints.
- **Caspio Electron announcement policy decision**:
  - Keep **user override + global default fallback**.
  - Rationale: roles have different noise tolerance; global default keeps baseline control while user override supports operational flexibility.

### Shipped
- **ALFT workflow + tracker refinements** across Assignment Queue, Tracker, and member workflow pages:
  - Queue and tracker flow aligned to a step-based process (pre-fill -> push -> start workflow).
  - Tracker behavior cleaned up (active members focus, improved status/step presentation, workflow navigation fixes).
  - Member workflow page restored to step-by-step queue logic and updated ALFT workflow actions.
- **Dummy send email fields split by stage** for testing:
  - Separate stage-specific test recipient inputs for SW, RN, CS Manager, and completed packet send.
  - Wired each send action to its matching dummy email override.
- **ISP info improvements for SW invite workflow**:
  - SW email preview/send now includes ISP contact block (name, location, phone/email, last verified).
  - Added "pull from Caspio" refresh action and validation rules for required ISP data.
  - Caspio field mapping expanded to better resolve ISP variants from `CalAIM_tbl_Members`.
- **Electron Caspio announcement controls**:
  - Caspio note announcements are currently OFF in Electron by default.
  - Added per-user toggle in `Admin -> Notification Settings`.
  - Added Super Admin global default toggle in global notification settings.
  - Runtime now uses user override first, then global default fallback.

### Commits
- **`e2bb82ab`**: Add Caspio Electron announcement toggle with global default.
- **`8eae78f4`**: Split ALFT dummy send emails by workflow stage.
- **`2fe83bb7`**: Refine ALFT tracker workflow UX and testable email routing.
- **`a3498cfc`**: Wire final-manager emails and clarify Kaiser manager actions.
- **`0bd5a8f2`**: Add final manager alerts and action-item task labeling.

### Current state snapshot
- Branch: `main` (pushed to `origin/main` through commit `e2bb82ab`).
- ALFT flow is actively evolving but now has:
  - queue-first pre-fill/push behavior,
  - tracker-member workflow handoff,
  - stage-level testing controls for outbound email sends.
- Electron desktop notifications:
  - Interoffice notifications still show as before.
  - Caspio announcements in Electron are controlled by the new toggles and default to off.

### Next chat starting point
- Confirm any remaining ALFT UI copy/order tweaks requested by staff users.
- Run one full end-to-end ALFT test pass (Queue -> Pre-fill -> Push -> Start -> SW/RN/Manager sends) and capture any step mismatches.
- Decide whether Caspio Electron announcement toggle should remain user-overridable or be enforced globally.

## 2026-02-18

### Shipped
- **SW visit + claim tracking** (replaced mock visit/claim tracking with Firestore-backed system)
  - Visit submissions persist to `sw_visit_records/{visitId}` with `socialWorkerUid/email/name` and `submittedAtTs`.
  - `GET /api/sw-visits/records` queries by `submittedAtTs` (Timestamp) for reliable filtering.
  - On each visit submission, app **auto-upserts a deterministic daily claim draft** in `sw-claims/{claimId}`:
    - **$45 per visit**
    - **+$20 gas once per day** if any visit occurred that day
    - Visits are linked to claims via `claimId`, and claim fields are written back to visit docs.
  - Added `POST /api/sw-claims/submit` (server-side token verify) to submit a draft claim and update linked visit docs.
  - Admin marking a claim **paid** now propagates paid fields to linked visit records.
  - Updated SW claims UI to be **auto-generated daily claim viewer + submitter** (no manual visit entry).
  - Updated Admin SW Claims Tracking to load **real Firestore** claims (no mock data).

### Desktop release
- Published GitHub release **`v3.0.9`** with assets:
  - `Connect.CalAIM.Desktop.Setup.3.0.9.exe`
  - `Connect.CalAIM.Desktop.Setup.3.0.9.exe.blockmap`
  - `latest.yml`
- Release URL: `https://github.com/jcbloome/Calaim-Application-Tracker/releases/tag/v3.0.9`

### Commits
- **`692fa31`**: “Feat: SW visit + claim tracking” (pushed to `origin/main`)

### Operational notes / gotchas
- **Do not commit `.env`**. It remains modified locally.
- If `git push` / `gh` commands fail due to a localhost proxy, clear proxy env vars in the command session.

### How to resume tomorrow (quick checklist)
- **Pull latest**:
  - `git pull`
- **Install + run**:
  - `npm install`
  - `npm run dev` (local) or `npm run build` (CI-style validation)
- **Verify SW flow (happy path)**:
  - Submit a SW visit questionnaire → confirm it appears in **Admin → SW Visit Tracking**
  - Confirm a same-day daily claim draft exists in `sw-claims` (status `draft`) and totals match \(45×visits + 20\)
  - Submit the daily claim from **Admin → SW Claims** (SW view) → status becomes `submitted`
  - Mark it **paid** in **Admin → SW Claims Management** → linked visit records show paid fields
- **Verify Desktop installer label**:
  - On “My Notifications”, confirm “Download Desktop Installer (3.0.9)”
  - If it’s stale, hard refresh (Ctrl+F5) and re-check

