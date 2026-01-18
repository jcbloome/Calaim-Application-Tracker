import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // For now, return mock staff data
    // In a real implementation, this would fetch from Firestore or your user management system
    const staffMembers = [
      {
        id: 'jason-admin',
        name: 'Jason Admin',
        email: 'jason@carehomefinders.com',
        role: 'Super Admin'
      },
      {
        id: 'staff-1',
        name: 'Sarah Johnson',
        email: 'sarah@carehomefinders.com',
        role: 'Admin'
      },
      {
        id: 'staff-2',
        name: 'Mike Rodriguez',
        email: 'mike@carehomefinders.com',
        role: 'Admin'
      },
      {
        id: 'staff-3',
        name: 'Lisa Chen',
        email: 'lisa@carehomefinders.com',
        role: 'Admin'
      }
    ];

    // Sort with Super Admins first
    const sortedStaff = staffMembers.sort((a, b) => {
      if (a.role === 'Super Admin' && b.role !== 'Super Admin') return -1;
      if (b.role === 'Super Admin' && a.role !== 'Super Admin') return 1;
      if (a.role === 'Admin' && b.role !== 'Admin' && b.role !== 'Super Admin') return -1;
      if (b.role === 'Admin' && a.role !== 'Admin' && a.role !== 'Super Admin') return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      success: true,
      staff: sortedStaff
    });

  } catch (error: any) {
    console.error('Error fetching staff members:', error);
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