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
    const shouldCheckFamilyName = Boolean(familyFirst || familyLast);

    const candidateFields = ['bestContactEmail', 'referrerEmail', 'secondaryContactEmail', 'repEmail'] as const;
    const queryValues = Array.from(new Set([String(decoded.email || '').trim(), email])).filter(Boolean);

    const snapshots = await Promise.all(
      candidateFields.flatMap((field) =>
        queryValues.map((value) => adminDb.collection('applications').where(field, '==', value).get())
      )
    );

    const uniqueDocs = new Map<string, any>();
    snapshots.forEach((snap) => {
      snap.docs.forEach((d) => {
        if (!uniqueDocs.has(d.id)) uniqueDocs.set(d.id, d);
      });
    });

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
