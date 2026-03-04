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
    healthPlan?: string;
    medicalRecordNumber?: string;
    mediCalNumber?: string;
    kaiserMrn?: string;
  };
  files?: Array<{ fileName?: string; downloadURL?: string; storagePath?: string }>;
};

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

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

    const memberName = clean(body?.member?.name, 140);
    const uploadDate = clean(body?.uploadDate, 20);
    const uploaderDisplayName = clean(body?.uploader?.displayName, 140);
    if (!memberName || !uploadDate || !uploaderDisplayName) {
      return NextResponse.json(
        { success: false, error: 'Missing member name, upload date, or social worker name' },
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
    if (normalizedFiles.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing uploaded files' }, { status: 400 });
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

    const focusUrl = (id: string) => `/admin/standalone-uploads?focus=${encodeURIComponent(id)}&filter=alft`;

    const ref = await adminDb.collection('standalone_upload_submissions').add({
      status: 'pending',
      source: 'sw-portal',
      toolCode: 'ALFT',
      documentType: 'ALFT Tool',
      files: normalizedFiles,
      uploaderUid,
      uploaderEmail: uploaderEmail || null,
      uploaderName,
      memberName,
      healthPlan,
      medicalRecordNumber: medicalRecordNumber || null,
      mediCalNumber: mediCalNumber || null,
      kaiserMrn: kaiserMrn || null,
      alftUploadDate: uploadDate || null,
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
      const targetUid = await resolveUidByEmail(admin, adminDb, notifyTo);
      if (targetUid) {
        await adminDb.collection('staff_notifications').add({
          userId: targetUid,
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
          alftUploadDate: uploadDate || null,
        });
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

