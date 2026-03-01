import { NextRequest, NextResponse } from 'next/server';
import { 
  sendFlaggedVisitNotification,
  generateFlagReasons,
  getNotificationUrgency 
} from '@/lib/visit-notifications';

interface VisitSubmission {
  visitId: string;
  memberId: string;
  memberName: string;
  socialWorkerId: string;
  socialWorkerUid?: string;
  socialWorkerEmail?: string;
  socialWorkerName?: string;
  rcfeId: string;
  rcfeName: string;
  rcfeAddress: string;
  visitDate: string;
  memberRoomNumber?: string;
  
  meetingLocation: {
    location: string;
    otherLocation?: string;
    notes?: string;
  };
  
  memberWellbeing: {
    physicalHealth: number;
    mentalHealth: number;
    socialEngagement: number;
    overallMood: number;
    notes: string;
  };
  
  careSatisfaction: {
    staffAttentiveness: number;
    mealQuality: number;
    cleanlinessOfRoom: number;
    activitiesPrograms: number;
    overallSatisfaction: number;
    notes: string;
  };
  
  memberConcerns: {
    hasConcerns: boolean | null;
    concernTypes: {
      medical: boolean;
      staff: boolean;
      safety: boolean;
      food: boolean;
      social: boolean;
      financial: boolean;
      other: boolean;
    };
    urgencyLevel: string;
    detailedConcerns: string;
    actionRequired: boolean;
  };
  
  rcfeAssessment: {
    facilityCondition: number;
    staffProfessionalism: number;
    safetyCompliance: number;
    careQuality: number;
    overallRating: number;
    notes: string;
    flagForReview: boolean;
  };
  
  visitSummary: {
    totalScore: number;
    flagged: boolean;
    followUpRequired: boolean;
    nextVisitDate: string;
  };
  
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

function isHoldValue(value: unknown): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return false;
  // Common variants: "Hold", "On Hold", "🔴 Hold", "HOLD", etc.
  return v.includes('hold') || v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'x';
}

function parseCaspioDateToLocalDate(value: unknown): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // Common Caspio-ish formats: "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss", "MM/DD/YYYY"
  const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLike) {
    const y = Number(isoLike[1]);
    const m = Number(isoLike[2]);
    const d = Number(isoLike[3]);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
  }

  const usLike = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usLike) {
    const m = Number(usLike[1]);
    const d = Number(usLike[2]);
    const y = Number(usLike[3]);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
  }

  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
}

function isKaiserMember(member: any): boolean {
  const planRaw =
    member?.CalAIM_MCO ??
    member?.CalAIM_MCP ??
    member?.Health_Plan ??
    member?.healthPlan ??
    member?.health_plan ??
    '';
  const plan = String(planRaw ?? '').trim().toLowerCase();
  return plan.includes('kaiser');
}

function isAuthExpiredForSwVisits(member: any): { expired: boolean; endDate: Date | null } {
  // Kaiser does not pay for SW visits past initial authorizations.
  if (!isKaiserMember(member)) return { expired: false, endDate: null };

  const endRaw =
    member?.Authorization_End_Date_T2038 ??
    member?.authorization_end_date_t2038 ??
    member?.Auth_End_Date_T2038 ??
    member?.authEndDateT2038 ??
    '';
  const endDate = parseCaspioDateToLocalDate(endRaw);
  if (!endDate) return { expired: false, endDate: null };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return { expired: endDate.getTime() < todayStart.getTime(), endDate };
}

function swMatchesMember(params: {
  socialWorkerId: string;
  memberSwAssigned: unknown;
  memberStaffAssigned: unknown;
  memberSwId: unknown;
}): boolean {
  const rawNeedle = String(params.socialWorkerId || '').trim();
  if (!rawNeedle) return false;

  const normalize = (value: unknown) =>
    String(value ?? '')
      .trim()
      .toLowerCase()
      // turn punctuation into spaces so "Last, First" matches "First Last"
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const tokenize = (value: unknown) =>
    normalize(value)
      .split(' ')
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

  const needleLower = rawNeedle.toLowerCase();
  const needleNorm = normalize(rawNeedle);
  const needleTokens = tokenize(rawNeedle);

  const swAssignedRaw = String(params.memberSwAssigned ?? '').trim();
  const staffAssignedRaw = String(params.memberStaffAssigned ?? '').trim();
  const swIdRaw = String(params.memberSwId ?? '').trim();

  const swAssignedLower = swAssignedRaw.toLowerCase();
  const staffAssignedLower = staffAssignedRaw.toLowerCase();
  const swIdLower = swIdRaw.toLowerCase();

  // Exact ID match always wins.
  if (swIdLower && (swIdLower === needleLower || swIdLower === needleNorm)) return true;

  // Fast substring checks.
  if (swAssignedLower && swAssignedLower.includes(needleLower)) return true;
  if (staffAssignedLower && staffAssignedLower.includes(needleLower)) return true;

  // Normalized substring checks (handles punctuation / ordering variance).
  const swAssignedNorm = normalize(swAssignedRaw);
  const staffAssignedNorm = normalize(staffAssignedRaw);
  if (needleNorm && swAssignedNorm.includes(needleNorm)) return true;
  if (needleNorm && staffAssignedNorm.includes(needleNorm)) return true;

  // Token-subset match: if all needle tokens appear in the assigned name tokens, treat as match.
  // Example: "Frodo Baggins" <-> "Baggins, Frodo"
  if (needleTokens.length >= 2) {
    const swTokenSet = new Set(tokenize(swAssignedRaw));
    const staffTokenSet = new Set(tokenize(staffAssignedRaw));
    const allIn = (set: Set<string>) => needleTokens.every((t) => set.has(t));
    if (allIn(swTokenSet) || allIn(staffTokenSet)) return true;
  }

  // If the identifier looks like an email, try matching on local-part fragments.
  if (needleLower.includes('@')) {
    const local = needleLower.split('@')[0] || '';
    const parts = local
      .split(/[._+\-]/g)
      .map((p) => p.trim())
      .filter((p) => p.length >= 3);

    for (const p of parts) {
      const pNorm = normalize(p);
      if (!pNorm) continue;
      if (swAssignedNorm.includes(pNorm) || staffAssignedNorm.includes(pNorm)) return true;
    }
  }

  return false;
}

// GET: Fetch SW's assigned members by RCFE
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const socialWorkerId = searchParams.get('socialWorkerId');
    
    if (!socialWorkerId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Social Worker ID is required' 
      }, { status: 400 });
    }

    console.log('🔍 Fetching assigned members for SW:', socialWorkerId);

    // Prefer Firestore cache to avoid Caspio reads and schema drift.
    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;

    const normalize = (value: unknown) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const pickQueryTokens = (id: string): string[] => {
      const raw = String(id || '').trim().toLowerCase();
      if (!raw) return [];

      // If SW_ID is used, prefer that exact token.
      if (/^\d{3,}$/.test(raw)) return [raw];

      const tokens: string[] = [];
      const norm = normalize(raw);
      if (norm) tokens.push(...norm.split(' '));

      if (raw.includes('@')) {
        const local = raw.split('@')[0] || '';
        const localParts = local.split(/[._+\-]/g);
        tokens.push(...localParts);
        // Heuristic: handle emails like "fbaggins" when Caspio stores "Baggins, Frodo".
        // Add a "likely last name" token by stripping a leading initial.
        for (const part of localParts) {
          const p = String(part || '').trim();
          if (p.length >= 5 && /^[a-z][a-z]+$/.test(p)) {
            tokens.push(p.slice(1));
          }
        }
      }

      const cleaned = Array.from(
        new Set(
          tokens
            .map((t) => normalize(t))
            .filter((t) => t.length >= 3)
        )
      )
        .map((t) => normalize(t))
        .filter((t) => t.length >= 3);

      if (cleaned.length === 0) return [];
      // Prefer a longer token (often last name) to reduce result size.
      cleaned.sort((a, b) => b.length - a.length);
      return cleaned;
    };

    const needles: string[] = [String(socialWorkerId || '').trim()].filter(Boolean);

    // If they pass an email, try to resolve the Caspio SW_ID from `syncedSocialWorkers`.
    // This helps when Caspio member rows are keyed by SW_ID but the portal uses email login.
    try {
      const maybeEmail = needles[0] && needles[0].includes('@') ? needles[0].toLowerCase() : '';
      if (maybeEmail) {
        const swSnap = await adminDb
          .collection('syncedSocialWorkers')
          .where('email', '==', maybeEmail)
          .limit(1)
          .get();
        const swId = swSnap.empty ? '' : String(swSnap.docs[0].data()?.sw_id || '').trim();
        if (swId) needles.push(swId);
      }
    } catch {
      // best-effort only
    }

    const tokens = needles.flatMap((n) => pickQueryTokens(n));
    let snapshot: FirebaseFirestore.QuerySnapshot | null = null;

    // Try a few possible query tokens (last-name, first-name, SW_ID, email local-part, etc.)
    // until we get a hit. This avoids "0 assigned" when token choice doesn't exist.
    for (const token of tokens.slice(0, 6)) {
      try {
        const s = await adminDb
          .collection('caspio_members_cache')
          .where('sw_search_keys', 'array-contains', token)
          .limit(5000)
          .get();
        if (!s.empty) {
          snapshot = s;
          break;
        }
      } catch {
        // ignore and try next token
      }
    }

    if (!snapshot || snapshot.empty) {
      // Fallback scan: if the cache is large and `sw_search_keys` isn't present yet,
      // a hard `limit(5000)` can exclude the SW's assignments completely.
      // Scan in pages (bounded) until we find some assigned members.
      let page = await adminDb
        .collection('caspio_members_cache')
        .orderBy(adminModule.default.firestore.FieldPath.documentId())
        .limit(5000)
        .get();
      snapshot = page;

      let scanned = page.size;
      let assignedCount = 0;

      const maxScan = 25_000; // safety cap
      while (page.size > 0 && scanned < maxScan) {
        const pageMembers = page.docs.map((d) => d.data() as any);
        assignedCount = pageMembers.filter((member) =>
          needles.some((needle) =>
            swMatchesMember({
              socialWorkerId: needle,
              memberSwAssigned:
                member?.Social_Worker_Assigned ??
                member?.social_worker_assigned ??
                member?.SocialWorkerAssigned ??
                member?.socialWorkerAssigned ??
                '',
              memberStaffAssigned:
                member?.Staff_Assigned ??
                member?.staff_assigned ??
                member?.Kaiser_User_Assignment ??
                member?.kaiser_user_assignment ??
                '',
              memberSwId: member?.SW_ID ?? member?.sw_id ?? member?.Sw_Id ?? '',
            })
          )
        ).length;
        if (assignedCount > 0) {
          // Use this page for results (good enough to show the SW their assignments).
          snapshot = page;
          break;
        }

        const last = page.docs[page.docs.length - 1];
        page = await adminDb
          .collection('caspio_members_cache')
          .orderBy(adminModule.default.firestore.FieldPath.documentId())
          .startAfter(last)
          .limit(5000)
          .get();
        scanned += page.size;
      }
    }

    const members = snapshot.docs.map((d) => d.data() as any);
    if (members.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Members cache is empty. Ask an admin to click "Sync from Caspio".' },
        { status: 409 }
      );
    }

    const isAuthorized = (value: unknown) => {
      const v = String(value ?? '').trim().toLowerCase();
      if (!v) return false;
      // Avoid matching "Not Authorized"
      return v === 'authorized' || v.startsWith('authorized ');
    };

    const assignedAll = members.filter((member) => {
      const assigned = needles.some((needle) =>
        swMatchesMember({
          socialWorkerId: needle,
          memberSwAssigned:
            member?.Social_Worker_Assigned ??
            member?.social_worker_assigned ??
            member?.SocialWorkerAssigned ??
            member?.socialWorkerAssigned ??
            '',
          memberStaffAssigned:
            member?.Staff_Assigned ??
            member?.staff_assigned ??
            member?.Kaiser_User_Assignment ??
            member?.kaiser_user_assignment ??
            '',
          memberSwId: member?.SW_ID ?? member?.sw_id ?? member?.Sw_Id ?? '',
        })
      );
      return assigned;
    });

    // Monthly SW visit questionnaires are for Authorized members only.
    const assignedAuthorized = assignedAll.filter((member) =>
      isAuthorized(member?.CalAIM_Status ?? member?.calaim_status ?? member?.CalAIMStatus ?? member?.calaimStatus)
    );

    const suspendedHoldCount = assignedAuthorized.filter((member) =>
      isHoldValue(
        member?.Hold_For_Social_Worker ??
          member?.Hold_for_Social_Worker ??
          member?.Hold_For_Social_Worker_Visit ??
          member?.Hold_for_Social_Worker_Visit
      )
    ).length;

    const suspendedAuthExpiredCount = assignedAuthorized.filter((member) => isAuthExpiredForSwVisits(member).expired)
      .length;

    const suspendedAnyCount = assignedAuthorized.filter((member) => {
      const hold = isHoldValue(
        member?.Hold_For_Social_Worker ??
          member?.Hold_for_Social_Worker ??
          member?.Hold_For_Social_Worker_Visit ??
          member?.Hold_for_Social_Worker_Visit
      );
      const expired = isAuthExpiredForSwVisits(member).expired;
      return hold || expired;
    }).length;

    const assignedMembers = assignedAuthorized.filter((member) => {
      const hold = isHoldValue(
        member?.Hold_For_Social_Worker ??
          member?.Hold_for_Social_Worker ??
          member?.Hold_For_Social_Worker_Visit ??
          member?.Hold_for_Social_Worker_Visit
      );
      const expired = isAuthExpiredForSwVisits(member).expired;
      return !hold && !expired;
    });

    const normalizeKey = (value: unknown) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const pickRcfeRegisteredId = (member: any): string => {
      const raw =
        member?.RCFE_Registered_ID ??
        member?.rcfeRegisteredId ??
        member?.RCFE_RegisteredID ??
        member?.rcfe_registered_id ??
        '';
      const v = String(raw ?? '').trim();
      return v;
    };

    // Group by RCFE (prefer RCFE_Registered_ID to avoid name collisions)
    const rcfeGroups = assignedMembers.reduce((acc, member) => {
      const rcfeName = String(member.RCFE_Name || member.rcfeName || '').trim() || 'Unknown RCFE';
      const registeredId = pickRcfeRegisteredId(member);
      const groupKey = registeredId ? `rid:${registeredId}` : `name:${normalizeKey(rcfeName) || 'unknown'}`;
      if (!acc[groupKey]) {
        const city = String(member.RCFE_City || member.MemberCity || member.Member_City || '').trim() || null;
        const zip = String(member.RCFE_Zip || '').trim() || null;
        const administrator =
          String(member.RCFE_Administrator || member.rcfeAdministrator || '').trim() || null;
        const administratorPhone =
          String(member.RCFE_Administrator_Phone || member.rcfeAdministratorPhone || '').trim() || null;
        acc[groupKey] = {
          id: registeredId || `rcfe-${normalizeKey(rcfeName).replace(/\s+/g, '-')}`,
          name: rcfeName,
          address: member.RCFE_Address || 'Address not available',
          city,
          zip,
          administrator,
          administratorPhone,
          members: []
        };
      }
      
      acc[groupKey].members.push({
        id: String(member.Client_ID2 || member.client_ID2 || member.id || '').trim() || Math.random().toString(),
        name: String(member.memberName || '').trim() || `${member.memberFirstName || ''} ${member.memberLastName || ''}`.trim(),
        room: 'Room TBD', // This would come from RCFE data if available
        rcfeId: acc[groupKey].id,
        rcfeName: rcfeName,
        rcfeAddress: member.RCFE_Address || 'Address not available',
        lastVisitDate: null // This would come from visit history
      });
      
      return acc;
    }, {} as Record<string, any>);

    const rcfeList = Object.values(rcfeGroups).map(rcfe => ({
      ...rcfe,
      memberCount: rcfe.members.length
    }));

    console.log(`✅ Found ${assignedMembers.length} assigned members across ${rcfeList.length} RCFEs`);
    if (suspendedAnyCount > 0) {
      console.log(
        `🚫 ${suspendedAnyCount} members excluded (hold=${suspendedHoldCount}, authExpired=${suspendedAuthExpiredCount})`
      );
    }

    // Expose cache freshness for the SW portal UI (so they can confirm they are working off a recent sync).
    let cacheStatus: { lastRunAt?: string | null; lastSyncAt?: string | null; lastMode?: string | null } | null = null;
    try {
      const settingsSnap = await adminDb.collection('admin-settings').doc('caspio-members-sync').get();
      const settings = settingsSnap.exists ? (settingsSnap.data() as any) : null;
      const lastRunAt = String(settings?.lastRunAt || '').trim();
      const lastSyncAt = String(settings?.lastSyncAt || '').trim();
      const lastMode = String(settings?.lastMode || '').trim();
      if (lastRunAt || lastSyncAt || lastMode) {
        cacheStatus = {
          lastRunAt: lastRunAt || null,
          lastSyncAt: lastSyncAt || null,
          lastMode: lastMode || null,
        };
      }
    } catch {
      // best-effort only
    }

    return NextResponse.json({
      success: true,
      rcfeList,
      totalMembers: assignedMembers.length,
      totalRCFEs: rcfeList.length,
      // Backwards-compatible field name used by SW portal UI; now includes authorization-expired Kaiser members too.
      membersOnHold: suspendedAnyCount,
      membersSuspended: suspendedAnyCount,
      membersSuspendedHold: suspendedHoldCount,
      membersSuspendedAuthExpired: suspendedAuthExpiredCount,
      cacheStatus,
      // Extra diagnostics (safe for SW portal UI / admin debugging).
      totalAssignedAuthorized: assignedAuthorized.length,
      totalAssignedAll: assignedAll.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching SW assignments:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to fetch SW assignments' 
    }, { status: 500 });
  }
}

// POST: Submit visit questionnaire
export async function POST(req: NextRequest) {
  try {
    const visitData: VisitSubmission = await req.json();
    
    console.log('📝 Submitting visit questionnaire:', {
      visitId: visitData.visitId,
      memberName: visitData.memberName,
      socialWorkerId: visitData.socialWorkerId,
      totalScore: visitData.visitSummary.totalScore,
      flagged: visitData.visitSummary.flagged
    });

    // Validate required fields
    if (!visitData.visitId || !visitData.memberId || !visitData.socialWorkerId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields'
      }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    // Enforce portal rules:
    // - Monthly SW visit questionnaires are for Authorized members only.
    // - If the member is on Hold for SW visits, the questionnaire cannot be submitted.
    // - For Kaiser, suspend SW visits after `Authorization_End_Date_T2038`.
    try {
      const isAuthorized = (value: unknown) => {
        const v = String(value ?? '').trim().toLowerCase();
        if (!v) return false;
        return v === 'authorized' || v.startsWith('authorized ');
      };
      const memberSnap = await adminDb.collection('caspio_members_cache').doc(String(visitData.memberId)).get();
      const member = memberSnap.exists ? (memberSnap.data() as any) : null;
      if (member) {
        const status = member?.CalAIM_Status ?? member?.calaim_status ?? member?.CalAIMStatus ?? member?.calaimStatus;
        if (!isAuthorized(status)) {
          return NextResponse.json(
            {
              success: false,
              error: 'Monthly questionnaires are only allowed for Authorized members.',
            },
            { status: 403 }
          );
        }
        const hold = isHoldValue(
          member?.Hold_For_Social_Worker ??
            member?.Hold_for_Social_Worker ??
            member?.Hold_For_Social_Worker_Visit ??
            member?.Hold_for_Social_Worker_Visit
        );
        if (hold) {
          return NextResponse.json(
            {
              success: false,
              error: 'This member is currently on hold for SW visits and cannot be submitted.',
            },
            { status: 403 }
          );
        }

        const authExpiry = isAuthExpiredForSwVisits(member);
        if (authExpiry.expired) {
          const endLabel = authExpiry.endDate ? authExpiry.endDate.toLocaleDateString() : 'the authorization end date';
          return NextResponse.json(
            {
              success: false,
              error: `This member's Kaiser authorization ended on ${endLabel}. SW visits are suspended after the authorization end date.`,
            },
            { status: 403 }
          );
        }
      }
    } catch {
      // If we cannot validate, continue (best-effort); the UI should still prevent selection.
    }
    const submittedAtDate = new Date();
    const submittedAtIso = submittedAtDate.toISOString();
    const submittedAtTs = admin.firestore.Timestamp.fromDate(submittedAtDate);

    const socialWorkerUid = String(visitData.socialWorkerUid || '').trim() || null;
    const socialWorkerEmail = String(visitData.socialWorkerEmail || '').trim().toLowerCase() || null;
    let socialWorkerName = String(visitData.socialWorkerName || '').trim()
      || String(visitData.socialWorkerId || '').trim()
      || socialWorkerEmail
      || 'Social Worker';

    // If we only have an email (or an email-like value), try to resolve a friendly name
    // from the Caspio-synced social worker directory.
    try {
      const looksLikeEmail = (value: string) => value.includes('@') && value.includes('.');
      if (socialWorkerEmail && looksLikeEmail(socialWorkerName)) {
        const snap = await adminDb
          .collection('syncedSocialWorkers')
          .where('email', '==', socialWorkerEmail)
          .limit(1)
          .get();
        if (!snap.empty) {
          const n = String((snap.docs[0].data() as any)?.name || '').trim();
          if (n) socialWorkerName = n;
        }
      }
    } catch {
      // ignore best-effort name resolution
    }

    const claimDay = String(visitData.visitDate || submittedAtIso.slice(0, 10)).slice(0, 10);
    const claimMonth = claimDay.slice(0, 7);
    const claimKey = (claimDay || submittedAtIso.slice(0, 10)).replace(/-/g, '');
    const claimSwKey = socialWorkerUid || socialWorkerEmail || String(visitData.socialWorkerId || '').trim() || 'unknown';
    const claimId = `swClaim_${claimSwKey}_${claimKey}`;
    const visitMonth = claimMonth;

    // Enforce one visit per member per month (even if visits aren't exactly 1 month apart).
    // Uses a lock doc to avoid composite-index queries and ensure concurrency safety.
    try {
      const lockKey = `${String(visitData.memberId)}_${visitMonth}`;
      const lockRef = adminDb.collection('sw_member_monthly_visits').doc(lockKey);
      await adminDb.runTransaction(async (tx) => {
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists) {
          const existing = lockSnap.data() as any;
          const existingVisitId = String(existing?.visitId || '').trim();
          if (existingVisitId && existingVisitId !== String(visitData.visitId || '').trim()) {
            throw new Error('MONTHLY_MEMBER_VISIT_ALREADY_COMPLETED');
          }
          return;
        }
        tx.set(
          lockRef,
          {
            memberId: String(visitData.memberId),
            visitMonth,
            visitId: String(visitData.visitId),
            socialWorkerUid,
            socialWorkerEmail,
            socialWorkerName,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('MONTHLY_MEMBER_VISIT_ALREADY_COMPLETED')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Only one member visit per month is allowed for the same member. This member already has a completed visit for this month.',
          },
          { status: 409 }
        );
      }
      // For transient transaction errors, fall through (best-effort); admin can review duplicates.
    }

    // Check if visit should trigger notifications
    const shouldNotify = visitData.visitSummary.flagged || 
                        visitData.memberConcerns.urgencyLevel === 'critical' ||
                        visitData.memberConcerns.actionRequired ||
                        visitData.rcfeAssessment.flagForReview;

    if (shouldNotify) {
      const flagReasons = generateFlagReasons(visitData);
      const urgency = getNotificationUrgency({
        visitId: visitData.visitId,
        memberName: visitData.memberName,
        rcfeName: visitData.rcfeName,
        rcfeAddress: visitData.rcfeAddress,
        socialWorkerName: visitData.socialWorkerId,
        socialWorkerId: visitData.socialWorkerId,
        visitDate: visitData.visitDate,
        totalScore: visitData.visitSummary.totalScore,
        flagReasons,
        urgencyLevel: visitData.memberConcerns.urgencyLevel as any,
        memberConcerns: visitData.memberConcerns.detailedConcerns,
        rcfeIssues: visitData.rcfeAssessment.notes,
        actionRequired: visitData.memberConcerns.actionRequired,
        geolocation: visitData.geolocation
      });

      console.log('🚨 Visit flagged for immediate attention:', {
        memberName: visitData.memberName,
        rcfeName: visitData.rcfeName,
        urgency,
        flagReasons,
        totalScore: visitData.visitSummary.totalScore
      });

      // Send notifications to John Amber and Jason Bloome
      try {
        await sendFlaggedVisitNotification(visitData);
        console.log('✅ Notification sent to supervisors');
      } catch (notificationError) {
        console.error('⚠️ Failed to send notification, but visit was saved:', notificationError);
      }
    }

    const flagReasons = shouldNotify ? generateFlagReasons(visitData) : [];
    const geolocationVerified = Boolean(visitData.geolocation);
    const status: 'pending_signoff' | 'flagged' =
      shouldNotify ? 'flagged' : 'pending_signoff';
    const geolocationLat = typeof visitData.geolocation?.latitude === 'number' ? visitData.geolocation.latitude : null;
    const geolocationLng = typeof visitData.geolocation?.longitude === 'number' ? visitData.geolocation.longitude : null;

    // Persist the visit so it appears in admin "Visit Records"
    await adminDb.collection('sw_visit_records').doc(visitData.visitId).set({
      id: visitData.visitId,
      visitId: visitData.visitId,
      socialWorkerId: visitData.socialWorkerId,
      socialWorkerUid,
      socialWorkerEmail,
      socialWorkerName,
      memberId: visitData.memberId,
      memberName: visitData.memberName,
      memberRoomNumber: String((visitData as any)?.memberRoomNumber || '').trim() || null,
      rcfeId: visitData.rcfeId,
      rcfeName: visitData.rcfeName,
      rcfeAddress: visitData.rcfeAddress,
      visitDate: visitData.visitDate,
      visitMonth,
      completedAt: submittedAtIso,
      submittedAt: submittedAtIso,
      submittedAtTs,
      totalScore: Number(visitData.visitSummary?.totalScore || 0),
      flagged: Boolean(shouldNotify),
      flagReasons,
      signedOff: false,
      geolocationVerified,
      geolocationLat,
      geolocationLng,
      geolocation: visitData.geolocation || null,
      status,
      raw: visitData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Auto-upsert daily claim draft ($45/visit + $20/day gas if any visit that day)
    await adminDb.runTransaction(async (tx) => {
      const claimRef = adminDb.collection('sw-claims').doc(claimId);
      const claimSnap = await tx.get(claimRef);

      const existing = claimSnap.exists ? (claimSnap.data() as any) : null;
      const existingVisitIds: string[] = Array.isArray(existing?.visitIds) ? existing.visitIds : [];
      const nextVisitIds = existingVisitIds.includes(visitData.visitId)
        ? existingVisitIds
        : [...existingVisitIds, visitData.visitId];

      const visitFeeRate = 45;
      const gasAmount = 20;
      const visitCount = nextVisitIds.length;
      const visitTotal = visitCount * visitFeeRate;
      const totalAmount = visitTotal + (visitCount >= 1 ? gasAmount : 0);

      const memberVisits = Array.isArray(existing?.memberVisits) ? existing.memberVisits : [];
      const hasVisitEntry = memberVisits.some((v: any) => String(v?.id || v?.visitId || '') === visitData.visitId);
      const nextMemberVisits = hasVisitEntry
        ? memberVisits
        : [
            ...memberVisits,
            {
              id: visitData.visitId,
              memberName: visitData.memberName,
              memberRoomNumber: String((visitData as any)?.memberRoomNumber || '').trim() || '',
              rcfeName: visitData.rcfeName,
              rcfeAddress: visitData.rcfeAddress,
              visitDate: claimDay,
              visitTime: '',
              notes: '',
            }
          ];

      const base = {
        socialWorkerUid,
        socialWorkerEmail,
        socialWorkerName,
        claimDate: admin.firestore.Timestamp.fromDate(new Date(`${claimDay}T00:00:00.000Z`)),
        claimMonth,
        visitIds: nextVisitIds,
        visitCount,
        visitFeeRate,
        gasPolicy: 'perDayIfAnyVisit',
        gasAmount: visitCount >= 1 ? gasAmount : 0,
        gasReimbursement: visitCount >= 1 ? gasAmount : 0,
        totalMemberVisitFees: visitTotal,
        totalAmount,
        memberVisits: nextMemberVisits,
        status: existing?.status || 'draft',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      } as const;

      if (!existing) {
        tx.set(claimRef, {
          ...base,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        tx.set(claimRef, base, { merge: true });
      }

      const visitRef = adminDb.collection('sw_visit_records').doc(visitData.visitId);
      tx.set(visitRef, {
        claimId,
        claimMonth,
        claimStatus: existing?.status || 'draft',
        claimVisitFeeRate: visitFeeRate,
        claimGasAmount: visitCount >= 1 ? gasAmount : 0,
        claimTotalAmount: totalAmount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    console.log('💾 Visit saved to Firestore:', visitData.visitId);

    return NextResponse.json({
      success: true,
      visitId: visitData.visitId,
      message: 'Visit questionnaire submitted successfully',
      flagged: shouldNotify,
      nextActions: shouldNotify ? [
        'John Amber and Jason Bloome have been notified',
        'Follow-up will be scheduled if required',
        'Member concerns will be addressed within 24 hours'
      ] : []
    });

  } catch (error: any) {
    console.error('❌ Error submitting visit:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to submit visit'
    }, { status: 500 });
  }
}