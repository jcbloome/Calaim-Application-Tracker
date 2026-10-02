import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { toGlobalChangeIso } from '@/lib/global-change-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();
const pick = (data: Record<string, any>, ...keys: string[]) => {
  for (const key of keys) {
    const value = clean(data?.[key]);
    if (value) return value;
  }
  return '';
};

const APPLICATION_ID_FIELDS = ['client_ID2', 'clientId2', 'Client_ID2', 'caspioClientId2'];

async function loadCachedMember(adminDb: any, clientId2: string): Promise<Record<string, any> | null> {
  const direct = await adminDb.collection('caspio_members_cache').doc(clientId2).get();
  if (direct.exists) return direct.data() || {};
  const values: Array<string | number> = [clientId2];
  if (/^\d+$/.test(clientId2)) values.push(Number(clientId2));
  for (const value of values) {
    const snap = await adminDb.collection('caspio_members_cache').where('Client_ID2', '==', value).limit(1).get();
    if (!snap.empty) return snap.docs[0].data() || {};
  }
  return null;
}

async function loadApplications(adminDb: any, clientId2: string) {
  const values: Array<string | number> = [clientId2];
  if (/^\d+$/.test(clientId2)) values.push(Number(clientId2));
  const byPath = new Map<string, any>();
  const queries: Promise<void>[] = [];
  for (const field of APPLICATION_ID_FIELDS) {
    for (const value of values) {
      // Root collection is always indexed; the collection-group query is best-effort.
      queries.push(
        adminDb
          .collection('applications')
          .where(field, '==', value)
          .limit(25)
          .get()
          .then((snap: any) => snap.docs.forEach((doc: any) => byPath.set(doc.ref.path, doc)))
          .catch(() => undefined)
      );
      queries.push(
        adminDb
          .collectionGroup('applications')
          .where(field, '==', value)
          .limit(25)
          .get()
          .then((snap: any) => snap.docs.forEach((doc: any) => byPath.set(doc.ref.path, doc)))
          .catch(() => undefined)
      );
    }
  }
  await Promise.all(queries);

  return Array.from(byPath.values())
    .map((doc: any) => {
      const data = doc.data() || {};
      const forms = Array.isArray(data.forms) ? data.forms : [];
      const userId = doc.ref.parent?.parent?.id || '';
      return {
        id: doc.id,
        path: doc.ref.path,
        userId: userId || null,
        memberName: [pick(data, 'memberFirstName', 'firstName'), pick(data, 'memberLastName', 'lastName')]
          .filter(Boolean)
          .join(' '),
        status: pick(data, 'status'),
        healthPlan: pick(data, 'healthPlan'),
        pathway: pick(data, 'pathway'),
        kaiserStatus: pick(data, 'kaiserStatus', 'Kaiser_Status'),
        calaimStatus: pick(data, 'caspioCalAIMStatus', 'CalAIM_Status'),
        formsCompleted: forms.filter((f: any) => clean(f?.status).toLowerCase() === 'completed').length,
        formsTotal: forms.length,
        updatedAtIso: toGlobalChangeIso(data.lastUpdated) || toGlobalChangeIso(data.updatedAt) || toGlobalChangeIso(data.createdAt),
      };
    })
    .sort((a, b) => Date.parse(b.updatedAtIso || '0') - Date.parse(a.updatedAtIso || '0'));
}

async function loadRecentNotes(adminDb: any, clientId2: string) {
  const snap = await adminDb.collection('client_notes').where('clientId2', '==', clientId2).limit(200).get();
  return snap.docs
    .map((doc: any) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((note: any) => !note.deleted)
    .map((note: any) => ({
      id: note.id,
      comments: clean(note.comments),
      author: clean(note.userFullName) || clean(note.userFirst),
      timeStamp: clean(note.timeStamp),
      followUpDate: clean(note.followUpDate) || undefined,
      followUpStatus: clean(note.followUpStatus) || undefined,
      followUpAssignment: clean(note.followUpAssignment) || undefined,
    }))
    .sort((a: any, b: any) => Date.parse(b.timeStamp || '0') - Date.parse(a.timeStamp || '0'))
    .slice(0, 25);
}

export async function GET(request: NextRequest, context: { params: Promise<{ clientId2: string }> }) {
  try {
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }
    const { clientId2: rawId } = await context.params;
    const clientId2 = clean(decodeURIComponent(rawId || ''));
    if (!clientId2) {
      return NextResponse.json({ success: false, error: 'clientId2 is required' }, { status: 400 });
    }

    const adminDb = authz.adminDb;
    const [cached, applications, notes] = await Promise.all([
      loadCachedMember(adminDb, clientId2).catch(() => null),
      loadApplications(adminDb, clientId2).catch(() => []),
      loadRecentNotes(adminDb, clientId2).catch(() => []),
    ]);

    const raw = cached || {};
    const member = cached
      ? {
          clientId2,
          firstName: pick(raw, 'Senior_First', 'memberFirstName', 'firstName'),
          lastName: pick(raw, 'Senior_Last', 'memberLastName', 'lastName'),
          birthDate: pick(raw, 'Birth_Date', 'birthDate', 'memberDob'),
          mrn: pick(raw, 'MCP_CIN', 'Member_MRN', 'memberMrn'),
          mediCalNumber: pick(raw, 'MediCal_Number', 'memberMediCalNum'),
          healthPlan: pick(raw, 'CalAIM_MCO', 'healthPlan'),
          calaimStatus: pick(raw, 'CalAIM_Status', 'calaimStatus'),
          kaiserStatus: pick(raw, 'Kaiser_Status', 'kaiserStatus'),
          kaiserIdStatus: pick(raw, 'Kaiser_ID_Status'),
          pathway: pick(raw, 'Pathway', 'pathway', 'SNF_Diversion_or_Transition'),
          county: pick(raw, 'Member_County', 'memberCounty', 'County'),
          phone: pick(raw, 'Member_Phone', 'memberPhone', 'Phone'),
          staffAssigned: pick(raw, 'Staff_Assigned', 'Kaiser_User_Assignment'),
          socialWorker: pick(raw, 'Social_Worker_Assigned', 'SW_Assigned'),
          rcfeName: pick(raw, 'RCFE_Name', 'rcfeName'),
          t2038AuthNumber: pick(raw, 'Authorization_Number_T2038', 'T2038_Auth_Number'),
          t2038AuthEnd: pick(raw, 'Authorization_End_Date_T2038', 'T2038_Auth_End'),
        }
      : null;

    return NextResponse.json({ success: true, member, applications, notes });
  } catch (error: any) {
    console.error('[member-360] failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load member') },
      { status: 500 }
    );
  }
}
