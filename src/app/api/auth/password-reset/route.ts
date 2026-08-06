import { NextRequest, NextResponse } from 'next/server';
import { sendPasswordResetEmail } from '@/lib/password-reset';
import { resetTokenStore } from '@/lib/reset-tokens';
import { adminDb } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Custom password reset request received');
    const { email, role } = await request.json();

    const result = await sendPasswordResetEmail(request, email, role);
    return NextResponse.json(result.body, { status: result.status });

  } catch (error: any) {
    console.error('Custom password reset failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send password reset email' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    
    console.log('🔍 Token validation request received');
    console.log('📝 Token:', token ? `${token.substring(0, 8)}...` : 'null');
    console.log('📝 Full token length:', token?.length);
    console.log('📝 Token format valid:', token ? /^[a-f0-9]{64}$/.test(token) : false);
    
    if (!token) {
      console.log('❌ No token provided');
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    let tokenData = resetTokenStore.get(token);
    console.log('💾 In-memory store check:', tokenData ? 'Found' : 'Not found');
    
    if (!tokenData && process.env.NODE_ENV !== 'development') {
      // Only try Firestore in production where credentials are available
      try {
        console.log('🔍 Checking Firestore for token...');
        const tokenDoc = await adminDb.collection('passwordResetTokens').doc(token).get();
        console.log('📄 Firestore document exists:', tokenDoc.exists);
        
        if (tokenDoc.exists) {
          const data = tokenDoc.data() as { email?: string; expires?: number } | undefined;
          console.log('📄 Firestore document data:', { 
            hasEmail: !!data?.email, 
            hasExpires: !!data?.expires,
            expires: data?.expires ? new Date(data.expires).toISOString() : 'none'
          });
          
          if (data?.email && data?.expires) {
            tokenData = { email: data.email, expires: data.expires };
            console.log('🔍 Found reset token in Firestore for:', data.email);
          }
        }
      } catch (lookupError) {
        console.warn('⚠️ Failed to read reset token from Firestore:', lookupError);
      }
    } else if (!tokenData && process.env.NODE_ENV === 'development') {
      console.log('🔧 Development mode: Skipping Firestore lookup (credentials not available)');
    }
    
    if (!tokenData) {
      console.log('❌ Token not found in store');
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const timeRemaining = tokenData.expires - now;
    
    console.log('⏰ Token validation details:');
    console.log('  - Email:', tokenData.email);
    console.log('  - Expires:', new Date(tokenData.expires).toLocaleString());
    console.log('  - Time remaining:', Math.round(timeRemaining / 1000 / 60), 'minutes');

    if (now > tokenData.expires) {
      console.log('❌ Token has expired');
      resetTokenStore.delete(token);
      try {
        await adminDb.collection('passwordResetTokens').doc(token).delete();
      } catch (deleteError) {
        console.warn('⚠️ Failed to delete expired Firestore token:', deleteError);
      }
      return NextResponse.json(
        { error: 'Token has expired' },
        { status: 400 }
      );
    }

    let role: 'sw' | 'user' | 'admin' = 'user';
    const roleParam = String(searchParams.get('role') || '').trim().toLowerCase();
    if (roleParam === 'admin') {
      role = 'admin';
    }
    try {
      const swSnapshot = await adminDb
        .collection('socialWorkers')
        .where('email', '==', tokenData.email)
        .limit(1)
        .get();
      if (!swSnapshot.empty && role !== 'admin') {
        role = 'sw';
      } else if (role !== 'admin') {
        const adminEmail = String(tokenData.email || '').trim().toLowerCase();
        const [adminEmailDoc, superAdminEmailDoc] = await Promise.all([
          adminDb.collection('roles_admin').doc(adminEmail).get(),
          adminDb.collection('roles_super_admin').doc(adminEmail).get(),
        ]);
        if (adminEmailDoc.exists || superAdminEmailDoc.exists) {
          role = 'admin';
        }
      }
    } catch (roleError) {
      console.warn('⚠️ Failed to determine user role from Firestore:', roleError);
    }

    console.log('✅ Token is valid');
    return NextResponse.json(
      { email: tokenData.email, valid: true, role },
      { status: 200 }
    );

  } catch (error) {
    console.error('❌ Token validation failed:', error);
    return NextResponse.json(
      { error: 'Failed to validate token' },
      { status: 500 }
    );
  }
}