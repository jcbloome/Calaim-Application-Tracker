import { inferCountyFromCityZip, toNameCase } from './service-request-parsing';

export const getEmptyMemberData = () => ({
  memberFirstName: '',
  memberLastName: '',
  memberMrn: '',
  memberMediCalNum: '',
  confirmMemberMediCalNum: '',
  memberSex: '',
  parsedSourceType: '',
  createServiceDeliveryFormPdf: true,
  memberDob: '',
  memberPhone: '',
  memberEmail: '',
  memberCustomaryLocation: '',
  memberCustomaryAddress: '',
  memberCustomaryCity: '',
  memberCustomaryState: '',
  memberCustomaryZip: '',
  memberCustomaryCounty: '',
  Authorization_Number_T038: '',
  Authorization_Start_T2038: '',
  Authorization_End_T2038: '',
  Diagnostic_Code: '',
  kaiserStatus: '',
  contactFirstName: '',
  contactLastName: '',
  contactPhone: '',
  contactEmail: '',
  careManagerName: '',
  careManagerPhone: '',
  careManagerEmail: '',
  contactRelationship: '',
  eligibilityCheckStatus: 'Pending',
  notes: '',
});

export const getSubmittingStaffIdentity = (user: unknown) => {
  const userRecord = (user && typeof user === 'object' ? user : {}) as Record<string, unknown>;
  const displayName = String(userRecord.displayName || '').trim();
  const email = String(userRecord.email || '').trim();
  const phone = String(userRecord.phoneNumber || '').trim();
  const fallback = email ? email.split('@')[0] : 'Staff';
  const normalizedName = displayName || fallback;
  const parts = normalizedName.split(/\s+/).filter(Boolean);
  return {
    name: normalizedName,
    firstName: parts[0] || normalizedName,
    lastName: parts.slice(1).join(' ') || '',
    email,
    phone,
    uid: String(userRecord.uid || '').trim(),
  };
};

export const normalizeMemberPatch = (patch: Record<string, unknown>) => {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) {
      normalized[key] = '';
      continue;
    }
    normalized[key] = typeof value === 'string' ? value : String(value);
  }
  return normalized;
};

export const withInferredCountyFromAddress = (patch: Record<string, string>) => {
  const next = { ...patch };
  if (next.memberCustomaryAddress) next.memberCustomaryAddress = toNameCase(next.memberCustomaryAddress);
  if (next.memberCustomaryCity) next.memberCustomaryCity = toNameCase(next.memberCustomaryCity);
  if (next.memberCustomaryCounty) next.memberCustomaryCounty = toNameCase(next.memberCustomaryCounty);
  if (String(next.memberCustomaryCounty || '').trim()) return next;
  const inferredCounty = inferCountyFromCityZip({
    city: next.memberCustomaryCity,
    zip: next.memberCustomaryZip,
  });
  if (inferredCounty) {
    next.memberCustomaryCounty = toNameCase(inferredCounty);
  }
  return next;
};

export const withoutCurrentAddressPrefill = (patch: Record<string, string>) => {
  const next = { ...patch };
  // Keep parsed/imported customary address fields.
  // This helper only prevents automatic location-type prefill defaults.
  next.memberCustomaryLocation = '';
  return next;
};

export const EMPTY_SINGLE_AUTH_CONTACT_PREVIEW = {
  memberPhone: '',
  cellPhone: '',
  memberEmail: '',
};

export const extractSingleAuthContactPreview = (patch: Record<string, string>) => ({
  memberPhone: String(patch.memberPhone || '').trim(),
  cellPhone: String(patch.contactPhone || '').trim(),
  memberEmail: String(patch.memberEmail || '').trim().toLowerCase(),
});
