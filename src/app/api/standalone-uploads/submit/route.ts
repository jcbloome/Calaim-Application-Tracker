import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubmitBody = {
  idToken?: string;
  uploader?: { firstName?: string; lastName?: string };
  member?: {
    name?: string;
    birthdate?: string; // YYYY-MM-DD
    healthPlan?: string;
    mediCalNumber?: string;
    kaiserMrn?: string;
  };
  documentType?: string;
  files?: Array<{ fileName?: string; downloadURL?: string; storagePath?: string }>;
};

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as SubmitBody;
    const idToken = clean(body?.idToken, 5000);
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    }

    const documentType = clean(body?.documentType, 120);
    if (!documentType) {
      return NextResponse.json({ success: false, error: 'Missing documentType' }, { status: 400 });
    }

    const memberName = clean(body?.member?.name, 140);
    const birthdate = clean(body?.member?.birthdate, 20);
    if (!memberName || !birthdate) {
      return NextResponse.json({ success: false, error: 'Missing member name or birthdate' }, { status: 400 });
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
    if (!uploaderUid) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    const uploaderFirst = clean(body?.uploader?.firstName, 80);
    const uploaderLast = clean(body?.uploader?.lastName, 80);
    const uploaderName = clean(`${uploaderFirst} ${uploaderLast}`.trim(), 140) || uploaderEmail || 'User';

    const healthPlan = clean(body?.member?.healthPlan, 40) || 'Other/Unknown';
    const mediCalNumber = clean(body?.member?.mediCalNumber, 80);
    const kaiserMrn = clean(body?.member?.kaiserMrn, 80);

    const ref = await adminDb.collection('standalone_upload_submissions').add({
      status: 'pending',
      source: 'printable-package',
      documentType,
      files: normalizedFiles,
      uploaderUid,
      uploaderEmail: uploaderEmail || null,
      uploaderName,
      memberName,
      memberBirthdate: birthdate,
      healthPlan,
      mediCalNumber: mediCalNumber || null,
      kaiserMrn: kaiserMrn || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (error: any) {
    console.error('[standalone-uploads/submit] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit upload metadata', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

