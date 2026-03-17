import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  intakeId?: string;
  exactPacketAnswers?: Record<string, unknown>;
  transitionSummary?: string;
  requestedActions?: string;
  barriersAndRisks?: string | null;
  additionalNotes?: string | null;
};

const clean = (v: unknown, max = 5000) => String(v ?? '').trim().slice(0, max);
const jsonChanged = (a: unknown, b: unknown) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

const sanitizeExactAnswers = (value: unknown): Record<string, string | string[]> => {
  const out: Record<string, string | string[]> = {};
  if (!value || typeof value !== 'object') return out;
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    const id = clean(key, 140);
    if (!id) return;
    if (Array.isArray(raw)) {
      out[id] = raw.map((x) => clean(x, 2000)).filter((x) => x.length > 0).slice(0, 80);
      return;
    }
    out[id] = clean(raw, 6000);
  });
  return out;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 12000);
    const intakeId = clean(body?.intakeId, 240);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!intakeId) return NextResponse.json({ success: false, error: 'Missing intakeId' }, { status: 400 });

    const transitionSummary = clean(body?.transitionSummary, 12000);
    const requestedActions = clean(body?.requestedActions, 12000);
    const barriersAndRisks = clean(body?.barriersAndRisks, 16000);
    const additionalNotes = clean(body?.additionalNotes, 16000);
    if (!transitionSummary || !requestedActions) {
      return NextResponse.json(
        { success: false, error: 'transitionSummary and requestedActions are required' },
        { status: 400 }
      );
    }

    const exactPacketAnswers = sanitizeExactAnswers(body?.exactPacketAnswers);

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 160);
    const email = clean((decoded as any)?.email, 240).toLowerCase();
    const name = clean((decoded as any)?.name, 220);
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    const snap = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
    if (!snap.exists) return NextResponse.json({ success: false, error: 'ALFT intake not found' }, { status: 404 });
    const intake = (snap.data() || {}) as any;
    const toolCode = clean(intake?.toolCode, 40).toUpperCase();
    const docType = clean(intake?.documentType, 160).toLowerCase();
    const isAlft = toolCode === 'ALFT' || docType.includes('alft');
    if (!isAlft) return NextResponse.json({ success: false, error: 'Target intake is not ALFT' }, { status: 400 });

    let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
    if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
    if (!isAdmin) {
      const [adminRole, superAdminRole] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get(),
      ]);
      isAdmin = adminRole.exists || superAdminRole.exists;
      if (!isAdmin && email) {
        const [adminByEmail, superByEmail] = await Promise.all([
          adminDb.collection('roles_admin').doc(email).get(),
          adminDb.collection('roles_super_admin').doc(email).get(),
        ]);
        isAdmin = adminByEmail.exists || superByEmail.exists;
      }
    }

    if (!isAdmin) {
      const collab = intake?.alftCollaboration || {};
      const editableUids = Array.isArray(collab?.editableUids)
        ? collab.editableUids.map((x: any) => clean(x, 160)).filter(Boolean)
        : [];
      const uploaderUid = clean(intake?.uploaderUid, 160);
      const rnUid = clean(intake?.alftRnUid, 160);
      const staffUid = clean(intake?.alftStaffUid, 160);
      const createdByUid = clean(collab?.createdByUid, 160);
      const allowAll = Boolean(collab?.allowAllPartiesEdit);
      const uploaderEmail = clean(intake?.uploaderEmail, 240).toLowerCase();
      const permitted =
        (allowAll && editableUids.includes(uid)) ||
        [uploaderUid, rnUid, staffUid, createdByUid].includes(uid) ||
        (email && uploaderEmail && email === uploaderEmail);
      if (!permitted) {
        return NextResponse.json({ success: false, error: 'You do not have ALFT edit permission for this intake.' }, { status: 403 });
      }
    }

    const previousForm = (intake?.alftForm || {}) as Record<string, any>;
    const previousExact = ((previousForm as any)?.exactPacketAnswers || {}) as Record<string, unknown>;

    const changedFields: string[] = [];
    if (jsonChanged(previousForm?.transitionSummary, transitionSummary)) changedFields.push('transitionSummary');
    if (jsonChanged(previousForm?.requestedActions, requestedActions)) changedFields.push('requestedActions');
    if (jsonChanged(previousForm?.barriersAndRisks || null, barriersAndRisks || null)) changedFields.push('barriersAndRisks');
    if (jsonChanged(previousForm?.additionalNotes || null, additionalNotes || null)) changedFields.push('additionalNotes');

    const exactKeys = Array.from(new Set([...Object.keys(previousExact || {}), ...Object.keys(exactPacketAnswers || {})]));
    const changedExactQuestionIds = exactKeys
      .filter((k) => jsonChanged((previousExact as any)?.[k], (exactPacketAnswers as any)?.[k]))
      .slice(0, 80);
    if (changedExactQuestionIds.length > 0) changedFields.push('exactPacketAnswers');

    const historyEntry = {
      editedAt: admin.firestore.FieldValue.serverTimestamp(),
      editedAtIso: new Date().toISOString(),
      editedByUid: uid || null,
      editedByName: name || email || 'Staff',
      editedByEmail: email || null,
      changedFields,
      changedExactQuestionIds,
      changedExactQuestionCount: changedExactQuestionIds.length,
      note: changedFields.length ? null : 'No value changes detected',
    };

    await adminDb
      .collection('standalone_upload_submissions')
      .doc(intakeId)
      .set(
        {
          alftForm: {
            exactPacketAnswers,
            transitionSummary,
            requestedActions,
            barriersAndRisks: barriersAndRisks || null,
            additionalNotes: additionalNotes || null,
          },
          alftEditHistory: admin.firestore.FieldValue.arrayUnion(historyEntry),
          alftCollaboration: {
            allowAllPartiesEdit: true,
            editableRoleKeys: ['social_worker', 'staff', 'rn', 'admin', 'super_admin'],
            editableUids: admin.firestore.FieldValue.arrayUnion(uid),
            lastEditedByUid: uid,
            lastEditedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return NextResponse.json({
      success: true,
      intakeId,
      changedFields,
      changedExactQuestionCount: changedExactQuestionIds.length,
    });
  } catch (error: any) {
    console.error('[api/alft/edit] Error:', error);
    return NextResponse.json(
      { success: false, error: clean(error?.message || 'Failed to update ALFT form', 500) },
      { status: 500 }
    );
  }
}

