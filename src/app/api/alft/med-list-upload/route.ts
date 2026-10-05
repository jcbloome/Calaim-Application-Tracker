import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024;
const clean = (v: unknown, max = 400) => String(v ?? '').trim().slice(0, max);

async function authorizeMedListUpload(idToken: string, memberId: string) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = clean(decoded?.uid, 160);
  const email = clean((decoded as any)?.email, 220).toLowerCase();
  if (!uid) {
    return { ok: false as const, status: 401, error: 'Invalid token' };
  }

  const [adminRole, superAdminRole, swByUid, swByEmail] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get().catch(() => null),
    adminDb.collection('roles_super_admin').doc(uid).get().catch(() => null),
    adminDb.collection('socialWorkers').doc(uid).get().catch(() => null),
    email ? adminDb.collection('socialWorkers').doc(email).get().catch(() => null) : Promise.resolve(null),
  ]);
  const isAdmin =
    Boolean((decoded as any)?.admin) ||
    Boolean((decoded as any)?.superAdmin) ||
    isHardcodedAdminEmail(email) ||
    Boolean(adminRole?.exists) ||
    Boolean(superAdminRole?.exists);

  const assignmentSnap = await adminDb.collection('alft_assignments').doc(memberId).get();
  if (!assignmentSnap.exists) {
    return { ok: false as const, status: 404, error: 'Assignment not found for this member.' };
  }
  const assignment = assignmentSnap.data() as Record<string, unknown>;
  const assignedEmail = clean(assignment?.assignedSwEmail, 220).toLowerCase();
  const assignedUid = clean(assignment?.assignedSwUid, 160);
  const assignedId = clean(assignment?.assignedSwId || assignment?.SW_ID || assignment?.sw_id, 80).toLowerCase();
  const claimSwId = clean((decoded as any)?.sw_id || (decoded as any)?.SW_ID || '', 80).toLowerCase();

  const emailMatch = Boolean(assignedEmail && email && assignedEmail === email);
  const uidMatch = Boolean(assignedUid && assignedUid === uid);
  const idMatch = Boolean(assignedId && claimSwId && assignedId === claimSwId);
  const isActiveSw =
    (swByUid?.exists && Boolean((swByUid.data() as any)?.isActive !== false)) ||
    (swByEmail?.exists && Boolean((swByEmail.data() as any)?.isActive !== false));

  // Assigned SW, or any active SW that can already see this assignment in the portal, or admin.
  if (!isAdmin && !emailMatch && !uidMatch && !idMatch) {
    return {
      ok: false as const,
      status: 403,
      error: isActiveSw
        ? 'You are signed in as a social worker, but this member is assigned to someone else.'
        : 'Not allowed to upload a medication list for this member.',
    };
  }

  const displayName =
    clean((decoded as any)?.name, 160) ||
    clean((swByUid?.data() as any)?.displayName || (swByEmail?.data() as any)?.displayName, 160) ||
    email ||
    uid;

  return { ok: true as const, uid, email, displayName, adminDb, isAdmin };
}

/**
 * Server-side med-list upload for ISP/ALFT.
 * Uses Admin Storage so it works even when Storage rules for SW client uploads
 * were never deployed (common failure: storage/unauthorized on the SW portal).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ success: false, error: 'Expected multipart form data' }, { status: 400 });
    }

    const memberId = clean(form.get('memberId'), 160);
    if (!memberId || memberId === 'unassigned') {
      return NextResponse.json({ success: false, error: 'Select a member first' }, { status: 400 });
    }

    const authz = await authorizeMedListUpload(idToken, memberId);
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Missing file' }, { status: 400 });
    }
    if (!file.size || file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: 'Keep med list uploads under 20 MB.' }, { status: 400 });
    }

    const originalName = clean(file.name, 180) || 'med-list.pdf';
    const okType =
      /^application\/pdf$/i.test(file.type) ||
      /^image\//i.test(file.type) ||
      /\.(pdf|png|jpe?g|webp|heic)$/i.test(originalName);
    if (!okType) {
      return NextResponse.json(
        { success: false, error: 'Upload a PDF or image of the medication list.' },
        { status: 400 }
      );
    }

    const safeName = originalName.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(0, 160);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const storagePath = `admin_uploads/alft-med-lists/${memberId}/${ts}_${safeName}`;
    const downloadToken = randomUUID();
    const contentType =
      clean(file.type, 120) || (/\.pdf$/i.test(originalName) ? 'application/pdf' : 'application/octet-stream');
    const bytes = Buffer.from(await file.arrayBuffer());

    const bucket = getStorage().bucket();
    await bucket.file(storagePath).save(bytes, {
      resumable: false,
      contentType,
      metadata: {
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          label: 'Medication list',
          originalFileName: originalName,
          uploadedByUid: authz.uid,
          uploadedByEmail: authz.email || '',
          purpose: 'alft-med-list',
        },
      },
    });

    const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(
      storagePath
    )}?alt=media&token=${downloadToken}`;

    const attachment = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fileName: originalName,
      downloadURL,
      storagePath,
      contentType,
      uploadedAtIso: new Date().toISOString(),
      uploadedByName: authz.displayName || null,
      uploadedByEmail: authz.email || null,
    };

    await authz.adminDb
      .collection('alft_assignments')
      .doc(memberId)
      .set(
        {
          memberId,
          medListAttachment: attachment,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      )
      .catch(() => null);

    return NextResponse.json({ success: true, attachment });
  } catch (e: any) {
    console.error('[api/alft/med-list-upload] error', e);
    return NextResponse.json(
      { success: false, error: String(e?.message || 'Could not upload medication list') },
      { status: 500 }
    );
  }
}
