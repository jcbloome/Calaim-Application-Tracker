import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  collectPortalAuthorizedEmails,
  mergePortalAuthorizedEmails,
  normalizePortalAccessPeople,
  normalizePortalEmail,
  sanitizePortalAccessPerson,
  upsertPortalAccessPerson,
} from '@/lib/portal-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveApplicationRef(applicationId: string, userId?: string) {
  const { adminDb } = await import('@/firebase-admin');
  const cleanId = String(applicationId || '').trim();
  const cleanUserId = String(userId || '').trim();
  if (!cleanId) return null;

  if (cleanUserId) {
    const userRef = adminDb.doc(`users/${cleanUserId}/applications/${cleanId}`);
    const snap = await userRef.get();
    if (snap.exists) return { adminDb, ref: userRef, snap, path: userRef.path };
  }

  const adminRef = adminDb.doc(`applications/${cleanId}`);
  const adminSnap = await adminRef.get();
  if (adminSnap.exists) return { adminDb, ref: adminRef, snap: adminSnap, path: adminRef.path };

  return null;
}

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  const applicationId = String(request.nextUrl.searchParams.get('applicationId') || '').trim();
  const userId = String(request.nextUrl.searchParams.get('userId') || '').trim();
  const resolved = await resolveApplicationRef(applicationId, userId);
  if (!resolved) {
    return NextResponse.json({ success: false, error: 'Application not found' }, { status: 404 });
  }

  const data = (resolved.snap.data() || {}) as Record<string, unknown>;
  return NextResponse.json({
    success: true,
    applicationId,
    portalAuthorizedEmails: collectPortalAuthorizedEmails(data),
    portalAccessPeople: normalizePortalAccessPeople(data.portalAccessPeople),
    primaryContactEmail: normalizePortalEmail(data.bestContactEmail),
    secondaryContactEmail: normalizePortalEmail(data.secondaryContactEmail),
    linkedToFamilyEmail: normalizePortalEmail(data.linkedToFamilyEmail),
    userId: String(data.userId || '').trim() || null,
  });
}

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const applicationId = String(body.applicationId || '').trim();
  const userId = String(body.userId || '').trim();
  const action = String(body.action || 'add').trim().toLowerCase();
  const email = normalizePortalEmail(body.email);
  const name = String(body.name || '').trim();
  const canUpload = body.canUpload !== false;

  if (!applicationId) {
    return NextResponse.json({ success: false, error: 'applicationId is required' }, { status: 400 });
  }
  if (!email || !email.includes('@')) {
    return NextResponse.json({ success: false, error: 'Valid email is required' }, { status: 400 });
  }

  const resolved = await resolveApplicationRef(applicationId, userId);
  if (!resolved) {
    return NextResponse.json({ success: false, error: 'Application not found' }, { status: 404 });
  }

  const data = (resolved.snap.data() || {}) as Record<string, unknown>;
  let people = normalizePortalAccessPeople(data.portalAccessPeople);
  let emails = collectPortalAuthorizedEmails(data);

  if (action === 'remove') {
    people = people.filter((person) => person.email !== email);
    emails = emails.filter((value) => value !== email);
  } else {
    people = upsertPortalAccessPerson(people, {
      email,
      name,
      canUpload,
      role: 'uploader',
      addedAtIso: new Date().toISOString(),
      addedByEmail: authz.email || null,
    });
    emails = mergePortalAuthorizedEmails(emails, [email]);
  }

  const payload = {
    portalAuthorizedEmails: emails,
    portalAccessPeople: people.map(sanitizePortalAccessPerson),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const batch = resolved.adminDb.batch();
  batch.set(resolved.ref, payload, { merge: true });

  // Keep top-level applications/{id} in sync when editing a user-owned copy.
  if (resolved.path.startsWith('users/')) {
    batch.set(resolved.adminDb.doc(`applications/${applicationId}`), payload, { merge: true });
  } else {
    const linkedUserId = String(data.userId || userId || '').trim();
    if (linkedUserId) {
      batch.set(
        resolved.adminDb.doc(`users/${linkedUserId}/applications/${applicationId}`),
        payload,
        { merge: true }
      );
    }
  }

  await batch.commit();

  return NextResponse.json({
    success: true,
    portalAuthorizedEmails: emails,
    portalAccessPeople: people,
  });
}
