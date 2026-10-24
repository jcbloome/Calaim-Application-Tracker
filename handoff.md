# Handoff — CalAIM Application Tracker

**Date:** 2026-10-13 (previous handoff 2026-10-12)  
**Branch:** `main` (synced with `origin/main` at handoff)  
**Latest commits:** see “Changes 2026-10-13” below, then “Changes 2026-10-12”, “Changes 2026-10-11”, “Changes 2026-10-09”, “Changes 2026-10-08”, “Changes 2026-10-06”, “Changes 2026-10-02”  
**Dev server:** `npm run dev` → typically `http://localhost:3000`  
**Deeper reference:** `ARCHITECTURE.md`, `RUNBOOK.md`, `PROJECT_LOG.md`

---

## Changes 2026-10-23

- **TypeScript clean + build type checking on.** Fixed all 12 `tsc` errors and set `typescript.ignoreBuildErrors: false`, so `next build` now fails on type errors. ESLint is still skipped during builds (~1,270 existing lint errors to work through separately).
  - Pathway requirements get an explicit `PathwayRequirement` type (optional `editHref` / `links`) instead of relying on the first array element's inferred shape.
  - `applicationInactiveCalaimStatus` accepts any object (the all-optional param type was rejected as a weak type for `Application`).
  - Kaiser cover sheet template calls `field.disableReadOnly()` directly instead of an invalid `DropdownFieldLike` cast.
  - Files: `next.config.ts`, `src/app/admin/applications/[applicationId]/page.tsx`, `src/lib/inactive-calaim-status.ts`, `src/app/api/forms/kaiser-isp-cover-sheet/template/route.ts`.
  - Commit: _pending_.
- **Removed leftover test/debug pages and unused test APIs.** Deleted public pages `/test-billy`, `/test-reset`, `/test-simple`, `/test-working`, `/debug-login`, `/login-debugger`; admin pages `/admin/client-notes-demo` and the orphaned duplicate `/admin/daily-tasks-new`; unreferenced APIs `/api/test`, `/api/debug/list-applications`, `/api/caspio/test`, `/api/test-caspio`, `/api/test-google-maps`; empty `password-guesser`, `test-auth-fields`, `debug-caspio-fields` folders. `/swvisit` “View Your Assignments” now links to `/sw-portal/roster` (was the mock `test-billy` page with a hard-coded “60 members” badge). Kept: allowlisted test APIs used by admin tools, the admin Development & Testing hub, and legacy redirect pages (`california-map`, `sw-claims`, `sw-claims-tracking`).
  - Files: `src/app/swvisit/page.tsx`, `src/app/api/auth/simple-password-reset/route.ts`, `CLIENT_NOTES_SYSTEM.md`, deleted routes above.
  - Commit: _pending_.
- **Still open:** split the largest pages (`applications/create`, `ils-mif-consolidator`, `isp-workflow`, `alft-tracker`, `applications/[applicationId]`); deploy the CORS changes in `functions/` after `firebase login --reauth`.

## Changes 2026-10-22

- **Registered Users / AuthGuard 2FA sync.** User list APIs require an active Firestore 2FA session; AuthGuard now re-checks on route change and tab focus (so React state cannot stay “verified” after expiry). Verify writes both uid + email user docs; status reads either.
  - Files: `src/components/AuthGuard.tsx`, `src/app/api/auth/2fa-status/route.ts`, `src/app/api/auth/2fa-verify/route.ts`, `src/app/admin/registered-users/page.tsx`.
  - Commit: `86ac5464`.
- **Nav: RCFE Bulk Email under Tools → Health Net.** Moved from Super Admin submenu to Tools / Health Net (still super-admin only).
  - Files: `src/app/admin/layout.tsx`.
  - Commit: `34e01504`.
- **NotificationSettings: stop Next overlay on Firebase `internal [0]`.** Soft-log callable failures (CORS from localhost), prefer cached settings, still persist locally if cloud save fails. Added CORS on notification-settings Cloud Functions (deploy when CLI reauthed).
  - Files: `src/components/NotificationSettings.tsx`, `functions/src/notification-settings.ts`, `src/components/RealTimeNotifications.tsx`.
  - Commit: `34e01504`.
- **AuthGuard/2FA: fix localhost `internal [0]` (CORS).** 2FA status/send/verify/preferences now use same-origin Next APIs (`/api/auth/2fa-*`) so localhost is not blocked by Cloud Function callable CORS (HTTP status 0 → FirebaseError internal). Cloud Function 2FA callables also get explicit localhost CORS (needs `firebase login --reauth` + deploy when CLI is ready).
  - Files: `src/app/api/auth/2fa-status/route.ts`, `src/app/api/auth/2fa-send/route.ts`, `src/app/api/auth/2fa-verify/route.ts`, `src/app/api/auth/2fa-preferences/route.ts`, `src/lib/server-2fa.ts`, `src/lib/client-2fa.ts`, `src/lib/fetch-2fa-status.ts`, `src/components/AuthGuard.tsx`, `src/components/TwoFactorAuth.tsx`, `functions/src/two-factor-auth.ts`.
  - Commit: `34e01504`.
- **ISP Plan ID always = member MRN.** On import, Caspio prefill/refresh, intake load, and MRN edits, `p1_plan_id` is forced to the member MRN (MCP_CIN / selected member / intake). Fixes blank Plan ID after completed-PDF import.
  - Files: `src/lib/isp-alft-field-rules.ts`, `src/app/admin/tools/isp-workflow/page.tsx`.
  - Commit: `946dbb9b`.
- **ISP import: clear false Oxygen/Hospice when notes deny therapies.** If Section F says “No current therapies or specialty care…”, drop all `p8_services`, oxygen liters/type, and hospice from `p7_conditions`. Always drop bare liters “2”/“3” (and similar) when oxygen type is empty, and drop the Oxygen checkbox itself unless type or non-weak liters support it.
  - Files: `src/lib/alft/parse-alft-completed-pdf.ts`, `src/app/api/alft/parse-completed-pdf/route.ts`, `src/app/admin/tools/isp-workflow/page.tsx`.
  - Commit: `946dbb9b`.
- **Kaiser Referral Generator: Jan 2026 Chronic Conditions form.** Replaced built-in `public/Templates/Kaiser Referral Form.pdf` with Kaiser’s Jan 2026 Chronic Conditions Referral Form (16 pages). Generator field mapping updated for renamed AcroForm fields (`2.1`/`2.2`, `2.2 Facility Name`, `Referrer relationship`, ECM/respite comment names, etc.) with old-name fallbacks. Template upload/activate/revert remains available for future Kaiser revisions.
  - Files: `public/Templates/Kaiser Referral Form.pdf`, `public/Templates/Kaiser Referral Form Jan 2026.pdf`, `src/lib/kaiser-referral-template.ts`, `src/app/api/admin/kaiser-referral-template/route.ts`, `src/app/admin/kaiser-referral-generator/template-uploader-card.tsx`, `src/app/admin/kaiser-referral-generator/page.tsx`, `src/app/api/forms/kaiser-referral/template/route.ts`.
  - Commit: `b3538c1d`.
- **Kaiser Referral printable HTML: match Jan 2026 (16 pages).** On-screen packet still said “Updated October 2025 / Page X of 15” even after the PDF template upgrade. Footer updated to January 2026 / 16 pages; added Community or Home Transition 3.2 facility/admission/safety page so the interactive preview matches the new PDF page count.
  - Files: `src/components/forms/PrintableKaiserReferralForm.tsx`.
  - Commit: `8bace048`.
- **Kaiser Cover Sheet Downloads rename + last 10 list.** Renamed “ALFT Cover Downloads Page” to “Kaiser Cover Sheet Downloads” in nav, generator/package/printable links, download filenames, and related messages. Downloads page defaults to showing the last 10 downloads with a clear section heading and Show all matching control.
  - Files: `src/app/admin/tools/kaiser-isp-cover-downloads/page.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/tools/kaiser-isp-cover-sheet/page.tsx`, `src/app/forms/kaiser-isp-cover-sheet/printable/page.tsx`, `src/app/admin/tools/alft-cover-sheet-package/page.tsx`, `src/app/api/forms/kaiser-isp-cover-sheet/download-log/route.ts`, `src/app/api/forms/kaiser-isp-cover-sheet/download-log/redownload/route.ts`, `src/app/api/forms/kaiser-isp-cover-sheet/template/route.ts`.
  - Commit: `b3538c1d`.
- **ISP completed-PDF import: fix ADL/IADL radio overwrites.** Import was asking Gemini for every select/radio on every 2-page batch, then last-wins merge let later pages hallucinate ADL answers and overwrite correct Q26/Q27 marks. Schema is now page-windowed; merge keeps first fill unless the batch is authoritative for that field (ADL/IADL only on the early-middle PDF band). ADL scale matching also handles % parentheticals and rejects bare “assistance”.
  - Files: `src/lib/alft/parse-alft-completed-pdf.ts`, `src/app/api/alft/parse-completed-pdf/route.ts`, `src/app/admin/tools/isp-workflow/page.tsx`.
  - Commit: `b755b0ba`.
- **ISP completed-PDF import: stop Q30 oxygen/detail hallucinations.** Vision was copying printed “Nasal Cannula” / “Mask” labels into `p8_oxygen_type` even when Oxygen was unchecked. Post-parse refine now drops oxygen/wound/visit/catheter detail fields unless the parent checkbox is present; prompt forbids treating empty printed labels as answers.
  - Files: `src/lib/alft/parse-alft-completed-pdf.ts`, `src/app/api/alft/parse-completed-pdf/route.ts`, `src/app/admin/tools/isp-workflow/page.tsx`.
  - Commit: `b755b0ba`.
- **Kaiser cover sheet: keep KP tier dropdowns selectable.** Generator never prefills or locks KP-only fields (`Dropdown15`, `Dropdown25`). After fill/appearance rebuild they are reset to “Select from drop down”, forced non-read-only, and skipped by fuzzy dropdown matching. Preview copy notes Kaiser should open the downloaded PDF in Adobe Acrobat (browser viewers often cannot use combo boxes).
  - Files: `src/app/api/forms/kaiser-isp-cover-sheet/template/route.ts`, `src/lib/kaiser-isp-cover-sheet-template.ts`, `src/app/forms/kaiser-isp-cover-sheet/printable/page.tsx`.
  - Commit: `ec536a99`.
- **ISP Workflow Firestore write-rate hardening.** Client writes were hitting `resource-exhausted` (request/document write rate). Routing autosave now uses backoff retries, skips overlapping saves, pauses for 1 minute after a rate-limit error, and no longer reloads the intake on quiet autosave (that reload was amplifying write thrash).
  - Files: `src/lib/firestore-batch-throttle.ts`, `src/app/admin/tools/isp-workflow/page.tsx`.
  - Commit: `ec536a99`.

## Changes 2026-10-21

- **Single-auth Service Request parse: SNP ≠ MRN.** Kaiser Service Request forms often put plan type `SNP` in the MRN box; the real Kaiser MRN is Plan ID (e.g. `110005643409`). Parser now treats SNP/DSNP/HMO placeholders as non-MRNs and prefers Plan ID. Vision prompt updated the same way; Elk Grove city infers Sacramento County when county is blank.
  - Files: `src/lib/kaiser-region.ts`, `src/app/admin/applications/create/page.tsx`, `src/app/api/admin/parse-service-request-vision/route.ts`.
  - Commit: `2314d05f`.
- **Create Application: Sacramento not blocked as Northern decline.** Sacramento was incorrectly included in `NORTHERN_COUNTIES`, so Sacramento members on the declined list could not create a Kaiser skeleton. Sacramento is removed from the northern-decline county list (Connections serves it). Skeleton create and Create App eligibility now exempt Sacramento (and other `ILS_SERVED_COUNTIES`) even if an older decline mark remains.
  - Files: `src/lib/ils-mif-parse.ts`, `src/app/admin/applications/create/page.tsx`.
  - Commit: `2314d05f`.
- **Resend → RN for new signature.** ISP Workflow (and ALFT Detail Tracker manager actions) can resend to RN after she already signed. Staff confirm edits, enter a required note, and confirm; the API clears the prior RN electronic signature, resets workflow to awaiting RN, and emails a fresh signature link. The old “Resend again” button stayed disabled once RN signed — it now offers **Resend → RN (new signature)**.
  - Files: `src/app/admin/tools/isp-workflow/page.tsx`, `src/app/admin/alft-tracker/page.tsx`, `src/app/api/alft/signatures/request/route.ts`.
  - Commit: `2314d05f`.
- **ISP import Q28 false positives (Alzheimer’s / Hospice).** Completed-PDF vision parse was marking Alzheimer’s/Dementia and Hospice when the paper ISP only had Memory Impairment, Judgement Moderate, and Incontinence Both. Prompt now requires the primary checkbox for each Q28 row (no inferring Alzheimer’s from Memory, no Hospice bleed from nearby Incontinence). Post-sanitize drops Alzheimer’s without a dementia severity mark, drops Hospice when that Alzheimer’s false-positive pattern co-occurs with memory + incontinence and no palliative/pain, and adds parent Judgement/Alzheimer’s when severity was extracted.
  - Files: `src/app/api/alft/parse-completed-pdf/route.ts`, `src/lib/alft/parse-alft-completed-pdf.ts`.
  - Commit: `e5c3d6ae`.
- **ISP import: MSW admin override → Send to RN.** Importing a completed/signed ISP (completed PDF or “SW no longer with us”) auto-stamps MSW admin override so staff can **Approve → Send to RN** without asking the social worker to e-sign again. Signature request API also honors `p14_admin_override_msw` / existing SW signed timestamps.
  - Files: `src/app/admin/tools/isp-workflow/page.tsx`, `src/app/api/alft/signatures/request/route.ts`.
  - Commit: `e5c3d6ae`.
- **ALFT action-item dedupe.** Removed the redundant `ALFT Admin` / `ALFT RN` action pills. They pointed at the same queues as **ALFT Detail Tracker** (admin/RN review). Keep the Detail Tracker dropdown (and the compact ALFT plan badge).
  - Files: `src/app/admin/layout.tsx`.
  - Commit: `e2e764ba`.
- **Per-file delete on pathway cards.** Proof of Income (and other upload cards) X buttons now remove the clicked file. Deletes write the updated `forms` array to every linked admin + family application doc so portal merge cannot union the file back. Every upload card lists files with an individual remove control (including waivers).
  - Files: `src/app/admin/applications/[applicationId]/page.tsx`.
  - Commit: `37578f42`.
- **Application Log fix + auto-reminder entries.** Fixed duplicate React keys (`…-status-…`) that broke the member Application Log (same app under `applications/` and `users/…/applications/`). Embedded log loads only that application. Auto reminders now appear in the log: pending-document emails, proof-of-income age emails, and family status emails (including history already on the app). New sends also append `memberActionLog`.
  - Files: `src/components/admin/ActivityLog.tsx`, `src/lib/member-action-log.ts`, `src/app/api/cron/reminders/route.ts`, `src/app/api/cron/proof-income-age-reminders/route.ts`, `src/app/api/admin/send-family-status-reminder/route.ts`.
  - Commit: `37578f42`.
- **Proof of Income / document open hardening.** Staff click-to-view on pathway cards (including Proof of Income) no longer fails on a single-bucket miss. `POST /api/admin/documents/open-upload` normalizes paths, tries both Firebase Storage bucket names, recovers same-folder filename matches, and can use `downloadURL`. The application page falls back to `member-file-download` if open-upload still fails. If the object truly never landed in storage, the same re-upload guidance is shown.
  - Files: `src/app/api/admin/documents/open-upload/route.ts`, `src/app/admin/applications/[applicationId]/page.tsx`, `src/app/pathway/page.tsx`.
  - Commit: `37578f42`.

## Changes 2026-10-20

- **ALFT current physical location state uppercase.** Q3 Current Physical Location State (`p2_current_state`) is normalized like home/mail state (e.g. `ca` → `CA`) on prefill, blur, packet capitalization, and while typing 1–2 letter codes.
  - Files: `src/lib/alft-proper-case.ts`, `src/components/alft/SwStyleAlftEditor.tsx`, `src/app/sw-portal/alft-upload/page.tsx`, `src/lib/isp-visit-location.ts`, `src/app/admin/alft-tracker/dummy-preview/page.tsx`.
  - Commit: `354efcf7`.
- **Chase RCFE payee Excel columns.** Super Admin → Chase ACH Vendor Payees downloads an Excel file with only four columns in this order: Payee, Account, Routing, Checking. Every row is Checking. No TIN. Excel is built in the browser from the loaded list so Download no longer re-calls Caspio.
  - Files: `src/app/api/admin/chase-vendor-payees/route.ts`, `src/app/admin/super-admin-tools/chase-vendor-payees/page.tsx`.
  - Commit: `601b1d38`.

## Changes 2026-10-19

- **Chase RCFE payee Excel.** Super Admin → Chase ACH Vendor Payees downloads an Excel file with only four columns: RCFE_Name, Bank_Routing_Number, Bank_Account_Number, TIN. Routing and account numbers are written in full.
  - Files: `src/app/api/admin/chase-vendor-payees/route.ts`, `src/app/admin/super-admin-tools/chase-vendor-payees/page.tsx`.
  - Commit: `83c92499`.
- **Social Worker forgot-password email.** SW reset uses clearer Social Worker Portal email copy, better inactive/missing-portal errors, and falls back to Firebase Auth’s reset email when Resend fails. Success screen tells users to check spam for noreply@carehomefinders.com.
  - Files: `src/lib/password-reset.ts`, `src/lib/sw-auth-provision.ts`, `src/components/emails/PasswordResetEmail.tsx`, `src/app/reset-password/page.tsx`.
  - Commit: `2c8489d3`.
- **Chase vendor payee export.** Super Admin → Chase Vendor Payees compiles `CalAIM_tbl_New_RCFE_Registration` (RCFE name, routing number, account number, TIN, EIN or SSN, NPI, bank name) into an Excel file for a Chase vendor upload. The on-screen list masks routing and account numbers.
  - Files: `src/app/admin/super-admin-tools/chase-vendor-payees/page.tsx`, `src/app/api/admin/chase-vendor-payees/route.ts`, `src/app/admin/layout.tsx`, `src/app/admin/super-admin-tools/page.tsx`.
  - Commit: `133acf4e`.
- **One ISP confirm-and-download.** The ALFT editor keeps a single “confirm edits” checkbox and one Download latest edits button. The second green confirm-and-download box was removed. ISP Download Archive stays next to that download button.
  - Files: `src/app/admin/alft-tracker/page.tsx`.
  - Commit: `2327b1a3`.
- **Kaiser Referral Generator from status.** When Kaiser status is T2038 Requested or CalAIM status is Pending, the application shows a Kaiser Referral Generator link. The link pulls that member from Caspio by Client_ID2 after the member has been pushed.
  - Files: `src/app/admin/applications/[applicationId]/page.tsx`, `src/app/admin/kaiser-referral-generator/page.tsx`.
  - Commit: `7643db8a`.

- **Staff pathway print-and-upload waivers.** On the application pathway, Waivers & Authorizations can be printed for the member or authorized representative to sign, then the signed copy is uploaded back on that card.
  - Files: `src/app/admin/applications/[applicationId]/page.tsx`.
  - Commit: `eec8c21b`.

## Changes 2026-10-16

- **Member log Kaiser_Status lookup.** Pull latest Kaiser status reads `Kaiser_Status` from `CalAIM_tbl_Members`. The Kaiser MRN on that table is `MCP_CIN`, so the lookup matches Client ID, `MCP_CIN` (including leading zeros), Medi-Cal number, or name.
  - Files: `src/app/api/admin/member-log/route.ts`, `src/app/admin/member-log/page.tsx`.
  - Commit: `d835dd0d`.
- **Portal waiver options.** Users can fill out Waivers & Authorizations electronically, or download the form for the member or authorized representative to sign and upload that signed copy in the portal.
  - Files: `src/app/pathway/page.tsx`, `src/app/forms/waivers/page.tsx`.
  - Commit: `25e4ba3f`.
- **Pathway cards, upload-only new items log, and member log.** Requirement cards stack the title, revision badge, and review control so they no longer overlap. The new items log tracks uploads from the app and leaves out generated authorization requests and cover sheets. Operations → Member Log lists each application item for a member and can pull the latest Caspio Kaiser_Status.
  - Files: `src/app/admin/applications/[applicationId]/page.tsx`, `src/lib/review-queue.ts`, `src/app/admin/layout.tsx`, `src/app/admin/member-log/page.tsx`, `src/app/api/admin/member-log/route.ts`.
  - Commit: `25e4ba3f`.
- **SNF Facesheet only for SNF Transition.** Uploads and the pathway checklist do not ask for an SNF Facesheet unless the pathway is SNF Transition. Changing the pathway to SNF Transition under Edit adds that required form.
  - Files: `src/lib/snf-residency.ts`, `src/app/pathway/page.tsx`, `src/app/admin/applications/[applicationId]/page.tsx`.
  - Commit: `25e4ba3f`.
- **CS Summary Edit uses the shared application.** Staff Edit no longer opens a blank family copy when the completed CS Summary is on the admin application. Quick View, Files, and Edit show the same submitted member, documents, and form answers.
  - Files: `src/app/forms/cs-summary-form/components/CsSummaryFormCore.tsx`, `src/lib/merge-application-forms.ts`.
  - Commit: `25e4ba3f`.
- **Proof of income document date and Kaiser reminders.** Families must enter the date printed on the proof of income, not today's date. Staff track that one date. For Kaiser, when that date is within two months of one year old, or older than one year, the primary contact is emailed that a new proof of income is needed for the authorization renewed every six months. Auto reminders show that person and can be turned off. File view opens the document instead of starting a download. The staff waiver card no longer has Download/Print Waiver Form.
  - Files: `src/app/pathway/page.tsx`, `src/app/admin/applications/[applicationId]/page.tsx`, `src/lib/proof-income-age.ts`, `src/lib/merge-application-forms.ts`, `src/app/api/cron/proof-income-age-reminders/route.ts`, `.github/workflows/proof-income-age-reminders.yml`.
  - Commit: `25e4ba3f`.
- **Completed waivers appear in Files.** When Waivers & Authorizations is complete, the application pathway Files list includes that form as a PDF with the acknowledgments, income, and electronic signature. Download All includes it.
  - Files: `src/app/admin/applications/[applicationId]/page.tsx`, `src/app/api/admin/member-file-download/route.ts`, `src/app/api/admin/member-files-zip/route.ts`.
  - Commit: `25e4ba3f`.
- **Shared form status and full review log.** Staff see the same CS Summary, document, and waiver status, including checkmarks and the electronic signature, because application copies are merged. The new items log can show the full list or be filtered by staff and item, and each row says Reviewed or Not reviewed. Member name links to that member's application. Plan and pathway sit under the time as plain text. Reviewed asks for confirmation before the item leaves the list. Operations includes a New Items Log link.
  - Files: `src/lib/merge-application-forms.ts`, `src/app/admin/applications/[applicationId]/page.tsx`, `src/app/admin/forms/waivers/page.tsx`, `src/app/forms/waivers/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/layout.tsx`.
  - Commit: `bb9173e6`.
- **Review inbox staff filter, clear, and one daily email.** Clicking a staff action item such as Leidy shows only that staff member’s review rows. Reviewed on a row asks for confirmation, then removes it from action items and the review inbox. Assigned staff get one email at 12:30 PM Eastern listing documents received that day, by member and item name.
  - Files: `src/app/admin/page.tsx`, `src/app/api/admin/review-inbox/clear/route.ts`, `src/app/api/cron/pending-document-staff-reminders/route.ts`, `.github/workflows/pending-document-staff-reminders.yml`, `.github/workflows/kaiser-unassigned-docs-digest.yml`.
  - Commit: `bb9173e6`.
- **Unassigned Kaiser documents for Kaiser CS/docs managers.** New documents on Kaiser members with no assigned staff are emailed at 12:30 PM Eastern to staff with Manager notify: Kaiser CS/docs. The email lists each member and document. Those unreviewed documents, plus a member’s first forms from a new portal user, stay on that manager’s Kaiser CS/docs action item. The review log is full width, shows assigned staff, and can filter Assigned or Unassigned.
  - Files: `src/app/api/cron/kaiser-unassigned-docs-digest/route.ts`, `.github/workflows/kaiser-unassigned-docs-digest.yml`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`.
  - Commit: `bdeaed90`.

- **Staff Gmail copy of the primary-contact email.** When a family mailbox blocks the app email, Email Primary Contact can email that same message to the assigned staff and the signed-in staff member, with the family address, subject, and body. Staff send it from their own Gmail as a new message. This does not mark the family introduction as sent.
  - Files: `src/app/api/admin/send-introductory-email/route.ts`, `src/app/admin/applications/[applicationId]/email-primary-contact/page.tsx`, `src/lib/member-action-log.ts`.
  - Commit: `d953537d`.

- **Already in Caspio also matches Kaiser MRN.** ILS MIF, create-application, push, and confirm-push treat a Kaiser MRN (`Member_MRN`, `Kaiser_MRN`, `MRN`, `Medical_Record_Number`, and `MCP_CIN` when the MRN was stored there) as an existing-member hit even when the Caspio Medi-Cal number does not match. MRN is checked before Medi-Cal on push and confirm-push.
  - Files: `src/lib/ils-mif-parse.ts`, `src/app/admin/applications/create/page.tsx`, `src/app/api/admin/caspio/push-cs-summary/route.ts`, `src/app/api/admin/caspio/confirm-push/route.ts`.
  - Commit: `1fbc10d6`.

- **T2038 claims: Health Net ICD, plan filter, 30-day claim check, billing provider.** Health Net `diag_1` is Caspio `Diagnostic_ICD_Code_1`. Patient account (`pcn`) is `Client_ID2`. Batch list filters Health Net vs Kaiser. Last claim comes from `CalAIM_Claim_Submit_T2038` service dates; members with no claim or a last claim more than 30 days ago are flagged Claim due. Billing/facility defaults to Connections Care Home Consultants, 1763 East Sandalwood Drive, Palm Springs, CA 92262, taxonomy 251B00000X.
  - Files: `src/lib/t2038-claims.ts`, `src/app/api/admin/t2038-claims/members/route.ts`, `src/app/admin/tools/t2038-claims/page.tsx`.
  - Commit: `d54b1e6c`.

- **Inactive applications.** CalAIM statuses Closed, Denied, Member Died, Non-Active, and Not Interested (set on the application or synced from Caspio) move the member to an **Inactive** tab on All Applications. They stay searchable by name and stay out of Total, Complete, In Process, On Hold, and the Progress Tracker. The application page and member pathway show a large **INACTIVE** banner with the status.
  - Files: `src/lib/inactive-calaim-status.ts`, `src/app/admin/applications/page.tsx`, `src/app/admin/applications/[applicationId]/page.tsx`, `src/app/admin/progress-tracker/page.tsx`, `src/app/pathway/page.tsx`.
  - Commit: `d54b1e6c`.

- **T2038 claims: Health Net Claim.MD payer ID default `95567`.** Empty saved profiles fall back to this ID.
  - Files: `src/lib/t2038-claims.ts`.
  - Commit: `d7de2938`.

- **T2038 claims tool (Health Net + Kaiser).** Tools → Health Net → T2038 Claims (Claim.MD). Lists Caspio **Authorized** Health Net and Kaiser members and counts who are inside `Authorization_Start_Date_T2038` / `Authorization_End_Date_T2038`. Flags authorizations ending within the saved warning window (default 30 days). Downloads a tracker Excel and a Claim.MD professional CSV (procedure T2038, prior auth, one row per claim). Upload selected sends that CSV to `https://svc.claim.md/services/upload/` using server env `CLAIMMD_ACCOUNT_KEY` (not stored in Firestore or the client). Billing profile (NPI, tax ID, payer IDs, charge, diagnosis) is Firestore `admin-settings/t2038-claimmd`.
  - Files: `src/lib/t2038-claims.ts`, `src/app/admin/tools/t2038-claims/page.tsx`, `src/app/api/admin/t2038-claims/members/route.ts`, `src/app/api/admin/t2038-claims/settings/route.ts`, `src/app/api/admin/t2038-claims/upload/route.ts`, `src/app/admin/layout.tsx`, `.env.example`.
  - Commit: `d7de2938`.

## Changes 2026-10-15

- **New tool: ALW Waitlist (Sierra CCA).** Under Tools → Health Net. Lists all Caspio **Authorized** Health Net members with counts (authorized / excluded / Drive package). Builds filled DHCS ALW Waitlist Request PDFs (CCA: Sierra Hospice Care, Inc), previews one form when a member is selected, and downloads a **Google Drive ZIP** (filled PDFs folder + Excel summary + README) to upload/share with Sierra — no email send. Residence/address from `RCFE_*`. Upload roster Excel: only **Is the Member on the ALW Waitlist? = YES** rows are excluded. Caspio `On_ALW_Waitlist=Yes` also excluded. Exclusion list in Firestore `admin-settings/alw-waitlist-exclusions`. Legal authority: if Caspio `Authorized_Party_*` is present, form marks **Other** and fills name (relationship), phone, and email; otherwise **Applicant**, with Caspio `Best_Contact_*` written on the Other line labeled **Best contact** (for Sierra outreach to RCFE / member / best contact). “Legal representative notified?” left unchecked (Yes/No blank). No official-PDF template upload — generated layout only.
  - Files: `src/lib/alw-waitlist.ts`, `src/lib/alw-waitlist-form-pdf.ts`, `src/app/admin/tools/alw-waitlist/page.tsx`, `src/app/api/admin/alw-waitlist/members/route.ts`, `src/app/api/admin/alw-waitlist/download/route.ts`, `src/app/api/admin/alw-waitlist/exclusions/route.ts`, `src/app/api/admin/alw-waitlist/form-preview/route.ts`, `src/app/api/admin/alw-waitlist/forms-zip/route.ts`, `src/app/admin/layout.tsx`.
  - Commit: `4f9fe0c1` (legal-rep notified blank: `20c5de31`).

- **CC secondary / portal people on primary-contact emails.** Emails to the primary contact now auto-CC `secondaryContactEmail` and other non-primary `portalAccessPeople`. Covers intro email (preview CC field + send), document reminders, family status updates, automated missing-doc reminders, and form revision / redo emails when the recipient is the primary contact.
  - Files: `src/lib/portal-access.ts`, `src/app/actions/send-email.ts`, `src/app/api/admin/send-introductory-email/route.ts`, `src/app/api/admin/send-document-reminder/route.ts`, `src/app/api/admin/send-family-status-reminder/route.ts`, `src/ai/flows/manage-reminders.ts`, `src/app/admin/applications/[applicationId]/page.tsx`.
  - Commit: `4f9fe0c1`.

- **Email primary contact: remove portal people without a valid email.** Remove no longer requires `@` (so malformed list entries can be cleaned up). Primary contact also gets a Remove button; removing them clears matching `bestContactEmail` / secondary / linked fields so they do not reappear on reload. Add access still requires a normal email.
  - Files: `src/app/api/admin/applications/portal-access/route.ts`, `src/components/admin/PortalAccessManager.tsx`.
  - Commit: `4f9fe0c1`.

- **ILS MIF consolidator: indicate skeleton when not yet in Caspio.** Rows with `skeletonApplicationId` and no Caspio match show a sky “Skeleton on file” badge in Status (with “Not in Caspio yet”), the same badge under CalAIM Status “Not in Caspio”, and an **Open skeleton** link instead of Create App.
  - Files: `src/app/admin/tools/ils-mif-consolidator/page.tsx`.
  - Commit: `4f9fe0c1`.

- **ILS MIF consolidator: denied members stay under Northern not in Caspio only.** “Not in Caspio” no longer counts or lists denied members (they were inflating that card with “denied still listed”). Denied rows remain on **Northern not in Caspio** and **Declined list** with Denied service + date; Create Application still excludes them.
  - Files: `src/app/admin/tools/ils-mif-consolidator/page.tsx`.
  - Commit: `4f9fe0c1`.

- **ILS MIF: Not interested / no longer interested → Services Discontinued (RTF code 4).** Caspio “Not interested” (and “no longer interested”) was not mapped, so monthly RTF treated those members as still in outreach, and the consolidator kept showing Pending / T2038 update badges. Now: engagement code **4**, included on the monthly return list with a Services discontinued count, consolidator shows “Not interested · services discontinued” (no authorize/T2038 push badges). Refresh Caspio on the row after updating Caspio.
  - Files: `src/lib/ils-mif-rtf-cs.ts`, `src/lib/ils-mif-parse.ts`, `src/lib/kaiser-not-interested.ts`, `src/lib/kaiser-status-progression.ts`, `src/app/api/kaiser-members/route.ts`, `src/app/admin/tools/ils-mif-monthly-report/page.tsx`, `src/app/admin/tools/ils-mif-consolidator/page.tsx`.
  - Commit: `4f9fe0c1`.

- **Fix ILS MIF “Update Caspio” Failed to fetch.** Auth field discovery was calling Caspio `GET /tables/.../fields` (371 columns), which can take ~60s and get killed by App Hosting — the browser then shows “Failed to fetch”. Now probes the known T2038 columns with a fast `q.select` + `q.limit=1` (~100ms), and only falls back to full `/fields` if that fails. Also set `maxDuration=120` on the push routes and a clearer network/timeout toast.
  - Files: `src/lib/ils-mif-caspio-authorize-push.ts`, `src/app/api/admin/ils-mif/push-auth-fields/route.ts`, `src/app/api/admin/ils-mif/push-t2038-requested-to-received/route.ts`, `src/app/admin/tools/ils-mif-consolidator/page.tsx`.
  - Commit: `fae8ad9e`.

- **SNF Facesheet card when member is at a SNF.** Portal (user pathway) and staff application detail now show the SNF Facesheet upload when pathway is SNF Transition **or** CS Summary `currentLocation` is Skilled Nursing / SNF. Non-SNF members do not get the card. Shared helper `requiresSnfFacesheet` / `isMemberAtSnf` in `src/lib/snf-residency.ts`. Trackers, CS confirm, and intro-email missing-docs use the same rule.
  - Files: `src/lib/snf-residency.ts`, `src/app/pathway/page.tsx`, `src/app/admin/applications/[applicationId]/page.tsx`, `src/components/admin/ApplicationTrackerInline.tsx`, `src/app/admin/progress-tracker/page.tsx`, `src/app/admin/missing-documents/page.tsx`, `src/app/api/admin/confirm-cs-summary/route.ts`, `src/app/api/admin/send-introductory-email/route.ts`.
  - Commit: `4fbd65a8`.

- **Create Application: remove ILS Accept button.** On `/admin/applications/create`, staff can still Decline (deny services & notify ILS) from the single-auth PDF section and from each Kaiser ILS import row. The Accept / “notify ILS we started services” action is removed here because acceptance happens later when working through the pathway. API/types still support `accept` for historical decision logs.
  - Files: `src/app/admin/applications/create/page.tsx`.
  - Commit: `6a92e7b1`.

## Changes 2026-10-14

- **Caspio REST v2 → v3 clean-up.** Audit result: every live Caspio data call already used `/integrations/rest/v3/...`. The shared helpers (`getCaspioServerConfig`, `buildCaspioConfig`, `normalizeCaspioRestBaseUrl`, `getCaspioCredentialsFromEnv`) strip any `/rest/v2` from `CASPIO_BASE_URL`, and no code sends a v2 request. The fixes are for the few stragglers:
  - Table URLs missing the v3 path, which were hitting `https://<acct>.caspio.com/tables/...`:
    - `src/lib/caspio-api.ts`: splits the OAuth origin and the v3 REST base. Used by the AI Caspio sync flow.
    - `functions/src/authorization-tracker.ts`: member fetch now uses `buildCaspioConfig().restBaseUrl`.
    - `src/app/api/member-notes/route.ts`: staff user registration lookup.
    - `src/lib/caspio-single-publisher.ts`: four publish URLs.
  - v3 rejects `q.pageSize` outside 5–1000 with a 400 "IncorrectQueryParameter" error (verified live 2026-10-14). `q.limit` silently caps at 1000 rows. Four `q.pageSize=1` lookups now use `q.limit=1`:
    - `src/lib/caspio-client-notes.ts` and `src/app/api/member-notes/route.ts` (latest note author).
    - `src/app/api/cron/kaiser-rcfe-weekly-confirm/route.ts`.
    - `src/app/api/admin/caspio/sw-hold-backfill/route.ts` (field probe).
  - Docs: `.cursorrules`, `CASPIO_SETUP.md` and `CLIENT_NOTES_SYSTEM.md` now show `CASPIO_BASE_URL` as the account origin with no `/rest/v2`.
  - Reviewed against Caspio's v3 change list, no further code changes needed:
    - The app does not use the files, views, bridgeApplications, dataImportExportTasks, outgoing webhooks or directories endpoints, and never PUTs table design.
    - `GET /tables/{t}/fields` is used by `push-cs-summary`, `ils-mif-caspio-authorize-push` and `caspio-table-fields`, which read only `Name`. v3 returns `Name, Type, Unique, Editable, Description, DisplayOrder, Label, UniqueAllowNulls, IsFormula` (371 fields on `CalAIM_tbl_Members`). The 24 non-editable ones are autonumber, timestamp and formula fields, and none of them are written.
    - v3 errors look like `{Code, Message, Resource, RequestId}`. A bad `q.select` is a 400 with `SqlServerError` and "Invalid column name …", which the members-cache fallback still matches.
    - No List-type fields are written.
  - Commit: `d8f4eaee`.

- **Kaiser 270: only Authorized, Pending and H2022.** Step 2 of the Kaiser tab now shows just those three CalAIM statuses (`KAISER_CHECK_STATUSES`), all ticked by default: 433 + 49 + 81 = 563 on 2026-10-14. Other statuses are no longer offered. The file name lists the statuses included (e.g. `Kaiser 270 eligibility - Authorized + Pending + H2022 - date.edi`), and runs are logged with list `statuses`.
  - Files: `src/app/admin/tools/batch-eligibility-checker/kaiser-batch-eligibility.tsx`, `src/app/admin/tools/batch-eligibility-log/page.tsx`.
  - Commit: `a75fbef2`.

- **Batch Eligibility Checker: Kaiser tab builds an X12 270 for Smart Data Solutions.**
  - New `src/lib/x12-270.ts` (`build270`, `missingEdiSettings`, `edi270Problems`, `payerIdForMember`). It builds 005010X279A1 files with ISA/GS/ST…SE/GE/IEA, one HL 20 payer → HL 21 provider (NM1*1P, NPI) → HL 22 subscriber per member (TRN*1 = Client_ID2, NM1*IL MI = Kaiser MRN or Medi-Cal CIN, DMG, DTP*291 today, EQ*30).
  - Members are grouped by payer ID per Kaiser region (`resolveKaiserRegion` from county/city/MRN) and split into transactions of at most N members (default 99).
  - Envelope settings are saved in Firestore `batch_eligibility_templates/kaiser-270` via the new `GET/POST /api/admin/batch-eligibility/edi-settings`. The step 1 card collapses once complete. Fields: sender/receiver ID and qualifier, GS codes, payer name, payer IDs North/South, provider name, NPI (default 1508537325), originator ID, member ID source (MRN default), usage P/T, max per ST, one segment per line. **Smart Data Solutions sender/receiver IDs, Kaiser payer ID(s) and our organization name still need to be entered.**
  - Step 2 shows Kaiser members with status checkboxes (Authorized by default; 433 on 2026-10-14: 358 South, 75 North). Members without an ID, name or DOB are listed and left out. It also has Reload and "Pull latest from Caspio".
  - Step 3 previews the first 3 members and downloads `Kaiser 270 eligibility - Authorized - date.edi`, also saved to the log.
  - Step 4 decodes SDS 271s (same results card, plan `kaiser`).
  - Members API, Kaiser: `medicalId` = `MediCal_Number` (Kaiser cache stores the MRN in `MCP_CIN`), `mrn` = `memberMrn`/`MCP_CIN` without separators, plus a `region` field.
  - The results card now matches by TRN trace number = Client_ID2 first, then by member ID / MRN, then by last name + DOB. Plan names show in its text.
  - The log page has Health Net / Kaiser plan buttons. Re-check stays Health Net only.
  - Verified with 3 real authorized members: ISA is 106 characters, SE counts are correct, and North/South go to separate STs.
  - Files: `src/lib/x12-270.ts`, `src/lib/batch-eligibility.ts`, `src/app/api/admin/batch-eligibility/edi-settings/route.ts`, `src/app/api/admin/batch-eligibility/members/route.ts`, `src/app/admin/tools/batch-eligibility-checker/kaiser-batch-eligibility.tsx`, `src/app/admin/tools/batch-eligibility-checker/eligibility-results-card.tsx`, `src/app/admin/tools/batch-eligibility-checker/page.tsx`, `src/app/admin/tools/batch-eligibility-log/page.tsx`.
  - Commit: `12ebdb71`.

- **Batch Eligibility Log (new Tools page) — every batch file and 271 decode is saved.**
  - Downloading a batch CSV on the checker now also saves it as a "batch" run. The summary holds member count, list, statuses included, members left out, and the cache sync time.
  - Uploading 271 files now also saves them as a "decode" run. The summary holds responses, active / inactive / rejected / unclear, lost / gained / unmatched and need review.
  - Files go to Storage at `batch-eligibility/{plan}/{runId}/{n}-{name}`; run records go to Firestore `batch_eligibility_runs`.
  - New page `/admin/tools/batch-eligibility-log`, linked from the checker header ("Batch & decode log") and the Tools menu. It lists runs newest first with type filters, re-downloads any saved file, and "Open results" re-decodes the saved 271 files into the same results view, matched against current Caspio status.
  - API: `GET/POST /api/admin/batch-eligibility/runs`; `GET /api/admin/batch-eligibility/runs/[runId]` (the run, or `?file=n` for the file contents). Admin auth on all of them.
  - Checker step 2 ("What goes in each column") is collapsed by default. The header shows a one-line summary (date format and the fixed values, e.g. payerid 95567, prov_npi 1508537325, pat_rel 18), and clicking the header expands it. It stays open while there are unsaved mapping changes or a required column is empty.
  - The second list is now **Inactive**: only CalAIM status Non_Active / Non-Active / Inactive (`isInactiveStatus`; 186 members on 2026-10-14). It replaces the earlier "Not authorized" (every non-Authorized status). The internal key is still `not-authorized`, so log entries stay consistent, and the log shows it as "Inactive".
  - **Re-check loop:**
    - The decoded results table has checkboxes plus quick selects: "Needs review", "Unclear", "Rejected / not found", and clear.
    - "Make re-check batch from N selected" creates a third **Re-check** list in step 3, stored in sessionStorage under `RECHECK_STORAGE_KEY`. It's available from the checker and from "Open results" on the log page, which redirects to the checker.
    - Responses not matched to a Health Net member can't be included; the card shows how many.
    - The Re-check list shows each member's CIN, DOB, name and status, with missing values in red, and has a "Clear re-check list" button.
    - New step 3 button **Pull latest from Caspio** runs the existing `/api/caspio/members-cache/sync` in `incremental` mode, which fetches records modified since the last sync, then reloads members, so Caspio fixes are picked up before downloading the re-check CSV.
    - Re-check batch runs are logged with list `recheck`.
  - `EligibilityResultsCard` also takes `onRecheck(clientIds)`. It now takes `plan`, `getIdToken` (saves uploads to the log), `preloaded` (saved files, no upload button) and `title`.
  - Files: `src/lib/batch-eligibility.ts`, `src/app/api/admin/batch-eligibility/runs/route.ts`, `src/app/api/admin/batch-eligibility/runs/[runId]/route.ts`, `src/app/admin/tools/batch-eligibility-log/page.tsx`, `src/app/admin/tools/batch-eligibility-checker/eligibility-results-card.tsx`, `src/app/admin/tools/batch-eligibility-checker/page.tsx`, `src/app/admin/layout.tsx`.
  - Commit: `12ebdb71`.

- **Batch Eligibility Checker: step 5 decodes Claim.MD 271 results.** On the Health Net tab you can upload one or more 271 eligibility response files. They're decoded in the browser by the new `src/lib/x12-271.ts`, which reads the delimiters from each ISA header, handles several interchanges per file, and walks the subscriber/dependent HL loops: NM1*IL, DMG, DTP, REF, AAA and EB with its DTP/MSG/NM1. Each response is classed as Active (EB01 1–5), Inactive (EB01 6–8), Rejected / not found (AAA, with plain-English reject reasons, e.g. 75 = subscriber not found), or Unclear. Responses are matched to Health Net members by Medi-Cal ID, falling back to last name + DOB. "Needs review" flags members who are Authorized in Caspio but not active, and members not authorized in Caspio who are now active. The results card has filters, search, expandable benefit lines and raw segments, and a CSV download of the filtered results. Nothing is saved server-side. Tested with a synthetic Health Net 271 (active / inactive / not found).
  - Files: `src/lib/x12-271.ts`, `src/app/admin/tools/batch-eligibility-checker/eligibility-results-card.tsx`, `src/app/admin/tools/batch-eligibility-checker/page.tsx`.
  - Commit: `a08c8a9c`.

- **Member pathway: Proof of Income upload no longer asks for a month.** The document is either an annual Social Security award letter or 3 months of recent bank statements, so the "Proof of Income month" dialog (month and year pickers) was removed. Files now upload immediately like every other requirement and are titled plain "Proof of Income". Older uploads that were saved with a month still show it on the admin page and applications table.
  - Files: `src/app/pathway/page.tsx`.
  - Commit: `51968fce`.

- **New Tools page: Batch Eligibility Checker (Health Net; Kaiser tab is "coming soon").** `/admin/tools/batch-eligibility-checker` (Tools menu, under Health Net) builds a Claim.MD Batch Eligibility (CSV) file. Steps: (1) upload Claim.MD's example CSV/Excel. The header row gives the columns and the second row gives example values. It's parsed in the browser with `xlsx` and saved per plan in Firestore `batch_eligibility_templates/{plan}`. (2) Column mapping, auto-guessed and editable: each column is filled from a member field (name, DOB, sex, Medi-Cal CIN, MRN, Client_ID2, status, auth dates, county), a fixed value (defaults to the example value, for payer ID, NPI, tax ID, relationship, service type), today's date (DOS columns), or left blank. A date format is detected from the example. (3) Health Net members come from `caspio_members_cache` (`CalAIM_MCO == 'Health Net'`, excluding `deletedFromCaspio`), with CalAIM status checkboxes and counts. All statuses are included by default except died/deceased. Members missing CIN, DOB, or name are left out unless that box is unticked. (4) A preview of the first 10 rows, and a download of `Health Net batch eligibility YYYY-MM-DD.csv`. Claim.MD returns the results as 271 responses, so no results import yet.
  - Two Health Net lists in step 3, each downloaded as its own CSV (`Health Net batch eligibility - Authorized|Not authorized - date.csv`). **Authorized** is Caspio status exactly "Authorized" (1,159 on 2026-10-14), to find members who lost eligibility. **Not authorized** is every other status, to find members who are now eligible. Its status checkboxes default to everything except Member Died (925 of 1,040). "Authorized on hold" (15) falls in the Not authorized list.
  - Step 1 also accepts Claim.MD's "Supported Column Definitions" sheet: `parseTemplateSheet` in `src/lib/batch-eligibility.ts` detects its "Field Name" column and uses those rows as the CSV columns. Each field's description, Required flag, data type and allowed values are stored in `columnInfo` and shown in the mapping table, and the download is blocked while any required column is blank. Saved Health Net format (from `C:\ConnectionsILOS\Claim MD Batch Eligibility Rules\Supported Column Definitions.xlsx`): `pat_name_l, pat_name_f, pat_dob, payerid, ins_number, prov_npi, pat_rel, ins_name_l, ins_name_f, ins_dob`. Dates are YYYYMMDD, `pat_rel` is fixed at 18 (Self) and `ins_number` is the Medi-Cal CIN. Health Net fixed values (`PLAN_FIXED_VALUES` in `src/lib/batch-eligibility.ts`, applied on every format upload and saved to the current format): `payerid` 95567, `prov_npi` 1508537325, `pat_rel` 18 (Self, the member is the policyholder).
  - Files: `src/lib/batch-eligibility.ts`, `src/app/api/admin/batch-eligibility/template/route.ts`, `src/app/api/admin/batch-eligibility/members/route.ts`, `src/app/admin/tools/batch-eligibility-checker/page.tsx`, `src/app/admin/layout.tsx`.
  - Commit: `15b01c83`.

- **Application pathway: steps 5 and 6 blocked while Kaiser status is "T2038 Requested".** "5. Email ILS: service started" and "6. Email claims department" are disabled (with an explanation under each) for Kaiser members whose Kaiser status is T2038 Requested, since service can't start before the T2038 authorization. New optional `disabledReason` prop on `IlsServiceStartedEmailDialog` and `ClaimsDepartmentEmailDialog`; the page computes `serviceStartEmailsBlockedReason`. Other statuses unchanged.
  - Files: `src/app/admin/applications/[applicationId]/components/IlsEmailDialogs.tsx`, `src/app/admin/applications/[applicationId]/page.tsx`.
  - Commit: `15b01c83`.

- **MRN without hyphens.** New `stripMrnSeparators` in `src/lib/kaiser-region.ts` (removes hyphens/dashes/spaces). CS Summary Step 1 MRN + confirm MRN inputs strip them as typed (help text: "No hyphens needed"); admin application pathway header and member `/pathway` display MRN without them; Caspio push (`push-cs-summary` `canonicalizeApplicationData`) strips them from all MRN keys before mapping/validation. Data cleanup 2026-10-14: scanned all 283 `applications` (collection group); only Frances Fike (`users/uYqrXY16OtUClZDxIqS46k1FaS62/applications/ji6HrhxGkKnDwjqhL3bF`) had a hyphen — `memberMrn` and `confirmMemberMrn` updated from `00-0026942029` to `000026942029` (not yet pushed to Caspio).
  - Files: `src/lib/kaiser-region.ts`, `src/app/forms/cs-summary-form/components/Step1.tsx`, `src/app/admin/applications/[applicationId]/page.tsx`, `src/app/pathway/page.tsx`, `src/app/api/admin/caspio/push-cs-summary/route.ts`.
  - Commit: `9840821e`.

- **Kaiser ALFT cover sheet: new 07/2026 template + dropdowns stay live for ILS.** `public/Templates/Kaiser Cover Sheet.pdf` replaced with Kaiser's `ALF Transitions Cover Page_v.072026.pdf`. Pages 2 and 5 are unchanged; pages 3 and 6 renamed fields, so the generator now fills the new names and keeps the old ones as fallbacks: auth R&B checklist `Check Box14` (was `Check Box12`), reauth R&B checklist `Check Box27` (was `Check Box5`), reauth R&B amount `Text22` (was `Text3`), reauth ILS preliminary tier `Dropdown35` with "Tier N" options (was `Dropdown7` "Tier Level N"). KP-completed fields (`Dropdown15`, `Dropdown25`, tier-expense/auto-calc text) stay blank. New "Admission Agreement" checklist boxes (`Check Box13` auth, `Check Box26` reauth) are left unchecked for staff.
  - Fixed: reauth "change in condition" (`Dropdown16`) was never actually selected for "No" (option text has "reauthorize **member** at current tier level"); the two-line overlay made it look filled but the dropdown value stayed "Select from drop down". Now selected directly; overlay text matches the option.
  - Consistent 9pt text: ~10 template fields (e.g. `Dropdown6/17/18/21/34/35`, `Assessment Date`) have no DA and some (e.g. `Dropdown9` 12pt, `County` 10pt) set size on the widget, so answers rendered oversized. Generator now sets `/Helv 9 Tf 0 g` on field and widget DA for every non-checkbox field except the long-option dropdowns (`Dropdown5`, `Dropdown19`, `Dropdown16`), which keep auto size so Acrobat can shrink a long option if ILS re-selects it; their initial appearance is always custom-drawn at 9pt (two lines for long answers, one line otherwise). Checked by rendering pages 2 and 5.
  - Verified generated auth + reauth PDFs: all 19 dropdowns remain real, editable dropdowns with full option lists, none read-only, not flattened.
  - Files: `src/app/api/forms/kaiser-isp-cover-sheet/template/route.ts`, `public/Templates/Kaiser Cover Sheet.pdf`.
  - Commit: `9840821e`.
- **Kaiser cover sheet generator: template PDF uploader.** New "Cover sheet template" card at the bottom of `/admin/tools/kaiser-isp-cover-sheet`. Upload a fillable PDF → saved to Storage `templates/kaiser-isp-cover-sheet/…`, logged in Firestore `kaiser_isp_cover_sheet_templates` with a field summary (pages, fields, dropdowns + options, read-only, and any generator-filled fields missing). Not used until a Super Admin clicks "Use this template" (writes `admin-settings/kaiser-isp-cover-sheet-template.activeStoragePath`); "Switch back to built-in template" clears it. The generator loads the active uploaded template first, falling back to env path/URL, then `public/Templates`.
  - Fixed first upload failing with Firestore "Cannot use undefined" (`summary.fields[].options` was `undefined` on non-dropdown fields; now omitted).
  - To inspect an uploaded form: read `kaiser_isp_cover_sheet_templates` (newest `uploadedAtIso`) for `summary`, or download `storagePath` with firebase-admin.
  - Files: `src/lib/kaiser-isp-cover-sheet-template.ts` (field map + `summarizeCoverSheetTemplate`), `src/app/api/admin/kaiser-isp-cover-sheet-template/route.ts` (GET list / POST upload / POST JSON activate|revert), `src/app/admin/tools/kaiser-isp-cover-sheet/template-uploader-card.tsx`, `page.tsx`, generator `template/route.ts`.
  - Commit: `9840821e`.

## Changes 2026-10-13

- **Income estimate split into three pages (Kaiser / Health Net / Consolidated).** The single page was confusing, so:
  - `/admin/super-admin-tools/kaiser-income-estimate` is the original Kaiser-only page (restored from `ebe0d5ff`), with Health Net forced to $0 (`healthNetYtdPaid: 0`).
  - New `/admin/super-admin-tools/health-net-income`: HN inputs (paid so far, through month, lag, decline, end month, prior-year gross), run rate, 2026 total on a cash basis and an accrual basis, remaining months table, and comparison with last year.
  - New `/admin/super-admin-tools/consolidated-income`: the combined page from `e102ebbe` (summary table: combined vs each payer, 2026 tax year, cash balance, taxes). The view switcher was removed; everything below the summary is combined.
  - Health Net page pulls currently authorized Health Net members from Caspio (live, cache fallback) via `/api/admin/kaiser-income-estimate?plan=healthnet` (route now takes `plan=kaiser|healthnet`; Kaiser default unchanged). Count uses new `isCurrentlyAuthorizedHealthNetMember` (status Authorized + T2038 window covers today) and also shows the status-only Authorized count; shows run rate per authorized member. Cache check 2026-10-13: 2,199 HN records, 1,161 status Authorized, 652 with a current T2038 window.
  - Consolidated page "Fixed staff payroll" card spans the full width with a min 10rem name column (names were cut off in the half-width card).
  - Shared link bar `src/app/admin/super-admin-tools/income-estimate-nav.tsx` on all three; admin Finance menu entries added in `src/app/admin/layout.tsx`. Inputs are per-page state (not shared between pages).
  - Commit: `13909243`.

- **Income estimate: Health Net YTD + combined annual for taxes / cash balance.** Super-admin Monthly Income Estimate now has a Health Net section (defaults: HN YTD $4.48M, Kaiser cash YTD $734k, 1.5 mo payment lag; prior-year HN $1.8M + Kaiser $186k → $1.5M taxable). Annualizes YTD cash as `YTD ÷ (through month − lag)` for the starting monthly rate, then applies **−20%/mo decline through December program end** (then $0). Combined HN + Kaiser census revenue feeds operating profit, cash balance, CA entity tax, and owner taxes.
  - Files: `src/lib/kaiser-income-estimate.ts`, `src/app/admin/super-admin-tools/kaiser-income-estimate/page.tsx`.
  - Commit: `e102ebbe`.
- **Income estimate: Combined / Kaiser only / Health Net only views + cash balance room.** A Revenue view switcher drives every section on the page, and a comparison table shows all three side by side (revenue, profit, cash balance room, taxes, owner after-tax). Each view keeps full payroll/business costs. Cash balance now shows the age-based max, profit available before cash balance, and a planning contribution = the lower of the two (`cashBalanceProfitRoomAnnual`, `cashBalanceSuggestedAnnual`).
  - Files: `src/lib/kaiser-income-estimate.ts`, `src/app/admin/super-admin-tools/kaiser-income-estimate/page.tsx`.
  - Commit: `e102ebbe`.
- **Income estimate: calendar-year 2026 tax view, staff end dates, state grant.** New "tax year estimate" card (follows the revenue view) = HN/Kaiser YTD cash ($4.48M / $734k) + rest of year from the projection, on cash basis (default; cash expected by Dec 31 given payment lag) or accrual. Staff rows have "Last day worked" (Leidy 2026-09-15, Tang 2026-08-28 — Tang salary still $0, needs entry); ended staff drop out of the forward 12-month payroll and are prorated in the tax year. Per-person "Grant $/yr" (Leidy $60k, Nick $70k, Deydry $65k, Monica $80k, Jason $28k) × 8 months (grant ended Aug 30), counted as taxable income by default (toggle). Shows business taxable income vs last year, cash balance room, federal/state/total taxes, and a per-person wages/grant table. The Revenue view comparison table now shows a "2026 tax year (incl. YTD paid)" section above the "Next 12 months (forward only)" section, so YTD Health Net cash ($4.48M) is visible alongside the forward projection.
  - Files: `src/lib/kaiser-income-estimate.ts` (`buildCalendarYearTaxEstimate`, `calendarYear` on result), `src/app/admin/super-admin-tools/kaiser-income-estimate/page.tsx`.
  - Commit: `e102ebbe`.
- **Denied members stay on MIF consolidator monthly updates with date.** Declining services (single-auth or Create App Accept/Decline) now writes `ils_mif_declined_members` via `markIlsMifMemberServiceDeclined`. On consolidator, denied members remain visible on Master / Not in Caspio / Northern lists with a **Denied service** badge and denial date (not hidden after denial). Still excluded from Create Application and from new bulk-denial selection until Undecline.
  - Files: `src/lib/ils-mif-consolidator-sync.ts`, `src/lib/ils-mif-parse.ts`, `src/app/admin/applications/create/page.tsx`, `src/app/admin/tools/ils-mif-consolidator/page.tsx`.
  - Commit `903f2589`.
- **Single-auth sheet: Accept/Decline → ILS (same as MIF consolidator).** Create Application single-auth flow now has **Accept — notify ILS we started services** and **Decline — deny services & notify ILS**, with editable subject/body preview, same recipients, and `/api/admin/ils-service-delivery-decision` (`sourceType: single_auth_pdf`). County comes from `memberCustomaryCounty`.
  - Files: `src/app/admin/applications/create/page.tsx`.
  - Commit `903f2589`.
- **False MRN duplicate: Kenyatta White ≠ Penny Tatoowi.** MRN/CIN hits whose names clearly differ are no longer treated as the same person. Warning is amber (“names do not match”); skeleton create is allowed after confirm. Only same-name (or incomplete-name) matches block create.
  - Files: `src/lib/ils-mif-consolidator-sync.ts` (`applicationNamesClearlyDifferent`, `partitionExistingApplicationMatches`), `src/app/admin/applications/create/page.tsx`.
  - Commit `903f2589`.
- **Create Application duplicate check: ignore soft-deleted apps + show open link.** Skeleton create was blocked by Firestore apps that were soft-deleted (`isDeleted` / `deletedAt`) and therefore hidden from the Applications list — so staff saw “Already has application” but couldn’t find the member. Duplicate matching now uses the same inactive rules as the Applications list. The red warning links to `/admin/applications/{id}` with name + match reason (MRN/CIN).
  - Files: `src/lib/ils-mif-consolidator-sync.ts`, `src/app/admin/applications/create/page.tsx`.
  - Commit `b65dcfee`.
- **Kaiser income estimate: year-end federal/state tax totals + 3% 401(k) for eligible FT staff only.**
  - Employer 401(k) default is **3%** of eligible salaries (not all payroll). Eligible by default: James, Monica, Nick, Jason, Alberto, Deydry (FT + 1 year). Alberto added to staff list (salary editable; default $65k CA). Checkboxes on each staff/owner row toggle eligibility.
  - New **Year-end estimated federal & state taxes** card: employer federal FICA/FUTA, employer state UI, CA entity tax, combined owner federal + net state + employee FICA, and a grand total for the projection year (from expenses/salary model).
  - Files: `src/lib/kaiser-income-estimate.ts`, `src/app/admin/super-admin-tools/kaiser-income-estimate/page.tsx`.
  - Commit `ebe0d5ff`.
- **Kaiser ISP cover sheet: move-in date is always numeric MM/DD/YYYY.** “What date did member move into facility?” now normalizes Caspio/ISO/`MM-DD-YYYY` values to `MM/DD/YYYY` on generator prefill, Caspio refresh, typing (when complete), and blur. PDF template uses the same normalization. Hint text: “Use numeric format MM/DD/YYYY.”
  - Files: `src/app/forms/kaiser-isp-cover-sheet/printable/page.tsx`, `src/app/admin/tools/kaiser-isp-cover-sheet/page.tsx`, `src/app/api/forms/kaiser-isp-cover-sheet/template/route.ts`.
  - Commit `8dfccde1`.

---

## Changes 2026-10-12

- **Kaiser Intake Routing: allow override when selected North/South does not match detection** (e.g. Leonard Smith — SoCal member detected as North). Previously a mismatch showed a hard error and disabled the “I confirm…” checkbox with no override. Now an amber **Override** checkbox appears on mismatch; after override is checked, routing confirm unlocks and send is allowed. Same rule on `/api/forms/kaiser-referral/send-intake`.
- **Fix false Kaiser North detection from street names.** Old address parser matched short North county tokens (`lake`, `kings`, `glenn`, etc.) anywhere in the address, so SoCal streets like “Lake Ave” could force North. Detection now uses `"X County"` and `City, ST ZIP` / city lookup only (`src/lib/kaiser-region.ts` `getKaiserRegionFromAddress`). Form + send route use the shared helper.
  - Files: `src/lib/kaiser-region.ts`, `src/components/forms/PrintableKaiserReferralForm.tsx`, `src/app/api/forms/kaiser-referral/send-intake/route.ts`.
  - Commit `62696b18`.

---

## Changes 2026-10-11

- **Kaiser referral Step 1 (yellow box) asks staff to confirm the Caregiver/Support Person from Caspio Best Contact.** Shows `Best_Contact_First` + `Best_Contact_Last`, `Best_Contact_Phone`, `Best_Contact_Email`, `Best_Contact_Relationship` and asks "Is this Best Contact the member's Caregiver/Support Person?" **Yes** fills Section A Caregiver/Support Person Name and Contact (`phone | email | Relationship: x`); **No** restores the authorized-representative prefill (or blank). The answer is required before View/Download PDF whenever a Best Contact exists; if none, the box says so and nothing is required. The caregiver default rule (authorized rep only, never auto-fill from primary contact) is unchanged — Best Contact is only used after staff say Yes.
  - Files: `src/lib/kaiser-referral-caregiver.ts` (`resolveReferralBestContactParams`, `caregiverFromBestContact`), `src/app/forms/kaiser-referral/printable/page.tsx` (question, gating, reminders), `src/components/forms/PrintableKaiserReferralForm.tsx` (caregiver fields now follow prop changes after mount), launchers pass `bestContact*` query params: `src/app/admin/kaiser-referral-generator/page.tsx` (Caspio `Best_Contact_*`), `src/app/admin/applications/[applicationId]/page.tsx` (both referral buttons; application `bestContact*`).
  - The email-log "reopen referral" link and H2022 renewal cron link do not pass Best Contact, so they show "No Best Contact on file".
  - Commit `4edcbbb1`.
- **Best Contact confirm moved into the Generate Form preview (standalone generator) and simplified to confirm-only.**
  - Generator (`src/app/admin/kaiser-referral-generator/page.tsx`): the Field Check panel has one "Best Contact (Caregiver/Support Person)" row listing Name (`Best_Contact_First`/`Last`), Phone, Email, Relationship, plus a **Confirm Best Contact** checkbox. Row is red with no Best Contact, amber until confirmed, green when confirmed. Generate is blocked until it is green. On generate, caregiver name/contact come from Best Contact and `caregiverBestContactConfirmed=1` is passed.
  - Referral form Step 1 (`src/app/forms/kaiser-referral/printable/page.tsx`): the Yes/No select is replaced by a single "Confirm Caregiver/Support Person" checkbox box, placed directly under "1) Current service usage" (pre-checked and green when coming from the generator). Unchecking restores the authorized-rep prefill or blank.
  - No manual caregiver entry: `PrintableKaiserReferralForm` gets `caregiverReadOnly` (set by the printable page), making Section A Caregiver Name/Contact read-only and ignoring saved-draft caregiver values.
  - Commit `a8359dc7`.

---

## Changes 2026-10-09

- **Application pathway notes pushed to Caspio now name the staff member who pushed them.** The note appended to `connect_tbl_clientnotes` ends with `[Admin push by <staff name>: <application ref>]` instead of `[Admin push: <ref>]`. Applies to both the full member push and the notes-only push. The name is the signed-in user's display name (or email); if missing, the tag falls back to `[Admin push]`. The ILS/claims workflow field update (`src/lib/caspio-ils-claims-workflow.ts`) does not send a name and keeps the plain tag.
  - Files: `src/app/api/admin/caspio/push-cs-summary/route.ts` (reads `pushedByName` from the request body, passes it to `syncPrePushNoteToClientNotes`), `src/app/admin/applications/[applicationId]/components/PushToCaspioDialog.tsx` (sends `pushedByName` on both push calls). Commit `35219459`.
- **ISP SW Roster redirect** (`src/app/admin/tools/isp-sw-roster/page.tsx`): simplified to `await searchParams` before redirecting to `/admin/tools/isp-assignment` (Next 15 always passes a Promise).
  - Note: an earlier chat on 2026-10-09 made other updates that were lost (Cursor chat-history database lock, nothing committed); only this item was re-implemented.

---

## Changes 2026-10-08

### API auth lockdown (`805c256a`)
- `/api/members` was already guarded (`1b586a4d`), but ~40 other routes had **no auth**. Added guards:
  - **Admin token** (`requireAdminApiAuth`, `requireTwoFactor: false`): admin/all-notes, eligibility-checks (+process), eligibility-verification, remove-duplicate-applications, send-document-reminder, send-staff-assignment-email, system-notes, update-notification-settings, alft/parse-completed-pdf, all-members, daily-tasks, member-tasks, notifications/mark-read, rcfe-bulk-email, rcfe-registrations, rcfe-locations-fallback, staff/* (add-note, followups/list, my-notes, notes, notifications), staff-assignment, staff-members, staff-notifications, super-admin/global-followups, forms/kaiser-referral/autosave, kaiser-members/update-status + update-workflow, member-notes/health, reminders/send, send-activity-notification, sw-visits/signoffs, admin/mark-form-complete, admin/statistics/staff-assignments. `forms/kaiser-referral/pdf-session` POST also allows ILS portal users (GET stays open; unguessable 10-min id).
  - **Super admin**: auth/check-user, caspio-push-applications, admin/cleanup-member-last-name-suffixes, admin/ils-permissions, test-emails.
  - **Any signed-in user** (new `requireSignedInApiAuth` in `src/lib/admin-api-auth.ts`): email/send (was an open relay), notifications/health-net, pathway/sw-assignment, alft/template-fill-preview, geo/reverse, sw-visits/login-tracking, fcm-token.
- Client: new `firebaseAuthHeaders()` in `src/lib/admin-fetch.ts` (waits for `authStateReady()` so fresh tabs still send a token); ~70 `fetch` calls now spread it into headers.
- Server-to-server: `staff-assignment` forwards the caller's `Authorization` to `staff-notifications`; `admin/send-cs-reminder` calls `sendCsSummaryReminderEmail` directly (old HTTP path never passed `to`, so the reminder had no recipient).
- **Watch after deploy:** any caller missed will now get 401 — check browser consoles / logs.

### Stop saving tokened download URLs on family-readable applications (`805c256a`)
- New staff uploads on `admin/applications/[applicationId]` (single + consolidated medical), `pathway` uploads, and `admin/standalone-uploads/assign` into a `users/{uid}/applications` doc now store `filePath` with `downloadURL: null`. Staff open via `/api/admin/documents/open-upload` or an in-memory `getDownloadURL`. Eligibility screenshots unchanged (their links are emailed).
- `src/lib/storage-download-url-server.ts` (new): `mintStorageDownloadUrl` / `resolveFormFileDownloadUrl` build a link from `filePath` at send time. Used by `src/lib/room-board-ils-dispatch.ts` (ILS room & board email no longer requires a stored `downloadURL`).
- `admin/kaiser-room-board-docs`: lists path-only files; Download opens via `open-upload`.
- `api/admin/security/clear-upload-download-urls`: fixed (used undefined `adminDb`), now also clears `forms[].uploadedFiles[].downloadURL`. Not run yet — super admin + 2FA, POST `{ dryRun: true }` first.

### TypeScript: full `tsc --noEmit` now 0 errors (was 762) (`805c256a`)
- `useSearchParams() ?? new URLSearchParams()` / `usePathname() ?? ''` at declarations (nullable because `src/pages/_document.tsx` turns on Next's compat navigation types). `Application` gained optional `medicalRecordNumber`, `hasMediCal`, `shareOfCost`, `additionalNotes`, `specialInstructions`. `src/types/qrcode.d.ts` added. Deleted dead `admin/daily-tasks/page-old.tsx`.
- **Real bugs fixed along the way:**
  - ALFT view (`alft-view/[id]`): med-list appendix never rendered (early return).
  - `api/staff/tasks`: out-of-scope `staffFirstNameLower` threw and silently dropped staff notification tasks — they now appear.
  - `kaiser-tracker-daily-log/pull-all`: `success` was overwritten by the count (0 ⇒ failure); now `successCount`.
  - `src/lib/california-cities.ts`: duplicate keys mapped Fremont/Hayward → Contra Costa, Modesto → Tuolumne, Turlock → Merced, Redlands → LA; now Alameda / Stanislaus / San Bernardino.
  - Missing imports: client-notes (Card), sw-claims-management (Alert, Loader2), `api/admin/ils-member-access` (`isBlockedPortalEmail`).
  - `applications/create`: undefined `appUserId` stopped staff assignment emails; "Select Only Not In Caspio" crashed (click event passed as rows).
  - `[applicationId]`: eligibility screenshot packet PDF never built (`new File` hit the lucide icon) → `globalThis.File`.
  - `api/admin/users/update`: every role change 500'd (`serverTimestamp` called as a function).
  - `api/staff-members`: Firebase admins never included (`adminDb.FieldPath`); `caspio-note-webhook` `Timestamp` import (webhook still suspended).
  - `useAuth()` misuse (user always undefined) → `useUser()` in MemberListModal, PushNotificationManager, StaffNotesInterface/Manager, StaffNotificationSettings, use-activity-tracking, use-login-tracking (its provider isn't mounted); SuperAdminNoteLog High Priority card; `CaspioAuthService.isConnected()` crash; Caspio notes/members hook method names.
  - SW portal desktop Sign Out passed the click event as the redirect; authorization-tracker Clear button.
  - **Behavior change (approved):** `src/lib/ils-mif-parse.ts` `pickMifExportValue` now honors its third fallback, so 6 CS MIF export columns fill from fallback fields instead of blank.
  - ILS MIF consolidator (`tools/ils-mif-consolidator/page.tsx`): save now reads `markKaiserInactive` from existing master rows, so a saved "Kaiser Inactive" mark is no longer lost on re-save.
  - Login tracking (`use-login-tracking`, 2-hour inactivity logout) intentionally left unmounted (`LoginTrackingProvider` not used).
- **Reported, not fixed:** `src/lib/caspio-api.ts` schema expects `HasPrefRCFE` but sends `Has_Selected_RCFE` (writes already disabled); `useCaspioMembers.updateMemberRecord` doesn't exist; `notification-demo` page calls hooks with wrong shapes; `ils-report-editor/printable` `showH2022EndDateColumn` always false (stale card keys).

## Changes 2026-10-06

### Kaiser referral Step 2 — remove Download PDF (use Step 6 only) (commit `51374294`)
- Step 2 keeps **View PDF** only; download stays on Step 6 **Download Complete Document**.
- **File:** `src/components/forms/PrintableKaiserReferralForm.tsx`.

### Kaiser referral Step 2 — list what still needs filling to activate View PDF (commit `9f459874`)
- When View PDF is disabled, Step 2 now lists the remaining required items (Section 2.2 living location / ALF name + confirm / Section 1 usage / current cost, plus Kaiser North/South routing confirm or address mismatch).
- **Files:** `src/app/forms/kaiser-referral/printable/page.tsx`, `src/components/forms/PrintableKaiserReferralForm.tsx`.

### SW ALFT invite — schedule visit date in portal; show on ISP Tracker (commit `9f459874`)
- Invite email / ISP Workflow preview now tells the social worker to log into the SW Portal, open the member, and enter **Expected visit date** (visible to staff on ISP Tracker), then complete the ALFT after the visit.
- SW Portal shows a top “Schedule the member visit” date control; draft save promotes `expectedVisitDate` / `alftExpectedVisitDate` on `alft_assignments` and logs `expected_visit_date_set`.
- ISP Tracker shows Visit scheduled on the row, Details panel, and invite-phase status badge.
- **Files:** `src/app/actions/send-email.ts`, `src/app/admin/tools/isp-workflow/page.tsx`, `src/app/api/alft/sw-draft/route.ts`, `src/app/sw-portal/alft-upload/page.tsx`, `src/app/admin/tools/isp-tracker/page.tsx`, `src/lib/isp-workflow-activity.ts`.

### Kaiser auth referral Section 2.2 — prefill facility name + address from Caspio (commit `0fa5f6dc`)
- **Facility Name** from `Name_Where_Residing`; **Address** from `Current_Address` + `Current_City` + `Current_State` + `Current_Zip` (falls back to ISP_Current_* / ISP_Contact_*).
- Launchers pass `currentLocationName` again (standalone generator + application Generate PDF / quick actions). Printable form accepts the query prefill.
- Caspio members-cache sync + `/api/kaiser-members` expose those fields.
- **Files:** `src/lib/kaiser-referral-addresses.ts`, `src/app/api/caspio/members-cache/sync/route.ts`, `src/app/api/kaiser-members/route.ts`, `src/app/admin/kaiser-referral-generator/page.tsx`, `src/app/forms/kaiser-referral/printable/page.tsx`, `src/app/admin/applications/[applicationId]/page.tsx`.

### Kaiser Tracker — stop 2FA error overlay when loading status list (commit `a5f120aa`)
- **Problem:** `/api/admin/kaiser-statuses/list` required active 2FA; without it the client threw/logged an Error and Next.js showed “Active two-factor authentication is required” over the tracker (even though a built-in fallback status list already exists).
- **Fix:** list endpoint uses `requireTwoFactor: false` (read-only dropdown data; sync still requires 2FA). Client catch logs a string via `console.warn` instead of `console.error(Error)`.
- **Files:** `src/app/api/admin/kaiser-statuses/list/route.ts`, `src/app/admin/kaiser-tracker/page.tsx`.

### CS Summary — Program Information links show full URLs (commit `a99bd765`)
- Online CS Summary Step 4 (Sections 8 & 9) and printable English / Spanish / Vietnamese CS Summary forms now display full `https://connectcalaim.com/info/payments` and `https://connectcalaim.com/info/eligibility` instead of relative `/info/...` paths (so printed copies remain usable).
- **Files:** `src/app/forms/cs-summary-form/components/Step4.tsx`, `src/components/forms/PrintableCsSummaryForm.tsx`, `PrintableCsSummaryFormSpanish.tsx`, `PrintableCsSummaryFormVietnamese.tsx`, `src/app/forms/cs-summary-form/printable/PrintableCsSummaryFormContent.tsx`.

### ISP Tracker / Workflow — SW reassignment log, 2nd-SW invite warning, Details follow-up & cancel (commit `53ec8169`)
- **SW assignment history:** `alft_assignments.swAssignmentHistory[]` logs email/name changes when routing is saved, when an invite is sent to a different SW, or when Caspio contact refresh changes the SW. Shown under ISP Tracker **Details** and ISP Workflow activity log. Older members without history still synthesize transitions from invite delivery logs (`src/lib/sw-assignment-history.ts`).
- **2nd SW invite warning:** ISP Workflow blocks Preview/Send with a confirm dialog when a prior invite went to a different email than the current SW.
- **Details actions:** ISP Tracker Details adds **Follow-up to SW** (existing action-reminder compose) and **Cancel SW invite** (optional cancellation email to the SW). Cancel also available from ISP Workflow with the same notify option.
- **Files:** `src/lib/sw-assignment-history.ts`, `src/lib/isp-workflow-activity.ts`, `src/app/actions/send-email.ts` (`sendAlftSwInviteCancelledEmail`), `src/app/api/alft/assignment/cancel-sw-invite/route.ts`, `src/app/api/alft/workflow/start/route.ts`, `src/app/api/alft/refresh-sw-contacts/route.ts`, `src/app/admin/tools/isp-tracker/page.tsx`, `src/app/admin/tools/isp-workflow/page.tsx`.

### Proof of Income (and other upload cards) reviewable while a revision request is open (commit `8922108b`)
- **Problem:** after staff used "Request additional info" on Proof of Income, the uploaded files stayed but the card was forced to Pending (`revisionRequestedAt`/`Reason`), which hid the Reviewed checkbox and "Mark as Reviewed" button — staff were stuck until the family re-uploaded.
- **Fix (`src/app/admin/applications/[applicationId]/page.tsx`):** upload cards that have files (`filePath` / `downloadURL` / `uploadedFiles`) now always show the Reviewed controls (`canReviewCard`); badge reads "Needs review (revision open)". `handleFormReviewed(checked=true)` on a card with files and an open revision sets status `Completed` and clears the `revisionRequested*` / `revisionEmail*` fields (revision history is kept).

### Resend misdirected Kaiser South referrals + health fixes (commit `1b586a4d`)
- **Problem:** Jul 8 – Oct 6, 2026 (`596bb825` → fixed in `494dbc27`) every Kaiser South referral went to the misspelled `RegCareCoorCaseMgmt@kp.org`. ILS (`kpreferrals@ilshealth.com`) was CC'd and got them; Kaiser did not.
- **New API** `src/app/api/admin/kaiser-referrals/misdirected-resend/route.ts` (super admin only, no 2FA):
  - `GET`: `emailLogs` with `template = 'kaiser-referral-intake'`, success, not test, `to` contains the misspelled address. Deduped per member (MRN → Client_ID2 → name, latest send kept, `sendCount`). Current Kaiser status from `caspio_members_cache` (doc id Client_ID2, else `MCP_CIN`). `alreadyResent` when the log has `misdirectedResentAt` or a later success send to the correct South address exists. `preselect` only when not resent, PDF stored, and status is T2038 Requested or earlier / unknown (inactive statuses and later statuses are not preselected). Also lists Storage files under `kaiser-cover-sheets/` created Sep 18 – Oct 6 (cover sheet sends with the bad address were never logged; region not recorded — review only).
  - `POST { logIds }` (max 100): downloads the original PDF from `metadata.pdfStoragePath`, emails To `RegCareCoordCaseMgmt@kp.org`, CC the staff member who sent the original auth request (`metadata.submitterEmail`) + `kpreferrals@ilshealth.com` + jason + the staff resending (deydry removed — see below), subject `Resend - corrected address: <original>`. Logs a new `emailLogs` row (`source` = this route, `metadata.misdirectedResendOf`), stamps `misdirectedResentAt` / `misdirectedResentBy` / `misdirectedResentProviderMessageId` on the source log, appends a Caspio client note (`kaiser-referral-misdirected-resend`). **Does not** change `kaiserReferralSubmission`, `kaiserStatus`, or the submission count. Failures are logged as failure rows.
- **UI** `admin/email-logs/kaiser-referrals/components/MisdirectedSouthResendCard.tsx`, shown to super admins at the top of the Kaiser Referral DataPage: checkbox list (member → Member 360, MRN/ID, original date + sender, Kaiser status, preselect reason), Resend selected (confirm), per-row results, show/hide already resent, cover sheets to review. History rows show “Resent {date}” / “Corrected resend” tags; hover text flags misspelled-address sends.
- **To run:** after deploy, open `/admin/email-logs/kaiser-referrals` as a super admin, review the pre-selection, click Resend selected. Record the counts here.

### Kaiser auth request — Section 2.2 facility name no longer prefilled
- Problem: the generator prefilled the 2.2 facility name from Caspio (application current location → RCFE_Name → ISP name), so e.g. a SNF member showed “Valley Manor Board and Care Inc” as the SNF name and in the ALF/Board and Care name box on the PDF.
- Now the name is **never prefilled** (standalone generator `admin/kaiser-referral-generator/page.tsx`, application page Kaiser referral + QA launch in `admin/applications/[applicationId]/page.tsx`). The address is still prefilled.
- **SNF (A) needs no name:** the name + confirm checkbox are only shown/required for **C (Assisted Living / Board and Care)**, where staff type the name by hand. Picking A or B clears any name. Updated in `forms/kaiser-referral/printable/page.tsx` (Step 1 panel, View/Download PDF checks, reminders) and `PrintableKaiserReferralForm.tsx` (send check, asterisk, placeholder).
- Follow-up: the name still appeared because (1) autosaved drafts held the old Caspio name and the form restored it, and (2) old links (daily tasks, H2022 renewal alerts) carried `currentLocationName`. Now: `PrintableKaiserReferralForm` saves `facilityNameTypedByStaff` in the draft and only restores the name when it is true (older drafts load blank); typing in either the form or Step 1 box sets it; the Step 1 box syncs into the form like current cost. The printable page ignores a `currentLocationName` URL param except for `email_log_reopen` / `submitted_view_reopen`. `api/cron/h2022-rn-renewal-alerts` no longer puts `RCFE_Name` in the link.

### Deydry no longer notified (Kaiser auth requests + ALFT/ISP workflow) (commit `0d79f14a`)
- Removed `deydry@carehomefinders.com` from CC on: Kaiser auth request sends (`api/forms/kaiser-referral/send-intake`, `PrintableKaiserReferralForm` `KAISER_REFERRAL_CC_RECIPIENTS`), ISP cover sheet sends (`api/forms/kaiser-isp-cover-sheet/send`), misdirected South resends (route + confirm text).
- `api/alft/workflow/final-review`: no more Deydry staff_notification (`alft_ready_for_deydry_send`) or stage email. Routing is now `nextStepKey: 'send_to_jocelyn'` with no named recipient; assigned staff + ALFT reviewers still get the in-app "final review complete" alert.
- `api/alft/submit`: fallback reviewer when no staff manager is assigned is now Jason (was Deydry).
- `api/cron/alft-rn-reminders`: default final managers are Jason only.
- `admin/alft-tracker`: "Deydry send step" labels → neutral "Send step" / "Kaiser staff (ILS package)".
- **Not changed (not notifications):** Deydry as default referrer name/email on the Kaiser auth form; RCFE weekly confirm "Email update to Deydry" reply links; authorization-expiry in-app alert on the application page (`admin/applications/[applicationId]/page.tsx`, finds staff named Deydry); `send-completed` still lets Deydry (or any admin) mark the send step. If she is on review-notification settings or flagged as an ALFT reviewer / Kaiser assignment manager in Firestore, uncheck her there too.

### Kaiser emails — no To/CC block in the body (commit `22c04094`)
- The Kaiser auth request email (`send-intake`, plus the preview in `PrintableKaiserReferralForm`), the ISP cover sheet email and the misdirected resend email no longer list "Kaiser region emailed / To / CC" in the body. Recipients appear only in the email's To/CC headers. The "Kaiser provider portal" line and link are also removed from these emails (the in-app form still shows the portal link for staff).

### CS Summary Section 8 (NMOHC) shortened — full detail moved to Program Information (commit `a6806838`)
- Section 8 is now one paragraph that points to Program Information (`/info/payments`) in the online form (`cs-summary-form/components/Step4.tsx`) and all printables (`PrintableCsSummaryForm.tsx`, `cs-summary-form/printable/PrintableCsSummaryFormContent.tsx`, Spanish and Vietnamese printables).
- The "Program Information Pathways" detail (SSI, SSA/SSDI, the "Gap" strategy, how it works) was only in the application. It is now in Program Information page 3 (`info/payments/page.tsx`) and the English Program Information printables (`info/components/PrintableProgramInfo.tsx`, `components/forms/PrintableProgramInfoForm.tsx`). The Spanish/Vietnamese Program Information printables were not updated.

### Keep original Caspio-pushed notes visible on application pathway (commit `a6806838`)
- After a notes push, the editable Notes box still strips the original ILS/MIF dump so later pushes only send updates. Staff could no longer see what was originally pushed.
- `src/lib/ils-admin-notes.ts`: `resolveOriginalNotesPushedToCaspio` reads `caspioOriginalNotesPushed`, then earliest `caspioNotesPushHistory` entry, then admin intake notes for older apps.
- `PushToCaspioDialog.tsx`: on first member-push or notes-only push, saves `caspioOriginalNotesPushed` (never overwritten).
- Application pathway / Quick Actions Notes section: one green read-only "Notes pushed to Caspio" block shows the original pushed notes, then each later push from `caspioNotesPushHistory` (date + who; duplicates of earlier text skipped, via `resolveLaterNotesPushedToCaspio`). The separate blue "Imported admin intake notes" box only shows before anything has been pushed. Textarea is for new/updated notes only.

### Application pathway picker next to the pathway badge (commit `e90c9e4f`)
- `src/app/admin/applications/[applicationId]/page.tsx`: when the pathway is not set (or the app is still a skeleton/draft), a "Set pathway…" dropdown (SNF Transition / SNF Diversion) shows next to the badge. Saving writes `pathway`, `pathwaySetAtIso`, `pathwaySetBy` on the application, so the pathway-specific checklist (SNF Facesheet vs Declaration of Eligibility) updates immediately.

### Auto-create Service Request Form for single auth intakes too (commit `ded28106`)
- Before: the generated Service Request Form PDF (Member Files / Drive export) was only auto-created for MIF spreadsheet intakes (single create and batch). Single authorization sheet intakes only kept the uploaded ILS PDF.
- `src/lib/mif-service-delivery-form.ts`: added `isIlsAuthIntakeApplication` (MIF or single auth) and `isGeneratedMifServiceRequestForm`. `applicationMifServiceDeliveryNeedsRefresh` now covers all ILS auth intakes and never replaces a Service Request Form that staff uploaded themselves. The PDF shows "Source: ILS single authorization sheet" plus the source file for single auth instead of the MIF date.
- `src/app/admin/applications/create/page.tsx`: every Kaiser-auth-via-ILS create (MIF or single auth PDF) now generates the Service Request Form into `forms` + `serviceDeliveryForm`. Single auth uses `sourceType: 'single_auth_pdf'` and skips MIF filenames for the date.
- `src/app/admin/applications/[applicationId]/page.tsx`: the on-open backfill now also runs for single auth apps (labels source correctly) and only replaces generated forms. Opening an existing single auth app without one will create it automatically.

### Kaiser tracker vs Caspio count mismatch — label app intakes not in Caspio (commit `32cdc48e`)
- Why counts differ: `/api/kaiser-members` merges the Caspio members cache with Kaiser applications in Firestore that are not pushed to Caspio yet (`appendDraftKaiserMembers`, `source: 'application-draft'`). Those default to "T2038 Received, Need First Contact" when auth was received via ILS and use the app's `assignedStaffName`, so they count under the staff card but do not exist in a Caspio search. The tracker also merges "Need"/"Needs First Contact" spellings, and reads the cache (stale until the next sync).
- `kaiser-tracker/components/shared.ts`: `isNotInCaspioYet`, `getRawKaiserStatusIfDifferent`.
- Staff card status rows show "(N not in Caspio)". Member list modal header shows "X in Caspio · Y app intakes not pushed"; each such member gets a "Not in Caspio yet (app intake)" badge and an "Open application to push to Caspio" link; Caspio members show "Caspio value: …" when the raw status text differs from the grouped label.

### Misdirected South resend — skip members on current MIF consolidated list (commit `7c5c3df2`)
- Preselect now also excludes anyone on `ils_mif_master_members` (matched by Client_ID2, MRN/Medi-Cal, or name — same rules as the consolidator). Reason shows "Already on current MIF consolidated list"; UI badge "On MIF list". They remain visible for manual select if needed.

### Kaiser auth request — SNF uses Caspio Current Location, not MCP (commit `c4d32a20`)
- Problem: section 2.2 address was prefilling from MCP Member Address (e.g. "1030 N Unruh…") because `/api/kaiser-members` filled empty `ISP_Current_Address` from `Member_Address`, and `resolveKaiserReferralCurrentLocation` preferred application `currentAddress`.
- Fix: `ISP_Current_*` / `ISP_Contact_*` address fields no longer fall back to MCP. For SNF members, section 2.2 uses Caspio Current Location only (`resolveCaspioCurrentLocationFields`). Generator sets `alft22Choice=A` when SNF is detected. H2022 renewal links use the same helper (no more `RCFE_Address || memberAddress`).

### Kaiser auth send — remove pre-send test email step (commit `851d2143`)
- Removed the "Recommended before final send" / "Send Test Email to Staff" UI from `PrintableKaiserReferralForm` (dialog + Step 4 panel). No more prompt if a test was not sent.
- Staff review To (Kaiser intake + ILS) and CC (jason + the logged-in sender), then send. A valid staff email is required so the sender is always CC'd.

### Health fixes
- `components/RealTimeNotifications.tsx` `NotificationBadge`: used an undefined `db`; now `useFirestore()`.
- `/api/members` (GET + POST) now requires admin auth (`requireAdminApiAuth`, no 2FA). Callers switched to `adminFetch`: admin header search (`admin/layout.tsx`), `admin/member-notes`, `admin/standalone-uploads`.
- `/api/caspio-table-fields` no longer accepts any `calaim_admin_session` cookie value; requires a verified admin ID token (callers already sent one).
- Verified: unauthenticated GET to all three routes → 401; `npm run test:smoke` passes.

---

## Changes 2026-10-02 (sitewide review items 1–12 + follow-ups)

### Commits (oldest → newest)
| Commit | Summary |
|---|---|
| `34c5ca9d` | Removed MIF consolidator Pending → Authorized Caspio **status** push (staff authorize in Caspio so assigned staff are informed). Deleted `api/admin/ils-mif/push-pending-to-authorized`. |
| `d4d73912` | Fixed JSX arrow text in Kaiser daily logs that broke project-wide type checking. |
| `f87f6d50` | Cut redundant data loads: lighter admin badge listeners, cached Caspio token, session-reused Kaiser member list, targeted single-member Caspio pulls. |
| `4ca19c6a` | Items 4–12 (details below): Member 360, unified change log, server-side `/admin` guard, in-app dialogs, shared date/status helpers, application detail split, nav regroup, `adminFetch`, two email bug fixes. |
| `48205b90` | RN signature date auto-filled when the RN signs, with admin override (ISP editor + packets). |
| `907f2fa2` | `apphosting.yaml` references the `ADMIN_SESSION_SECRET` secret. |
| `c5b26c3c` | MIF consolidator: T2038 Received flag requires a MIF auth; Update Caspio pushes auth # + dates only. |
| `4393b3da` | Added this `handoff.md`. |
| `8b02c132` | MIF: Update Caspio uses real Caspio field names; badge wording by Caspio auth dates; Authorized-without-dates tag; requested-only members hidden; monthly ILS return limited to Authorized members. |

### Navigation / shared plumbing (item 4–6)
- `src/app/admin/layout.tsx`: Tools nav regrouped (`NAV_SECTION_LABELS`), dead links removed, notes chip links to member notes. Dashboard renamed “Review Inbox” (`src/app/admin/page.tsx`). Dead cards removed from `super-admin-tools/page.tsx`.
- `src/lib/admin-fetch.ts` (new): `adminFetch(url, { method, user, json })` — attaches Firebase ID token, parses JSON, throws on `success:false` / non-2xx. Used by MIF consolidator, Global Change Log, Member 360, etc.
- `global-change-log/page.tsx` and `notification-settings/page.tsx`: `useAuth` → `useUser` (fixed broken hook).

### Member 360 + header search (item 7)
- New page `src/app/admin/members/[clientId2]/page.tsx`: Caspio details (`caspio_members_cache`), applications, recent `client_notes`, full change history (Global Change Log filtered by member) with category filter, quick links to Kaiser tracker / member notes / ISP workflow / ALFT / MIF / applications.
- New API `src/app/api/admin/members/[clientId2]/route.ts` (any admin, no 2FA): member from cache, applications via root + collectionGroup on `client_ID2|clientId2|Client_ID2|caspioClientId2` (string and numeric), notes.
- `src/app/api/members/route.ts`: search also matches `Client_ID2 = x` and `MCP_CIN LIKE` (falls back to name-only on Caspio 400); returns `memberMrn`. Admin auth added later (`1b586a4d`).
- Header search (layout): “Name, MRN, or Client_ID2…”; result click → Member 360; Enter → exact Client_ID2/MRN match or single result, else applications search.

### In-app dialogs instead of alert/confirm (item 8)
- `src/components/AppDialogHost.tsx` (new): `appConfirm(string | {title, description, confirmText, cancelText, destructive})` → `Promise<boolean>`, `appAlert(...)` → `Promise<void>`. Host mounted in `src/app/AppProviders.tsx`; falls back to `window.confirm/alert` if no host.
- `window.confirm`/`window.alert` replaced in ~20 files (MIF consolidator, Kaiser referral form/printable, email-logs Kaiser referrals, SW visit tracking, Kaiser MemberListModal, applications create/list/detail, staff management, RCFE facility list, ALFT tracker, Caspio users registration, follow-up notes, ISP workflow). Handlers that now `await` were made `async`. Bare `confirm(`/`alert(` (without `window.`) were not touched.

### Unified Global Change Log (item 9)
- Collection `global_change_log`; each event has `memberKeys` (lowercased `[clientId2, mrn, applicationId]` for `array-contains`) and `sourceRef` (`collection/docId` of the legacy row it mirrors).
- `src/lib/global-change-log.ts`: `sourceRef`, `buildGlobalChangeMemberKeys`.
- `src/lib/global-change-log-mappers.ts` (new): `mapMemberActivityLog`, `mapMifAuditLog`, `mapEmailLog`, `mapCoverSheetLog`, `mapAlftDownloadLog`, `mapKaiserReferralGenerationLog`, `toChangeEventInput`.
- `src/lib/global-change-log-server.ts` (new, server only): `writeChangeEvent` (never throws), `mirrorLegacyLog`, `addAndMirror(db, collection, payload, mapper)`, `writeChangeEvents` (batched 400).
- `src/lib/log-change-event.ts` (new, client): `logChangeEvent` (fire-and-forget POST), `addIlsMifAuditDoc` (writes `ils_mif_audit_log` + mirrors). Used in `ils-mif-consolidator-sync.ts`, applications create, MIF consolidator.
- Mirrored server writers: `actions/send-email.ts` (`emailLogs`), Kaiser referral send-intake, welcome email, introductory email, `caspio-staff` (member_activities), ALFT download-log, Kaiser ISP cover-sheet download-log, ILS MIF save-master, member-activity/log, members-cache sync (batched). Not mirrored: password-reset emails, SYSTEM sync summary, cover-sheet template archive.
- `src/app/api/admin/global-change-log/route.ts`: GET reads unified log + legacy sources, de-dupes legacy rows already mirrored (`sources.legacyAlreadyMirrored`); `memberKey` param lets **any admin** read one member’s history (full log stays super admin). POST: any admin, staff identity from auth (not body).
- Older history is stitched in from legacy collections; the unified log is complete going forward only.

### Server-side /admin protection (item 10)
- **Middleware moved** `middleware.ts` → `src/middleware.ts`. With `src/app`, Next only loads `src/middleware.ts`; the root file had **never run** (including its debug-API guard).
- `src/lib/admin-session-token.ts` (new): cookie `calaim_admin_session` = `v1.<b64url uid>.<role>.<expSec>.<HMAC-SHA256>` (Web Crypto, Edge-safe), 30-day max age, roles `super|admin|ils`. Signing enabled when `ADMIN_SESSION_SECRET` (≥16 chars) is set; otherwise legacy value `'1'`.
- Middleware (matcher `/admin`, `/admin/:path*`, `/api/:path*`): missing cookie → redirect `/admin/login?redirect=…`; invalid → redirect + clear cookie; valid non-super on `/admin/super-admin-tools` → `/admin`; legacy `'1'` still accepted. Exempt paths: login, my-notes, ILS report/editor/package-review/status-check/monthly-report, H2022 checker, desktop windows.
- Debug/test API guard (production only, needs `x-debug-api-key` = `DEBUG_API_KEY`) now active; allowlisted because UI calls them: `/api/alft/reminders/send-test`, `/api/test-emails`, `/api/caspio-simple-test`, `/api/caspio-single-client-test`, `/api/test-caspio-note`.
- `src/app/api/auth/admin-session/route.ts` issues signed cookie with role. `AdminLoginClient.tsx`: with `?redirect=` and an existing admin Firebase session, silently re-issues the cookie (“Restoring your admin session…”) and returns. Layout re-POSTs admin-session once per browser session (sessionStorage `calaim_admin_session_refreshed_uid`).
- **`ADMIN_SESSION_SECRET` is set** in App Hosting (Secret Manager, backend granted, `apphosting.yaml` entry — commit `907f2fa2`). Local dev: optional `.env.local` value.
- Known (pre-existing): cookie path is `/admin`, so API routes never receive it.

### Page split (item 11 — first page only)
- `src/app/admin/applications/[applicationId]/page.tsx` 19,035 → ~16,400 lines. Extracted to `components/shared.tsx` (helpers/constants), `components/PushToCaspioDialog.tsx`, `components/IlsEmailDialogs.tsx` (`IlsServiceStartedEmailDialog`, `ClaimsDepartmentEmailDialog`); loaded via `next/dynamic` (`ssr:false`).
- Next candidates: applications create, MIF consolidator, ISP workflow, ALFT tracker.

### Shared helpers (item 12)
- `src/lib/format-date.ts` (new): `toDateMs`, `formatDate` (`10/02/2026`), `formatDateTime`, `formatTime`, `formatRelative` — Intl, `America/Los_Angeles`.
- `src/components/StatusBadge.tsx` (new): `<StatusBadge status domain="kaiser|application|calaim|generic" />`, `getStatusBadgeClass`.

### Bug fixes found during typecheck
- Application detail `AdminActions` “send status update” email always threw (`getManagerSignatureMeta` undefined in that component) — local helper added.
- ALFT manager workflow email always threw (`managerName` undefined in `actions/send-email.ts`) — now from payload, fallback “there”.
- `ils-mif-consolidator-sync.ts` missing `addDoc` import restored.

### RN signature date (commit `48205b90`)
- `api/alft/signatures/sign/route.ts`: on RN sign also sets `alftForm.exactPacketAnswers.p14_rn_date` (MM-DD-YYYY, Pacific).
- `components/alft/SwStyleAlftEditor.tsx`: “RN signature date” always shown; editable for admins (override, e.g. actual ISP date); read-only otherwise. Falls back to the date of `p14_rn_signed_at` for older packets. Editing the date does **not** change the electronic signed-at timestamp (except existing admin-override behavior).
- Packets prefer `p14_rn_date`: `sw-portal/alft-upload/page.tsx`, `admin/alft-tracker/dummy-preview/page.tsx`; `lib/alft/build-alft-form-pdf.ts` adds an RN “Date:” line.

### MIF consolidator (commit `c5b26c3c`)
- `lib/ils-mif-parse.ts`: new `ilsMifRowNeedsT2038ReceivedUpdate(row)` — Caspio still T2038 Requested **and** MIF auth number on the row. Used by `ilsMifNeedsStatusUpdate`, badges, counts, banner. Members only requested in Caspio (no MIF auth) no longer appear under “Caspio updates needed”.
- Removed Kaiser_Status T2038 Requested → Received push buttons (row, session table, bulk, auth dialog) and the push results dialog. API `push-t2038-requested-to-received` still exists but is unused by the UI.
- **Update Caspio** restored as auth-only push: new `pushIlsMifAuthFieldsToCaspio` (`lib/ils-mif-caspio-authorize-push.ts`) + API `api/admin/ils-mif/push-auth-fields` (admin + 2FA, respects Caspio read-only guard). Writes only the T2038 auth number/start/end (field names: see `8b02c132` below); **never** CalAIM_Status / Kaiser_Status. Skips if Caspio already has a later auth end. Logged to Global Change Log.
- Button shows on master rows and in auth-details dialog when: Caspio checked, member matched, full MIF auth (number/start/end), and MIF auth end is after Caspio’s. Row stays listed with a reminder note until staff set the status in Caspio and click Refresh Caspio.

### MIF consolidator + monthly ILS return (commit `8b02c132`)
- **Update Caspio 404 fix** (`FieldNotFound`): the real `CalAIM_tbl_Members` fields are `Authorization_Number_T2038`, `Authorization_Start_Date_T2038`, `Authorization_End_Date_T2038` (the table also has `Next_Auth_*_T2038` and `Auth_Ext_*`, which are not touched). `resolveIlsMifCaspioAuthFieldNames(baseUrl, token)` reads `GET /tables/CalAIM_tbl_Members/fields` (cached 30 min): preferred names first, then a regex fallback that skips next/ext fields. If no auth-number field is found, dates are still pushed and the result carries `noteError`. Legacy payload/select names were corrected too.
- **Badges** (`lib/ils-mif-parse.ts`):
  - Pending in Caspio + MIF auth: “Pending → Authorized · MIF auth extends past Caspio” only when Caspio has auth dates (`ilsMifRowHasCaspioAuthDates`); otherwise just “Pending → Authorized” (e.g. Sylvia Thaxton).
  - New `ilsMifRowNeedsAuthExtensionUpdate`: Authorized in Caspio + MIF auth number + MIF end later than Caspio’s (or Caspio has no end). Shows “Authorized · MIF auth extends past Caspio”, or “Authorized · no auth dates in Caspio”. Included in `ilsMifNeedsStatusUpdate`, so these rows get Update Caspio.
- **Requested-only members hidden** from the consolidator (new `listedRows` memo feeding `totals` and `visibleRows`): a Caspio-matched member who is not Authorized, has no MIF auth number, and no MIF source data is not listed (e.g. Debra Lovett, Sandra Tyson, Evanda King, Laura Boragno). They show under T2038 Requested on the Kaiser Tracker.
- **Monthly ILS return** (`admin/tools/ils-mif-monthly-report/page.tsx`): the list, search, counts and Excel export use only members **Authorized in Caspio** (`reportRows`). Pending, not-in-Caspio, and other statuses are excluded; their RTF cells stay blank in the exported workbook. First card is now “On return list” with excluded counts. Caspio auth end lookup now checks `Authorization_End_Date_T2038` first.

### MIF consolidator Caspio update log (commit `3bb11894`)
- New card **“Caspio update log”** on the MIF consolidator (above “MIF audit log”), component `admin/tools/ils-mif-consolidator/components/CaspioUpdateLog.tsx`. Lists every Caspio member update made from the consolidator: date/time, member (links to Member 360, with MRN / Client_ID2), update type, before → after values, result (updated / skipped / failed), staff, MIF file. Search, result filter, CSV export, Refresh; reloads automatically after each Update Caspio click.
- New API `GET /api/admin/ils-mif/caspio-update-log?limit=` (any admin, no 2FA). Reads `global_change_log` where `action in [...]` (no composite index needed, sorted in memory) plus un-mirrored legacy rows from `ils_mif_audit_log`. Actions: `mif_auth_fields_pushed`, `mif_auth_fields_push_skipped`, `mif_auth_fields_push_failed`, and the old-tool `mif_pending_to_authorized_push`, `mif_t2038_requested_to_received_push`.
- `push-auth-fields` route now logs skipped and failed attempts too (with reason), and `details` on every entry: MIF values tried, CalAIM status, MIF file, and for updates the Caspio values **before** (`previousAuthorization*T2038`) and **after** (`newAuthorization*T2038`) plus `caspioPkId`.
- `pushIlsMifAuthFieldsToCaspio` selects the current Caspio auth number/start/end before writing and returns them as `previousAuthorization*T2038`. Entries logged before this change show only the new values.

### Family portal uploads — physician's report (commit `44d2f15b`)
- Report: a family member could not upload the LIC 602A Physician’s Report on the Pathway page (`src/app/pathway/page.tsx`).
- **Revision uploads after submit:** once an application is `Completed & Submitted` / `Approved`, every family upload button was disabled (`isUploadLockedByReadOnly`), even on cards staff marked **Needs revision** — the button looked faded with no explanation. New `isRequirementUploadLocked(formInfo)` keeps submitted apps locked except cards with an open revision request; used for the card upload buttons and the SNF residency-days input/save. Locked cards now show a short note explaining why.
- **File types:** all pathway file inputs have `accept=` (PDF, Word, JPG, PNG), so iPhones convert HEIC photos to JPEG on pick. Files with an empty/generic browser MIME type are accepted by extension, and the upload is sent with the correct `contentType`. HEIC files get a clear message with workarounds instead of `File type "" is not supported`.
- **Size limit raised 10 MB → 25 MB per file** (`PATHWAY_UPLOAD_MAX_MB`; Storage rules have no size cap). Over-limit files get a message with how to shrink them: black & white / 150–200 dpi scan, compress the PDF, or split into parts. Card hint text uses the constant.
- Storage/Firestore rules unchanged (owner writes already allowed).

### Caspio update log — compact rows (commit `44d2f15b`)
- `CaspioUpdateLog.tsx`: table replaced by one-line rows (date · member · first change line · result · staff) that expand on click to show member link + MRN/ID, update type, all before → after lines, summary, staff, MIF file. List height 280px. Result badge no longer wraps.
- `caspio-update-log` route: old-tool batch summaries like “Pushed 0 member(s) … - 1 failed” are now **failed** (or skipped if no failure) instead of updated. Batch rows show “Batch” as the member.

### Daily application Kaiser/CalAIM status check + manual step 3 (commit `2e65e9f9`)
- **Before:** Caspio → application status only flowed when it *changed* (nightly `syncCaspioMembersCacheIncremental` Firebase function 9pm ET → `/api/caspio/members-cache/sync` propagates only cache deltas; `caspioWebhook`; live cache listener on the open app page, which skips pre-push statuses). Apps already out of line with Caspio were never corrected.
- **Daily check:** `src/lib/application-caspio-status-check.ts` → `runDailyApplicationStatusCheck`: every application with `caspioSent` + Client_ID2 is compared to `caspio_members_cache` and `kaiserStatus`/`Kaiser_Status`, `caspioCalAIMStatus`/`CalAIM_Status` are updated where different (empty Caspio values never wipe; active `kaiserStatusManualLockUntilMs` respected). Sets `*SyncedFromCaspioAt` + `*SyncSource: 'daily_caspio_status_check'`, logs each change to the Global Change Log (`member_status` / `application_status_synced_from_caspio`, before → after), saves the run summary to `admin-settings/application-caspio-status-check`.
- Cron route `GET /api/cron/application-status-check` (Bearer `CRON_SECRET`, `?dryRun=1` supported). Scheduled as the last step of `.github/workflows/daily-updates.yml` (see below).
- **Check Caspio now:** `POST /api/admin/applications/caspio-status-check` `{ docPath }` (any admin): live Caspio lookup of `Kaiser_Status`/`CalAIM_Status` by Client_ID2, updates the app (ignores manual lock), sets `caspioStatusCheckedAt`, refreshes the members-cache doc, logs changes. Button under steps 3/4 on the application page (shown once pushed to Caspio) with “Last synced …”.
- **Step 3 dropdown** (`admin/applications/[applicationId]/page.tsx`): was blank when Caspio’s spelling differed (e.g. “T2038 received, doc collection” vs option “T2038 Received, doc collection”) or the status was a later one. Now matches case/punctuation-insensitively, lists “Before Caspio push” plus “All Kaiser statuses” (`KAISER_STATUS_PROGRESSION`), and shows any unlisted current value. After push: no “Required before Push” warnings, step counts as done when a status is set, note that manual app changes are reverted by the daily check unless also changed in Caspio. Step 4 shows a non-Authorized/Pending Caspio CalAIM_Status as text.

### Staff document access on the Pathway page (commit `2e65e9f9`)
- **Problem:** staff links on `src/app/pathway/page.tsx` relied on client-side `getDownloadURL`, which depends on Storage-rule role docs and was skipped for non-`Upload` cards, so staff often saw no link ("locked"). Family uploads store `downloadURL: null` (owners can't read their own uploads), so there was nothing to fall back to.
- **Fix:** `StaffDocumentLinks` lists every file on a card (`uploadedFiles[]`, else `filePath`) as a button. Clicking opens a tab and streams the file through new `POST /api/admin/documents/open-upload` `{ filePath }` (`requireAdminApiAuth`, only `user_uploads/` / `admin_uploads/` paths, no `..`, `Content-Disposition: inline`, `Cache-Control: private, no-store`). Falls back to the stored `downloadURL`. Works on submitted/locked apps too.
- **Families:** never shown a link — only "Document submitted - accessible by staff only". Storage rules already deny family reads of `user_uploads/**`.
- **Admin application page** (`admin/applications/[applicationId]/page.tsx`): files with a `filePath` but no `downloadURL` (browser `getDownloadURL` failed or the importer never saved a URL) showed "No file available to view (this item was marked complete without an upload)" even though a file name existed. Now they show green and open through the same `open-upload` route into the preview dialog (`openStoredFileViaServer`). A 404 shows "File is not in storage" — only the name was saved, the upload never finished. Entries with a name but no `filePath` say that instead of "marked complete without an upload". The route also allows `documents/` (staff-created `admin_app_*` applications store files under `documents/applications/{id}/`).
- Residual (resolved 2026-10-08 for new uploads): staff uploads no longer save a tokened `downloadURL`; legacy docs can be cleaned with `clear-upload-download-urls`.

### Daily updates: Kaiser notes + status cache, one workflow, admin page (commits `2e65e9f9`, `e22284d3`, `f3d1ad5f`)
- `/api/cron/kaiser-morning-notes-sync` existed (Kaiser members cache sync + latest Caspio notes per Kaiser member) but **nothing scheduled it**; `kaiser-midnight-preload` is also unscheduled. The DataPage Tools page claimed a nightly Kaiser preload ran — corrected.
- The notes route is now **batched** (`offset`/`limit`, default 150, returns `nextOffset`) because App Hosting requests stop at 300s; the members sync runs only on the first batch. Progress is accumulated in `daily_update_runs/kaiser-cache-refresh.currentRun` and the final batch records the run.
- **Workflow:** `.github/workflows/daily-updates.yml` (replaces `application-status-check.yml`), `30 11 * * *` UTC (~4:30am PT): loops the Kaiser cache refresh until `nextOffset` is null, then runs the application status check (runs even if the refresh failed). Needs repo secrets `APP_BASE_URL`, `CRON_SECRET` + `jq` (preinstalled on ubuntu runners).
- **Registry:** `src/lib/daily-updates.ts` → `DAILY_UPDATE_JOBS` (every scheduled job: name, schedule, GitHub Actions vs Firebase scheduler, what it does, endpoint, run-now allowed) + `recordDailyUpdateRun(adminDb, jobId, run)` → `daily_update_runs/{jobId}` (`lastRun`, `lastSuccessAt`/`lastFailureAt`) + `history` subcollection. Recorded by: Kaiser cache refresh, application status check, social-worker cache sync. Members cache last run is read from `admin-settings/caspio-members-sync`.
- **Page:** `/admin/super-admin-tools/daily-updates` (Super Admin menu → "Daily Updates (Scheduled Jobs)"; DataPage Tools shows a link to super admins only). Shows schedule, runner, description, last run result/summary; **Run now** for the cache/status jobs (batched jobs loop on the page with progress). Email reminder jobs are list-only. API: `GET/POST /api/admin/daily-updates` (super admin only; POST calls the job handlers in-process with `CRON_SECRET`).
- When adding a new scheduled job, add it to `DAILY_UPDATE_JOBS` and call `recordDailyUpdateRun` from its route.

### LIC 602A blank form link (commit `893cb919`)
- Families couldn't download the 602 from the Pathway page: the CDSS URL `cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf` now redirects to a 404 (CDSS moved its forms).
- New shared constant `LIC_602A_FORM_URL` in `src/lib/form-links.ts` (Connections-hosted Squarespace copy of LIC 602A Medical Assessment) used by the Pathway page, admin application page, CS summary review page and admin create-application page. `resolveFormHref()` swaps the dead CDSS URL on older saved form entries; used on the Pathway "Download/Print Blank Form" button.

### Kaiser authorization request — South address fix, ILS in To, regional provider portal (commit `494dbc27`)
- **South intake address was misspelled.** Commit `596bb825` (Jul 8 2026) changed it to `RegCareCoorCaseMgmt@kp.org`; the correct address (confirmed by Jason, matches Kaiser's PDFs) is `RegCareCoordCaseMgmt@kp.org`. Every Kaiser South auth request / ISP cover sheet sent since then went to the wrong address (bounces go to `noreply@carehomefinders.com`, so nobody saw them). Fixed in `send-intake` route, `kaiser-isp-cover-sheet/send` route, `PrintableKaiserReferralForm.tsx`, `forms/kaiser-referral/printable/page.tsx`. Kaiser referral email log page still maps the misspelled address to Kaiser South so the affected sends can be found and resent.
- **To line:** now Kaiser regional intake **and** `kpreferrals@ilshealth.com` (moved from CC), so staff see both in To. CC: jason, deydry, sending staff. Same in the ISP cover sheet send. Send dialog lists "Kaiser North/South intake: … · portal link" and "ILS: kpreferrals@ilshealth.com"; success alert names both.
- Originally: the auth request email didn't say which Kaiser provider portal it went to; nothing named or linked the region's portal.
- `src/lib/kaiser-region.ts`: `KAISER_NORTH_PROVIDER_PORTAL_URL` / `KAISER_SOUTH_PROVIDER_PORTAL_URL` (KP community-provider portals) + `getKaiserProviderPortal(region)` → `{ label: 'NCAL - Provider Portal' | 'SCal Provider Portal', url }`.
- `send-intake` route: "Kaiser provider portal" link added to the Kaiser email and the staff test email; also in the Caspio client note. `kaiser-isp-cover-sheet/send`: same link in its email.
- `PrintableKaiserReferralForm.tsx`: provider portal shown under To in the routing panel and send dialog, in the email preview text, and the page-1 / page-15 portal tables are now real links.
- **Follow-up:** resend Kaiser South referrals sent Jul 8 – Oct 2026 — tool added 2026-10-06 (see “Resend misdirected Kaiser South referrals”).

### ISP Workflow — false “SW does not have portal access” (commit `61cd234f`)
- La Tonya Buchanan showed Access granted in SW User Management (`tonyat25@yahoo.com`, SW_ID 383) but ISP Workflow said she had no portal access.
- Cause: portal check used `socialWorkers.where(email).limit(1)` and took the first doc’s `isActive`. Duplicate UID-keyed docs (some inactive) could win over the active email-keyed doc that SW User Management uses.
- Fix: `isSocialWorkerPortalActive()` prefers `socialWorkers/{email}`, then any active email/SW_ID match. New `GET /api/admin/sw-portal/check-access`; ISP confirm/invite and prefill resolve use it. Error text now includes the email checked.

### MIF consolidator — CalAIM Pending clarity + viewing banner (commit `a59bd8af`)
- **Judy Skov-type case:** “CalAIM Status Pending” means Caspio `CalAIM_Status` is still Pending — it is not the authorize queue. When MIF auth end does not extend past Caspio, the member is correctly **not** under Caspio updates needed; badge/note now say “Pending · auth already in Caspio (set CalAIM Authorized)” and explain Refresh Caspio after flipping status. A brand-new auth only queues Pending→Authorized when a MIF has a later end date than Caspio.
- **Viewing banner:** above the member table, a indigo “Viewing category” strip shows which category card is active (name + count) and a short plain-language description of what that list includes.

### SW ISP med-list upload (commit `abc4dbac`)
- Social workers could not upload medication lists on the ISP/ALFT form: client uploads to `admin_uploads/alft-med-lists/{memberId}/` depend on Storage rules that allow the assigned SW, but those rules were never successfully deployed (`firebase login --reauth` still required), so uploads fail with `storage/unauthorized`.
- Fix: `POST /api/alft/med-list-upload` (multipart `memberId` + `file`) verifies the caller is the assigned SW (email / uid / SW_ID claim) or an admin, then writes the file with Admin Storage + download token and merges `medListAttachment` onto `alft_assignments/{memberId}`. `AlftMedListUpload` now uses this API instead of client `uploadBytesResumable`.
- Storage rules comment/null-safe email check updated for a future deploy; App Hosting deploy alone is enough for SW uploads now.

### Create Application — no MIF-list confirm (commit `2118381c`)
- Skeleton create no longer asks “appears on the latest consolidated MIF master list… Create anyway?” Being on the MIF list is expected for new apps (member often not in Caspio yet). Still blocks declined / already-in-Applications; still confirms when already in Caspio. MIF lookup remains so form fields can be prioritized from the master.

### Open follow-ups
- After deploy: run the `Daily Updates` workflow once via workflow_dispatch (or Run now on the page) and check timings; lower `limit` if batches near 300s.
- Browser-test: dialogs, `/admin` deep link from a fresh tab (session restore), Member 360, Global Change Log, RN date, MIF Update Caspio.
- Run the misdirected Kaiser South resend after deploy and review the Sep 18–23 cover sheet list.
- Split remaining large pages incrementally.
- Full `npx tsc --noEmit -p tsconfig.json` is clean as of 2026-10-08 — keep it at 0 (builds still set `ignoreBuildErrors`).

---

## Overall goal

**Connect CalAIM** is Connections Care Home Consultants’ operations portal for CalAIM Community Supports (Assisted Transitions — Health Net and Kaiser).

It lets members/families apply and track documents, while staff run day-to-day work in a large admin portal: applications, ALFT/ISP clinical workflow, Caspio member sync, ILS packaging, SW visits/claims, RCFE tools, and related reporting.

**Stack:** Next.js 15 + React/TypeScript/Tailwind · Firebase Auth / Firestore / Storage / Functions (Node 22) · Caspio (system of record for members) · Google Drive migration tooling · Resend email · Electron desktop tray app.

**Firebase project:** `studio-2881432245-f1d94` (see also production host `connectcalaim.com`).

---

## Features successfully implemented

### Member / family portal
- Signup/login, application pathway, document uploads, eligibility / CS summary / waivers flows
- Intro emails and claim of admin-started applications

### Admin portal (role-gated)
- Applications list/detail/create, intake processing, missing docs, standalone uploads
- Staff management with designations (Kaiser / Health Net / claims / ILS / full tools / Kaiser assignment manager)
- Daily tasks, action items, staff notifications, maps/stats, email logs, desktop presence
- Kaiser Tracker, Not Interested log, referral generator, cover sheet, H2022 Status / Claim Checker, Authorization Tracker
- RCFE tools, ILS MIF consolidator / monthly RTF, ERA parser, SW visits & claims management

### ALFT / ISP clinical workflow (actively used)
- Assign SW → SW digital form/submit → staff pre-RN review → RN signatures → Kaiser manager final → send/package to ILS
- Admin: ALFT Detail Tracker, assignment, documents, view/sign
- ISP Tools: Workflow, SW Assignments, Tracker (incl. **Sent to ILS**), Activity Log, Download Archive
- **Queue exit rule:** leave admin review only when there is a **Sent to ILS date** — either ILS package / cover-sheet send **or** manual checkmark **plus** date. Download alone does **not** clear the queue (`src/lib/alft-workflow-status.ts`)
- Downloads use **live edits** with confirm-then-download; silent PDF via iframe `dummy-preview?silent=1`
- Download filenames use 12-hour timestamps without seconds (e.g. `10-59 PM`)
- Back-to-top on long admin pages

### ILS package
- ILS Package Checklist → email package; marks Sent to ILS (`alft_cover_sheet_packages`)
- Veronica-style ILS Package Review portal with limited nav (`isIlsStaff` / `canAccessIlsPackagePortal`)

### Caspio integration
- OAuth2 client-credentials; member sync / cache (`caspio_members_cache`); webhooks; field mapping / test tools; push from applications; Kaiser status wiring

### Google Drive
- Service-account Functions for scan/migrate/match; admin migrate-drive UI  
- **Note:** full 800+ folder migration still treated as incomplete / incremental-test territory

### Auth & sessions
- Firebase Auth; admins via hardcoded emails + `roles_admin` / `roles_super_admin`
- Separate SW portal session isolation; 2FA Functions; app-access via `system_settings`
- Electron desktop wrapper with business-hours notifications

### Form separator
- UI exists but still largely **mock/beta** page separation — do not treat as production PDF splitting

### Smoke check (2026-09-17)
- `npm run test:smoke` — pass  
- ALFT audience / Sent-to-ILS date logic (6 cases) — pass  
- Key routes on `:3000` — **200**; unauth `/api/alft/download-log` — **401** (expected)

---

## Firestore schema (collections)

**Deployed rules:** root `firestore.rules` (via `firebase.json`).  
**Do not deploy** the divergent copy at `src/firestore.rules` unless intentionally reconciled.

### Core
| Collection | Purpose |
|---|---|
| `applications` | Admin-created / shared application records |
| `users` | Profiles; flags like `isIlsStaff`, `isKaiserAssignmentManager`, signing profile |
| `users/{uid}/applications/{id}` | Member-owned applications (dual storage with root) |
| `users/{uid}/staffTrackers/{id}` | Per-app staff tracker state |
| `users/{uid}/admin_settings/{id}` | Per-user admin drafts/settings |
| `roles_admin` / `roles_super_admin` | Role grants (doc id = uid or email) |
| `socialWorkers` / `syncedSocialWorkers` | SW profiles / Caspio-synced SW data |
| `caspio_members_cache` | Denormalized Caspio members |
| `admin-settings` | Shared admin config (e.g. Caspio field maps, `sw-isp-tools`) |
| `system_settings` | Global config (`app_access`, `ils_member_access`, notifications, etc.) |

### ALFT / ISP
| Collection | Purpose |
|---|---|
| `standalone_upload_submissions` | **Primary** ALFT/ISP intake + workflow record (`toolCode: 'ALFT'`, `alftForm`, `workflowStatus`, Sent-to-ILS fields, manager review blocks, files) |
| `alft_assignments` | Member → SW assignment + routing mirrors (key often `memberId`) |
| `alft_signature_requests` | RN/MSW signature sessions |
| `alft_cover_sheet_packages` | ILS package checklist / send artifacts |
| `alft_isp_download_logs` / `kaiser_isp_cover_sheet_download_logs` | Download archives |

**High-signal Sent-to-ILS fields on uploads:** `sentToIls`, `sentToIlsAtIso` / `sentToIlsAt` / `sentToIlsMarkedAt`, `coverSheetPackageSentAt` / `coverSheetPackageSentAtIso`.

### ILS MIF / Kaiser intake
`ils_mif_master_members`, `ils_mif_consolidation_runs` (+ `members`, `removed`), `ils_mif_declined_members`, `ils_mif_northern_decline_batches`, `ils_mif_removed_members`, `ils_mif_audit_log`, `ils_mif_uploaded_files` (+ `members`), `ils_mif_companion_sheets`, `ils_mif_skeleton_creates`, `ils_mif_create_app_excluded`, `ils_spreadsheet_upload_logs`, `ils_change_log`, `ils_member_comments`, `ils_service_delivery_decision_logs`, `ils_weekly_tracker_snapshots`, `kaiser_not_interested_members`, …

### SW visits / claims / RCFE
`sw_visit_records`, `sw-claims`, `sw_claim_events`, overrides/signoffs/monthly rollups, `rcfe_*`, `admin_tool_state`, …

### Notes / tasks / notifications / auth / other
`client_notes`, `memberNotes`, `memberTasks`, `staff_notifications`, `loginLogs`, `activeSessions`, `2fa-*`, `desktop_presence`, `emailLogs`, `chat_conversations` (+ `messages`), `eligibilityChecks` / `eligibilityVerifications`, ERA cache, Caspio note/API usage logs, …

Fuller catalog: **`ARCHITECTURE.md` §5**.

---

## Firestore security rules (summary)

**Model:** default deny (`match /{document=**}` → false), then explicit allows.

| Area | Access |
|---|---|
| **Admin** | Signed-in + email in hardcoded set **or** doc in `roles_admin` / `roles_super_admin` |
| **`users` / nested apps** | Owner or admin |
| **Root `applications`** | Admin CRUD; collectionGroup read/list admin |
| **`standalone_upload_submissions`** | Admin read/update/delete; any signed-in **create** |
| **`alft_assignments`** | Admin full; SW get/list/update if `assignedSwEmail` (lowercased) or `assignedSwUid` matches |
| **`admin-settings`** | Admin R/W; SW can read doc `sw-isp-tools` |
| **`staff_notifications` / `loginLogs` / `activeSessions`** | Scoped self + admin |
| **`sw-claims`** | SW create/read own; update/delete limited to hardcoded super email in rules |
| **`chat_conversations` (+ messages)** | Admin or participants |
| **ILS MIF family / spreadsheet logs** | Many rules allow **any signed-in** read/write (broad) |
| **`emailLogs`** | Any signed-in **read**; create false; admin update/delete |
| **`socialWorkers`** | Effectively open to any authenticated user (write allowed) |
| **`test_writes`** | Any signed-in |

**Implications**
- Much sensitive write traffic goes through **Admin SDK API routes** (bypasses client rules) — fine for server paths, but client-side rules gaps still matter if the SDK is used from the browser.
- ILS staff limited portal is enforced mainly by **API + admin layout**, not by dedicated Firestore role docs on package collections.
- Keep root `firestore.rules` as the source of truth for deploys.

---

## Suggestions for tomorrow’s session (system health)

Tomorrow’s chat is framed as **system health**. Suggested focus order:

1. **Production vs local parity** — Confirm App Hosting / Functions deploy status, env secrets (Caspio, Resend, Drive, cron secrets), and that production is on the commits above for ALFT/ISP download + Sent-to-ILS behavior.
2. **ALFT/ISP regression pass (manual)** — Ready-to-send packet: edit → confirm → download (live answers, not stale archive); assert admin queue still shows until package send **or** manual ILS checkmark+date.
3. **Silent PDF path** — Spot-check `dummy-preview?silent=1` / iframe download; auth bypass in admin layout is easy to break during refactors.
4. **ILS Package Review (Veronica)** — Limited nav + decision/write path for `isIlsStaff` users.
5. **Firestore rules hygiene** — Decide whether to tighten MIF / `socialWorkers` / `emailLogs` to admin-only if those collections are still client-written; reconcile or delete stale `src/firestore.rules`.
6. **Auth / session health** — Staff login after password reset, portal isolation (admin vs SW vs ILS), app-access `system_settings`.
7. **Caspio sync health** — Cache freshness, webhook noise, CIN/MRN matching edge cases (leading zeros / `appDocsMatched: 0` style failures).
8. **Error & email surface** — Spot-check `emailLogs`, failed notifications, cron endpoints (`ils-weekly-list`, H2022 renewal-style jobs) with secrets present.
9. **Drive migration** — Only if needed: limited-folder scan before any large sync; don’t assume full 800+ migration is production-ready.
10. **Docs to open first in the new chat** — This file, then `ARCHITECTURE.md` §5–14, `RUNBOOK.md`, and recent `git log` on `main`. Prefer those over stale `.cursorrules` “pending” bullets where they disagree.

### Quick commands
```bash
npm run dev
npm run test:smoke
# Key pages: /admin/alft-tracker?managerActions=1
#            /admin/tools/isp-workflow
#            /admin/tools/isp-tracker
#            /admin/tools/alft-cover-sheet-package
#            /admin/ils-package-review
```

### Explicit non-goals unless requested
- Form separator production PDF pipeline  
- Committing/pushing without an explicit ask (“commit and push”)  
- MIF consolidator pushing CalAIM_Status / Kaiser_Status to Caspio (staff do this manually)  
- Drive full-fleet migration in one shot
