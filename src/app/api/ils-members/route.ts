import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { adminAuth, adminDb } from '@/firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { isBlockedPortalEmail } from '@/lib/blocked-portal-emails';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildUserTokens = (email: string, displayName: string) => {
  const tokens = new Set<string>();
  const add = (value: unknown) => {
    const normalized = normalizeText(value);
    if (!normalized) return;
    tokens.add(normalized);
    normalized.split(' ').forEach((part) => {
      if (part.length >= 3) tokens.add(part);
    });
  };
  add(displayName);
  add(email);
  add(String(email || '').split('@')[0] || '');
  return Array.from(tokens);
};

const assignmentMatchesUser = (assignment: unknown, email: string, displayName: string): boolean => {
  const normalizedAssignment = normalizeText(assignment);
  if (!normalizedAssignment || /^\d+$/.test(normalizedAssignment.replace(/\s+/g, ''))) return false;
  const tokens = buildUserTokens(email, displayName);
  return tokens.some(
    (token) =>
      normalizedAssignment === token ||
      normalizedAssignment.includes(token) ||
      token.includes(normalizedAssignment)
  );
};

const isLikelyClinicalLabel = (...values: unknown[]) => {
  const merged = values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(' ');
  if (!merged) return false;
  return /\b(rn|nurse|social worker|msw|lcsw|lmft|clinical|therapist)\b/.test(merged);
};

async function canAccessIlsMembers(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return false;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = String(decoded.uid || '').trim();
    const email = normalizeEmail((decoded as any).email);
    const displayName = String((decoded as any).name || '').trim();
    if (!uid || !email) return false;
    if (isBlockedPortalEmail(email)) return false;

    if (Boolean((decoded as any).superAdmin) || isHardcodedAdminEmail(email)) return true;

    const [byUid, byEmail, ilsAccessDoc] = await Promise.all([
      adminDb.collection('roles_super_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(email).get(),
      adminDb.collection('system_settings').doc('ils_member_access').get(),
    ]);
    if (byUid.exists || byEmail.exists) return true;

    const ilsData = (ilsAccessDoc.exists ? ilsAccessDoc.data() : {}) as any;
    const allowedEmails = Array.isArray(ilsData?.allowedEmails) ? ilsData.allowedEmails.map(normalizeEmail).filter(Boolean) : [];
    if (allowedEmails.includes(email)) return true;

    const [userByUid, userByEmail, adminRoleByUid, adminRoleByEmail, swByUid, swByEmail, cacheSnap] = await Promise.all([
      adminDb.collection('users').doc(uid).get(),
      adminDb.collection('users').doc(email).get(),
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_admin').doc(email).get(),
      adminDb.collection('socialWorkers').doc(uid).get(),
      adminDb.collection('socialWorkers').doc(email).get(),
      adminDb.collection('caspio_members_cache').where('CalAIM_MCO', '==', 'Kaiser').limit(5000).get(),
    ]);

    const userData = userByUid.exists
      ? (userByUid.data() as any)
      : userByEmail.exists
        ? (userByEmail.data() as any)
        : null;

    const socialWorkerData = swByUid.exists
      ? (swByUid.data() as any)
      : swByEmail.exists
        ? (swByEmail.data() as any)
        : null;
    const isSocialWorker = Boolean(socialWorkerData && socialWorkerData.isActive !== false);

    const hasStaffFlag = Boolean(
      userData?.isStaff ||
      userData?.isKaiserStaff ||
      userData?.isHealthNetStaff ||
      userData?.isClaimsStaff ||
      userData?.isKaiserAssignmentManager ||
      adminRoleByUid.exists ||
      adminRoleByEmail.exists
    );
    if (!hasStaffFlag || isSocialWorker) return false;

    const clinicalLike = isLikelyClinicalLabel(
      displayName,
      email,
      userData?.firstName,
      userData?.lastName,
      userData?.displayName,
      userData?.role,
      userData?.roleType,
      userData?.title,
      userData?.jobTitle,
      userData?.discipline,
      userData?.credentials
    );
    if (clinicalLike) return false;

    // Keep compatibility for legacy Kaiser assignment-based staff grants.
    for (const doc of cacheSnap.docs) {
      const row = doc.data() as any;
      const assignmentCandidates = [
        row?.Kaiser_User_Assignment,
        row?.Staff_Assigned,
        row?.staff_assigned,
        row?.kaiser_user_assignment,
      ];
      if (assignmentCandidates.some((candidate) => assignmentMatchesUser(candidate, email, displayName))) {
        return true;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await canAccessIlsMembers(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    console.log('📥 Fetching ILS members from Caspio...');

    const credentials = getCaspioCredentialsFromEnv();

    // Get OAuth token
    const accessToken = await getCaspioToken(credentials);
    console.log('✅ Got Caspio OAuth token');

    // Fetch ILS members from CalAIM_tbl_Members table
    // ILS members are those with ILS_View = 'Yes' or similar criteria
    const membersUrl = `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=ILS_View='Yes'&q.limit=1000`;
    
    const membersResponse = await fetch(membersUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!membersResponse.ok) {
      console.error('❌ Failed to fetch ILS members:', membersResponse.status);
      const errorText = await membersResponse.text();
      console.error('Error details:', errorText);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch ILS members from Caspio' },
        { status: 500 }
      );
    }

    const membersData = await membersResponse.json();
    console.log(`📊 Raw Caspio response: ${membersData.Result?.length || 0} records`);

    if (!membersData.Result || !Array.isArray(membersData.Result)) {
      console.error('❌ Invalid response format from Caspio');
      return NextResponse.json(
        { success: false, error: 'Invalid response format from Caspio' },
        { status: 500 }
      );
    }


    // Map Caspio fields to ILS member format using correct field names
    const ilsMembers = membersData.Result.map((member: any) => ({
      memberFirstName: member.Senior_First || '',
      memberLastName: member.Senior_Last || '',
      memberFullName: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
      // Prefer MCP_CIN (CalAIM_tbl_Members), fallback to MediCal_Number
      memberMrn: member.MCP_CIN || member.MediCal_Number || '',
      birthDate: member.Birth_Date || '',
      CalAIM_Status: member.CalAIM_Status || '',
      Kaiser_Status: member.Kaiser_Status || '',
      T2038_Auth_Email_Kaiser: member.T2038_Auth_Email_Kaiser || '',
      Tier_Level_Request_Date:
        member.Kaiser_Tier_Level_Requested_Date ||
        member.Tier_Level_Request_Date ||
        member.Tier_Level_Requested_Date ||
        member.Tier_Request_Date ||
        '',
      pathway: member.SNF_Diversion_or_Transition || '',
      healthPlan: member.CalAIM_MCO || '',
      ILS_View: member.ILS_View || '',
      bestContactFirstName: member.Authorized_Party_First || '',
      bestContactLastName: member.Authorized_Party_Last || '',
      bestContactPhone: member.Authorized_Party_Phone || member.Best_Phone || '',
      bestContactEmail: member.Authorized_Party_Email || '',
      lastUpdated: member.Timestamp || '',
      created_date: member.Timestamp || '',
      client_ID2: member.Client_ID2 || '',
    }));

    console.log(`✅ Successfully processed ${ilsMembers.length} ILS members`);

    return NextResponse.json({
      success: true,
      members: ilsMembers,
      count: ilsMembers.length,
    });

  } catch (error) {
    console.error('❌ Error in ILS members API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}