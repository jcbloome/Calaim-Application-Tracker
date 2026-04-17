import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

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

    const adminCheck = await requireAdminApiAuthFromIdToken(idToken, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const uid = adminCheck.uid;
    const email = adminCheck.email;
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

