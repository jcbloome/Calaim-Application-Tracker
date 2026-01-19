import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Get ILS permissions from system settings
    const settingsRef = adminDb.collection('system_settings').doc('notifications');
    const settingsDoc = await settingsRef.get();
    
    if (!settingsDoc.exists) {
      return NextResponse.json({
        success: true,
        hasILSPermission: false,
        message: 'No ILS permissions configured'
      });
    }

    const data = settingsDoc.data();
    const ilsPermissions = data?.ilsNotePermissions || [];
    
    const hasPermission = ilsPermissions.includes(userId);

    return NextResponse.json({
      success: true,
      hasILSPermission: hasPermission,
      userId,
      totalILSUsers: ilsPermissions.length
    });

  } catch (error: any) {
    console.error('Error checking ILS permissions:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to check ILS permissions',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, hasPermission } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Get current ILS permissions
    const settingsRef = adminDb.collection('system_settings').doc('notifications');
    const settingsDoc = await settingsRef.get();
    
    const currentData = settingsDoc.exists ? settingsDoc.data() : {};
    const currentPermissions = currentData?.ilsNotePermissions || [];
    
    let updatedPermissions;
    if (hasPermission) {
      // Add permission if not already present
      updatedPermissions = currentPermissions.includes(userId) 
        ? currentPermissions 
        : [...currentPermissions, userId];
    } else {
      // Remove permission
      updatedPermissions = currentPermissions.filter((id: string) => id !== userId);
    }

    // Update permissions
    await settingsRef.set({
      ...currentData,
      ilsNotePermissions: updatedPermissions
    }, { merge: true });

    return NextResponse.json({
      success: true,
      message: hasPermission ? 'ILS permission granted' : 'ILS permission revoked',
      userId,
      hasILSPermission: hasPermission,
      totalILSUsers: updatedPermissions.length
    });

  } catch (error: any) {
    console.error('Error updating ILS permissions:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update ILS permissions',
        details: error.message 
      },
      { status: 500 }
    );
  }
}