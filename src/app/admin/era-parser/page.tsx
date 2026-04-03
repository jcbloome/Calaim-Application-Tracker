'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { storage } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Loader2, FileUp, Download, FileText, FolderOpen } from 'lucide-react';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';

type ExtractedPagesResult = {
  totalLines: number;
  pagesCount: number;
  payer?: string;
  summary?: EraSummary | null;
  rows?: EraRow[];
};

type EraRow = {
  payer?: string;
  remittance_date?: string | null;
  page?: number;
  member_name?: string;
  hic?: string | null;
  medi_cal_number?: string | null;
  acnt?: string | null;
  icn?: string | null;
  proc?: string;
  service_from?: string | null;
  service_to?: string | null;
  billed?: number | null;
  allowed?: number | null;
  paid?: number | null;
  source_line?: string;
};

type EraSummary = {
  total_rows?: number;
  t2038?: { rows?: number; members?: number; total_paid?: number };
  h2022?: { rows?: number; members?: number; total_paid?: number };
  era_grand_total?: number | null;
  parser_total?: number | null;
  variance?: number | null;
};

type EraCacheHistoryItem = {
  cacheKey: string;
  fileName: string;
  sourceMode: string;
  totalRows: number;
  payer?: string;
  summary?: EraSummary | null;
  updatedAt?: { _seconds?: number; seconds?: number } | string | null;
};

type EraHistoryLookupBatch = {
  cacheKey: string;
  fileName: string;
  sourceMode: string;
  payer: string;
  totalRows: number;
  updatedAt?: { _seconds?: number; seconds?: number } | string | null;
  matchedRows: number;
  matchedMembers: number;
  totalPaid: number;
  sampleRows: EraRow[];
};

type ParsePhase = 'idle' | 'loading_pdfjs' | 'opening_pdf' | 'extracting' | 'uploading' | 'parsing' | 'done';
type ExtractProgress = { currentPage: number; totalPages: number; startedAtMs: number; avgMsPerPage: number };
type OpenProgress = { loaded: number; total: number; startedAtMs: number };
type UploadProgress = { transferred: number; total: number };

const getErrCode = (e: any) => String(e?.code || e?.details?.code || e?.cause?.code || '').toLowerCase();

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

let _pdfJsPromise: Promise<any> | null = null;
const loadPdfJs = async () => {
  if (_pdfJsPromise) return _pdfJsPromise;
  // Load pdf.js via CDN to avoid Next/webpack bundling issues that can cause:
  // "Object.defineProperty called on non-object"
  // (jsdelivr serves proper CORS headers for module imports)
  _pdfJsPromise = import(
    /* webpackIgnore: true */
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.min.mjs'
  ).then((mod: any) => {
    const pdfjs = mod?.getDocument ? mod : mod?.default || mod;
    // Newer pdf.js versions require a workerSrc when workers are enabled.
    // Even when we pass disableWorker in getDocument, some builds still touch PDFWorker.
    try {
      if (pdfjs?.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.worker.min.mjs';
      }
    } catch {
      // ignore
    }
    return pdfjs;
  });
  return _pdfJsPromise;
};

// Capture amounts like 123.45, 5693.46, 1,234.56, -123.45, or (123.45)
const AMOUNT_RE = /(?<!\d)(-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}|\((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\))(?!\d)/g;
// Support PROC values with or without separator before modifiers (e.g. "T2038 U5" or "T2038U5")
const PROC_RE = /\b(H2022|T2038)(?:\b|(?=[A-Z0-9]))/i;

const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
};

const phaseLabel = (p: ParsePhase) => {
  switch (p) {
    case 'loading_pdfjs':
      return 'Loading PDF engine…';
    case 'opening_pdf':
      return 'Opening PDF…';
    case 'extracting':
      return 'Extracting text…';
    case 'uploading':
      return 'Uploading PDF…';
    case 'parsing':
      return 'Parsing (fast server mode)…';
    case 'done':
      return 'Done';
    default:
      return 'Ready';
  }
};

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

const toNum = (v?: string | null) => {
  if (!v) return null;
  const raw = String(v).trim();
  const isParen = raw.startsWith('(') && raw.endsWith(')');
  const cleaned = raw.replace(/[(),]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return isParen ? -Math.abs(n) : n;
};

const extractAmountsFromLine = (line: string) =>
  Array.from(String(line || '').matchAll(AMOUNT_RE))
    .map((mm) => mm?.[1])
    .filter(Boolean)
    .map((v) => String(v));

const gatherAmounts = (lines: string[], idx: number) => {
  const first = extractAmountsFromLine(lines[idx] || '');
  if (first.length >= 3) return first.slice(0, 6);

  const out: string[] = [...first];
  const stopLine = (ln: string) =>
    /^\s*NAME\b/i.test(ln) ||
    PROC_RE.test(ln) ||
    /^\s*PT\s*RESP\b/i.test(ln) ||
    /\bCLAIM\s+TOTALS\b/i.test(ln) ||
    /^\s*ADJ\s+TO\s+TOTAL\b/i.test(ln) ||
    /^\s*STATUS\s+CODE\b/i.test(ln) ||
    /\bINTEREST\b/i.test(ln) ||
    /\bLATE\s+FILING\b/i.test(ln);

  for (let j = idx + 1; j < Math.min(lines.length, idx + 8); j++) {
    const ln = String(lines[j] || '');
    if (stopLine(ln)) break;
    const more = extractAmountsFromLine(ln);
    if (!more.length) continue;
    out.push(...more);
    if (out.length >= 3) break;
  }
  return out.slice(0, 6);
};

const pickPaid = (amounts: string[]) => {
  if (!amounts.length) return null;
  const nums = amounts.map((a) => toNum(a));
  const last = nums[nums.length - 1];
  const third = nums.length >= 3 ? nums[2] : null;
  // Health Net often prints NET as the last amount; the 3rd amount can be 0.00.
  if ((last === null || last === 0) && typeof third === 'number' && third !== 0) return third;
  return typeof last === 'number' ? last : null;
};

const parseEraGrandTotalFromLines = (lines: string[]) => {
  for (let i = 0; i < lines.length; i++) {
    const ln = String(lines[i] || '');
    if (!/\bTOTALS:\b/i.test(ln)) continue;
    for (let j = i; j < Math.min(lines.length, i + 8); j++) {
      const amounts = extractAmountsFromLine(lines[j] || '');
      if (amounts.length < 3) continue;
      const nums = amounts.map((a) => toNum(a)).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      if (!nums.length) continue;
      // Footer grand total/check amount is typically the last amount on the totals numeric row.
      return nums[nums.length - 1];
    }
  }
  return null as number | null;
};

const toCsv = (rows: EraRow[]) => {
  const header = [
    'payer',
    'remittance_date',
    'page',
    'member_name',
    'hic',
    'acnt',
    'icn',
    'proc',
    'service_from',
    'service_to',
    'billed',
    'allowed',
    'paid',
    'source_line',
  ];
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(header.map((k) => esc((r as any)[k])).join(','));
  }
  return lines.join('\n');
};

export default function EraParserPage() {
  const router = useRouter();
  const { isSuperAdmin, isLoading } = useAdmin();
  const auth = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [localPdfPath, setLocalPdfPath] = useState('');
  const [localPathPickHint, setLocalPathPickHint] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [fastFallbackNotice, setFastFallbackNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<EraRow[]>([]);
  const [summary, setSummary] = useState<EraSummary | null>(null);
  const [payer, setPayer] = useState<string>('Health Net');
  const [resultsSearch, setResultsSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'zero' | 'negative'>('all');
  const [batchLookupQuery, setBatchLookupQuery] = useState('');
  const [historyLookupQuery, setHistoryLookupQuery] = useState('');
  const [historyLookupLoading, setHistoryLookupLoading] = useState(false);
  const [historyLookupResults, setHistoryLookupResults] = useState<EraHistoryLookupBatch[]>([]);
  const [historyLookupSearchedBatches, setHistoryLookupSearchedBatches] = useState(0);
  const [phase, setPhase] = useState<ParsePhase>('idle');
  const [extractProgress, setExtractProgress] = useState<ExtractProgress | null>(null);
  const [openProgress, setOpenProgress] = useState<OpenProgress | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [lastExtracted, setLastExtracted] = useState<ExtractedPagesResult | null>(null);
  const [cacheHistory, setCacheHistory] = useState<EraCacheHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [progressTick, setProgressTick] = useState(0);
  const localPathPickerRef = useRef<HTMLInputElement | null>(null);

  // Used to re-render elapsed time during long "Opening PDF..." work where pdf.js provides no byte progress.
  void progressTick;

  useEffect(() => {
    if (!uploading) return;
    const id = window.setInterval(() => setProgressTick((v) => v + 1), 500);
    return () => window.clearInterval(id);
  }, [uploading]);

  // Preload pdf.js engine early so the first parse feels snappy.
  useEffect(() => {
    if (!isSuperAdmin || isLoading) return;
    loadPdfJs().catch(() => undefined);
  }, [isSuperAdmin, isLoading]);

  const totalMembers = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const key = String(r.acnt || '').trim() || String(r.member_name || '').trim();
      if (key) s.add(key);
    }
    return s.size;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = String(resultsSearch || '').trim().toLowerCase();
    const applyPaymentFilter = (list: EraRow[]) => {
      if (paymentFilter === 'all') return list;
      return list.filter((r) => {
        const paid = typeof r.paid === 'number' && Number.isFinite(r.paid) ? r.paid : null;
        if (paymentFilter === 'zero') return paid === 0;
        if (paymentFilter === 'negative') return typeof paid === 'number' && paid < 0;
        return true;
      });
    };
    if (!q) return applyPaymentFilter(rows);
    const qToken = normalizeLookupToken(q);
    const qName = normalizeNameForLookup(q);
    const qNameTokens = qName.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
    const base = rows.filter((r) => {
      const member = String(r.member_name || '').toLowerCase().trim();
      const memberNormalized = normalizeNameForLookup(member);
      const memberToken = normalizeLookupToken(member);
      const acnt = String(r.acnt || '').toLowerCase().trim();
      const acntToken = normalizeLookupToken(acnt);
      const icn = String(r.icn || '').toLowerCase().trim();
      const icnToken = normalizeLookupToken(icn);
      const hic = String(r.hic || '').toLowerCase().trim();
      const hicToken = normalizeLookupToken(hic);
      const nameMatchesByTokens =
        qNameTokens.length > 0 &&
        qNameTokens.every((tok) => memberNormalized.includes(tok) || memberToken.includes(normalizeLookupToken(tok)));

      return (
        member.includes(q) ||
        acnt.includes(q) ||
        hic.includes(q) ||
        icn.includes(q) ||
        (qToken
          ? memberToken.includes(qToken) || acntToken.includes(qToken) || hicToken.includes(qToken) || icnToken.includes(qToken)
          : false) ||
        nameMatchesByTokens
      );
    });
    return applyPaymentFilter(base);
  }, [rows, resultsSearch, paymentFilter]);

  const batchLookup = useMemo(() => {
    const rawQuery = String(batchLookupQuery || '').trim();
    const qText = rawQuery.toLowerCase();
    const qToken = normalizeLookupToken(rawQuery);
    const qName = normalizeNameForLookup(rawQuery);
    const qNameTokens = qName.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
    if (!rawQuery) {
      return {
        query: rawQuery,
        matchedRows: [] as EraRow[],
        matchedMembers: 0,
        totalPaid: 0,
        hasPositivePayment: false,
      };
    }

    const matchedRows = rows.filter((r) => {
      const member = String(r.member_name || '').toLowerCase().trim();
      const memberNormalized = normalizeNameForLookup(member);
      const memberToken = normalizeLookupToken(member);
      const clientId2 = String(r.acnt || '').toLowerCase().trim();
      const clientId2Token = normalizeLookupToken(clientId2);
      const icn = String(r.icn || '').toLowerCase().trim();
      const icnToken = normalizeLookupToken(icn);
      const hic = String(r.hic || '').toLowerCase().trim();
      const hicToken = normalizeLookupToken(hic);

      const nameMatchDirect = member.includes(qText) || memberNormalized.includes(qName);
      const nameMatchByTokens =
        qNameTokens.length > 0 &&
        qNameTokens.every((tok) => memberNormalized.includes(tok) || memberToken.includes(normalizeLookupToken(tok)));
      const idMatch = qToken
        ? hicToken.includes(qToken) || clientId2Token.includes(qToken) || icnToken.includes(qToken)
        : false;
      const textMatch = hic.includes(qText) || clientId2.includes(qText) || icn.includes(qText);
      return nameMatchDirect || nameMatchByTokens || idMatch || textMatch;
    });

    const matchedMemberKeys = new Set<string>();
    let totalPaid = 0;
    let hasPositivePayment = false;
    for (const row of matchedRows) {
      const key = String(row.acnt || '').trim() || String(row.member_name || '').trim();
      if (key) matchedMemberKeys.add(key);
      if (typeof row.paid === 'number' && Number.isFinite(row.paid)) {
        totalPaid += row.paid;
        if (row.paid > 0) hasPositivePayment = true;
      }
    }

    return {
      query: rawQuery,
      matchedRows,
      matchedMembers: matchedMemberKeys.size,
      totalPaid: Number(totalPaid.toFixed(2)),
      hasPositivePayment,
    };
  }, [batchLookupQuery, rows]);

  const historyLookupPaidAnywhere = useMemo(() => {
    if (!historyLookupQuery.trim()) return null;
    if (historyLookupLoading) return null;
    if (historyLookupResults.length === 0) return false;
    return historyLookupResults.some((b) => Number(b.totalPaid || 0) > 0);
  }, [historyLookupLoading, historyLookupQuery, historyLookupResults]);

  const uploadPdfToTempStorage = async (pdfFile: File) => {
    if (!auth?.currentUser?.uid) throw new Error('Not signed in.');
    const uid = auth.currentUser.uid;
    const safeName = String(pdfFile.name || 'era.pdf').replace(/[^\w.\-]+/g, '_').slice(0, 80);
    const fullPath = `era_parser_uploads/${uid}/${Date.now()}_${safeName}`;
    const refObj = storageRef(storage, fullPath);
    const task = uploadBytesResumable(refObj, pdfFile, { contentType: 'application/pdf' });

    setPhase('uploading');
    setUploadProgress({ transferred: 0, total: pdfFile.size || 0 });

    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => setUploadProgress({ transferred: snap.bytesTransferred, total: snap.totalBytes }),
        (err) => reject(err),
        () => resolve()
      );
    });
    const url = await getDownloadURL(refObj);
    return { fullPath, url };
  };

  const extractPages = async (pdfUrl: string): Promise<ExtractedPagesResult> => {
    setPhase('loading_pdfjs');
    const pdfjs: any = await loadPdfJs();
    setPhase('opening_pdf');
    const openStartedAtMs = Date.now();
    setOpenProgress({ loaded: 0, total: 0, startedAtMs: openStartedAtMs });

    let pdf: any;
    try {
      // Open via HTTPS URL so pdf.js can use range requests and caching.
      const loadingTask = pdfjs.getDocument({
        url: pdfUrl,
        disableRange: false,
        disableStream: false,
        disableAutoFetch: false,
      });
      try {
        loadingTask.onProgress = (p: any) => {
          const loaded = Number(p?.loaded || 0);
          const total = Number(p?.total || 0);
          setOpenProgress({ loaded, total, startedAtMs: openStartedAtMs });
        };
      } catch {
        // ignore
      }
      pdf = await loadingTask.promise;
    } finally {
      setOpenProgress(null);
    }
    let totalLines = 0;
    const startedAtMs = Date.now();
    setExtractProgress({ currentPage: 0, totalPages: pdf.numPages, startedAtMs, avgMsPerPage: 0 });

    // Incremental parsing accumulators
    const payerLocal = 'Health Net';
    let t2038Paid = 0;
    let h2022Paid = 0;
    let t2038Rows = 0;
    let h2022Rows = 0;
    const membersT2038 = new Set<string>();
    const membersH2022 = new Set<string>();
    let eraGrandTotal: number | null = null;
    const parsedRowsAcc: EraRow[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      setPhase('extracting');
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
      totalLines += lines.length;
      const pageGrandTotal = parseEraGrandTotalFromLines(lines);
      if (typeof pageGrandTotal === 'number' && Number.isFinite(pageGrandTotal)) {
        eraGrandTotal = pageGrandTotal;
      }

      // Parse this page immediately and append results to the table + summary.
      const remittance_date = parseRemitDate(lines);
      let current = {
        member_name: '',
        hic: null as string | null,
        medi: null as string | null,
        acnt: null as string | null,
        icn: null as string | null,
      };
      const pageRows: EraRow[] = [];

      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (/^\s*NAME\b/i.test(ln)) {
          const parsed = extractNameHicAcntIcn(ln);
          current = {
            member_name: parsed.name || '',
            hic: parsed.hic,
            medi: parsed.medi,
            acnt: parsed.acnt,
            icn: parsed.icn,
          };
          continue;
        }
        const m = ln.match(PROC_RE);
        if (!m?.[1]) continue;
        const proc = String(m[1]).toUpperCase();
        if (proc !== 'H2022' && proc !== 'T2038') continue;

        const amounts = gatherAmounts(lines, i);
        const billed = amounts.length >= 1 ? toNum(amounts[0]) : null;
        const allowed = amounts.length >= 2 ? toNum(amounts[1]) : null;
        const paid = pickPaid(amounts);

        const svc = parseServiceDatesFromProcLine(ln, remittance_date);

        pageRows.push({
          payer: payerLocal,
          remittance_date,
          page: pageNum,
          member_name: String(current.member_name || '').trim(),
          hic: current.hic,
          medi_cal_number: current.medi,
          acnt: current.acnt,
          icn: current.icn,
          proc: proc as any,
          service_from: svc.service_from,
          service_to: svc.service_to,
          billed,
          allowed,
          paid,
          source_line: [lines[i], lines[i + 1], lines[i + 2]].filter(Boolean).join(' | '),
        });
      }

      if (pageRows.length) {
        parsedRowsAcc.push(...pageRows);
        for (const r of pageRows) {
          const memberKey = String(r.acnt || '').trim() || String(r.member_name || '').trim();
          if (r.proc === 'T2038') {
            t2038Rows += 1;
            if (typeof r.paid === 'number' && Number.isFinite(r.paid)) t2038Paid += r.paid;
            if (memberKey) membersT2038.add(memberKey);
          } else if (r.proc === 'H2022') {
            h2022Rows += 1;
            if (typeof r.paid === 'number' && Number.isFinite(r.paid)) h2022Paid += r.paid;
            if (memberKey) membersH2022.add(memberKey);
          }
        }
        setPayer(payerLocal);
        setRows((prev) => prev.concat(pageRows));
        setSummary({
          total_rows: t2038Rows + h2022Rows,
          t2038: { rows: t2038Rows, members: membersT2038.size, total_paid: Number(t2038Paid.toFixed(2)) },
          h2022: { rows: h2022Rows, members: membersH2022.size, total_paid: Number(h2022Paid.toFixed(2)) },
          era_grand_total: eraGrandTotal,
          parser_total: Number((t2038Paid + h2022Paid).toFixed(2)),
          variance:
            typeof eraGrandTotal === 'number'
              ? Number(((t2038Paid + h2022Paid) - eraGrandTotal).toFixed(2))
              : null,
        });
      }

      const elapsed = Date.now() - startedAtMs;
      const avgMsPerPage = elapsed / pageNum;
      setExtractProgress({ currentPage: pageNum, totalPages: pdf.numPages, startedAtMs, avgMsPerPage });
      // Yield to keep the UI responsive for long PDFs.
      await new Promise((r) => setTimeout(r, 0));
    }

    const finalSummary: EraSummary = {
      total_rows: t2038Rows + h2022Rows,
      t2038: { rows: t2038Rows, members: membersT2038.size, total_paid: Number(t2038Paid.toFixed(2)) },
      h2022: { rows: h2022Rows, members: membersH2022.size, total_paid: Number(h2022Paid.toFixed(2)) },
      era_grand_total: eraGrandTotal,
      parser_total: Number((t2038Paid + h2022Paid).toFixed(2)),
      variance: typeof eraGrandTotal === 'number' ? Number(((t2038Paid + h2022Paid) - eraGrandTotal).toFixed(2)) : null,
    };
    const result: ExtractedPagesResult = {
      totalLines,
      pagesCount: pdf.numPages,
      payer: payerLocal,
      summary: finalSummary,
      rows: parsedRowsAcc,
    };
    setLastExtracted(result);
    setExtractProgress(null);
    return result;
  };

  const extractPagesFromFile = async (pdfFile: File) => {
    // Fallback path when Storage upload is blocked by rules.
    const objectUrl = URL.createObjectURL(pdfFile);
    try {
      return await extractPages(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) router.replace('/admin');
  }, [isLoading, isSuperAdmin, router]);

  const parsedAtLabel = useMemo(() => new Date().toLocaleString(), []);

  const formatCacheTimestamp = (value: EraCacheHistoryItem['updatedAt']) => {
    if (!value) return 'Unknown date';
    if (typeof value === 'string') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleString();
    }
    const seconds = Number((value as any)?._seconds ?? (value as any)?.seconds ?? NaN);
    if (!Number.isFinite(seconds) || seconds <= 0) return 'Unknown date';
    return new Date(seconds * 1000).toLocaleString();
  };

  const toCacheKeyFromFile = (f: File | null) => {
    if (!f) return null;
    return `file:${String(f.name || '').toLowerCase()}|${Number(f.size || 0)}|${Number(f.lastModified || 0)}`;
  };

  const toCacheKeyFromPath = (p: string) => {
    const v = String(p || '').trim().toLowerCase();
    if (!v) return null;
    return `path:${v}`;
  };

  const fetchCacheHistory = useCallback(async () => {
    if (!auth?.currentUser) return;
    setHistoryLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/era/parse?limit=25', {
        method: 'GET',
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (res.ok && data?.success) {
        setCacheHistory(Array.isArray(data?.history) ? data.history : []);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [auth]);

  const tryLoadFromCache = async (cacheKey: string | null) => {
    if (!cacheKey || !auth?.currentUser) return false;
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch(`/api/admin/era/parse?cacheKey=${encodeURIComponent(cacheKey)}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${idToken}` },
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !data?.success) return false;
    setPayer(String(data?.payer || 'Health Net'));
    setRows(Array.isArray(data?.rows) ? data.rows : []);
    setSummary((data?.summary || null) as EraSummary | null);
    return true;
  };

  const saveToCache = async (payload: {
    cacheKey: string | null;
    fileName: string;
    sourceMode: 'fast' | 'local' | 'local_path';
    fileSize?: number | null;
    fileLastModified?: number | null;
    payer: string;
    summary: EraSummary | null;
    rows: EraRow[];
  }) => {
    if (!payload.cacheKey || !auth?.currentUser || payload.rows.length === 0) return;
    const idToken = await auth.currentUser.getIdToken();
    await fetch('/api/admin/era/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        action: 'save_cache',
        cacheKey: payload.cacheKey,
        fileName: payload.fileName,
        sourceMode: payload.sourceMode,
        fileSize: payload.fileSize ?? null,
        fileLastModified: payload.fileLastModified ?? null,
        payer: payload.payer,
        summary: payload.summary,
        rows: payload.rows,
      }),
    }).catch(() => undefined);
  };

  useEffect(() => {
    if (!auth?.currentUser) return;
    fetchCacheHistory().catch(() => undefined);
  }, [auth?.currentUser, fetchCacheHistory]);

  const downloadCsv = () => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `era_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleParseLocal = async () => {
    if (!file) return;
    if (!auth?.currentUser) return;
    setUploading(true);
    setError(null);
    setErrorDetails(null);
    setRows([]);
    setSummary(null);
    setPhase('idle');
    setOpenProgress(null);
    setUploadProgress(null);
    setLastExtracted(null);
    try {
      const cacheKey = toCacheKeyFromFile(file);
      const loadedFromCache = await tryLoadFromCache(cacheKey);
      if (loadedFromCache) {
        setPhase('done');
        return;
      }
      // Local parsing (slow for large PDFs)
      const extracted = await extractPagesFromFile(file);
      if (!extracted.pagesCount || extracted.totalLines === 0) {
        throw new Error('No selectable text was found in this PDF (it may be scanned).');
      }
      await saveToCache({
        cacheKey,
        fileName: String(file?.name || 'ERA PDF'),
        sourceMode: 'local',
        fileSize: Number(file?.size || 0),
        fileLastModified: Number(file?.lastModified || 0),
        payer: String(extracted.payer || payer || 'Health Net'),
        summary: (extracted.summary || summary) as EraSummary | null,
        rows: Array.isArray(extracted.rows) ? extracted.rows : rows,
      });
      await fetchCacheHistory();
      setPhase('done');
    } catch (e: any) {
      setError(e?.message || 'Failed to parse ERA PDF.');
      const detail = String(e?.stack || e?.cause || '').trim();
      if (detail) setErrorDetails(detail.slice(0, 4000));
      setPhase('idle');
    } finally {
      setUploading(false);
    }
  };

  const handleParse = async () => {
    if (!file) return;
    if (!auth?.currentUser) return;
    setUploading(true);
    setError(null);
    setErrorDetails(null);
    setFastFallbackNotice(null);
    setRows([]);
    setSummary(null);
    setPhase('idle');
    setOpenProgress(null);
    setUploadProgress(null);
    setLastExtracted(null);
    try {
      const cacheKey = toCacheKeyFromFile(file);
      const loadedFromCache = await tryLoadFromCache(cacheKey);
      if (loadedFromCache) {
        setPhase('done');
        return;
      }
      let cleanupPath: string | null = null;
      try {
        const uploaded = await uploadPdfToTempStorage(file);
        cleanupPath = uploaded.fullPath;
      } catch (e: any) {
        const code = getErrCode(e);
        if (code.includes('storage/unauthorized') || code.includes('unauthorized')) throw e;
        throw e;
      } finally {
        setUploadProgress(null);
      }

      setPhase('parsing');
      if (cleanupPath) {
        // Prefer server-side parsing for large PDFs (fastest + avoids browser "Opening PDF..." stalls).
        const fn = httpsCallable(getFunctions(), 'parseEraPdfFromStorage');
        const data: any = await fn({ fullPath: cleanupPath }).then((r) => r.data);
        if (!data?.success) throw new Error(String(data?.error || 'Server parse failed.'));
        const parsedPayer = String(data?.payer || 'Health Net');
        const parsedRows = Array.isArray(data?.rows) ? data.rows : [];
        const parsedSummary = (data?.summary || null) as EraSummary | null;
        setPayer(parsedPayer);
        setRows(parsedRows);
        setSummary(parsedSummary);
        await saveToCache({
          cacheKey,
          fileName: String(file?.name || 'ERA PDF'),
          sourceMode: 'fast',
          fileSize: Number(file?.size || 0),
          fileLastModified: Number(file?.lastModified || 0),
          payer: parsedPayer,
          summary: parsedSummary,
          rows: parsedRows,
        });
        await fetchCacheHistory();
        // Best-effort cleanup (ignore failures due to rules).
        deleteObject(storageRef(storage, cleanupPath)).catch(() => undefined);
      } else {
        // Fallback: local parsing (may be slow on very large PDFs)
        const extracted = await extractPagesFromFile(file);
        if (!extracted.pagesCount || extracted.totalLines === 0) {
          throw new Error('No selectable text was found in this PDF (it may be scanned).');
        }
        await saveToCache({
          cacheKey,
          fileName: String(file?.name || 'ERA PDF'),
          sourceMode: 'local',
          fileSize: Number(file?.size || 0),
          fileLastModified: Number(file?.lastModified || 0),
          payer: String(extracted.payer || payer || 'Health Net'),
          summary: (extracted.summary || summary) as EraSummary | null,
          rows: Array.isArray(extracted.rows) ? extracted.rows : rows,
        });
        await fetchCacheHistory();
      }
      setPhase('done');
    } catch (e: any) {
      const code = getErrCode(e);
      // Auto-fallback so "fast" still completes when cloud/storage setup is missing.
      try {
        if (file) {
          const extracted = await extractPagesFromFile(file);
          if (!extracted.pagesCount || extracted.totalLines === 0) {
            throw new Error('No selectable text was found in this PDF (it may be scanned).');
          }
          const cacheKey = toCacheKeyFromFile(file);
          await saveToCache({
            cacheKey,
            fileName: String(file?.name || 'ERA PDF'),
            sourceMode: 'local',
            fileSize: Number(file?.size || 0),
            fileLastModified: Number(file?.lastModified || 0),
            payer: String(extracted.payer || payer || 'Health Net'),
            summary: (extracted.summary || summary) as EraSummary | null,
            rows: Array.isArray(extracted.rows) ? extracted.rows : rows,
          });
          await fetchCacheHistory();
          setError(null);
          setErrorDetails(null);
          setFastFallbackNotice(
            'Fast parser was unavailable, so this file was parsed locally (slow) automatically. You can still use results normally.'
          );
          setPhase('done');
          return;
        }
      } catch (fallbackErr: any) {
        const detail = `Fast parse error: ${String(e?.message || e)}\n\nLocal fallback error: ${String(
          fallbackErr?.message || fallbackErr
        )}`;
        setError('Fast parser failed and local fallback also failed.');
        setErrorDetails(detail.slice(0, 4000));
        setPhase('idle');
        return;
      }
      if (code.includes('storage/unauthorized') || code.includes('unauthorized')) {
        setError('Fast mode blocked: Storage rules not deployed (storage/unauthorized).');
        setErrorDetails(
          'Run:\n  firebase deploy --only storage\n\nThen refresh and try “Parse ERA (fast)” again.\n\nOr click “Parse locally (slow)”.'
        );
      } else if (code.includes('functions/not-found') || code.includes('not-found')) {
        setError('Fast mode unavailable: Cloud Function not deployed yet (functions/not-found).');
        setErrorDetails('Run:\n  cd functions\n  firebase deploy --only functions\n\nThen refresh and try again.');
      } else if (code.includes('functions/unavailable') || code.includes('unavailable')) {
        setError('Fast mode unavailable: Cloud Function unreachable (functions/unavailable).');
        setErrorDetails('Check Functions deploy/status, then try again.');
      } else {
        setError(e?.message || 'Failed to parse ERA PDF.');
        const detail = String(e?.stack || e?.cause || '').trim();
        if (detail) setErrorDetails(detail.slice(0, 4000));
      }
      setPhase('idle');
    } finally {
      setUploading(false);
    }
  };

  const handleParseFromPath = async () => {
    if (!localPdfPath.trim()) return;
    if (!auth?.currentUser) return;
    setUploading(true);
    setError(null);
    setErrorDetails(null);
    setRows([]);
    setSummary(null);
    setPhase('parsing');
    setOpenProgress(null);
    setUploadProgress(null);
    setLastExtracted(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const cacheKey = toCacheKeyFromPath(localPdfPath);
      const res = await fetch('/api/admin/era/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          pdfPath: localPdfPath.trim(),
          cacheKey,
          sourceMode: 'local_path',
          fileName: localPdfPath.split(/[\\/]/).pop() || 'ERA PDF',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to parse local pdfPath (HTTP ${res.status}).`);
      }
      setPayer(String(data?.payer || 'Health Net'));
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setSummary((data?.summary || null) as any);
      await fetchCacheHistory();
      setPhase('done');
    } catch (e: any) {
      setError(e?.message || 'Failed to parse local pdf path.');
      const detail = String(e?.stack || e?.cause || '').trim();
      if (detail) setErrorDetails(detail.slice(0, 4000));
      setPhase('idle');
    } finally {
      setUploading(false);
    }
  };

  const handlePickFileForLocalPath = (pickedFile: File | null) => {
    if (!pickedFile) return;
    const nativePath = String((pickedFile as any)?.path || '').trim();
    if (nativePath) {
      setLocalPdfPath(nativePath);
      setFile(pickedFile);
      setLocalPathPickHint(`Selected: ${nativePath}`);
      return;
    }
    // Some browsers hide native file paths for security. Keep the file selected for local parsing fallback.
    setFile(pickedFile);
    setLocalPathPickHint(
      'This browser does not expose full local paths. Use "Parse locally (slow)" with the selected file, or paste full path manually.'
    );
  };

  const loadFromHistory = async (cacheKey: string) => {
    if (uploading) return;
    setUploading(true);
    setError(null);
    setErrorDetails(null);
    setPhase('parsing');
    try {
      const loaded = await tryLoadFromCache(cacheKey);
      if (!loaded) throw new Error('Could not load cached ERA parse.');
      setPhase('done');
    } catch (e: any) {
      setError(e?.message || 'Failed to load cached ERA parse.');
      setPhase('idle');
    } finally {
      setUploading(false);
    }
  };

  const runHistoryLookup = async () => {
    const q = String(historyLookupQuery || '').trim();
    if (!q || !auth?.currentUser) {
      setHistoryLookupResults([]);
      setHistoryLookupSearchedBatches(0);
      return;
    }
    setHistoryLookupLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/era/parse?lookup=${encodeURIComponent(q)}&limit=50`, {
        method: 'GET',
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Lookup failed (HTTP ${res.status})`);
      }
      setHistoryLookupResults(Array.isArray(data?.batches) ? (data.batches as EraHistoryLookupBatch[]) : []);
      setHistoryLookupSearchedBatches(Number(data?.searchedBatches || 0));
    } catch (e: any) {
      setHistoryLookupResults([]);
      setHistoryLookupSearchedBatches(0);
      setError(e?.message || 'Failed to search saved ERA batches.');
    } finally {
      setHistoryLookupLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            ERA Parser (Health Net)
          </CardTitle>
          <CardDescription>
            Upload a Health Net “Remittance Advice” PDF and extract H2022/T2038 lines for Caspio export.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Parse failed</AlertTitle>
              <AlertDescription className="space-y-2">
                <div>{error}</div>
                {errorDetails ? (
                  <pre className="max-h-40 overflow-auto rounded-md bg-white/60 p-2 text-xs whitespace-pre-wrap">
                    {errorDetails}
                  </pre>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          {fastFallbackNotice ? (
            <Alert>
              <AlertTitle>Fast parser fallback used</AlertTitle>
              <AlertDescription>{fastFallbackNotice}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <div className="text-sm font-medium">ERA PDF</div>
              <Input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="text-xs text-muted-foreground">
                Best results when the PDF has selectable text (not a scanned image).
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium">Or parse by local file path (dev)</div>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={localPdfPath}
                    onChange={(e) => setLocalPdfPath(e.target.value)}
                    placeholder="C:\\Users\\...\\era_*.pdf"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => localPathPickerRef.current?.click()}
                    disabled={uploading}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Select File
                  </Button>
                  <input
                    ref={localPathPickerRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => handlePickFileForLocalPath(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Use this for local debug when Python is unavailable. Works only in local development.
                </div>
                {localPathPickHint ? (
                  <div className="text-[11px] text-muted-foreground">{localPathPickHint}</div>
                ) : null}
              </div>
              {uploading ? (
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">{phaseLabel(phase)}</div>
                    {extractProgress ? (
                      <div className="tabular-nums">
                        Page {extractProgress.currentPage}/{extractProgress.totalPages}
                        {extractProgress.avgMsPerPage > 0 && extractProgress.currentPage > 0 ? (
                          <>
                            {' '}
                            • ETA{' '}
                            {formatDuration(
                              (extractProgress.totalPages - extractProgress.currentPage) * extractProgress.avgMsPerPage
                            )}
                          </>
                        ) : null}
                      </div>
                    ) : openProgress && phase === 'opening_pdf' ? (
                      <div className="tabular-nums">
                        {openProgress.total > 0 ? (
                          <>
                            {Math.round((openProgress.loaded / Math.max(1, openProgress.total)) * 100)}% •{' '}
                            {(openProgress.loaded / (1024 * 1024)).toFixed(1)}MB /{' '}
                            {(openProgress.total / (1024 * 1024)).toFixed(1)}MB
                          </>
                        ) : (
                          <>Elapsed {formatDuration(Date.now() - openProgress.startedAtMs)} • Still opening…</>
                        )}
                      </div>
                    ) : uploadProgress && phase === 'uploading' ? (
                      <div className="tabular-nums">
                        {uploadProgress.total > 0
                          ? `${Math.round((uploadProgress.transferred / Math.max(1, uploadProgress.total)) * 100)}% • ${(
                              uploadProgress.transferred /
                              (1024 * 1024)
                            ).toFixed(1)}MB / ${(uploadProgress.total / (1024 * 1024)).toFixed(1)}MB`
                          : `${(uploadProgress.transferred / (1024 * 1024)).toFixed(1)}MB uploaded`}
                      </div>
                    ) : lastExtracted ? (
                      <div className="tabular-nums">
                        Extracted {lastExtracted.pagesCount} pages • {lastExtracted.totalLines} lines
                      </div>
                    ) : null}
                  </div>
                  <Progress
                    value={
                      extractProgress
                        ? Math.round((extractProgress.currentPage / Math.max(1, extractProgress.totalPages)) * 100)
                        : openProgress && phase === 'opening_pdf'
                          ? openProgress.total > 0
                            ? Math.round((openProgress.loaded / Math.max(1, openProgress.total)) * 100)
                            : 100
                        : uploadProgress && phase === 'uploading'
                          ? Math.round((uploadProgress.transferred / Math.max(1, uploadProgress.total)) * 100)
                        : phase === 'uploading'
                          ? 92
                          : phase === 'parsing'
                            ? 96
                            : 0
                    }
                    className={`h-2 ${openProgress && phase === 'opening_pdf' && openProgress.total === 0 ? 'animate-pulse' : ''}`}
                  />
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button onClick={handleParse} disabled={!file || uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                {uploading ? phaseLabel(phase) : 'Parse ERA (fast)'}
              </Button>
              <Button variant="outline" onClick={handleParseLocal} disabled={!file || uploading}>
                Parse locally (slow)
              </Button>
              <Button variant="outline" onClick={handleParseFromPath} disabled={!localPdfPath.trim() || uploading}>
                Parse local path (dev)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              Parsed {payer} ERA at {parsedAtLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">T2038 payments (total paid)</div>
              <div className="text-2xl font-semibold">${Number(summary?.t2038?.total_paid || 0).toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {summary?.t2038?.rows || 0} payments • {summary?.t2038?.members || 0} members
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">H2022 payments (total paid)</div>
              <div className="text-2xl font-semibold">${Number(summary?.h2022?.total_paid || 0).toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {summary?.h2022?.rows || 0} payments • {summary?.h2022?.members || 0} members
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Total payments (T2038 + H2022)</div>
              <div className="text-2xl font-semibold">
                $
                {(
                  Number(summary?.t2038?.total_paid || 0) + Number(summary?.h2022?.total_paid || 0)
                ).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                {summary?.total_rows || rows.length} payments • H2022 + T2038 only
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Total unique members</div>
              <div className="text-2xl font-semibold">{totalMembers}</div>
              <div className="text-xs text-muted-foreground">Deduped by ACNT (fallback: member name)</div>
            </div>
          </CardContent>
          <CardContent className="pt-0">
            {typeof summary?.era_grand_total === 'number' ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">ERA footer cross-check</div>
                <div className="text-muted-foreground">
                  ERA grand total: <span className="font-medium text-foreground">${Number(summary.era_grand_total).toFixed(2)}</span>
                  {' • '}
                  Parsed total: <span className="font-medium text-foreground">${Number(summary.parser_total || 0).toFixed(2)}</span>
                  {' • '}
                  Variance:{' '}
                  <span
                    className={
                      Math.abs(Number(summary.variance || 0)) <= 0.01 ? 'font-medium text-green-700' : 'font-medium text-amber-700'
                    }
                  >
                    ${Number(summary.variance || 0).toFixed(2)}
                  </span>
                  {' • '}
                  <span className={Math.abs(Number(summary.variance || 0)) <= 0.01 ? 'text-green-700 font-medium' : 'text-amber-700 font-medium'}>
                    {Math.abs(Number(summary.variance || 0)) <= 0.01 ? 'Match' : 'Mismatch'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                ERA footer total not found in extracted text for this file.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-col gap-3">
            <div>
              <CardTitle>Extracted lines</CardTitle>
              <CardDescription>
                Showing {Math.min(filteredRows.length, 200)} of {filteredRows.length}
                {filteredRows.length !== rows.length ? ` (filtered from ${rows.length})` : ''}. Download CSV for full export.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Input
                value={resultsSearch}
                onChange={(e) => setResultsSearch(e.target.value)}
                placeholder="Search by member name, HIC, ICN, or ACNT..."
                className="w-full sm:max-w-md"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={paymentFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setPaymentFilter('all')}
                >
                  All payments
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={paymentFilter === 'zero' ? 'default' : 'outline'}
                  onClick={() => setPaymentFilter('zero')}
                >
                  $0 only
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={paymentFilter === 'negative' ? 'default' : 'outline'}
                  onClick={() => setPaymentFilter('negative')}
                >
                  Negative only
                </Button>
                <Button variant="outline" onClick={downloadCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">Batch payment lookup</div>
              <div className="text-xs text-muted-foreground">
                Check if a member was paid in this parsed ERA batch by last/first name, HIC, ICN, or ACNT.
              </div>
              <Input
                value={batchLookupQuery}
                onChange={(e) => setBatchLookupQuery(e.target.value)}
                placeholder="Example: Smith, John • A123456789 • 20001234"
                className="w-full sm:max-w-xl"
              />
              {batchLookup.query ? (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    batchLookup.matchedRows.length === 0
                      ? 'bg-muted/40'
                      : batchLookup.hasPositivePayment
                        ? 'bg-green-50'
                        : 'bg-amber-50'
                  }`}
                >
                  {batchLookup.matchedRows.length === 0 ? (
                    <span>No matching payment lines found in this batch.</span>
                  ) : (
                    <span>
                      {batchLookup.hasPositivePayment ? 'Paid in this batch: Yes' : 'Paid in this batch: No positive payment found'} •{' '}
                      {batchLookup.matchedRows.length} line{batchLookup.matchedRows.length === 1 ? '' : 's'} •{' '}
                      {batchLookup.matchedMembers} member{batchLookup.matchedMembers === 1 ? '' : 's'} • Total paid $
                      {Number(batchLookup.totalPaid || 0).toFixed(2)}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 whitespace-nowrap">Member</th>
                    <th className="px-3 py-2 whitespace-nowrap">ACNT</th>
                    <th className="px-3 py-2 whitespace-nowrap">ICN</th>
                    <th className="px-3 py-2 whitespace-nowrap">HIC</th>
                    <th className="px-3 py-2 whitespace-nowrap">PROC</th>
                    <th className="px-3 py-2 whitespace-nowrap">Svc from</th>
                    <th className="px-3 py-2 whitespace-nowrap">Svc to</th>
                    <th className="px-3 py-2 whitespace-nowrap text-right">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.slice(0, 200).map((r, idx) => (
                    <tr key={`${idx}-${r.member_name}-${r.proc}`} className="border-t">
                      <td className="px-3 py-2 max-w-[360px] truncate">{r.member_name || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.acnt || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.icn || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.hic || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium">{r.proc || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.service_from || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.service_to || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        {r.paid === null || r.paid === undefined ? '—' : `$${Number(r.paid).toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent parsed ERAs</CardTitle>
          <CardDescription>Saved in Firestore so repeated files can be opened quickly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium">Search across saved ERA batches</div>
            <div className="text-xs text-muted-foreground">
              Find whether a member was paid in prior parsed batches using name, HIC, ICN, or ACNT.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={historyLookupQuery}
                onChange={(e) => setHistoryLookupQuery(e.target.value)}
                placeholder="Example: Smith, John • A123456789 • 20001234"
                className="w-full sm:max-w-xl"
              />
              <Button variant="outline" onClick={runHistoryLookup} disabled={historyLookupLoading || uploading || !historyLookupQuery.trim()}>
                {historyLookupLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Search History
              </Button>
            </div>
            {historyLookupPaidAnywhere !== null ? (
              <div
                className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${
                  historyLookupPaidAnywhere ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'
                }`}
              >
                Paid anywhere: {historyLookupPaidAnywhere ? 'Yes' : 'No'}
              </div>
            ) : null}
            {historyLookupQuery.trim() ? (
              <div className="text-xs text-muted-foreground">
                {historyLookupLoading
                  ? 'Searching saved batches...'
                  : `Searched ${historyLookupSearchedBatches} batch(es) • ${historyLookupResults.length} matched batch(es)`}
              </div>
            ) : null}
            {!historyLookupLoading && historyLookupQuery.trim() && historyLookupResults.length === 0 ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">No saved batches matched this lookup.</div>
            ) : null}
            {historyLookupResults.length > 0 ? (
              <div className="space-y-2">
                {historyLookupResults.map((b) => (
                  <div key={b.cacheKey} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-medium">{b.fileName || 'ERA PDF'}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.matchedRows} matching line{b.matchedRows === 1 ? '' : 's'} • {b.matchedMembers} member
                          {b.matchedMembers === 1 ? '' : 's'} • Total paid ${Number(b.totalPaid || 0).toFixed(2)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatCacheTimestamp(b.updatedAt)} • {b.sourceMode || 'unknown'} • {b.payer || 'Health Net'}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => loadFromHistory(b.cacheKey)} disabled={uploading}>
                        Open Batch
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Sample matches: {b.sampleRows.map((row) => `${row.member_name || 'Member'} (${row.proc || '—'}: $${Number(row.paid || 0).toFixed(2)})`).join(' • ')}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={fetchCacheHistory} disabled={historyLoading || uploading}>
              {historyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
          {cacheHistory.length === 0 ? (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">No parsed ERA files saved yet.</div>
          ) : (
            <div className="space-y-2">
              {cacheHistory.map((item) => (
                <div key={item.cacheKey} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{item.fileName || 'ERA PDF'}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.totalRows || 0} rows • {item.sourceMode || 'unknown'} • {item.payer || 'Health Net'}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => loadFromHistory(item.cacheKey)} disabled={uploading}>
                    Open
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

