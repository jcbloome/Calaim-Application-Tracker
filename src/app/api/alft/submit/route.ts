import { NextRequest, NextResponse } from 'next/server';
import { sendAlftManagerWorkflowStageEmail, sendAlftUploadEmail } from '@/app/actions/send-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubmitBody = {
  idToken?: string;
  submissionMode?: string;
  officialPdfTemplateUrl?: string;
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
const JOHN_EMAIL = 'john@carehomefinders.com';

async function resolveUidByEmail(admin: any, adminDb: any, emailRaw: string): Promise<string> {
  const email = clean(emailRaw, 200).toLowerCase();
  if (!email) return '';

  try {
    const user = await admin.auth().getUserByEmail(email);
    return clean(user?.uid, 128);
  } catch {
    // ignore
  }

  try {
    const snap = await adminDb.collection('users').where('email', '==', email).limit(1).get();
    const doc = snap.docs?.[0];
    const data = doc?.data?.() as any;
    const uid = clean(data?.uid, 128) || clean(doc?.id, 128);
    return uid;
  } catch {
    return '';
  }
}

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
      return out;
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
    };
    const isPlanB = submissionMode === 'official_pdf_plan_b';
    // Digital form submissions don't require summary/actions text (the exactPacketAnswers is the record).
    if (!isPlanB && !isDigitalForm && (!alftForm.transitionSummary || !alftForm.requestedActions)) {
      return NextResponse.json({ success: false, error: 'Missing ALFT summary or requested actions' }, { status: 400 });
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

    const focusUrl = (id: string) => `/admin/alft-tracker?edit=${encodeURIComponent(id)}`;

    let assignedManagerName = '';
    let assignedManagerEmail = '';
    let assignedManagerUid = '';
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
        }
      } catch {
        // best-effort lookup only
      }
    }

    const fallbackManagerName = 'Deydry';
    const fallbackManagerEmail = 'deydry@carehomefinders.com';
    const primaryManagerName = assignedManagerName || fallbackManagerName;
    const primaryManagerEmail = assignedManagerEmail || fallbackManagerEmail;

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
        editableUids: uploaderUid ? [uploaderUid] : [],
        createdByUid: uploaderUid || null,
      },
      workflowStatus: 'awaiting_manager_review_pre_rn',
      workflowStage: 'submitted_by_sw_waiting_manager_review',
      workflowRouting: {
        nextStepKey: 'manager_review',
        nextStepLabel: 'ALFT Manager Review',
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
          workflowRouting: {
            nextStepKey: 'manager_review',
            nextStepLabel: 'ALFT Manager Review',
            nextRecipientName: primaryManagerName || null,
            nextRecipientEmail: primaryManagerEmail || null,
            finalReviewOwnerName: primaryManagerName || null,
            finalReviewOwnerEmail: primaryManagerEmail || null,
          },
          workflowSteps: {
            swInviteSent: true,
            swSubmittedSigned: true,
            managerReview: 'pending',
            rnReviewSignature: 'pending',
            pdfReady: false,
          },
          workflowStepsAt: {
            swSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
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

    const notifyTo = primaryManagerEmail;
    let emailSent = false;
    try {
      await sendAlftUploadEmail({
        to: notifyTo,
        memberName,
        uploadDate,
        kaiserMrn: kaiserMrn || '',
        uploaderName,
        uploaderEmail,
        intakeUrl: focusUrl(intakeId),
      });
      emailSent = true;
    } catch (e) {
      console.warn('[alft/submit] Email failed:', e);
    }

    let managerStage2EmailRecipients = 0;
    let managerStage2EmailSentCount = 0;
    // Manager email: SW submitted + signed, ready for first manager review.
    try {
      let managerEmails: Array<{ email: string; name: string }> = [];
      if (primaryManagerEmail) {
        managerEmails = [{
          email: primaryManagerEmail,
          name: primaryManagerName || 'Manager',
        }];
      } else {
        const managerUsersSnap = await adminDb
          .collection('users')
          .where('isKaiserAssignmentManager', '==', true)
          .limit(30)
          .get()
          .catch(() => null);
        managerEmails = (managerUsersSnap?.docs || [])
          .map((d: any) => ({
            email: clean((d.data() as any)?.email, 220).toLowerCase(),
            name: clean((d.data() as any)?.displayName, 160) || clean((d.data() as any)?.email, 220) || 'Manager',
          }))
          .filter((m: any) => Boolean(m.email));
      }
      if (!managerEmails.some((m) => m.email === JOHN_EMAIL)) {
        managerEmails.push({ email: JOHN_EMAIL, name: 'John' });
      }
      managerStage2EmailRecipients = managerEmails.length;

      if (managerEmails.length > 0) {
        const results = await Promise.all(
          managerEmails.map((manager: any) =>
            sendAlftManagerWorkflowStageEmail({
              to: manager.email,
              managerName: manager.name,
              memberName,
              mrn: kaiserMrn || medicalRecordNumber || undefined,
              stageLabel: 'Step 2/5 SW submitted + signed',
              nextAction: 'Review ALFT, return to SW if corrections are needed, or send forward to RN/signature phase. Final review owner remains the assigned ALFT manager for this member.',
              actionUrl: focusUrl(intakeId),
              triggeredBy: uploaderName,
            })
              .then(() => true)
              .catch(() => false)
          )
        );
        managerStage2EmailSentCount = results.filter(Boolean).length;
      }
    } catch {
      // best-effort only
    }

    try {
      const johnUid = await resolveUidByEmail(admin, adminDb, JOHN_EMAIL);
      if (johnUid) {
        await adminDb.collection('staff_notifications').add({
          userId: johnUid,
          recipientName: 'John',
          title: 'ALFT manager review item',
          message: `${memberName} • MRN ${kaiserMrn || medicalRecordNumber || '—'}\nSW submitted/signature complete and ready for your review.`,
          memberName,
          type: 'alft_manager_step_john',
          priority: 'Priority',
          status: 'Open',
          isRead: false,
          source: 'system',
          createdBy: uploaderUid,
          createdByName: uploaderName,
          senderName: uploaderName,
          senderId: uploaderUid,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          actionUrl: focusUrl(intakeId),
          intakeId,
          standaloneUploadId: intakeId,
        });
      }
    } catch {
      // best-effort only
    }

    let electronNotified = false;
    try {
      const settingsSnap = await adminDb.collection('system_settings').doc('review_notifications').get();
      const settings = settingsSnap.exists ? settingsSnap.data() : null;
      const globalEnabled = (settings as any)?.enabled === undefined ? true : Boolean((settings as any)?.enabled);
      const recipients = ((settings as any)?.recipients || {}) as Record<string, any>;

      const recipientUids: string[] = [];
      const recipientMetaByUid = new Map<string, any>();
      const collectRecipients = (predicate: (r: any) => boolean) => {
        Object.entries(recipients).forEach(([key, raw]) => {
          const r = raw || {};
          if (!Boolean(r?.enabled)) return;
          if (!predicate(r)) return;
          const uid = String(r?.uid || '').trim() || (!String(key).includes('@') ? String(key).trim() : '');
          if (!uid) return;
          if (!recipientUids.includes(uid)) recipientUids.push(uid);
          recipientMetaByUid.set(uid, r);
        });
      };
      if (globalEnabled) {
        // New ALFT workflow: route to ALFT Reviewer first.
        collectRecipients((r) => Boolean(r?.alftReviewer));
        // Backward compatibility: if no reviewer is configured, fall back to legacy ALFT recipients.
        if (recipientUids.length === 0) {
          collectRecipients((r) => Boolean(r?.alft));
        }
      }

      // Backward-compatible fallback (previous behavior) if no recipients configured.
      if (recipientUids.length === 0) {
        const targetUid = await resolveUidByEmail(admin, adminDb, notifyTo);
        if (targetUid) recipientUids.push(targetUid);
      }

      if (recipientUids.length > 0) {
        await Promise.all(
          recipientUids.map((uid) => {
            const meta = recipientMetaByUid.get(uid) || {};
            const recipientName = String(meta?.name || meta?.email || 'Staff').trim() || 'Staff';
            return adminDb.collection('staff_notifications').add({
              userId: uid,
              recipientName,
              title: 'ALFT Tool uploaded',
              message: `${memberName} • ${uploaderName} • ${uploadDate}${isPlanB ? ' • Official PDF (Plan B)' : ''}`,
              memberName,
              type: 'alft_upload',
              priority: 'Priority',
              status: 'Open',
              isRead: false,
              source: 'sw-portal',
              createdBy: uploaderUid,
              createdByName: uploaderName,
              senderName: uploaderName,
              senderId: uploaderUid,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              actionUrl: focusUrl(intakeId),
              intakeId,
              standaloneUploadId: intakeId,
              alftUploadDate: uploadDate || null,
            });
          })
        );
        electronNotified = true;
      }
    } catch (e) {
      console.warn('[alft/submit] Electron notify failed:', e);
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

