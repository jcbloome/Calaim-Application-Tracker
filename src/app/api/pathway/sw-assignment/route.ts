import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeStatus(value: unknown): string {
  return normalize(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function isRnVisitNeeded(value: unknown): boolean {
  return normalizeStatus(value) === 'rn visit needed';
}

function namesMatch(row: any, firstName: string, lastName: string): boolean {
  const rowFirst = normalize(row?.Senior_First || row?.memberFirstName || '');
  const rowLast = normalize(row?.Senior_Last || row?.memberLastName || '');
  if (!firstName && !lastName) return true;
  if (firstName && rowFirst && firstName !== rowFirst) return false;
  if (lastName && rowLast && lastName !== rowLast) return false;
  return true;
}

function pickAssignedSocialWorkerEmail(row: any): string {
  const candidates = [
    row?.Social_Worker_Assigned,
    row?.SocialWorkerAssigned,
    row?.socialWorkerAssigned,
    row?.Assigned_Social_Worker,
    row?.assignedSocialWorker,
  ];
  for (const candidate of candidates) {
    const email = String(candidate || '').trim().toLowerCase();
    if (email) return email;
  }
  return '';
}

function pickAssignedSocialWorkerName(row: any): string {
  const candidates = [
    row?.Social_Worker_Assigned_Name,
    row?.SocialWorkerAssignedName,
    row?.socialWorkerAssignedName,
    row?.Assigned_Social_Worker_Name,
    row?.assignedSocialWorkerName,
  ];
  for (const candidate of candidates) {
    const name = String(candidate || '').trim();
    if (name) return name;
  }
  return '';
}

async function resolveSocialWorkerDisplayName(swEmail: string): Promise<string> {
  const email = normalize(swEmail);
  if (!email) return '';
  try {
    const snap = await adminDb
      .collection('socialWorkers')
      .where('email', '==', email)
      .limit(1)
      .get();
    if (!snap.empty) {
      const data = snap.docs[0].data() as any;
      const name = String(data?.displayName || '').trim();
      if (name) return name;
    }
  } catch {
    // best effort
  }
  return '';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const memberClientId2 = String(searchParams.get('memberClientId2') || '').trim();
    const memberMrn = String(searchParams.get('memberMrn') || '').trim();
    const memberMediCalNum = String(searchParams.get('memberMediCalNum') || '').trim();
    const memberFirstName = normalize(searchParams.get('memberFirstName') || '');
    const memberLastName = normalize(searchParams.get('memberLastName') || '');

    let candidateRows: any[] = [];

    if (memberClientId2) {
      const directDoc = await adminDb.collection('caspio_members_cache').doc(memberClientId2).get();
      if (directDoc.exists) candidateRows.push(directDoc.data());
    }

    if (candidateRows.length === 0 && memberMrn) {
      const mrnSnap = await adminDb
        .collection('caspio_members_cache')
        .where('MCP_CIN', '==', memberMrn)
        .limit(20)
        .get();
      candidateRows = mrnSnap.docs.map((d) => d.data());
    }

    if (candidateRows.length === 0 && memberMediCalNum) {
      const medSnap = await adminDb
        .collection('caspio_members_cache')
        .where('MediCal_Number', '==', memberMediCalNum)
        .limit(20)
        .get();
      candidateRows = medSnap.docs.map((d) => d.data());
    }

    const namedRows = candidateRows.filter((row) => row && namesMatch(row, memberFirstName, memberLastName));
    const matchingPool = namedRows.length ? namedRows : candidateRows.filter(Boolean);
    const matching =
      matchingPool.find((row) => isRnVisitNeeded(row?.Kaiser_Status)) ||
      matchingPool.find((row) => pickAssignedSocialWorkerEmail(row)) ||
      matchingPool[0];

    if (!matching) {
      return NextResponse.json({
        success: true,
        found: false,
        eligible: false,
      });
    }

    const swEmail = pickAssignedSocialWorkerEmail(matching);
    const swNameFromCache = pickAssignedSocialWorkerName(matching);
    const swName = swNameFromCache || (await resolveSocialWorkerDisplayName(swEmail));
    const memberId = String(matching.Client_ID2 || matching.client_ID2 || '').trim();
    const kaiserStatus = String(matching.Kaiser_Status || '').trim();

    let assignmentStatus = '';
    if (memberId) {
      try {
        const assignmentDoc = await adminDb.collection('alft_assignments').doc(memberId).get();
        if (assignmentDoc.exists) {
          const assignmentData = assignmentDoc.data() as any;
          assignmentStatus = String(assignmentData?.status || '').trim();
        }
      } catch {
        // best effort
      }
    }

    return NextResponse.json({
      success: true,
      found: true,
      eligible: isRnVisitNeeded(kaiserStatus),
      memberId,
      kaiserStatus,
      assignedSwEmail: swEmail,
      assignedSwName: swName,
      assignmentStatus,
    });
  } catch (error: any) {
    console.error('[pathway/sw-assignment] lookup error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to resolve social worker assignment.',
      },
      { status: 500 }
    );
  }
}

