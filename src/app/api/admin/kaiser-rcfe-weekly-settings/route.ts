import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeRcfeName = (value: unknown) => String(value || '').trim();
const toKey = (rcfeName: unknown, rcfeAdminEmail: unknown) =>
  `${normalizeRcfeName(rcfeName).toLowerCase()}|${normalizeEmail(rcfeAdminEmail)}`;
const DEFAULT_EMAIL_SUBJECT_TEMPLATE = 'Biweekly ILS follow-up for {{rcfeName}}';
const DEFAULT_EMAIL_BODY_TEMPLATE = [
  'Hello {{rcfeAdminName}},',
  '',
  'This is our biweekly care coordination follow-up for Kaiser members at {{rcfeName}}.',
  'Please confirm whether ILS has connected yet for each member below and let us know if any issues need support.',
  '',
  '{{memberList}}',
  '',
  '{{deydryReplyLinkList}}',
  '',
  'This outreach continues while each member has an active T2038 authorization.',
  '',
  'Thank you,',
  'Connections CalAIM Care Coordination',
].join('\n');

async function requireAdmin(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = normalizeEmail((decoded as any)?.email);
  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  if (Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin) || isHardcodedAdminEmail(email)) {
    return { ok: true as const, uid, email };
  }

  const [adminRole, superAdminRole] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get(),
    adminDb.collection('roles_super_admin').doc(uid).get(),
  ]);

  let isAdmin = adminRole.exists || superAdminRole.exists;
  if (!isAdmin && email) {
    const [emailAdminRole, emailSuperAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(email).get(),
      adminDb.collection('roles_super_admin').doc(email).get(),
    ]);
    isAdmin = emailAdminRole.exists || emailSuperAdminRole.exists;
  }
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Admin privileges required' };
  return { ok: true as const, uid, email };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const idToken = String(body?.idToken || '').trim();
    const action = String(body?.action || '').trim().toLowerCase();
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });

    const authz = await requireAdmin(idToken);
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

    const settingsRef = adminDb.collection('system_settings').doc('kaiser_rcfe_weekly_confirm');
    const snap = await settingsRef.get();
    const entries = (snap.exists ? (snap.data()?.entries as Record<string, any>) : {}) || {};
    const emailSubjectTemplate = String(snap.data()?.emailSubjectTemplate || DEFAULT_EMAIL_SUBJECT_TEMPLATE);
    const emailBodyTemplate = String(snap.data()?.emailBodyTemplate || DEFAULT_EMAIL_BODY_TEMPLATE);
    const automationEnabled = Boolean(snap.data()?.automationEnabled);
    const cadenceDays = Number.isFinite(Number(snap.data()?.cadenceDays))
      ? Math.max(1, Math.floor(Number(snap.data()?.cadenceDays)))
      : 14;

    if (action === 'get') {
      return NextResponse.json({
        success: true,
        entries,
        emailSubjectTemplate,
        emailBodyTemplate,
        automationEnabled,
        cadenceDays,
      });
    }

    if (action === 'set') {
      const rcfeName = normalizeRcfeName(body?.rcfeName);
      const rcfeAdminEmail = normalizeEmail(body?.rcfeAdminEmail);
      const enabled = Boolean(body?.enabled);
      if (!rcfeName || !rcfeAdminEmail) {
        return NextResponse.json({ success: false, error: 'rcfeName and rcfeAdminEmail are required' }, { status: 400 });
      }
      const key = toKey(rcfeName, rcfeAdminEmail);
      const next = {
        ...entries,
        [key]: {
          key,
          rcfeName,
          rcfeAdminEmail,
          enabled,
          updatedAt: new Date().toISOString(),
          updatedByEmail: authz.email || '',
        },
      };
      await settingsRef.set({ entries: next }, { merge: true });
      return NextResponse.json({
        success: true,
        entries: next,
        emailSubjectTemplate,
        emailBodyTemplate,
        automationEnabled,
        cadenceDays,
      });
    }

    if (action === 'set_template') {
      const nextSubjectTemplate = String(body?.emailSubjectTemplate || '').trim() || DEFAULT_EMAIL_SUBJECT_TEMPLATE;
      const nextBodyTemplate = String(body?.emailBodyTemplate || '').trim() || DEFAULT_EMAIL_BODY_TEMPLATE;
      const nextCadenceDays = Math.max(1, Math.floor(Number(body?.cadenceDays || 14)));
      await settingsRef.set(
        {
          emailSubjectTemplate: nextSubjectTemplate,
          emailBodyTemplate: nextBodyTemplate,
          cadenceDays: nextCadenceDays,
          updatedAt: new Date().toISOString(),
          updatedByEmail: authz.email || '',
        },
        { merge: true }
      );
      return NextResponse.json({
        success: true,
        entries,
        emailSubjectTemplate: nextSubjectTemplate,
        emailBodyTemplate: nextBodyTemplate,
        automationEnabled,
        cadenceDays: nextCadenceDays,
      });
    }

    if (action === 'set_automation') {
      const nextAutomationEnabled = Boolean(body?.automationEnabled);
      await settingsRef.set(
        {
          automationEnabled: nextAutomationEnabled,
          updatedAt: new Date().toISOString(),
          updatedByEmail: authz.email || '',
        },
        { merge: true }
      );
      return NextResponse.json({
        success: true,
        entries,
        emailSubjectTemplate,
        emailBodyTemplate,
        cadenceDays,
        automationEnabled: nextAutomationEnabled,
      });
    }

    return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to manage RCFE weekly settings' }, { status: 500 });
  }
}
