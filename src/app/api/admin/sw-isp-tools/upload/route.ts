import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT = new Set(['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'txt']);

const clean = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ success: false, error: 'Expected multipart form data' }, { status: 400 });
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

    const originalName = clean(file.name, 180) || 'upload.bin';
    const ext = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : '';
    if (ext && !ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Use PDF, Word, image, or text.' },
        { status: 400 }
      );
    }

    const label = clean(form.get('label'), 120) || originalName.replace(/\.[^.]+$/, '');
    const description = clean(form.get('description'), 500);
    const safeName = originalName.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 160);
    const storagePath = `sw-isp-tools/${Date.now()}-${safeName}`;
    const downloadToken = randomUUID();
    const contentType = clean(file.type, 120) || 'application/octet-stream';
    const bytes = Buffer.from(await file.arrayBuffer());

    const bucket = getStorage().bucket();
    const storageFile = bucket.file(storagePath);
    await storageFile.save(bytes, {
      resumable: false,
      contentType,
      metadata: {
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          uploadedByUid: adminCheck.uid,
          uploadedByEmail: adminCheck.email || '',
          purpose: 'sw-isp-tools',
        },
      },
    });

    const href = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(
      storagePath
    )}?alt=media&token=${downloadToken}`;

    return NextResponse.json({
      success: true,
      label,
      description: description || undefined,
      href,
      fileName: originalName,
      storagePath,
      uploadedAtIso: new Date().toISOString(),
      contentType,
      size: bytes.length,
    });
  } catch (e: any) {
    console.error('[api/admin/sw-isp-tools/upload] error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
