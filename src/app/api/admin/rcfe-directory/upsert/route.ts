import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { adminAuth, adminDb, default as admin } from '@/firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

async function requireAdminFromToken(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = normalizeEmail((decoded as any)?.email);
  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
  if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
  if (!isAdmin) {
    const [adminRole, superAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);
    isAdmin = adminRole.exists || superAdminRole.exists;
    if (!isAdmin && email) {
      const [emailAdminRole, emailSuperAdminRole] = await Promise.all([
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isAdmin = emailAdminRole.exists || emailSuperAdminRole.exists;
    }
  }

  if (!isAdmin) return { ok: false as const, status: 403, error: 'Admin privileges required' };
  return { ok: true as const, uid, email };
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const authz = await requireAdminFromToken(idToken);
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const body = (await req.json().catch(() => ({} as any))) as any;
    const memberIds = Array.isArray(body?.memberIds)
      ? body.memberIds.map((v: unknown) => String(v || '').trim()).filter(Boolean)
      : [];
    if (memberIds.length === 0) {
      return NextResponse.json({ success: false, error: 'memberIds is required' }, { status: 400 });
    }

    const rawUpdates = (body?.updates || {}) as Record<string, unknown>;
    const updates: Record<string, string> = {};
    const allowedFields = [
      'RCFE_Administrator',
      'RCFE_Administrator_Email',
      'RCFE_Administrator_Phone',
      'Number_of_Beds',
    ] as const;

    allowedFields.forEach((field) => {
      if (rawUpdates[field] !== undefined) {
        updates[field] = String(rawUpdates[field] ?? '').trim();
      }
    });

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No supported fields to update' }, { status: 400 });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);

    const results = await Promise.all(
      memberIds.map(async (memberId) => {
        const escapedClientId2 = memberId.replace(/'/g, "''");
        const whereClause = `Client_ID2='${escapedClientId2}'`;
        const apiUrl = `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=${encodeURIComponent(whereClause)}`;
        const caspioRes = await fetch(apiUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        });
        if (!caspioRes.ok) {
          const err = await caspioRes.text().catch(() => '');
          return { memberId, ok: false, error: `Caspio ${caspioRes.status}: ${err}` };
        }

        await adminDb.collection('caspio_members_cache').doc(memberId).set(
          {
            ...updates,
            cachedAt: new Date().toISOString(),
            Date_Modified: new Date().toISOString(),
          },
          { merge: true }
        );

        return { memberId, ok: true };
      })
    );

    const failed = results.filter((r) => !r.ok);
    await adminDb.collection('system_note_log').add({
      type: 'rcfe_directory_update',
      actorUid: authz.uid,
      actorEmail: authz.email,
      memberIds,
      updates,
      failedCount: failed.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (failed.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Updated ${results.length - failed.length}/${results.length} records; some updates failed.`,
          failed,
        },
        { status: 207 }
      );
    }

    return NextResponse.json({
      success: true,
      updatedCount: results.length,
      updates,
    });
  } catch (error: any) {
    console.error('Error updating RCFE directory fields:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update RCFE fields' }, { status: 500 });
  }
}
