import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/firebase-admin';
import { mergeApplicationForms } from '@/lib/merge-application-forms';
import { countPendingDocumentReviews } from '@/lib/review-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader) return null;
  const [type, token] = authHeader.split(' ');
  if (!type || type.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function asUidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || '').trim()).filter(Boolean);
}

/**
 * Syncs forms from users/{uid}/applications/{id} onto applications/{id}
 * so staff see family portal uploads on admin-created applications.
 */
export async function POST(request: NextRequest) {
  try {
    const token = parseAuthToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let uid = '';
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = String(decoded.uid || '').trim();
    } catch {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const applicationId = String(body?.applicationId || '').trim();
    if (!applicationId) {
      return NextResponse.json({ success: false, error: 'applicationId is required' }, { status: 400 });
    }

    const userAppRef = adminDb.doc(`users/${uid}/applications/${applicationId}`);
    const adminAppRef = adminDb.doc(`applications/${applicationId}`);
    const [userSnap, adminSnap] = await Promise.all([userAppRef.get(), adminAppRef.get()]);

    if (!userSnap.exists) {
      return NextResponse.json(
        { success: false, error: 'User application not found' },
        { status: 404 }
      );
    }

    const userData = (userSnap.data() || {}) as Record<string, any>;
    const adminData = adminSnap.exists ? ((adminSnap.data() || {}) as Record<string, any>) : {};

    const linkedUids = new Set<string>([
      ...asUidList(adminData.portalLinkedUids),
      ...asUidList(userData.portalLinkedUids),
      String(adminData.userId || '').trim(),
      String(userData.userId || '').trim(),
      uid,
    ].filter(Boolean));

    if (!linkedUids.has(uid) && String(userData.userId || '').trim() !== uid) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const mergedForms = mergeApplicationForms(adminData.forms, userData.forms);
    const pendingDocReviewCount = countPendingDocumentReviews(mergedForms as any);

    const patch: Record<string, unknown> = {
      forms: mergedForms,
      lastUpdated: FieldValue.serverTimestamp(),
      lastModified: FieldValue.serverTimestamp(),
      lastDocumentUpload: FieldValue.serverTimestamp(),
      pendingDocReviewCount,
      pendingDocReviewUpdatedAt: FieldValue.serverTimestamp(),
      hasNewDocuments: true,
      portalFormsSyncedAt: FieldValue.serverTimestamp(),
      portalFormsSyncedFromUid: uid,
    };

    if (userData.hasNewDocuments) patch.hasNewDocuments = true;
    if (userData.newDocumentCount != null) patch.newDocumentCount = userData.newDocumentCount;

    await adminAppRef.set(patch, { merge: true });

    return NextResponse.json({
      success: true,
      applicationId,
      formCount: mergedForms.length,
    });
  } catch (error: any) {
    console.error('sync-portal-upload error:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to sync portal upload') },
      { status: 500 }
    );
  }
}
