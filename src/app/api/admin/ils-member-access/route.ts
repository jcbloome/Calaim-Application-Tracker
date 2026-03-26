import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { isBlockedPortalEmail } from '@/lib/blocked-portal-emails';

const SETTINGS_DOC = adminDb.collection('system_settings').doc('ils_member_access');

type Requester = {
  uid: string;
  email: string;
  isSuperAdmin: boolean;
};

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

async function getRequester(request: NextRequest): Promise<Requester | null> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = String(decoded.uid || '').trim();
    const email = normalizeEmail((decoded as any).email);
    if (!uid || !email) return null;
    if (isBlockedPortalEmail(email)) return null;

    let isSuperAdmin = Boolean((decoded as any).superAdmin) || isHardcodedAdminEmail(email);
    if (!isSuperAdmin) {
      const [byUid, byEmail] = await Promise.all([
        adminDb.collection('roles_super_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isSuperAdmin = byUid.exists || byEmail.exists;
    }

    return { uid, email, isSuperAdmin };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const requester = await getRequester(request);
    if (!requester) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const doc = await SETTINGS_DOC.get();
    const data = (doc.exists ? doc.data() : {}) as any;
    const allowedEmails = Array.isArray(data?.allowedEmails) ? data.allowedEmails.map(normalizeEmail).filter(Boolean) : [];
    const weeklyEmailEnabled = Boolean(data?.weeklyEmailEnabled);
    const weeklyEmailRecipients = Array.isArray(data?.weeklyEmailRecipients)
      ? data.weeklyEmailRecipients.map(normalizeEmail).filter(Boolean)
      : [];

    const canAccessIlsMembersPage = requester.isSuperAdmin || allowedEmails.includes(requester.email);

    return NextResponse.json({
      success: true,
      canAccessIlsMembersPage,
      isSuperAdmin: requester.isSuperAdmin,
      settings: requester.isSuperAdmin
        ? {
            allowedEmails,
            weeklyEmailEnabled,
            weeklyEmailRecipients,
            weeklySendDay: 'wednesday',
          }
        : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load ILS access settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const requester = await getRequester(request);
    if (!requester?.isSuperAdmin) {
      return NextResponse.json({ success: false, error: 'Super Admin required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const allowedEmails = Array.isArray(body?.allowedEmails)
      ? body.allowedEmails.map(normalizeEmail).filter((email: string) => Boolean(email) && !isBlockedPortalEmail(email))
      : [];
    const weeklyEmailEnabled = Boolean(body?.weeklyEmailEnabled);
    const weeklyEmailRecipients = Array.isArray(body?.weeklyEmailRecipients)
      ? body.weeklyEmailRecipients
          .map(normalizeEmail)
          .filter((email: string) => Boolean(email) && !isBlockedPortalEmail(email))
      : [];

    await SETTINGS_DOC.set(
      {
        allowedEmails: Array.from(new Set(allowedEmails)),
        weeklyEmailEnabled,
        weeklyEmailRecipients: Array.from(new Set(weeklyEmailRecipients)),
        weeklySendDay: 'wednesday',
        updatedAt: new Date().toISOString(),
        updatedByUid: requester.uid,
        updatedByEmail: requester.email,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save ILS access settings' }, { status: 500 });
  }
}

