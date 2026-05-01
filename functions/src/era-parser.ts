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
  const m = line.match(/\bPatient\s+Name\b/i);
  if (!m) return null;
  const start = (m.index ?? 0) + m[0].length;
  const tail = line.slice(start);
  const cutPatterns = [/\bYour\s+Acct\b/i, /\bClaim\s*#\b/i, /\bReceipt\s+Date\b/i, /\bCIN\b/i, /\bHealth\s+Net\b/i, /\bQuestions\?\b/i];
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
  return m?.[1] ? String(m[1]).trim() : null;
};

const extractYourAcctFromLine = (line: string) => {
  const m = line.match(/\bYour\s+Acct\s*#?\s*[:#]?\s*([A-Z0-9-]{2,})\b/i);
  return m?.[1] ? String(m[1]).trim() : null;
};

const extractEraMemberContextFromLine = (
  line: string,
  current: EraMemberContext,
  parserProfile: EraParserProfile
): EraMemberContext | null => {
  let next: EraMemberContext = { ...current };
  let changed = false;

  if (parserProfile === "health_net" && /^\s*NAME\b/i.test(line)) {
    const parsed = extractNameHicAcntIcn(line);
    next = {
      member_name: parsed.name || "",
      hic: parsed.hic,
      medi: parsed.medi,
      acnt: parsed.acnt,
      icn: parsed.icn,
    };
    changed = true;
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

        const amounts = gatherAmounts(lines, i);
        const billed = amounts.length >= 1 ? toNum(amounts[0]) : null;
        const allowed = amounts.length >= 2 ? toNum(amounts[1]) : null;
        const paid = pickPaid(amounts);
        const svc = parseServiceDatesFromProcLine(ln, remittance_date);

        allRows.push({
          payer,
          remittance_date,
          page: pageNum,
          member_name: String(current.member_name || "").trim(),
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

