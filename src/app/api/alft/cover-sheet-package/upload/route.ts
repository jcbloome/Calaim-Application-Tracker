import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminDb } from '@/firebase-admin';
import {
  type CoverSheetPackageDocKey,
  COVER_SHEET_PACKAGE_ALWAYS_REQUIRED,
  COVER_SHEET_PACKAGE_INITIAL_ONLY,
} from '@/lib/alft-cover-sheet-package';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 30 * 1024 * 1024;
const ALLOWED_EXT = new Set(['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp']);
const VALID_KEYS = new Set<string>([
  ...COVER_SHEET_PACKAGE_ALWAYS_REQUIRED.map((d) => d.key),
  ...COVER_SHEET_PACKAGE_INITIAL_ONLY.map((d) => d.key),
]);

const clean = (value: unknown, max = 240) => String(value ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ success: false, error: 'Expected multipart form data' }, { status: 400 });
    }

    const packageId = clean(form.get('packageId'), 120);
    const docKey = clean(form.get('docKey'), 60) as CoverSheetPackageDocKey;
    if (!packageId) {
      return NextResponse.json({ success: false, error: 'packageId is required' }, { status: 400 });
    }
    if (!VALID_KEYS.has(docKey)) {
      return NextResponse.json({ success: false, error: 'Invalid checklist document key' }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Missing file' }, { status: 400 });
    }
    if (!file.size || file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `File must be under ${Math.round(MAX_BYTES / (1024 * 1024))}MB` },
        { status: 400 }
      );
    }

    const pkgRef = adminDb.collection('alft_cover_sheet_packages').doc(packageId);
    const pkgSnap = await pkgRef.get();
    if (!pkgSnap.exists) {
      return NextResponse.json({ success: false, error: 'Package not found. Save member package first.' }, { status: 404 });
    }

    const originalName = clean(file.name, 180) || `${docKey}.pdf`;
    const ext = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : '';
    if (ext && !ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Use PDF, Word, or image.' },
        { status: 400 }
      );
    }

    const safeName = originalName.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 160);
    const storagePath = `alft-cover-sheet-packages/${packageId}/${docKey}-${Date.now()}-${safeName}`;
    const downloadToken = randomUUID();
    const contentType = clean(file.type, 120) || 'application/octet-stream';
    const bytes = Buffer.from(await file.arrayBuffer());
    const bucket = getStorage().bucket();
    await bucket.file(storagePath).save(bytes, {
      resumable: false,
      contentType,
      metadata: {
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          uploadedByUid: authCheck.uid || '',
          uploadedByEmail: authCheck.email || '',
          purpose: 'alft-cover-sheet-package',
          docKey,
          packageId,
        },
      },
    });

    const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(
      storagePath
    )}?alt=media&token=${downloadToken}`;
    const uploadedAtIso = new Date().toISOString();
    const fileMeta = {
      fileName: originalName,
      downloadURL,
      storagePath,
      contentType,
      uploadedAtIso,
      uploadedByName: clean(authCheck.name || authCheck.email, 160),
      uploadedByEmail: clean(authCheck.email, 220).toLowerCase(),
      source: 'upload' as const,
    };

    const adminModule = await import('@/firebase-admin');
    const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
    const existingDocs = { ...((pkgSnap.data() || {}).docs || {}) };
    existingDocs[docKey] = fileMeta;

    await pkgRef.set(
      {
        docs: existingDocs,
        updatedAt: serverTimestamp,
        updatedAtIso: uploadedAtIso,
        staffName: clean(authCheck.name || authCheck.email, 160),
        staffEmail: clean(authCheck.email, 220).toLowerCase(),
        status: 'draft',
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      docKey,
      file: fileMeta,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Upload failed') },
      { status: 500 }
    );
  }
}
