import { NextRequest, NextResponse } from 'next/server';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

    // Default: read from Firestore cache so we don't hit Caspio automatically.
    if (!forceRefresh) {
      const adminModule = await import('@/firebase-admin');
      const adminDb = adminModule.adminDb;
      const snapshot = await adminDb.collection('caspio_members_cache').limit(5000).get();
      const members = snapshot.docs.map((doc) => {
        const data = doc.data() as any;
        const hold =
          data?.Hold_For_Social_Worker ??
          data?.Hold_for_Social_Worker ??
          data?.hold_for_social_worker ??
          '';
        return {
          ...data,
          Hold_For_Social_Worker: String(hold || '').trim(),
        };
      });
      if (members.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Members cache is empty. Click "Sync from Caspio" to load data.',
            members: [],
            count: 0,
            mcoStats: {},
            timestamp: new Date().toISOString(),
          },
          { status: 409 }
        );
      }

      const mcoStats: Record<string, number> = {};
      members.forEach((m: any) => {
        const mco = String(m?.CalAIM_MCO || 'Unknown');
        mcoStats[mco] = (mcoStats[mco] || 0) + 1;
      });

      return NextResponse.json({
        success: true,
        members,
        count: members.length,
        mcoStats,
        timestamp: new Date().toISOString(),
        source: 'firestore-cache',
      });
    }

    // Explicit refresh: allow a one-off direct Caspio pull (still on-demand).
    console.log('🔍 Refresh=1: Fetching ALL members from Caspio using partition strategy...');
    const credentials = getCaspioCredentialsFromEnv();
    const result = await fetchAllCalAIMMembers(credentials, { forceRefresh: true });
    return NextResponse.json({
      success: true,
      members: result.members,
      count: result.count,
      mcoStats: result.mcoStats,
      timestamp: new Date().toISOString(),
      source: 'caspio-direct',
    });

  } catch (error: any) {
    console.error('❌ Error fetching all members:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch all members',
      details: error.message 
    }, { status: 500 });
  }
}