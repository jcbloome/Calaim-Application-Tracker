import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import { caspioWriteBlockedResponse, isCaspioWriteReadOnly } from '@/lib/caspio-write-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export async function POST(req: NextRequest) {
  try {
    if (isCaspioWriteReadOnly()) {
      return NextResponse.json(caspioWriteBlockedResponse(), { status: 423 });
    }

    const body = (await req.json().catch(() => ({} as any))) as any;
    const action = String(body?.action || '').trim();
    const idToken = String(body?.idToken || '').trim();
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 401 });
    }
    const authz = await requireAdminApiAuthFromIdToken(idToken, { requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    if (action !== 'delete_caspio_members') {
      return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
    }

    const targets = Array.isArray(body?.targets) ? body.targets : [];
    if (!targets.length) {
      return NextResponse.json({ success: false, error: 'targets is required' }, { status: 400 });
    }

    const cfg = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(cfg);
    const tableName = 'CalAIM_tbl_Members';
    const results: Array<{ ok: boolean; clientId2: string; memberFirstName: string; memberLastName: string; error?: string }> = [];

    for (const t of targets) {
      const clientId2 = String(t?.clientId2 || '').trim();
      const first = String(t?.memberFirstName || '').trim();
      const last = String(t?.memberLastName || '').trim();
      if (!clientId2 && !(first && last)) {
        results.push({ ok: false, clientId2, memberFirstName: first, memberLastName: last, error: 'Missing clientId2 or member name' });
        continue;
      }
      const where = clientId2
        ? `Client_ID2='${clientId2.replace(/'/g, "''")}'`
        : `Senior_First='${first.replace(/'/g, "''")}' AND Senior_Last='${last.replace(/'/g, "''")}'`;
      const url = `${cfg.restBaseUrl}/tables/${encodeURIComponent(tableName)}/records?q.where=${encodeURIComponent(where)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        results.push({
          ok: false,
          clientId2,
          memberFirstName: first,
          memberLastName: last,
          error: `Caspio delete failed (${res.status}): ${text || res.statusText}`,
        });
        continue;
      }
      results.push({ ok: true, clientId2, memberFirstName: first, memberLastName: last });
    }

    return NextResponse.json({
      success: true,
      attempted: results.length,
      deleted: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (error: any) {
    console.error('Error handling Kaiser ILS import action:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to process Kaiser ILS import action' }, { status: 500 });
  }
}

