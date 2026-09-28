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

function sanitizeMedListAttachment(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const downloadURL = clean(obj.downloadURL, 2000);
  const fileName = clean(obj.fileName, 220);
  if (!downloadURL || !fileName) return null;
  return {
    id: clean(obj.id, 80) || undefined,
    fileName,
    downloadURL,
    storagePath: clean(obj.storagePath, 500) || undefined,
    contentType: clean(obj.contentType, 120) || undefined,
    uploadedAtIso: clean(obj.uploadedAtIso, 80) || undefined,
    uploadedByName: clean(obj.uploadedByName, 160) || null,
    uploadedByEmail: clean(obj.uploadedByEmail, 220) || null,
  };
}

function readPacketAnswers(intake: Record<string, unknown> | null | undefined): Record<string, string | string[]> | null {
  if (!intake) return null;
  const form = (intake.alftForm && typeof intake.alftForm === 'object' ? intake.alftForm : null) as Record<
    string,
    unknown
  > | null;
  const packet = form?.exactPacketAnswers || intake.exactPacketAnswers || null;
  const sanitized = sanitizeAnswers(packet);
  return Object.keys(sanitized).length ? sanitized : null;
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
  const assignedUid = clean(assignment?.assignedSwUid, 160);
  const assignedId = clean(assignment?.assignedSwId || assignment?.SW_ID || assignment?.sw_id, 80).toLowerCase();
  const claimSwId = clean((decoded as any)?.sw_id || (decoded as any)?.SW_ID || '', 80).toLowerCase();

  const emailMatch = Boolean(assignedEmail && assignedEmail === email);
  const uidMatch = Boolean(assignedUid && assignedUid === uid);
  const idMatch = Boolean(assignedId && claimSwId && assignedId === claimSwId);
  const isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);

  if (!emailMatch && !uidMatch && !idMatch && !isAdmin) {
    return { ok: false as const, status: 403, error: 'Not assigned to this member' };
  }

  return { ok: true as const, uid, email, adminDb, assignment };
}

async function loadPriorSubmission(
  adminDb: any,
  assignment: Record<string, unknown>,
  memberId: string
): Promise<{
  priorAnswers: Record<string, string | string[]> | null;
  priorMedListAttachment: Record<string, unknown> | null;
  latestIntakeId: string | null;
}> {
  const readFromIntake = (intake: Record<string, unknown> | undefined, intakeId: string) => {
    const form = (intake?.alftForm && typeof intake.alftForm === 'object' ? intake.alftForm : null) as
      | Record<string, unknown>
      | null;
    return {
      priorAnswers: readPacketAnswers(intake),
      priorMedListAttachment:
        sanitizeMedListAttachment(form?.medListAttachment) ||
        sanitizeMedListAttachment(intake?.medListAttachment) ||
        null,
      latestIntakeId: intakeId || null,
    };
  };

  const intakeId = clean(assignment?.latestIntakeId, 220);
  if (intakeId) {
    try {
      const snap = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
      if (snap.exists) {
        const loaded = readFromIntake(snap.data() as Record<string, unknown>, snap.id);
        if (loaded.priorAnswers || loaded.priorMedListAttachment) return loaded;
      }
    } catch {
      // fall through
    }
  }

  try {
    const snap = await adminDb
      .collection('standalone_upload_submissions')
      .where('memberId', '==', memberId)
      .limit(8)
      .get();
    let best: {
      ms: number;
      priorAnswers: Record<string, string | string[]> | null;
      priorMedListAttachment: Record<string, unknown> | null;
      latestIntakeId: string | null;
    } | null = null;
    for (const docSnap of snap.docs) {
      const data = (docSnap.data() || {}) as Record<string, unknown>;
      const loaded = readFromIntake(data, docSnap.id);
      if (!loaded.priorAnswers && !loaded.priorMedListAttachment) continue;
      const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
      const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
      const ms = Math.max(
        Date.parse(String(data.submittedAt || data.updatedAtIso || data.createdAtIso || '')) || 0,
        typeof updatedAt?.toMillis === 'function' ? Number(updatedAt.toMillis()) : 0,
        typeof createdAt?.toMillis === 'function' ? Number(createdAt.toMillis()) : 0
      );
      if (!best || ms >= best.ms) {
        best = { ms, ...loaded };
      }
    }
    if (best) {
      return {
        priorAnswers: best.priorAnswers,
        priorMedListAttachment: best.priorMedListAttachment,
        latestIntakeId: best.latestIntakeId,
      };
    }
  } catch {
    // ignore
  }

  return {
    priorAnswers: null,
    priorMedListAttachment: sanitizeMedListAttachment(assignment?.medListAttachment),
    latestIntakeId: intakeId || null,
  };
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
    const prior = await loadPriorSubmission(access.adminDb, access.assignment, memberId);
    const assignmentMed = sanitizeMedListAttachment((access.assignment as any)?.medListAttachment);

    return NextResponse.json({
      success: true,
      draft: draft
        ? {
            answers: sanitizeAnswers(draft.answers),
            medListAttachment: sanitizeMedListAttachment(draft.medListAttachment),
            expectedVisitDate: clean(draft.expectedVisitDate, 40) || null,
            savedAt: clean(draft.savedAt, 80) || null,
            savedByEmail: clean(draft.savedByEmail, 220) || null,
          }
        : null,
      // Admin SDK — SW clients cannot read standalone_upload_submissions directly.
      priorAnswers: prior.priorAnswers,
      priorMedListAttachment: prior.priorMedListAttachment || assignmentMed,
      latestIntakeId: prior.latestIntakeId,
      needsSwRevision: Boolean((access.assignment as any)?.needsSwRevision),
      returnedToSwReason: clean((access.assignment as any)?.returnedToSwReason, 2000) || null,
      workflowStatus: clean((access.assignment as any)?.workflowStatus, 120) || null,
      assignmentStatus: clean((access.assignment as any)?.status, 80) || null,
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
    const med = sanitizeMedListAttachment(body?.medListAttachment);

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
        // Keep assignment-level med list in sync so reopen / admin see the file.
        ...(med ? { medListAttachment: med } : {}),
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
