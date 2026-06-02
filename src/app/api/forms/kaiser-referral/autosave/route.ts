import { NextRequest, NextResponse } from 'next/server';
import admin, { adminDb } from '@/firebase-admin';

type DraftPayload = {
  applicationId?: string;
  userId?: string;
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

export async function GET(request: NextRequest) {
  try {
    const applicationId = String(request.nextUrl.searchParams.get('applicationId') || '').trim();
    const userId = String(request.nextUrl.searchParams.get('userId') || '').trim();
    if (!applicationId) {
      return NextResponse.json({ success: false, error: 'applicationId is required.' }, { status: 400 });
    }

    const resolved = await resolveApplicationDoc({ applicationId, userId });
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Application not found.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      draft: (resolved.data as any)?.kaiserReferralDraft || null,
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
    const draft = body?.draft && typeof body.draft === 'object' ? body.draft : null;
    if (!applicationId || !draft) {
      return NextResponse.json(
        { success: false, error: 'applicationId and draft are required.' },
        { status: 400 }
      );
    }

    const resolved = await resolveApplicationDoc({ applicationId, userId });
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Application not found.' }, { status: 404 });
    }

    const savedAtIso = new Date().toISOString();
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

    return NextResponse.json({ success: true, savedAtIso });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to autosave draft.') },
      { status: 500 }
    );
  }
}
