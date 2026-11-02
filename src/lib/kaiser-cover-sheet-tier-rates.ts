/** Kaiser ALFT cover sheet — Max Tier Level Expenses Covered by KP (monthly). */
export const KAISER_COVER_SHEET_TIER_RATES: Record<number, number> = {
  1: 2871,
  2: 3430,
  3: 3989,
  4: 5387,
  5: 8124,
};

export const KAISER_COVER_AUTH_KP_TIER_FIELD = 'Dropdown15';
export const KAISER_COVER_AUTH_MAX_EXPENSE_FIELD =
  'Max Tier Level Expenses Covered by KP add in from table below';
export const KAISER_COVER_AUTH_TOTAL_FIELD = 'Auto calculated';
export const KAISER_COVER_AUTH_ROOM_BOARD_FIELD =
  'Members Financial Responsibility of Room and Board';

export const KAISER_COVER_REAUTH_KP_TIER_FIELD = 'Dropdown25';
export const KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD = 'Text24';
export const KAISER_COVER_REAUTH_TOTAL_FIELD = 'Text23';
export const KAISER_COVER_REAUTH_ROOM_BOARD_FIELD = 'Text22';

export function parseKaiserTierNumber(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/\b([1-5])\b/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

export function parseMoneyAmount(value: unknown): number {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const negative = /^-/.test(raw.replace(/\$/g, '').trim());
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

export function formatCoverSheetMoney(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${negative ? '-' : ''}$${formatted}`;
}

export function maxTierExpenseForTier(tier: number | null | undefined): number {
  if (!tier || !KAISER_COVER_SHEET_TIER_RATES[tier]) return 0;
  return KAISER_COVER_SHEET_TIER_RATES[tier];
}

export function computeCoverSheetTotalCosts(opts: {
  tier?: number | null;
  roomBoardAmount?: unknown;
}): { maxExpense: number; roomBoard: number; total: number; maxExpenseLabel: string; totalLabel: string } {
  const maxExpense = maxTierExpenseForTier(opts.tier ?? null);
  const roomBoard = parseMoneyAmount(opts.roomBoardAmount);
  const total = maxExpense + roomBoard;
  return {
    maxExpense,
    roomBoard,
    total,
    maxExpenseLabel: maxExpense ? formatCoverSheetMoney(maxExpense) : '',
    totalLabel: formatCoverSheetMoney(total),
  };
}

/**
 * Acrobat JavaScript that runs when Kaiser selects KP Tier Level on the downloaded PDF.
 * Updates Max Tier Expenses and Total Costs (= max + room & board).
 */
export function buildKaiserTierCalcAcrobatScript(): string {
  const ratesLiteral = Object.entries(KAISER_COVER_SHEET_TIER_RATES)
    .map(([tier, amount]) => `"Tier ${tier}":${amount}`)
    .join(',');
  return `
var KAISER_TIER_RATES = { ${ratesLiteral} };
function kaiserParseMoney(v) {
  if (v == null) return 0;
  var s = String(v);
  var neg = /^\\s*-/.test(s.replace(/\\$/g, ""));
  var n = Number(s.replace(/[^0-9.]/g, ""));
  if (!isFinite(n)) return 0;
  return neg ? -Math.abs(n) : n;
}
function kaiserFormatMoney(n) {
  if (!isFinite(n)) return "";
  var neg = n < 0;
  var abs = Math.abs(n);
  var parts = abs.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
  return (neg ? "-$" : "$") + parts.join(".");
}
function kaiserTierRate(tierValue) {
  var tier = String(tierValue || "").replace(/^\\s+|\\s+$/g, "");
  if (KAISER_TIER_RATES[tier] != null) return KAISER_TIER_RATES[tier];
  var m = tier.match(/\\b([1-5])\\b/);
  if (m) {
    var key = "Tier " + m[1];
    if (KAISER_TIER_RATES[key] != null) return KAISER_TIER_RATES[key];
  }
  return 0;
}
function kaiserApplyTier(tierField, maxField, rbField, totalField) {
  try {
    var rate = kaiserTierRate(this.getField(tierField).value);
    var maxF = this.getField(maxField);
    var rbF = this.getField(rbField);
    var totF = this.getField(totalField);
    if (maxF) maxF.value = rate ? kaiserFormatMoney(rate) : "";
    var rb = rbF ? kaiserParseMoney(rbF.value) : 0;
    if (totF) totF.value = kaiserFormatMoney(rate + rb);
  } catch (e) {}
}
function kaiserOnAuthTierChange() {
  if (typeof event != "undefined" && event.willCommit === false) return;
  kaiserApplyTier(
    "${KAISER_COVER_AUTH_KP_TIER_FIELD}",
    "${KAISER_COVER_AUTH_MAX_EXPENSE_FIELD}",
    "${KAISER_COVER_AUTH_ROOM_BOARD_FIELD}",
    "${KAISER_COVER_AUTH_TOTAL_FIELD}"
  );
}
function kaiserOnReauthTierChange() {
  if (typeof event != "undefined" && event.willCommit === false) return;
  kaiserApplyTier(
    "${KAISER_COVER_REAUTH_KP_TIER_FIELD}",
    "${KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD}",
    "${KAISER_COVER_REAUTH_ROOM_BOARD_FIELD}",
    "${KAISER_COVER_REAUTH_TOTAL_FIELD}"
  );
}
`.trim();
}

export function buildKaiserTierFieldKeystrokeScript(which: 'auth' | 'reauth'): string {
  return which === 'auth' ? 'kaiserOnAuthTierChange();' : 'kaiserOnReauthTierChange();';
}
