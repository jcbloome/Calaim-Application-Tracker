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

const ratesObjectLiteral = () =>
  Object.entries(KAISER_COVER_SHEET_TIER_RATES)
    .map(([tier, amount]) => `"Tier ${tier}":${amount}`)
    .join(',');

/** Shared Acrobat helpers inlined into every field action (no reliance on doc-level JS scope). */
function acrobatHelpersBlock(): string {
  return `
var __kRates={${ratesObjectLiteral()}};
function __kParseMoney(v){if(v==null)return 0;var s=String(v);var neg=/^\\s*-/.test(s.replace(/\\$/g,""));var n=Number(s.replace(/[^0-9.]/g,""));if(!isFinite(n))return 0;return neg?-Math.abs(n):n;}
function __kFormatMoney(n){if(!isFinite(n))return"";var neg=n<0;var abs=Math.abs(n);var p=abs.toFixed(2).split(".");p[0]=p[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,",");return(neg?"-$":"$")+p.join(".");}
function __kTierRate(tierValue){var tier=String(tierValue||"").replace(/^\\s+|\\s+$/g,"");if(__kRates[tier]!=null)return __kRates[tier];var m=tier.match(/\\b([1-5])\\b/);if(m&&__kRates["Tier "+m[1]]!=null)return __kRates["Tier "+m[1]];return 0;}
`.trim();
}

/**
 * Self-contained script: KP-approved tier only → Max Expense + Total Costs.
 * Never uses ILS requested tier — Kaiser may authorize a different level.
 * Optional overrideTier is used during dropdown Keystroke (event.change) before the
 * field value is committed, so amounts update immediately on selection.
 */
export function buildKaiserTierApplyInlineScript(opts: {
  tierField: string;
  maxField: string;
  roomBoardField: string;
  totalField: string;
}): string {
  const { tierField, maxField, roomBoardField, totalField } = opts;
  return `
${acrobatHelpersBlock()}
try{
  var tierVal = (typeof __kOverrideTier != "undefined" && __kOverrideTier != null && String(__kOverrideTier) !== "")
    ? String(__kOverrideTier)
    : String(this.getField("${tierField}").value || "");
  var rate=__kTierRate(tierVal);
  var maxF=this.getField("${maxField}");
  var rbF=this.getField("${roomBoardField}");
  var totF=this.getField("${totalField}");
  if(maxF) maxF.value = rate ? __kFormatMoney(rate) : "";
  var rb = rbF ? __kParseMoney(rbF.value) : 0;
  if(totF) totF.value = rate ? __kFormatMoney(rate + rb) : __kFormatMoney(rb);
}catch(e){}
`.trim();
}

/** Calculate script for Max Expense — blank until KP selects an approved tier. */
export function buildKaiserMaxExpenseCalculateScript(tierField: string): string {
  return `
${acrobatHelpersBlock()}
try{
  var rate=__kTierRate(this.getField("${tierField}").value);
  event.value = rate ? __kFormatMoney(rate) : "";
}catch(e){event.value="";}
`.trim();
}

/** Calculate script for Total Costs — uses KP tier rate only (not ILS requested). */
export function buildKaiserTotalCostsCalculateScript(opts: {
  tierField: string;
  maxField: string;
  roomBoardField: string;
}): string {
  const { tierField, maxField, roomBoardField } = opts;
  return `
${acrobatHelpersBlock()}
try{
  var rate=__kTierRate(this.getField("${tierField}").value);
  var maxF=this.getField("${maxField}");
  var rbF=this.getField("${roomBoardField}");
  var maxAmt = rate ? rate : (maxF ? __kParseMoney(maxF.value) : 0);
  var rb = rbF ? __kParseMoney(rbF.value) : 0;
  event.value = __kFormatMoney(maxAmt + rb);
}catch(e){event.value="$0.00";}
`.trim();
}

/**
 * Keystroke on KP tier dropdown — apply as soon as a list item is chosen.
 * Acrobat combo boxes fire Keystroke with willCommit=false and event.change = selected
 * option; waiting for willCommit/blur is what caused "updates only on next field".
 */
export function buildKaiserTierDropdownChangeScript(opts: {
  tierField: string;
  maxField: string;
  roomBoardField: string;
  totalField: string;
}): string {
  return `
${acrobatHelpersBlock()}
try{
  var __kOverrideTier = null;
  if (typeof event != "undefined") {
    var changeStr = event.change != null ? String(event.change) : "";
    var changeExStr = event.changeEx != null ? String(event.changeEx) : "";
    var valueStr = event.value != null ? String(event.value) : "";
    if (event.willCommit === false) {
      // Dropdown list pick: new value is usually in event.change before the field commits.
      if (changeStr !== "") __kOverrideTier = changeStr;
      else if (changeExStr !== "") __kOverrideTier = changeExStr;
      else if (valueStr !== "" && !/select from drop\\s*down/i.test(valueStr)) __kOverrideTier = valueStr;
      else return; // keystroke noise with no selection yet
    } else if (valueStr !== "") {
      __kOverrideTier = valueStr;
    }
  }
  ${buildKaiserTierApplyInlineScript(opts)}
}catch(e){}
`.trim();
}

export function buildKaiserTierCalcAcrobatScript(): string {
  return `
${acrobatHelpersBlock()}
function kaiserOnAuthTierChange(){
  ${buildKaiserTierDropdownChangeScript({
    tierField: KAISER_COVER_AUTH_KP_TIER_FIELD,
    maxField: KAISER_COVER_AUTH_MAX_EXPENSE_FIELD,
    roomBoardField: KAISER_COVER_AUTH_ROOM_BOARD_FIELD,
    totalField: KAISER_COVER_AUTH_TOTAL_FIELD,
  })}
}
function kaiserOnReauthTierChange(){
  ${buildKaiserTierDropdownChangeScript({
    tierField: KAISER_COVER_REAUTH_KP_TIER_FIELD,
    maxField: KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD,
    roomBoardField: KAISER_COVER_REAUTH_ROOM_BOARD_FIELD,
    totalField: KAISER_COVER_REAUTH_TOTAL_FIELD,
  })}
}
`.trim();
}
