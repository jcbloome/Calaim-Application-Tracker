# Daily Release Checklist

Use this checklist at the start and end of each coding session to reduce risk and keep releases stable.

## 1) Start-of-Day Safety (2-3 minutes)

- [ ] Confirm branch and cleanliness:
  - `git branch --show-current`
  - `git status`
- [ ] Pull latest changes:
  - `git pull`
- [ ] Start app and verify core pages load:
  - Admin login
  - Admin dashboard
  - One application detail page
  - RCFE Facility List tool
- [ ] If editing Firebase Functions, run functions build once before coding:
  - `cd functions && npm run build`

## 2) Safe Implementation Habits

- [ ] Work in small logical chunks (UI / API / parser), commit each chunk separately.
- [ ] For data-write features, test with 1-2 records first before bulk actions.
- [ ] Never commit secrets (`.env`, keys, credentials).
- [ ] Avoid destructive git commands unless absolutely intentional.

## 3) Caspio / Identity Guardrails (Critical)

- [ ] Before push/update, verify member identity fields:
  - MRN
  - Medi-Cal/CIN
  - `Client_ID2`
- [ ] Prefer update-only mode when correcting an existing member record.
- [ ] If identity mismatch appears, stop and verify before retrying push.
- [ ] For new-member pushes, ensure `Client_ID2` is newly created and unique.

## 4) RCFE Facility List + Excel Upload Safety

- [ ] Click `Refresh Data` before importing Excel changes.
- [ ] Upload Excel and confirm result toast:
  - `Matched X, updated Y`
  - Review unmatched rows before pushing.
- [ ] Visually spot-check key fields after import:
  - License number
  - NPI
  - Email (lowercase)
  - Address/City/State/Zip
- [ ] Use `Push All Changes to Caspio` only after spot-checking.
- [ ] Re-open or refresh tool and verify changes persisted.

## 5) Spreadsheet Intake / Skeleton App Safety

- [ ] Verify parsed member fields are correct (name, MRN, CIN, address, county).
- [ ] Confirm rows already in app/Caspio are not recreated.
- [ ] Confirm required fields are present before Caspio push.
- [ ] Ensure admin notes include referral/authorization details when applicable.

## 6) Pre-Push Quality Gate

- [ ] Run build:
  - `npm run build`
- [ ] If functions changed:
  - `cd functions && npm run build`
- [ ] Smoke-test impacted flows end-to-end (at least once).
- [ ] Review diff:
  - `git status`
  - `git diff`
- [ ] Commit with clear why-focused message.

## 7) End-of-Day Closeout

- [ ] Ensure clean working tree (`git status`).
- [ ] Update `SESSION_NOTES.md` with:
  - Completed today
  - Current state
  - Starting point for tomorrow
- [ ] Push final commit(s).
- [ ] Leave one explicit “first action tomorrow” note.

## 8) Emergency Recovery (if something goes wrong)

- [ ] Stop bulk operations immediately.
- [ ] Capture evidence:
  - Error message
  - Affected member/facility IDs
  - Last commit hash
- [ ] Revert with a targeted commit (avoid destructive resets).
- [ ] Re-test with a single record before re-running any bulk operation.

