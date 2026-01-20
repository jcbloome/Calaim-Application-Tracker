import { NextRequest, NextResponse } from 'next/server';

// Try to import Firebase Admin, but handle gracefully if not available
let adminDb: any = null;
try {
  const firebaseAdmin = require('@/firebase-admin');
  adminDb = firebaseAdmin.adminDb;
  console.log('✅ Firebase Admin loaded for ILS permissions');
} catch (error) {
  console.warn('⚠️ Firebase Admin not available for ILS permissions:', error.message);
}

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

    // If Firebase Admin is not available, return default permissions
    if (!adminDb) {
      console.warn('Firebase Admin not available, returning default ILS permissions');
      return NextResponse.json({
        success: true,
        hasILSPermission: false,
        userId,
        totalILSUsers: 0,
        message: 'Firebase Admin SDK not configured - ILS permissions unavailable'
      });
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
    
    // Get userId from request params for error response
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    return NextResponse.json(
      { 
        success: true, 
        hasILSPermission: false,
        userId,
        message: 'ILS permissions check limited - Firebase Admin not fully configured',
        details: error.message 
      },
      { status: 200 }
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

    // If Firebase Admin is not available, return error
    if (!adminDb) {
      console.warn('Firebase Admin not available, cannot update ILS permissions');
      return NextResponse.json({
        success: false,
        error: 'Firebase Admin SDK not configured - cannot update ILS permissions',
        userId,
        hasILSPermission: false
      }, { status: 503 }); // Service Unavailable
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