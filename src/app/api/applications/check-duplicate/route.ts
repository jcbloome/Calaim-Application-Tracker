import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/firebase-admin';
import {
  evaluateApplicationDuplicates,
  hitsFromAdminDocs,
  isKaiserHealthPlan,
  mrnQueryValues,
  type ApplicationDuplicateHit,
} from '@/lib/application-duplicate-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseBearer(request: NextRequest): string {
  const header = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ? String(match[1]).trim() : '';
}

async function queryMrnField(
  collectionRef: FirebaseFirestore.Query | FirebaseFirestore.CollectionReference,
  field: string,
  values: string[]
): Promise<Array<{ id: string; ref: { path: string }; data: () => Record<string, unknown> }>> {
  const out: Array<{ id: string; ref: { path: string }; data: () => Record<string, unknown> }> = [];
  for (const value of values.slice(0, 8)) {
    const snap = await collectionRef.where(field, '==', value).limit(25).get();
    for (const doc of snap.docs) {
      out.push({
        id: doc.id,
        ref: { path: doc.ref.path },
        data: () => doc.data() as Record<string, unknown>,
      });
    }
  }
  return out;
}

// Avoid importing firebase-admin types into the route signature.
type FirebaseFirestore = typeof adminDb;

export async function POST(request: NextRequest) {
  try {
    const token = parseBearer(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Sign in required.' }, { status: 401 });
    }
    await adminAuth.verifyIdToken(token);

    const body = (await request.json().catch(() => ({}))) as {
      memberMrn?: string;
      memberFirstName?: string;
      memberLastName?: string;
      healthPlan?: string;
      excludeApplicationId?: string;
      allowLinkAdminSeed?: boolean;
    };

    const memberMrn = String(body.memberMrn || '').trim();
    const memberFirstName = String(body.memberFirstName || '').trim();
    const memberLastName = String(body.memberLastName || '').trim();
    const healthPlan = String(body.healthPlan || '').trim();
    const excludeApplicationId = String(body.excludeApplicationId || '').trim();
    const allowLinkAdminSeed = body.allowLinkAdminSeed !== false;

    if (!memberMrn) {
      return NextResponse.json({
        success: true,
        blocked: false,
        message: '',
        samePersonMatches: [] as ApplicationDuplicateHit[],
        differentNameMatches: [] as ApplicationDuplicateHit[],
        linkableAdminSeedId: null,
        skipped: true,
        reason: 'missing_mrn',
      });
    }

    // Hard block is for Kaiser members identified by MRN + name.
    // If plan is set and is not Kaiser, still report matches but only block when plan is Kaiser
    // or plan is unknown (user may select Kaiser on a later step).
    const planKnownNonKaiser = Boolean(healthPlan) && !isKaiserHealthPlan(healthPlan);

    const values = mrnQueryValues(memberMrn);
    const root = adminDb.collection('applications');
    const group = adminDb.collectionGroup('applications');

    const [rootMrn, rootConfirm, groupMrn, groupConfirm] = await Promise.all([
      queryMrnField(root as any, 'memberMrn', values),
      queryMrnField(root as any, 'confirmMemberMrn', values),
      queryMrnField(group as any, 'memberMrn', values).catch(() => []),
      queryMrnField(group as any, 'confirmMemberMrn', values).catch(() => []),
    ]);

    const hits = hitsFromAdminDocs([...rootMrn, ...rootConfirm, ...groupMrn, ...groupConfirm]);
    const evaluated = evaluateApplicationDuplicates({
      hits,
      incoming: { memberFirstName, memberLastName },
      excludeApplicationId,
      allowLinkAdminSeed,
    });

    const blocked = planKnownNonKaiser ? false : evaluated.blocked;
    const message = blocked
      ? evaluated.message || 'Application already exists for this Kaiser member.'
      : evaluated.message;

    return NextResponse.json({
      success: true,
      blocked,
      message,
      samePersonMatches: evaluated.samePersonMatches,
      differentNameMatches: evaluated.differentNameMatches,
      linkableAdminSeedId: evaluated.linkableAdminSeedId,
      planKnownNonKaiser,
    });
  } catch (error: any) {
    console.error('[applications/check-duplicate]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Duplicate check failed.') },
      { status: 500 }
    );
  }
}
