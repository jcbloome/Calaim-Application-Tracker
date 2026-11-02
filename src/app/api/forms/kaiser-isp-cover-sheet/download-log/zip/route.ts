import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminStorage } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const clean = (value: unknown) => String(value || '').trim();

const sanitizeFileComponent = (value: string) =>
  clean(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

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

/** ZIP archived Kaiser cover sheets for ILS (by logIds and/or date range). */
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

    if (!logIds.length && Number.isNaN(fromTime) && Number.isNaN(toTime)) {
      return NextResponse.json(
        { success: false, error: 'Provide logIds and/or from/to dates.' },
        { status: 400 }
      );
    }

    const snap = await authCheck.adminDb
      .collection('kaiser_isp_cover_sheet_download_logs')
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    const targets = (snap.docs as any[])
      .map((doc: any) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          deleted: Boolean(data.deleted),
          archivedStoragePath: clean(data.archivedStoragePath),
          downloadName: clean(data.downloadName),
          memberName: clean(data.memberName),
          coverPageType: clean(data.coverPageType),
          createdAt: toIso(data.createdAt) || toIso(data.createdAtIso) || '',
          totalCostsFormat: clean(data.totalCostsFormat),
        };
      })
      .filter((log) => {
        if (log.deleted) return false;
        if (!log.archivedStoragePath) return false;
        if (logIds.length && !logIds.includes(log.id)) return false;
        if (!Number.isNaN(fromTime) || !Number.isNaN(toTime)) {
          const ts = new Date(log.createdAt || '').getTime();
          if (Number.isNaN(ts)) return false;
          if (!Number.isNaN(fromTime) && ts < fromTime) return false;
          if (!Number.isNaN(toTime) && ts > toTime) return false;
        }
        return true;
      });

    if (!targets.length) {
      return NextResponse.json(
        { success: false, error: 'No archived cover sheets found for that selection.' },
        { status: 404 }
      );
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();
    const bucket = adminStorage.bucket();
    const included: string[] = [];
    const missing: string[] = [];

    for (const log of targets) {
      try {
        const file = bucket.file(log.archivedStoragePath);
        const [exists] = await file.exists();
        if (!exists) {
          missing.push(log.downloadName || log.memberName || log.id);
          continue;
        }
        const [buffer] = await file.download();
        let baseName =
          sanitizeFileComponent(log.downloadName) ||
          sanitizeFileComponent(log.memberName) ||
          `Kaiser Cover Sheet ${log.id}`;
        if (!/\.pdf$/i.test(baseName)) baseName = `${baseName}.pdf`;
        let fileName = baseName;
        let n = 2;
        while (usedNames.has(fileName.toLowerCase())) {
          fileName = baseName.replace(/\.pdf$/i, `_${n}.pdf`);
          n += 1;
        }
        usedNames.add(fileName.toLowerCase());
        zip.file(fileName, buffer);
        included.push(fileName);
      } catch {
        missing.push(log.downloadName || log.memberName || log.id);
      }
    }

    if (!included.length) {
      return NextResponse.json(
        { success: false, error: 'Could not read any archived cover sheet files.' },
        { status: 404 }
      );
    }

    const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const dateLabel = from && to && from === to ? from : [from, to].filter(Boolean).join('_to_') || 'selected';
    zip.file(
      'README - Kaiser cover sheets for ILS.txt',
      [
        'Kaiser ALFT Cover Sheets — package for ILS',
        '',
        `Generated: ${stamp}`,
        `Selection: ${dateLabel}`,
        `PDFs included: ${included.length}`,
        missing.length ? `Missing/unavailable: ${missing.length}` : '',
        '',
        'Contents',
        ...included.map((name) => `- ${name}`),
        '',
        missing.length ? `Unavailable:\n${missing.map((name) => `- ${name}`).join('\n')}\n` : '',
        'Notes',
        '- Total Costs should show member room & board first; Max KP expenses fill when Kaiser selects tier.',
        '- Send this ZIP (or the unzipped PDFs) to ILS.',
      ]
        .filter((line) => line !== undefined)
        .join('\n')
    );

    const zipBytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const zipName = `Kaiser Cover Sheets for ILS ${dateLabel}.zip`;
    return new NextResponse(Buffer.from(zipBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
        'X-Cover-Sheet-Count': String(included.length),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to build ZIP') },
      { status: 500 }
    );
  }
}
