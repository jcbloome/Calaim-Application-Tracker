import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import path from 'path';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

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

const AMOUNT_RE = /(?<!\d)(\d{1,3}(?:,\d{3})*\.\d{2})(?!\d)/g;
const PROC_RE = /\b(H2022|T2038)\b/i;

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

async function extractPdfLinesByPage(pdfBytes: Buffer): Promise<{ pages: string[][]; rawText: string }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // @ts-expect-error pdfjs types mismatch
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes) });
  const pdf = await loadingTask.promise;
  const pages: string[][] = [];
  let rawText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const tc = await page.getTextContent();
    const items = (tc.items || []) as Array<TextItem & { transform?: number[] }>;
    const rows: Array<{ str: string; x: number; y: number }> = [];
    for (const it of items) {
      const str = String((it as any).str || '').trim();
      if (!str) continue;
      const tr = (it as any).transform || [];
      const x = Number(tr?.[4] ?? 0);
      const y = Number(tr?.[5] ?? 0);
      rows.push({ str, x, y });
    }
    // Group by y (rounded) to approximate lines.
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
    pages.push(lines);
    rawText += `\n\n--- page ${pageNum} ---\n` + lines.join('\n');
  }
  return { pages, rawText: rawText.trim() };
}

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

function parseEraFromPdfBytes(pdfBytes: Buffer) {
  const payer = 'Health Net';

  return extractPdfLinesByPage(pdfBytes).then(({ pages, rawText }) => {
    const allRows: EraRow[] = [];

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const lines = pages[pageIdx];
      const remittance_date = parseRemitDate(lines);
      let current = { member_name: '', hic: null as string | null, medi: null as string | null, acnt: null as string | null, icn: null as string | null };

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
          const n = Number(String(v).replace(/,/g, ''));
          return Number.isFinite(n) ? n : null;
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
    };

    return { success: true as const, payer, summary, rows: allRows, debug: { extractedChars: rawText.length } };
  });
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

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Missing PDF file (field: file)' }, { status: 400 });
    }

    const filename = String(file.name || 'era.pdf');
    const ext = path.extname(filename).toLowerCase();
    if (ext !== '.pdf') {
      return NextResponse.json({ success: false, error: 'Only .pdf files are supported' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.length) {
      return NextResponse.json({ success: false, error: 'Uploaded file is empty.' }, { status: 400 });
    }

    const payload = await parseEraFromPdfBytes(bytes);
    if (!payload?.success) {
      return NextResponse.json({ success: false, error: 'ERA parse failed.' }, { status: 500 });
    }
    const rows = Array.isArray((payload as any)?.rows) ? (payload as any).rows : [];
    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No H2022/T2038 lines were extracted. This can happen if the PDF is scanned (no text layer) or the format differs from the expected remittance layout.',
          details: (payload as any)?.debug || null,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        payer: (payload as any)?.payer || 'Health Net',
        summary: (payload as any)?.summary || null,
        rows,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

