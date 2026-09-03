import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 400) => String(v ?? '').trim().slice(0, max);

function sanitizeAnswers(raw: unknown): Record<string, string | string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = clean(key, 120);
    if (!id) continue;
    if (Array.isArray(value)) {
      out[id] = value.map((v) => clean(v, 4000)).filter(Boolean).slice(0, 40);
    } else {
      out[id] = clean(value, 20000);
    }
  }
  return out;
}

async function verifyAssignedSw(idToken: string, memberId: string) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = clean(decoded?.uid, 160);
  const email = clean((decoded as any)?.email, 220).toLowerCase();
  if (!uid || !email) {
    return { ok: false as const, status: 401, error: 'Invalid token' };
  }

  const assignmentSnap = await adminDb.collection('alft_assignments').doc(memberId).get();
  if (!assignmentSnap.exists) {
    return { ok: false as const, status: 404, error: 'Assignment not found' };
  }
  const assignment = assignmentSnap.data() as Record<string, unknown>;
  const assignedEmail = clean(assignment?.assignedSwEmail, 220).toLowerCase();
  const assignedId = clean(assignment?.assignedSwId || assignment?.SW_ID || assignment?.sw_id, 80).toLowerCase();
  const claimSwId = clean(
    (decoded as any)?.sw_id || (decoded as any)?.SW_ID || '',
    80
  ).toLowerCase();

  const emailMatch = assignedEmail && assignedEmail === email;
  const idMatch = assignedId && claimSwId && assignedId === claimSwId;
  const isAdmin =
    Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);

  if (!emailMatch && !idMatch && !isAdmin) {
    return { ok: false as const, status: 403, error: 'Not assigned to this member' };
  }

  return { ok: true as const, uid, email, adminDb, assignment };
}

export async function GET(req: NextRequest) {
  try {
    const memberId = clean(req.nextUrl.searchParams.get('memberId'), 160);
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const idToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
    if (!memberId) return NextResponse.json({ success: false, error: 'Missing memberId' }, { status: 400 });
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing Authorization' }, { status: 401 });

    const access = await verifyAssignedSw(idToken, memberId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const draft = (access.assignment as any)?.swFormDraft || null;
    return NextResponse.json({
      success: true,
      draft: draft
        ? {
            answers: sanitizeAnswers(draft.answers),
            medListAttachment: draft.medListAttachment || null,
            expectedVisitDate: clean(draft.expectedVisitDate, 40) || null,
            savedAt: clean(draft.savedAt, 80) || null,
            savedByEmail: clean(draft.savedByEmail, 220) || null,
          }
        : null,
    });
  } catch (e: any) {
    console.error('[api/alft/sw-draft GET]', e);
    return NextResponse.json(
      { success: false, error: clean(e?.message || 'Failed to load draft', 400) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      idToken?: string;
      memberId?: string;
      answers?: Record<string, unknown>;
      medListAttachment?: unknown;
      expectedVisitDate?: string;
      clear?: boolean;
    };
    const idToken = clean(body?.idToken, 12000);
    const memberId = clean(body?.memberId, 160);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!memberId) return NextResponse.json({ success: false, error: 'Missing memberId' }, { status: 400 });

    const access = await verifyAssignedSw(idToken, memberId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const ref = access.adminDb.collection('alft_assignments').doc(memberId);

    if (body?.clear) {
      await ref.set(
        {
          swFormDraft: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return NextResponse.json({ success: true, cleared: true });
    }

    const answers = sanitizeAnswers(body?.answers);
    const savedAt = new Date().toISOString();
    const med = body?.medListAttachment && typeof body.medListAttachment === 'object'
      ? body.medListAttachment
      : null;

    await ref.set(
      {
        swFormDraft: {
          answers,
          medListAttachment: med,
          expectedVisitDate: clean(body?.expectedVisitDate, 40) || null,
          savedAt,
          savedByUid: access.uid,
          savedByEmail: access.email,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, savedAt });
  } catch (e: any) {
    console.error('[api/alft/sw-draft POST]', e);
    return NextResponse.json(
      { success: false, error: clean(e?.message || 'Failed to save draft', 400) },
      { status: 500 }
    );
  }
}
