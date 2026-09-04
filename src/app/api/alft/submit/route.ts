import { NextRequest, NextResponse } from 'next/server';
import { sendAlftUploadEmail } from '@/app/actions/send-email';
import {
  ispWorkflowActionUrl,
  notifyAlftWorkflowParties,
} from '@/lib/alft-workflow-notify';
import { normalizeAlftAnswersCapitalization } from '@/lib/alft-proper-case';
import { applyAlftCognitiveFollowupGate } from '@/lib/alft-form-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PersonRef = { uid?: string; name?: string; email?: string };

type SubmitBody = {
  idToken?: string;
  submissionMode?: string;
  officialPdfTemplateUrl?: string;
  /** Connections staff who receives the packet after SW submit (first review + final owner). */
  firstReviewer?: PersonRef;
  /** RN who reviews/signs after SW signature (default Leslie). */
  assignedRn?: PersonRef;
  uploader?: { firstName?: string; lastName?: string; email?: string; displayName?: string };
  uploadDate?: string; // YYYY-MM-DD (entered by SW)
  member?: {
    id?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    healthPlan?: string;
    medicalRecordNumber?: string;
    mediCalNumber?: string;
    kaiserMrn?: string;
    expectedVisitDate?: string;
    prefillSourceMode?: 'cs_summary_app' | 'caspio_selected_fields' | string;
    prefillSourceLabel?: string;
  };
  alftForm?: {
    formVersion?: string;
    stage?: string;
    headerInformation?: Record<string, unknown>;
    demographics?: Record<string, unknown>;
    physicalLocation?: Record<string, unknown>;
    homeAddress?: Record<string, unknown>;
    mailingAddress?: Record<string, unknown>;
    screening?: Record<string, unknown>;
    clinicalAssessment?: Record<string, unknown>;
    stage3Assessment?: Record<string, unknown>;
    exactPacketAnswers?: Record<string, unknown>;
    facilityName?: string;
    priorityLevel?: string;
    transitionSummary?: string;
    barriersAndRisks?: string;
    requestedActions?: string;
    additionalNotes?: string;
    medListAttachment?: {
      id?: string;
      fileName?: string;
      downloadURL?: string;
      storagePath?: string;
      contentType?: string;
      uploadedAtIso?: string;
      uploadedByName?: string | null;
      uploadedByEmail?: string | null;
    } | null;
  };
  files?: Array<{ fileName?: string; downloadURL?: string; storagePath?: string; uploadedAtIso?: string }>;
};

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);
const AGENCY_NAME = 'Connections Care Home Consultants';
const cleanDeep = (value: unknown): any => {
  if (typeof value === 'string') return clean(value, 4000);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => cleanDeep(item));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    Object.entries(value as Record<string, unknown>)
      .slice(0, 200)
      .forEach(([k, v]) => {
        out[clean(k, 80)] = cleanDeep(v);
      });
    return out;
  }
  return null;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as SubmitBody;
    const idToken = clean(body?.idToken, 5000);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });

    const memberId = clean(body?.member?.id, 120);
    const memberFirstName = clean(body?.member?.firstName, 80);
    const memberLastName = clean(body?.member?.lastName, 80);
    const memberNameRaw = clean(body?.member?.name, 140);
    const memberName = clean(`${memberFirstName} ${memberLastName}`.replace(/\s+/g, ' ').trim(), 140) || memberNameRaw;
    const uploadDate = clean(body?.uploadDate, 20);
    const uploaderDisplayName = clean(body?.uploader?.displayName, 140);
    if (!memberName || !memberFirstName || !memberLastName || !uploadDate || !uploaderDisplayName) {
      return NextResponse.json(
        { success: false, error: 'Missing member first/last name, upload date, or social worker name' },
        { status: 400 }
      );
    }
    if (uploaderDisplayName.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Social worker name must be a real name (not email)' },
        { status: 400 }
      );
    }

    const submissionMode = clean(body?.submissionMode, 80) || 'custom';
    const isDigitalForm = submissionMode === 'digital_form';
    const officialPdfTemplateUrl = clean(body?.officialPdfTemplateUrl, 1200) || null;

    const files = Array.isArray(body?.files) ? body.files : [];
    const normalizedFiles = files
      .map((f) => ({
        fileName: clean(f?.fileName, 180),
        downloadURL: clean(f?.downloadURL, 1000),
        storagePath: clean(f?.storagePath, 800),
        uploadedAtIso: clean(f?.uploadedAtIso, 80) || new Date().toISOString(),
      }))
      .filter((f) => Boolean(f.fileName && f.downloadURL && f.storagePath))
      .slice(0, 10);
    // Digital form submissions don't require an uploaded file — the form data itself is the record.
    if (normalizedFiles.length === 0 && !isDigitalForm) {
      return NextResponse.json({ success: false, error: 'At least one uploaded ALFT file is required' }, { status: 400 });
    }
    const sanitizedExactPacketAnswers = (() => {
      const raw = cleanDeep(body?.alftForm?.exactPacketAnswers || null);
      const out =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? ({ ...(raw as Record<string, unknown>) } as Record<string, unknown>)
          : {};
      out.p1_agency = AGENCY_NAME;
      return applyAlftCognitiveFollowupGate(
        normalizeAlftAnswersCapitalization(out as Record<string, string | string[]>)
      ) as Record<string, unknown>;
    })();

    const alftForm = {
      formVersion: clean(body?.alftForm?.formVersion, 40) || 'placeholder-v1',
      stage: clean(body?.alftForm?.stage, 40) || null,
      headerInformation: cleanDeep(body?.alftForm?.headerInformation || null),
      demographics: cleanDeep(body?.alftForm?.demographics || null),
      physicalLocation: cleanDeep(body?.alftForm?.physicalLocation || null),
      homeAddress: cleanDeep(body?.alftForm?.homeAddress || null),
      mailingAddress: cleanDeep(body?.alftForm?.mailingAddress || null),
      screening: cleanDeep(body?.alftForm?.screening || null),
      clinicalAssessment: cleanDeep(body?.alftForm?.clinicalAssessment || null),
      stage3Assessment: cleanDeep(body?.alftForm?.stage3Assessment || null),
      exactPacketAnswers: sanitizedExactPacketAnswers,
      facilityName: clean(body?.alftForm?.facilityName, 180) || null,
      priorityLevel: clean(body?.alftForm?.priorityLevel, 40) || 'Routine',
      transitionSummary: clean(body?.alftForm?.transitionSummary, 4000),
      barriersAndRisks: clean(body?.alftForm?.barriersAndRisks, 4000) || null,
      requestedActions: clean(body?.alftForm?.requestedActions, 4000),
      additionalNotes: clean(body?.alftForm?.additionalNotes, 4000) || null,
      // SW signs on submit — first-pass staff approval can go straight to RN.
      swSignature: clean(body?.alftForm?.swSignature, 200) || null,
      swSignedAt: clean(body?.alftForm?.swSignedAt, 80) || null,
      // Drawn pad required at submit; flag only (do not persist raw PNG on intake doc).
      swSignatureDrawn: false as boolean,
      medListAttachment: (() => {
        const raw = body?.alftForm?.medListAttachment;
        if (!raw || typeof raw !== 'object') return null;
        const downloadURL = clean((raw as any).downloadURL, 2000);
        const fileName = clean((raw as any).fileName, 240);
        if (!downloadURL || !fileName) return null;
        return {
          id: clean((raw as any).id, 80) || null,
          fileName,
          downloadURL,
          storagePath: clean((raw as any).storagePath, 900) || null,
          contentType: clean((raw as any).contentType, 120) || null,
          uploadedAtIso: clean((raw as any).uploadedAtIso, 80) || null,
          uploadedByName: clean((raw as any).uploadedByName, 160) || null,
          uploadedByEmail: clean((raw as any).uploadedByEmail, 220) || null,
        };
      })(),
    };
    const swSignaturePngDataUrl = clean(body?.alftForm?.swSignaturePngDataUrl, 250000);
    const isPlanB = submissionMode === 'official_pdf_plan_b';
    // Digital form submissions don't require summary/actions text (the exactPacketAnswers is the record).
    if (!isPlanB && !isDigitalForm && (!alftForm.transitionSummary || !alftForm.requestedActions)) {
      return NextResponse.json({ success: false, error: 'Missing ALFT summary or requested actions' }, { status: 400 });
    }
    // SW electronic signature: typed/auto name + attestation (drawn pad optional).
    if (isDigitalForm && !alftForm.swSignature) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Social worker signature is required before submitting to admin review. Confirm your name and approve the electronic signature, then submit.',
        },
        { status: 400 }
      );
    }
    const hasDrawnPng =
      Boolean(swSignaturePngDataUrl) && swSignaturePngDataUrl.startsWith('data:image/png');
    const electronicApproved = Boolean((body as any)?.alftForm?.swElectronicSignatureApproved);
    const assessmentDateRaw = clean(String(sanitizedExactPacketAnswers?.p1_assessment_date || ''), 40);
    const assessmentDateNormalized = (() => {
      const raw = assessmentDateRaw;
      if (!raw) return '';
      const isoLike = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (isoLike) {
        return `${isoLike[2].padStart(2, '0')}/${isoLike[3].padStart(2, '0')}/${isoLike[1]}`;
      }
      const usSlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (usSlash) {
        return `${usSlash[1].padStart(2, '0')}/${usSlash[2].padStart(2, '0')}/${usSlash[3]}`;
      }
      const usDash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (usDash) {
        return `${usDash[1].padStart(2, '0')}/${usDash[2].padStart(2, '0')}/${usDash[3]}`;
      }
      return raw;
    })();
    const assessmentDateValid = (() => {
      const m = assessmentDateNormalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) return false;
      const month = Number(m[1]);
      const day = Number(m[2]);
      const year = Number(m[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return false;
      const dt = new Date(year, month - 1, day);
      return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
    })();
    if (isDigitalForm && !assessmentDateValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'ISP Assessment Date is required in MM/DD/YYYY format before submitting to admin review.',
        },
        { status: 400 }
      );
    }
    if (isDigitalForm && assessmentDateNormalized) {
      sanitizedExactPacketAnswers.p1_assessment_date = assessmentDateNormalized;
    }
    if (isDigitalForm) {
      if (!alftForm.swSignedAt) alftForm.swSignedAt = new Date().toISOString();
      alftForm.swSignatureDrawn = hasDrawnPng;
      alftForm.swSignatureMethod = hasDrawnPng ? 'drawn' : 'electronic_attestation';
      alftForm.swElectronicSignatureApproved = electronicApproved || true;
      if (!clean(String(sanitizedExactPacketAnswers?.p14_print_name || ''), 200)) {
        sanitizedExactPacketAnswers.p14_print_name = clean(alftForm.swSignature, 200);
      }
      if (!clean(String(sanitizedExactPacketAnswers?.p14_sw_signed_at || ''), 80)) {
        sanitizedExactPacketAnswers.p14_sw_signed_at = alftForm.swSignedAt;
      }
      if (!clean(String(sanitizedExactPacketAnswers?.p14_date || ''), 40)) {
        sanitizedExactPacketAnswers.p14_date = String(alftForm.swSignedAt).slice(0, 10);
      }
      const signerLabel =
        clean(String(sanitizedExactPacketAnswers?.p14_print_name || alftForm.swSignature || ''), 200) ||
        'Social Worker';
      const signedAtLabel = (() => {
        try {
          return new Date(String(alftForm.swSignedAt)).toLocaleString();
        } catch {
          return String(alftForm.swSignedAt);
        }
      })();
      sanitizedExactPacketAnswers.p14_electronic_notice = `Electronically signed by ${signerLabel} on ${signedAtLabel}`;
      alftForm.exactPacketAnswers = sanitizedExactPacketAnswers;
    }
    if (isPlanB) {
      if (!alftForm.transitionSummary) alftForm.transitionSummary = 'Plan B upload: completed official ALFT PDF submitted by social worker.';
      if (!alftForm.requestedActions) alftForm.requestedActions = 'Review uploaded official ALFT PDF and continue ALFT workflow.';
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uploaderUid = clean(decoded?.uid, 128);
    const uploaderEmail = clean(decoded?.email, 200).toLowerCase();
    if (!uploaderUid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    const uploaderFirst = clean(body?.uploader?.firstName, 80);
    const uploaderLast = clean(body?.uploader?.lastName, 80);
    const uploaderName =
      uploaderDisplayName ||
      clean(`${uploaderFirst} ${uploaderLast}`.trim(), 140) ||
      uploaderEmail ||
      'Social Worker';

    const healthPlan = clean(body?.member?.healthPlan, 40) || 'Kaiser';
    const rawPrefillSourceMode = clean(body?.member?.prefillSourceMode, 60).toLowerCase();
    const prefillSourceMode =
      rawPrefillSourceMode === 'cs_summary_app' || rawPrefillSourceMode === 'caspio_selected_fields'
        ? rawPrefillSourceMode
        : '';
    const prefillSourceLabel = clean(body?.member?.prefillSourceLabel, 120);
    const medicalRecordNumberRaw = clean(body?.member?.medicalRecordNumber, 80);
    const mediCalNumberRaw = clean(body?.member?.mediCalNumber, 80);
    const kaiserMrnRaw = clean(body?.member?.kaiserMrn, 80);
    const expectedVisitDate = clean(body?.member?.expectedVisitDate, 40);
    const medicalRecordNumber = medicalRecordNumberRaw || kaiserMrnRaw || mediCalNumberRaw;

    const planLower = healthPlan.toLowerCase();
    const mediCalNumber =
      mediCalNumberRaw || (medicalRecordNumber && planLower.includes('health net') ? medicalRecordNumber : '');
    const kaiserMrn =
      kaiserMrnRaw || (medicalRecordNumber && planLower.includes('kaiser') ? medicalRecordNumber : '');

    let assignedManagerName = '';
    let assignedManagerEmail = '';
    let assignedManagerUid = '';
    let assignedStaffName = '';
    let assignedStaffEmail = '';
    let assignedStaffUid = '';
    let assignedRnName = '';
    let assignedRnEmail = '';
    let assignedRnUid = '';
    if (memberId) {
      try {
        const assignmentSnap = await adminDb.collection('alft_assignments').doc(memberId).get();
        const assignment = assignmentSnap.exists ? (assignmentSnap.data() as any) : null;
        if (assignment) {
          assignedManagerName = clean(
            assignment?.alftManagerName ||
            assignment?.managerName ||
            assignment?.assignedManagerName ||
            assignment?.assignedByName,
            160
          );
          assignedManagerEmail = clean(
            assignment?.alftManagerEmail ||
            assignment?.managerEmail ||
            assignment?.assignedManagerEmail ||
            assignment?.assignedByEmail,
            220
          ).toLowerCase();
          assignedManagerUid = clean(
            assignment?.alftManagerUid ||
            assignment?.managerUid ||
            assignment?.assignedManagerUid,
            128
          );
          assignedStaffName = clean(assignment?.alftStaffName || assignment?.firstReviewerName, 160);
          assignedStaffEmail = clean(assignment?.alftStaffEmail || assignment?.firstReviewerEmail, 220).toLowerCase();
          assignedStaffUid = clean(assignment?.alftStaffUid || assignment?.firstReviewerUid, 128);
          assignedRnName = clean(assignment?.alftRnName || assignment?.assignedRnName, 160);
          assignedRnEmail = clean(assignment?.alftRnEmail || assignment?.assignedRnEmail, 220).toLowerCase();
          assignedRnUid = clean(assignment?.alftRnUid || assignment?.assignedRnUid, 128);
        }
      } catch {
        // best-effort lookup only
      }
    }

    // Explicit ISP Assignment routing overrides assignment defaults.
    const bodyStaffName = clean(body?.firstReviewer?.name, 160);
    const bodyStaffEmail = clean(body?.firstReviewer?.email, 220).toLowerCase();
    const bodyStaffUid = clean(body?.firstReviewer?.uid, 128);
    if (bodyStaffEmail || bodyStaffUid) {
      assignedStaffName = bodyStaffName || assignedStaffName;
      assignedStaffEmail = bodyStaffEmail || assignedStaffEmail;
      assignedStaffUid = bodyStaffUid || assignedStaffUid;
    }
    const bodyRnName = clean(body?.assignedRn?.name, 160);
    const bodyRnEmail = clean(body?.assignedRn?.email, 220).toLowerCase();
    const bodyRnUid = clean(body?.assignedRn?.uid, 128);
    if (bodyRnEmail || bodyRnUid) {
      assignedRnName = bodyRnName || assignedRnName || 'Leslie';
      assignedRnEmail = bodyRnEmail || assignedRnEmail || 'leslie@carehomefinders.com';
      assignedRnUid = bodyRnUid || assignedRnUid;
    }

    // First reviewer staff is the person who receives SW submit + owns final review.
    if (assignedStaffEmail) {
      assignedManagerName = assignedStaffName || assignedManagerName;
      assignedManagerEmail = assignedStaffEmail;
      assignedManagerUid = assignedStaffUid || assignedManagerUid;
    }

    const fallbackManagerName = 'Deydry';
    const fallbackManagerEmail = 'deydry@carehomefinders.com';
    const primaryManagerName = assignedManagerName || fallbackManagerName;
    const primaryManagerEmail = assignedManagerEmail || fallbackManagerEmail;
    const collaborationUids = Array.from(
      new Set([uploaderUid, assignedStaffUid, assignedRnUid].filter(Boolean))
    );

    const ref = await adminDb.collection('standalone_upload_submissions').add({
      status: 'pending',
      source: 'sw-portal',
      toolCode: 'ALFT',
      documentType: 'ALFT Tool',
      files: normalizedFiles,
      alftForm,
      submissionMode,
      officialPdfTemplateUrl,
      uploaderUid,
      uploaderEmail: uploaderEmail || null,
      uploaderName,
      memberId: memberId || null,
      memberName,
      prefillSourceMode: prefillSourceMode || null,
      prefillSourceLabel:
        prefillSourceLabel ||
        (prefillSourceMode === 'cs_summary_app'
          ? 'App CS Summary'
          : prefillSourceMode === 'caspio_selected_fields'
            ? 'Caspio selected fields'
            : null),
      memberFirstName,
      memberLastName,
      memberNameSearch: `${memberLastName.toLowerCase()}|${memberFirstName.toLowerCase()}|${memberName.toLowerCase()}`.slice(0, 300),
      healthPlan,
      medicalRecordNumber: medicalRecordNumber || null,
      mediCalNumber: mediCalNumber || null,
      kaiserMrn: kaiserMrn || null,
      alftUploadDate: uploadDate || null,
      alftExpectedVisitDate: expectedVisitDate || null,
      // Foundation for collaborative ALFT editing by SW, staff, RN, and admins.
      alftCollaboration: {
        allowAllPartiesEdit: true,
        editableRoleKeys: ['social_worker', 'staff', 'rn', 'admin', 'super_admin'],
        editableUids: collaborationUids,
        createdByUid: uploaderUid || null,
      },
      alftStaffUid: assignedStaffUid || null,
      alftStaffName: assignedStaffName || primaryManagerName || null,
      alftStaffEmail: assignedStaffEmail || primaryManagerEmail || null,
      alftStaffAssignedAt: assignedStaffEmail
        ? admin.firestore.FieldValue.serverTimestamp()
        : null,
      alftRnUid: assignedRnUid || null,
      alftRnName: assignedRnName || null,
      alftRnEmail: assignedRnEmail || null,
      alftRnAssignedAt: assignedRnEmail ? admin.firestore.FieldValue.serverTimestamp() : null,
      workflowStatus: 'awaiting_manager_review_pre_rn',
      workflowStage: 'submitted_by_sw_waiting_manager_review',
      workflowRouting: {
        nextStepKey: 'manager_review',
        nextStepLabel: 'Connections Staff First Review',
        nextRecipientName: primaryManagerName || null,
        nextRecipientEmail: primaryManagerEmail || null,
        finalReviewOwnerName: primaryManagerName || null,
        finalReviewOwnerEmail: primaryManagerEmail || null,
      },
      assignedManager: {
        uid: assignedManagerUid || null,
        name: primaryManagerName || null,
        email: primaryManagerEmail || null,
      },
      workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (memberId) {
      await adminDb.collection('alft_assignments').doc(memberId).set(
        {
          expectedVisitDate: expectedVisitDate || null,
          alftExpectedVisitDate: expectedVisitDate || null,
          status: 'submitted',
          workflowStatus: 'awaiting_manager_review_pre_rn',
          workflowStage: 'submitted_by_sw_waiting_manager_review',
          needsSwRevision: false,
          needsStaffRevision: false,
          needsRnRevision: false,
          returnedToSwReason: null,
          swFormDraft: admin.firestore.FieldValue.delete(),
          workflowRouting: {
            nextStepKey: 'manager_review',
            nextStepLabel: 'Connections Staff First Review',
            nextRecipientName: primaryManagerName || null,
            nextRecipientEmail: primaryManagerEmail || null,
            finalReviewOwnerName: primaryManagerName || null,
            finalReviewOwnerEmail: primaryManagerEmail || null,
          },
          alftStaffUid: assignedStaffUid || null,
          alftStaffName: assignedStaffName || primaryManagerName || null,
          alftStaffEmail: assignedStaffEmail || primaryManagerEmail || null,
          alftRnUid: assignedRnUid || null,
          alftRnName: assignedRnName || null,
          alftRnEmail: assignedRnEmail || null,
          workflowSteps: {
            swInviteSent: true,
            swSubmittedSigned: true,
            managerReview: 'pending',
            rnReviewSignature: 'pending',
            pdfReady: false,
          },
          workflowStepsAt: {
            swSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
            swSubmittedSignedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          submittedAt: admin.firestore.FieldValue.serverTimestamp(),
          expectedVisitDateUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          expectedVisitDateUpdatedByUid: uploaderUid,
          expectedVisitDateUpdatedByName: uploaderName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      ).catch(() => null);
    }

    const intakeId = ref.id;
    if (memberId) {
      await adminDb
        .collection('alft_assignments')
        .doc(memberId)
        .set(
          {
            latestIntakeId: intakeId,
            ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion({
              event: 'sw_submitted_signed',
              atIso: new Date().toISOString(),
              byName: uploaderName || null,
              byEmail: uploaderEmail || null,
              intakeId,
            }),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => null);
    }
    const actionUrl = ispWorkflowActionUrl(intakeId);
    const notifyTo = primaryManagerEmail;
    const mrnLabel = kaiserMrn || medicalRecordNumber || '';

    // Primary upload email to assigned ALFT first reviewer.
    let emailSent = false;
    try {
      await sendAlftUploadEmail({
        to: notifyTo,
        memberName,
        uploadDate,
        kaiserMrn: kaiserMrn || '',
        uploaderName,
        uploaderEmail,
        intakeUrl: actionUrl,
      });
      emailSent = true;
    } catch (e) {
      console.warn('[alft/submit] Email failed:', e);
    }

    // Assigned reviewer + all ALFT ISP Reviewers + John: stage email + in-app notifications.
    let managerStage2EmailRecipients = 0;
    let managerStage2EmailSentCount = 0;
    let electronNotified = false;
    try {
      const partyResult = await notifyAlftWorkflowParties({
        admin,
        adminDb,
        intakeId,
        memberName,
        mrn: mrnLabel || undefined,
        title: 'ALFT ready for first review',
        message: `${memberName} • MRN ${mrnLabel || '—'}\n${uploaderName} submitted the ISP/ALFT. Open ALFT Detail Tracker to review.`,
        type: 'alft_upload',
        stageLabel: 'MSW submitted — ready for ALFT staff review',
        nextAction:
          'Open ALFT Detail Tracker (ready queue), review the member ALFT, request edits from the MSW if needed, or approve and send to RN (SW already signed on submit).',
        triggeredBy: uploaderName,
        assignedStaff: {
          uid: assignedStaffUid || assignedManagerUid || undefined,
          email: primaryManagerEmail || undefined,
          name: primaryManagerName || 'ALFT Reviewer',
        },
        includeAlftReviewers: true,
        sendEmails: true,
        actionUrl,
        createdBy: uploaderUid,
        createdByName: uploaderName,
      });
      managerStage2EmailRecipients = partyResult.recipients.length;
      managerStage2EmailSentCount = partyResult.emailed;
      electronNotified = partyResult.notified > 0;
    } catch (e) {
      console.warn('[alft/submit] workflow party notify failed:', e);
    }

    try {
      await adminDb.collection('standalone_upload_submissions').doc(intakeId).set(
        {
          notifications: {
            emailTo: notifyTo,
            emailSent,
            electronNotified,
            lastNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          workflowEmailStatus: {
            managerStep2Recipients: managerStage2EmailRecipients,
            managerStep2SentCount: managerStage2EmailSentCount,
            managerStep2EmailSentAt:
              managerStage2EmailSentCount > 0 ? admin.firestore.FieldValue.serverTimestamp() : null,
          },
        },
        { merge: true }
      );
    } catch {
      // ignore
    }

    // Caspio client note: RN/MSW visit submitted (ISP/ALFT signed & submitted) — same table as pathway notes.
    try {
      const { appendCaspioClientNote } = await import('@/lib/caspio-client-notes');
      const visitDate = expectedVisitDate || '';
      await appendCaspioClientNote({
        clientId2: memberId,
        comments: [
          'RN/MSW visit submitted (ISP/ALFT submitted and signed by social worker).',
          `Member: ${memberName || memberId}.`,
          visitDate ? `Expected visit date: ${visitDate}.` : '',
          `Submitted by: ${uploaderName || uploaderEmail || '—'}.`,
          `Intake: ${intakeId}.`,
        ]
          .filter(Boolean)
          .join(' '),
        assignedStaffName: uploaderName || undefined,
        sourceTag: 'alft-visit-submitted',
      });
    } catch (noteErr) {
      console.warn('[alft/submit] Caspio note failed:', noteErr);
    }

    return NextResponse.json({
      success: true,
      id: intakeId,
      emailSent,
      electronNotified,
      nextInLine: {
        role: 'ALFT Manager Review',
        name: primaryManagerName || null,
        email: primaryManagerEmail || null,
      },
    });
  } catch (error: any) {
    console.error('[alft/submit] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit ALFT upload', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

