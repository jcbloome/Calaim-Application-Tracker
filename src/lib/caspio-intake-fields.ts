export const CASPIO_INTAKE_FIELD_KEYS = [
  'Authorization_Number_T038',
  'Authorization_Start_T2038',
  'Authorization_End_T2038',
  'Diagnostic_Code',
] as const;

export type CaspioIntakeFieldKey = (typeof CASPIO_INTAKE_FIELD_KEYS)[number];

export type CaspioIntakeFieldValues = Record<CaspioIntakeFieldKey, string>;

export const emptyCaspioIntakeFields = (): CaspioIntakeFieldValues => ({
  Authorization_Number_T038: '',
  Authorization_Start_T2038: '',
  Authorization_End_T2038: '',
  Diagnostic_Code: '',
});

export const readCaspioIntakeFields = (data: Record<string, unknown> | null | undefined): CaspioIntakeFieldValues => ({
  Authorization_Number_T038: String(data?.Authorization_Number_T038 || '').trim(),
  Authorization_Start_T2038: String(data?.Authorization_Start_T2038 || '').trim(),
  Authorization_End_T2038: String(data?.Authorization_End_T2038 || '').trim(),
  Diagnostic_Code: String(data?.Diagnostic_Code || '').trim(),
});

export function stripCaspioIntakeFields<T extends Record<string, unknown>>(data: T): T {
  const next = { ...data } as T;
  CASPIO_INTAKE_FIELD_KEYS.forEach((key) => {
    delete (next as Record<string, unknown>)[key];
  });
  return next;
}
