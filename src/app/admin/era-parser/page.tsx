'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { storage } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Loader2, FileUp, Download, FileText, Trash2 } from 'lucide-react';
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
  debug_block?: string | null;
  debug_mapped_member?: string | null;
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
  parserProfile?: EraParserProfile;
  totalRows: number;
  payer?: string;
  summary?: EraSummary | null;
  totalsVerified?: boolean;
  totalsVerifiedAt?: { _seconds?: number; seconds?: number } | string | null;
  totalsVerifiedByUid?: string | null;
  updatedAt?: { _seconds?: number; seconds?: number } | string | null;
};

type EraHistoryLookupBatch = {
  cacheKey: string;
  fileName: string;
  sourceMode: string;
  parserProfile?: EraParserProfile;
  payer: string;
  totalRows: number;
  updatedAt?: { _seconds?: number; seconds?: number } | string | null;
  matchedRows: number;
  matchedMembers: number;
  totalPaid: number;
  sampleRows: EraRow[];
  matchedRowsPreview?: EraRow[];
};

type EraClaimMatchSummary = {
  totalClaims: number;
  matchedClaims: number;
  unmatchedClaims: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  potentialDuplicatePayments: number;
  submittedChargesTotal: number;
  matchedPaidTotal: number;
  variance: number;
};

type EraClaimMatchResult = {
  sourceTable: string;
  proc: 'H2022' | 'T2038';
  primaryKey: string;
  recordKeyField: string | null;
  recordKeyValue: string | null;
  claimStatus: string | null;
  clientId2: string | null;
  mcpCin: string | null;
  totalCharges: number | null;
  totalDaysOfService: number | null;
  serviceWindows: Array<{ from: string | null; to: string | null }>;
  matched: boolean;
  confidence: 'none' | 'low' | 'medium' | 'high';
  reason: string;
  matchedRows: number;
  matchedPaidTotal: number;
  paidDelta: number | null;
  sampleRows: EraRow[];
  isConnectionsPaidRcfe: boolean;
  potentialDuplicatePayment: boolean;
  canPush: boolean;
  proposedMatchFields: Record<string, string>;
};

type ParsePhase = 'idle' | 'loading_pdfjs' | 'opening_pdf' | 'extracting' | 'uploading' | 'parsing' | 'done';
type ExtractProgress = { currentPage: number; totalPages: number; startedAtMs: number; avgMsPerPage: number };
type OpenProgress = { loaded: number; total: number; startedAtMs: number };
type UploadProgress = { transferred: number; total: number };
type EraParserProfile = 'health_net' | 'claimsmd';

// Bump when extraction rules change so old cached parses are not reused.
const ERA_PARSER_CACHE_VERSION = 8;
type ClaimResultViewFilter =
  | 'all'
  | 'matched'
  | 'unmatched'
  | 'high'
  | 'medium'
  | 'low'
  | 'potential_duplicates'
  | 'variance';

const getErrCode = (e: any) => String(e?.code || e?.details?.code || e?.cause?.code || '').toLowerCase();
const normalizeEraParserProfile = (value: unknown): EraParserProfile =>
  String(value || '').toLowerCase().includes('claims') ? 'claimsmd' : 'health_net';

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

const rowMatchesHistoryLookup = (row: EraRow, rawQuery: string) => {
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
  const acnt = String(row.acnt || '').toLowerCase().trim();
  const acntToken = normalizeLookupToken(acnt);
  const icn = String(row.icn || '').toLowerCase().trim();
  const icnToken = normalizeLookupToken(icn);
  const hic = String(row.hic || '').toLowerCase().trim();
  const hicToken = normalizeLookupToken(hic);

  const nameMatchDirect = member.includes(qText) || (qName ? memberNormalized.includes(qName) : false);
  const nameMatchByTokens =
    qNameTokens.length > 0 &&
    qNameTokens.every((tok) => memberNormalized.includes(tok) || memberToken.includes(normalizeLookupToken(tok)));
  const idTextMatch = hic.includes(qText) || acnt.includes(qText) || icn.includes(qText);
  const idTokenMatch = qToken
    ? hicToken.includes(qToken) || acntToken.includes(qToken) || icnToken.includes(qToken)
    : false;

  return nameMatchDirect || nameMatchByTokens || idTextMatch || idTokenMatch;
};

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

type EraMemberContext = {
  member_name: string;
  hic: string | null;
  medi: string | null;
  acnt: string | null;
  icn: string | null;
};

const PATIENT_NAME_LABEL_RE = /\bPatient\s*Name\b/i;
const YOUR_ACCT_LABEL_RE = /\bYour\s*Acct\b/i;
const CLAIM_LABEL_RE = /\bClaim\s*#\b/i;
const RECEIPT_DATE_LABEL_RE = /\bReceipt\s*Date\b/i;

const parseUsDateToken = (value: string) => {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  const mm = String(Number(m[1] || 0)).padStart(2, '0');
  const dd = String(Number(m[2] || 0)).padStart(2, '0');
  const yyyyRaw = String(m[3] || '').trim();
  const yyyy = yyyyRaw.length === 2 ? String(2000 + Number(yyyyRaw)) : yyyyRaw;
  return `${yyyy}-${mm}-${dd}`;
};

const extractPatientNameFromLine = (line: string) => {
  const m = line.match(PATIENT_NAME_LABEL_RE);
  if (!m) return null;
  const start = (m.index ?? 0) + m[0].length;
  const tail = line.slice(start);
  const cutPatterns = [YOUR_ACCT_LABEL_RE, CLAIM_LABEL_RE, RECEIPT_DATE_LABEL_RE, /\bCIN\b/i, /\bHealth\s+Net\b/i, /\bQuestions\?\b/i];
  let cut = tail.length;
  for (const re of cutPatterns) {
    const found = tail.match(re);
    if (found && typeof found.index === 'number') cut = Math.min(cut, found.index);
  }
  const name = tail
    .slice(0, cut)
    .replace(/^[:#\s-]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return name || null;
};

const extractCinFromLine = (line: string) => {
  const m = line.match(/\bCIN\b\s*[:#]?\s*([A-Z0-9-]{4,})\b/i);
  const token = m?.[1] ? String(m[1]).trim() : '';
  if (!token) return null;
  // Avoid right-column bleed like "CIN  Claim # ..."
  if (!/\d/.test(token)) return null;
  if (/^(claim|receipt|your)$/i.test(token)) return null;
  return token;
};

const extractYourAcctFromLine = (line: string) => {
  const m = line.match(/\bYour\s*Acct\s*#?\s*[:#]?\s*([A-Z0-9-]{2,})\b/i);
  return m?.[1] ? String(m[1]).trim() : null;
};

const isLikelyMemberName = (value: string) => {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return false;
  if (!/[A-Za-z]/.test(raw)) return false;
  if (/\d/.test(raw)) return false;
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  if (
    /\b(your\s+acct|claim\s*#|receipt\s+date|member\s+plan\s+code|health\s+net|questions\?|provider_services|po\s+box)\b/i.test(
      raw
    )
  ) {
    return false;
  }
  return true;
};

const extractAccountTokenFromLine = (line: string) => {
  const matches = Array.from(String(line || '').matchAll(/\b(\d{3,6})\b/g)).map((m) => String(m[1] || ''));
  for (const token of matches) {
    const n = Number(token);
    if (token.length === 4 && Number.isFinite(n) && n >= 1900 && n <= 2100) continue; // avoid years (e.g. 2026)
    return token;
  }
  return null;
};

const extractCinTokenFromLine = (line: string) => {
  const tokens = Array.from(String(line || '').matchAll(/\b([A-Z0-9-]{6,14})\b/gi)).map((m) => String(m[1] || '').trim());
  const cleaned = tokens.filter((t) => {
    if (!t) return false;
    if (/^(claim|receipt|your|acct|date)$/i.test(t)) return false;
    if (/^\d{4}$/.test(t)) return false;
    if (!/\d/.test(t)) return false;
    if (!/[A-Z]/i.test(t)) return false;
    return true;
  });
  const preferred = cleaned.find((t) => !t.includes('-') && t.length >= 8 && t.length <= 12);
  if (preferred) return preferred;
  return cleaned[0] || null;
};

const stripAfterHeaderLabels = (value: string) =>
  String(value || '').split(/\b(Claim\s*#|Receipt\s*Date|Your\s*Acct|Patient\s*Name|CIN)\b/i)[0].trim();

const normalizeMemberCandidate = (value: string) =>
  stripAfterHeaderLabels(String(value || '').replace(/\s+(?=[A-Z0-9-]*\d)[A-Z0-9-]{3,}\s*$/i, '').trim());

const normalizeAcctToken = (value: string | null) => {
  const token = String(value || '').trim();
  if (!/^\d{4,6}$/.test(token)) return null;
  if (/^(19|20)\d{2}$/.test(token)) return null;
  const n = Number(token);
  if (!Number.isFinite(n) || n < 1000) return null;
  return token;
};

const parseHealthNetContextFromHeader = (lines: string[], headerIdx: number): EraMemberContext => {
  let member_name = '';
  let icn: string | null = null;
  let acnt: string | null = null;
  const maxEnd = Math.min(lines.length - 1, headerIdx + 14);

  for (let j = headerIdx; j <= maxEnd; j++) {
    const ln = String(lines[j] || '').replace(/\s+/g, ' ').trim();
    if (!ln) continue;
    if (j > headerIdx && PATIENT_NAME_LABEL_RE.test(ln)) break;

    if (PATIENT_NAME_LABEL_RE.test(ln) && !member_name) {
      const inline = normalizeMemberCandidate(extractPatientNameFromLine(ln) || '');
      if (inline && isLikelyMemberName(inline)) member_name = inline;
      continue;
    }

    if (/\bCIN\b/i.test(ln) && !icn) {
      icn = extractCinFromLine(ln) || null;
      if (!icn) {
        const next = String(lines[j + 1] || '').replace(/\s+/g, ' ').trim();
        icn = extractCinTokenFromLine(next) || null;
      }
      continue;
    }

    if (YOUR_ACCT_LABEL_RE.test(ln) && !acnt) {
      acnt = normalizeAcctToken(extractYourAcctFromLine(ln));
      if (!acnt) {
        const next = String(lines[j + 1] || '').replace(/\s+/g, ' ').trim();
        acnt = normalizeAcctToken(extractAccountTokenFromLine(next));
      }
      continue;
    }

    if (!member_name && j <= headerIdx + 3) {
      const candidate = normalizeMemberCandidate(ln);
      if (isLikelyMemberName(candidate)) member_name = candidate;
    }
  }

  return {
    member_name,
    hic: null,
    medi: null,
    acnt,
    icn,
  };
};

type HealthNetCinIndexValue = {
  member_name: string;
  acnt: string | null;
};

const buildHealthNetCinIndex = (lines: string[]) => {
  const map = new Map<string, HealthNetCinIndexValue>();
  for (let i = 0; i < lines.length; i++) {
    const ln = String(lines[i] || '').replace(/\s+/g, ' ').trim();
    if (!ln || !PATIENT_NAME_LABEL_RE.test(ln)) continue;
    const parsed = parseHealthNetContextFromHeader(lines, i);
    const icn = String(parsed.icn || '').trim().toUpperCase();
    if (!icn || !parsed.member_name) continue;
    map.set(icn, { member_name: parsed.member_name, acnt: parsed.acnt || null });
  }
  return map;
};

type HealthNetMemberBlock = {
  start: number;
  end: number;
  context: EraMemberContext;
};

const parseHealthNetBlockContextByRange = (lines: string[], start: number, end: number): EraMemberContext => {
  let member_name = '';
  let icn: string | null = null;
  let acnt: string | null = null;
  const maxScan = Math.min(end, start + 14);
  for (let j = start; j <= maxScan; j++) {
    const ln = String(lines[j] || '').replace(/\s+/g, ' ').trim();
    if (!ln) continue;
    if (PATIENT_NAME_LABEL_RE.test(ln) && !member_name) {
      const inline = normalizeMemberCandidate(extractPatientNameFromLine(ln) || '');
      if (inline && isLikelyMemberName(inline)) member_name = inline;
      continue;
    }
    if (!member_name) {
      const candidate = normalizeMemberCandidate(ln);
      if (candidate && isLikelyMemberName(candidate)) member_name = candidate;
    }
    if (!icn && /\bCIN\b/i.test(ln)) {
      icn = extractCinFromLine(ln) || extractCinTokenFromLine(String(lines[j + 1] || '').replace(/\s+/g, ' ').trim()) || null;
      continue;
    }
    if (!acnt && YOUR_ACCT_LABEL_RE.test(ln)) {
      acnt =
        normalizeAcctToken(extractYourAcctFromLine(ln)) ||
        normalizeAcctToken(extractAccountTokenFromLine(String(lines[j + 1] || '').replace(/\s+/g, ' ').trim()));
      continue;
    }
  }
  return { member_name, hic: null, medi: null, acnt, icn };
};

const buildHealthNetMemberBlocks = (lines: string[]) => {
  const headers: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (PATIENT_NAME_LABEL_RE.test(String(lines[i] || ''))) headers.push(i);
  }
  const blocks: HealthNetMemberBlock[] = [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i];
    const end = i + 1 < headers.length ? headers[i + 1] - 1 : lines.length - 1;
    blocks.push({
      start,
      end,
      context: parseHealthNetBlockContextByRange(lines, start, end),
    });
  }
  return blocks;
};

const resolveHealthNetBlockContextForRow = (idx: number, blocks: HealthNetMemberBlock[], fallback: EraMemberContext): EraMemberContext => {
  for (const block of blocks) {
    if (idx >= block.start && idx <= block.end) {
      return {
        member_name: block.context.member_name || '',
        hic: null,
        medi: null,
        acnt: block.context.acnt || null,
        icn: block.context.icn || null,
      };
    }
  }
  return fallback;
};

const findHealthNetBlockForRow = (idx: number, blocks: HealthNetMemberBlock[]) => {
  for (const block of blocks) {
    if (idx >= block.start && idx <= block.end) return block;
  }
  return null;
};

const resolveHealthNetContextBackward = (lines: string[], idx: number, current: EraMemberContext): EraMemberContext => {
  const clean = (v: string) => String(v || '').replace(/\s+/g, ' ').trim();
  let member = '';
  let acnt: string | null = null;
  let icn: string | null = null;
  const radius = 180;

  const nearestLabelIndex = (labelRe: RegExp) => {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    const min = Math.max(0, idx - radius);
    const max = Math.min(lines.length - 1, idx + radius);
    for (let j = min; j <= max; j++) {
      const ln = clean(lines[j] || '');
      if (!ln || !labelRe.test(ln)) continue;
      const dist = Math.abs(j - idx);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }
    return bestIdx;
  };

  const memberFromLabel = (at: number) => {
    const ln = clean(lines[at] || '');
    const inline = normalizeMemberCandidate(extractPatientNameFromLine(ln) || '');
    if (inline && isLikelyMemberName(inline)) return inline;
    const next = clean(lines[at + 1] || '');
    const fallback = normalizeMemberCandidate(next);
    if (fallback && isLikelyMemberName(fallback)) return fallback;
    return '';
  };

  const acctFromLabel = (at: number) => {
    const ln = clean(lines[at] || '');
    const inline = normalizeAcctToken((ln.match(/\bYour\s*Acct\s*#?\s*[:#]?\s*(\d{4,6})\b/i)?.[1] || '').trim());
    if (inline) return inline;
    const next = clean(lines[at + 1] || '');
    if (/\b(claim\s*#|receipt\s*date)\b/i.test(next)) return null;
    return normalizeAcctToken((next.match(/\b(\d{4,6})\b/)?.[1] || '').trim());
  };

  const cinFromLabel = (at: number) => {
    const ln = clean(lines[at] || '');
    const inline = extractCinFromLine(ln);
    if (inline) return inline;
    const next = clean(lines[at + 1] || '');
    return extractCinTokenFromLine(next);
  };

  const patientIdx = nearestLabelIndex(PATIENT_NAME_LABEL_RE);
  const acctIdx = nearestLabelIndex(YOUR_ACCT_LABEL_RE);
  const cinIdx = nearestLabelIndex(/\bCIN\b/i);

  if (patientIdx >= 0) member = memberFromLabel(patientIdx);
  if (acctIdx >= 0) acnt = acctFromLabel(acctIdx);
  if (cinIdx >= 0) icn = cinFromLabel(cinIdx);

  const foundAnyLabel = patientIdx >= 0 || acctIdx >= 0 || cinIdx >= 0;

  return {
    member_name: member || (!foundAnyLabel ? String(current.member_name || '').trim() : '') || '',
    hic: null,
    medi: null,
    acnt: acnt || (!foundAnyLabel ? String(current.acnt || '').trim() : '') || null,
    icn: icn || (!foundAnyLabel ? String(current.icn || '').trim() : '') || null,
  };
};

const extractEraMemberContextFromLine = (
  line: string,
  current: EraMemberContext,
  parserProfile: EraParserProfile
): EraMemberContext | null => {
  let next: EraMemberContext = { ...current };
  let changed = false;

  if (
    parserProfile === 'health_net' &&
    /\bNAME\b/i.test(line) &&
    /\b(HIC|ACNT|ICN)\b/i.test(line) &&
    !PATIENT_NAME_LABEL_RE.test(line)
  ) {
    const parsed = extractNameHicAcntIcn(line);
    const merged: EraMemberContext = {
      member_name: parsed.name || next.member_name,
      hic: parsed.hic || next.hic,
      medi: parsed.medi || next.medi,
      acnt: parsed.acnt || next.acnt,
      icn: parsed.icn || next.icn,
    };
    if (
      merged.member_name !== next.member_name ||
      merged.hic !== next.hic ||
      merged.medi !== next.medi ||
      merged.acnt !== next.acnt ||
      merged.icn !== next.icn
    ) {
      next = merged;
      changed = true;
    }
  }

  // Health Net files sometimes place account/CIN/name on separate nearby lines.
  if (parserProfile === 'health_net') {
    const patientName = extractPatientNameFromLine(line);
    if (
      patientName &&
      !/\b(your\s*acct|claim\s*#|receipt\s*date)\b/i.test(patientName) &&
      /[A-Za-z]/.test(patientName)
    ) {
      // New patient block: reset context so multi-member pages do not bleed values.
      next = {
        member_name: patientName,
        hic: null,
        medi: null,
        acnt: null,
        icn: null,
      };
      changed = true;
    }
    const yourAcct = extractYourAcctFromLine(line);
    if (yourAcct && next.acnt !== yourAcct) {
      next.acnt = yourAcct;
      changed = true;
    }
    const cin = extractCinFromLine(line);
    if (cin && next.icn !== cin) {
      next.icn = cin;
      changed = true;
    }
  }

  if (parserProfile === 'claimsmd') {
    const patientName = extractPatientNameFromLine(line);
    if (patientName) {
      next.member_name = patientName;
      changed = true;
    }
    const cin = extractCinFromLine(line);
    if (cin) {
      // ClaimsMD-style ERA labels Medi-Cal identifier as CIN.
      next.icn = cin;
      changed = true;
    }
    const yourAcct = extractYourAcctFromLine(line);
    if (yourAcct) {
      next.acnt = yourAcct;
      changed = true;
    }
  }

  return changed ? next : null;
};

function parseServiceDatesFromProcLine(line: string, remitDate: string | null) {
  const explicitRange = line.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*[-–]\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
  if (explicitRange?.[1] && explicitRange?.[2]) {
    return {
      service_from: parseUsDateToken(explicitRange[1]),
      service_to: parseUsDateToken(explicitRange[2]),
    };
  }
  const datedTokens = Array.from(line.matchAll(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g))
    .map((mm) => String(mm?.[0] || '').trim())
    .filter(Boolean);
  if (datedTokens.length >= 2) {
    return {
      service_from: parseUsDateToken(datedTokens[0]),
      service_to: parseUsDateToken(datedTokens[1]),
    };
  }
  if (datedTokens.length === 1) {
    const d = parseUsDateToken(datedTokens[0]);
    return { service_from: d, service_to: d };
  }

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

const parseServiceDatesNearProcLine = (lines: string[], idx: number, remitDate: string | null) => {
  const candidates = [lines[idx], lines[idx - 1], lines[idx + 1], lines[idx - 2], lines[idx + 2]];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = parseServiceDatesFromProcLine(candidate, remitDate);
    if (parsed.service_from || parsed.service_to) return parsed;
  }
  return { service_from: null, service_to: null };
};

const resolveContextNearProcLine = (
  lines: string[],
  idx: number,
  current: EraMemberContext,
  parserProfile: EraParserProfile
): EraMemberContext => {
  if (parserProfile === 'health_net') {
    return resolveHealthNetContextBackward(lines, idx, current);
  }

  let resolved: EraMemberContext = { ...current };

  // Health Net remits can contain multiple member blocks per page.
  // Anchor each PROC row to the nearest preceding member header to avoid cross-member bleed.
  let start = Math.max(0, idx - 12);
  if (parserProfile === 'health_net') {
    const minScan = Math.max(0, idx - 120);
    for (let j = idx; j >= minScan; j--) {
      const ln = String(lines[j] || '');
      if (/\bPatient\s+Name\b/i.test(ln)) {
        start = j;
        break;
      }
    }
    // Fresh context from the detected member block.
    resolved = {
      member_name: '',
      hic: null,
      medi: null,
      acnt: null,
      icn: null,
    };
  }

  const end = Math.min(lines.length - 1, idx + 2);
  for (let j = start; j <= end; j++) {
    const update = extractEraMemberContextFromLine(lines[j] || '', resolved, parserProfile);
    if (update) resolved = update;
  }

  // Extra Health Net fallback: labels and values are often split across adjacent lines.
  if (parserProfile === 'health_net') {
    const cleanLine = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();
    const nextNonLabelLine = (from: number, maxAhead = 3) => {
      for (let k = from + 1; k <= Math.min(end, from + maxAhead); k++) {
        const cand = cleanLine(lines[k] || '');
        if (!cand) continue;
        if (/\b(patient\s+name|cin|your\s+acct|claim\s*#|receipt\s+date)\b/i.test(cand)) continue;
        return cand;
      }
      return '';
    };

    let lastPatientIdx = -1;
    let lastCinIdx = -1;
    let lastAcctIdx = -1;
    for (let j = start; j <= end; j++) {
      const ln = cleanLine(lines[j] || '');
      if (!ln) continue;
      if (/\bPatient\s+Name\b/i.test(ln)) lastPatientIdx = j;
      if (/\bCIN\b/i.test(ln)) lastCinIdx = j;
      if (/\bYour\s+Acct\b/i.test(ln)) lastAcctIdx = j;
    }

    if (lastPatientIdx >= 0) {
      const pLine = cleanLine(lines[lastPatientIdx] || '');
      const inline = normalizeMemberCandidate(extractPatientNameFromLine(pLine) || '');
      if (inline && isLikelyMemberName(inline)) {
        resolved.member_name = inline;
      } else {
        const fallback = normalizeMemberCandidate(nextNonLabelLine(lastPatientIdx));
        if (fallback && isLikelyMemberName(fallback)) resolved.member_name = fallback;
      }
    }

    if (lastCinIdx >= 0) {
      const cLine = cleanLine(lines[lastCinIdx] || '');
      const inlineCin = extractCinFromLine(cLine);
      if (inlineCin) {
        resolved.icn = inlineCin;
      } else {
        const fallbackCin = extractCinTokenFromLine(nextNonLabelLine(lastCinIdx));
        if (fallbackCin) resolved.icn = fallbackCin;
      }
    }

    if (lastAcctIdx >= 0) {
      const aLine = cleanLine(lines[lastAcctIdx] || '');
      const inlineAcct = extractYourAcctFromLine(aLine);
      if (inlineAcct) {
        resolved.acnt = inlineAcct;
      } else {
        const fallbackAcct = extractAccountTokenFromLine(nextNonLabelLine(lastAcctIdx));
        if (fallbackAcct) resolved.acnt = fallbackAcct;
      }
    }
  }

  return resolved;
};

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

const gatherAmounts = (lines: string[], idx: number, parserProfile: EraParserProfile) => {
  const first = extractAmountsFromLine(lines[idx] || '');
  if (first.length >= 3) return first.slice(0, 6);

  const out: string[] = [...first];
  const stopLine = (ln: string) =>
    (parserProfile === 'claimsmd' && /\bPatient\s+Name\b/i.test(ln)) ||
    /\bNAME\b/i.test(ln) ||
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

const toClaimMatchCsv = (rows: EraClaimMatchResult[], summary: EraClaimMatchSummary | null) => {
  const header = [
    'generated_at',
    'total_claims',
    'matched_claims',
    'unmatched_claims',
    'high_confidence',
    'medium_confidence',
    'low_confidence',
    'potential_duplicate_payments',
    'submitted_charges_total',
    'matched_paid_total',
    'variance',
    'source_table',
    'proc',
    'claim_primary_key',
    'claim_status',
    'client_id2',
    'mcp_cin',
    'total_charges',
    'total_days_of_service',
    'service_windows',
    'matched',
    'confidence',
    'reason',
    'is_connections_paid_rcfe',
    'potential_duplicate_payment',
    'matched_rows',
    'matched_paid_total_claim',
    'paid_delta',
    'sample_rows',
  ];
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const generatedAt = new Date().toISOString();
  const summaryBase = {
    total_claims: summary?.totalClaims ?? '',
    matched_claims: summary?.matchedClaims ?? '',
    unmatched_claims: summary?.unmatchedClaims ?? '',
    high_confidence: summary?.highConfidence ?? '',
    medium_confidence: summary?.mediumConfidence ?? '',
    low_confidence: summary?.lowConfidence ?? '',
    potential_duplicate_payments: summary?.potentialDuplicatePayments ?? '',
    submitted_charges_total:
      typeof summary?.submittedChargesTotal === 'number' ? Number(summary.submittedChargesTotal).toFixed(2) : '',
    matched_paid_total: typeof summary?.matchedPaidTotal === 'number' ? Number(summary.matchedPaidTotal).toFixed(2) : '',
    variance: typeof summary?.variance === 'number' ? Number(summary.variance).toFixed(2) : '',
  };
  const lines = [header.join(',')];
  for (const row of rows) {
    const serviceWindows = Array.isArray(row.serviceWindows)
      ? row.serviceWindows
          .map((w) => `${String(w.from || '').trim() || '—'}..${String(w.to || '').trim() || '—'}`)
          .join(' | ')
      : '';
    const sampleRows = Array.isArray(row.sampleRows)
      ? row.sampleRows
          .map((r) => `${r.proc || '—'}:${r.service_from || '—'}..${r.service_to || '—'}:$${Number(r.paid || 0).toFixed(2)}`)
          .join(' | ')
      : '';
    const values = [
      generatedAt,
      summaryBase.total_claims,
      summaryBase.matched_claims,
      summaryBase.unmatched_claims,
      summaryBase.high_confidence,
      summaryBase.medium_confidence,
      summaryBase.low_confidence,
      summaryBase.potential_duplicate_payments,
      summaryBase.submitted_charges_total,
      summaryBase.matched_paid_total,
      summaryBase.variance,
      row.sourceTable,
      row.proc,
      row.primaryKey,
      row.claimStatus || '',
      row.clientId2 || '',
      row.mcpCin || '',
      typeof row.totalCharges === 'number' ? Number(row.totalCharges).toFixed(2) : '',
      typeof row.totalDaysOfService === 'number' ? row.totalDaysOfService : '',
      serviceWindows,
      row.matched ? 'yes' : 'no',
      row.confidence,
      row.reason,
      row.isConnectionsPaidRcfe ? 'yes' : 'no',
      row.potentialDuplicatePayment ? 'yes' : 'no',
      row.matchedRows,
      Number(row.matchedPaidTotal || 0).toFixed(2),
      typeof row.paidDelta === 'number' ? Number(row.paidDelta).toFixed(2) : '',
      sampleRows,
    ];
    lines.push(values.map((v) => esc(v)).join(','));
  }
  return lines.join('\n');
};

const eraRowMatchKey = (row: EraRow) =>
  [
    String(row.proc || ''),
    String(row.page || ''),
    String(row.acnt || ''),
    String(row.icn || ''),
    String(row.hic || ''),
    String(row.service_from || ''),
    String(row.service_to || ''),
    String(row.paid ?? ''),
    String(row.source_line || ''),
  ].join('|');

export default function EraParserPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin, isLoading } = useAdmin();
  const auth = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [fastFallbackNotice, setFastFallbackNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<EraRow[]>([]);
  const [summary, setSummary] = useState<EraSummary | null>(null);
  const [payer, setPayer] = useState<string>('Health Net');
  const [resultsSearch, setResultsSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'zero' | 'negative'>('all');
  const [procFilter, setProcFilter] = useState<string>('all');
  const [batchLookupQuery, setBatchLookupQuery] = useState('');
  const [historyLookupQuery, setHistoryLookupQuery] = useState('');
  const [historyLookupLoading, setHistoryLookupLoading] = useState(false);
  const [historyLookupResults, setHistoryLookupResults] = useState<EraHistoryLookupBatch[]>([]);
  const [historyLookupSearchedBatches, setHistoryLookupSearchedBatches] = useState(0);
  const [claimMatchLoading, setClaimMatchLoading] = useState(false);
  const [claimMatchFilter, setClaimMatchFilter] = useState('');
  const [claimMatchSummary, setClaimMatchSummary] = useState<EraClaimMatchSummary | null>(null);
  const [claimMatchResults, setClaimMatchResults] = useState<EraClaimMatchResult[]>([]);
  const [claimResultViewFilter, setClaimResultViewFilter] = useState<ClaimResultViewFilter>('all');
  const [claimMatchedRowKeys, setClaimMatchedRowKeys] = useState<string[]>([]);
  const [claimMatchEvaluated, setClaimMatchEvaluated] = useState(false);
  const [pushMatchLoading, setPushMatchLoading] = useState(false);
  const [pushSingleMatchLoading, setPushSingleMatchLoading] = useState(false);
  const [pushTestClaimKey, setPushTestClaimKey] = useState('');
  const [pushAuthorizationType, setPushAuthorizationType] = useState<'H2022' | 'T2038'>('H2022');
  const [parserProfile, setParserProfile] = useState<EraParserProfile>('health_net');
  const [activeParserProfile, setActiveParserProfile] = useState<EraParserProfile>('health_net');
  const [pushMatchResult, setPushMatchResult] = useState<{ candidates: number; pushed: number; failed: number } | null>(null);
  const [matchSortMode, setMatchSortMode] = useState<'none' | 'matched_first' | 'unmatched_first'>('none');
  const [phase, setPhase] = useState<ParsePhase>('idle');
  const [extractProgress, setExtractProgress] = useState<ExtractProgress | null>(null);
  const [openProgress, setOpenProgress] = useState<OpenProgress | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [lastExtracted, setLastExtracted] = useState<ExtractedPagesResult | null>(null);
  const [cacheHistory, setCacheHistory] = useState<EraCacheHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeCacheKey, setActiveCacheKey] = useState<string | null>(null);
  const [activeTotalsVerified, setActiveTotalsVerified] = useState(false);
  const [activeTotalsVerifiedAt, setActiveTotalsVerifiedAt] = useState<EraCacheHistoryItem['totalsVerifiedAt']>(null);
  const [totalsReviewSaving, setTotalsReviewSaving] = useState(false);
  const [progressTick, setProgressTick] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [previewProgress, setPreviewProgress] = useState<{ currentPage: number; totalPages: number; scannedLines: number } | null>(
    null
  );
  const [previewRow, setPreviewRow] = useState<EraRow | null>(null);
  const [previewRows, setPreviewRows] = useState<EraRow[]>([]);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const matchedRowKeySet = useMemo(() => new Set(claimMatchedRowKeys), [claimMatchedRowKeys]);
  const initialCacheKey = useMemo(() => {
    const raw = String(searchParams?.get('cacheKey') || '').trim();
    return raw || null;
  }, [searchParams]);

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

  useEffect(() => {
    setPreviewRow(null);
    setPreviewRows([]);
    setPreviewMessage(null);
    setPreviewProgress(null);
  }, [file, parserProfile]);

  const totalMembers = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const key = String(r.acnt || '').trim() || String(r.member_name || '').trim();
      if (key) s.add(key);
    }
    return s.size;
  }, [rows]);
  const paymentBreakdown = useMemo(() => {
    const t2038Total = Number(summary?.t2038?.total_paid || 0);
    const h2022Total = Number(summary?.h2022?.total_paid || 0);
    const t2038Rows = Number(summary?.t2038?.rows || 0);
    const h2022Rows = Number(summary?.h2022?.rows || 0);
    const parsedSubtotal =
      typeof summary?.parser_total === 'number'
        ? Number(summary.parser_total)
        : Number((t2038Total + h2022Total).toFixed(2));
    const eraNetTotal =
      typeof summary?.era_grand_total === 'number' && Number.isFinite(summary.era_grand_total)
        ? Number(summary.era_grand_total)
        : null;
    const offsetAdjustment =
      typeof eraNetTotal === 'number'
        ? Number((eraNetTotal - parsedSubtotal).toFixed(2))
        : null;
    const allNegativeRows = rows.filter((r) => typeof r.paid === 'number' && Number.isFinite(r.paid) && r.paid < 0);
    const negativeCount = allNegativeRows.length;
    const negativeTotal = Number(allNegativeRows.reduce((sum, r) => sum + Number(r.paid || 0), 0).toFixed(2));
    const t2038NegativeCount = rows.filter(
      (r) => r.proc === 'T2038' && typeof r.paid === 'number' && Number.isFinite(r.paid) && r.paid < 0
    ).length;
    const h2022NegativeCount = rows.filter(
      (r) => r.proc === 'H2022' && typeof r.paid === 'number' && Number.isFinite(r.paid) && r.paid < 0
    ).length;
    const t2038AveragePaid = t2038Rows > 0 ? Number((t2038Total / t2038Rows).toFixed(2)) : null;
    const h2022AveragePaid = h2022Rows > 0 ? Number((h2022Total / h2022Rows).toFixed(2)) : null;
    return {
      t2038Total,
      h2022Total,
      t2038Rows,
      h2022Rows,
      t2038AveragePaid,
      h2022AveragePaid,
      parsedSubtotal,
      eraNetTotal,
      offsetAdjustment,
      negativeCount,
      negativeTotal,
      t2038NegativeCount,
      h2022NegativeCount,
    };
  }, [summary, rows]);
  const procFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const proc = String(row.proc || '').trim().toUpperCase();
      if (!proc) return;
      counts.set(proc, (counts.get(proc) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = String(resultsSearch || '').trim().toLowerCase();
    const activeProc = String(procFilter || 'all').trim().toUpperCase();
    const applyProcFilter = (list: EraRow[]) => {
      if (!activeProc || activeProc === 'ALL') return list;
      return list.filter((r) => String(r.proc || '').trim().toUpperCase() === activeProc);
    };
    const applyPaymentFilter = (list: EraRow[]) => {
      if (paymentFilter === 'all') return list;
      return list.filter((r) => {
        const paid = typeof r.paid === 'number' && Number.isFinite(r.paid) ? r.paid : null;
        if (paymentFilter === 'zero') return paid === 0;
        if (paymentFilter === 'negative') return typeof paid === 'number' && paid < 0;
        return true;
      });
    };
    const applyMatchSort = (list: EraRow[]) => {
      if (!claimMatchEvaluated || matchSortMode === 'none') return list;
      const copy = [...list];
      copy.sort((a, b) => {
        const aMatched = matchedRowKeySet.has(eraRowMatchKey(a)) ? 1 : 0;
        const bMatched = matchedRowKeySet.has(eraRowMatchKey(b)) ? 1 : 0;
        if (matchSortMode === 'matched_first') return bMatched - aMatched;
        return aMatched - bMatched;
      });
      return copy;
    };
    if (!q) return applyMatchSort(applyPaymentFilter(applyProcFilter(rows)));
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
    return applyMatchSort(applyPaymentFilter(applyProcFilter(base)));
  }, [rows, resultsSearch, paymentFilter, procFilter, matchedRowKeySet, claimMatchEvaluated, matchSortMode]);

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

  const pushReadyClaimMatches = useMemo(() => {
    const targetTable =
      pushAuthorizationType === 'H2022' ? 'CalAIM_Claim_Submit_RCFE_H2022' : 'CalAIM_Claim_Submit_T2038';
    return claimMatchResults.filter((r) => r.canPush && r.matched && r.proc === pushAuthorizationType && r.sourceTable === targetTable);
  }, [claimMatchResults, pushAuthorizationType]);
  const selectedPushTestClaim = useMemo(
    () => pushReadyClaimMatches.find((m) => `${m.sourceTable}::${m.primaryKey}` === pushTestClaimKey) || null,
    [pushReadyClaimMatches, pushTestClaimKey]
  );
  const pushTestFieldPreview = useMemo(() => {
    if (!selectedPushTestClaim) return [] as Array<{ appField: string; appValue: string; caspioField: string; pushValue: string }>;
    const p = selectedPushTestClaim.proposedMatchFields || {};
    return [
      {
        appField: 'matched',
        appValue: selectedPushTestClaim.matched ? 'true' : 'false',
        caspioField: 'Match',
        pushValue: String(p.Match || 'Matched'),
      },
      {
        appField: 'matchedPaidTotal',
        appValue: Number(selectedPushTestClaim.matchedPaidTotal || 0).toFixed(2),
        caspioField: 'Match_Payment_Amount',
        pushValue: String(p.Match_Payment_Amount || ''),
      },
      {
        appField: 'clientId2',
        appValue: String(selectedPushTestClaim.clientId2 || ''),
        caspioField: 'Match_Client_ID2_Confirm',
        pushValue: String(p.Match_Client_ID2_Confirm || ''),
      },
      {
        appField: 'sampleRows.memberFirst',
        appValue: String(p.Match_Client_First || ''),
        caspioField: 'Match_Client_First',
        pushValue: String(p.Match_Client_First || ''),
      },
      {
        appField: 'sampleRows.memberLast',
        appValue: String(p.Match_Client_Last || ''),
        caspioField: 'Match_Client_Last',
        pushValue: String(p.Match_Client_Last || ''),
      },
    ];
  }, [selectedPushTestClaim]);
  const claimResultCounts = useMemo(() => {
    const counts = {
      all: claimMatchResults.length,
      matched: 0,
      unmatched: 0,
      high: 0,
      medium: 0,
      low: 0,
      potential_duplicates: 0,
      variance: 0,
    };
    for (const r of claimMatchResults) {
      if (r.matched) counts.matched += 1;
      else counts.unmatched += 1;
      if (r.confidence === 'high') counts.high += 1;
      if (r.confidence === 'medium') counts.medium += 1;
      if (r.confidence === 'low') counts.low += 1;
      if (r.potentialDuplicatePayment) counts.potential_duplicates += 1;
      if (typeof r.paidDelta === 'number' && Number.isFinite(r.paidDelta) && Math.abs(r.paidDelta) > 0.01) counts.variance += 1;
    }
    return counts;
  }, [claimMatchResults]);
  const filteredClaimMatchResults = useMemo(() => {
    switch (claimResultViewFilter) {
      case 'matched':
        return claimMatchResults.filter((r) => r.matched);
      case 'unmatched':
        return claimMatchResults.filter((r) => !r.matched);
      case 'high':
        return claimMatchResults.filter((r) => r.confidence === 'high');
      case 'medium':
        return claimMatchResults.filter((r) => r.confidence === 'medium');
      case 'low':
        return claimMatchResults.filter((r) => r.confidence === 'low');
      case 'potential_duplicates':
        return claimMatchResults.filter((r) => r.potentialDuplicatePayment);
      case 'variance':
        return claimMatchResults.filter(
          (r) => typeof r.paidDelta === 'number' && Number.isFinite(r.paidDelta) && Math.abs(r.paidDelta) > 0.01
        );
      default:
        return claimMatchResults;
    }
  }, [claimMatchResults, claimResultViewFilter]);

  useEffect(() => {
    setClaimMatchSummary(null);
    setClaimMatchResults([]);
    setClaimResultViewFilter('all');
    setClaimMatchedRowKeys([]);
    setClaimMatchEvaluated(false);
    setPushAuthorizationType('H2022');
    setPushTestClaimKey('');
    setPushMatchResult(null);
    setMatchSortMode('none');
  }, [rows]);

  useEffect(() => {
    if (!pushReadyClaimMatches.length) {
      setPushTestClaimKey('');
      return;
    }
    const exists = pushReadyClaimMatches.some((m) => `${m.sourceTable}::${m.primaryKey}` === pushTestClaimKey);
    if (!exists) {
      const firstKey = `${pushReadyClaimMatches[0].sourceTable}::${pushReadyClaimMatches[0].primaryKey}`;
      setPushTestClaimKey(firstKey);
    }
  }, [pushReadyClaimMatches, pushTestClaimKey]);

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
      let current: EraMemberContext = {
        member_name: '',
        hic: null as string | null,
        medi: null as string | null,
        acnt: null as string | null,
        icn: null as string | null,
      };
      const healthNetCinIndex =
        parserProfile === 'health_net' ? buildHealthNetCinIndex(lines) : new Map<string, HealthNetCinIndexValue>();
      const healthNetBlocks = parserProfile === 'health_net' ? buildHealthNetMemberBlocks(lines) : [];
      const pageRows: EraRow[] = [];

      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (parserProfile === 'health_net' && PATIENT_NAME_LABEL_RE.test(ln)) {
          current = parseHealthNetContextFromHeader(lines, i);
          if (!PROC_RE.test(ln)) continue;
        }
        const contextUpdate = extractEraMemberContextFromLine(ln, current, parserProfile);
        if (contextUpdate) {
          current = contextUpdate;
          if (!PROC_RE.test(ln)) continue;
        }
        const m = ln.match(PROC_RE);
        if (!m?.[1]) continue;
        const proc = String(m[1]).toUpperCase();
        if (proc !== 'H2022' && proc !== 'T2038') continue;

        const rowContextRaw = resolveContextNearProcLine(lines, i, current, parserProfile);
        const rowContext =
          parserProfile === 'health_net' ? resolveHealthNetBlockContextForRow(i, healthNetBlocks, rowContextRaw) : rowContextRaw;
        current = rowContext;
        const rowBlock = parserProfile === 'health_net' ? findHealthNetBlockForRow(i, healthNetBlocks) : null;
        const cinMapped =
          parserProfile === 'health_net' && rowContext.icn
            ? healthNetCinIndex.get(String(rowContext.icn || '').trim().toUpperCase())
            : null;

        const amounts = gatherAmounts(lines, i, parserProfile);
        const billed = amounts.length >= 1 ? toNum(amounts[0]) : null;
        const allowed = amounts.length >= 2 ? toNum(amounts[1]) : null;
        const paid = pickPaid(amounts);

        const svc = parseServiceDatesNearProcLine(lines, i, remittance_date);

        pageRows.push({
          payer: payerLocal,
          remittance_date,
          page: pageNum,
          member_name: String(cinMapped?.member_name || rowContext.member_name || '').trim(),
          hic: rowContext.hic,
          medi_cal_number: rowContext.medi,
          acnt: cinMapped?.acnt || rowContext.acnt,
          icn: rowContext.icn,
          proc: proc as any,
          service_from: svc.service_from,
          service_to: svc.service_to,
          billed,
          allowed,
          paid,
          source_line: [lines[i], lines[i + 1], lines[i + 2]].filter(Boolean).join(' | '),
          debug_block: rowBlock ? `${rowBlock.start}-${rowBlock.end}` : null,
          debug_mapped_member: cinMapped?.member_name || null,
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

  const hasPreviewFields = (row: EraRow | null) => {
    if (!row) return false;
    return Boolean(
      String(row.member_name || '').trim() ||
        String(row.acnt || '').trim() ||
        String(row.icn || '').trim() ||
        String(row.hic || '').trim() ||
        String(row.service_from || '').trim() ||
        String(row.service_to || '').trim()
    );
  };

  const runPreviewScan = async (mode: 'first_populated' | 'first_10') => {
    if (!file) return;
    setPreviewing(true);
    setPreviewProgress(null);
    setPreviewRow(null);
    setPreviewRows([]);
    setPreviewMessage(null);
    setError(null);
    setErrorDetails(null);
    try {
      const objectUrl = URL.createObjectURL(file);
      try {
        const pdfjs: any = await loadPdfJs();
        const loadingTask = pdfjs.getDocument({
          url: objectUrl,
          disableRange: false,
          disableStream: false,
          disableAutoFetch: false,
        });
        const pdf = await loadingTask.promise;
        let scannedLines = 0;
        let fallbackFirstRow: EraRow | null = null;
        const collectedRows: EraRow[] = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          setPreviewProgress({ currentPage: pageNum, totalPages: pdf.numPages, scannedLines });
          const page = await pdf.getPage(pageNum);
          const tc = await page.getTextContent();
          const items = (tc.items || []) as Array<any>;
          const textRows: Array<{ str: string; x: number; y: number }> = [];
          for (const it of items) {
            const str = String(it?.str || '').trim();
            if (!str) continue;
            const tr = it?.transform || [];
            const x = Number(tr?.[4] ?? 0);
            const y = Number(tr?.[5] ?? 0);
            textRows.push({ str, x, y });
          }
          const byY = new Map<number, Array<{ str: string; x: number }>>();
          for (const r of textRows) {
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
          scannedLines += lines.length;
          const remittance_date = parseRemitDate(lines);
          let current: EraMemberContext = {
            member_name: '',
            hic: null,
            medi: null,
            acnt: null,
            icn: null,
          };
          const healthNetCinIndex =
            parserProfile === 'health_net' ? buildHealthNetCinIndex(lines) : new Map<string, HealthNetCinIndexValue>();
          const healthNetBlocks = parserProfile === 'health_net' ? buildHealthNetMemberBlocks(lines) : [];

          for (let i = 0; i < lines.length; i++) {
            const ln = lines[i];
            if (parserProfile === 'health_net' && PATIENT_NAME_LABEL_RE.test(ln)) {
              current = parseHealthNetContextFromHeader(lines, i);
              if (!PROC_RE.test(ln)) continue;
            }
            const contextUpdate = extractEraMemberContextFromLine(ln, current, parserProfile);
            if (contextUpdate) {
              current = contextUpdate;
              if (!PROC_RE.test(ln)) continue;
            }
            const m = ln.match(PROC_RE);
            if (!m?.[1]) continue;
            const proc = String(m[1]).toUpperCase();
            if (proc !== 'H2022' && proc !== 'T2038') continue;

            const rowContextRaw = resolveContextNearProcLine(lines, i, current, parserProfile);
            const rowContext =
              parserProfile === 'health_net' ? resolveHealthNetBlockContextForRow(i, healthNetBlocks, rowContextRaw) : rowContextRaw;
            current = rowContext;
            const rowBlock = parserProfile === 'health_net' ? findHealthNetBlockForRow(i, healthNetBlocks) : null;
            const cinMapped =
              parserProfile === 'health_net' && rowContext.icn
                ? healthNetCinIndex.get(String(rowContext.icn || '').trim().toUpperCase())
                : null;

            const amounts = gatherAmounts(lines, i, parserProfile);
            const billed = amounts.length >= 1 ? toNum(amounts[0]) : null;
            const allowed = amounts.length >= 2 ? toNum(amounts[1]) : null;
            const paid = pickPaid(amounts);
            const svc = parseServiceDatesNearProcLine(lines, i, remittance_date);

            const candidate: EraRow = {
              payer: 'Health Net',
              remittance_date,
              page: pageNum,
              member_name: String(cinMapped?.member_name || rowContext.member_name || '').trim(),
              hic: rowContext.hic,
              medi_cal_number: rowContext.medi,
              acnt: cinMapped?.acnt || rowContext.acnt,
              icn: rowContext.icn,
              proc,
              service_from: svc.service_from,
              service_to: svc.service_to,
              billed,
              allowed,
              paid,
              source_line: [lines[i - 1], lines[i], lines[i + 1], lines[i + 2]].filter(Boolean).join(' | '),
              debug_block: rowBlock ? `${rowBlock.start}-${rowBlock.end}` : null,
              debug_mapped_member: cinMapped?.member_name || null,
            };

            if (!fallbackFirstRow) fallbackFirstRow = candidate;
            collectedRows.push(candidate);

            if (mode === 'first_populated' && hasPreviewFields(candidate)) {
              setPreviewRow(candidate);
              setPreviewRows([candidate]);
              setPreviewMessage(`Preview found populated fields on page ${pageNum}.`);
              setPreviewProgress({ currentPage: pageNum, totalPages: pdf.numPages, scannedLines });
              return;
            }

            if (mode === 'first_10' && collectedRows.length >= 10) {
              setPreviewRows(collectedRows.slice(0, 10));
              setPreviewRow(collectedRows[0] || null);
              setPreviewMessage(`Preview collected first ${Math.min(10, collectedRows.length)} payment rows.`);
              setPreviewProgress({ currentPage: pageNum, totalPages: pdf.numPages, scannedLines });
              return;
            }
          }
        }

        if (mode === 'first_10' && collectedRows.length) {
          setPreviewRows(collectedRows.slice(0, 10));
          setPreviewRow(collectedRows[0] || null);
          setPreviewMessage(`Preview collected ${collectedRows.length} payment row(s).`);
          return;
        }

        if (fallbackFirstRow) {
          setPreviewRow(fallbackFirstRow);
          setPreviewRows([fallbackFirstRow]);
          setPreviewMessage('Preview found a payment row, but member/date fields are still empty.');
        } else {
          setPreviewMessage('Preview found no H2022/T2038 payment row in this file.');
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to preview ERA records.');
      const detail = String(e?.stack || e?.cause || '').trim();
      if (detail) setErrorDetails(detail.slice(0, 4000));
    } finally {
      setPreviewing(false);
    }
  };

  const handlePreviewFirstRecord = async () => runPreviewScan('first_populated');
  const handlePreviewFirstTenRecords = async () => runPreviewScan('first_10');

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

  const toCacheKeyFromFile = (f: File | null, profile: EraParserProfile) => {
    if (!f) return null;
    return `file:${String(f.name || '').toLowerCase()}|${Number(f.size || 0)}|${Number(f.lastModified || 0)}|profile:${profile}|v:${ERA_PARSER_CACHE_VERSION}`;
  };

  const toCacheKeyFromPath = (p: string, profile: EraParserProfile) => {
    const v = String(p || '').trim().toLowerCase();
    if (!v) return null;
    return `path:${v}|profile:${profile}|v:${ERA_PARSER_CACHE_VERSION}`;
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
    setActiveParserProfile(normalizeEraParserProfile(data?.parserProfile));
    setActiveCacheKey(String(data?.cacheKey || cacheKey));
    setActiveTotalsVerified(Boolean(data?.totalsVerified));
    setActiveTotalsVerifiedAt((data?.totalsVerifiedAt || null) as EraCacheHistoryItem['totalsVerifiedAt']);
    return true;
  };

  const setTotalsReviewStatus = async (reviewed: boolean) => {
    if (!activeCacheKey || !auth?.currentUser) return;
    setTotalsReviewSaving(true);
    setError(null);
    setErrorDetails(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/era/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'set_totals_review',
          cacheKey: activeCacheKey,
          reviewed,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to update totals review status (HTTP ${res.status})`);
      }
      setActiveTotalsVerified(Boolean(data?.totalsVerified));
      setActiveTotalsVerifiedAt((data?.totalsVerifiedAt || null) as EraCacheHistoryItem['totalsVerifiedAt']);
      await fetchCacheHistory();
    } catch (e: any) {
      setError(e?.message || 'Failed to update totals review status.');
    } finally {
      setTotalsReviewSaving(false);
    }
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
        parserProfile,
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

  useEffect(() => {
    if (!auth?.currentUser) return;
    if (!initialCacheKey) return;
    if (rows.length > 0 || uploading) return;
    setUploading(true);
    setError(null);
    setErrorDetails(null);
    setPhase('parsing');
    tryLoadFromCache(initialCacheKey)
      .then((loaded) => {
        if (loaded) {
          setPhase('done');
          return;
        }
        setError('Could not load cached ERA parse from URL.');
        setPhase('idle');
      })
      .catch((e: any) => {
        setError(e?.message || 'Failed to load cached ERA parse from URL.');
        setPhase('idle');
      })
      .finally(() => setUploading(false));
  }, [auth?.currentUser, initialCacheKey]);

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

  const downloadClaimMatchCsv = () => {
    const csv = toClaimMatchCsv(claimMatchResults, claimMatchSummary);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `era_claim_reconciliation_${new Date().toISOString().slice(0, 10)}.csv`;
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
    setActiveParserProfile(normalizeEraParserProfile(parserProfile));
    setActiveCacheKey(null);
    setActiveTotalsVerified(false);
    setActiveTotalsVerifiedAt(null);
    setPhase('idle');
    setOpenProgress(null);
    setUploadProgress(null);
    setLastExtracted(null);
    try {
      const activeParserProfile = normalizeEraParserProfile(parserProfile);
      const cacheKey = toCacheKeyFromFile(file, activeParserProfile);
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
      setActiveCacheKey(cacheKey);
      setActiveTotalsVerified(false);
      setActiveTotalsVerifiedAt(null);
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
    const activeParserProfile = normalizeEraParserProfile(parserProfile);
    setUploading(true);
    setError(null);
    setErrorDetails(null);
    setFastFallbackNotice(null);
    setRows([]);
    setSummary(null);
    setActiveCacheKey(null);
    setActiveTotalsVerified(false);
    setActiveTotalsVerifiedAt(null);
    setPhase('idle');
    setOpenProgress(null);
    setUploadProgress(null);
    setLastExtracted(null);
    try {
      const cacheKey = toCacheKeyFromFile(file, activeParserProfile);
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
        const data: any = await fn({ fullPath: cleanupPath, parserProfile: activeParserProfile }).then((r) => r.data);
        if (!data?.success) throw new Error(String(data?.error || 'Server parse failed.'));
        const parsedPayer = String(data?.payer || 'Health Net');
        const parsedRows = Array.isArray(data?.rows) ? data.rows : [];
        const parsedSummary = (data?.summary || null) as EraSummary | null;
        setPayer(parsedPayer);
        setRows(parsedRows);
        setSummary(parsedSummary);
        setActiveParserProfile(activeParserProfile);
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
        setActiveCacheKey(cacheKey);
        setActiveTotalsVerified(false);
        setActiveTotalsVerifiedAt(null);
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
        setActiveCacheKey(cacheKey);
        setActiveTotalsVerified(false);
        setActiveTotalsVerifiedAt(null);
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
          const cacheKey = toCacheKeyFromFile(file, activeParserProfile);
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

  const clearSelectedFile = () => {
    setFile(null);
    setPreviewRow(null);
    setPreviewRows([]);
    setPreviewMessage(null);
    setPreviewProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      const apiBatches = Array.isArray(data?.batches) ? (data.batches as EraHistoryLookupBatch[]) : [];
      const apiSearched = Number(data?.searchedBatches || 0);
      if (apiSearched > 0 || cacheHistory.length === 0) {
        setHistoryLookupResults(apiBatches);
        setHistoryLookupSearchedBatches(apiSearched);
        return;
      }

      // Fallback: search currently listed parsed ERA caches directly by cacheKey.
      const fallbackMatches: EraHistoryLookupBatch[] = [];
      for (const item of cacheHistory.slice(0, 50)) {
        const batchRes = await fetch(`/api/admin/era/parse?cacheKey=${encodeURIComponent(item.cacheKey)}`, {
          method: 'GET',
          headers: { authorization: `Bearer ${idToken}` },
        });
        const batchData = (await batchRes.json().catch(() => ({}))) as any;
        if (!batchRes.ok || !batchData?.success) continue;
        const batchRows = Array.isArray(batchData?.rows) ? (batchData.rows as EraRow[]) : [];
        const matchedRows = batchRows.filter((row) => rowMatchesHistoryLookup(row, q));
        if (!matchedRows.length) continue;
        const memberKeys = new Set<string>();
        let totalPaid = 0;
        for (const row of matchedRows) {
          const key = String(row.acnt || '').trim() || String(row.member_name || '').trim();
          if (key) memberKeys.add(key);
          if (typeof row.paid === 'number' && Number.isFinite(row.paid)) totalPaid += row.paid;
        }
        fallbackMatches.push({
          cacheKey: item.cacheKey,
          fileName: String(batchData?.fileName || item.fileName || 'ERA PDF'),
          sourceMode: String(batchData?.sourceMode || item.sourceMode || 'unknown'),
          payer: String(batchData?.payer || item.payer || 'Health Net'),
          totalRows: Number(batchData?.rows?.length || item.totalRows || 0),
          updatedAt: batchData?.updatedAt || item.updatedAt || null,
          matchedRows: matchedRows.length,
          matchedMembers: memberKeys.size,
          totalPaid: Number(totalPaid.toFixed(2)),
          sampleRows: matchedRows.slice(0, 5),
          matchedRowsPreview: matchedRows.slice(0, 50),
        });
      }
      setHistoryLookupResults(fallbackMatches);
      setHistoryLookupSearchedBatches(Math.min(cacheHistory.length, 50));
    } catch (e: any) {
      setHistoryLookupResults([]);
      setHistoryLookupSearchedBatches(0);
      setError(e?.message || 'Failed to search saved ERA batches.');
    } finally {
      setHistoryLookupLoading(false);
    }
  };

  const runSubmittedClaimMatch = async () => {
    if (!auth?.currentUser || rows.length === 0) {
      setClaimMatchSummary(null);
      setClaimMatchResults([]);
      return;
    }
    setClaimMatchLoading(true);
    setPushMatchResult(null);
    setError(null);
    setErrorDetails(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/era/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'match_submitted_claims',
          rows,
          matchQuery: claimMatchFilter,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Submitted claim matching failed (HTTP ${res.status})`);
      }
      setClaimMatchSummary((data?.summary || null) as EraClaimMatchSummary | null);
      setClaimMatchResults(Array.isArray(data?.claims) ? (data.claims as EraClaimMatchResult[]) : []);
      setClaimResultViewFilter('all');
      setClaimMatchedRowKeys(Array.isArray(data?.matchedEraRowKeys) ? data.matchedEraRowKeys.map((v: any) => String(v)) : []);
      setClaimMatchEvaluated(true);
    } catch (e: any) {
      setClaimMatchSummary(null);
      setClaimMatchResults([]);
      setClaimMatchedRowKeys([]);
      setClaimMatchEvaluated(false);
      setError(e?.message || 'Failed to match submitted claims.');
    } finally {
      setClaimMatchLoading(false);
    }
  };

  const pushMatchedClaimFields = async () => {
    if (!auth?.currentUser || rows.length === 0 || pushReadyClaimMatches.length === 0) return;
    setPushMatchLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const selectedClaimKeys = pushReadyClaimMatches.map((m) => `${m.sourceTable}::${m.primaryKey}`);
      const res = await fetch('/api/admin/era/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'push_claim_match_fields',
          rows,
          matchQuery: claimMatchFilter,
          pushProc: pushAuthorizationType,
          selectedClaimKeys,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Push to Caspio failed (HTTP ${res.status})`);
      }
      setPushMatchResult({
        candidates: Number(data?.candidates || 0),
        pushed: Number(data?.pushed || 0),
        failed: Number(data?.failed || 0),
      });
      if (Number(data?.failed || 0) > 0) {
        const failedLines = Array.isArray(data?.failedRows)
          ? data.failedRows.slice(0, 5).map((f: any) => `${String(f?.claimKey || 'claim')}: ${String(f?.error || 'Failed')}`)
          : [];
        if (failedLines.length) setErrorDetails(failedLines.join('\n'));
      }
    } catch (e: any) {
      setPushMatchResult(null);
      setError(e?.message || 'Failed to push matched fields to Caspio.');
    } finally {
      setPushMatchLoading(false);
    }
  };

  const pushSingleMatchedClaimField = async () => {
    if (!auth?.currentUser || rows.length === 0 || !selectedPushTestClaim) return;
    setPushSingleMatchLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const selectedClaimKeys = [`${selectedPushTestClaim.sourceTable}::${selectedPushTestClaim.primaryKey}`];
      const res = await fetch('/api/admin/era/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'push_claim_match_fields',
          rows,
          matchQuery: claimMatchFilter,
          pushProc: pushAuthorizationType,
          selectedClaimKeys,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Single-record push to Caspio failed (HTTP ${res.status})`);
      }
      setPushMatchResult({
        candidates: Number(data?.candidates || 0),
        pushed: Number(data?.pushed || 0),
        failed: Number(data?.failed || 0),
      });
      if (Number(data?.failed || 0) > 0) {
        const failedLines = Array.isArray(data?.failedRows)
          ? data.failedRows.slice(0, 5).map((f: any) => `${String(f?.claimKey || 'claim')}: ${String(f?.error || 'Failed')}`)
          : [];
        if (failedLines.length) setErrorDetails(failedLines.join('\n'));
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to test-push selected claim to Caspio.');
    } finally {
      setPushSingleMatchLoading(false);
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

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">ERA PDF</div>
              <Input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="text-xs text-muted-foreground">
                Best results when the PDF has selectable text (not a scanned image).
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs sm:col-span-2 lg:col-span-3 xl:col-span-4">
                <span className="text-muted-foreground">Parse layout:</span>
                <Button
                  type="button"
                  size="sm"
                  variant={parserProfile === 'health_net' ? 'default' : 'outline'}
                  className="h-7 px-2 text-[11px]"
                  disabled={uploading}
                  onClick={() => setParserProfile('health_net')}
                >
                  Health Net version
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={parserProfile === 'claimsmd' ? 'default' : 'outline'}
                  className="h-7 px-2 text-[11px]"
                  disabled={uploading}
                  onClick={() => setParserProfile('claimsmd')}
                >
                  ClaimsMD version
                </Button>
              </div>
              <Button onClick={handleParse} disabled={!file || uploading} className="w-full justify-start">
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                {uploading
                  ? phase === 'extracting' && extractProgress
                    ? `Parsing pages ${extractProgress.currentPage}/${extractProgress.totalPages}`
                    : phaseLabel(phase)
                  : 'Parse ERA (fast)'}
              </Button>
              <Button
                variant="secondary"
                onClick={handlePreviewFirstRecord}
                disabled={!file || uploading || previewing}
                className="w-full justify-start"
              >
                {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Preview first record
              </Button>
              <Button
                variant="secondary"
                onClick={handlePreviewFirstTenRecords}
                disabled={!file || uploading || previewing}
                className="w-full justify-start"
              >
                {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Preview first 10 records
              </Button>
              <Button variant="outline" onClick={handleParseLocal} disabled={!file || uploading} className="w-full justify-start">
                Parse locally (slow)
              </Button>
              <Button variant="outline" onClick={clearSelectedFile} disabled={uploading || !file} className="w-full justify-start">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete selected file
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push('/admin/era-parser/history')}
                disabled={uploading}
                className="w-full justify-start"
              >
                Open ERA tracker
              </Button>
            </div>
          </div>
          {(previewing || previewRow || previewRows.length || previewMessage) && !uploading ? (
            <div className="rounded-md border bg-muted/20 p-3 space-y-2 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">ERA preview (before full parse)</div>
                {previewProgress ? (
                  <div className="text-xs text-muted-foreground tabular-nums">
                    Page {previewProgress.currentPage}/{previewProgress.totalPages} • {previewProgress.scannedLines} lines scanned
                  </div>
                ) : null}
              </div>
              {previewProgress ? (
                <Progress
                  value={Math.round((previewProgress.currentPage / Math.max(1, previewProgress.totalPages)) * 100)}
                  className="h-2"
                />
              ) : null}
              {previewMessage ? <div className="text-xs text-muted-foreground">{previewMessage}</div> : null}
              {previewRow ? (
                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0 break-words"><span className="text-muted-foreground">Member:</span> {String(previewRow.member_name || '').trim() || '—'}</div>
                  <div className="min-w-0 break-all"><span className="text-muted-foreground">ACNT:</span> {String(previewRow.acnt || '').trim() || '—'}</div>
                  <div className="min-w-0 break-all"><span className="text-muted-foreground">ICN:</span> {String(previewRow.icn || '').trim() || '—'}</div>
                  <div className="min-w-0 break-all"><span className="text-muted-foreground">HIC:</span> {String(previewRow.hic || '').trim() || '—'}</div>
                  <div className="min-w-0 break-all"><span className="text-muted-foreground">Svc from:</span> {String(previewRow.service_from || '').trim() || '—'}</div>
                  <div className="min-w-0 break-all"><span className="text-muted-foreground">Svc to:</span> {String(previewRow.service_to || '').trim() || '—'}</div>
                  <div className="min-w-0 break-all"><span className="text-muted-foreground">PROC:</span> {String(previewRow.proc || '').trim() || '—'}</div>
                  <div className="min-w-0 break-all">
                    <span className="text-muted-foreground">Paid:</span>{' '}
                    {typeof previewRow.paid === 'number' && Number.isFinite(previewRow.paid)
                      ? `$${previewRow.paid.toFixed(2)}`
                      : '—'}
                  </div>
                </div>
              ) : null}
              {previewRow?.source_line ? (
                <pre className="max-h-28 overflow-auto rounded-md bg-white/70 p-2 text-[11px] whitespace-pre-wrap break-all">
                  {previewRow.source_line}
                </pre>
              ) : null}
              {previewRows.length > 1 ? (
                <div className="rounded-md border bg-white/70">
                  <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">First 10 records debug</div>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50">
                        <tr className="text-left">
                          <th className="px-2 py-1">#</th>
                          <th className="px-2 py-1">Pg</th>
                          <th className="px-2 py-1">PROC</th>
                          <th className="px-2 py-1">Member</th>
                          <th className="px-2 py-1">ACNT</th>
                          <th className="px-2 py-1">ICN</th>
                          <th className="px-2 py-1">Block</th>
                          <th className="px-2 py-1">Mapped</th>
                          <th className="px-2 py-1">HIC</th>
                          <th className="px-2 py-1">Svc from</th>
                          <th className="px-2 py-1">Svc to</th>
                          <th className="px-2 py-1 text-right">Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, idx) => (
                          <tr key={`preview-${idx}-${r.page}-${r.proc}-${r.paid}`} className="border-t align-top">
                            <td className="px-2 py-1">{idx + 1}</td>
                            <td className="px-2 py-1">{r.page || '—'}</td>
                            <td className="px-2 py-1">{r.proc || '—'}</td>
                            <td className="px-2 py-1 max-w-[220px] break-words">{r.member_name || '—'}</td>
                            <td className="px-2 py-1 break-all">{r.acnt || '—'}</td>
                            <td className="px-2 py-1 break-all">{r.icn || '—'}</td>
                            <td className="px-2 py-1 break-all">{r.debug_block || '—'}</td>
                            <td className="px-2 py-1 max-w-[180px] break-words">{r.debug_mapped_member || '—'}</td>
                            <td className="px-2 py-1 break-all">{r.hic || '—'}</td>
                            <td className="px-2 py-1 break-all">{r.service_from || '—'}</td>
                            <td className="px-2 py-1 break-all">{r.service_to || '—'}</td>
                            <td className="px-2 py-1 text-right">
                              {typeof r.paid === 'number' && Number.isFinite(r.paid) ? `$${r.paid.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              Parsed {payer} ERA at {parsedAtLabel}
            </CardDescription>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Parser mode:</span>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                {activeParserProfile === 'claimsmd' ? 'ClaimsMD version' : 'Health Net version'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                  activeTotalsVerified ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {activeTotalsVerified ? 'Totals reviewed: Looks right' : 'Totals review pending'}
              </span>
              {activeTotalsVerifiedAt ? (
                <span className="text-muted-foreground">Updated {formatCacheTimestamp(activeTotalsVerifiedAt)}</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={activeTotalsVerified ? 'outline' : 'default'}
                disabled={!activeCacheKey || totalsReviewSaving}
                onClick={() => setTotalsReviewStatus(true)}
              >
                {totalsReviewSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Totals look right
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTotalsVerified ? 'default' : 'outline'}
                disabled={!activeCacheKey || totalsReviewSaving}
                onClick={() => setTotalsReviewStatus(false)}
              >
                Mark needs review
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">T2038 payments (total paid)</div>
              <div className="text-2xl font-semibold">${Number(paymentBreakdown.t2038Total || 0).toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {summary?.t2038?.rows || 0} payments • {summary?.t2038?.members || 0} members • {paymentBreakdown.t2038NegativeCount}{' '}
                offsets
              </div>
              <div className="text-xs text-muted-foreground">
                Avg paid per T2038 line: {typeof paymentBreakdown.t2038AveragePaid === 'number' ? `$${paymentBreakdown.t2038AveragePaid.toFixed(2)}` : '—'}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">H2022 payments (total paid)</div>
              <div className="text-2xl font-semibold">${Number(paymentBreakdown.h2022Total || 0).toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {summary?.h2022?.rows || 0} payments • {summary?.h2022?.members || 0} members • {paymentBreakdown.h2022NegativeCount}{' '}
                offsets
              </div>
              <div className="text-xs text-muted-foreground">
                Avg paid per H2022 line: {typeof paymentBreakdown.h2022AveragePaid === 'number' ? `$${paymentBreakdown.h2022AveragePaid.toFixed(2)}` : '—'}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Subtotal (T2038 + H2022)</div>
              <div className="text-2xl font-semibold">${Number(paymentBreakdown.parsedSubtotal || 0).toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {summary?.total_rows || rows.length} payments • H2022 + T2038 only
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Offsets / adjustments</div>
              <div
                className={`text-2xl font-semibold ${
                  typeof paymentBreakdown.offsetAdjustment === 'number' && Math.abs(paymentBreakdown.offsetAdjustment) > 0.01
                    ? paymentBreakdown.offsetAdjustment > 0
                      ? 'text-green-700'
                      : 'text-amber-700'
                    : ''
                }`}
              >
                {typeof paymentBreakdown.offsetAdjustment === 'number'
                  ? `$${Number(paymentBreakdown.offsetAdjustment).toFixed(2)}`
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground">ERA total - (H2022 + T2038 subtotal)</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">ERA net total</div>
              <div className="text-2xl font-semibold">
                {typeof paymentBreakdown.eraNetTotal === 'number'
                  ? `$${Number(paymentBreakdown.eraNetTotal).toFixed(2)}`
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground">
                {paymentBreakdown.negativeCount} negative line items • ${Number(paymentBreakdown.negativeTotal || 0).toFixed(2)}
              </div>
            </div>
          </CardContent>
          <CardContent className="pt-0">
            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              Total unique members: <span className="font-medium text-foreground">{totalMembers}</span>. H2022/T2038 totals are net totals and
              already include negative payment lines for those codes.
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
                <span className="mx-1 text-xs text-muted-foreground">PROC:</span>
                <Button
                  type="button"
                  size="sm"
                  variant={procFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setProcFilter('all')}
                >
                  All PROC
                </Button>
                {procFilterOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={procFilter === option.value ? 'default' : 'outline'}
                    onClick={() => setProcFilter(option.value)}
                  >
                    {option.value} ({option.count})
                  </Button>
                ))}
                <Button variant="outline" onClick={downloadCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={matchSortMode === 'none' ? 'default' : 'outline'}
                  onClick={() => setMatchSortMode('none')}
                  disabled={!claimMatchEvaluated}
                >
                  No match sort
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={matchSortMode === 'matched_first' ? 'default' : 'outline'}
                  onClick={() => setMatchSortMode('matched_first')}
                  disabled={!claimMatchEvaluated}
                >
                  Matched first
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={matchSortMode === 'unmatched_first' ? 'default' : 'outline'}
                  onClick={() => setMatchSortMode('unmatched_first')}
                  disabled={!claimMatchEvaluated}
                >
                  Unmatched first
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
            <div className="mb-4 rounded-md border p-3 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">Match submitted claims (Caspio)</div>
                  <div className="text-xs text-muted-foreground">
                    Pulls H2022/T2038 submitted claims from Caspio, matches Client_ID2 to ACNT and MCP_CIN to ICN, then compares
                    service dates and amount. Claims already marked Claim_Status &quot;Connections Paid RCFE&quot; are checked and flagged as
                    potential duplicate MCP payments when they match current ERA lines.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={runSubmittedClaimMatch} disabled={claimMatchLoading || uploading || rows.length === 0}>
                    {claimMatchLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Match Submitted Claims
                  </Button>
                  <Button variant="outline" onClick={downloadClaimMatchCsv} disabled={claimMatchLoading || claimMatchResults.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Download Reconciliation CSV
                  </Button>
                </div>
              </div>
              <Input
                value={claimMatchFilter}
                onChange={(e) => setClaimMatchFilter(e.target.value)}
                placeholder="Optional test filter: Carrington, Bradley • 7846 • 93898979E"
                className="w-full sm:max-w-xl"
              />
              {claimMatchSummary ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {claimMatchSummary.matchedClaims}/{claimMatchSummary.totalClaims} matched • High {claimMatchSummary.highConfidence} • Medium{' '}
                  {claimMatchSummary.mediumConfidence} • Low {claimMatchSummary.lowConfidence} • Unmatched {claimMatchSummary.unmatchedClaims} •
                  Potential duplicates {claimMatchSummary.potentialDuplicatePayments}
                  <br />
                  Submitted ${Number(claimMatchSummary.submittedChargesTotal || 0).toFixed(2)} • Matched paid $
                  {Number(claimMatchSummary.matchedPaidTotal || 0).toFixed(2)} • Variance $
                  {Number(claimMatchSummary.variance || 0).toFixed(2)}
                </div>
              ) : null}
              {claimMatchResults.length > 0 ? (
                <div className="rounded-md border p-2 space-y-2">
                  <div className="text-xs font-medium">Matcher result filters (click to view list)</div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: 'all', label: 'All', count: claimResultCounts.all },
                      { id: 'matched', label: 'Matched', count: claimResultCounts.matched },
                      { id: 'unmatched', label: 'Unmatched', count: claimResultCounts.unmatched },
                      { id: 'high', label: 'High', count: claimResultCounts.high },
                      { id: 'medium', label: 'Medium', count: claimResultCounts.medium },
                      { id: 'low', label: 'Low', count: claimResultCounts.low },
                      { id: 'potential_duplicates', label: 'Potential duplicates', count: claimResultCounts.potential_duplicates },
                      { id: 'variance', label: 'Variance', count: claimResultCounts.variance },
                    ] as Array<{ id: ClaimResultViewFilter; label: string; count: number }>).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setClaimResultViewFilter(item.id)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                          claimResultViewFilter === item.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span>{item.label}</span>
                        <span className={claimResultViewFilter === item.id ? 'text-slate-200' : 'text-muted-foreground'}>{item.count}</span>
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Variance means payment amount mismatch: `paidDelta = matched ERA paid - submitted claim charges`. Overall summary variance is
                    `matched paid total - submitted total`.
                  </div>
                </div>
              ) : null}
              {claimMatchSummary ? (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium">
                      Preview Caspio Match-field updates ({pushAuthorizationType}): {pushReadyClaimMatches.length}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant={pushAuthorizationType === 'H2022' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPushAuthorizationType('H2022')}
                        disabled={pushMatchLoading || pushSingleMatchLoading || claimMatchLoading}
                      >
                        H2022
                      </Button>
                      <Button
                        type="button"
                        variant={pushAuthorizationType === 'T2038' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPushAuthorizationType('T2038')}
                        disabled={pushMatchLoading || pushSingleMatchLoading || claimMatchLoading}
                      >
                        T2038
                      </Button>
                      <Button
                        variant="outline"
                        onClick={pushMatchedClaimFields}
                        disabled={pushMatchLoading || claimMatchLoading || pushReadyClaimMatches.length === 0}
                      >
                        {pushMatchLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Push {pushAuthorizationType} Match Fields
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 rounded-md border bg-slate-50/70 p-2">
                    <div className="text-xs font-medium">Test one-record push</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Selected test claim:</span>
                      <span className="font-medium text-foreground">
                        {selectedPushTestClaim
                          ? `${selectedPushTestClaim.primaryKey} (${selectedPushTestClaim.sourceTable})`
                          : 'None selected'}
                      </span>
                    </div>
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={pushSingleMatchedClaimField}
                        disabled={pushSingleMatchLoading || pushMatchLoading || claimMatchLoading || !selectedPushTestClaim}
                      >
                        {pushSingleMatchLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Test Push Selected Record
                      </Button>
                    </div>
                    {pushTestFieldPreview.length > 0 ? (
                      <div className="overflow-auto rounded-md border bg-white">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr className="text-left">
                              <th className="px-2 py-1.5 whitespace-nowrap">App field</th>
                              <th className="px-2 py-1.5 whitespace-nowrap">App value</th>
                              <th className="px-2 py-1.5 whitespace-nowrap">Caspio field</th>
                              <th className="px-2 py-1.5 whitespace-nowrap">Value to push</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pushTestFieldPreview.map((item) => (
                              <tr key={`${item.appField}-${item.caspioField}`} className="border-t">
                                <td className="px-2 py-1.5 whitespace-nowrap">{item.appField}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{item.appValue || '—'}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{item.caspioField}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{item.pushValue || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Choose a claim row below via "Set test" to preview field mapping.</div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    This writes only `Match*` fields on the selected Caspio authorization table and does not modify original claim fields.
                  </div>
                  {pushMatchResult ? (
                    <div className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                      Push result: {pushMatchResult.pushed}/{pushMatchResult.candidates} pushed
                      {pushMatchResult.failed > 0 ? ` • ${pushMatchResult.failed} failed` : ''}
                    </div>
                  ) : null}
                  {pushReadyClaimMatches.length > 0 ? (
                    <div className="overflow-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50">
                          <tr className="text-left">
                            <th className="px-2 py-1.5 whitespace-nowrap">Claim</th>
                            <th className="px-2 py-1.5 whitespace-nowrap">Match</th>
                            <th className="px-2 py-1.5 whitespace-nowrap">Match_Payment_Amount</th>
                            <th className="px-2 py-1.5 whitespace-nowrap">Match_Client_ID2_Confirm</th>
                            <th className="px-2 py-1.5 whitespace-nowrap">Match_Client_First</th>
                            <th className="px-2 py-1.5 whitespace-nowrap">Match_Client_Last</th>
                            <th className="px-2 py-1.5 whitespace-nowrap">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pushReadyClaimMatches.slice(0, 100).map((m) => (
                            <tr key={`push-preview-${m.sourceTable}-${m.primaryKey}`} className="border-t">
                              <td className="px-2 py-1.5 whitespace-nowrap">{m.primaryKey}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{m.proposedMatchFields?.Match || 'Matched'}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{m.proposedMatchFields?.Match_Payment_Amount || ''}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{m.proposedMatchFields?.Match_Client_ID2_Confirm || ''}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{m.proposedMatchFields?.Match_Client_First || ''}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{m.proposedMatchFields?.Match_Client_Last || ''}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">
                                <Button
                                  type="button"
                                  variant={pushTestClaimKey === `${m.sourceTable}::${m.primaryKey}` ? 'default' : 'outline'}
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => setPushTestClaimKey(`${m.sourceTable}::${m.primaryKey}`)}
                                >
                                  Set test
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {claimMatchResults.length > 0 ? (
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {filteredClaimMatchResults.slice(0, 80).map((match) => (
                    <div key={`${match.sourceTable}-${match.primaryKey}`} className="rounded-md border p-2 text-xs space-y-1">
                      <div className="font-medium flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                            match.matched ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${match.matched ? 'bg-green-600' : 'bg-red-600'}`} />
                          {match.matched ? 'Matched' : 'Unmatched'}
                        </span>
                        {match.proc} • {match.sourceTable} • Claim {match.primaryKey}
                        {match.potentialDuplicatePayment ? ' • Potential duplicate MCP payment' : ''}
                      </div>
                      <div className="text-muted-foreground">
                        Status: {match.claimStatus || '—'} • Client_ID2: {match.clientId2 || '—'} • MCP_CIN: {match.mcpCin || '—'} • Charges $
                        {typeof match.totalCharges === 'number' ? Number(match.totalCharges).toFixed(2) : '—'} • Matched paid $
                        {Number(match.matchedPaidTotal || 0).toFixed(2)} • Confidence {match.confidence}
                        {typeof match.paidDelta === 'number' && Number.isFinite(match.paidDelta) ? ` • Delta $${Number(match.paidDelta).toFixed(2)}` : ''}
                      </div>
                      <div className="text-muted-foreground">{match.reason}</div>
                    </div>
                  ))}
                  {filteredClaimMatchResults.length > 80 ? (
                    <div className="text-xs text-muted-foreground">
                      Showing first 80 of {filteredClaimMatchResults.length} claim(s) for filter "{claimResultViewFilter}".
                    </div>
                  ) : null}
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
                    <th className="px-3 py-2 whitespace-nowrap">Match</th>
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
                      <td className="px-3 py-2 whitespace-nowrap">
                        {(() => {
                          if (!claimMatchEvaluated) return <span className="text-xs text-muted-foreground">Not checked</span>;
                          const matched = matchedRowKeySet.has(eraRowMatchKey(r));
                          return matched ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                              Matched
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                              Unmatched
                            </span>
                          );
                        })()}
                      </td>
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

    </div>
  );
}

