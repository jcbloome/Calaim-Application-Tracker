import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import {
  hasPortalAuthorizedEmail,
  mergePortalAuthorizedEmails,
  normalizePortalAccessPeople,
  upsertPortalAccessPerson,
} from '@/lib/portal-access';

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeName(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function parseAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader) return null;
  const [type, token] = authHeader.split(' ');
  if (!type || type.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function normalizeDateKey(value: unknown): string {
  if (!value) return '';
  if (typeof (value as any)?.toDate === 'function') {
    const date = (value as any).toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
    return '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const mm = usMatch[1].padStart(2, '0');
    const dd = usMatch[2].padStart(2, '0');
    return `${usMatch[3]}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return '';
}

function hasMatchingInviteEmail(data: Record<string, unknown>, email: string): boolean {
  return hasPortalAuthorizedEmail(data, email);
}

function isOwnedBySomeoneElse(data: Record<string, unknown>, uid: string): boolean {
  const existingUserId = String(data.userId || '').trim();
  if (!existingUserId || existingUserId === uid) return false;
  // Staff assignment fields must not block family claim if they were mistakenly stored as userId.
  const staffIds = new Set(
    [
      String(data.assignedStaffId || '').trim(),
      String(data.assignedCaseManagerId || '').trim(),
      String(data.createdByUid || '').trim(),
      String(data.createdByAdminUid || '').trim(),
    ].filter(Boolean)
  );
  if (staffIds.has(existingUserId)) return false;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const token = parseAuthToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = String(decoded.uid || '').trim();
    const email = normalizeEmail(decoded.email);
    if (!uid || !email) {
      return NextResponse.json({ error: 'Missing authenticated user context' }, { status: 400 });
    }

    // Admin/staff accounts must not claim family applications via the user portal.
    const claims = (decoded || {}) as Record<string, unknown>;
    if (Boolean(claims.admin) || Boolean(claims.superAdmin) || isHardcodedAdminEmail(email)) {
      return NextResponse.json(
        { error: 'Admin accounts cannot claim applications from the member portal. Use /admin/login.' },
        { status: 403 }
      );
    }
    try {
      const [adminUidDoc, superAdminUidDoc, adminEmailDoc, superAdminEmailDoc, userDoc] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get(),
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
        adminDb.collection('users').doc(uid).get(),
      ]);
      const userData = userDoc.exists ? (userDoc.data() as Record<string, unknown>) : {};
      const roleLabel = String(userData?.role || '').trim().toLowerCase();
      const isStaffAdmin =
        Boolean(userData?.isStaff) ||
        ['staff', 'admin', 'super admin', 'super_admin'].includes(roleLabel);
      const isAdminLane =
        adminUidDoc.exists ||
        superAdminUidDoc.exists ||
        adminEmailDoc.exists ||
        superAdminEmailDoc.exists ||
        isStaffAdmin;
      if (isAdminLane) {
        return NextResponse.json(
          { error: 'Admin accounts cannot claim applications from the member portal. Use /admin/login.' },
          { status: 403 }
        );
      }
    } catch (roleCheckError) {
      // Fail closed: never claim into a member account when we cannot verify the caller is not staff.
      console.warn('claim-admin-started admin role check failed:', roleCheckError);
      return NextResponse.json(
        { error: 'Unable to verify account role for application linking. Please try again.' },
        { status: 503 }
      );
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const familyFirst = normalizeName(payload.firstName);
    const familyLast = normalizeName(payload.lastName);
    const requestedApplicationId = String(payload.applicationId || '').trim();
    const inviteLastName = normalizeName(payload.memberLastName);
    const inviteDob = normalizeDateKey(payload.memberDob);
    // Name filter is optional and must not block email/invite matches (primary contacts often
    // login with Auth displayName that differs slightly from bestContact* fields).
    const enforceFamilyName = payload.enforceFamilyName === true && Boolean(familyFirst || familyLast);

    const uniqueDocs = new Map<string, any>();
    if (requestedApplicationId) {
      const docSnap = await adminDb.collection('applications').doc(requestedApplicationId).get();
      if (docSnap.exists) uniqueDocs.set(docSnap.id, docSnap);
    } else {
      const candidateFields = [
        'bestContactEmail',
        'bestContactEmailLower',
        'secondaryContactEmail',
        'linkedToFamilyEmail',
      ] as const;
      const queryValues = Array.from(
        new Set([email, String(decoded.email || '').trim().toLowerCase(), String(decoded.email || '').trim()])
      ).filter(Boolean);
      const fieldSnapshots = await Promise.all(
        candidateFields.flatMap((field) =>
          queryValues.map((value) => adminDb.collection('applications').where(field, '==', value).get())
        )
      );
      fieldSnapshots.forEach((snap) => {
        snap.docs.forEach((d) => {
          if (!uniqueDocs.has(d.id)) uniqueDocs.set(d.id, d);
        });
      });

      // Older invites stored a single recipient string on introEmailLastSentTo.
      try {
        const legacyToSnaps = await Promise.all(
          queryValues.map((value) =>
            adminDb.collection('applications').where('introEmailLastSentTo', '==', value).get()
          )
        );
        legacyToSnaps.forEach((snap) => {
          snap.docs.forEach((d) => {
            if (!uniqueDocs.has(d.id)) uniqueDocs.set(d.id, d);
          });
        });
      } catch (error) {
        console.warn('claim-admin-started introEmailLastSentTo query skipped:', error);
      }

      // Invite recipients are stored as a lowercased array for reliable claim matching.
      try {
        const recipientSnap = await adminDb
          .collection('applications')
          .where('introEmailRecipientEmails', 'array-contains', email)
          .get();
        recipientSnap.docs.forEach((d) => {
          if (!uniqueDocs.has(d.id)) uniqueDocs.set(d.id, d);
        });
      } catch (error) {
        console.warn('claim-admin-started introEmailRecipientEmails query skipped:', error);
      }

      // Explicit multi-person portal access list (son + mother, caregivers, etc.).
      try {
        const accessSnap = await adminDb
          .collection('applications')
          .where('portalAuthorizedEmails', 'array-contains', email)
          .get();
        accessSnap.docs.forEach((d) => {
          if (!uniqueDocs.has(d.id)) uniqueDocs.set(d.id, d);
        });
      } catch (error) {
        console.warn('claim-admin-started portalAuthorizedEmails query skipped:', error);
      }
    }

    if (uniqueDocs.size === 0) {
      return NextResponse.json({ success: true, claimedCount: 0, claimedApplicationIds: [] });
    }

    const batch = adminDb.batch();
    const claimedApplicationIds: string[] = [];

    uniqueDocs.forEach((docSnap) => {
      const data = (docSnap.data() || {}) as Record<string, unknown>;
      const applicationId = docSnap.id;

      const isAdminStarted = applicationId.startsWith('admin_app_') || Boolean(data.createdByAdmin);
      if (!isAdminStarted) return;

      const existingUserId = String(data.userId || '').trim();
      const inviteEmailMatch = hasMatchingInviteEmail(data, email);
      const ownedBySomeoneElse = isOwnedBySomeoneElse(data, uid);

      // Another family member may already own the app — still allow authorized emails to get a linked copy.
      if (ownedBySomeoneElse && !inviteEmailMatch) {
        if (!(requestedApplicationId && inviteLastName && inviteDob)) return;
      }

      if (!inviteEmailMatch && existingUserId !== uid) {
        // Explicit applicationId claim may still succeed via member last name + DOB.
        if (!(requestedApplicationId && inviteLastName && inviteDob)) return;
      }

      if (inviteEmailMatch) {
        // Email / invite match is enough — do not require primary-contact name equality.
      } else if (enforceFamilyName) {
        const candidateFirstNames = [
          normalizeName(data.bestContactFirstName),
          normalizeName(data.referrerFirstName),
          normalizeName(data.repFirstName),
        ].filter(Boolean);
        const candidateLastNames = [
          normalizeName(data.bestContactLastName),
          normalizeName(data.referrerLastName),
          normalizeName(data.repLastName),
        ].filter(Boolean);

        const firstOk = !familyFirst || candidateFirstNames.length === 0 || candidateFirstNames.includes(familyFirst);
        const lastOk = !familyLast || candidateLastNames.length === 0 || candidateLastNames.includes(familyLast);
        if (!firstOk || !lastOk) return;
      }

      if (requestedApplicationId && !inviteEmailMatch && existingUserId !== uid) {
        if (!inviteLastName || !inviteDob) return;
        const memberLast = normalizeName(data.memberLastName);
        const memberDob = normalizeDateKey(data.memberDob);
        if (!memberLast || !memberDob) return;
        if (memberLast !== inviteLastName || memberDob !== inviteDob) return;
      }

      const status = normalizeName(data.status);
      if (status === 'deleted') return;

      const portalAuthorizedEmails = mergePortalAuthorizedEmails(
        data.portalAuthorizedEmails,
        [email, normalizeEmail(data.bestContactEmail), normalizeEmail(data.secondaryContactEmail)]
      );
      const portalAccessPeople = upsertPortalAccessPerson(normalizePortalAccessPeople(data.portalAccessPeople), {
        email,
        canUpload: true,
        role: ownedBySomeoneElse ? 'uploader' : 'primary',
        addedAtIso: new Date().toISOString(),
        addedByEmail: email,
      });

      const appData = {
        ...data,
        id: applicationId,
        // Keep the first successful claim as primary owner when sharing with additional emails.
        userId: ownedBySomeoneElse ? existingUserId : uid,
        bestContactEmailLower: normalizeEmail(data.bestContactEmail) || email,
        linkedToFamilyAt: FieldValue.serverTimestamp(),
        linkedToFamilyEmail: ownedBySomeoneElse
          ? normalizeEmail(data.linkedToFamilyEmail) || normalizeEmail(data.bestContactEmail) || email
          : email,
        portalAuthorizedEmails,
        portalAccessPeople,
        portalLinkedUids: FieldValue.arrayUnion(uid),
        portalLinkedEmails: FieldValue.arrayUnion(email),
      };

      const userAppRef = adminDb.doc(`users/${uid}/applications/${applicationId}`);
      const adminAppRef = adminDb.doc(`applications/${applicationId}`);

      batch.set(userAppRef, { ...appData, userId: uid }, { merge: true });
      batch.set(
        adminAppRef,
        {
          ...(ownedBySomeoneElse ? {} : { userId: uid }),
          bestContactEmailLower: normalizeEmail(data.bestContactEmail) || email,
          linkedToFamilyAt: FieldValue.serverTimestamp(),
          ...(ownedBySomeoneElse
            ? {}
            : { linkedToFamilyEmail: email }),
          portalAuthorizedEmails,
          portalAccessPeople,
          portalLinkedUids: FieldValue.arrayUnion(uid),
          portalLinkedEmails: FieldValue.arrayUnion(email),
        },
        { merge: true }
      );
      claimedApplicationIds.push(applicationId);
    });

    if (claimedApplicationIds.length > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      claimedCount: claimedApplicationIds.length,
      claimedApplicationIds,
    });
  } catch (error: any) {
    console.error('claim-admin-started error:', error);
    return NextResponse.json(
      { error: 'Failed to claim admin-started applications', details: String(error?.message || error) },
      { status: 500 }
    );
  }
}
