import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { adminAuth, adminDb } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireSuperAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
  if (!idToken) {
    return { ok: false as const, status: 401, error: 'Missing Authorization Bearer token' };
  }

  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();
  if (!uid) {
    return { ok: false as const, status: 401, error: 'Invalid token' };
  }

  let isSuperAdmin = Boolean((decoded as any)?.superAdmin);
  if (isHardcodedAdminEmail(email)) isSuperAdmin = true;

  if (!isSuperAdmin) {
    const uidDoc = await adminDb.collection('roles_super_admin').doc(uid).get();
    isSuperAdmin = uidDoc.exists;
    if (!isSuperAdmin && email) {
      const emailDoc = await adminDb.collection('roles_super_admin').doc(email).get();
      isSuperAdmin = emailDoc.exists;
    }
  }

  if (!isSuperAdmin) {
    return { ok: false as const, status: 403, error: 'Super Admin privileges required' };
  }

  return { ok: true as const };
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function toInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.min(max, Math.max(min, i));
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const dryRun = toBool(body?.dryRun, true);
    const maxDocs = toInt(body?.maxDocs, 1500, 1, 10000);
    const pathPrefix = String(body?.pathPrefix || 'user_uploads/').trim().toLowerCase();

    const appsSnapshot = await adminDb.collectionGroup('applications').limit(maxDocs).get();
    const docs = appsSnapshot.docs;

    let scannedDocs = 0;
    let changedDocs = 0;
    let clearedDownloadUrls = 0;
    const changedPaths: string[] = [];

    let batch = adminDb.batch();
    let batchOps = 0;

    for (const appDoc of docs) {
      scannedDocs += 1;
      const data = appDoc.data() as Record<string, unknown>;
      const forms = Array.isArray(data?.forms) ? (data.forms as any[]) : [];
      if (forms.length === 0) continue;

      let docChanged = false;
      const nextForms = forms.map((formEntry) => {
        if (!formEntry || typeof formEntry !== 'object' || Array.isArray(formEntry)) return formEntry;
        const form = formEntry as Record<string, unknown>;
        const hasDownloadUrl =
          (typeof form.downloadURL === 'string' && String(form.downloadURL).trim().length > 0) ||
          (form.downloadURL != null && typeof form.downloadURL !== 'string');
        if (!hasDownloadUrl) return formEntry;

        const filePath = String(form.filePath || '').trim().toLowerCase();
        const type = String(form.type || '').trim().toLowerCase();
        const isUploadType = type === 'upload';
        const isUserUploadPath = Boolean(filePath) && filePath.startsWith(pathPrefix);
        if (!isUploadType && !isUserUploadPath) return formEntry;

        const { downloadURL, ...rest } = form;
        void downloadURL;
        clearedDownloadUrls += 1;
        docChanged = true;
        return rest;
      });

      if (!docChanged) continue;
      changedDocs += 1;
      if (changedPaths.length < 25) changedPaths.push(appDoc.ref.path);

      if (!dryRun) {
        batch.set(
          appDoc.ref,
          {
            forms: nextForms,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            downloadUrlCleanupAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        batchOps += 1;
        if (batchOps >= 400) {
          await batch.commit();
          batch = adminDb.batch();
          batchOps = 0;
        }
      }
    }

    if (!dryRun && batchOps > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      dryRun,
      scannedDocs,
      changedDocs,
      clearedDownloadUrls,
      hasMorePossiblyRemaining: docs.length === maxDocs,
      changedPaths,
    });
  } catch (error: any) {
    console.error('❌ clear-upload-download-urls failed:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to clear legacy download URLs' },
      { status: 500 }
    );
  }
}

