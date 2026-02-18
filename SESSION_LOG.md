# Session Log

Use this file to quickly resume context in a new chat. Entries are chronological (newest first).

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

