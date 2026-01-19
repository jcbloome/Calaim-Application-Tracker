import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeFirebaseAdmins = searchParams.get('includeFirebaseAdmins') === 'true';
    const includeCaspioStaff = searchParams.get('includeCaspioStaff') !== 'false'; // Default to true

    let allStaff: any[] = [];

    // Fetch Firebase admin users if requested
    if (includeFirebaseAdmins) {
      try {
        const adminRolesSnap = await adminDb.collection('roles_admin').get();
        const superAdminRolesSnap = await adminDb.collection('roles_super_admin').get();

        const adminIds = new Set(adminRolesSnap.docs.map(d => d.id));
        const superAdminIds = new Set(superAdminRolesSnap.docs.map(d => d.id));
        const allAdminIds = Array.from(new Set([...adminIds, ...superAdminIds]));

        if (allAdminIds.length > 0) {
          const usersSnap = await adminDb.collection('users').where(adminDb.FieldPath.documentId(), 'in', allAdminIds).get();
          const firebaseStaff = usersSnap.docs.map(d => {
            const userData = d.data();
            const role = superAdminIds.has(d.id) ? 'Super Admin' : 'Admin';
            return {
              id: d.id,
              name: userData.firstName && userData.lastName ? `${userData.firstName} ${userData.lastName}` : userData.email || 'Unknown Staff',
              email: userData.email,
              role: role,
              source: 'firebase'
            };
          });
          allStaff.push(...firebaseStaff);
        }
      } catch (error) {
        console.error('❌ Error fetching Firebase admin staff:', error);
      }
    }

    // Fetch Caspio MSW staff if requested
    if (includeCaspioStaff) {
      try {
        const caspioResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/caspio-staff`);
        const caspioData = await caspioResponse.json();
        
        if (caspioData.success && caspioData.staff.length > 0) {
          const caspioStaff = caspioData.staff.map((staff: any) => ({
            id: staff.sw_id || staff.id,
            name: staff.name,
            email: staff.email,
            role: 'MSW',
            source: 'caspio',
            assignedMemberCount: staff.assignedMemberCount || 0,
            sw_id: staff.sw_id,
            phone: staff.phone,
            department: staff.department,
            isActive: staff.isActive
          }));
          allStaff.push(...caspioStaff);
        }
      } catch (error) {
        console.error('❌ Error fetching Caspio MSW staff:', error);
      }
    }

    // Sort with Super Admins first, then MSW staff, then regular admins
    const sortedStaff = allStaff.sort((a, b) => {
      if (a.role === 'Super Admin' && b.role !== 'Super Admin') return -1;
      if (b.role === 'Super Admin' && a.role !== 'Super Admin') return 1;
      if (a.role === 'MSW' && b.role !== 'MSW' && b.role !== 'Super Admin') return -1;
      if (b.role === 'MSW' && a.role !== 'MSW' && a.role !== 'Super Admin') return 1;
      if (a.role === 'Admin' && b.role !== 'Admin' && b.role !== 'Super Admin' && b.role !== 'MSW') return -1;
      if (b.role === 'Admin' && a.role !== 'Admin' && a.role !== 'Super Admin' && a.role !== 'MSW') return 1;
      return a.name.localeCompare(b.name);
    });

    console.log(`✅ Returning ${sortedStaff.length} staff members (${sortedStaff.filter(s => s.source === 'caspio').length} from Caspio, ${sortedStaff.filter(s => s.source === 'firebase').length} from Firebase)`);

    return NextResponse.json({
      success: true,
      staff: sortedStaff,
      counts: {
        total: sortedStaff.length,
        caspio: sortedStaff.filter(s => s.source === 'caspio').length,
        firebase: sortedStaff.filter(s => s.source === 'firebase').length,
        msw: sortedStaff.filter(s => s.role === 'MSW').length,
        admins: sortedStaff.filter(s => s.role === 'Admin').length,
        superAdmins: sortedStaff.filter(s => s.role === 'Super Admin').length
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching staff members:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch staff members',
        details: error.message 
      },
      { status: 500 }
    );
  }
}