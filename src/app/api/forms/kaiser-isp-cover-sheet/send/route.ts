import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { getKaiserProviderPortal, getKaiserRegionFromCounty } from '@/lib/kaiser-region';
import { attachGeneratedFormToApplication } from '@/lib/attach-generated-form-to-application';
import { adminStorage } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KAISER_REFERRALS_COPY_EMAIL = 'kpreferrals@ilshealth.com';
const JASON_COPY_EMAIL = 'jason@carehomefinders.com';
const KAISER_NORTH_INTAKE_EMAIL = 'regmcdurns-kpnc@kp.org';
const KAISER_SOUTH_INTAKE_EMAIL = 'RegCareCoordCaseMgmt@kp.org';
const FROM = 'Connections CalAIM <noreply@carehomefinders.com>';
const PDF_RETENTION_URL_MS = 1000 * 60 * 60 * 24 * 30;

function clean(value: unknown) {
  return String(value || '').trim();
}

function uniqueEmails(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (!trimmed || !trimmed.includes('@')) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function resolveKaiserIntake(regionRaw: unknown, countyRaw: unknown) {
  const region = clean(regionRaw).toLowerCase();
  if (region.includes('north') || region === 'ncal' || region.includes('kpnc')) {
    return { label: 'Kaiser North', email: KAISER_NORTH_INTAKE_EMAIL };
  }
  if (region.includes('south') || region === 'scal' || region.includes('kpsc')) {
    return { label: 'Kaiser South', email: KAISER_SOUTH_INTAKE_EMAIL };
  }
  const fromCounty = getKaiserRegionFromCounty(countyRaw);
  if (fromCounty === 'Kaiser North') return { label: fromCounty, email: KAISER_NORTH_INTAKE_EMAIL };
  if (fromCounty === 'Kaiser South') return { label: fromCounty, email: KAISER_SOUTH_INTAKE_EMAIL };
  return null;
}

function sanitizePathComponent(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = await req.json().catch(() => ({}));
    const intake = resolveKaiserIntake(body?.region, body?.memberCounty);
    if (!intake) {
      return NextResponse.json(
        { success: false, error: 'Kaiser region is required (North/NCAL or South/SCAL).' },
        { status: 400 }
      );
    }

    const memberName = clean(body?.memberName) || 'Member';
    const memberMrn = clean(body?.memberMrn);
    const memberClientId = clean(body?.memberClientId);
    const applicationId = clean(body?.applicationId);
    const pdfBase64 = clean(body?.pdfBase64);
    const fileName = clean(body?.fileName) || `Kaiser Cover Sheet ${memberName}.pdf`;
    if (!pdfBase64) {
      return NextResponse.json({ success: false, error: 'Cover sheet PDF is required.' }, { status: 400 });
    }

    const resendKey = clean(process.env.RESEND_API_KEY);
    if (!resendKey) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
    }

    const submitterEmail = clean(authCheck.email).toLowerCase();
    const submitterName = clean(authCheck.name) || submitterEmail || 'Connections staff';
    const toRecipients = uniqueEmails([intake.email, KAISER_REFERRALS_COPY_EMAIL]);
    const ccRecipients = uniqueEmails([
      JASON_COPY_EMAIL,
      submitterEmail,
    ]);
    if (!toRecipients.length) {
      return NextResponse.json(
        { success: false, error: 'Kaiser intake email is required in To before sending.' },
        { status: 400 }
      );
    }
    const resolvedFileName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;

    let pdfStoragePath = '';
    let pdfStorageSignedUrl = '';
    try {
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      const ts = Date.now();
      const memberSegment = sanitizePathComponent(memberName || 'member');
      const clientSegment = sanitizePathComponent(memberClientId || applicationId || 'standalone');
      const nameSegment = sanitizePathComponent(resolvedFileName) || 'kaiser-cover-sheet.pdf';
      pdfStoragePath = `kaiser-cover-sheets/${clientSegment}/${memberSegment}/${ts}-${nameSegment}`;
      const bucket = adminStorage.bucket();
      await bucket.file(pdfStoragePath).save(pdfBuffer, {
        resumable: false,
        contentType: 'application/pdf',
        metadata: { cacheControl: 'private, max-age=0, no-store' },
      });
      const [signedUrl] = await bucket.file(pdfStoragePath).getSignedUrl({
        action: 'read',
        expires: Date.now() + PDF_RETENTION_URL_MS,
      });
      pdfStorageSignedUrl = clean(signedUrl);
    } catch (storageError) {
      console.warn('[kaiser-isp-cover-sheet/send] failed to persist PDF', storageError);
      pdfStoragePath = '';
      pdfStorageSignedUrl = '';
    }

    const providerPortal = getKaiserProviderPortal(intake.label);
    const subject = `Kaiser Cover Sheet — ${memberName}${memberMrn ? ` — MRN ${memberMrn}` : ''}`;
    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111827;">
        <p>Hello ${intake.label} Intake,</p>
        <p>Please find the Kaiser cover sheet attached.</p>
        <p style="margin: 16px 0; padding: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px;">
          <strong>Kaiser provider portal:</strong> <a href="${providerPortal.url}">${providerPortal.label}</a>
        </p>
        <p>
          <strong>Member:</strong> ${memberName}<br/>
          <strong>MRN:</strong> ${memberMrn || 'N/A'}<br/>
          <strong>Sent by:</strong> ${submitterName}
        </p>
        <p>Thank you.</p>
      </div>
    `;

    const resend = new Resend(resendKey);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: toRecipients,
      cc: ccRecipients,
      subject,
      html,
      attachments: [
        {
          filename: resolvedFileName,
          content: pdfBase64,
        },
      ],
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: String(error.message || 'Cover sheet email failed.') },
        { status: 500 }
      );
    }

    if (pdfStoragePath) {
      try {
        await attachGeneratedFormToApplication({
          applicationId: applicationId || undefined,
          memberClientId: memberClientId || undefined,
          memberMrn: memberMrn || undefined,
          formName: 'Kaiser ISP Cover Sheet',
          fileName: resolvedFileName,
          filePath: pdfStoragePath,
          downloadURL: pdfStorageSignedUrl || undefined,
          source: 'kaiser-isp-cover-sheet-send',
        });
      } catch (attachError) {
        console.warn('[kaiser-isp-cover-sheet/send] failed to attach to member files', attachError);
      }
    }

    if (memberClientId) {
      try {
        const { appendCaspioClientNote } = await import('@/lib/caspio-client-notes');
        const stamp = new Date().toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
        await appendCaspioClientNote({
          clientId2: memberClientId,
          comments: [
            `Kaiser ISP cover sheet generated and emailed to ${intake.label} Intake on ${stamp}.`,
            `Member: ${memberName}${memberMrn ? ` (MRN ${memberMrn})` : ''}.`,
            `Sent by: ${submitterName}.`,
          ].join(' '),
          assignedStaffName: submitterName || undefined,
          sourceTag: 'kaiser-cover-sheet-generated',
        });
      } catch (noteError) {
        console.warn('[kaiser-isp-cover-sheet/send] failed to append Caspio member note', noteError);
      }
    }

    return NextResponse.json({
      success: true,
      to: toRecipients,
      cc: ccRecipients,
      region: intake.label,
      providerMessageId: String(data?.id || ''),
      pdfStoragePath: pdfStoragePath || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Cover sheet email failed.') },
      { status: 500 }
    );
  }
}
