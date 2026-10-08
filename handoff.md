# Handoff — CalAIM Application Tracker

**Date:** 2026-10-06 (previous handoff 2026-10-02)  
**Branch:** `main` (synced with `origin/main` at handoff)  
**Latest commits:** see “Changes 2026-10-06” below, then “Changes 2026-10-02”  
**Dev server:** `npm run dev` → typically `http://localhost:3000`  
**Deeper reference:** `ARCHITECTURE.md`, `RUNBOOK.md`, `PROJECT_LOG.md`

---

## Changes 2026-10-06

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
- `src/app/api/members/route.ts`: search also matches `Client_ID2 = x` and `MCP_CIN LIKE` (falls back to name-only on Caspio 400); returns `memberMrn`. **Still has no auth (pre-existing).**
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
- Residual: uploads done by staff on a family's app still save a tokened `downloadURL` in the application doc the family can read (not shown in UI). Follow-up: stop storing `downloadURL` once admin pages all open via the new route.

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
- Full `tsc` has many pre-existing errors; use a temporary `tsconfig` that includes only touched files for targeted checks.

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
