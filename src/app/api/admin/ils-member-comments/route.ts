import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

const COMMENTS_COL = adminDb.collection('ils_member_comments');

export async function GET(request: NextRequest) {
  try {
    const requester = await requireAdminApiAuth(request, { requireTwoFactor: true });
    if (!requester.ok) return NextResponse.json({ success: false, error: requester.error }, { status: requester.status });

    const idsParam = String(new URL(request.url).searchParams.get('clientIds') || '').trim();
    const ids = idsParam
      .split(',')
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 500);

    if (ids.length === 0) {
      return NextResponse.json({ success: true, comments: {} });
    }

    const out: Record<string, { noteText: string; updatedAt?: string; updatedByEmail?: string }> = {};
    const snaps = await Promise.all(ids.map((id) => COMMENTS_COL.doc(id).get()));
    snaps.forEach((snap) => {
      if (!snap.exists) return;
      const data = snap.data() as any;
      out[snap.id] = {
        noteText: String(data?.noteText || ''),
        updatedAt: data?.updatedAt ? String(data.updatedAt) : undefined,
        updatedByEmail: data?.updatedByEmail ? String(data.updatedByEmail) : undefined,
      };
    });

    return NextResponse.json({ success: true, comments: out });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load ILS comments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const requester = await requireAdminApiAuth(request, { requireTwoFactor: true });
    if (!requester.ok) return NextResponse.json({ success: false, error: requester.error }, { status: requester.status });

    const body = (await request.json().catch(() => ({}))) as any;
    const clientId2 = String(body?.clientId2 || '').trim();
    const noteText = String(body?.noteText || '').trim();
    if (!clientId2) {
      return NextResponse.json({ success: false, error: 'clientId2 is required' }, { status: 400 });
    }

    await COMMENTS_COL.doc(clientId2).set(
      {
        clientId2,
        noteText,
        updatedAt: new Date().toISOString(),
        updatedByUid: requester.uid,
        updatedByEmail: requester.email,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save ILS comment' }, { status: 500 });
  }
}

