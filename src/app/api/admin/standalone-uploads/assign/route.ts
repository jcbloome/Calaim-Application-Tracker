import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AssignBody = {
  uploadId?: string;
  mode?: 'existing' | 'new';
  target?: {
    applicationId?: string;
    userId?: string | null;
  };
  member?: {
    clientId2?: string;
    mrn?: string;
    firstName?: string;
    lastName?: string;
    healthPlan?: string;
  };
};

const clean = (v: unknown, max = 400) => String(v ?? '').trim().slice(0, max);

async function requireAdmin(params: { idToken: string }) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(params.idToken);
  const uid = clean(decoded?.uid, 128);
  const email = clean((decoded as any)?.email, 200).toLowerCase();

  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
  if (isHardcodedAdminEmail(email)) isAdmin = true;

  if (!isAdmin) {
    const [adminRole, superAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);
    isAdmin = adminRole.exists || superAdminRole.exists;
    if (!isAdmin && email) {
      const [adminRoleByEmail, superAdminRoleByEmail] = await Promise.all([
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isAdmin = adminRoleByEmail.exists || superAdminRoleByEmail.exists;
    }
  }

  if (!isAdmin) return { ok: false as const, status: 403, error: 'Admin privileges required' };

  return { ok: true as const, adminDb, decoded: decoded as any };
}

function splitMemberName(fullName: string) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.slice(-1)[0] };
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? clean(tokenMatch[1], 5000) : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as AssignBody;
    const uploadId = clean(body?.uploadId, 200);
    const mode = body?.mode === 'new' ? 'new' : 'existing';
    const targetAppId = clean(body?.target?.applicationId, 220);
    const targetUserId = clean(body?.target?.userId, 200) || null;

    if (!uploadId) {
      return NextResponse.json({ success: false, error: 'uploadId is required' }, { status: 400 });
    }
    if (mode === 'existing' && !targetAppId) {
      return NextResponse.json({ success: false, error: 'target.applicationId is required for existing mode' }, { status: 400 });
    }

    const adminCheck = await requireAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const admin = adminModule.default;

    const assignedByUid = clean(adminCheck.decoded?.uid, 128);
    const assignedByEmail = clean(adminCheck.decoded?.email, 200).toLowerCase() || null;

    const uploadRef = adminDb.collection('standalone_upload_submissions').doc(uploadId);
    const uploadSnap = await uploadRef.get();
    if (!uploadSnap.exists) {
      return NextResponse.json({ success: false, error: 'Standalone upload not found' }, { status: 404 });
    }
    const upload = uploadSnap.data() as any;
    const status = clean(upload?.status, 40) || 'pending';
    if (status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Upload is not pending (status: ${status})` },
        { status: 409 }
      );
    }

    const docType = clean(upload?.documentType, 140) || 'Standalone upload';
    const files = Array.isArray(upload?.files) ? upload.files : [];
    const normalizedFiles = files
      .map((f: any) => ({
        fileName: clean(f?.fileName, 220),
        downloadURL: clean(f?.downloadURL, 1200),
        storagePath: clean(f?.storagePath, 900),
      }))
      .filter((f: any) => Boolean(f.fileName && f.downloadURL))
      .slice(0, 10);

    if (normalizedFiles.length === 0) {
      return NextResponse.json({ success: false, error: 'Upload has no files to assign' }, { status: 409 });
    }

    let applicationId = targetAppId;
    let applicationUserId: string | null = targetUserId;

    if (mode === 'new') {
      const newId = `admin_app_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      applicationId = newId;
      applicationUserId = null;
    }

    const appRef = applicationId.startsWith('admin_app_') || !applicationUserId
      ? adminDb.collection('applications').doc(applicationId)
      : adminDb.collection('users').doc(applicationUserId).collection('applications').doc(applicationId);

    await adminDb.runTransaction(async (tx) => {
      const appSnap = await tx.get(appRef);

      if (!appSnap.exists) {
        if (mode !== 'new') throw new Error('Target application not found');

        const memberMrn = clean(body?.member?.mrn, 80) || clean(upload?.medicalRecordNumber, 80);
        const memberName = clean(upload?.memberName, 160);
        const split = splitMemberName(memberName);
        const firstName = clean(body?.member?.firstName, 80) || split.firstName || 'Unknown';
        const lastName = clean(body?.member?.lastName, 80) || split.lastName || 'Member';
        const healthPlan = clean(body?.member?.healthPlan, 50) || clean(upload?.healthPlan, 50) || 'Other';

        tx.set(appRef, {
          memberFirstName: firstName,
          memberLastName: lastName,
          memberMrn: memberMrn || '',
          healthPlan: healthPlan,
          pathway: 'SNF Transition',
          status: 'In Progress',
          forms: [],
          progress: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          createdByAdmin: true,
          standaloneIntakeCreatedFromUploadId: uploadId,
        } as any);
      }

      const appData = appSnap.exists ? (appSnap.data() as any) : ({} as any);
      const existingForms = Array.isArray(appData?.forms) ? appData.forms : [];

      const newForms = normalizedFiles.map((f: any, idx: number) => {
        const suffix = normalizedFiles.length > 1 ? ` (${idx + 1})` : '';
        return {
          name: `Standalone upload: ${docType}${suffix}`,
          status: 'Completed',
          type: 'Upload',
          href: '#',
          fileName: f.fileName || null,
          filePath: f.storagePath || null,
          downloadURL: f.downloadURL || null,
          dateCompleted: admin.firestore.FieldValue.serverTimestamp(),
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedByUid: null,
          acknowledgedDate: null,
          source: 'standalone_upload',
          standaloneUploadId: uploadId,
        };
      });

      tx.update(appRef, {
        forms: [...existingForms, ...newForms],
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      } as any);

      tx.update(uploadRef, {
        status: 'assigned',
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        assignedByUid,
        assignedByEmail,
        assignedApplicationId: applicationId,
        assignedApplicationUserId: applicationUserId,
        assignedFilesCount: normalizedFiles.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      } as any);
    });

    const openUrl = applicationId
      ? applicationUserId
        ? `/admin/applications/${applicationId}?userId=${encodeURIComponent(applicationUserId)}`
        : `/admin/applications/${applicationId}`
      : '/admin/applications';

    return NextResponse.json({
      success: true,
      applicationId,
      applicationUserId,
      openUrl,
    });
  } catch (error: any) {
    console.error('[admin/standalone-uploads/assign] Error:', error);
    const msg = clean(error?.message || error, 400) || 'Failed to assign upload';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

