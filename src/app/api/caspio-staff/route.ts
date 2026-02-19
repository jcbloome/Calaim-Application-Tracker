import { NextRequest, NextResponse } from 'next/server';
import { fetchCaspioSocialWorkers, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log('📥 Fetching MSW staff from Caspio CalAIM_tbl_Members...');
    const credentials = getCaspioCredentialsFromEnv();

    // Fetch MSW staff from Caspio using shared logic
    const staffMembers = await fetchCaspioSocialWorkers(credentials);
    
    if (staffMembers.length === 0) {
      return NextResponse.json({
        success: true,
        staff: [],
        message: 'No MSW staff found in CalAIM_tbl_Members'
      });
    }

    // Sort by name
    const sortedStaff = staffMembers.sort((a, b) => {
      const nameA = (a.name || '').toString();
      const nameB = (b.name || '').toString();
      return nameA.localeCompare(nameB);
    });

    console.log(`✅ Returning ${sortedStaff.length} MSW staff members with assignment counts`);

    return NextResponse.json({
      success: true,
      staff: sortedStaff,
      message: `Found ${sortedStaff.length} MSW staff members`
    });

  } catch (error: any) {
    console.error('❌ Error fetching MSW staff:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch MSW staff from Caspio',
      staff: []
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, staffId, memberId, idToken } = await request.json();

    if (action === 'assignMember' && staffId && memberId) {
      // Update member's SW_ID in CalAIM_tbl_Members
      const credentials = getCaspioCredentialsFromEnv();
      const token = await getCaspioToken(credentials);
      
      const updateUrl = `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=Client_ID2='${memberId}'`;
      
      const updateData = {
        SW_ID: staffId,
        LastUpdated: new Date().toISOString()
      };

      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error(`Failed to update member assignment: ${response.status} ${response.statusText}`);
      }

      // Best-effort: log member activity (real audit trail)
      try {
        const adminModule = await import('@/firebase-admin');
        const adminDb = adminModule.adminDb;
        const admin = adminModule.default;

        let changedBy = 'system';
        let changedByName = 'System';
        try {
          if (idToken) {
            const decoded = await adminModule.adminAuth.verifyIdToken(String(idToken));
            changedBy = decoded.uid || changedBy;
            changedByName = String((decoded as any)?.name || decoded.email || 'Admin');
          }
        } catch {
          // ignore decode issues
        }

        await adminDb.collection('member_activities').add({
          clientId2: String(memberId),
          activityType: 'assignment_change',
          category: 'assignment',
          title: 'Social worker assigned',
          description: `SW_ID set to "${staffId}" for member ${memberId}.`,
          oldValue: '',
          newValue: String(staffId),
          fieldChanged: 'SW_ID',
          changedBy,
          changedByName,
          priority: 'normal',
          requiresNotification: true,
          source: 'admin_app',
          timestamp: new Date().toISOString(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch {
        // best-effort only
      }

      return NextResponse.json({
        success: true,
        message: `Member ${memberId} assigned to staff ${staffId}`
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action or missing parameters'
    }, { status: 400 });

  } catch (error: any) {
    console.error('❌ Error updating staff assignment:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update staff assignment'
    }, { status: 500 });
  }
}