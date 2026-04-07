# CalAIM Application Tracker — Changelog

> Chronological record of all significant changes, features, and refactors.  
> Format: `[Date] — Summary` followed by details and affected files.

---

## [April 2026] — ALFT Workflow: Permissions, Audit Log, Viewer, Saved Signing Profile

### ALFT edit permissions expanded
- **Leslie (RN)** can edit any ALFT form she is assigned to (matched by `alftRnEmail` or `alftRnUid`)
- **Deydry and any `isKaiserAssignmentManager` user** can always edit any ALFT form
- `editedByRole` field (`admin` / `kaiser_manager` / `rn` / `staff`) now stamped on every `alftEditHistory` entry
- **Files:** `src/app/api/alft/edit/route.ts`, `src/app/admin/alft-tracker/page.tsx`

### Kick-back (return to SW) permissions expanded
- Leslie (assigned RN) can now return forms to SW for revision in addition to admins and Kaiser managers
- New `canKickBackToSw(row)` UI callback checks uid and email against `alftRnUid` / `alftRnEmail`
- API mirrors the check: `isAdmin || isKaiserAssignmentManager || isAssignedRn`
- `rejectedByRole` stamped on `alftManagerReview` Firestore field
- **Files:** `src/app/admin/alft-tracker/page.tsx`, `src/app/api/alft/workflow/reject-to-sw/route.ts`

### ALFT Log — new page `/admin/alft-log`
- Full audit log across **all** ALFT form statuses (pending + completed)
- Stage filter pills with live counts: All / Received / Returned to SW / With RN / Signatures / Kaiser Review / Completed
- Full-text search across member name, MRN, social worker, RN
- Click any row → detail modal with:
  - Header summary (member, MRN, SW, RN, current stage, last updated, packet status)
  - Rejection callout (red box) when form was kicked back
  - Chronological activity timeline with icons and color coding
  - Edit history breakdown (who, when, which fields, how many questionnaire answers)
  - Document links (original files + RN revision uploads)
  - "Open in tracker" button with `?focus=` pre-set
- **Files:** `src/app/admin/alft-log/page.tsx` (new)

### ALFT Viewer — new page `/admin/alft-view/[id]`
- Read-only form viewer for admins, Kaiser managers, assigned RN, and the SW uploader
- Authorization enforced both in UI and in `/api/alft/view` (returns 403 to unauthorized users)
- Renders all 13 ALFT pages with radio/checkbox fill indicators, text in shaded boxes
- Signature & review status banner (MSW signed, RN signed, manager approval, packet status)
- Print-ready layout with auto page-breaks, member/MRN header on each page
- Toolbar with "Print / Save PDF" and original file links
- **Files:** `src/app/admin/alft-view/[id]/page.tsx` (new), `src/app/api/alft/view/route.ts` (new)

### "View ALFT" button added to tracker
- Every row in `/admin/alft-tracker` now has a "View ALFT" button (opens in new tab)
- Visible to all users — authorization is enforced at the viewer page
- **Files:** `src/app/admin/alft-tracker/page.tsx`

### Signature page: license number required
- Both MSW (SW) and RN must now provide their **license number** alongside printed name
- License number stored in `alft_signature_requests/{id}/signers.{role}.licenseNumber`
- Signature page **PDF redesigned**: two-column layout per signer block
  - Left: drawn signature image in bordered box
  - Right: three underlined fields — Printed name, License number, Date of submission (full timestamp)
- MSW block renders first (signs first), RN block second
- **Files:** `src/components/alft/AlftSignatureClient.tsx`, `src/app/api/alft/signatures/sign/route.ts`

### Saved signing profile
- After first successful signature, `users/{uid}.alftSigningProfile` is written with `printedName`, `licenseNumber`, `savedAt`
- On future signings, both fields are auto-populated from Firestore before the page finishes loading
- Green banner: "Your name and license number were remembered from your last signing"
- "Edit" link in banner clears it and unlocks fields for update; any edit clears the banner
- New values are re-saved on next successful sign
- **Files:** `src/components/alft/AlftSignatureClient.tsx`

---

## [March–April 2026] — SW Portal Simplification + ALFT SW Tool

### SW portal redesign
- New task-driven home page at `/sw-portal/home` replacing `/sw-portal/queue` as default
- All login redirects updated to `/sw-portal/home`
- Navigation simplified from 10+ links across 3 dropdowns → 4 flat items + "More ▾" dropdown
- New pages: `home/`, `wrap-up/`, `history/`
- Duplicate `<SWTopNav />` removed from `ccl-checks` and `end-of-day` pages
- **Files:** `src/app/sw-portal/*`, `src/components/sw/SWTopNav.tsx`, `src/app/sw-login/page.tsx`

### ALFT tool for social workers (`/sw-portal/alft-upload`)
- Rebuilt from dummy-preview pattern
- Member picker loads from `alft_assignments` (filtered by logged-in SW email)
- Pre-populates: member name, MRN, date of birth, ILS location, contact phone, SW name
- Draft auto-saved to `localStorage`
- Required printed name (SW signature) before submission
- Submits `exactPacketAnswers` to `/api/alft/submit` with `submissionMode: 'digital_form'`
- Updates `alft_assignments` status to `'submitted'`
- **Files:** `src/app/sw-portal/alft-upload/page.tsx`

### ALFT assignment page rebuilt (`/admin/alft-assignment`)
- Loads Kaiser members with `Kaiser_Status = "RN Visit Needed"` from Caspio
- SW dropdown per member (loaded from `socialWorkers` collection)
- Saves full assignment to `alft_assignments` collection
- Shows assignment status per member (Assigned / In Progress / Submitted / Completed)
- Pre-populates `birthDate` from Caspio data
- **Files:** `src/app/admin/alft-assignment/page.tsx`

### ALFT submit API updated
- `files` field made optional when `submissionMode === 'digital_form'`
- Allows SW digital submissions without requiring a PDF file upload
- **Files:** `src/app/api/alft/submit/route.ts`

### Jocelyn email improved
- `sendAlftCompletedWorkflowEmail` HTML template redesigned
- Clear header, member details table, document download links section, prominent "Action needed" box
- **Files:** `src/app/actions/send-email.ts`

---

## [February–March 2026] — Code Consolidation + API Cleanup

### Dead code removed
- Deleted 14 debug/test API routes: `caspio-debug`, `caspio-direct-test`, `caspio-member-sync-test`, `debug-application`, `debug-env`, `debug-jackie`, `fix-jackie-cs-summary`, `simple-test`, `test-caspio-pagination`, `test-functions`, `test-google-maps-simple`, `test-network`, `test-rcfe-pagination`, `test-single-page`
- Deleted 2 redundant API routes: `api/authorization/members` (→ `api/authorization/all-members`), `api/caspio/publish` (→ `api/admin/caspio/push-cs-summary`)
- Removed 9 disabled callable functions from `functions/src/index.ts`

### Caspio auth unified
- `getCaspioToken()` updated to use HTTP Basic Auth (`clientId:clientSecret` base64) for OAuth2
- Consistent with Caspio REST v3 spec
- **Files:** `src/lib/caspio-api-utils.ts`

### Firebase Functions modularized
- `functions/src/caspio-kaiser.ts` created for Kaiser-specific callable functions
- `functions/src/index.ts` re-exports from new module; retains only `checkMissingForms` and `simpleTest`
- **Files:** `functions/src/caspio-kaiser.ts`, `functions/src/index.ts`

### Task management context updated
- Switched from `fetchKaiserMembersFromCaspio` Firebase callable to direct `/api/kaiser-members` Next.js route
- **Files:** `src/modules/task-management/context.tsx`

---

## Hardcoded key emails / contacts

| Role | Email | Where used |
|---|---|---|
| ALFT Manager | `john@carehomefinders.com` | ALFT submit notification |
| RN (default) | `leslie@carehomefinders.com` | Signature request default RN |
| ILS Staff | `jocelyn@ilshealth.com` | Completed packet recipient |

---

## Firestore collections added (this session)

| Collection | Added for |
|---|---|
| `alft_assignments` | SW ALFT assignment management |

## Firestore fields added (this session)

| Collection | Field | Purpose |
|---|---|---|
| `standalone_upload_submissions` | `alftCollaboration.editableUids` | Tracks who can edit per-intake |
| `standalone_upload_submissions` | `alftEditHistory[].editedByRole` | Records role of each editor |
| `standalone_upload_submissions` | `alftManagerReview.rejectedByRole` | Records role of kick-back issuer |
| `alft_signature_requests` | `signers.{role}.licenseNumber` | License number per signer |
| `users` | `alftSigningProfile` | Saved printed name + license number |
| `users` | `isKaiserAssignmentManager` | Grants Kaiser manager ALFT permissions |
