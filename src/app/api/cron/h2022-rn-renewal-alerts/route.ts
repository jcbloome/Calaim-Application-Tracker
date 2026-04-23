import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let adminDb: any;
try {
  if (!getApps().length) {
    const app = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94',
    });
    adminDb = getFirestore(app);
  } else {
    adminDb = getFirestore();
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

const clean = (value: unknown) => String(value || '').trim();

const parseDate = (value: unknown): Date | null => {
  const raw = clean(value);
  if (!raw) return null;
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso;
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = Number(mdy[1]);
    const dd = Number(mdy[2]);
    const yyyy = Number(mdy[3]);
    const d = new Date(yyyy, mm - 1, dd);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
};

const toYmd = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not configured' }, { status: 500 });
    }

    const reviewSettingsSnap = await adminDb.collection('system_settings').doc('review_notifications').get();
    const reviewSettings = reviewSettingsSnap.exists ? (reviewSettingsSnap.data() as any) : {};
    const recipients = (reviewSettings?.recipients || {}) as Record<string, any>;
    const kaiserRecipientEntries = Object.entries(recipients).filter(([, r]) =>
      Boolean(r?.enabled) && Boolean(r?.kaiserRnVisitAssigner)
    );
    const healthNetManagerEntries = Object.entries(recipients).filter(([, r]) =>
      Boolean(r?.enabled) && Boolean(r?.healthNetUploads)
    );

    if (!kaiserRecipientEntries.length && !healthNetManagerEntries.length) {
      return NextResponse.json({
        success: true,
        message: 'No enabled recipients configured for Kaiser RN Visit Assigner or Health Net Manager tasks.',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 30);
    const todayYmd = toYmd(today);
    const cutoffYmd = toYmd(cutoff);

    const memberSnap = await adminDb
      .collection('caspio_members_cache')
      .where('Authorization_End_Date_H2022', '>=', todayYmd)
      .limit(10000)
      .get()
      .catch(() => null);

    const expiringMembers = (memberSnap?.docs || [])
      .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
      .map((m: any) => {
        const endDate = parseDate(m?.Authorization_End_Date_H2022);
        if (!endDate) return null;
        const endYmd = toYmd(endDate);
        if (endYmd < todayYmd || endYmd > cutoffYmd) return null;
        const memberName = `${clean(m?.Senior_First)} ${clean(m?.Senior_Last)}`.trim() || 'Member';
        const clientId2 = clean(m?.client_ID2 || m?.Client_ID2 || m?.MCP_CIN || m?.MRN || m?.MC) || m.id;
        const healthPlan = clean(m?.CalAIM_MCO) || 'Unknown';
        const county = clean(m?.Member_County) || '';
        return {
          memberName,
          clientId2,
          healthPlan,
          county,
          h2022EndDate: endYmd,
          kaiserStatus: clean(m?.Kaiser_Status),
        };
      })
      .filter(Boolean) as Array<{
      memberName: string;
      clientId2: string;
      healthPlan: string;
      county: string;
      h2022EndDate: string;
      kaiserStatus: string;
    }>;

    if (!expiringMembers.length) {
      return NextResponse.json({
        success: true,
        message: 'No H2022 authorizations ending within 30 days.',
        kaiserRecipients: kaiserRecipientEntries.length,
        healthNetManagers: healthNetManagerEntries.length,
      });
    }

    let dailyTasksCreated = 0;
    let kaiserTasksCreated = 0;
    let healthNetTasksCreated = 0;
    const actionUrl = `/admin/authorization-tracker`;

    for (const member of expiringMembers) {
      const plan = clean(member.healthPlan).toLowerCase();
      const isHealthNet = plan.includes('health net') || plan.includes('healthnet');
      const assignees = isHealthNet ? healthNetManagerEntries : kaiserRecipientEntries;

      for (const [assigneeUid, assignee] of assignees) {
        const assigneeName =
          clean(assignee?.label) ||
          clean(assignee?.email) ||
          (isHealthNet ? 'Health Net Manager' : 'RN Visit Assigner (Kaiser)');
        const roleKey = isHealthNet ? 'healthnet-manager' : 'rn-visit-assigner';
        const taskId = `h2022-renewal-task-${roleKey}-${assigneeUid}-${clean(member.clientId2).replace(/[^a-zA-Z0-9_-]/g, '')}-${member.h2022EndDate}`;
        const title = isHealthNet
          ? `Review H2022 renewal: ${member.memberName} (Health Net)`
          : `Schedule RN visit: ${member.memberName} (H2022 ending soon)`;
        const description = isHealthNet
          ? `H2022 ends on ${member.h2022EndDate}. Health Net does not require a physical RN visit; review renewal and update action notes.`
          : `H2022 ends on ${member.h2022EndDate}. Schedule renewal RN visit.`;
        const notes = isHealthNet
          ? 'Action items: 1) Review Health Net renewal readiness, 2) Update authorization notes, 3) Track follow-up completion in the portal.'
          : 'Action items: 1) Schedule RN visit for renewal, 2) Update authorization notes, 3) Confirm follow-up completion in the portal.';
        const tags = isHealthNet
          ? ['h2022', 'renewal', 'authorization', 'health-net']
          : ['h2022', 'rn-renewal', 'authorization', 'kaiser'];

        try {
          await adminDb.collection('adminDailyTasks').doc(taskId).create({
            title,
            description,
            memberName: member.memberName,
            memberClientId: member.clientId2,
            healthPlan: member.healthPlan,
            assignedTo: assigneeUid,
            assignedToName: assigneeName,
            priority: 'high',
            status: 'pending',
            dueDate: member.h2022EndDate,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: 'system',
            notes,
            tags,
            applicationLink: actionUrl,
            source: isHealthNet ? 'caspio_health_net' : 'caspio_kaiser',
          });
          dailyTasksCreated += 1;
          if (isHealthNet) healthNetTasksCreated += 1;
          else kaiserTasksCreated += 1;
        } catch (error: any) {
          const alreadyExists = String(error?.code || '').toLowerCase() === '6' || String(error?.message || '').toLowerCase().includes('already exists');
          if (!alreadyExists) {
            console.warn('Failed to create H2022 daily task:', error);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      expiringMembers: expiringMembers.length,
      kaiserRecipients: kaiserRecipientEntries.length,
      healthNetManagers: healthNetManagerEntries.length,
      dailyTasksCreated,
      kaiserTasksCreated,
      healthNetTasksCreated,
      emailsSent: 0,
    });
  } catch (error: any) {
    console.error('h2022-rn-renewal-alerts cron error:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Cron failed') },
      { status: 500 }
    );
  }
}

