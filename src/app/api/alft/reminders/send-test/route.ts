import { NextRequest, NextResponse } from 'next/server';
import { sendIspDailyActionReminderEmail } from '@/app/actions/send-email';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  to?: string;
};

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 12000);
    const to = clean(body?.to, 220).toLowerCase();

    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    }
    if (!to || !to.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Enter a valid test email address.' },
        { status: 400 }
      );
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 128);
    const email = clean((decoded as any)?.email, 220).toLowerCase();
    if (!uid) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
    if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
    if (!isAdmin) {
      const [adminRole, superAdminRole, userDoc] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get(),
        adminDb.collection('users').doc(uid).get().catch(() => null),
      ]);
      const userData = userDoc?.exists ? (userDoc.data() as any) : null;
      isAdmin =
        adminRole.exists ||
        superAdminRole.exists ||
        Boolean(userData?.isKaiserAssignmentManager) ||
        Boolean(userData?.isKaiserStaff);
    }
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const sentAtIso = new Date().toISOString();
    await sendIspDailyActionReminderEmail({
      to,
      recipientName: 'Test recipient',
      recipientRole: 'msw',
      memberName: 'ISP Tracker Test Member',
      mrn: 'TEST-000',
      stageLabel: 'ISP Tracker email delivery test',
      nextAction:
        'This is a test email from ISP Tracker. If you received it, outbound reminder email is working.',
      actionUrl: '/admin/tools/isp-tracker',
      isManual: true,
      customSubject: `[TEST] ISP Tracker reminder email — ${sentAtIso.slice(0, 19)}`,
      additionalNote: `Sent by ${email || uid} as an ISP Tracker delivery test. Safe to ignore.`,
    });

    return NextResponse.json({
      success: true,
      to,
      sentAtIso,
      message: `Test ISP reminder email sent to ${to}`,
    });
  } catch (e: any) {
    console.error('[alft/reminders/send-test]', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to send test reminder email' },
      { status: 500 }
    );
  }
}
