import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { adminAuth, adminDb, default as admin } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeDate = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const fmtDate = (value: string) => {
  if (!value) return 'cleared';
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString();
  } catch {
    return value;
  }
};

async function canUpdateIlsDates(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = normalizeEmail((decoded as any)?.email);
  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  const hasAdminClaim = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
  if (hasAdminClaim || isHardcodedAdminEmail(email)) return { ok: true as const, uid, email };

  const [adminRole, superAdminRole, ilsAccess] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get(),
    adminDb.collection('roles_super_admin').doc(uid).get(),
    adminDb.collection('system_settings').doc('ils_member_access').get(),
  ]);

  let isAdmin = adminRole.exists || superAdminRole.exists;
  if (!isAdmin && email) {
    const [emailAdminRole, emailSuperAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(email).get(),
      adminDb.collection('roles_super_admin').doc(email).get(),
    ]);
    isAdmin = emailAdminRole.exists || emailSuperAdminRole.exists;
  }
  if (isAdmin) return { ok: true as const, uid, email };

  const allowedEmails = ilsAccess.exists ? ((ilsAccess.data()?.allowedEmails || []) as unknown[]) : [];
  const allowed = allowedEmails.map(normalizeEmail).includes(email);
  if (!allowed) return { ok: false as const, status: 403, error: 'Unauthorized' };
  return { ok: true as const, uid, email };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const idToken = String(body?.idToken || '').trim();
    const clientId2 = String(body?.clientId2 || '').trim();
    const memberName = String(body?.memberName || '').trim() || `Client ${clientId2}`;
    const tierLevelRaw = String(body?.tierLevel || '').trim();
    const tierLevel = /^(1|2|3|4|5)$/.test(tierLevelRaw) ? tierLevelRaw : '';
    const tierLevelReceivedDate = normalizeDate(body?.tierLevelReceivedDate);
    const ilsContractSentDate = normalizeDate(body?.ilsContractSentDate);

    if (!idToken || !clientId2) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (
      body?.tierLevel === undefined &&
      body?.tierLevelReceivedDate === undefined &&
      body?.ilsContractSentDate === undefined
    ) {
      return NextResponse.json({ success: false, error: 'No supported fields to update' }, { status: 400 });
    }

    if (
      body?.tierLevel !== undefined &&
      !tierLevel &&
      tierLevelRaw !== ''
    ) {
      return NextResponse.json({ success: false, error: 'Invalid tier level (expected 1-5 or empty)' }, { status: 400 });
    }

    if (!tierLevelReceivedDate && !ilsContractSentDate && !tierLevel && body?.tierLevelReceivedDate !== '' && body?.ilsContractSentDate !== '' && body?.tierLevel !== '') {
      return NextResponse.json({ success: false, error: 'No valid date updates provided' }, { status: 400 });
    }

    const authz = await canUpdateIlsDates(idToken);
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

    const updates: Record<string, string> = {};
    if (body?.tierLevel !== undefined) updates.Kaiser_Tier_Level = tierLevel;
    if (body?.tierLevelReceivedDate !== undefined) updates.Kaiser_Tier_Level_Received_Date = tierLevelReceivedDate;
    if (body?.ilsContractSentDate !== undefined) updates.ILS_RCFE_Sent_For_Contract_Date = ilsContractSentDate;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No supported fields to update' }, { status: 400 });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);
    const escapedClientId2 = clientId2.replace(/'/g, "''");
    const whereClause = `Client_ID2='${escapedClientId2}'`;
    const apiUrl = `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=${encodeURIComponent(whereClause)}`;
    const caspioRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    if (!caspioRes.ok) {
      const err = await caspioRes.text().catch(() => '');
      return NextResponse.json({ success: false, error: `Failed to update Caspio (${caspioRes.status}): ${err}` }, { status: 500 });
    }

    await adminDb
      .collection('caspio_members_cache')
      .doc(clientId2)
      .set(
        {
          ...updates,
          cachedAt: new Date().toISOString(),
          Date_Modified: new Date().toISOString(),
        },
        { merge: true }
      );

    const settingsSnap = await adminDb.collection('system_settings').doc('notifications').get();
    const ilsRecipients = settingsSnap.exists ? ((settingsSnap.data()?.ilsNotePermissions || []) as unknown[]) : [];
    const recipientUids = Array.from(new Set(ilsRecipients.map((x) => String(x || '').trim()).filter(Boolean)));

    const shouldNotifyTier = body?.tierLevelReceivedDate !== undefined;
    const updateMessages: string[] = [];
    if (shouldNotifyTier) {
      updateMessages.push(`Tier Level Received Date: ${fmtDate(tierLevelReceivedDate)}`);
    }
    const summaryMessage = updateMessages.join(' | ');

    let notificationsSent = 0;
    if (shouldNotifyTier && recipientUids.length > 0) {
      await Promise.all(
        recipientUids.map(async (recipientUid) => {
          let recipientName = 'Staff';
          try {
            const userSnap = await adminDb.collection('users').doc(recipientUid).get();
            if (userSnap.exists) {
              const d = userSnap.data() as any;
              recipientName = String(d?.displayName || d?.name || d?.email || 'Staff');
            } else {
              const userRecord = await adminAuth.getUser(recipientUid);
              recipientName = String(userRecord.displayName || userRecord.email || 'Staff');
            }
          } catch {
            // Best-effort only for recipient display name.
          }

          await adminDb.collection('staff_notifications').add({
            userId: recipientUid,
            recipientName,
            title: 'K-Tier update',
            message: `${memberName} • ${summaryMessage}`,
            memberName,
            clientId2,
            type: 'ils_tier_update',
            priority: 'Priority',
            status: 'Open',
            isRead: false,
            source: 'ils-report',
            createdBy: authz.uid,
            createdByName: authz.email || 'ILS User',
            senderName: authz.email || 'ILS User',
            senderId: authz.uid,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            actionUrl: `/admin/kaiser-tracker?clientId2=${encodeURIComponent(clientId2)}`,
          });
        })
      );
      notificationsSent = recipientUids.length;
    }

    return NextResponse.json({
      success: true,
      updates,
      notificationsSent,
    });
  } catch (error: any) {
    console.error('Error updating ILS dates for Kaiser member:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update ILS dates' }, { status: 500 });
  }
}
