import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  isNoWorkJustification,
  isNotesClaimableJustification,
  KAISER_T2038_CLAIM_AUDIT_ACTIVITY_COLLECTION,
  KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION,
  type ClaimAuditActivityAction,
  type ClaimAuditActivityEntry,
} from '@/lib/kaiser-t2038-claim-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapDoc(doc: { id: string; data: () => Record<string, unknown> }): ClaimAuditActivityEntry {
  const data = doc.data() || {};
  return {
    id: doc.id,
    clientId2: String(data.clientId2 || '').trim(),
    monthKey: String(data.monthKey || '').trim(),
    memberName: String(data.memberName || '').trim(),
    action: String(data.action || '').trim() as ClaimAuditActivityAction,
    summary: String(data.summary || '').trim(),
    actorName: String(data.actorName || '').trim(),
    actorEmail: String(data.actorEmail || '').trim(),
    actorUid: String(data.actorUid || '').trim(),
    createdAt: String(data.createdAt || '').trim(),
    meta:
      data.meta && typeof data.meta === 'object'
        ? Object.fromEntries(
            Object.entries(data.meta as Record<string, unknown>).map(([key, value]) => [
              key,
              String(value ?? ''),
            ])
          )
        : {},
  };
}

/** Synthesize activity rows from current justification docs when the log is still empty. */
async function synthesizeFromJustifications(
  adminDb: any,
  clientId2: string
): Promise<ClaimAuditActivityEntry[]> {
  const snap = await adminDb
    .collection(KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION)
    .where('clientId2', '==', clientId2)
    .limit(200)
    .get();
  const out: ClaimAuditActivityEntry[] = [];
  for (const doc of snap.docs as Array<{ id: string; data: () => Record<string, unknown> }>) {
    const data = doc.data() || {};
    if (data.deleted === true) continue;
    const monthKey = String(data.monthKey || '').trim();
    if (!monthKey) continue;
    const reason = String(data.reason || '').trim();
    const actorName = String(data.justifiedBy || data.justifiedByEmail || 'Staff').trim();
    const actorEmail = String(data.justifiedByEmail || '').trim();
    const pushedAt = String(data.caspioPushedAt || '').trim();
    const updatedAt = String(data.updatedAt || pushedAt || '').trim();
    const dos = String(data.caspioDateOfService || '').trim();
    const pkId = String(data.caspioClaimPkId || '').trim();

    if (pushedAt) {
      out.push({
        id: `synth-push-${doc.id}`,
        clientId2,
        monthKey,
        action: 'claim_pushed',
        summary: `Pushed ${monthKey} to Caspio${dos ? ` · DOS ${dos}` : ''}${
          pkId ? ` · PK_ID ${pkId}` : ''
        }`,
        actorName,
        actorEmail,
        actorUid: String(data.uid || ''),
        createdAt: pushedAt,
        meta: { caspioClaimPkId: pkId, caspioDateOfService: dos, synthesized: '1' },
      });
    }

    if (isNoWorkJustification(reason)) continue;
    const disposition = String(data.disposition || '').trim().toLowerCase();
    if (disposition === 'claimable' || isNotesClaimableJustification(reason)) {
      out.push({
        id: `synth-claimable-${doc.id}`,
        clientId2,
        monthKey,
        action: 'marked_claimable',
        summary: `Marked ${monthKey} claimable${reason ? ` (${reason})` : ''}`,
        actorName,
        actorEmail,
        actorUid: String(data.uid || ''),
        createdAt: updatedAt || pushedAt,
        meta: { reason, disposition: 'claimable', synthesized: '1' },
      });
    } else if (disposition === 'justified' || reason) {
      out.push({
        id: `synth-noclaim-${doc.id}`,
        clientId2,
        monthKey,
        action: 'marked_no_claim',
        summary: `Marked ${monthKey} no claim${reason ? ` (${reason})` : ''}`,
        actorName,
        actorEmail,
        actorUid: String(data.uid || ''),
        createdAt: updatedAt,
        meta: { reason, disposition: 'justified', synthesized: '1' },
      });
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request);
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const clientId2 = String(request.nextUrl.searchParams.get('clientId2') || '').trim();
    if (!clientId2) {
      return NextResponse.json({ success: false, error: 'clientId2 is required.' }, { status: 400 });
    }

    const { adminDb } = await import('@/firebase-admin');
    const snap = await adminDb
      .collection(KAISER_T2038_CLAIM_AUDIT_ACTIVITY_COLLECTION)
      .where('clientId2', '==', clientId2)
      .limit(200)
      .get();

    let entries: ClaimAuditActivityEntry[] = snap.docs.map(
      (doc: { id: string; data: () => Record<string, unknown> }) => mapDoc(doc)
    );

    if (!entries.length) {
      entries = await synthesizeFromJustifications(adminDb, clientId2);
    }

    entries.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return NextResponse.json({ success: true, clientId2, entries });
  } catch (error: unknown) {
    console.error('[kaiser-t2038-claim-audit/activity GET]', error);
    return NextResponse.json(
      {
        success: false,
        error: String((error as { message?: string })?.message || 'Failed to load activity.'),
      },
      { status: 500 }
    );
  }
}
