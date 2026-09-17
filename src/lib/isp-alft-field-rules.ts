/**
 * ISP / ALFT fields that stay locked to a fixed default (not staff-editable).
 * Q5 mailing address is editable and prefilled from Caspio Normal_Housing_*.
 * Q12 income fields (SSI / SSDI / etc.) are editable — SSI is prefilled from Caspio Room_and_Board_Amount when available.
 */
export const ISP_ALFT_LOCKED_FIELD_IDS = [] as const;

export type IspAlftLockedFieldId = (typeof ISP_ALFT_LOCKED_FIELD_IDS)[number];

export const ISP_ALFT_LOCKED_FIELD_ID_SET = new Set<string>(ISP_ALFT_LOCKED_FIELD_IDS);

export const ISP_ALFT_LOCKED_FIELD_DEFAULT = 'N/A';

export function isIspAlftLockedField(id: string): boolean {
  return ISP_ALFT_LOCKED_FIELD_ID_SET.has(id);
}

export function applyIspAlftLockedFieldDefaults<T extends Record<string, unknown>>(answers: T): T {
  const next = { ...answers } as T;
  for (const id of ISP_ALFT_LOCKED_FIELD_IDS) {
    (next as Record<string, unknown>)[id] = ISP_ALFT_LOCKED_FIELD_DEFAULT;
  }
  return next;
}
