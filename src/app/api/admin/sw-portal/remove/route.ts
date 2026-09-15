import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 220) => String(value ?? '').trim().slice(0, max);

export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const email = clean(body?.email, 220).toLowerCase();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid social worker email is required.' }, { status: 400 });
    }

    const adminDb = authz.adminDb;
    const deletedDocIds = new Set<string>();

    const emailDoc = await adminDb.collection('socialWorkers').doc(email).get();
    if (emailDoc.exists) {
      await emailDoc.ref.delete();
      deletedDocIds.add(emailDoc.id);
    }

    const byEmailSnap = await adminDb.collection('socialWorkers').where('email', '==', email).limit(25).get();
    await Promise.all(
      byEmailSnap.docs.map(async (docSnap: any) => {
        await docSnap.ref.delete();
        deletedDocIds.add(docSnap.id);
      })
    );

    // Best-effort: if Auth uid is known and used as a socialWorkers doc id, remove that too.
    try {
      const adminAuth = (await import('@/firebase-admin')).adminAuth;
      const userRecord = await adminAuth.getUserByEmail(email);
      const uid = clean(userRecord?.uid, 128);
      if (uid) {
        const uidDoc = await adminDb.collection('socialWorkers').doc(uid).get();
        if (uidDoc.exists) {
          await uidDoc.ref.delete();
          deletedDocIds.add(uidDoc.id);
        }
      }
    } catch (error: any) {
      if (String(error?.code || '') !== 'auth/user-not-found') {
        console.warn('SW portal remove: Auth uid lookup skipped:', error);
      }
    }

    return NextResponse.json({
      success: true,
      email,
      deletedCount: deletedDocIds.size,
      deletedDocIds: Array.from(deletedDocIds),
      message:
        deletedDocIds.size > 0
          ? 'Social worker portal access removed. Login account was kept so they can be added as Admin staff.'
          : 'No social worker portal records found for this email.',
    });
  } catch (error: any) {
    console.error('SW portal remove failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to remove social worker portal access.' },
      { status: 500 }
    );
  }
}
