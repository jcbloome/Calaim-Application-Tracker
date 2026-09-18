import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { getKaiserRegionFromCounty } from '@/lib/kaiser-region';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KAISER_REFERRALS_COPY_EMAIL = 'kpreferrals@ilshealth.com';
const KAISER_NORTH_INTAKE_EMAIL = 'regmcdurns-kpnc@kp.org';
const KAISER_SOUTH_INTAKE_EMAIL = 'RegCareCoorCaseMgmt@kp.org';
const FROM = 'Connections CalAIM <noreply@carehomefinders.com>';

function clean(value: unknown) {
  return String(value || '').trim();
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
    const pdfBase64 = clean(body?.pdfBase64);
    const fileName = clean(body?.fileName) || `Kaiser Cover Sheet ${memberName}.pdf`;
    if (!pdfBase64) {
      return NextResponse.json({ success: false, error: 'Cover sheet PDF is required.' }, { status: 400 });
    }

    const resendKey = clean(process.env.RESEND_API_KEY);
    if (!resendKey) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
    }

    const subject = `Kaiser Cover Sheet — ${memberName}${memberMrn ? ` — MRN ${memberMrn}` : ''}`;
    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111827;">
        <p>Hello ${intake.label} Intake,</p>
        <p>Please find the Kaiser cover sheet attached.</p>
        <p>
          <strong>Member:</strong> ${memberName}<br/>
          <strong>MRN:</strong> ${memberMrn || 'N/A'}<br/>
          <strong>Sent by:</strong> ${clean(authCheck.name) || clean(authCheck.email) || 'Connections staff'}
        </p>
        <p>Thank you.</p>
      </div>
    `;

    const resend = new Resend(resendKey);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [intake.email],
      cc: [KAISER_REFERRALS_COPY_EMAIL],
      subject,
      html,
      attachments: [
        {
          filename: fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`,
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

    return NextResponse.json({
      success: true,
      to: intake.email,
      cc: [KAISER_REFERRALS_COPY_EMAIL],
      region: intake.label,
      providerMessageId: String(data?.id || ''),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Cover sheet email failed.') },
      { status: 500 }
    );
  }
}
