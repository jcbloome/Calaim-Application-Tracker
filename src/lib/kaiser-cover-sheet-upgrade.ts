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
    return String(field?.getText?.() || '').trim();
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

function normalizeMoneyLabel(value: unknown): string {
  const amount = parseMoneyAmount(value);
  if (!amount && !String(value || '').replace(/[^0-9.]/g, '')) return '';
  return formatCoverSheetMoney(amount);
}

/**
 * Upgrade an already-generated Kaiser cover sheet PDF:
 * - Total Costs = member room & board (then + KP tier if already selected)
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

  const authRoom = getField(KAISER_COVER_AUTH_ROOM_BOARD_FIELD);
  const authMax = getField(KAISER_COVER_AUTH_MAX_EXPENSE_FIELD);
  const authTotal = getField(KAISER_COVER_AUTH_TOTAL_FIELD);
  const authKp = getField(KAISER_COVER_AUTH_KP_TIER_FIELD);
  const reauthRoomPrimary = getField(KAISER_COVER_REAUTH_ROOM_BOARD_FIELD);
  const reauthRoomLegacy = getField('Text3');
  const reauthMax = getField(KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD);
  const reauthTotal = getField(KAISER_COVER_REAUTH_TOTAL_FIELD);
  const reauthKp = getField(KAISER_COVER_REAUTH_KP_TIER_FIELD);

  const overrideRoom = normalizeMoneyLabel(options.roomBoardAmount);
  const pdfAuthRoom = normalizeMoneyLabel(readText(authRoom));
  const pdfReauthRoom = normalizeMoneyLabel(readText(reauthRoomPrimary) || readText(reauthRoomLegacy));

  let roomBoardSource: UpgradeKaiserCoverSheetResult['roomBoardSource'] = 'none';
  let authRoomValue = pdfAuthRoom;
  let reauthRoomValue = pdfReauthRoom;

  if (pdfAuthRoom || pdfReauthRoom) {
    roomBoardSource = 'pdf';
  } else if (overrideRoom) {
    roomBoardSource = 'override';
    authRoomValue = overrideRoom;
    reauthRoomValue = overrideRoom;
  }

  const coverType = String(options.coverPageType || '').toLowerCase();
  const isReauth = coverType.includes('reauth');

  // Fill blank room & board fields from Caspio override when the archived PDF had none.
  if (overrideRoom) {
    if (!pdfAuthRoom && !isReauth) setText(authRoom, overrideRoom);
    if (!pdfReauthRoom) {
      setText(reauthRoomPrimary, overrideRoom);
      setText(reauthRoomLegacy, overrideRoom);
    }
    if (!authRoomValue) authRoomValue = overrideRoom;
    if (!reauthRoomValue) reauthRoomValue = overrideRoom;
    if (roomBoardSource === 'none') roomBoardSource = 'override';
  }

  const authTier = parseKaiserTierNumber(readDropdown(authKp));
  const reauthTier = parseKaiserTierNumber(readDropdown(reauthKp));
  const authComputed = computeCoverSheetTotalCosts({
    tier: authTier,
    roomBoardAmount: authRoomValue,
  });
  const reauthComputed = computeCoverSheetTotalCosts({
    tier: reauthTier,
    roomBoardAmount: reauthRoomValue,
  });

  // Always rewrite totals from room & board (+ KP tier if already selected).
  setText(authMax, authComputed.maxExpenseLabel);
  setText(authTotal, authComputed.totalLabel);
  setText(reauthMax, reauthComputed.maxExpenseLabel);
  setText(reauthTotal, reauthComputed.totalLabel);

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

  try {
    pdfDoc.addJavaScript('KaiserTierRates', buildKaiserTierCalcAcrobatScript());
  } catch {
    // Optional document-level script.
  }

  const authApply = buildKaiserTierApplyInlineScript({
    tierField: KAISER_COVER_AUTH_KP_TIER_FIELD,
    maxField: KAISER_COVER_AUTH_MAX_EXPENSE_FIELD,
    roomBoardField: KAISER_COVER_AUTH_ROOM_BOARD_FIELD,
    totalField: KAISER_COVER_AUTH_TOTAL_FIELD,
  });
  const reauthApply = buildKaiserTierApplyInlineScript({
    tierField: KAISER_COVER_REAUTH_KP_TIER_FIELD,
    maxField: KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD,
    roomBoardField: KAISER_COVER_REAUTH_ROOM_BOARD_FIELD,
    totalField: KAISER_COVER_REAUTH_TOTAL_FIELD,
  });
  const authTierChange = buildKaiserTierDropdownChangeScript({
    tierField: KAISER_COVER_AUTH_KP_TIER_FIELD,
    maxField: KAISER_COVER_AUTH_MAX_EXPENSE_FIELD,
    roomBoardField: KAISER_COVER_AUTH_ROOM_BOARD_FIELD,
    totalField: KAISER_COVER_AUTH_TOTAL_FIELD,
  });
  const reauthTierChange = buildKaiserTierDropdownChangeScript({
    tierField: KAISER_COVER_REAUTH_KP_TIER_FIELD,
    maxField: KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD,
    roomBoardField: KAISER_COVER_REAUTH_ROOM_BOARD_FIELD,
    totalField: KAISER_COVER_REAUTH_TOTAL_FIELD,
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
  attachFieldAdditionalActions(pdfDoc, reauthRoomPrimary || reauthRoomLegacy, {
    Bl: reauthApply,
    V: reauthApply,
  });
  attachFieldAdditionalActions(pdfDoc, authMax, {
    C: buildKaiserMaxExpenseCalculateScript(KAISER_COVER_AUTH_KP_TIER_FIELD),
  });
  attachFieldAdditionalActions(pdfDoc, authTotal, {
    C: buildKaiserTotalCostsCalculateScript({
      tierField: KAISER_COVER_AUTH_KP_TIER_FIELD,
      maxField: KAISER_COVER_AUTH_MAX_EXPENSE_FIELD,
      roomBoardField: KAISER_COVER_AUTH_ROOM_BOARD_FIELD,
    }),
  });
  attachFieldAdditionalActions(pdfDoc, reauthMax, {
    C: buildKaiserMaxExpenseCalculateScript(KAISER_COVER_REAUTH_KP_TIER_FIELD),
  });
  attachFieldAdditionalActions(pdfDoc, reauthTotal, {
    C: buildKaiserTotalCostsCalculateScript({
      tierField: KAISER_COVER_REAUTH_KP_TIER_FIELD,
      maxField: KAISER_COVER_REAUTH_MAX_EXPENSE_FIELD,
      roomBoardField: KAISER_COVER_REAUTH_ROOM_BOARD_FIELD,
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

  const bytes = await pdfDoc.save({ updateFieldAppearances: false, useObjectStreams: false });
  return {
    bytes: new Uint8Array(bytes),
    authTotal: authComputed.totalLabel,
    reauthTotal: reauthComputed.totalLabel,
    authRoomBoard: authRoomValue,
    reauthRoomBoard: reauthRoomValue,
    roomBoardSource,
  };
}
