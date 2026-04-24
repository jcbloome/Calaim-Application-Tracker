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
const normalizeKaiserStatus = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

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

const composeAddress = (...parts: Array<unknown>) =>
  parts
    .map((part) => clean(part))
    .filter(Boolean)
    .join(', ')
    .replace(/,\s*,/g, ', ')
    .trim();

const normalizeDateInput = (value: unknown) => {
  const parsed = parseDate(value);
  return parsed ? toYmd(parsed) : clean(value);
};

const buildKaiserReferralActionUrl = (params: {
  member: Record<string, any>;
  memberName: string;
  clientId2: string;
  referralDate: string;
  taskId: string;
}) => {
  const { member, memberName, clientId2, referralDate, taskId } = params;
  const query = new URLSearchParams();

  const memberAddress = composeAddress(
    member?.Member_Address || member?.Address || member?.Street_Address || member?.memberAddress,
    member?.Member_City || member?.City || member?.memberCity,
    [member?.Member_State || member?.State || member?.memberState, member?.Member_Zip || member?.Zip || member?.memberZip]
      .map((part) => clean(part))
      .filter(Boolean)
      .join(' ')
  );
  const caregiverName = `${clean(member?.Caregiver_First || member?.CaregiverFirstName || member?.Best_Contact_First)} ${clean(
    member?.Caregiver_Last || member?.CaregiverLastName || member?.Best_Contact_Last
  )}`.trim();
  const caregiverContact =
    clean(member?.Caregiver_Contact || member?.Caregiver_Phone || member?.Best_Contact_Phone || member?.Best_Contact_Email) || '';

  const setIfPresent = (key: string, value: unknown) => {
    const text = clean(value);
    if (text) query.set(key, text);
  };

  query.set('returnTo', '/admin/daily-tasks');
  query.set('memberName', memberName || 'Member');
  query.set('memberMrn', clean(member?.MRN || member?.Member_MRN || member?.MCP_CIN || member?.MC || clientId2));
  query.set('memberMediCal', clean(member?.MCP_CIN || member?.Medical_Number || member?.Medi_Cal || member?.MC || ''));
  query.set('referralDate', referralDate);
  query.set('healthPlan', clean(member?.CalAIM_MCO || 'Kaiser'));
  query.set('memberCounty', clean(member?.Member_County || member?.County || ''));
  query.set('kaiserAuthAlreadyReceived', '0');
  query.set('taskId', taskId);
  query.set('memberClientId', clientId2);
  query.set('referralContext', 'kaiser_t2038_expiring_task');

  setIfPresent('memberDob', normalizeDateInput(member?.DOB || member?.Senior_DOB || member?.Date_Of_Birth || member?.Member_DOB));
  setIfPresent('memberPhone', member?.Senior_Phone || member?.Member_Phone || member?.Phone || member?.Best_Contact_Phone);
  setIfPresent('memberEmail', member?.Member_Email || member?.Email || member?.Best_Contact_Email);
  setIfPresent('memberAddress', memberAddress);
  setIfPresent('caregiverName', caregiverName);
  setIfPresent('caregiverContact', caregiverContact);
  setIfPresent('currentLocationName', member?.RCFE_Name || member?.Facility_Name);
  setIfPresent('currentLocationAddress', member?.RCFE_Address || memberAddress);

  return `/forms/kaiser-referral/printable?${query.toString()}`;
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
    const kaiserManagerEntries = Object.entries(recipients).filter(([, r]) =>
      Boolean(r?.enabled) && Boolean(r?.kaiserUploads)
    );
    const healthNetManagerEntries = Object.entries(recipients).filter(([, r]) =>
      Boolean(r?.enabled) && Boolean(r?.healthNetUploads)
    );

    if (!kaiserRecipientEntries.length && !kaiserManagerEntries.length && !healthNetManagerEntries.length) {
      return NextResponse.json({
        success: true,
        message: 'No enabled recipients configured for Kaiser RN Visit Assigner, Kaiser Manager, or Health Net Manager tasks.',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 30);
    const todayYmd = toYmd(today);
    const cutoffYmd = toYmd(cutoff);

    const [h2022Snap, t2038Snap] = await Promise.all([
      adminDb
        .collection('caspio_members_cache')
        .where('Authorization_End_Date_H2022', '>=', todayYmd)
        .limit(10000)
        .get()
        .catch(() => null),
      adminDb
        .collection('caspio_members_cache')
        .where('Authorization_End_Date_T2038', '>=', todayYmd)
        .limit(10000)
        .get()
        .catch(() => null),
    ]);
    const memberById = new Map<string, any>();
    (h2022Snap?.docs || []).forEach((d: any) => memberById.set(String(d.id), { id: d.id, ...(d.data() as any) }));
    (t2038Snap?.docs || []).forEach((d: any) => memberById.set(String(d.id), { id: d.id, ...(d.data() as any) }));
    const allMembers = Array.from(memberById.values());

    const expiringH2022Members = allMembers
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

    const expiringKaiserT2038Members = allMembers
      .map((m: any) => {
        const healthPlan = clean(m?.CalAIM_MCO);
        const plan = healthPlan.toLowerCase();
        if (!plan.includes('kaiser')) return null;
        const kaiserStatus = clean(m?.Kaiser_Status);
        if (normalizeKaiserStatus(kaiserStatus) === 'final member at rcfe') return null;
        const endDate = parseDate(m?.Authorization_End_Date_T2038 || m?.Authorization_End_T2038);
        if (!endDate) return null;
        const endYmd = toYmd(endDate);
        if (endYmd < todayYmd || endYmd > cutoffYmd) return null;
        const memberName = `${clean(m?.Senior_First)} ${clean(m?.Senior_Last)}`.trim() || 'Member';
        const clientId2 = clean(m?.client_ID2 || m?.Client_ID2 || m?.MCP_CIN || m?.MRN || m?.MC) || m.id;
        const county = clean(m?.Member_County) || '';
        return {
          memberName,
          clientId2,
          healthPlan,
          county,
          t2038EndDate: endYmd,
          kaiserStatus,
        };
      })
      .filter(Boolean) as Array<{
      memberName: string;
      clientId2: string;
      healthPlan: string;
      county: string;
      t2038EndDate: string;
      kaiserStatus: string;
    }>;

    if (!expiringH2022Members.length && !expiringKaiserT2038Members.length) {
      return NextResponse.json({
        success: true,
        message: 'No H2022 or applicable T2038 authorizations ending within 30 days.',
        kaiserRecipients: kaiserRecipientEntries.length,
        kaiserManagers: kaiserManagerEntries.length,
        healthNetManagers: healthNetManagerEntries.length,
      });
    }

    let dailyTasksCreated = 0;
    let kaiserTasksCreated = 0;
    let kaiserManagerTasksCreated = 0;
    let healthNetTasksCreated = 0;
    const actionUrl = `/admin/authorization-tracker`;

    for (const member of expiringH2022Members) {
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

    for (const member of expiringKaiserT2038Members) {
      for (const [assigneeUid, assignee] of kaiserManagerEntries) {
        const assigneeName =
          clean(assignee?.label) ||
          clean(assignee?.email) ||
          'Kaiser Manager';
        const taskId = `t2038-renewal-task-kaiser-manager-${assigneeUid}-${clean(member.clientId2).replace(/[^a-zA-Z0-9_-]/g, '')}-${member.t2038EndDate}`;
        const sourceMember = allMembers.find((candidate) => clean(candidate?.client_ID2 || candidate?.Client_ID2 || candidate?.MCP_CIN || candidate?.MRN || candidate?.MC || candidate?.id) === clean(member.clientId2)) || {};
        const referralActionUrl = buildKaiserReferralActionUrl({
          member: sourceMember,
          memberName: member.memberName,
          clientId2: member.clientId2,
          referralDate: todayYmd,
          taskId,
        });
        const title = `Generate Kaiser referral: ${member.memberName} (T2038 expiring)`;
        const description = `T2038 ends on ${member.t2038EndDate}. Member is not Final- Member at RCFE; open prefilled referral and submit reauthorization request to Kaiser.`;
        const notes = `Action items: 1) Open "Generate Kaiser Referral Form" from this task, 2) Confirm Kaiser status (${member.kaiserStatus || 'Unknown'}), 3) Send referral to Kaiser intake, 4) Confirm submission in Kaiser referral logs.`;
        const tags = ['t2038', 'renewal', 'authorization', 'kaiser-manager'];
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
            dueDate: member.t2038EndDate,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: 'system',
            notes,
            tags,
            applicationLink: referralActionUrl,
            source: 'caspio_kaiser_t2038',
          });
          dailyTasksCreated += 1;
          kaiserManagerTasksCreated += 1;
        } catch (error: any) {
          const alreadyExists = String(error?.code || '').toLowerCase() === '6' || String(error?.message || '').toLowerCase().includes('already exists');
          if (!alreadyExists) {
            console.warn('Failed to create Kaiser T2038 daily task:', error);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      expiringH2022Members: expiringH2022Members.length,
      expiringKaiserT2038Members: expiringKaiserT2038Members.length,
      kaiserRecipients: kaiserRecipientEntries.length,
      kaiserManagers: kaiserManagerEntries.length,
      healthNetManagers: healthNetManagerEntries.length,
      dailyTasksCreated,
      kaiserTasksCreated,
      kaiserManagerTasksCreated,
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

