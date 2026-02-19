import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ActivityType =
  | 'status_change'
  | 'pathway_change'
  | 'date_update'
  | 'assignment_change'
  | 'note_added'
  | 'form_update'
  | 'authorization_change';

type ActivityCategory =
  | 'pathway'
  | 'kaiser'
  | 'application'
  | 'assignment'
  | 'communication'
  | 'authorization'
  | 'system';

type ActivityPriority = 'low' | 'normal' | 'high' | 'urgent';
type ActivitySource = 'admin_app' | 'caspio_sync' | 'manual_entry' | 'system_auto';

type MemberActivityInput = {
  clientId2: string;
  activityType: ActivityType;
  category: ActivityCategory;
  title: string;
  description: string;
  oldValue?: string;
  newValue?: string;
  fieldChanged: string;
  changedBy?: string;
  changedByName?: string;
  priority: ActivityPriority;
  requiresNotification: boolean;
  assignedStaff?: string[];
  relatedData?: any;
  source: ActivitySource;
};

async function requireAdmin(idToken: string) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = decoded.uid;
  const email = String((decoded as any)?.email || '').trim().toLowerCase();

  if (!uid) {
    return { ok: false as const, status: 401, error: 'Invalid token' };
  }

  const hasAdminClaim = Boolean((decoded as any)?.admin);
  const hasSuperAdminClaim = Boolean((decoded as any)?.superAdmin);
  if (hasAdminClaim || hasSuperAdminClaim) {
    return { ok: true as const, uid, email, adminDb };
  }

  if (isHardcodedAdminEmail(email)) {
    return { ok: true as const, uid, email, adminDb };
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

  if (!isAdmin) {
    return { ok: false as const, status: 403, error: 'Admin privileges required' };
  }

  return { ok: true as const, uid, email, adminDb };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const idToken = String(body?.idToken || '').trim();
    const activity = (body?.activity || null) as MemberActivityInput | null;

    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    }
    if (!activity || !activity.clientId2 || !activity.title || !activity.description) {
      return NextResponse.json({ success: false, error: 'Missing activity payload' }, { status: 400 });
    }

    const adminCheck = await requireAdmin(idToken);
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { adminDb, uid, email } = adminCheck;
    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const nowIso = new Date().toISOString();

    const changedBy = String(activity.changedBy || uid || 'system');
    const changedByName = String(activity.changedByName || email || 'Admin');

    const docRef = adminDb.collection('member_activities').doc();
    await docRef.set({
      ...activity,
      clientId2: String(activity.clientId2).trim(),
      changedBy,
      changedByName,
      timestamp: nowIso,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error: any) {
    console.error('❌ Error logging member activity:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to log activity' },
      { status: 500 }
    );
  }
}

