/** Mailing address + financial income fields are not used in the ISP / ALFT workflow. */
export const ISP_ALFT_LOCKED_FIELD_IDS = [
  'p2_mail_street',
  'p2_mail_city',
  'p2_mail_state',
  'p2_mail_zip',
  'p2_income_ssi',
  'p2_income_retirement',
  'p2_income_ssdi',
  'p2_income_other',
] as const;

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
