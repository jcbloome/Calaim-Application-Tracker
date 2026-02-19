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

    const snapshot = await adminDb.collection('caspio_members_cache').limit(5000).get();
    const members = snapshot.docs.map((d) => d.data() as any);
    if (members.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Members cache is empty. Ask an admin to click "Sync from Caspio".' },
        { status: 409 }
      );
    }

    const membersOnHold = members.filter((m) => isHoldValue(m?.Hold_For_Social_Worker ?? m?.Hold_for_Social_Worker)).length;

    const assignedMembers = members.filter((member) => {
      const assigned = swMatchesMember({
        socialWorkerId,
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
      });
      if (!assigned) return false;

      // Exclude members on hold for social worker visits.
      const hold = isHoldValue(member?.Hold_For_Social_Worker ?? member?.Hold_for_Social_Worker);
      return !hold;
    });

    // Group by RCFE
    const rcfeGroups = assignedMembers.reduce((acc, member) => {
      const rcfeKey = member.RCFE_Name || 'Unknown RCFE';
      if (!acc[rcfeKey]) {
        acc[rcfeKey] = {
          id: `rcfe-${rcfeKey.toLowerCase().replace(/\s+/g, '-')}`,
          name: rcfeKey,
          address: member.RCFE_Address || 'Address not available',
          members: []
        };
      }
      
      acc[rcfeKey].members.push({
        id: String(member.Client_ID2 || member.client_ID2 || member.id || '').trim() || Math.random().toString(),
        name: String(member.memberName || '').trim() || `${member.memberFirstName || ''} ${member.memberLastName || ''}`.trim(),
        room: 'Room TBD', // This would come from RCFE data if available
        rcfeId: acc[rcfeKey].id,
        rcfeName: rcfeKey,
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
    if (membersOnHold > 0) {
      console.log(`🚫 ${membersOnHold} members excluded due to SW visit hold status`);
    }

    return NextResponse.json({
      success: true,
      rcfeList,
      totalMembers: assignedMembers.length,
      totalRCFEs: rcfeList.length,
      membersOnHold: membersOnHold
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
    const submittedAtDate = new Date();
    const submittedAtIso = submittedAtDate.toISOString();
    const submittedAtTs = admin.firestore.Timestamp.fromDate(submittedAtDate);

    const socialWorkerUid = String(visitData.socialWorkerUid || '').trim() || null;
    const socialWorkerEmail = String(visitData.socialWorkerEmail || '').trim().toLowerCase() || null;
    const socialWorkerName = String(visitData.socialWorkerName || '').trim()
      || String(visitData.socialWorkerId || '').trim()
      || socialWorkerEmail
      || 'Social Worker';

    const claimDay = String(visitData.visitDate || submittedAtIso.slice(0, 10)).slice(0, 10);
    const claimMonth = claimDay.slice(0, 7);
    const claimKey = (claimDay || submittedAtIso.slice(0, 10)).replace(/-/g, '');
    const claimSwKey = socialWorkerUid || socialWorkerEmail || String(visitData.socialWorkerId || '').trim() || 'unknown';
    const claimId = `swClaim_${claimSwKey}_${claimKey}`;

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
      rcfeId: visitData.rcfeId,
      rcfeName: visitData.rcfeName,
      rcfeAddress: visitData.rcfeAddress,
      visitDate: visitData.visitDate,
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