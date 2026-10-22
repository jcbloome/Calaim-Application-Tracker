import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  KAISER_REFERRAL_TEMPLATE_SETTINGS_DOC,
  KAISER_REFERRAL_TEMPLATE_UPLOADS_COLLECTION,
  summarizeReferralTemplate,
} from '@/lib/kaiser-referral-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 15 * 1024 * 1024;
const BUILT_IN_TEMPLATE_FILE = path.join(process.cwd(), 'public', 'Templates', 'Kaiser Referral Form.pdf');

const clean = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

async function readBuiltInSummary() {
  try {
    const bytes = await fs.readFile(BUILT_IN_TEMPLATE_FILE);
    return await summarizeReferralTemplate(bytes);
  } catch {
    return null;
  }
}

/** Active template setting, recent uploads, and the built-in template's field summary. */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminApiAuth(req);
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }
  try {
    const { adminDb } = adminCheck;
    const [settingsSnap, uploadsSnap, builtInSummary] = await Promise.all([
      adminDb
        .collection(KAISER_REFERRAL_TEMPLATE_SETTINGS_DOC.collection)
        .doc(KAISER_REFERRAL_TEMPLATE_SETTINGS_DOC.id)
        .get(),
      adminDb.collection(KAISER_REFERRAL_TEMPLATE_UPLOADS_COLLECTION).orderBy('uploadedAtIso', 'desc').limit(10).get(),
      readBuiltInSummary(),
    ]);
    const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
    return NextResponse.json({
      success: true,
      activeTemplateId: clean(settings.activeTemplateId) || null,
      activatedAtIso: clean(settings.activatedAtIso) || null,
      activatedByEmail: clean(settings.activatedByEmail) || null,
      uploads: uploadsSnap.docs.map((doc: { id: string; data: () => Record<string, unknown> }) => ({
        id: doc.id,
        ...doc.data(),
      })),
      builtInSummary,
    });
  } catch (error: any) {
    console.error('[kaiser-referral-template] GET failed', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load templates' }, { status: 500 });
  }
}

/**
 * multipart/form-data with `file`: upload a new referral PDF (not active until activated).
 * JSON `{ action: 'activate', id }` or `{ action: 'revert' }` (Super Admin): switch the generator template.
 */
export async function POST(req: NextRequest) {
  const contentType = String(req.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');
  const adminCheck = await requireAdminApiAuth(req, isJson ? { requireSuperAdmin: true } : undefined);
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }
  const { adminDb } = adminCheck;
  const settingsRef = adminDb
    .collection(KAISER_REFERRAL_TEMPLATE_SETTINGS_DOC.collection)
    .doc(KAISER_REFERRAL_TEMPLATE_SETTINGS_DOC.id);

  try {
    if (isJson) {
      const body = await req.json().catch(() => ({}));
      const action = clean(body?.action);
      if (action === 'revert') {
        await settingsRef.set(
          {
            activeTemplateId: null,
            activeStoragePath: null,
            activatedAtIso: new Date().toISOString(),
            activatedByEmail: adminCheck.email || '',
          },
          { merge: true }
        );
        return NextResponse.json({ success: true, activeTemplateId: null });
      }
      if (action === 'activate') {
        const id = clean(body?.id);
        const uploadSnap = id
          ? await adminDb.collection(KAISER_REFERRAL_TEMPLATE_UPLOADS_COLLECTION).doc(id).get()
          : null;
        if (!uploadSnap?.exists) {
          return NextResponse.json({ success: false, error: 'Uploaded template not found' }, { status: 404 });
        }
        const upload = uploadSnap.data() || {};
        await settingsRef.set(
          {
            activeTemplateId: id,
            activeStoragePath: clean(upload.storagePath, 500),
            activeFileName: clean(upload.fileName, 200),
            activatedAtIso: new Date().toISOString(),
            activatedByEmail: adminCheck.email || '',
          },
          { merge: true }
        );
        return NextResponse.json({ success: true, activeTemplateId: id });
      }
      return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Missing PDF file' }, { status: 400 });
    }
    if (!file.size || file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: 'PDF must be under 15MB' }, { status: 400 });
    }
    const fileName = clean(file.name, 180) || 'kaiser-referral.pdf';
    if (!/\.pdf$/i.test(fileName)) {
      return NextResponse.json({ success: false, error: 'Upload a PDF file' }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());

    let summary;
    try {
      summary = await summarizeReferralTemplate(bytes);
    } catch {
      return NextResponse.json({ success: false, error: 'Could not read this PDF' }, { status: 400 });
    }
    if (!summary.fieldCount) {
      return NextResponse.json(
        {
          success: false,
          error: 'This PDF has no fillable form fields. Upload the fillable Kaiser referral / authorization PDF.',
        },
        { status: 400 }
      );
    }

    const uploadedAtIso = new Date().toISOString();
    const safeName = fileName.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 160);
    const storagePath = `templates/kaiser-referral/${Date.now()}-${safeName}`;
    await adminStorage.bucket().file(storagePath).save(bytes, {
      resumable: false,
      contentType: 'application/pdf',
      metadata: {
        contentType: 'application/pdf',
        cacheControl: 'private, max-age=0, no-store',
        metadata: { uploadedByEmail: adminCheck.email || '', purpose: 'kaiser-referral-template' },
      },
    });

    const docRef = await adminDb.collection(KAISER_REFERRAL_TEMPLATE_UPLOADS_COLLECTION).add({
      fileName,
      storagePath,
      size: bytes.length,
      uploadedAtIso,
      uploadedByUid: adminCheck.uid,
      uploadedByEmail: adminCheck.email || '',
      uploadedByName: adminCheck.name || '',
      summary,
    });

    return NextResponse.json({
      success: true,
      id: docRef.id,
      fileName,
      storagePath,
      uploadedAtIso,
      summary,
    });
  } catch (error: any) {
    console.error('[kaiser-referral-template] POST failed', error);
    return NextResponse.json({ success: false, error: error?.message || 'Template update failed' }, { status: 500 });
  }
}
