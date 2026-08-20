import { NextRequest, NextResponse } from 'next/server';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function pickFirstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function isKaiserPlan(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .includes('kaiser');
}

function mapMember(data: any) {
  return {
    memberHealthPlan: pickFirstNonEmpty(data?.CalAIM_MCO, data?.memberHealthPlan, data?.healthPlan),
    memberStatus: pickFirstNonEmpty(data?.CalAIM_Status, data?.memberStatus, data?.calaimStatus),
    calaimStatus: pickFirstNonEmpty(data?.CalAIM_Status, data?.calaimStatus, data?.memberStatus),
    authStartDateT2038: pickFirstNonEmpty(
      data?.Authorization_Start_Date_T2038,
      data?.Authorization_Start_T2038,
      data?.authStartDateT2038
    ),
    authEndDateT2038: pickFirstNonEmpty(
      data?.Authorization_End_Date_T2038,
      data?.Authorization_End_T2038,
      data?.authEndDateT2038
    ),
    nextAuthStartDateT2038: pickFirstNonEmpty(
      data?.Next_Auth_Start_T2038,
      data?.nextAuthStartDateT2038
    ),
    nextAuthEndDateT2038: pickFirstNonEmpty(
      data?.Next_Auth_End_T2038,
      data?.nextAuthEndDateT2038
    ),
  };
}

async function loadFromFirestoreCache() {
  const adminModule = await import('@/firebase-admin');
  const adminDb = adminModule.adminDb;

  let snapshot = await adminDb
    .collection('caspio_members_cache')
    .where('CalAIM_MCO', '==', 'Kaiser')
    .limit(10000)
    .get();

  if (snapshot.empty) {
    snapshot = await adminDb.collection('caspio_members_cache').limit(15000).get();
  }

  return snapshot.docs
    .map((doc) => mapMember(doc.data()))
    .filter((member) => isKaiserPlan(member.memberHealthPlan));
}

async function loadFromLiveCaspio() {
  const credentials = getCaspioCredentialsFromEnv();
  const result = await fetchAllCalAIMMembers(credentials, {
    includeRawData: true,
    forceRefresh: true,
  });
  const rawMembers = Array.isArray(result.rawMembers) ? result.rawMembers : [];
  const members = rawMembers
    .map((row: any) => mapMember(row))
    .filter((member) => isKaiserPlan(member.memberHealthPlan));

  return {
    members,
    scannedCount: rawMembers.length || Number(result.count || 0),
  };
}

/**
 * Super-admin Kaiser income estimate census.
 * Default: live Caspio. Optional ?source=cache for Firestore cache only.
 * ?fallback=cache allows cache if live Caspio auth/pull fails.
 */
export async function GET(request: NextRequest) {
  const sourceParam = String(request.nextUrl.searchParams.get('source') || 'live')
    .trim()
    .toLowerCase();
  const allowCacheFallback =
    sourceParam !== 'live-only' &&
    (sourceParam === 'cache' ||
      request.nextUrl.searchParams.get('fallback') === 'cache' ||
      request.nextUrl.searchParams.get('fallback') === '1');

  try {
    if (sourceParam === 'cache') {
      const members = await loadFromFirestoreCache();
      if (!members.length) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Kaiser members cache is empty. Sync Caspio members first, or use live Caspio (source=live).',
            members: [],
            totalCount: 0,
            source: 'firestore-cache',
          },
          { status: 409 }
        );
      }
      return NextResponse.json({
        success: true,
        members,
        totalCount: members.length,
        source: 'firestore-cache',
      });
    }

    try {
      const live = await loadFromLiveCaspio();
      if (!live.members.length) {
        throw new Error('Live Caspio returned no Kaiser members.');
      }
      return NextResponse.json({
        success: true,
        members: live.members,
        totalCount: live.members.length,
        scannedCount: live.scannedCount,
        source: 'caspio-live',
      });
    } catch (liveError: any) {
      const liveMessage = String(liveError?.message || 'Live Caspio pull failed');
      if (!allowCacheFallback) {
        return NextResponse.json(
          {
            success: false,
            error: liveMessage,
            members: [],
            totalCount: 0,
            source: 'caspio-live',
          },
          { status: 502 }
        );
      }

      const members = await loadFromFirestoreCache();
      if (!members.length) {
        return NextResponse.json(
          {
            success: false,
            error: `${liveMessage} Cache fallback also empty.`,
            members: [],
            totalCount: 0,
            source: 'firestore-cache-fallback',
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        members,
        totalCount: members.length,
        source: 'firestore-cache-fallback',
        liveError: liveMessage,
      });
    }
  } catch (error: any) {
    console.error('[kaiser-income-estimate] failed to load census:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error?.message || 'Failed to load Kaiser income census'),
        members: [],
        totalCount: 0,
      },
      { status: 500 }
    );
  }
}
