import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

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
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const candidates = [
    data.bestContactEmail,
    data.referrerEmail,
    data.secondaryContactEmail,
    data.repEmail,
  ].map((v) => normalizeEmail(v));
  return candidates.includes(normalized);
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
    const shouldCheckFamilyName = Boolean(familyFirst || familyLast);

    const uniqueDocs = new Map<string, any>();
    if (requestedApplicationId) {
      const docSnap = await adminDb.collection('applications').doc(requestedApplicationId).get();
      if (docSnap.exists) uniqueDocs.set(docSnap.id, docSnap);
    } else {
      const candidateFields = ['bestContactEmail', 'referrerEmail', 'secondaryContactEmail', 'repEmail'] as const;
      const queryValues = Array.from(new Set([String(decoded.email || '').trim(), email])).filter(Boolean);
      const snapshots = await Promise.all(
        candidateFields.flatMap((field) =>
          queryValues.map((value) => adminDb.collection('applications').where(field, '==', value).get())
        )
      );
      snapshots.forEach((snap) => {
        snap.docs.forEach((d) => {
          if (!uniqueDocs.has(d.id)) uniqueDocs.set(d.id, d);
        });
      });
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
      if (existingUserId && existingUserId !== uid) return;
      const inviteEmailMatch = hasMatchingInviteEmail(data, email);
      if (!inviteEmailMatch && existingUserId !== uid) return;

      if (shouldCheckFamilyName) {
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

      if (requestedApplicationId) {
        if (!inviteLastName || !inviteDob) return;
        const memberLast = normalizeName(data.memberLastName);
        const memberDob = normalizeDateKey(data.memberDob);
        if (!memberLast || !memberDob) return;
        if (memberLast !== inviteLastName || memberDob !== inviteDob) return;
      }

      const status = normalizeName(data.status);
      if (status === 'deleted') return;

      const appData = {
        ...data,
        id: applicationId,
        userId: uid,
        linkedToFamilyAt: FieldValue.serverTimestamp(),
        linkedToFamilyEmail: email,
      };

      const userAppRef = adminDb.doc(`users/${uid}/applications/${applicationId}`);
      const adminAppRef = adminDb.doc(`applications/${applicationId}`);

      batch.set(userAppRef, appData, { merge: true });
      batch.set(
        adminAppRef,
        {
          userId: uid,
          linkedToFamilyAt: FieldValue.serverTimestamp(),
          linkedToFamilyEmail: email,
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
