import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const auth = await requireAdminApiAuth(request, { requireSuperAdmin: true, requireTwoFactor: true });
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

