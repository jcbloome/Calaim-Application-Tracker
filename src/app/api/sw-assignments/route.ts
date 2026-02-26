import { NextRequest, NextResponse } from 'next/server';
import { normalizeRcfeNameForAssignment } from '@/lib/rcfe-utils';

function isNewAssignmentForEmail(member: any, email: string) {
  const requested = String(email || '').trim().toLowerCase();
  if (!requested) return false;

  const changedTo = String(member?.assignmentChangedTo || '').trim().toLowerCase();
  if (changedTo && changedTo !== requested) return false;

  const changedAtRaw = member?.assignmentChangedAt;
  if (!changedAtRaw) return false;
  const changedAt = new Date(String(changedAtRaw));
  if (Number.isNaN(changedAt.getTime())) return false;

  const ageMs = Date.now() - changedAt.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return ageMs >= 0 && ageMs <= sevenDaysMs;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 [SW-ASSIGNMENTS] Fetching assignments for SW (cache): ${email}`);

    // Read from Firestore cache instead of hitting Caspio directly.
    const adminModule = await import('@/firebase-admin');
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;

    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice('bearer '.length).trim()
      : '';
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token).catch(() => null as any);
    const tokenEmail = String(decoded?.email || '').trim().toLowerCase();
    const requestedEmail = String(email || '').trim().toLowerCase();
    if (!tokenEmail || !requestedEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (tokenEmail !== requestedEmail) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const cache = adminDb.collection('caspio_members_cache');
    const [swSnap, kaiserSnap] = await Promise.all([
      cache.where('Social_Worker_Assigned', '==', requestedEmail).limit(5000).get().catch(() => null as any),
      cache.where('Kaiser_User_Assignment', '==', requestedEmail).limit(5000).get().catch(() => null as any),
    ]);

    const byId = new Map<string, any>();
    const addSnap = (snap: any) => {
      if (!snap?.docs) return;
      snap.docs.forEach((d: any) => {
        if (!d?.id) return;
        byId.set(String(d.id), d.data?.() ? d.data() : d.data);
      });
    };
    addSnap(swSnap);
    addSnap(kaiserSnap);

    const members = Array.from(byId.entries()).map(([id, data]) => ({ id, ...(data || {}) }));
    console.log(`✅ [SW-ASSIGNMENTS] Found ${members.length} assigned members (cache)`);

    // Group members by RCFE facility
    const rcfeFacilities = new Map();

    members.forEach((member: any) => {
      const rcfeName = normalizeRcfeNameForAssignment(member.RCFE_Name);
      // Do not include placeholder RCFE names (e.g. "CalAIM_Use...") in assignments.
      if (!rcfeName) return;
      const addressLine = String(member.RCFE_Address || '').trim();
      const city = String(member.RCFE_City || member.RCFE_City2 || member.MemberCity || member.Member_City || '').trim();
      const state = String(member.RCFE_State || '').trim();
      const zip = String(member.RCFE_Zip || '').trim();
      const rcfeAddress = [addressLine, [city, state].filter(Boolean).join(', '), zip].filter(Boolean).join(' ').trim()
        || 'Address not available';
      
      if (!rcfeFacilities.has(rcfeName)) {
        rcfeFacilities.set(rcfeName, {
          id: rcfeName.toLowerCase().replace(/\s+/g, '-'),
          name: rcfeName,
          address: rcfeAddress,
          city: city || 'Unknown',
          county: String(member.RCFE_County || member.Member_County || '').trim() || 'Unknown',
          members: []
        });
      }

      rcfeFacilities.get(rcfeName).members.push({
        id: member.Client_ID2 || member.client_ID2 || member.id || Math.random().toString(),
        name: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
        roomNumber: member.Room_Number || undefined,
        careLevel: member.Care_Level || 'Medium',
        lastVisit: member.Last_Visit_Date || undefined,
        nextVisit: member.Next_Visit_Date || undefined,
        status: member.CalAIM_Status === 'Authorized' ? 'Active' : 'Inactive',
        notes: member.Visit_Notes || undefined,
        isNewAssignment: isNewAssignmentForEmail(member, requestedEmail),
        assignmentChangedAt: member?.assignmentChangedAt || null,
      });
    });

    const facilities = Array.from(rcfeFacilities.values());

    console.log(`📋 [SW-ASSIGNMENTS] Organized into ${facilities.length} RCFE facilities`);

    return NextResponse.json({
      success: true,
      socialWorker: {
        email: email,
        assignedMembers: facilities.reduce((sum: number, f: any) => sum + (Array.isArray(f.members) ? f.members.length : 0), 0),
        rcfeFacilities: facilities.length
      },
      facilities: facilities,
      totalMembers: facilities.reduce((sum: number, f: any) => sum + (Array.isArray(f.members) ? f.members.length : 0), 0)
    });

  } catch (error: any) {
    console.error('❌ [SW-ASSIGNMENTS] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch SW assignments',
        details: error.message 
      },
      { status: 500 }
    );
  }
}