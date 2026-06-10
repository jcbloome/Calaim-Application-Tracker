import { NextRequest, NextResponse } from 'next/server';
import admin, { adminDb } from '@/firebase-admin';

type DraftPayload = {
  applicationId?: string;
  userId?: string;
  memberClientId?: string;
  referralContext?: string;
  draftKey?: string;
  draft?: Record<string, unknown>;
};

async function resolveApplicationDoc(params: {
  applicationId: string;
  userId?: string;
}): Promise<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> } | null> {
  const applicationId = String(params.applicationId || '').trim();
  const userId = String(params.userId || '').trim();
  if (!applicationId) return null;

  if (userId) {
    const userAppRef = adminDb.doc(`users/${userId}/applications/${applicationId}`);
    const userAppSnap = await userAppRef.get();
    if (userAppSnap.exists) {
      return { ref: userAppRef, data: (userAppSnap.data() || {}) as Record<string, any> };
    }
  }

  const adminAppRef = adminDb.collection('applications').doc(applicationId);
  const adminAppSnap = await adminAppRef.get();
  if (adminAppSnap.exists) {
    return { ref: adminAppRef, data: (adminAppSnap.data() || {}) as Record<string, any> };
  }

  const groupSnap = await adminDb
    .collectionGroup('applications')
    .where(admin.firestore.FieldPath.documentId(), '==', applicationId)
    .limit(1)
    .get();
  if (!groupSnap.empty) {
    const snap = groupSnap.docs[0];
    return { ref: snap.ref, data: (snap.data() || {}) as Record<string, any> };
  }

  return null;
}

function resolveStandaloneDraftRef(draftKeyRaw: string) {
  const draftKey = String(draftKeyRaw || '').trim().toLowerCase();
  if (!draftKey) return null;
  return adminDb.collection('kaiser_referral_drafts').doc(draftKey);
}

export async function GET(request: NextRequest) {
  try {
    const applicationId = String(request.nextUrl.searchParams.get('applicationId') || '').trim();
    const userId = String(request.nextUrl.searchParams.get('userId') || '').trim();
    const draftKey = String(request.nextUrl.searchParams.get('draftKey') || '').trim().toLowerCase();

    if (!applicationId && !draftKey) {
      return NextResponse.json({ success: false, error: 'applicationId or draftKey is required.' }, { status: 400 });
    }

    if (applicationId) {
      const resolved = await resolveApplicationDoc({ applicationId, userId });
      if (!resolved) {
        return NextResponse.json({ success: false, error: 'Application not found.' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        draft: (resolved.data as any)?.kaiserReferralDraft || null,
      });
    }

    const standaloneRef = resolveStandaloneDraftRef(draftKey);
    if (!standaloneRef) {
      return NextResponse.json({ success: false, error: 'Invalid draft key.' }, { status: 400 });
    }
    const standaloneSnap = await standaloneRef.get();
    const standaloneData = (standaloneSnap.data() || {}) as Record<string, any>;

    return NextResponse.json({
      success: true,
      draft: standaloneData?.draft || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load autosave draft.') },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DraftPayload;
    const applicationId = String(body?.applicationId || '').trim();
    const userId = String(body?.userId || '').trim();
    const memberClientId = String(body?.memberClientId || '').trim();
    const referralContext = String(body?.referralContext || '').trim();
    const draftKey = String(body?.draftKey || '').trim().toLowerCase();
    const draft = body?.draft && typeof body.draft === 'object' ? body.draft : null;
    if (!draft || (!applicationId && !draftKey)) {
      return NextResponse.json(
        { success: false, error: 'draft is required plus either applicationId or draftKey.' },
        { status: 400 }
      );
    }

    const savedAtIso = new Date().toISOString();
    if (applicationId) {
      const resolved = await resolveApplicationDoc({ applicationId, userId });
      if (!resolved) {
        return NextResponse.json({ success: false, error: 'Application not found.' }, { status: 404 });
      }
      await resolved.ref.set(
        {
          kaiserReferralDraft: {
            ...draft,
            savedAt: admin.firestore.FieldValue.serverTimestamp(),
            savedAtIso,
          },
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      const standaloneRef = resolveStandaloneDraftRef(draftKey);
      if (!standaloneRef) {
        return NextResponse.json({ success: false, error: 'Invalid draft key.' }, { status: 400 });
      }
      await standaloneRef.set(
        {
          draft,
          draftKey,
          userId: userId || null,
          memberClientId: memberClientId || null,
          referralContext: referralContext || null,
          savedAt: admin.firestore.FieldValue.serverTimestamp(),
          savedAtIso,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({ success: true, savedAtIso });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to autosave draft.') },
      { status: 500 }
    );
  }
}
