import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  fetchCaspioRns,
  fetchCaspioSocialWorkers,
  getCaspioCredentialsFromEnv,
} from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

const isUsableEmail = (raw: unknown) => {
  const email = clean(raw, 220).toLowerCase();
  if (!email || !email.includes('@')) return false;
  if (
    email.endsWith('@example.com') ||
    email.endsWith('@example.org') ||
    email.endsWith('@test.com')
  ) {
    return false;
  }
  return true;
};

const normName = (raw: unknown) =>
  clean(raw, 200)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const pick = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (row[key] != null && clean(row[key])) return clean(row[key]);
    const found = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
    if (found && clean(row[found])) return clean(row[found]);
  }
  return '';
};

type ContactUpdate = {
  memberId: string;
  memberName: string;
  previousSwEmail: string;
  newSwEmail: string;
  previousSwName: string;
  newSwName: string;
  previousRnEmail: string;
  newRnEmail: string;
  previousRnName: string;
  newRnName: string;
  swEmailChanged: boolean;
  rnEmailChanged: boolean;
  updated: boolean;
};

/**
 * Pull latest SW / RN name+email from Caspio for ISP tracker/workflow assignments.
 * Updates alft_assignments (and matching intakes) when Caspio has a newer email.
 */
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      memberIds?: unknown;
      memberId?: unknown;
    };
    const memberIds = [
      ...new Set(
        [
          ...(Array.isArray(body.memberIds) ? body.memberIds.map((id) => clean(id, 160)) : []),
          clean(body.memberId, 160),
        ].filter(Boolean)
      ),
    ].slice(0, 200);

    if (!memberIds.length) {
      return NextResponse.json(
        { success: false, error: 'memberId or memberIds required' },
        { status: 400 }
      );
    }

    const adminDb = authCheck.adminDb;
    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const credentials = getCaspioCredentialsFromEnv();

    const [swRoster, rnRoster] = await Promise.all([
      fetchCaspioSocialWorkers(credentials, { includeAssignmentCounts: false }),
      fetchCaspioRns(credentials, { includeAssignmentCounts: false }).catch(() => []),
    ]);

    const swById = new Map<string, { name: string; email: string }>();
    const swByName = new Map<string, { name: string; email: string }>();
    for (const sw of swRoster) {
      const id = clean(sw.sw_id || sw.id, 80).toLowerCase();
      const email = isUsableEmail(sw.email) ? clean(sw.email, 220).toLowerCase() : '';
      const name = clean(sw.name, 160);
      const entry = { name, email };
      if (id) swById.set(id, entry);
      const nk = normName(name);
      if (nk && email) swByName.set(nk, entry);
    }

    const rnById = new Map<string, { name: string; email: string }>();
    const rnByName = new Map<string, { name: string; email: string }>();
    for (const rn of rnRoster) {
      const id = clean(rn.rn_id || rn.id, 80).toLowerCase();
      const email = isUsableEmail(rn.email) ? clean(rn.email, 220).toLowerCase() : '';
      const name = clean(rn.name, 160);
      const entry = { name, email };
      if (id) rnById.set(id, entry);
      const nk = normName(name);
      if (nk && email) rnByName.set(nk, entry);
    }

    const updates: ContactUpdate[] = [];
    let updatedCount = 0;

    for (const memberId of memberIds) {
      const cacheSnap = await adminDb.collection('caspio_members_cache').doc(memberId).get();
      const member = (cacheSnap.exists ? cacheSnap.data() : {}) as Record<string, unknown>;

      const swId = pick(member, ['SW_ID', 'sw_id', 'Social_Worker_ID']).toLowerCase();
      const swAssignedName = pick(member, [
        'Social_Worker_Assigned',
        'social_worker_assigned',
        'SW_Assigned',
      ]);
      const rnId = pick(member, ['RN_ID', 'rn_id', 'Registered_Nurse_ID']).toLowerCase();
      const rnAssignedName = pick(member, ['RN_Assigned', 'RN_Name', 'rn_assigned']);

      const swMatch =
        (swId && swById.get(swId)) ||
        (normName(swAssignedName) && swByName.get(normName(swAssignedName))) ||
        null;
      const rnMatch =
        (rnId && rnById.get(rnId)) ||
        (normName(rnAssignedName) && rnByName.get(normName(rnAssignedName))) ||
        null;

      const assignmentRef = adminDb.collection('alft_assignments').doc(memberId);
      const assignmentSnap = await assignmentRef.get();
      const assignment = (assignmentSnap.exists ? assignmentSnap.data() : {}) as Record<
        string,
        unknown
      >;

      const previousSwEmail = isUsableEmail(assignment.assignedSwEmail)
        ? clean(assignment.assignedSwEmail, 220).toLowerCase()
        : '';
      const previousSwName = clean(assignment.assignedSwName, 160);
      const previousRnEmail = isUsableEmail(assignment.alftRnEmail)
        ? clean(assignment.alftRnEmail, 220).toLowerCase()
        : '';
      const previousRnName = clean(assignment.alftRnName, 160);

      const newSwEmail = swMatch?.email || '';
      const newSwName = clean(swMatch?.name, 160) || clean(swAssignedName, 160) || previousSwName;
      const newRnEmail = rnMatch?.email || '';
      const newRnName = clean(rnMatch?.name, 160) || clean(rnAssignedName, 160) || previousRnName;

      const swEmailChanged = Boolean(newSwEmail && newSwEmail !== previousSwEmail);
      const rnEmailChanged = Boolean(newRnEmail && newRnEmail !== previousRnEmail);
      const swNameChanged = Boolean(newSwName && newSwName !== previousSwName);
      const rnNameChanged = Boolean(newRnName && newRnName !== previousRnName);
      const shouldUpdate = swEmailChanged || rnEmailChanged || swNameChanged || rnNameChanged;

      const memberName =
        clean(assignment.memberName, 160) ||
        `${clean(member.Senior_First || member.memberFirstName, 80)} ${clean(
          member.Senior_Last || member.memberLastName,
          80
        )}`.trim() ||
        memberId;

      if (shouldUpdate) {
        const patch: Record<string, unknown> = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          swRnContactsRefreshedAt: admin.firestore.FieldValue.serverTimestamp(),
          swRnContactsRefreshedAtIso: new Date().toISOString(),
          swRnContactsRefreshSource: 'caspio_live_roster',
        };
        if (newSwEmail) patch.assignedSwEmail = newSwEmail;
        if (newSwName) patch.assignedSwName = newSwName;
        if (swId) patch.assignedSwId = swId;
        if (newRnEmail) patch.alftRnEmail = newRnEmail;
        if (newRnName) patch.alftRnName = newRnName;
        if (rnId) patch.alftRnId = rnId;

        if (assignmentSnap.exists) {
          await assignmentRef.set(patch, { merge: true });
        } else if (newSwEmail || newRnEmail) {
          await assignmentRef.set(
            {
              memberId,
              memberName,
              ...patch,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        // Keep intake docs in sync when present.
        const intakeId = clean(assignment.latestIntakeId, 160);
        if (intakeId && (newSwEmail || newSwName || newRnEmail || newRnName)) {
          const intakePatch: Record<string, unknown> = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (newSwEmail) {
            intakePatch.assignedSwEmail = newSwEmail;
            intakePatch.socialWorkerEmail = newSwEmail;
          }
          if (newSwName) {
            intakePatch.assignedSwName = newSwName;
            intakePatch.socialWorkerName = newSwName;
          }
          if (newRnEmail) intakePatch.alftRnEmail = newRnEmail;
          if (newRnName) intakePatch.alftRnName = newRnName;
          await adminDb
            .collection('standalone_upload_submissions')
            .doc(intakeId)
            .set(intakePatch, { merge: true })
            .catch(() => null);
        }

        updatedCount += 1;
      }

      updates.push({
        memberId,
        memberName,
        previousSwEmail,
        newSwEmail: newSwEmail || previousSwEmail,
        previousSwName,
        newSwName: newSwName || previousSwName,
        previousRnEmail,
        newRnEmail: newRnEmail || previousRnEmail,
        previousRnName,
        newRnName: newRnName || previousRnName,
        swEmailChanged,
        rnEmailChanged,
        updated: shouldUpdate,
      });
    }

    const emailChanges = updates.filter((u) => u.swEmailChanged || u.rnEmailChanged);

    return NextResponse.json({
      success: true,
      checked: memberIds.length,
      updated: updatedCount,
      emailChanges: emailChanges.length,
      swRosterCount: swRoster.length,
      rnRosterCount: rnRoster.length,
      updates,
      message:
        emailChanges.length > 0
          ? `Updated ${emailChanges.length} member(s) with newer SW/RN email from Caspio.`
          : updatedCount > 0
            ? `Refreshed ${updatedCount} contact(s); no email changes.`
            : 'SW/RN contacts already match Caspio.',
    });
  } catch (error: any) {
    console.error('refresh-sw-contacts failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error?.message || 'Failed to refresh SW/RN contacts from Caspio'),
      },
      { status: 500 }
    );
  }
}
