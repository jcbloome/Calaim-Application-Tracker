import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getStorage } from 'firebase-admin/storage';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminDb } from '@/firebase-admin';
import {
  ALFT_COVER_SHEET_PACKAGE_SEND_LOGS_COLLECTION,
  ALFT_COVER_SHEET_PACKAGE_TO,
  ALFT_COVER_SHEET_PACKAGE_TO_NAME,
  buildAlftCoverSheetPackageEmailPreview,
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
    uploadedAtIso: clean(row.uploadedAtIso, 80) || undefined,
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

function collectDocs(
  packageType: CoverSheetPackageType,
  docsRaw: Record<string, unknown>
): Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null>> {
  const docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null>> = {};
  for (const item of requiredCoverSheetPackageDocs(packageType)) {
    docs[item.key] = normalizeFile(docsRaw[item.key]);
  }
  return docs;
}

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const previewOnly = clean(req.nextUrl.searchParams.get('preview')) === '1';
    const packageId = clean(req.nextUrl.searchParams.get('packageId'), 120);
    const limitParam = Number(req.nextUrl.searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

    if (previewOnly) {
      if (!packageId) {
        return NextResponse.json({ success: false, error: 'packageId is required for preview' }, { status: 400 });
      }
      const pkgSnap = await adminDb.collection('alft_cover_sheet_packages').doc(packageId).get();
      if (!pkgSnap.exists) {
        return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
      }
      const data = pkgSnap.data() || {};
      const packageType = normalizePackageType(data.packageType);
      const docs = collectDocs(packageType, (data.docs || {}) as Record<string, unknown>);
      const missing = missingCoverSheetPackageDocs(packageType, docs);
      const staffName =
        clean(authCheck.name || authCheck.email, 160) ||
        clean(data.staffName, 160) ||
        'Connections staff';
      const preview = buildAlftCoverSheetPackageEmailPreview({
        memberName: clean(data.memberName, 200),
        memberMrn: clean(data.memberMrn, 80),
        packageType,
        staffName,
        docs,
      });
      return NextResponse.json({
        success: true,
        preview,
        readyToSend: missing.length === 0,
        missingLabels: missing.map((m) => m.label),
      });
    }

    const snap = await adminDb
      .collection(ALFT_COVER_SHEET_PACKAGE_SEND_LOGS_COLLECTION)
      .orderBy('sentAt', 'desc')
      .limit(limit)
      .get()
      .catch(async () =>
        adminDb
          .collection(ALFT_COVER_SHEET_PACKAGE_SEND_LOGS_COLLECTION)
          .orderBy('sentAtIso', 'desc')
          .limit(limit)
          .get()
      );

    const logs = snap.docs.map((doc) => {
      const data = doc.data() || {};
      const files = Array.isArray(data.files)
        ? data.files
            .map((f: any) => ({
              key: clean(f?.key, 60),
              label: clean(f?.label, 120),
              fileName: clean(f?.fileName, 240),
              downloadURL: clean(f?.downloadURL, 2000),
              storagePath: clean(f?.storagePath, 900),
            }))
            .filter((f: any) => f.fileName)
        : [];
      const sentAt =
        (() => {
          try {
            const withToDate = data.sentAt as { toDate?: () => Date };
            if (typeof withToDate?.toDate === 'function') {
              const d = withToDate.toDate();
              return Number.isNaN(d.getTime()) ? '' : d.toISOString();
            }
          } catch {
            // ignore
          }
          return clean(data.sentAtIso, 80);
        })();
      return {
        id: doc.id,
        packageId: clean(data.packageId, 120),
        memberName: clean(data.memberName, 200),
        memberMrn: clean(data.memberMrn, 80),
        memberClientId: clean(data.memberClientId, 80),
        packageType: normalizePackageType(data.packageType),
        subject: clean(data.subject, 400),
        sentTo: clean(data.sentTo, 200).toLowerCase() || ALFT_COVER_SHEET_PACKAGE_TO,
        sentToName: clean(data.sentToName, 120) || ALFT_COVER_SHEET_PACKAGE_TO_NAME,
        sentByName: clean(data.sentByName, 160),
        sentByEmail: clean(data.sentByEmail, 220).toLowerCase(),
        sentAt,
        fileCount: files.length || Number(data.fileCount) || 0,
        files,
      };
    });

    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load send logs') },
      { status: 500 }
    );
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
    const memberClientId = clean(data.memberClientId, 80);
    const docs = collectDocs(packageType, (data.docs || {}) as Record<string, unknown>);

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

    const staffName = clean(authCheck.name || authCheck.email, 160) || 'Connections staff';
    const preview = buildAlftCoverSheetPackageEmailPreview({
      memberName,
      memberMrn,
      packageType,
      staffName,
      docs,
    });

    const attachments: Array<{ filename: string; content: Buffer }> = [];
    const loggedFiles: Array<{
      key: string;
      label: string;
      fileName: string;
      downloadURL: string;
      storagePath?: string;
    }> = [];

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
      loggedFiles.push({
        key: item.key,
        label: item.label,
        fileName: file.fileName,
        downloadURL: file.downloadURL,
        storagePath: file.storagePath || undefined,
      });
    }

    const sendResult = await resend.emails.send({
      from: 'CalAIM Tracker <noreply@carehomefinders.com>',
      to: [ALFT_COVER_SHEET_PACKAGE_TO],
      subject: preview.subject,
      html: preview.html,
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
    const sentByEmail = clean(authCheck.email, 220).toLowerCase();

    const logRef = await adminDb.collection(ALFT_COVER_SHEET_PACKAGE_SEND_LOGS_COLLECTION).add({
      packageId,
      memberName,
      memberMrn,
      memberClientId: memberClientId || null,
      packageType,
      subject: preview.subject,
      emailHtml: preview.html,
      emailText: preview.text,
      sentTo: ALFT_COVER_SHEET_PACKAGE_TO,
      sentToName: ALFT_COVER_SHEET_PACKAGE_TO_NAME,
      sentByName: staffName,
      sentByEmail,
      sentByUid: authCheck.uid || null,
      sentAt: serverTimestamp,
      sentAtIso,
      fileCount: loggedFiles.length,
      files: loggedFiles,
      resendId: clean((sendResult as any)?.data?.id, 120) || null,
    });

    await pkgRef.set(
      {
        status: 'sent',
        sentAt: serverTimestamp,
        sentAtIso,
        sentTo: ALFT_COVER_SHEET_PACKAGE_TO,
        sentToName: ALFT_COVER_SHEET_PACKAGE_TO_NAME,
        sentByName: staffName,
        sentByEmail,
        sentSubject: preview.subject,
        lastSendLogId: logRef.id,
        updatedAt: serverTimestamp,
        updatedAtIso: sentAtIso,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      sentTo: ALFT_COVER_SHEET_PACKAGE_TO,
      sentToName: ALFT_COVER_SHEET_PACKAGE_TO_NAME,
      subject: preview.subject,
      attachmentCount: attachments.length,
      sendLogId: logRef.id,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to send cover sheet package') },
      { status: 500 }
    );
  }
}
