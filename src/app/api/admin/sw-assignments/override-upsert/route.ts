import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { resolveUidByEmail } from '@/lib/alft-workflow-notify';
import { sendSwRosterAssignmentEmail } from '@/app/actions/send-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();

function pickMemberForRoster(raw: any, memberId: string) {
  const seniorFirst = String(raw?.Senior_First ?? raw?.memberFirstName ?? '').trim();
  const seniorLast = String(raw?.Senior_Last ?? raw?.memberLastName ?? '').trim();
  const memberName =
    String(raw?.memberName ?? '').trim() || [seniorFirst, seniorLast].filter(Boolean).join(' ').trim();

  return {
    Client_ID2: memberId,
    Senior_First: seniorFirst || undefined,
    Senior_Last: seniorLast || undefined,
    memberFirstName: seniorFirst || undefined,
    memberLastName: seniorLast || undefined,
    memberName: memberName || undefined,

    Member_County: raw?.Member_County ?? raw?.memberCounty ?? undefined,
    MemberCity: raw?.MemberCity ?? raw?.memberCity ?? undefined,

    CalAIM_MCO: raw?.CalAIM_MCO ?? undefined,
    CalAIM_Status: raw?.CalAIM_Status ?? undefined,

    Social_Worker_Assigned: raw?.Social_Worker_Assigned ?? undefined,
    Kaiser_User_Assignment: raw?.Kaiser_User_Assignment ?? undefined,
    Staff_Assigned: raw?.Staff_Assigned ?? undefined,
    SW_ID: raw?.SW_ID ?? undefined,

    Hold_For_Social_Worker: raw?.Hold_For_Social_Worker ?? raw?.Hold_for_Social_Worker ?? undefined,
    Hold_For_Social_Worker_Visit: raw?.Hold_For_Social_Worker_Visit ?? raw?.Hold_for_Social_Worker_Visit ?? undefined,

    Authorization_Start_Date_T2038: raw?.Authorization_Start_Date_T2038 ?? undefined,
    Authorization_End_Date_T2038: raw?.Authorization_End_Date_T2038 ?? undefined,

    RCFE_Registered_ID: raw?.RCFE_Registered_ID ?? undefined,
    RCFE_Name: raw?.RCFE_Name ?? undefined,
    RCFE_Address: raw?.RCFE_Address ?? undefined,
    RCFE_City: raw?.RCFE_City ?? undefined,
    RCFE_State: raw?.RCFE_State ?? undefined,
    RCFE_Zip: raw?.RCFE_Zip ?? undefined,
    RCFE_County: raw?.RCFE_County ?? undefined,
    RCFE_Administrator: raw?.RCFE_Administrator ?? undefined,
    RCFE_Administrator_Phone: raw?.RCFE_Administrator_Phone ?? undefined,
  };
}

function resolveMemberDisplayName(memberForRoster: Record<string, any>, memberId: string) {
  const first = String(memberForRoster?.Senior_First || memberForRoster?.memberFirstName || '').trim();
  const last = String(memberForRoster?.Senior_Last || memberForRoster?.memberLastName || '').trim();
  const full = String(memberForRoster?.memberName || '').trim();
  return full || [first, last].filter(Boolean).join(' ').trim() || memberId;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const memberId = String(body?.memberId || '').trim();
    const toSwEmailRaw = String(body?.toSwEmail || '').trim();
    const fromSwEmailRaw = String(body?.fromSwEmail || '').trim();
    const reason = String(body?.reason || '').trim();

    if (!memberId) {
      return NextResponse.json({ success: false, error: 'memberId is required' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const actorUid = adminCheck.uid;
    const actorEmail = adminCheck.email;
    const actorName = adminCheck.name;
    const admin = adminModule.default;

    const toSwEmail = normalizeEmail(toSwEmailRaw);
    const fromSwEmail = normalizeEmail(fromSwEmailRaw);

    const nowMs = Date.now();
    const defaultTtlDays = 14; // covers “next week” safely
    const effectiveUntilMs =
      Number.isFinite(Number(body?.effectiveUntilMs)) && Number(body?.effectiveUntilMs) > nowMs
        ? Number(body.effectiveUntilMs)
        : nowMs + defaultTtlDays * 24 * 60 * 60 * 1000;

    const memberForRoster = pickMemberForRoster(body?.member || body?.memberForRoster || {}, memberId);

    const docRef = adminDb.collection('sw_assignment_overrides').doc(memberId);
    await docRef.set(
      {
        memberId,
        fromSwEmail: fromSwEmail || null,
        toSwEmail: toSwEmail || null,
        reason: reason || null,
        effectiveFromMs: nowMs,
        effectiveUntilMs,
        updatedAtMs: nowMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: actorUid,
        updatedByEmail: actorEmail,
        updatedByName: actorName || null,
        memberForRoster,
      },
      { merge: true }
    );

    await adminDb.collection('sw_assignment_override_events').add({
      memberId,
      fromSwEmail: fromSwEmail || null,
      toSwEmail: toSwEmail || null,
      reason: reason || null,
      atMs: nowMs,
      at: admin.firestore.FieldValue.serverTimestamp(),
      byUid: actorUid,
      byEmail: actorEmail,
      byName: actorName || null,
    });

    let notified = false;
    let notificationError: string | null = null;
    const shouldNotify =
      Boolean(toSwEmail && toSwEmail.includes('@')) && toSwEmail !== fromSwEmail;

    if (shouldNotify) {
      const memberName = resolveMemberDisplayName(memberForRoster, memberId);
      const county = String(
        memberForRoster?.Member_County || memberForRoster?.memberCounty || ''
      ).trim();
      const mrn = String(
        (body?.member as any)?.Member_MRN ||
          (body?.member as any)?.memberMrn ||
          (body?.member as any)?.MRN ||
          ''
      ).trim();
      const assignedBy = String(actorName || actorEmail || 'CalAIM Team').trim();

      try {
        const swUid = await resolveUidByEmail(admin, adminDb, toSwEmail);
        let swName = toSwEmail.split('@')[0] || 'Social Worker';
        try {
          const byEmail = await adminDb
            .collection('socialWorkers')
            .where('email', '==', toSwEmail)
            .limit(1)
            .get();
          if (!byEmail.empty) {
            const swData = byEmail.docs[0].data() as any;
            swName =
              String(swData?.displayName || swData?.name || '').trim() ||
              [String(swData?.firstName || '').trim(), String(swData?.lastName || '').trim()]
                .filter(Boolean)
                .join(' ')
                .trim() ||
              swName;
          }
        } catch {
          // ignore name lookup failures
        }

        if (swUid) {
          await adminDb.collection('staff_notifications').add({
            userId: swUid,
            recipientName: swName,
            title: `New SW assignment: ${memberName}`,
            message: `You were assigned ${memberName}${memberId ? ` (${memberId})` : ''} on the social worker roster. Please review this member in the SW portal.`,
            memberName,
            clientId2: memberId,
            type: 'sw_roster_assignment',
            priority: 'Priority',
            status: 'Open',
            isRead: false,
            requiresStaffAction: true,
            followUpRequired: true,
            senderName: assignedBy,
            assignedByUid: actorUid || null,
            assignedByName: assignedBy,
            assignedByEmail: actorEmail || null,
            actionUrl: '/sw-portal',
            source: 'sw-assignment-override',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        await sendSwRosterAssignmentEmail({
          to: toSwEmail,
          socialWorkerName: swName,
          memberName,
          memberId,
          mrn: mrn || undefined,
          county: county || undefined,
          assignedBy,
          reason: reason || undefined,
          portalUrl: '/sw-portal',
        });
        notified = true;
      } catch (notifyErr: any) {
        notificationError = String(notifyErr?.message || 'Failed to notify newly assigned social worker');
        console.warn('⚠️ [SW-ASSIGNMENTS] override saved but notification failed:', notifyErr);
      }
    }

    return NextResponse.json({
      success: true,
      memberId,
      fromSwEmail: fromSwEmail || null,
      toSwEmail: toSwEmail || null,
      effectiveUntilMs,
      notified,
      notificationError,
    });
  } catch (error: any) {
    console.error('❌ [SW-ASSIGNMENTS] override-upsert failed:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to save assignment override' },
      { status: 500 }
    );
  }
}
