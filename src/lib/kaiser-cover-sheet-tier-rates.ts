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

/** Pre-07/2026 template field names (still present on older archived cover sheets). */
export const KAISER_COVER_AUTH_TOTAL_FIELD_LEGACY = 'Text15';
export const KAISER_COVER_AUTH_MAX_EXPENSE_FIELD_LEGACY = 'Text14';
export const KAISER_COVER_REAUTH_KP_TIER_FIELD_LEGACY = 'Dropdown8';
export const KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD_LEGACY = 'Text4';
export const KAISER_COVER_REAUTH_TOTAL_FIELD_LEGACY = 'Text10';
export const KAISER_COVER_REAUTH_ROOM_BOARD_FIELD_LEGACY = 'Text3';

export const KAISER_COVER_AUTH_TOTAL_FIELD_NAMES = [
  KAISER_COVER_AUTH_TOTAL_FIELD,
  'Auto Calculated',
  'Auto-calculated',
  KAISER_COVER_AUTH_TOTAL_FIELD_LEGACY,
] as const;

export const KAISER_COVER_AUTH_MAX_FIELD_NAMES = [
  KAISER_COVER_AUTH_MAX_EXPENSE_FIELD,
  KAISER_COVER_AUTH_MAX_EXPENSE_FIELD_LEGACY,
] as const;

export const KAISER_COVER_REAUTH_TOTAL_FIELD_NAMES = [
  KAISER_COVER_REAUTH_TOTAL_FIELD,
  KAISER_COVER_REAUTH_TOTAL_FIELD_LEGACY,
] as const;

export const KAISER_COVER_REAUTH_MAX_FIELD_NAMES = [
  KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD,
  KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD_LEGACY,
] as const;

export const KAISER_COVER_REAUTH_KP_TIER_FIELD_NAMES = [
  KAISER_COVER_REAUTH_KP_TIER_FIELD,
  KAISER_COVER_REAUTH_KP_TIER_FIELD_LEGACY,
] as const;

/** Canonical KP Tier Level dropdown choices (never Yes/No). */
export const KAISER_COVER_KP_TIER_OPTIONS = [
  'Select from drop down',
  'Tier 1',
  'Tier 2',
  'Tier 3',
  'Tier 4',
  'Tier 5',
] as const;

/** Canonical Yes/No dropdown choices (facility vetted, ALW county, etc.). */
export const KAISER_COVER_YES_NO_OPTIONS = ['Select from drop down', 'Yes', 'No'] as const;

/**
 * Auth/reauth Yes/No combo boxes that must never become Tier 1–5.
 * Includes Dropdown8 on the current template (In ALW County) — only legacy PDFs used it for KP tier.
 */
export const KAISER_COVER_YES_NO_DROPDOWN_NAMES = [
  'Dropdown4',
  'Dropdown6',
  'Dropdown8', // Facility vetted / SCA contracted (auth) — above In-ALW on 07/2026 PDF
  'Dropdown9', // In ALW County (auth)
  'Dropdown18',
  'Dropdown20',
  'Dropdown21', // In ALW County (reauth)
  'Dropdown34', // Facility vetted / SCA contracted (reauth) — above In-ALW on 07/2026 PDF
] as const;

/**
 * Auth + reauth facility vetted / SCA contracted — always filled Yes for ILS cover sheets.
 * On the 07/2026 template these sit directly under move-in date (above In-ALW County).
 */
export const KAISER_COVER_VETTED_DROPDOWN_NAMES = ['Dropdown8', 'Dropdown34'] as const;

export function dropdownOptionsLookLikeTiers(options: unknown): boolean {
  const list = Array.isArray(options) ? options.map((o) => String(o || '').toLowerCase()) : [];
  const joined = list.join(' | ');
  return /\btier\b/.test(joined) && /\b[1-5]\b/.test(joined);
}

export function dropdownOptionsLookLikeYesNo(options: unknown): boolean {
  if (dropdownOptionsLookLikeTiers(options)) return false;
  const list = Array.isArray(options)
    ? options.map((o) =>
        String(o || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()
      )
    : [];
  return list.some((o) => o === 'yes') && list.some((o) => o === 'no' || o.startsWith('no '));
}

export const KAISER_COVER_REAUTH_ROOM_BOARD_FIELD_NAMES = [
  KAISER_COVER_REAUTH_ROOM_BOARD_FIELD,
  KAISER_COVER_REAUTH_ROOM_BOARD_FIELD_LEGACY,
] as const;

/** Auth + reauth room & board field names (templates have used several labels). */
export const KAISER_COVER_ROOM_BOARD_FIELD_ALIASES = [
  KAISER_COVER_AUTH_ROOM_BOARD_FIELD,
  "Member's Financial Responsibility of Room and Board",
  'Member Financial Responsibility of Room and Board',
  ...KAISER_COVER_REAUTH_ROOM_BOARD_FIELD_NAMES,
] as const;

/** Auth + reauth Total Costs field names. */
export const KAISER_COVER_TOTAL_FIELD_ALIASES = [
  ...KAISER_COVER_AUTH_TOTAL_FIELD_NAMES,
  'Total Costs',
  ...KAISER_COVER_REAUTH_TOTAL_FIELD_NAMES,
] as const;

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

/**
 * Normalize a money string for cover-sheet fields.
 * Template defaults of `0` / `$0.00` are treated as blank so they do not block
 * Caspio room & board backfill or zero-out Auto Calculated totals.
 */
export function normalizeCoverSheetMoneyLabel(value: unknown): string {
  const amount = parseMoneyAmount(value);
  if (!amount) return '';
  return formatCoverSheetMoney(amount);
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
  // Auto Calculated starts as member room & board; KP tier rate adds when selected.
  const total = maxExpense + roomBoard;
  return {
    maxExpense,
    roomBoard,
    total,
    maxExpenseLabel: maxExpense ? formatCoverSheetMoney(maxExpense) : '',
    totalLabel: roomBoard || maxExpense ? formatCoverSheetMoney(total) : '',
  };
}

const ratesObjectLiteral = () =>
  Object.entries(KAISER_COVER_SHEET_TIER_RATES)
    .map(([tier, amount]) => `"Tier ${tier}":${amount}`)
    .join(',');

/** Escape a string for safe inclusion inside an Acrobat JS double-quoted literal. */
function acrobatJsStringLiteral(value: unknown): string {
  return JSON.stringify(String(value ?? ''));
}

/** Shared Acrobat helpers inlined into every field action (no reliance on doc-level JS scope). */
function acrobatHelpersBlock(opts?: { bakedRoomBoard?: string; roomBoardFields?: string[] }): string {
  const baked = acrobatJsStringLiteral(opts?.bakedRoomBoard || '');
  const roomFields = (opts?.roomBoardFields?.length
    ? opts.roomBoardFields
    : [...KAISER_COVER_ROOM_BOARD_FIELD_ALIASES]
  ).map((name) => acrobatJsStringLiteral(name));
  return `
var __kRates={${ratesObjectLiteral()}};
var __kBakedRoomBoard=${baked};
var __kRoomBoardFields=[${roomFields.join(',')}];
function __kParseMoney(v){if(v==null)return 0;var s=String(v);var neg=/^\\s*-/.test(s.replace(/\\$/g,""));var n=Number(s.replace(/[^0-9.]/g,""));if(!isFinite(n))return 0;return neg?-Math.abs(n):n;}
function __kFormatMoney(n){if(!isFinite(n))return"";var neg=n<0;var abs=Math.abs(n);var p=abs.toFixed(2).split(".");p[0]=p[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,",");return(neg?"-$":"$")+p.join(".");}
function __kTierRate(tierValue){var tier=String(tierValue||"").replace(/^\\s+|\\s+$/g,"");if(__kRates[tier]!=null)return __kRates[tier];var m=tier.match(/\\b([1-5])\\b/);if(m&&__kRates["Tier "+m[1]]!=null)return __kRates["Tier "+m[1]];return 0;}
function __kReadRoomBoard(preferred){
  var names=[];
  if(preferred) names.push(String(preferred));
  for(var i=0;i<__kRoomBoardFields.length;i++) names.push(__kRoomBoardFields[i]);
  for(var j=0;j<names.length;j++){
    try{
      var f=this.getField(names[j]);
      if(!f) continue;
      var n=__kParseMoney(f.value);
      if(n) return n;
    }catch(e){}
  }
  return __kParseMoney(__kBakedRoomBoard);
}
`.trim();
}

/**
 * Self-contained script: KP-approved tier → Max Expense; Total = room & board + KP rate.
 * With no KP tier yet, Max Expense stays blank and Total shows member room & board.
 * Never uses ILS requested tier.
 * Optional overrideTier is used during dropdown Keystroke (event.change) before the
 * field value is committed, so amounts update immediately on selection.
 * @param opts.includeHelpers When false, caller already inlined acrobatHelpersBlock (avoids
 *   duplicate var/function declarations inside Keystroke handlers).
 */
export function buildKaiserTierApplyInlineScript(opts: {
  tierField: string;
  maxField: string;
  roomBoardField: string;
  totalField: string;
  bakedRoomBoard?: string;
  includeHelpers?: boolean;
}): string {
  const { tierField, maxField, roomBoardField, totalField, bakedRoomBoard } = opts;
  const includeHelpers = opts.includeHelpers !== false;
  const helpers = includeHelpers
    ? `${acrobatHelpersBlock({
        bakedRoomBoard,
        roomBoardFields: [roomBoardField, ...KAISER_COVER_ROOM_BOARD_FIELD_ALIASES],
      })}\n`
    : '';
  return `
${helpers}try{
  var tierVal = (typeof __kOverrideTier != "undefined" && __kOverrideTier != null && String(__kOverrideTier) !== "")
    ? String(__kOverrideTier)
    : String(this.getField("${tierField}").value || "");
  var rate=__kTierRate(tierVal);
  var maxF=this.getField("${maxField}");
  var totF=this.getField("${totalField}");
  var maxLabel = rate ? __kFormatMoney(rate) : "";
  var rb = __kReadRoomBoard(${acrobatJsStringLiteral(roomBoardField)});
  var totLabel = __kFormatMoney(rate + rb);
  // Set values twice + calculateNow so Acrobat redraws Max/Total immediately on dropdown
  // pick (otherwise Max Tier Expenses often stays blank until the user clicks another field).
  if(maxF){
    maxF.value = maxLabel;
    try{ maxF.value = maxF.value; }catch(eSetMax){}
  }
  if(totF){
    totF.value = totLabel;
    try{ totF.value = totF.value; }catch(eSetTot){}
  }
  try{ if(typeof this.calculateNow == "function") this.calculateNow(); }catch(eCalc){}
}catch(e){}
`.trim();
}

/** Calculate script for Max Expense — blank until KP selects an approved tier. */
export function buildKaiserMaxExpenseCalculateScript(
  tierField: string,
  opts?: { bakedRoomBoard?: string }
): string {
  return `
${acrobatHelpersBlock({ bakedRoomBoard: opts?.bakedRoomBoard })}
try{
  var rate=__kTierRate(this.getField("${tierField}").value);
  event.value = rate ? __kFormatMoney(rate) : "";
}catch(e){event.value="";}
`.trim();
}

/**
 * Calculate script for Total Costs.
 * Starts as member room & board; adds KP-approved tier rate when Dropdown is set.
 * Never uses ILS requested tier. Baked room & board prevents blank/$0.00 when getField fails.
 */
export function buildKaiserTotalCostsCalculateScript(opts: {
  tierField: string;
  maxField: string;
  roomBoardField: string;
  bakedRoomBoard?: string;
}): string {
  const { tierField, roomBoardField, bakedRoomBoard } = opts;
  return `
${acrobatHelpersBlock({
  bakedRoomBoard,
  roomBoardFields: [roomBoardField, ...KAISER_COVER_ROOM_BOARD_FIELD_ALIASES],
})}
try{
  var rate=__kTierRate(this.getField("${tierField}").value);
  var rb = __kReadRoomBoard(${acrobatJsStringLiteral(roomBoardField)});
  event.value = __kFormatMoney(rate + rb);
}catch(e){event.value=__kFormatMoney(__kParseMoney(__kBakedRoomBoard));}
`.trim();
}

/**
 * Keystroke / Format / Validate / MouseUp on KP tier dropdown — apply as soon as a list
 * item is chosen. Acrobat combo boxes often fire Keystroke with willCommit=false and
 * event.change = selected option; waiting for blur is what caused "updates only after
 * clicking into Max Tier Expenses".
 */
export function buildKaiserTierDropdownChangeScript(opts: {
  tierField: string;
  maxField: string;
  roomBoardField: string;
  totalField: string;
  bakedRoomBoard?: string;
}): string {
  return `
${acrobatHelpersBlock({
  bakedRoomBoard: opts.bakedRoomBoard,
  roomBoardFields: [opts.roomBoardField, ...KAISER_COVER_ROOM_BOARD_FIELD_ALIASES],
})}
try{
  var __kOverrideTier = null;
  if (typeof event != "undefined") {
    var changeStr = event.change != null ? String(event.change) : "";
    var changeExStr = event.changeEx != null ? String(event.changeEx) : "";
    var valueStr = event.value != null ? String(event.value) : "";
    var committed = event.willCommit === true || event.willCommit == null;
    if (event.willCommit === false) {
      // Dropdown list pick: new value is usually in event.change before the field commits.
      if (changeStr !== "") __kOverrideTier = changeStr;
      else if (changeExStr !== "") __kOverrideTier = changeExStr;
      else if (valueStr !== "" && !/select from drop\\s*down/i.test(valueStr)) __kOverrideTier = valueStr;
      else return; // keystroke noise with no selection yet
    } else if (committed && valueStr !== "") {
      __kOverrideTier = valueStr;
    } else if (changeStr !== "") {
      __kOverrideTier = changeStr;
    } else if (valueStr !== "" && !/select from drop\\s*down/i.test(valueStr)) {
      __kOverrideTier = valueStr;
    }
  }
  ${buildKaiserTierApplyInlineScript({ ...opts, includeHelpers: false })}
}catch(e){}
`.trim();
}

export function buildKaiserTierCalcAcrobatScript(opts?: { bakedRoomBoard?: string }): string {
  return `
${acrobatHelpersBlock({ bakedRoomBoard: opts?.bakedRoomBoard })}
function kaiserOnAuthTierChange(){
  ${buildKaiserTierDropdownChangeScript({
    tierField: KAISER_COVER_AUTH_KP_TIER_FIELD,
    maxField: KAISER_COVER_AUTH_MAX_EXPENSE_FIELD,
    roomBoardField: KAISER_COVER_AUTH_ROOM_BOARD_FIELD,
    totalField: KAISER_COVER_AUTH_TOTAL_FIELD,
    bakedRoomBoard: opts?.bakedRoomBoard,
  })}
}
function kaiserOnReauthTierChange(){
  ${buildKaiserTierDropdownChangeScript({
    tierField: KAISER_COVER_REAUTH_KP_TIER_FIELD,
    maxField: KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD,
    roomBoardField: KAISER_COVER_REAUTH_ROOM_BOARD_FIELD,
    totalField: KAISER_COVER_REAUTH_TOTAL_FIELD,
    bakedRoomBoard: opts?.bakedRoomBoard,
  })}
}
`.trim();
}
