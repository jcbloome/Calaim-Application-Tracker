import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DigestRow = {
  staffName: string;
  total: number;
  critical: number;
  priority: number;
  aged14Plus: number;
  aged21Plus: number;
};

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const slug = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

async function resolveStaffUsers(adminDb: any, rows: DigestRow[]) {
  const usersSnap = await adminDb.collection('users').where('isStaff', '==', true).limit(5000).get();
  const byNormalized = new Map<string, Array<{ uid: string; name: string; email: string }>>();

  usersSnap.forEach((docSnap: any) => {
    const data = docSnap.data() || {};
    const first = String(data?.firstName || '').trim();
    const last = String(data?.lastName || '').trim();
    const displayName = String(data?.displayName || '').trim();
    const email = String(data?.email || '').trim().toLowerCase();
    const fullName = [first, last].filter(Boolean).join(' ').trim();
    const candidates = [fullName, displayName, email.split('@')[0]];

    candidates
      .map((candidate) => normalizeText(candidate))
      .filter(Boolean)
      .forEach((key) => {
        const list = byNormalized.get(key) || [];
        list.push({
          uid: String(docSnap.id),
          name: fullName || displayName || email || docSnap.id,
          email,
        });
        byNormalized.set(key, list);
      });
  });

  const matches = new Map<string, { uid: string; name: string; email: string }>();
  rows.forEach((row) => {
    const key = normalizeText(row.staffName);
    if (!key || key === 'unassigned') return;
    const hit = (byNormalized.get(key) || [])[0];
    if (hit) matches.set(row.staffName, hit);
  });

  return matches;
}

async function resolveManagerUids(adminDb: any): Promise<string[]> {
  const [admins, superAdmins] = await Promise.all([
    adminDb.collection('roles_admin').limit(5000).get(),
    adminDb.collection('roles_super_admin').limit(5000).get(),
  ]);
  return Array.from(new Set([...admins.docs.map((d: any) => String(d.id)), ...superAdmins.docs.map((d: any) => String(d.id))]));
}

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { adminDb, uid: actorUid } = adminCheck;
    const body = (await req.json().catch(() => ({}))) as any;
    const weekKey = String(body?.weekKey || '').trim();
    const rows = (Array.isArray(body?.rows) ? body.rows : []) as DigestRow[];
    const totalMembers = Number(body?.totalMembers || 0);

    if (!weekKey) {
      return NextResponse.json({ success: false, error: 'weekKey is required' }, { status: 400 });
    }
    if (!rows.length) {
      return NextResponse.json({ success: true, sent: 0, message: 'No rows to notify' });
    }

    const staffMatches = await resolveStaffUsers(adminDb, rows);
    const managerUids = await resolveManagerUids(adminDb);
    const batch = adminDb.batch();
    const nowMs = Date.now();

    let sent = 0;
    rows.forEach((row) => {
      const rowKey = slug(row.staffName || 'unassigned');
      const title = `Weekly Kaiser no-action digest (${weekKey})`;
      const message =
        `${row.staffName}: ${row.total} flagged • Critical ${row.critical} • Priority ${row.priority} • 14+ days ${row.aged14Plus} • 21+ days ${row.aged21Plus}`;

      const staffUser = staffMatches.get(row.staffName);
      if (staffUser?.uid) {
        const docId = `kaiser-weekly-${weekKey}-${rowKey}-${slug(staffUser.uid)}`;
        const ref = adminDb.collection('staff_notifications').doc(docId);
        batch.set(
          ref,
          {
            id: docId,
            userId: staffUser.uid,
            title,
            message,
            type: 'kaiser_weekly_digest',
            source: 'kaiser-no-action',
            isRead: false,
            hiddenFromInbox: false,
            priority: row.critical > 0 ? 'Urgent' : row.priority > 0 ? 'Priority' : 'General',
            requiresStaffAction: row.total > 0,
            memberName: '',
            healthPlan: 'Kaiser',
            weekKey,
            digestForStaff: row.staffName,
            digestBreakdown: row,
            actionUrl: '/admin/kaiser-tracker',
            createdAtMs: nowMs,
            timestamp: nowMs,
            generatedByUid: actorUid,
          },
          { merge: true }
        );
        sent += 1;
      }

      managerUids.forEach((managerUid) => {
        const docId = `kaiser-weekly-${weekKey}-${rowKey}-manager-${slug(managerUid)}`;
        const ref = adminDb.collection('staff_notifications').doc(docId);
        batch.set(
          ref,
          {
            id: docId,
            userId: managerUid,
            title,
            message,
            type: 'kaiser_weekly_digest_manager',
            source: 'kaiser-no-action',
            isRead: false,
            hiddenFromInbox: false,
            priority: row.critical > 0 ? 'Urgent' : row.priority > 0 ? 'Priority' : 'General',
            requiresStaffAction: row.total > 0,
            memberName: '',
            healthPlan: 'Kaiser',
            weekKey,
            digestForStaff: row.staffName,
            digestBreakdown: row,
            actionUrl: '/admin/kaiser-tracker',
            createdAtMs: nowMs,
            timestamp: nowMs,
            generatedByUid: actorUid,
          },
          { merge: true }
        );
        sent += 1;
      });
    });

    await batch.commit();
    return NextResponse.json({
      success: true,
      sent,
      staffRows: rows.length,
      managers: managerUids.length,
      matchedStaffUsers: Array.from(staffMatches.keys()),
    });
  } catch (error: any) {
    console.error('❌ [KAISER-WEEKLY-DIGEST] failed:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to send weekly digest' }, { status: 500 });
  }
}
