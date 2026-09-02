import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import {
  buildIspContactUpdatesFromRcfe,
  compareIspLocationToRcfe,
  getIspLocationSnapshot,
  getRcfeLocationSnapshot,
} from '@/lib/isp-visit-location';
import {
  getCaspioCredentialsFromEnv,
  getCaspioToken,
} from '@/lib/caspio-api-utils';
import { adminAuth, adminDb } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEMBERS_TABLE = 'CalAIM_tbl_Members';

const clean = (value: unknown, max = 300) => {
  const next = String(value ?? '').trim();
  return next.length > max ? next.slice(0, max) : next;
};

async function assertAdmin(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = clean(decoded?.uid, 128);
  const email = clean(decoded?.email, 220).toLowerCase();
  if (!uid || !email) throw new Error('Invalid token');

  const [uidAdmin, emailAdmin, uidSuper, emailSuper, userDoc] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get().catch(() => null),
    adminDb.collection('roles_admin').doc(email).get().catch(() => null),
    adminDb.collection('roles_super_admin').doc(uid).get().catch(() => null),
    adminDb.collection('roles_super_admin').doc(email).get().catch(() => null),
    adminDb.collection('users').doc(uid).get().catch(() => null),
  ]);
  const userData = userDoc?.exists ? (userDoc.data() as any) : null;
  const roleLabel = clean(userData?.role).toLowerCase();
  const isAdmin =
    isHardcodedAdminEmail(email) ||
    Boolean(uidAdmin?.exists) ||
    Boolean(emailAdmin?.exists) ||
    Boolean(uidSuper?.exists) ||
    Boolean(emailSuper?.exists) ||
    Boolean(userData?.isKaiserStaff || userData?.isKaiserManager || userData?.isKaiserAssignmentManager) ||
    roleLabel.includes('kaiser');
  if (!isAdmin) {
    const err = new Error('Unauthorized');
    (err as any).status = 403;
    throw err;
  }
  return { uid, email, displayName: clean(decoded.name, 160) || email };
}

async function fetchMemberSource(memberId: string, token: string, baseUrl: string) {
  const escaped = memberId.replace(/'/g, "''");
  const select = [
    'Client_ID2',
    'ISP_Contact_Location',
    'ISP_Contact_Address',
    'ISP_Contact_City',
    'ISP_Contact_State',
    'ISP_Contact_Zip',
    'ISP_Contact_Phone',
    'ISP_Location_Type',
    'RCFE_Name',
    'RCFE_Address',
    'RCFE_Street',
    'RCFE_Street_Address',
    'RCFE_City',
    'RCFE_State',
    'RCFE_Zip',
    'RCFE_Phone',
    'RCFE_Administrator_Phone',
    'RCFE_Admin_Phone',
  ].join(',');
  const url =
    `${baseUrl}/integrations/rest/v3/tables/${MEMBERS_TABLE}/records` +
    `?q.where=${encodeURIComponent(`Client_ID2='${escaped}'`)}` +
    `&q.limit=1&q.select=${encodeURIComponent(select)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Caspio read failed (${res.status}): ${text.slice(0, 240)}`);
  }
  const body = await res.json().catch(() => ({}));
  const rows = Array.isArray(body?.Result) ? body.Result : Array.isArray(body) ? body : [];
  return (rows[0] || null) as Record<string, unknown> | null;
}

/**
 * Copy RCFE_* into Caspio ISP_Contact_* for a member, then refresh cache.
 * Used when Review/Initial says member is at RCFE but ISP location is stale/mismatched.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      idToken?: string;
      memberId?: string;
      dryRun?: boolean;
    };
    const idToken = clean(body.idToken, 4000);
    const memberId = clean(body.memberId, 120);
    const dryRun = Boolean(body.dryRun);
    if (!idToken || !memberId) {
      return NextResponse.json({ ok: false, error: 'idToken and memberId are required' }, { status: 400 });
    }

    await assertAdmin(idToken);

    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);
    const source = await fetchMemberSource(memberId, token, credentials.baseUrl);
    if (!source) {
      return NextResponse.json({ ok: false, error: 'Member not found in Caspio' }, { status: 404 });
    }

    const comparison = compareIspLocationToRcfe(source);
    if (!comparison.hasRcfeData) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No RCFE location found in Caspio for this member (RCFE_Name / RCFE_Address).',
          comparison,
        },
        { status: 400 }
      );
    }

    const updates = buildIspContactUpdatesFromRcfe(source);
    if (!Object.keys(updates).length) {
      return NextResponse.json({ ok: false, error: 'Nothing to update from RCFE fields' }, { status: 400 });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        updates,
        before: getIspLocationSnapshot(source),
        rcfe: getRcfeLocationSnapshot(source),
        comparison,
      });
    }

    const escaped = memberId.replace(/'/g, "''");
    const updateUrl =
      `${credentials.baseUrl}/integrations/rest/v3/tables/${MEMBERS_TABLE}/records` +
      `?q.where=${encodeURIComponent(`Client_ID2='${escaped}'`)}`;
    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(updates),
    });
    if (!updateRes.ok) {
      const text = await updateRes.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: `Caspio update failed (${updateRes.status}): ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const afterSource = { ...source, ...updates };
    await adminDb
      .collection('caspio_members_cache')
      .doc(memberId)
      .set(
        {
          ...updates,
          cachedAt: new Date().toISOString(),
          Date_Modified: new Date().toISOString(),
        },
        { merge: true }
      )
      .catch(() => null);

    await adminDb
      .collection('alft_assignments')
      .doc(memberId)
      .set(
        {
          memberId,
          ispLocationSyncedFromRcfeAt: new Date().toISOString(),
          ispLocationSyncedFields: updates,
          updatedAt: new Date(),
        },
        { merge: true }
      )
      .catch(() => null);

    return NextResponse.json({
      ok: true,
      updates,
      before: getIspLocationSnapshot(source),
      after: getIspLocationSnapshot(afterSource),
      rcfe: getRcfeLocationSnapshot(source),
      comparison: compareIspLocationToRcfe(afterSource),
      source: afterSource,
    });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status });
  }
}
