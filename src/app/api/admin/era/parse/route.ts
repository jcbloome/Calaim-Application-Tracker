import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import path from 'path';
import { readFile } from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireSuperAdmin(params: { idToken: string }) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(params.idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();

  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  let isSuperAdmin = Boolean((decoded as any)?.superAdmin);
  if (isHardcodedAdminEmail(email)) isSuperAdmin = true;

  if (!isSuperAdmin) {
    const superAdminDoc = await adminDb.collection('roles_super_admin').doc(uid).get();
    isSuperAdmin = superAdminDoc.exists;
    if (!isSuperAdmin && email) {
      const superAdminByEmailDoc = await adminDb.collection('roles_super_admin').doc(email).get();
      isSuperAdmin = superAdminByEmailDoc.exists;
    }
  }

  if (!isSuperAdmin) return { ok: false as const, status: 403, error: 'Super Admin privileges required' };

  return { ok: true as const };
}

type EraRow = {
  payer: string;
  remittance_date: string | null;
  page: number;
  member_name: string;
  hic: string | null;
  medi_cal_number: string | null;
  acnt: string | null;
  icn: string | null;
  proc: 'H2022' | 'T2038';
  service_from: string | null;
  service_to: string | null;
  billed: number | null;
  allowed: number | null;
  paid: number | null;
  source_line: string;
};

type EraSummary = {
  total_rows?: number;
  t2038?: { rows?: number; members?: number; total_paid?: number };
  h2022?: { rows?: number; members?: number; total_paid?: number };
  era_grand_total?: number | null;
  parser_total?: number | null;
  variance?: number | null;
};

type EraCacheMeta = {
  cacheKey: string;
  fileName: string;
  sourceMode: 'fast' | 'local' | 'local_path' | 'unknown';
  fileSize: number | null;
  fileLastModified: number | null;
  parsedByUid: string;
  payer: string;
  summary: EraSummary | null;
  totalRows: number;
  chunkCount: number;
  createdAt?: any;
  updatedAt?: any;
};

const AMOUNT_RE = /(?<!\d)(-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}|\((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\))(?!\d)/g;
// Support PROC values with or without separator before modifiers (e.g. "T2038 U5" or "T2038U5")
const PROC_RE = /\b(H2022|T2038)(?:\b|(?=[A-Z0-9]))/i;
const ERA_CACHE_COLLECTION = 'era_parser_cache';
const ERA_CACHE_CHUNK_SIZE = 250;
const ERA_HISTORY_LOOKUP_DEFAULT_LIMIT = 25;
const ERA_HISTORY_LOOKUP_MAX_LIMIT = 100;

const normalizeLookupToken = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

const normalizeNameForLookup = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const rowMatchesLookup = (row: EraRow, rawQuery: string) => {
  const qText = String(rawQuery || '').trim().toLowerCase();
  if (!qText) return false;
  const qToken = normalizeLookupToken(qText);
  const qName = normalizeNameForLookup(qText);
  const qNameTokens = qName
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const member = String(row.member_name || '').toLowerCase().trim();
  const memberNormalized = normalizeNameForLookup(member);
  const memberToken = normalizeLookupToken(member);
  const mediCal = String(row.medi_cal_number || '').toLowerCase().trim();
  const mediCalToken = normalizeLookupToken(mediCal);
  const clientId2 = String(row.acnt || '').toLowerCase().trim();
  const clientId2Token = normalizeLookupToken(clientId2);
  const icn = String(row.icn || '').toLowerCase().trim();
  const icnToken = normalizeLookupToken(icn);

  const nameMatchDirect = member.includes(qText) || (qName ? memberNormalized.includes(qName) : false);
  const nameMatchByTokens =
    qNameTokens.length > 0 &&
    qNameTokens.every((tok) => memberNormalized.includes(tok) || memberToken.includes(normalizeLookupToken(tok)));
  const idTextMatch = mediCal.includes(qText) || clientId2.includes(qText) || icn.includes(qText);
  const idTokenMatch = qToken
    ? mediCalToken.includes(qToken) || clientId2Token.includes(qToken) || icnToken.includes(qToken)
    : false;

  return nameMatchDirect || nameMatchByTokens || idTextMatch || idTokenMatch;
};

const normalizeCacheKey = (raw: unknown) => {
  const token = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:|-]+/g, '_')
    .slice(0, 220);
  return token || null;
};

const sanitizeRows = (rows: unknown): EraRow[] => {
  const list = Array.isArray(rows) ? rows : [];
  return list.filter(Boolean).map((r: any) => ({
    payer: String(r?.payer || 'Health Net'),
    remittance_date: r?.remittance_date ? String(r.remittance_date) : null,
    page: Number(r?.page || 0),
    member_name: String(r?.member_name || ''),
    hic: r?.hic ? String(r.hic) : null,
    medi_cal_number: r?.medi_cal_number ? String(r.medi_cal_number) : null,
    acnt: r?.acnt ? String(r.acnt) : null,
    icn: r?.icn ? String(r.icn) : null,
    proc: String(r?.proc || '').toUpperCase() === 'T2038' ? 'T2038' : 'H2022',
    service_from: r?.service_from ? String(r.service_from) : null,
    service_to: r?.service_to ? String(r.service_to) : null,
    billed: typeof r?.billed === 'number' ? r.billed : null,
    allowed: typeof r?.allowed === 'number' ? r.allowed : null,
    paid: typeof r?.paid === 'number' ? r.paid : null,
    source_line: String(r?.source_line || ''),
  }));
};

async function readCachedEra(adminDb: any, cacheKeyRaw: unknown) {
  const cacheKey = normalizeCacheKey(cacheKeyRaw);
  if (!cacheKey) return null;

  const metaSnap = await adminDb.collection(ERA_CACHE_COLLECTION).doc(cacheKey).get();
  if (!metaSnap.exists) return null;

  const meta = (metaSnap.data() || {}) as EraCacheMeta;
  const chunksSnap = await adminDb
    .collection(ERA_CACHE_COLLECTION)
    .doc(cacheKey)
    .collection('chunks')
    .orderBy('index', 'asc')
    .get();
  const rows: EraRow[] = [];
  chunksSnap.forEach((d: any) => {
    const part = Array.isArray(d.data()?.rows) ? d.data().rows : [];
    rows.push(...sanitizeRows(part));
  });

  return {
    cacheKey,
    payer: String(meta?.payer || 'Health Net'),
    summary: (meta?.summary || null) as EraSummary | null,
    rows,
    fileName: String(meta?.fileName || ''),
    sourceMode: String(meta?.sourceMode || 'unknown'),
    fileSize: typeof meta?.fileSize === 'number' ? meta.fileSize : null,
    fileLastModified: typeof meta?.fileLastModified === 'number' ? meta.fileLastModified : null,
    updatedAt: meta?.updatedAt || null,
  };
}

async function writeCachedEra(
  adminDb: any,
  payload: {
    cacheKey: unknown;
    fileName?: unknown;
    sourceMode?: unknown;
    fileSize?: unknown;
    fileLastModified?: unknown;
    parsedByUid: string;
    payer: unknown;
    summary: unknown;
    rows: unknown;
  }
) {
  const cacheKey = normalizeCacheKey(payload.cacheKey);
  if (!cacheKey) throw new Error('Missing cacheKey');

  const rows = sanitizeRows(payload.rows);
  const metaRef = adminDb.collection(ERA_CACHE_COLLECTION).doc(cacheKey);
  const chunksRef = metaRef.collection('chunks');
  const oldChunks = await chunksRef.get();
  if (!oldChunks.empty) {
    const deleteBatch = adminDb.batch();
    oldChunks.docs.forEach((d: any) => deleteBatch.delete(d.ref));
    await deleteBatch.commit();
  }

  const chunks: EraRow[][] = [];
  for (let i = 0; i < rows.length; i += ERA_CACHE_CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + ERA_CACHE_CHUNK_SIZE));
  }

  const writeBatch = adminDb.batch();
  chunks.forEach((chunkRows, idx) => {
    writeBatch.set(chunksRef.doc(String(idx).padStart(4, '0')), {
      index: idx,
      rows: chunkRows,
      rowCount: chunkRows.length,
      updatedAt: new Date(),
    });
  });

  const nowTs = new Date();
  const metaPayload: EraCacheMeta = {
    cacheKey,
    fileName: String(payload.fileName || 'Unknown PDF'),
    sourceMode: (String(payload.sourceMode || 'unknown') as EraCacheMeta['sourceMode']) || 'unknown',
    fileSize: typeof payload.fileSize === 'number' ? payload.fileSize : null,
    fileLastModified: typeof payload.fileLastModified === 'number' ? payload.fileLastModified : null,
    parsedByUid: payload.parsedByUid,
    payer: String(payload.payer || 'Health Net'),
    summary: (payload.summary || null) as EraSummary | null,
    totalRows: rows.length,
    chunkCount: chunks.length,
    updatedAt: nowTs,
  };

  const metaExists = (await metaRef.get()).exists;
  const mergedMeta: Record<string, any> = { ...metaPayload };
  if (!metaExists) mergedMeta.createdAt = nowTs;
  writeBatch.set(metaRef, mergedMeta, { merge: true });
  await writeBatch.commit();

  return { cacheKey, totalRows: rows.length };
}

const toIsoFromMmddyy = (mmddyy: string) => {
  const raw = String(mmddyy || '').trim();
  if (!/^\d{6}$/.test(raw)) return null;
  const mm = raw.slice(0, 2);
  const dd = raw.slice(2, 4);
  const yy = raw.slice(4, 6);
  const year = 2000 + Number(yy);
  return `${String(year)}-${mm}-${dd}`;
};

const toIsoFromMmdd = (mmdd: string, year: number) => {
  const raw = String(mmdd || '').trim();
  if (!/^\d{4}$/.test(raw)) return null;
  const mm = raw.slice(0, 2);
  const dd = raw.slice(2, 4);
  return `${String(year)}-${mm}-${dd}`;
};

const parseRemitDate = (lines: string[]) => {
  for (const ln of lines.slice(0, 120)) {
    const m = ln.match(/\bDATE\b\s*[:#]?\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{2,4})/i);
    if (m?.[1]) return String(m[1]);
  }
  return null;
};

const findKwToken = (line: string, kw: string) => {
  const m = line.match(new RegExp(`\\b${kw}\\b\\s*[:#]?\\s*(\\S+)`, 'i'));
  return m?.[1] ? String(m[1]).trim() : null;
};

const segmentBetween = (line: string, startKw: string, endKws: string[]) => {
  const lower = line.toLowerCase();
  const startIdx = lower.indexOf(startKw.toLowerCase());
  if (startIdx < 0) return '';
  const tail = line.slice(startIdx + startKw.length);
  const tailLower = tail.toLowerCase();
  let cut = tail.length;
  for (const kw of endKws) {
    const idx = tailLower.indexOf(` ${kw.toLowerCase()} `);
    if (idx >= 0) cut = Math.min(cut, idx);
  }
  return tail.slice(0, cut).trim();
};

const extractNameHicAcntIcn = (line: string) => {
  const name = segmentBetween(line, 'NAME', ['HIC', 'ACNT', 'ICN']);
  const hicSegment = segmentBetween(line, 'HIC', ['ACNT', 'ICN']);
  const tokens = hicSegment ? hicSegment.split(/\s+/).filter(Boolean) : [];
  const hic = tokens.length >= 1 ? tokens[0] : null;
  const medi = tokens.length >= 2 ? tokens[1] : null;
  const acnt = findKwToken(line, 'ACNT');
  const icn = findKwToken(line, 'ICN');
  return { name, hic, medi, acnt, icn };
};

function parseServiceDatesFromProcLine(line: string, remitDate: string | null) {
  const tokens = String(line || '').trim().split(/\s+/).filter(Boolean);
  const mmdd = tokens.find((t) => /^\d{4}$/.test(t)) || null;
  const mmddyy = tokens.find((t) => /^\d{6}$/.test(t)) || null;

  const yearFromRemit = (() => {
    if (!remitDate) return null;
    const m = remitDate.match(/(\d{4})/);
    return m?.[1] ? Number(m[1]) : null;
  })();

  let toIso: string | null = null;
  if (mmddyy) toIso = toIsoFromMmddyy(mmddyy);
  const year = (() => {
    if (toIso) return Number(toIso.slice(0, 4));
    if (yearFromRemit) return yearFromRemit;
    return null;
  })();

  const fromIso = mmdd && year ? toIsoFromMmdd(mmdd, year) : null;
  return { service_from: fromIso, service_to: toIso };
}

const parseEraGrandTotalFromLines = (lines: string[]) => {
  for (let i = 0; i < lines.length; i++) {
    const ln = String(lines[i] || '');
    if (!/\bTOTALS:\b/i.test(ln)) continue;
    for (let j = i; j < Math.min(lines.length, i + 8); j++) {
      const amounts = Array.from(String(lines[j] || '').matchAll(AMOUNT_RE)).map((mm) => mm?.[1]).filter(Boolean) as string[];
      if (amounts.length < 3) continue;
      const nums = amounts
        .map((v) => {
          const raw = String(v || '').trim();
          const isParen = raw.startsWith('(') && raw.endsWith(')');
          const n = Number(raw.replace(/[(),]/g, ''));
          if (!Number.isFinite(n)) return null;
          return isParen ? -Math.abs(n) : n;
        })
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      if (!nums.length) continue;
      return nums[nums.length - 1];
    }
  }
  return null as number | null;
};

function parseEraFromPages(pages: string[][]) {
  const payer = 'Health Net';
  const allRows: EraRow[] = [];
  let eraGrandTotal: number | null = null;

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const lines = Array.isArray(pages[pageIdx]) ? pages[pageIdx] : [];
    const pageGrandTotal = parseEraGrandTotalFromLines(lines);
    if (typeof pageGrandTotal === 'number' && Number.isFinite(pageGrandTotal)) {
      eraGrandTotal = pageGrandTotal;
    }
    const remittance_date = parseRemitDate(lines);
    let current = {
      member_name: '',
      hic: null as string | null,
      medi: null as string | null,
      acnt: null as string | null,
      icn: null as string | null,
    };

    for (const ln of lines) {
      if (/^\s*NAME\b/i.test(ln)) {
        const parsed = extractNameHicAcntIcn(ln);
        current = { member_name: parsed.name || '', hic: parsed.hic, medi: parsed.medi, acnt: parsed.acnt, icn: parsed.icn };
        continue;
      }

      const m = ln.match(PROC_RE);
      if (!m?.[1]) continue;
      const proc = String(m[1]).toUpperCase() as 'H2022' | 'T2038';

      const amounts = Array.from(ln.matchAll(AMOUNT_RE)).map((mm) => mm?.[1]).filter(Boolean);
      const toNum = (v?: string | null) => {
        if (!v) return null;
        const raw = String(v).trim();
        const isParen = raw.startsWith('(') && raw.endsWith(')');
        const n = Number(raw.replace(/[(),]/g, ''));
        if (!Number.isFinite(n)) return null;
        return isParen ? -Math.abs(n) : n;
      };
      const billed = amounts.length >= 1 ? toNum(amounts[0]) : null;
      const allowed = amounts.length >= 2 ? toNum(amounts[1]) : null;
      const paid = amounts.length >= 1 ? toNum(amounts[amounts.length - 1]) : null;

      const svc = parseServiceDatesFromProcLine(ln, remittance_date);

      allRows.push({
        payer,
        remittance_date,
        page: pageIdx + 1,
        member_name: String(current.member_name || '').trim(),
        hic: current.hic,
        medi_cal_number: current.medi,
        acnt: current.acnt,
        icn: current.icn,
        proc,
        service_from: svc.service_from,
        service_to: svc.service_to,
        billed,
        allowed,
        paid,
        source_line: ln,
      });
    }
  }

  const sumPaid = (code: 'H2022' | 'T2038') =>
    Number(
      allRows
        .filter((r) => r.proc === code)
        .map((r) => r.paid)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        .reduce((a, b) => a + b, 0)
        .toFixed(2)
    );

  const uniqueMembers = (code: 'H2022' | 'T2038') => {
    const s = new Set<string>();
    for (const r of allRows) {
      if (r.proc !== code) continue;
      const key = String(r.acnt || '').trim() || String(r.member_name || '').trim();
      if (key) s.add(key);
    }
    return s.size;
  };

  const summary = {
    total_rows: allRows.length,
    t2038: { rows: allRows.filter((r) => r.proc === 'T2038').length, members: uniqueMembers('T2038'), total_paid: sumPaid('T2038') },
    h2022: { rows: allRows.filter((r) => r.proc === 'H2022').length, members: uniqueMembers('H2022'), total_paid: sumPaid('H2022') },
    era_grand_total: eraGrandTotal,
    parser_total: Number((sumPaid('T2038') + sumPaid('H2022')).toFixed(2)),
    variance:
      typeof eraGrandTotal === 'number'
        ? Number((sumPaid('T2038') + sumPaid('H2022') - eraGrandTotal).toFixed(2))
        : null,
  };

  const totalLines = pages.reduce((acc, p) => acc + (Array.isArray(p) ? p.length : 0), 0);

  return { success: true as const, payer, summary, rows: allRows, debug: { pages: pages.length, totalLines } };
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const adminCheck = await requireSuperAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const contentType = String(req.headers.get('content-type') || '');
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json({ success: false, error: 'Unsupported request. Send JSON body.' }, { status: 415 });
    }
    const body = (await req.json().catch(() => null)) as any;
    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const decoded = await adminModule.adminAuth.verifyIdToken(idToken);
    const parsedByUid = String(decoded?.uid || '').trim();

    if (String(body?.action || '') === 'save_cache') {
      if (!parsedByUid) {
        return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
      }
      const saved = await writeCachedEra(adminDb, {
        cacheKey: body?.cacheKey,
        fileName: body?.fileName,
        sourceMode: body?.sourceMode,
        fileSize: body?.fileSize,
        fileLastModified: body?.fileLastModified,
        parsedByUid,
        payer: body?.payer,
        summary: body?.summary,
        rows: body?.rows,
      });
      return NextResponse.json({ success: true, cached: true, ...saved }, { status: 200 });
    }

    const cacheKey = normalizeCacheKey(body?.cacheKey);
    if (cacheKey) {
      const cached = await readCachedEra(adminDb, cacheKey);
      if (cached && Array.isArray(cached.rows) && cached.rows.length) {
        return NextResponse.json({ success: true, cached: true, ...cached }, { status: 200 });
      }
    }

    let pages = Array.isArray(body?.pages) ? (body.pages as any[]) : [];
    const pdfPath = String(body?.pdfPath || '').trim();
    if (!pages.length && pdfPath) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { success: false, error: 'Local file path parsing is only available in local development.' },
          { status: 400 }
        );
      }
      if (!path.isAbsolute(pdfPath)) {
        return NextResponse.json({ success: false, error: 'pdfPath must be an absolute path.' }, { status: 400 });
      }
      try {
        const pdfBytes = await readFile(pdfPath);
        const mod: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const pdfjs: any = mod?.getDocument ? mod : mod?.default || mod;
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes), disableWorker: true });
        const pdf = await loadingTask.promise;
        const extractedPages: string[][] = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const tc = await page.getTextContent();
          const items = (tc.items || []) as Array<any>;
          const rows: Array<{ str: string; x: number; y: number }> = [];
          for (const it of items) {
            const str = String(it?.str || '').trim();
            if (!str) continue;
            const tr = it?.transform || [];
            const x = Number(tr?.[4] ?? 0);
            const y = Number(tr?.[5] ?? 0);
            rows.push({ str, x, y });
          }
          const byY = new Map<number, Array<{ str: string; x: number }>>();
          for (const r of rows) {
            const yk = Math.round(r.y);
            const arr = byY.get(yk) || [];
            arr.push({ str: r.str, x: r.x });
            byY.set(yk, arr);
          }
          const yKeys = Array.from(byY.keys()).sort((a, b) => b - a);
          const lines: string[] = [];
          for (const yk of yKeys) {
            const parts = (byY.get(yk) || []).sort((a, b) => a.x - b.x).map((p) => p.str);
            const ln = parts.join(' ').replace(/\s{2,}/g, ' ').trim();
            if (ln) lines.push(ln);
          }
          extractedPages.push(lines);
        }
        pages = extractedPages;
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: `Failed to read/parse pdfPath: ${err?.message || 'Unknown error'}` },
          { status: 422 }
        );
      }
    }

    if (!pages.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'No extracted pages were provided. This usually means the PDF has no selectable text (scanned).',
        },
        { status: 422 }
      );
    }
    const payload = parseEraFromPages(pages as any);
    const rows = Array.isArray((payload as any)?.rows) ? (payload as any).rows : [];
    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No H2022/T2038 lines were extracted from the extracted text. The remittance format may differ or the PDF is scanned.',
          details: (payload as any)?.debug || null,
        },
        { status: 422 }
      );
    }

    const responsePayload = {
      success: true,
      payer: (payload as any)?.payer || 'Health Net',
      summary: (payload as any)?.summary || null,
      rows,
      cached: false,
      cacheKey,
    };

    if (cacheKey && parsedByUid) {
      await writeCachedEra(adminDb, {
        cacheKey,
        fileName: body?.fileName || (pdfPath ? path.basename(pdfPath) : 'ERA PDF'),
        sourceMode: body?.sourceMode || (pdfPath ? 'local_path' : 'unknown'),
        fileSize: typeof body?.fileSize === 'number' ? body.fileSize : null,
        fileLastModified: typeof body?.fileLastModified === 'number' ? body.fileLastModified : null,
        parsedByUid,
        payer: responsePayload.payer,
        summary: responsePayload.summary,
        rows,
      });
    }

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }
    const adminCheck = await requireSuperAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const { searchParams } = new URL(req.url);
    const lookup = String(searchParams.get('lookup') || '').trim();
    const cacheKey = normalizeCacheKey(searchParams.get('cacheKey'));
    if (cacheKey) {
      const cached = await readCachedEra(adminDb, cacheKey);
      if (!cached) return NextResponse.json({ success: false, error: 'Cache not found' }, { status: 404 });
      return NextResponse.json({ success: true, cached: true, ...cached }, { status: 200 });
    }

    const limitRaw = Number(searchParams.get('limit') || 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 20;

    if (lookup) {
      const lookupLimit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(ERA_HISTORY_LOOKUP_MAX_LIMIT, Math.floor(limitRaw)))
        : ERA_HISTORY_LOOKUP_DEFAULT_LIMIT;
      const snap = await adminDb.collection(ERA_CACHE_COLLECTION).orderBy('updatedAt', 'desc').limit(lookupLimit).get();
      const batches: Array<{
        cacheKey: string;
        fileName: string;
        sourceMode: string;
        payer: string;
        totalRows: number;
        updatedAt: any;
        matchedRows: number;
        matchedMembers: number;
        totalPaid: number;
        sampleRows: EraRow[];
      }> = [];

      for (const d of snap.docs) {
        const x = d.data() || {};
        const chunksSnap = await adminDb
          .collection(ERA_CACHE_COLLECTION)
          .doc(d.id)
          .collection('chunks')
          .orderBy('index', 'asc')
          .get();

        const matched: EraRow[] = [];
        chunksSnap.forEach((chunkDoc: any) => {
          const chunkRows = sanitizeRows(chunkDoc.data()?.rows || []);
          for (const row of chunkRows) {
            if (rowMatchesLookup(row, lookup)) matched.push(row);
          }
        });
        if (!matched.length) continue;

        const memberKeys = new Set<string>();
        let totalPaid = 0;
        for (const row of matched) {
          const memberKey = String(row.acnt || '').trim() || String(row.member_name || '').trim();
          if (memberKey) memberKeys.add(memberKey);
          if (typeof row.paid === 'number' && Number.isFinite(row.paid)) totalPaid += row.paid;
        }

        batches.push({
          cacheKey: d.id,
          fileName: String(x?.fileName || 'ERA PDF'),
          sourceMode: String(x?.sourceMode || 'unknown'),
          payer: String(x?.payer || 'Health Net'),
          totalRows: Number(x?.totalRows || 0),
          updatedAt: x?.updatedAt || null,
          matchedRows: matched.length,
          matchedMembers: memberKeys.size,
          totalPaid: Number(totalPaid.toFixed(2)),
          sampleRows: matched.slice(0, 5),
        });
      }

      return NextResponse.json({ success: true, lookup, searchedBatches: snap.size, matchedBatches: batches.length, batches }, { status: 200 });
    }

    const snap = await adminDb.collection(ERA_CACHE_COLLECTION).orderBy('updatedAt', 'desc').limit(limit).get();
    const history = snap.docs.map((d: any) => {
      const x = d.data() || {};
      return {
        cacheKey: d.id,
        fileName: String(x?.fileName || ''),
        sourceMode: String(x?.sourceMode || 'unknown'),
        totalRows: Number(x?.totalRows || 0),
        payer: String(x?.payer || 'Health Net'),
        summary: (x?.summary || null) as EraSummary | null,
        updatedAt: x?.updatedAt || null,
      };
    });
    return NextResponse.json({ success: true, history }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

