import { NextRequest, NextResponse } from 'next/server';
import { sendAlftUploadEmail } from '@/app/actions/send-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubmitBody = {
  idToken?: string;
  uploader?: { firstName?: string; lastName?: string; email?: string; displayName?: string };
  uploadDate?: string; // YYYY-MM-DD (entered by SW)
  member?: {
    name?: string;
    firstName?: string;
    lastName?: string;
    healthPlan?: string;
    medicalRecordNumber?: string;
    mediCalNumber?: string;
    kaiserMrn?: string;
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
  files?: Array<{ fileName?: string; downloadURL?: string; storagePath?: string }>;
};

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);
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

    const files = Array.isArray(body?.files) ? body.files : [];
    const normalizedFiles = files
      .map((f) => ({
        fileName: clean(f?.fileName, 180),
        downloadURL: clean(f?.downloadURL, 1000),
        storagePath: clean(f?.storagePath, 800),
      }))
      .filter((f) => Boolean(f.fileName && f.downloadURL && f.storagePath))
      .slice(0, 10);
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
      exactPacketAnswers: cleanDeep(body?.alftForm?.exactPacketAnswers || null),
      facilityName: clean(body?.alftForm?.facilityName, 180) || null,
      priorityLevel: clean(body?.alftForm?.priorityLevel, 40) || 'Routine',
      transitionSummary: clean(body?.alftForm?.transitionSummary, 4000),
      barriersAndRisks: clean(body?.alftForm?.barriersAndRisks, 4000) || null,
      requestedActions: clean(body?.alftForm?.requestedActions, 4000),
      additionalNotes: clean(body?.alftForm?.additionalNotes, 4000) || null,
    };
    if (!alftForm.transitionSummary || !alftForm.requestedActions) {
      return NextResponse.json({ success: false, error: 'Missing ALFT summary or requested actions' }, { status: 400 });
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
    const medicalRecordNumberRaw = clean(body?.member?.medicalRecordNumber, 80);
    const mediCalNumberRaw = clean(body?.member?.mediCalNumber, 80);
    const kaiserMrnRaw = clean(body?.member?.kaiserMrn, 80);
    const medicalRecordNumber = medicalRecordNumberRaw || kaiserMrnRaw || mediCalNumberRaw;

    const planLower = healthPlan.toLowerCase();
    const mediCalNumber =
      mediCalNumberRaw || (medicalRecordNumber && planLower.includes('health net') ? medicalRecordNumber : '');
    const kaiserMrn =
      kaiserMrnRaw || (medicalRecordNumber && planLower.includes('kaiser') ? medicalRecordNumber : '');

    const focusUrl = (id: string) => `/admin/alft-tracker?focus=${encodeURIComponent(id)}`;

    const ref = await adminDb.collection('standalone_upload_submissions').add({
      status: 'pending',
      source: 'sw-portal',
      toolCode: 'ALFT',
      documentType: 'ALFT Tool',
      files: normalizedFiles,
      alftForm,
      uploaderUid,
      uploaderEmail: uploaderEmail || null,
      uploaderName,
      memberName,
      memberFirstName,
      memberLastName,
      memberNameSearch: `${memberLastName.toLowerCase()}|${memberFirstName.toLowerCase()}|${memberName.toLowerCase()}`.slice(0, 300),
      healthPlan,
      medicalRecordNumber: medicalRecordNumber || null,
      mediCalNumber: mediCalNumber || null,
      kaiserMrn: kaiserMrn || null,
      alftUploadDate: uploadDate || null,
      workflowStatus: 'staff_review',
      workflowStage: 'submitted_by_sw',
      workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const intakeId = ref.id;

    const notifyTo = 'john@carehomefinders.com';
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

    let electronNotified = false;
    try {
      const settingsSnap = await adminDb.collection('system_settings').doc('review_notifications').get();
      const settings = settingsSnap.exists ? settingsSnap.data() : null;
      const globalEnabled = (settings as any)?.enabled === undefined ? true : Boolean((settings as any)?.enabled);
      const recipients = ((settings as any)?.recipients || {}) as Record<string, any>;

      const recipientUids: string[] = [];
      const recipientMetaByUid = new Map<string, any>();
      if (globalEnabled) {
        Object.entries(recipients).forEach(([key, raw]) => {
          const r = raw || {};
          if (!Boolean(r?.enabled)) return;
          if (!Boolean(r?.alft)) return;
          const uid = String(r?.uid || '').trim() || (!String(key).includes('@') ? String(key).trim() : '');
          if (!uid) return;
          if (!recipientUids.includes(uid)) recipientUids.push(uid);
          recipientMetaByUid.set(uid, r);
        });
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
              message: `${memberName} • ${uploaderName} • ${uploadDate}`,
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
        },
        { merge: true }
      );
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true, id: intakeId, emailSent, electronNotified });
  } catch (error: any) {
    console.error('[alft/submit] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit ALFT upload', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

