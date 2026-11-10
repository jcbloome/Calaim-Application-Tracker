import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import {
  buildKaiserMaxExpenseCalculateScript,
  buildKaiserTierApplyInlineScript,
  buildKaiserTierCalcAcrobatScript,
  buildKaiserTierDropdownChangeScript,
  buildKaiserTotalCostsCalculateScript,
  computeCoverSheetTotalCosts,
  formatCoverSheetMoney,
  KAISER_COVER_AUTH_KP_TIER_FIELD,
  KAISER_COVER_AUTH_MAX_EXPENSE_FIELD,
  KAISER_COVER_AUTH_ROOM_BOARD_FIELD,
  KAISER_COVER_AUTH_TOTAL_FIELD,
  KAISER_COVER_REAUTH_KP_TIER_FIELD,
  KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD,
  KAISER_COVER_REAUTH_ROOM_BOARD_FIELD,
  KAISER_COVER_REAUTH_TOTAL_FIELD,
  KAISER_COVER_AUTH_MAX_FIELD_NAMES,
  KAISER_COVER_AUTH_TOTAL_FIELD_NAMES,
  KAISER_COVER_REAUTH_KP_TIER_FIELD_NAMES,
  KAISER_COVER_REAUTH_MAX_FIELD_NAMES,
  KAISER_COVER_REAUTH_ROOM_BOARD_FIELD_NAMES,
  KAISER_COVER_REAUTH_TOTAL_FIELD_NAMES,
  normalizeCoverSheetMoneyLabel,
  parseKaiserTierNumber,
  parseMoneyAmount,
} from '@/lib/kaiser-cover-sheet-tier-rates';

type AcroFieldWithDict = {
  acroField?: {
    dict?: { set: (key: unknown, value: unknown) => void };
    getWidgets?: () => Array<{ dict?: { set: (key: unknown, value: unknown) => void } }>;
  };
  ref?: unknown;
  getText?: () => string;
  setText?: (value: string) => void;
  getSelected?: () => string[];
  getName?: () => string;
  disableReadOnly?: () => void;
};

export type UpgradeKaiserCoverSheetOptions = {
  /** Prefer this amount when PDF room & board is blank (from Caspio). */
  roomBoardAmount?: string;
  /** Which section to prioritize when filling room & board / totals. */
  coverPageType?: string;
};

export type UpgradeKaiserCoverSheetResult = {
  bytes: Uint8Array;
  authTotal: string;
  reauthTotal: string;
  authRoomBoard: string;
  reauthRoomBoard: string;
  roomBoardSource: 'pdf' | 'override' | 'none';
};

function makeJsAction(pdfDoc: PDFDocument, script: string) {
  return pdfDoc.context.obj({
    Type: 'Action',
    S: 'JavaScript',
    JS: PDFString.of(script),
  });
}

function attachFieldAdditionalActions(
  pdfDoc: PDFDocument,
  field: AcroFieldWithDict | null | undefined,
  actions: Record<string, string>
) {
  try {
    const dict = field?.acroField?.dict;
    if (!dict || typeof dict.set !== 'function') return;
    const entries: Record<string, ReturnType<typeof makeJsAction>> = {};
    for (const [key, script] of Object.entries(actions)) {
      if (!script) continue;
      entries[key] = makeJsAction(pdfDoc, script);
    }
    dict.set(PDFName.of('AA'), pdfDoc.context.obj(entries as any));
  } catch {
    // Keep upgrading if one widget cannot accept an action.
  }
}

function readText(field: AcroFieldWithDict | null | undefined): string {
  try {
    const fromApi = String(field?.getText?.() || '').trim();
    if (fromApi) return fromApi;
  } catch {
    // fall through to raw dict
  }
  try {
    const dict = field?.acroField?.dict as
      | { lookup?: (key: unknown) => { toString?: () => string } | undefined }
      | undefined;
    const raw = dict?.lookup?.(PDFName.of('V'));
    const asString = String(raw?.toString?.() || '').trim();
    // pdf-lib may stringify as ( $500.00 ) or <FEFF...>
    const paren = asString.match(/^\((.*)\)$/s);
    if (paren) return paren[1].replace(/\\([nrt\\()])/g, '$1').trim();
    return asString.replace(/^<|>$/g, '').trim();
  } catch {
    return '';
  }
}

function readDropdown(field: AcroFieldWithDict | null | undefined): string {
  try {
    return String(field?.getSelected?.()?.[0] || '').trim();
  } catch {
    return '';
  }
}

function setText(field: AcroFieldWithDict | null | undefined, value: string) {
  try {
    if (field && typeof field.setText === 'function') field.setText(value);
  } catch {
    // ignore
  }
}

/**
 * Upgrade an already-generated Kaiser cover sheet PDF:
 * - Total Costs = member room & board (then + KP tier if already selected)
 * - Works for both Authorization (Auto calculated) and Reauthorization (Text23)
 * - Max Tier Expenses blank unless KP tier is set
 * - Refresh field appearances so Chrome/Acrobat show the new amounts (not stale $0.00)
 * - Attach current Acrobat calc scripts
 */
export async function upgradeKaiserCoverSheetPdf(
  pdfBytes: Uint8Array,
  options: UpgradeKaiserCoverSheetOptions = {}
): Promise<UpgradeKaiserCoverSheetResult> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const getField = (name: string) => {
    try {
      return form.getField(name) as unknown as AcroFieldWithDict;
    } catch {
      return null;
    }
  };

  const firstExisting = (names: readonly string[]) => {
    for (const name of names) {
      const field = getField(name);
      if (field) return { name, field };
    }
    return { name: names[0] || '', field: null as AcroFieldWithDict | null };
  };

  const authRoom = getField(KAISER_COVER_AUTH_ROOM_BOARD_FIELD);
  const authMaxResolved = firstExisting(KAISER_COVER_AUTH_MAX_FIELD_NAMES);
  const authTotalResolved = firstExisting(KAISER_COVER_AUTH_TOTAL_FIELD_NAMES);
  const authKpResolved = firstExisting([KAISER_COVER_AUTH_KP_TIER_FIELD, 'Dropdown13']);
  const authKp = authKpResolved.field;
  const authMax = authMaxResolved.field;
  const authTotal = authTotalResolved.field;
  const authMaxName = authMaxResolved.name || KAISER_COVER_AUTH_MAX_EXPENSE_FIELD;
  const authTotalName = authTotalResolved.name || KAISER_COVER_AUTH_TOTAL_FIELD;
  const authKpName = authKpResolved.name || KAISER_COVER_AUTH_KP_TIER_FIELD;

  const reauthRoomFields = KAISER_COVER_REAUTH_ROOM_BOARD_FIELD_NAMES.map((name) => ({
    name,
    field: getField(name),
  })).filter((row) => row.field);
  const reauthRoomPrimary = reauthRoomFields[0]?.field || null;
  const reauthRoomLegacy = reauthRoomFields[1]?.field || getField('Text3');
  const reauthMaxResolved = firstExisting(KAISER_COVER_REAUTH_MAX_FIELD_NAMES);
  const reauthTotalResolved = firstExisting(KAISER_COVER_REAUTH_TOTAL_FIELD_NAMES);
  const reauthKpResolved = firstExisting(KAISER_COVER_REAUTH_KP_TIER_FIELD_NAMES);
  const reauthMax = reauthMaxResolved.field;
  const reauthTotal = reauthTotalResolved.field;
  const reauthKp = reauthKpResolved.field;
  const reauthMaxName = reauthMaxResolved.name || KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD;
  const reauthTotalName = reauthTotalResolved.name || KAISER_COVER_REAUTH_TOTAL_FIELD;
  const reauthKpName = reauthKpResolved.name || KAISER_COVER_REAUTH_KP_TIER_FIELD;
  const reauthRoomName = reauthRoomFields[0]?.name || KAISER_COVER_REAUTH_ROOM_BOARD_FIELD;

  const coverType = String(options.coverPageType || '').toLowerCase();
  const isReauth = coverType.includes('reauth');

  const overrideRoom = normalizeCoverSheetMoneyLabel(options.roomBoardAmount);
  // Treat template placeholders (0 / $0.00) as blank.
  const pdfAuthRoom = normalizeCoverSheetMoneyLabel(readText(authRoom));
  const pdfReauthRoom = normalizeCoverSheetMoneyLabel(
    reauthRoomFields.map((row) => readText(row.field)).find(Boolean) || ''
  );

  // Prefer the strongest non-zero room & board we can find (PDF section or Caspio).
  const bestRoomAmount = Math.max(
    parseMoneyAmount(pdfReauthRoom),
    parseMoneyAmount(pdfAuthRoom),
    parseMoneyAmount(overrideRoom)
  );
  const bestRoom = bestRoomAmount ? formatCoverSheetMoney(bestRoomAmount) : '';

  let roomBoardSource: UpgradeKaiserCoverSheetResult['roomBoardSource'] = 'none';
  if (pdfReauthRoom || pdfAuthRoom) roomBoardSource = 'pdf';
  else if (overrideRoom) roomBoardSource = 'override';

  let authRoomValue = pdfAuthRoom || (!isReauth ? bestRoom : '');
  let reauthRoomValue = pdfReauthRoom || bestRoom;

  // Reauth cover sheets: always ensure Text22/Text3 + Text23 can see the room & board amount.
  if (isReauth && bestRoom) {
    reauthRoomValue = bestRoom;
    if (!pdfReauthRoom) {
      setText(reauthRoomPrimary, bestRoom);
      setText(reauthRoomLegacy, bestRoom);
    }
  } else if (!isReauth && bestRoom) {
    authRoomValue = bestRoom;
    if (!pdfAuthRoom) setText(authRoom, bestRoom);
    // Keep reauth fields in sync so page 6 is correct if staff flips pages.
    if (!pdfReauthRoom) {
      setText(reauthRoomPrimary, bestRoom);
      setText(reauthRoomLegacy, bestRoom);
    }
    if (!reauthRoomValue) reauthRoomValue = bestRoom;
  } else if (overrideRoom) {
    if (!pdfAuthRoom && !isReauth) setText(authRoom, overrideRoom);
    if (!pdfReauthRoom) {
      setText(reauthRoomPrimary, overrideRoom);
      setText(reauthRoomLegacy, overrideRoom);
    }
    if (!authRoomValue) authRoomValue = overrideRoom;
    if (!reauthRoomValue) reauthRoomValue = overrideRoom;
  }

  const authTier = parseKaiserTierNumber(readDropdown(authKp));
  const reauthTier = parseKaiserTierNumber(readDropdown(reauthKp));
  const authComputed = computeCoverSheetTotalCosts({
    tier: authTier,
    roomBoardAmount: authRoomValue || bestRoom,
  });
  const reauthComputed = computeCoverSheetTotalCosts({
    tier: reauthTier,
    roomBoardAmount: reauthRoomValue || bestRoom,
  });

  // Always rewrite totals from room & board (+ KP tier if already selected).
  // Current template: Text23 / Auto calculated. Older archived PDFs: Text10 / Text15.
  setText(authMax, authComputed.maxExpenseLabel);
  setText(authTotal, authComputed.totalLabel);
  for (const name of KAISER_COVER_AUTH_TOTAL_FIELD_NAMES) setText(getField(name), authComputed.totalLabel);
  for (const name of KAISER_COVER_AUTH_MAX_FIELD_NAMES) setText(getField(name), authComputed.maxExpenseLabel);
  setText(reauthMax, reauthComputed.maxExpenseLabel);
  setText(reauthTotal, reauthComputed.totalLabel);
  for (const name of KAISER_COVER_REAUTH_TOTAL_FIELD_NAMES) setText(getField(name), reauthComputed.totalLabel);
  for (const name of KAISER_COVER_REAUTH_MAX_FIELD_NAMES) setText(getField(name), reauthComputed.maxExpenseLabel);

  // Match generator: fixed Helvetica DA so appearance text is readable.
  const fixedDa = PDFString.of('/Helv 9 Tf 0 g');
  for (const field of [authRoom, authMax, authTotal, reauthRoomPrimary, reauthRoomLegacy, reauthMax, reauthTotal]) {
    try {
      field?.disableReadOnly?.();
      field?.acroField?.dict?.set?.(PDFName.of('DA'), fixedDa);
      for (const widget of field?.acroField?.getWidgets?.() || []) {
        widget?.dict?.set?.(PDFName.of('DA'), fixedDa);
      }
    } catch {
      // ignore
    }
  }

  const bakedRoomBoard = reauthRoomValue || authRoomValue || bestRoom || overrideRoom || '';

  try {
    pdfDoc.addJavaScript('KaiserTierRates', buildKaiserTierCalcAcrobatScript({ bakedRoomBoard }));
  } catch {
    // Optional document-level script.
  }

  const authApply = buildKaiserTierApplyInlineScript({
    tierField: authKpName,
    maxField: authMaxName,
    roomBoardField: KAISER_COVER_AUTH_ROOM_BOARD_FIELD,
    totalField: authTotalName,
    bakedRoomBoard,
  });
  const reauthApply = buildKaiserTierApplyInlineScript({
    tierField: reauthKpName,
    maxField: reauthMaxName,
    roomBoardField: reauthRoomName,
    totalField: reauthTotalName,
    bakedRoomBoard,
  });
  const authTierChange = buildKaiserTierDropdownChangeScript({
    tierField: authKpName,
    maxField: authMaxName,
    roomBoardField: KAISER_COVER_AUTH_ROOM_BOARD_FIELD,
    totalField: authTotalName,
    bakedRoomBoard,
  });
  const reauthTierChange = buildKaiserTierDropdownChangeScript({
    tierField: reauthKpName,
    maxField: reauthMaxName,
    roomBoardField: reauthRoomName,
    totalField: reauthTotalName,
    bakedRoomBoard,
  });

  attachFieldAdditionalActions(pdfDoc, authKp, {
    K: authTierChange,
    V: authTierChange,
    Bl: authApply,
  });
  attachFieldAdditionalActions(pdfDoc, reauthKp, {
    K: reauthTierChange,
    V: reauthTierChange,
    Bl: reauthApply,
  });
  attachFieldAdditionalActions(pdfDoc, authRoom, { Bl: authApply, V: authApply });
  for (const row of reauthRoomFields) {
    attachFieldAdditionalActions(pdfDoc, row.field, { Bl: reauthApply, V: reauthApply });
  }
  attachFieldAdditionalActions(pdfDoc, authMax, {
    C: buildKaiserMaxExpenseCalculateScript(authKpName, { bakedRoomBoard }),
  });
  attachFieldAdditionalActions(pdfDoc, authTotal, {
    C: buildKaiserTotalCostsCalculateScript({
      tierField: authKpName,
      maxField: authMaxName,
      roomBoardField: KAISER_COVER_AUTH_ROOM_BOARD_FIELD,
      bakedRoomBoard,
    }),
  });
  attachFieldAdditionalActions(pdfDoc, reauthMax, {
    C: buildKaiserMaxExpenseCalculateScript(reauthKpName, { bakedRoomBoard }),
  });
  attachFieldAdditionalActions(pdfDoc, reauthTotal, {
    C: buildKaiserTotalCostsCalculateScript({
      tierField: reauthKpName,
      maxField: reauthMaxName,
      roomBoardField: reauthRoomName,
      bakedRoomBoard,
    }),
  });

  try {
    const acroForm = pdfDoc.catalog.lookup(PDFName.of('AcroForm')) as
      | { set?: (key: unknown, value: unknown) => void }
      | undefined;
    const calcFields = [authMax, authTotal, reauthMax, reauthTotal]
      .map((f) => f?.ref)
      .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref));
    if (acroForm && typeof acroForm.set === 'function') {
      if (calcFields.length > 0) {
        acroForm.set(PDFName.of('CO'), pdfDoc.context.obj(calcFields as any));
      }
      // Browser viewers use baked appearances; do not ask them to rebuild from scripts.
      acroForm.set(PDFName.of('NeedAppearances'), pdfDoc.context.obj(false));
    }
  } catch {
    // Optional.
  }

  // Critical: rewrite appearance streams so Chrome/pdf.js show new Total Costs (not stale $0.00).
  try {
    form.updateFieldAppearances(font);
  } catch {
    // Still save field values even if one appearance fails.
  }

  // Second pass — older templates keep a stale "0" appearance on Text10 / Text15.
  try {
    for (const name of KAISER_COVER_REAUTH_TOTAL_FIELD_NAMES) setText(getField(name), reauthComputed.totalLabel);
    for (const name of KAISER_COVER_AUTH_TOTAL_FIELD_NAMES) setText(getField(name), authComputed.totalLabel);
    if (reauthRoomValue) {
      for (const row of reauthRoomFields) setText(row.field, reauthRoomValue);
      setText(reauthRoomLegacy, reauthRoomValue);
    }
    form.updateFieldAppearances(font);
  } catch {
    // ignore
  }

  const bytes = await pdfDoc.save({ updateFieldAppearances: false, useObjectStreams: false });
  return {
    bytes: new Uint8Array(bytes),
    authTotal: authComputed.totalLabel,
    reauthTotal: reauthComputed.totalLabel,
    authRoomBoard: authRoomValue || bestRoom,
    reauthRoomBoard: reauthRoomValue || bestRoom,
    roomBoardSource,
  };
}
