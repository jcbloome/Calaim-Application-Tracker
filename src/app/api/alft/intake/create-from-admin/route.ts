import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { normalizeAlftAnswersCapitalization } from '@/lib/alft-proper-case';
import { applyAlftCognitiveFollowupGate } from '@/lib/alft-form-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PersonRef = { uid?: string; name?: string; email?: string };

type Body = {
  exactPacketAnswers?: Record<string, unknown>;
  member?: {
    id?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    healthPlan?: string;
    medicalRecordNumber?: string;
    mediCalNumber?: string;
    kaiserMrn?: string;
    prefillPurpose?: string;
  };
  firstReviewer?: PersonRef;
  assignedRn?: PersonRef;
  socialWorker?: PersonRef;
  medListAttachment?: Record<string, unknown> | null;
  transitionSummary?: string;
  requestedActions?: string;
  sourceLabel?: string;
};

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
const AGENCY_NAME = 'Connections Care Home Consultants';

const isOverrideYes = (value: unknown) => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  return raw === 'yes' || raw === 'true' || raw === '1';
};

const parseSignedAt = (value: unknown): Date | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms);
};

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
    out[id] = clean(raw, 8000);
  });
  return out;
};

/**
 * Create an ALFT / ISP intake from admin (completed PDF import or staff-filled form)
 * so Send to RN / Final review / Download actions can run without an SW portal submit.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body & { idToken?: string };
    let authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok && clean(body?.idToken, 5000)) {
      const { requireAdminApiAuthFromIdToken } = await import('@/lib/admin-api-auth');
      authCheck = await requireAdminApiAuthFromIdToken(clean(body.idToken, 5000), { requireTwoFactor: false });
    }
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = authCheck.adminDb;

    const memberId = clean(body?.member?.id, 120);
    const memberFirstName = clean(body?.member?.firstName, 80);
    const memberLastName = clean(body?.member?.lastName, 80);
    const memberNameRaw = clean(body?.member?.name, 140);
    const memberName =
      clean(`${memberFirstName} ${memberLastName}`.replace(/\s+/g, ' ').trim(), 140) || memberNameRaw;
    if (!memberId && !memberName) {
      return NextResponse.json({ success: false, error: 'Member is required' }, { status: 400 });
    }

    let exactPacketAnswers = sanitizeExactAnswers(body?.exactPacketAnswers);
    exactPacketAnswers = normalizeAlftAnswersCapitalization(
      applyAlftCognitiveFollowupGate({
        ...exactPacketAnswers,
        p1_agency: clean(exactPacketAnswers.p1_agency, 200) || AGENCY_NAME,
      }) as Record<string, string | string[]>
    ) as Record<string, string | string[]>;

    if (Object.keys(exactPacketAnswers).length < 5) {
      return NextResponse.json(
        { success: false, error: 'Form answers are incomplete — open or import the ISP form first.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const mswOverride = isOverrideYes(exactPacketAnswers.p14_admin_override_msw);
    const rnOverride = isOverrideYes(exactPacketAnswers.p14_admin_override_rn);
    const mswSignedAt =
      parseSignedAt(exactPacketAnswers.p14_sw_signed_at) || (mswOverride ? now : null);
    const rnSignedAt =
      parseSignedAt(exactPacketAnswers.p14_rn_signed_at) || (rnOverride ? now : null);

    const assignedStaffName =
      clean(body?.firstReviewer?.name, 160) || clean(authCheck.name, 160) || 'Staff';
    const assignedStaffEmail =
      clean(body?.firstReviewer?.email, 220).toLowerCase() ||
      clean(authCheck.email, 220).toLowerCase() ||
      null;
    const assignedStaffUid = clean(body?.firstReviewer?.uid, 120) || clean(authCheck.uid, 120) || null;

    const assignedRnName = clean(body?.assignedRn?.name, 160) || 'Leslie';
    const assignedRnEmail =
      clean(body?.assignedRn?.email, 220).toLowerCase() || 'leslie@carehomefinders.com';
    const assignedRnUid = clean(body?.assignedRn?.uid, 120) || null;

    const swName = clean(body?.socialWorker?.name, 160) || clean(exactPacketAnswers.p1_assessor_name, 160) || null;
    const swEmail = clean(body?.socialWorker?.email, 220).toLowerCase() || null;

    const medicalRecordNumber =
      clean(body?.member?.medicalRecordNumber, 80) ||
      clean(exactPacketAnswers.p1_mrn, 80) ||
      null;

    let workflowStatus = 'awaiting_manager_review_pre_rn';
    let workflowStage = 'admin_imported_waiting_manager_review';
    let nextStepKey = 'manager_review';
    let nextStepLabel = 'Connections Staff First Review';

    if (mswOverride && rnOverride) {
      workflowStatus = 'awaiting_kaiser_manager_final_review';
      workflowStage = 'admin_override_signed_awaiting_final_review';
      nextStepKey = 'final_review';
      nextStepLabel = 'Final manager review / download';
    } else if (mswOverride) {
      workflowStatus = 'awaiting_manager_review_pre_rn';
      workflowStage = 'admin_override_msw_ready_for_rn';
      nextStepKey = 'send_to_rn';
      nextStepLabel = 'Approve → Send to RN';
    }

    const rnTier = clean(exactPacketAnswers.p14_rn_recommended_tier, 20);
    const alftRnTierRecommendation = rnTier
      ? {
          tier: rnTier,
          justification: clean(exactPacketAnswers.p14_rn_tier_justification || exactPacketAnswers.p13_commentary_section, 4000),
          recommendedAtIso: now.toISOString(),
          recommendedByName: clean(exactPacketAnswers.p14_rn_print_name, 160) || assignedRnName,
          source: rnOverride ? 'admin_override' : 'form',
        }
      : null;

    const signature: Record<string, unknown> = {};
    if (mswSignedAt) {
      signature.mswSignedAt = mswSignedAt;
      signature.mswSignedName =
        clean(exactPacketAnswers.p14_print_name, 200) || swName || 'MSW';
      if (mswOverride) {
        signature.mswAdminOverride = true;
        signature.mswAdminOverrideAt = now;
        signature.mswAdminOverrideByUid = authCheck.uid || null;
        signature.mswAdminOverrideByEmail = authCheck.email || null;
      }
    }
    if (rnSignedAt) {
      signature.rnSignedAt = rnSignedAt;
      signature.rnSignedName = clean(exactPacketAnswers.p14_rn_print_name, 200) || assignedRnName;
      if (rnOverride) {
        signature.rnAdminOverride = true;
        signature.rnAdminOverrideAt = now;
        signature.rnAdminOverrideByUid = authCheck.uid || null;
        signature.rnAdminOverrideByEmail = authCheck.email || null;
      }
    }

    const transitionSummary =
      clean(body?.transitionSummary, 4000) ||
      clean(exactPacketAnswers.p13_commentary_section, 4000) ||
      'Admin-imported completed ISP / ALFT.';
    const requestedActions =
      clean(body?.requestedActions, 2000) || 'Continue ISP workflow review from admin import.';

    const ref = await adminDb.collection('standalone_upload_submissions').add({
      status: 'pending',
      source: 'isp-workflow-admin',
      sourceLabel: clean(body?.sourceLabel, 200) || 'Admin completed ISP import',
      toolCode: 'ALFT',
      documentType: 'ALFT Tool',
      files: [],
      alftForm: {
        formVersion: 'exact-packet-v1',
        exactPacketAnswers,
        transitionSummary,
        requestedActions,
        medListAttachment: body?.medListAttachment || null,
        ...(mswSignedAt ? { swSignedAt: mswSignedAt, swSignature: signature.mswSignedName } : {}),
        ...(rnSignedAt ? { rnSignedAt } : {}),
      },
      ...(Object.keys(signature).length ? { alftSignature: signature } : {}),
      ...(alftRnTierRecommendation ? { alftRnTierRecommendation } : {}),
      uploaderUid: authCheck.uid || null,
      uploaderEmail: authCheck.email || null,
      uploaderName: swName || assignedStaffName,
      memberId: memberId || null,
      memberName: memberName || clean(exactPacketAnswers.p1_member_name, 140) || 'Member',
      memberFirstName: memberFirstName || null,
      memberLastName: memberLastName || null,
      memberNameSearch: `${(memberLastName || '').toLowerCase()}|${(memberFirstName || '').toLowerCase()}|${(memberName || '').toLowerCase()}`.slice(
        0,
        300
      ),
      healthPlan: clean(body?.member?.healthPlan, 80) || 'Kaiser',
      medicalRecordNumber,
      mediCalNumber: clean(body?.member?.mediCalNumber, 80) || null,
      kaiserMrn: clean(body?.member?.kaiserMrn, 80) || medicalRecordNumber,
      prefillPurpose: clean(body?.member?.prefillPurpose, 40) || null,
      alftCollaboration: {
        allowAllPartiesEdit: true,
        editableRoleKeys: ['social_worker', 'staff', 'rn', 'admin', 'super_admin'],
        editableUids: [authCheck.uid, assignedStaffUid, assignedRnUid].filter(Boolean),
        createdByUid: authCheck.uid || null,
      },
      alftStaffUid: assignedStaffUid,
      alftStaffName: assignedStaffName,
      alftStaffEmail: assignedStaffEmail,
      alftStaffAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
      alftRnUid: assignedRnUid,
      alftRnName: assignedRnName,
      alftRnEmail: assignedRnEmail,
      alftRnAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
      workflowStatus,
      workflowStage,
      workflowRouting: {
        nextStepKey,
        nextStepLabel,
        nextRecipientName: assignedStaffName,
        nextRecipientEmail: assignedStaffEmail,
        finalReviewOwnerName: assignedStaffName,
        finalReviewOwnerEmail: assignedStaffEmail,
      },
      assignedManager: {
        uid: assignedStaffUid,
        name: assignedStaffName,
        email: assignedStaffEmail,
      },
      workflowSteps: {
        swInviteSent: Boolean(swEmail),
        swSubmittedSigned: Boolean(mswSignedAt),
        managerReview: rnOverride ? 'complete' : 'pending',
        rnReview: rnOverride ? 'complete' : 'pending',
      },
      workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (memberId) {
      await adminDb
        .collection('alft_assignments')
        .doc(memberId)
        .set(
          {
            latestIntakeId: ref.id,
            status: 'submitted',
            workflowStatus,
            workflowStage,
            needsSwRevision: false,
            alftStaffUid: assignedStaffUid,
            alftStaffName: assignedStaffName,
            alftStaffEmail: assignedStaffEmail,
            alftRnUid: assignedRnUid,
            alftRnName: assignedRnName,
            alftRnEmail: assignedRnEmail,
            workflowSteps: {
              swInviteSent: Boolean(swEmail),
              swSubmittedSigned: Boolean(mswSignedAt),
              managerReview: rnOverride ? 'complete' : 'pending',
              rnReview: rnOverride ? 'complete' : 'pending',
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => null);
    }

    return NextResponse.json({
      success: true,
      intakeId: ref.id,
      workflowStatus,
      mswOverride,
      rnOverride,
    });
  } catch (error: any) {
    console.error('[api/alft/intake/create-from-admin]', error);
    return NextResponse.json(
      { success: false, error: clean(error?.message || 'Failed to create ISP intake', 500) },
      { status: 500 }
    );
  }
}
