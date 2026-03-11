import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

const ACCESS_DOC = adminDb.collection('system_settings').doc('ils_member_access');
const COMMENTS_COL = adminDb.collection('ils_member_comments');

type Requester = {
  uid: string;
  email: string;
  isSuperAdmin: boolean;
};

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

async function getRequester(request: NextRequest): Promise<Requester | null> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = String(decoded.uid || '').trim();
    const email = normalizeEmail((decoded as any).email);
    if (!uid || !email) return null;

    let isSuperAdmin = Boolean((decoded as any).superAdmin) || isHardcodedAdminEmail(email);
    if (!isSuperAdmin) {
      const [byUid, byEmail] = await Promise.all([
        adminDb.collection('roles_super_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isSuperAdmin = byUid.exists || byEmail.exists;
    }

    return { uid, email, isSuperAdmin };
  } catch {
    return null;
  }
}

async function canUseIlsComments(requester: Requester): Promise<boolean> {
  if (requester.isSuperAdmin) return true;
  const snap = await ACCESS_DOC.get();
  const data = (snap.exists ? snap.data() : {}) as any;
  const allowedEmails = Array.isArray(data?.allowedEmails) ? data.allowedEmails.map(normalizeEmail).filter(Boolean) : [];
  return allowedEmails.includes(requester.email);
}

export async function GET(request: NextRequest) {
  try {
    const requester = await getRequester(request);
    if (!requester) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await canUseIlsComments(requester))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

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
    const requester = await getRequester(request);
    if (!requester) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await canUseIlsComments(requester))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

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

