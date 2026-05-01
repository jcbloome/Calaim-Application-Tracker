import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

type EraRow = {
  payer: string;
  remittance_date: string | null;
  page: number;
  member_name: string;
  hic: string | null;
  medi_cal_number: string | null;
  acnt: string | null;
  icn: string | null;
  proc: "H2022" | "T2038";
  service_from: string | null;
  service_to: string | null;
  billed: number | null;
  allowed: number | null;
  paid: number | null;
  source_line: string;
};
type EraParserProfile = "health_net" | "claimsmd";

// Capture amounts like 123.45, 5693.46, 1,234.56, -123.45, or (123.45)
const AMOUNT_RE = /(?<!\d)(-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}|\((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\))(?!\d)/g;
// Support PROC values with or without separator before modifiers (e.g. "T2038 U5" or "T2038U5")
const PROC_RE = /\b(H2022|T2038)(?:\b|(?=[A-Z0-9]))/i;
const normalizeEraParserProfile = (value: unknown): EraParserProfile =>
  String(value || "").toLowerCase().includes("claims") ? "claimsmd" : "health_net";

const toIsoFromMmddyy = (mmddyy: string) => {
  const raw = String(mmddyy || "").trim();
  if (!/^\d{6}$/.test(raw)) return null;
  const mm = raw.slice(0, 2);
  const dd = raw.slice(2, 4);
  const yy = raw.slice(4, 6);
  const year = 2000 + Number(yy);
  return `${String(year)}-${mm}-${dd}`;
};

const toIsoFromMmdd = (mmdd: string, year: number) => {
  const raw = String(mmdd || "").trim();
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
  const m = line.match(new RegExp(`\\b${kw}\\b\\s*[:#]?\\s*(\\S+)`, "i"));
  return m?.[1] ? String(m[1]).trim() : null;
};

const segmentBetween = (line: string, startKw: string, endKws: string[]) => {
  const lower = line.toLowerCase();
  const startIdx = lower.indexOf(startKw.toLowerCase());
  if (startIdx < 0) return "";
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
  const name = segmentBetween(line, "NAME", ["HIC", "ACNT", "ICN"]);
  const hicSegment = segmentBetween(line, "HIC", ["ACNT", "ICN"]);
  const tokens = hicSegment ? hicSegment.split(/\s+/).filter(Boolean) : [];
  const hic = tokens.length >= 1 ? tokens[0] : null;
  const medi = tokens.length >= 2 ? tokens[1] : null;
  const acnt = findKwToken(line, "ACNT");
  const icn = findKwToken(line, "ICN");
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
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  const mm = String(Number(m[1] || 0)).padStart(2, "0");
  const dd = String(Number(m[2] || 0)).padStart(2, "0");
  const yyyyRaw = String(m[3] || "").trim();
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
    if (found && typeof found.index === "number") cut = Math.min(cut, found.index);
  }
  const name = tail
    .slice(0, cut)
    .replace(/^[:#\s-]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return name || null;
};

const extractCinFromLine = (line: string) => {
  const m = line.match(/\bCIN\b\s*[:#]?\s*([A-Z0-9-]{4,})\b/i);
  const token = m?.[1] ? String(m[1]).trim() : "";
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
  const raw = String(value || "").trim().replace(/\s+/g, " ");
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
  const matches = Array.from(String(line || "").matchAll(/\b(\d{3,6})\b/g)).map((m) => String(m[1] || ""));
  for (const token of matches) {
    const n = Number(token);
    if (token.length === 4 && Number.isFinite(n) && n >= 1900 && n <= 2100) continue;
    return token;
  }
  return null;
};

const extractCinTokenFromLine = (line: string) => {
  const tokens = Array.from(String(line || "").matchAll(/\b([A-Z0-9-]{6,14})\b/gi)).map((m) => String(m[1] || "").trim());
  const cleaned = tokens.filter((t) => {
    if (!t) return false;
    if (/^(claim|receipt|your|acct|date)$/i.test(t)) return false;
    if (/^\d{4}$/.test(t)) return false;
    if (!/\d/.test(t)) return false;
    if (!/[A-Z]/i.test(t)) return false;
    return true;
  });
  const preferred = cleaned.find((t) => !t.includes("-") && t.length >= 8 && t.length <= 12);
  if (preferred) return preferred;
  return cleaned[0] || null;
};

const stripAfterHeaderLabels = (value: string) =>
  String(value || "").split(/\b(Claim\s*#|Receipt\s*Date|Your\s*Acct|Patient\s*Name|CIN)\b/i)[0].trim();

const normalizeMemberCandidate = (value: string) =>
  stripAfterHeaderLabels(String(value || "").replace(/\s+(?=[A-Z0-9-]*\d)[A-Z0-9-]{3,}\s*$/i, "").trim());

const normalizeAcctToken = (value: string | null) => {
  const token = String(value || "").trim();
  if (!/^\d{4,6}$/.test(token)) return null;
  if (/^(19|20)\d{2}$/.test(token)) return null;
  const n = Number(token);
  if (!Number.isFinite(n) || n < 1000) return null;
  return token;
};

const parseHealthNetContextFromHeader = (lines: string[], headerIdx: number): EraMemberContext => {
  let member_name = "";
  let icn: string | null = null;
  let acnt: string | null = null;
  const maxEnd = Math.min(lines.length - 1, headerIdx + 14);
  for (let j = headerIdx; j <= maxEnd; j++) {
    const ln = String(lines[j] || "").replace(/\s+/g, " ").trim();
    if (!ln) continue;
    if (j > headerIdx && PATIENT_NAME_LABEL_RE.test(ln)) break;
    if (PATIENT_NAME_LABEL_RE.test(ln) && !member_name) {
      const inline = normalizeMemberCandidate(extractPatientNameFromLine(ln) || "");
      if (inline && isLikelyMemberName(inline)) member_name = inline;
      continue;
    }
    if (/\bCIN\b/i.test(ln) && !icn) {
      icn = extractCinFromLine(ln) || extractCinTokenFromLine(String(lines[j + 1] || "").replace(/\s+/g, " ").trim()) || null;
      continue;
    }
    if (YOUR_ACCT_LABEL_RE.test(ln) && !acnt) {
      acnt =
        normalizeAcctToken(extractYourAcctFromLine(ln)) ||
        normalizeAcctToken(extractAccountTokenFromLine(String(lines[j + 1] || "").replace(/\s+/g, " ").trim()));
      continue;
    }
  }
  return { member_name, hic: null, medi: null, acnt, icn };
};

type HealthNetCinIndexValue = { member_name: string; acnt: string | null };
const buildHealthNetCinIndex = (lines: string[]) => {
  const map = new Map<string, HealthNetCinIndexValue>();
  for (let i = 0; i < lines.length; i++) {
    const ln = String(lines[i] || "").replace(/\s+/g, " ").trim();
    if (!ln || !PATIENT_NAME_LABEL_RE.test(ln)) continue;
    const parsed = parseHealthNetContextFromHeader(lines, i);
    const icn = String(parsed.icn || "").trim().toUpperCase();
    if (!icn || !parsed.member_name) continue;
    map.set(icn, { member_name: parsed.member_name, acnt: parsed.acnt || null });
  }
  return map;
};

type HealthNetMemberBlock = { start: number; end: number; context: EraMemberContext };
const parseHealthNetBlockContextByRange = (lines: string[], start: number, end: number): EraMemberContext => {
  let member_name = "";
  let icn: string | null = null;
  let acnt: string | null = null;
  const maxScan = Math.min(end, start + 14);
  for (let j = start; j <= maxScan; j++) {
    const ln = String(lines[j] || "").replace(/\s+/g, " ").trim();
    if (!ln) continue;
    if (PATIENT_NAME_LABEL_RE.test(ln) && !member_name) {
      const inline = normalizeMemberCandidate(extractPatientNameFromLine(ln) || "");
      if (inline && isLikelyMemberName(inline)) member_name = inline;
      continue;
    }
    if (!member_name) {
      const candidate = normalizeMemberCandidate(ln);
      if (candidate && isLikelyMemberName(candidate)) member_name = candidate;
    }
    if (!icn && /\bCIN\b/i.test(ln)) {
      icn = extractCinFromLine(ln) || extractCinTokenFromLine(String(lines[j + 1] || "").replace(/\s+/g, " ").trim()) || null;
      continue;
    }
    if (!acnt && YOUR_ACCT_LABEL_RE.test(ln)) {
      acnt =
        normalizeAcctToken(extractYourAcctFromLine(ln)) ||
        normalizeAcctToken(extractAccountTokenFromLine(String(lines[j + 1] || "").replace(/\s+/g, " ").trim()));
      continue;
    }
  }
  return { member_name, hic: null, medi: null, acnt, icn };
};
const buildHealthNetMemberBlocks = (lines: string[]) => {
  const headers: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (PATIENT_NAME_LABEL_RE.test(String(lines[i] || ""))) headers.push(i);
  }
  const blocks: HealthNetMemberBlock[] = [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i];
    const end = i + 1 < headers.length ? headers[i + 1] - 1 : lines.length - 1;
    blocks.push({ start, end, context: parseHealthNetBlockContextByRange(lines, start, end) });
  }
  return blocks;
};
const resolveHealthNetBlockContextForRow = (idx: number, blocks: HealthNetMemberBlock[], fallback: EraMemberContext): EraMemberContext => {
  for (const block of blocks) {
    if (idx >= block.start && idx <= block.end) {
      return {
        member_name: block.context.member_name || "",
        hic: null,
        medi: null,
        acnt: block.context.acnt || null,
        icn: block.context.icn || null,
      };
    }
  }
  return fallback;
};

const resolveHealthNetContextBackward = (lines: string[], idx: number, current: EraMemberContext): EraMemberContext => {
  const clean = (v: string) => String(v || "").replace(/\s+/g, " ").trim();
  let member = "";
  let acnt: string | null = null;
  let icn: string | null = null;
  const radius = 180;

  const nearestLabelIndex = (labelRe: RegExp) => {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    const min = Math.max(0, idx - radius);
    const max = Math.min(lines.length - 1, idx + radius);
    for (let j = min; j <= max; j++) {
      const ln = clean(lines[j] || "");
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
    const ln = clean(lines[at] || "");
    const inline = normalizeMemberCandidate(extractPatientNameFromLine(ln) || "");
    if (inline && isLikelyMemberName(inline)) return inline;
    const next = clean(lines[at + 1] || "");
    const fallback = normalizeMemberCandidate(next);
    if (fallback && isLikelyMemberName(fallback)) return fallback;
    return "";
  };

  const acctFromLabel = (at: number) => {
    const ln = clean(lines[at] || "");
    const inline = normalizeAcctToken((ln.match(/\bYour\s*Acct\s*#?\s*[:#]?\s*(\d{4,6})\b/i)?.[1] || "").trim());
    if (inline) return inline;
    const next = clean(lines[at + 1] || "");
    if (/\b(claim\s*#|receipt\s*date)\b/i.test(next)) return null;
    return normalizeAcctToken((next.match(/\b(\d{4,6})\b/)?.[1] || "").trim());
  };

  const cinFromLabel = (at: number) => {
    const ln = clean(lines[at] || "");
    const inline = extractCinFromLine(ln);
    if (inline) return inline;
    const next = clean(lines[at + 1] || "");
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
    member_name: member || (!foundAnyLabel ? String(current.member_name || "").trim() : "") || "",
    hic: null,
    medi: null,
    acnt: acnt || (!foundAnyLabel ? String(current.acnt || "").trim() : "") || null,
    icn: icn || (!foundAnyLabel ? String(current.icn || "").trim() : "") || null,
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
    parserProfile === "health_net" &&
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
  if (parserProfile === "health_net") {
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

  if (parserProfile === "claimsmd") {
    const patientName = extractPatientNameFromLine(line);
    if (patientName) {
      next.member_name = patientName;
      changed = true;
    }
    const cin = extractCinFromLine(line);
    if (cin) {
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
    .map((mm) => String(mm?.[0] || "").trim())
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

  const tokens = String(line || "").trim().split(/\s+/).filter(Boolean);
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
  if (parserProfile === "health_net") {
    return resolveHealthNetContextBackward(lines, idx, current);
  }

  let resolved: EraMemberContext = { ...current };

  // Health Net remits can contain multiple member blocks per page.
  // Anchor each PROC row to the nearest preceding member header to avoid cross-member bleed.
  let start = Math.max(0, idx - 12);
  if (parserProfile === "health_net") {
    const minScan = Math.max(0, idx - 120);
    for (let j = idx; j >= minScan; j--) {
      const ln = String(lines[j] || "");
      if (/\bPatient\s+Name\b/i.test(ln)) {
        start = j;
        break;
      }
    }
    // Fresh context from the detected member block.
    resolved = {
      member_name: "",
      hic: null,
      medi: null,
      acnt: null,
      icn: null,
    };
  }

  const end = Math.min(lines.length - 1, idx + 2);
  for (let j = start; j <= end; j++) {
    const update = extractEraMemberContextFromLine(lines[j] || "", resolved, parserProfile);
    if (update) resolved = update;
  }

  // Extra Health Net fallback: labels and values are often split across adjacent lines.
  if (parserProfile === "health_net") {
    const cleanLine = (value: string) => String(value || "").replace(/\s+/g, " ").trim();
    const nextNonLabelLine = (from: number, maxAhead = 3) => {
      for (let k = from + 1; k <= Math.min(end, from + maxAhead); k++) {
        const cand = cleanLine(lines[k] || "");
        if (!cand) continue;
        if (/\b(patient\s+name|cin|your\s+acct|claim\s*#|receipt\s+date)\b/i.test(cand)) continue;
        return cand;
      }
      return "";
    };

    let lastPatientIdx = -1;
    let lastCinIdx = -1;
    let lastAcctIdx = -1;
    for (let j = start; j <= end; j++) {
      const ln = cleanLine(lines[j] || "");
      if (!ln) continue;
      if (/\bPatient\s+Name\b/i.test(ln)) lastPatientIdx = j;
      if (/\bCIN\b/i.test(ln)) lastCinIdx = j;
      if (/\bYour\s+Acct\b/i.test(ln)) lastAcctIdx = j;
    }

    if (lastPatientIdx >= 0) {
      const pLine = cleanLine(lines[lastPatientIdx] || "");
      const inline = normalizeMemberCandidate(extractPatientNameFromLine(pLine) || "");
      if (inline && isLikelyMemberName(inline)) {
        resolved.member_name = inline;
      } else {
        const fallback = normalizeMemberCandidate(nextNonLabelLine(lastPatientIdx));
        if (fallback && isLikelyMemberName(fallback)) resolved.member_name = fallback;
      }
    }

    if (lastCinIdx >= 0) {
      const cLine = cleanLine(lines[lastCinIdx] || "");
      const inlineCin = extractCinFromLine(cLine);
      if (inlineCin) {
        resolved.icn = inlineCin;
      } else {
        const fallbackCin = extractCinTokenFromLine(nextNonLabelLine(lastCinIdx));
        if (fallbackCin) resolved.icn = fallbackCin;
      }
    }

    if (lastAcctIdx >= 0) {
      const aLine = cleanLine(lines[lastAcctIdx] || "");
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
  const isParen = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = raw.replace(/[(),]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return isParen ? -Math.abs(n) : n;
};

const extractAmountsFromLine = (line: string) =>
  Array.from(String(line || "").matchAll(AMOUNT_RE))
    .map((mm) => mm?.[1])
    .filter(Boolean)
    .map((v) => String(v));

const gatherAmounts = (lines: string[], idx: number) => {
  const first = extractAmountsFromLine(lines[idx] || "");
  // If the proc line already has billed/allowed/net, don't scan into PT RESP / totals.
  if (first.length >= 3) return first.slice(0, 6);

  const out: string[] = [...first];
  const stopLine = (ln: string) =>
    /\bPatient\s+Name\b/i.test(ln) ||
    /\bNAME\b/i.test(ln) ||
    PROC_RE.test(ln) ||
    /^\s*PT\s*RESP\b/i.test(ln) ||
    /\bCLAIM\s+TOTALS\b/i.test(ln) ||
    /^\s*ADJ\s+TO\s+TOTAL\b/i.test(ln) ||
    /^\s*STATUS\s+CODE\b/i.test(ln) ||
    /\bINTEREST\b/i.test(ln) ||
    /\bLATE\s+FILING\b/i.test(ln);

  // Some ERAs wrap amounts onto the next line only; scan forward a little.
  for (let j = idx + 1; j < Math.min(lines.length, idx + 8); j++) {
    const ln = String(lines[j] || "");
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
  if ((last === null || last === 0) && typeof third === "number" && third !== 0) return third;
  return typeof last === "number" ? last : null;
};

const parseEraGrandTotalFromLines = (lines: string[]) => {
  for (let i = 0; i < lines.length; i++) {
    const ln = String(lines[i] || "");
    if (!/\bTOTALS:\b/i.test(ln)) continue;
    for (let j = i; j < Math.min(lines.length, i + 8); j++) {
      const amounts = extractAmountsFromLine(lines[j] || "");
      if (amounts.length < 3) continue;
      const nums = amounts
        .map((a) => toNum(a))
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
      if (!nums.length) continue;
      return nums[nums.length - 1];
    }
  }
  return null as number | null;
};

async function requireSuperAdmin(auth: any) {
  const uid = String(auth?.uid || "").trim();
  const token = auth?.token || {};
  const email = String(token?.email || "").trim().toLowerCase();
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required.");

  let ok = Boolean(token?.superAdmin);
  if (!ok) {
    const db = admin.firestore();
    const byUid = await db.collection("roles_super_admin").doc(uid).get();
    ok = byUid.exists;
    if (!ok && email) {
      const byEmail = await db.collection("roles_super_admin").doc(email).get();
      ok = byEmail.exists;
    }
  }
  if (!ok) throw new HttpsError("permission-denied", "Super Admin privileges required.");
}

export const parseEraPdfFromStorage = onCall(
  {
    timeoutSeconds: 540,
    memory: "2GiB",
    cors: [/localhost/, /\.vercel\.app$/, /\.netlify\.app$/, /\.firebaseapp\.com$/],
  },
  async (request) => {
    await requireSuperAdmin(request.auth);

    const fullPath = String((request.data as any)?.fullPath || "").trim();
    const parserProfile = normalizeEraParserProfile((request.data as any)?.parserProfile);
    if (!fullPath) throw new HttpsError("invalid-argument", "Missing fullPath.");
    if (!fullPath.startsWith("era_parser_uploads/")) {
      throw new HttpsError("invalid-argument", "fullPath must be under era_parser_uploads/.");
    }

    const bucket = admin.storage().bucket();
    const file = bucket.file(fullPath);
    const [buf] = await file.download();

    // pdfjs in Node (no worker)
    const mod: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjs: any = mod?.getDocument ? mod : mod?.default || mod;
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf), disableWorker: true });
    const pdf = await loadingTask.promise;

    const payer = "Health Net";
    const allRows: EraRow[] = [];
    let eraGrandTotal: number | null = null;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const tc = await page.getTextContent();
      const items = (tc.items || []) as Array<any>;
      const glyphs: Array<{ str: string; x: number; y: number }> = [];
      for (const it of items) {
        const str = String(it?.str || "").trim();
        if (!str) continue;
        const tr = it?.transform || [];
        const x = Number(tr?.[4] ?? 0);
        const y = Number(tr?.[5] ?? 0);
        glyphs.push({ str, x, y });
      }
      const byY = new Map<number, Array<{ str: string; x: number }>>();
      for (const g of glyphs) {
        const yk = Math.round(g.y);
        const arr = byY.get(yk) || [];
        arr.push({ str: g.str, x: g.x });
        byY.set(yk, arr);
      }
      const yKeys = Array.from(byY.keys()).sort((a, b) => b - a);
      const lines: string[] = [];
      for (const yk of yKeys) {
        const parts = (byY.get(yk) || []).sort((a, b) => a.x - b.x).map((p) => p.str);
        const ln = parts.join(" ").replace(/\s{2,}/g, " ").trim();
        if (ln) lines.push(ln);
      }
      const pageGrandTotal = parseEraGrandTotalFromLines(lines);
      if (typeof pageGrandTotal === "number" && Number.isFinite(pageGrandTotal)) {
        eraGrandTotal = pageGrandTotal;
      }

      const remittance_date = parseRemitDate(lines);
      let current: EraMemberContext = {
        member_name: "",
        hic: null as string | null,
        medi: null as string | null,
        acnt: null as string | null,
        icn: null as string | null,
      };
      const healthNetCinIndex =
        parserProfile === "health_net" ? buildHealthNetCinIndex(lines) : new Map<string, HealthNetCinIndexValue>();
      const healthNetBlocks = parserProfile === "health_net" ? buildHealthNetMemberBlocks(lines) : [];

      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const contextUpdate = extractEraMemberContextFromLine(ln, current, parserProfile);
        if (contextUpdate) {
          current = contextUpdate;
          if (!PROC_RE.test(ln)) continue;
        }
        const m = ln.match(PROC_RE);
        if (!m?.[1]) continue;
        const proc = String(m[1]).toUpperCase();
        if (proc !== "H2022" && proc !== "T2038") continue;

        const rowContextRaw = resolveContextNearProcLine(lines, i, current, parserProfile);
        const rowContext =
          parserProfile === "health_net" ? resolveHealthNetBlockContextForRow(i, healthNetBlocks, rowContextRaw) : rowContextRaw;
        current = rowContext;
        const cinMapped =
          parserProfile === "health_net" && rowContext.icn
            ? healthNetCinIndex.get(String(rowContext.icn || "").trim().toUpperCase())
            : null;

        const amounts = gatherAmounts(lines, i);
        const billed = amounts.length >= 1 ? toNum(amounts[0]) : null;
        const allowed = amounts.length >= 2 ? toNum(amounts[1]) : null;
        const paid = pickPaid(amounts);
        const svc = parseServiceDatesNearProcLine(lines, i, remittance_date);

        allRows.push({
          payer,
          remittance_date,
          page: pageNum,
          member_name: String(cinMapped?.member_name || rowContext.member_name || "").trim(),
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
          source_line: [lines[i], lines[i + 1], lines[i + 2]].filter(Boolean).join(" | "),
        });
      }
    }

    const sumPaid = (code: "H2022" | "T2038") =>
      Number(
        allRows
          .filter((r) => r.proc === code)
          .map((r) => r.paid)
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
          .reduce((a, b) => a + b, 0)
          .toFixed(2)
      );
    const uniqueMembers = (code: "H2022" | "T2038") => {
      const s = new Set<string>();
      for (const r of allRows) {
        if (r.proc !== code) continue;
        const key = String(r.acnt || "").trim() || String(r.member_name || "").trim();
        if (key) s.add(key);
      }
      return s.size;
    };

    const t2038Total = sumPaid("T2038");
    const h2022Total = sumPaid("H2022");
    const parserTotal = Number((t2038Total + h2022Total).toFixed(2));
    const summary = {
      total_rows: allRows.length,
      t2038: { rows: allRows.filter((r) => r.proc === "T2038").length, members: uniqueMembers("T2038"), total_paid: t2038Total },
      h2022: { rows: allRows.filter((r) => r.proc === "H2022").length, members: uniqueMembers("H2022"), total_paid: h2022Total },
      era_grand_total: eraGrandTotal,
      parser_total: parserTotal,
      variance: typeof eraGrandTotal === "number" ? Number((parserTotal - eraGrandTotal).toFixed(2)) : null,
    };

    // Return rows + summary (UI can limit display)
    return { success: true, payer, summary, rows: allRows };
  }
);

