import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getStorage } from 'firebase-admin/storage';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminDb } from '@/firebase-admin';
import {
  ALFT_COVER_SHEET_PACKAGE_TO,
  buildAlftCoverSheetPackageSubject,
  missingCoverSheetPackageDocs,
  requiredCoverSheetPackageDocs,
  type CoverSheetPackageDocKey,
  type CoverSheetPackageFile,
  type CoverSheetPackageType,
} from '@/lib/alft-cover-sheet-package';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);

const normalizePackageType = (value: unknown): CoverSheetPackageType =>
  String(value || '').trim().toLowerCase() === 'reassessment' ? 'reassessment' : 'initial';

const normalizeFile = (raw: unknown): CoverSheetPackageFile | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const fileName = clean(row.fileName, 240);
  const downloadURL = clean(row.downloadURL, 2000);
  if (!fileName || !downloadURL) return null;
  return {
    fileName,
    downloadURL,
    storagePath: clean(row.storagePath, 900) || undefined,
    contentType: clean(row.contentType, 120) || undefined,
    source: (clean(row.source, 40) as CoverSheetPackageFile['source']) || 'upload',
  };
};

async function loadAttachmentBytes(file: CoverSheetPackageFile): Promise<Buffer | null> {
  const path = clean(file.storagePath, 900);
  if (path) {
    try {
      const [bytes] = await getStorage().bucket().file(path).download();
      if (bytes?.length) return Buffer.from(bytes);
    } catch {
      // fall through to URL
    }
  }
  const url = clean(file.downloadURL, 2000);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as { packageId?: string };
    const packageId = clean(body.packageId, 120);
    if (!packageId) {
      return NextResponse.json({ success: false, error: 'packageId is required' }, { status: 400 });
    }

    const pkgRef = adminDb.collection('alft_cover_sheet_packages').doc(packageId);
    const pkgSnap = await pkgRef.get();
    if (!pkgSnap.exists) {
      return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
    }
    const data = pkgSnap.data() || {};
    const packageType = normalizePackageType(data.packageType);
    const memberName = clean(data.memberName, 200) || 'Member';
    const memberMrn = clean(data.memberMrn, 80) || 'N/A';
    const docsRaw = (data.docs || {}) as Record<string, unknown>;
    const docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null>> = {};
    for (const item of requiredCoverSheetPackageDocs(packageType)) {
      docs[item.key] = normalizeFile(docsRaw[item.key]);
    }

    const missing = missingCoverSheetPackageDocs(packageType, docs);
    if (missing.length) {
      return NextResponse.json(
        {
          success: false,
          error: `Package incomplete. Still needed: ${missing.map((m) => m.label).join(', ')}.`,
        },
        { status: 409 }
      );
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ success: false, error: 'Resend API key is not configured.' }, { status: 500 });
    }
    const resend = new Resend(resendKey);

    const attachments: Array<{ filename: string; content: Buffer }> = [];
    for (const item of requiredCoverSheetPackageDocs(packageType)) {
      const file = docs[item.key];
      if (!file) continue;
      const bytes = await loadAttachmentBytes(file);
      if (!bytes?.length) {
        return NextResponse.json(
          { success: false, error: `Could not load attachment for ${item.label} (${file.fileName}).` },
          { status: 409 }
        );
      }
      const safeBase = `${item.label.replace(/[^\w.\- ]+/g, '_')}-${file.fileName}`.slice(0, 180);
      attachments.push({ filename: safeBase, content: bytes });
    }

    const subject = buildAlftCoverSheetPackageSubject(memberName, memberMrn);
    const staffName = clean(authCheck.name || authCheck.email, 160) || 'Connections staff';
    const html = `
      <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:720px;">
        <p>Hello,</p>
        <p>Please find the completed ALFT Cover Sheet Package for ongoing ALFT services.</p>
        <p><strong>Member:</strong> ${memberName}<br/>
        <strong>MRN:</strong> ${memberMrn}<br/>
        <strong>Package type:</strong> ${packageType === 'initial' ? 'Initial cover sheet' : 'Reassessment'}<br/>
        <strong>Prepared by:</strong> ${staffName}</p>
        <p><strong>Included documents:</strong></p>
        <ul>
          ${requiredCoverSheetPackageDocs(packageType)
            .map((item) => `<li>${item.label}: ${clean(docs[item.key]?.fileName, 240)}</li>`)
            .join('')}
        </ul>
        <p>Thank you,<br/>CalAIM Application Tracker</p>
      </div>
    `;

    const sendResult = await resend.emails.send({
      from: 'CalAIM Tracker <noreply@carehomefinders.com>',
      to: [ALFT_COVER_SHEET_PACKAGE_TO],
      subject,
      html,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if ((sendResult as any)?.error) {
      throw new Error(String((sendResult as any).error?.message || 'Failed to send package email'));
    }

    const adminModule = await import('@/firebase-admin');
    const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
    const sentAtIso = new Date().toISOString();
    await pkgRef.set(
      {
        status: 'sent',
        sentAt: serverTimestamp,
        sentAtIso,
        sentTo: ALFT_COVER_SHEET_PACKAGE_TO,
        sentByName: staffName,
        sentByEmail: clean(authCheck.email, 220).toLowerCase(),
        sentSubject: subject,
        updatedAt: serverTimestamp,
        updatedAtIso: sentAtIso,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      sentTo: ALFT_COVER_SHEET_PACKAGE_TO,
      subject,
      attachmentCount: attachments.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to send cover sheet package') },
      { status: 500 }
    );
  }
}
