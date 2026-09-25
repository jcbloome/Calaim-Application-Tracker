import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import admin, { adminDb } from '@/firebase-admin';
import { resolveAppPathUrl } from '@/lib/app-urls';
import {
  missingCoverSheetPackageChecklist,
  normalizeCoverSheetPlacementType,
  requiredCoverSheetPackageDocs,
  type CoverSheetPackageDocKey,
  type CoverSheetPackageFile,
  type CoverSheetPackageType,
} from '@/lib/alft-cover-sheet-package';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 400) => String(value ?? '').trim().slice(0, max);

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

type Body = {
  packageId?: string;
  toEmail?: string;
  toName?: string;
  preview?: boolean;
  additionalNote?: string;
};

/**
 * Email assigned staff about items still needed to complete an ILS package.
 */
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const packageId = clean(body.packageId, 120);
    if (!packageId) {
      return NextResponse.json({ success: false, error: 'packageId is required' }, { status: 400 });
    }

    const pkgSnap = await adminDb.collection('alft_cover_sheet_packages').doc(packageId).get();
    if (!pkgSnap.exists) {
      return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
    }
    const data = pkgSnap.data() || {};
    const packageType = normalizePackageType(data.packageType);
    const placementType = normalizeCoverSheetPlacementType(data.placementType);
    const homeVettedByIls = Boolean(data.homeVettedByIls);
    const rcfeVettedByIls = Boolean(data.rcfeVettedByIls);
    const managerVerified = Boolean(data.managerVerified || data.managerVerification?.verified);
    const memberName = clean(data.memberName, 200) || 'Member';
    const memberMrn = clean(data.memberMrn, 80) || 'N/A';
    const memberClientId = clean(data.memberClientId, 80);

    const docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null>> = {};
    for (const item of requiredCoverSheetPackageDocs(packageType, placementType)) {
      docs[item.key] = normalizeFile(data.docs?.[item.key]);
    }
    const missing = missingCoverSheetPackageChecklist(packageType, docs, {
      placementType,
      homeVettedByIls,
      rcfeVettedByIls,
      managerVerified,
    });
    if (!missing.length) {
      return NextResponse.json(
        { success: false, error: 'Package has no missing items — nothing to remind about.' },
        { status: 409 }
      );
    }

    const toEmail =
      clean(body.toEmail, 220).toLowerCase() ||
      clean(data.assignedStaffEmail, 220).toLowerCase() ||
      clean(data.staffEmail, 220).toLowerCase();
    const toName =
      clean(body.toName, 160) ||
      clean(data.assignedStaffName, 160) ||
      clean(data.kaiserUserAssignment, 160) ||
      clean(data.staffName, 160) ||
      'Staff';

    if (!toEmail || !toEmail.includes('@')) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No staff email on file. Set Kaiser_User_Assignment email or enter an address before sending.',
        },
        { status: 409 }
      );
    }

    const checklistPath = `/admin/tools/alft-cover-sheet-package?memberClientId=${encodeURIComponent(
      memberClientId
    )}&packageType=${encodeURIComponent(packageType)}${
      memberMrn && memberMrn !== 'N/A' ? `&memberMrn=${encodeURIComponent(memberMrn)}` : ''
    }`;
    const checklistUrl = resolveAppPathUrl(checklistPath);
    const pathwayId = clean(data.linkedApplicationId, 120);
    const pathwayUrl = pathwayId
      ? resolveAppPathUrl(`/admin/applications/${encodeURIComponent(pathwayId)}`)
      : '';
    const trackerUrl = resolveAppPathUrl('/admin/tools/ils-package-tracker');
    const additionalNote = clean(body.additionalNote, 2000);
    const missingLines = missing.map((m) => `• ${m.label}`).join('\n');
    const subject = `ILS package items still needed — ${memberName} (MRN ${memberMrn})`;
    const text = [
      `Hi ${toName.split(/\s+/)[0] || toName},`,
      '',
      `The ILS package for ${memberName} (MRN ${memberMrn}) still needs the following before it can be sent:`,
      '',
      missingLines,
      '',
      'Upload missing documents on the ILS Member Package Checklist (or pull from the application pathway if already received):',
      checklistUrl,
      pathwayUrl ? `\nApplication pathway:\n${pathwayUrl}` : '',
      '',
      `Tracker:\n${trackerUrl}`,
      additionalNote ? `\nNote from admin:\n${additionalNote}` : '',
      '',
      `Thanks,`,
      clean(authCheck.name || authCheck.email, 160) || 'Connections staff',
    ]
      .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
      .join('\n');

    const html = text
      .split('\n')
      .map((line) => {
        const escaped = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        if (!escaped) return '<br/>';
        const withLinks = escaped.replace(
          /(https?:\/\/[^\s]+)/g,
          '<a href="$1" style="color:#1d4ed8;">$1</a>'
        );
        return `<p style="margin:0 0 8px;">${withLinks}</p>`;
      })
      .join('');

    if (body.preview) {
      return NextResponse.json({
        success: true,
        preview: {
          to: toEmail,
          toName,
          subject,
          text,
          html,
          missingLabels: missing.map((m) => m.label),
          checklistUrl,
          pathwayUrl: pathwayUrl || null,
        },
      });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ success: false, error: 'Resend API key is not configured' }, { status: 500 });
    }
    const resend = new Resend(resendKey);
    const sendResult = await resend.emails.send({
      from: 'CalAIM Tracker <noreply@carehomefinders.com>',
      to: [toEmail],
      subject,
      html,
      text,
    });
    if ((sendResult as any)?.error) {
      throw new Error(String((sendResult as any).error?.message || 'Failed to send reminder email'));
    }

    const sentAtIso = new Date().toISOString();
    await adminDb
      .collection('alft_cover_sheet_packages')
      .doc(packageId)
      .set(
        {
          lastStaffReminderAtIso: sentAtIso,
          lastStaffReminderTo: toEmail,
          lastStaffReminderByEmail: clean(authCheck.email, 220).toLowerCase(),
          lastStaffReminderByName: clean(authCheck.name || authCheck.email, 160),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAtIso: sentAtIso,
        },
        { merge: true }
      );

    return NextResponse.json({
      success: true,
      sentTo: toEmail,
      sentToName: toName,
      subject,
      missingLabels: missing.map((m) => m.label),
    });
  } catch (error: any) {
    console.error('ILS package staff reminder failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to send staff reminder') },
      { status: 500 }
    );
  }
}
