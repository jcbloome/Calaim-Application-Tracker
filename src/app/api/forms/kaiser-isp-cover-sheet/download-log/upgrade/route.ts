import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminStorage } from '@/firebase-admin';
import { upgradeKaiserCoverSheetPdf } from '@/lib/kaiser-cover-sheet-upgrade';
import { formatCoverSheetMoney, parseMoneyAmount } from '@/lib/kaiser-cover-sheet-tier-rates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const clean = (value: unknown) => String(value || '').trim();

const toIso = (value: unknown) => {
  try {
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate?.toDate === 'function') {
      const d = withToDate.toDate();
      return Number.isNaN(d.getTime()) ? '' : d.toISOString();
    }
    const d = new Date(String(value || ''));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  } catch {
    return '';
  }
};

const ROOM_BOARD_KEYS = [
  'Room_and_Board_Amount',
  'Members_Financial_Responsibility',
  'Client_Financial_Responsibility',
  'Financial_Responsibility',
  'Expected_Room_Board_Payment',
];

function pickRoomBoard(row: Record<string, unknown> | null | undefined): string {
  if (!row) return '';
  for (const key of ROOM_BOARD_KEYS) {
    const amount = parseMoneyAmount(row[key]);
    if (amount) return formatCoverSheetMoney(amount);
  }
  return '';
}

async function resolveRoomBoardAmount(
  adminDb: { collection: (name: string) => { doc: (id: string) => { get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }> } } },
  memberClientId: string
): Promise<string> {
  const id = clean(memberClientId);
  if (!id) return '';
  try {
    const cacheDoc = await adminDb.collection('caspio_members_cache').doc(id).get();
    if (cacheDoc.exists) {
      const fromCache = pickRoomBoard((cacheDoc.data() || {}) as Record<string, unknown>);
      if (fromCache) return fromCache;
    }
  } catch {
    // fall through to live Caspio
  }

  try {
    const { getCaspioCredentialsFromEnv, getCaspioToken } = await import('@/lib/caspio-api-utils');
    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);
    const where = `Client_ID2='${id.replace(/'/g, "''")}'`;
    const url =
      `${credentials.baseUrl}/integrations/rest/v3/tables/CalAIM_tbl_Members/records` +
      `?q.where=${encodeURIComponent(where)}&q.limit=1`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return '';
    const body = await response.json().catch(() => ({}));
    const row = Array.isArray(body?.Result) ? body.Result[0] : null;
    return pickRoomBoard(row as Record<string, unknown>);
  } catch {
    return '';
  }
}

/** Upgrade archived Kaiser cover sheets to Total Costs = room & board (+ KP tier scripts). */
export async function POST(req: NextRequest) {
  const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
  if (!authCheck.ok) {
    return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const logIds = Array.isArray(body.logIds)
      ? body.logIds.map((id) => clean(id)).filter(Boolean)
      : [];
    const from = clean(body.from);
    const to = clean(body.to);
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : NaN;
    const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : NaN;
    const upgradeAllFinished = body.allFinished === true || body.allNeedingUpgrade === true;
    const force = body.force === true;
    const maxTargets = Math.min(
      Math.max(Number(body.limit) || (upgradeAllFinished ? 2000 : 500), 1),
      2000
    );

    if (!logIds.length && !upgradeAllFinished && Number.isNaN(fromTime) && Number.isNaN(toTime)) {
      return NextResponse.json(
        { success: false, error: 'Provide logIds, from/to dates, or allFinished: true.' },
        { status: 400 }
      );
    }

    type TargetLog = {
      id: string;
      deleted: boolean;
      archivedStoragePath: string;
      downloadName: string;
      memberName: string;
      memberClientId: string;
      coverPageType: string;
      createdAt: string;
      totalCostsFormat: string;
      upgradedAuthTotal: string;
      upgradedReauthTotal: string;
    };

    const targets: TargetLog[] = [];
    const pageSize = 250;
    let lastDoc: any = null;
    // Paginate newest-first so recent finished covers upgrade first.
    while (targets.length < maxTargets) {
      let query: any = authCheck.adminDb
        .collection('kaiser_isp_cover_sheet_download_logs')
        .orderBy('createdAt', 'desc')
        .limit(pageSize);
      if (lastDoc) query = query.startAfter(lastDoc);
      const snap = await query.get();
      if (!snap.docs?.length) break;
      lastDoc = snap.docs[snap.docs.length - 1];

      for (const doc of snap.docs as any[]) {
        const data = doc.data() || {};
        const log: TargetLog = {
          id: doc.id,
          deleted: Boolean(data.deleted),
          archivedStoragePath: clean(data.archivedStoragePath),
          downloadName: clean(data.downloadName),
          memberName: clean(data.memberName),
          memberClientId: clean(data.memberClientId),
          coverPageType: clean(data.coverPageType),
          createdAt: toIso(data.createdAt) || toIso(data.createdAtIso) || '',
          totalCostsFormat: clean(data.totalCostsFormat),
          upgradedAuthTotal: clean(data.upgradedAuthTotal),
          upgradedReauthTotal: clean(data.upgradedReauthTotal),
        };
        if (log.deleted) continue;
        if (!log.archivedStoragePath) continue;
        if (logIds.length && !logIds.includes(log.id)) continue;
        // Skip already-upgraded when scanning all finished / date ranges (explicit logIds always run).
        // Reauth sheets must have a non-zero reauth total; auth-only non-zero is not enough.
        if (!force && !logIds.length && log.totalCostsFormat === 'room-board-then-kp-tier') {
          const isReauthCover = String(log.coverPageType || '').toLowerCase().includes('reauth');
          const authOk = parseMoneyAmount(log.upgradedAuthTotal) > 0;
          const reauthOk = parseMoneyAmount(log.upgradedReauthTotal) > 0;
          if (isReauthCover ? reauthOk : authOk || reauthOk) continue;
        }
        if (!Number.isNaN(fromTime) || !Number.isNaN(toTime)) {
          const ts = new Date(log.createdAt || '').getTime();
          if (Number.isNaN(ts)) continue;
          if (!Number.isNaN(fromTime) && ts < fromTime) continue;
          if (!Number.isNaN(toTime) && ts > toTime) continue;
        }
        targets.push(log);
        if (targets.length >= maxTargets) break;
      }

      if (snap.docs.length < pageSize) break;
      // Date-filtered scans can stop once we pass the from bound (newest-first).
      if (!logIds.length && !upgradeAllFinished && !Number.isNaN(fromTime)) {
        const oldestInPage = toIso(lastDoc?.data?.()?.createdAt) || toIso(lastDoc?.data?.()?.createdAtIso) || '';
        const oldestTs = new Date(oldestInPage || '').getTime();
        if (!Number.isNaN(oldestTs) && oldestTs < fromTime) break;
      }
    }

    const results: Array<{
      id: string;
      downloadName: string;
      ok: boolean;
      error?: string;
      authTotal?: string;
      reauthTotal?: string;
      roomBoardSource?: string;
      roomBoardAmount?: string;
      stillZero?: boolean;
    }> = [];

    const bucket = adminStorage.bucket();
    const upgradedAt = new Date().toISOString();
    const upgradedBy = clean(authCheck.name) || clean(authCheck.email).toLowerCase();
    const roomBoardCache = new Map<string, string>();

    for (const log of targets) {
      try {
        const file = bucket.file(log.archivedStoragePath);
        const [exists] = await file.exists();
        if (!exists) {
          results.push({ id: log.id, downloadName: log.downloadName, ok: false, error: 'Archived file missing' });
          continue;
        }

        let roomBoardAmount = '';
        if (log.memberClientId) {
          if (roomBoardCache.has(log.memberClientId)) {
            roomBoardAmount = roomBoardCache.get(log.memberClientId) || '';
          } else {
            roomBoardAmount = await resolveRoomBoardAmount(authCheck.adminDb, log.memberClientId);
            roomBoardCache.set(log.memberClientId, roomBoardAmount);
          }
        }

        const [buffer] = await file.download();
        const upgraded = await upgradeKaiserCoverSheetPdf(new Uint8Array(buffer), {
          roomBoardAmount,
          coverPageType: log.coverPageType,
        });

        // Force a new object generation so CDN/browser caches cannot serve the pre-upgrade PDF.
        await file.save(Buffer.from(upgraded.bytes), {
          contentType: 'application/pdf',
          resumable: false,
          metadata: {
            contentType: 'application/pdf',
            cacheControl: 'private, no-store',
            metadata: {
              upgradedAt,
              upgradedBy,
              upgradeReason: 'total-costs-room-board-then-kp-tier',
              authTotal: upgraded.authTotal,
              reauthTotal: upgraded.reauthTotal,
            },
          },
        });

        const stillZero =
          parseMoneyAmount(upgraded.authTotal) === 0 && parseMoneyAmount(upgraded.reauthTotal) === 0;

        await authCheck.adminDb.collection('kaiser_isp_cover_sheet_download_logs').doc(log.id).set(
          {
            totalCostsFormat: 'room-board-then-kp-tier',
            upgradedAt,
            upgradedBy,
            upgradedAuthTotal: upgraded.authTotal,
            upgradedReauthTotal: upgraded.reauthTotal,
            upgradedRoomBoardSource: upgraded.roomBoardSource,
            upgradedRoomBoardAmount: upgraded.authRoomBoard || upgraded.reauthRoomBoard || '',
          },
          { merge: true }
        );
        results.push({
          id: log.id,
          downloadName: log.downloadName || log.memberName,
          ok: true,
          authTotal: upgraded.authTotal,
          reauthTotal: upgraded.reauthTotal,
          roomBoardSource: upgraded.roomBoardSource,
          roomBoardAmount: upgraded.authRoomBoard || upgraded.reauthRoomBoard || '',
          stillZero,
        });
      } catch (error: any) {
        results.push({
          id: log.id,
          downloadName: log.downloadName || log.memberName,
          ok: false,
          error: String(error?.message || 'Upgrade failed'),
        });
      }
    }

    const upgraded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    const stillZero = results.filter((r) => r.ok && r.stillZero).length;
    return NextResponse.json({
      success: true,
      upgraded,
      failed,
      stillZero,
      total: results.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to upgrade cover sheets') },
      { status: 500 }
    );
  }
}
