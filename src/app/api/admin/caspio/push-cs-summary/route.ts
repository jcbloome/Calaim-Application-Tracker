import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import { caspioWriteBlockedResponse, isCaspioWriteReadOnly } from '@/lib/caspio-write-guard';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const clean = (value: unknown) => String(value ?? '').trim();
const esc = (value: unknown) => clean(value).replace(/'/g, "''");
const looksLikeClientId2 = (fieldName: string) => /client[_\s-]*id2/i.test(clean(fieldName));
const looksLikeHoldForSocialWorkerField = (fieldName: string) =>
  /hold[_\s-]*for[_\s-]*social[_\s-]*worker/i.test(clean(fieldName));
const normalizeFieldName = (fieldName: string) =>
  clean(fieldName)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const hasValue = (value: unknown) => clean(value).length > 0;
const normalizeKaiserStatusForPush = (status: string) => {
  const trimmed = clean(status);
  if (!trimmed) return '';
  // Guard common typo variant seen in saved statuses.
  return trimmed.replace(/\bT20238\b/gi, 'T2038');
};
const isNotRequestedDocCollectionStatus = (status: string) => {
  const normalized = normalizeFieldName(status);
  if (!normalized) return false;
  const hasT2038Token = normalized.includes('t2038') || normalized.includes('t20238');
  return hasT2038Token && normalized.includes('notrequested') && normalized.includes('doccollection');
};
const looksLikeSexField = (fieldName: string) => {
  const normalized = normalizeFieldName(fieldName);
  return normalized === 'sex' || normalized === 'gender' || normalized === 'membersex' || normalized === 'membergender';
};
const toCaspioLegalRepChoice = (value: unknown): 'Unknown' | 'No' | 'Yes' | 'Requires' => {
  const normalized = normalizeFieldName(value);
  switch (normalized) {
    case 'unknown':
      return 'Unknown';
    case 'notapplicable':
      return 'No';
    case 'sameasprimary':
    case 'different':
      return 'Yes';
    case 'nocapacityhasrep':
      return 'Requires';
    // Legacy value retained for backward compatibility with older records.
    case 'nohasrep':
      return 'No';
    case 'yes':
      return 'Yes';
    case 'no':
      return 'No';
    case 'requires':
      return 'Requires';
    default:
      return 'Unknown';
  }
};
const toCaspioSexValue = (value: unknown): 'F' | 'M' | '' => {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  if (raw === 'f' || raw === 'female' || raw === 'woman' || raw === 'girl') return 'F';
  if (raw === 'm' || raw === 'male' || raw === 'man' || raw === 'boy') return 'M';
  return '';
};
const looksLikeMrnField = (fieldName: string) => {
  const normalized = normalizeFieldName(fieldName);
  return (
    normalized === 'mrn' ||
    normalized.includes('membermrn') ||
    normalized.includes('kaisermrn') ||
    normalized.includes('medicalrecordnumber')
  );
};
const looksLikeMediCalField = (fieldName: string) => {
  const normalized = normalizeFieldName(fieldName);
  if (looksLikeMrnField(fieldName)) return false;
  return (
    normalized.includes('medicalnumber') ||
    normalized.includes('medicalnum') ||
    normalized.includes('medcalnumber') ||
    normalized.includes('medcalnum') ||
    normalized === 'medicalnumber' ||
    normalized.includes('medic') ||
    normalized.includes('mcpcin') ||
    normalized === 'cin' ||
    normalized.includes('cinnumber')
  );
};
const looksLikeMedicalNumberField = (fieldName: string) => {
  return looksLikeMediCalField(fieldName) || looksLikeMrnField(fieldName);
};
const looksLikePkField = (fieldName: string) => /^pk_id$/i.test(clean(fieldName));
const looksLikeNumericId = (value: unknown) => /^-?\d+(?:\.\d+)?$/.test(clean(value));
const buildEqualsClause = (fieldName: string, value: unknown) => {
  const normalizedValue = clean(value);
  if (!normalizedValue) return '';
  // Preserve leading-zero identifiers (e.g., CIN/MRN) as text; unquoted numeric
  // comparisons can drop the leading zero and miss existing Caspio rows.
  if (/^0\d+$/.test(normalizedValue)) {
    return `${fieldName}='${esc(normalizedValue)}'`;
  }
  return looksLikeNumericId(normalizedValue)
    ? `${fieldName}=${normalizedValue}`
    : `${fieldName}='${esc(normalizedValue)}'`;
};
const parseDuplicateOrBlankField = (errorText: string) => {
  const raw = String(errorText || '');
  const lower = raw.toLowerCase();
  if (!lower.includes('duplicate or blank values are not allowed')) return '';
  const m = raw.match(/field\s+['"]([^'"]+)['"]/i);
  return clean(m?.[1] || '');
};
const HOLD_FOR_SOCIAL_WORKER_FIELD = 'Hold_For_Social_Worker_Visit';
const HOLD_FOR_SOCIAL_WORKER_VALUE = '🔴 Hold';
const CALAIM_STATUS_FIELD = 'CalAIM_Status';
const MEMBER_COUNTY_FIELD = 'Member_County';
const SNF_DIVERSION_OR_TRANSITION_FIELD = 'SNF_Diversion_or_Transition';
const ELIGIBILITY_SOURCE_FIELD = 'Eligibility_Source';
const NORMAL_HOUSING_SITUATION_FIELD = 'Normal_Housing_Situation';
const DIAGNOSTIC_ICD_CODE_1_FIELD = 'Diagnostic_ICD_Code_1';
const UNKNOWN_REQUIRED_VALUE = 'Unknown';
const DEFAULT_DIAGNOSTIC_CODE = '00';
const MONTHLY_INCOME_FIELD = 'Monthly_Income';
const MCO_AND_TIER_FIELD = 'MCO_and_Tier';
const DEFAULT_KAISER_TIER_VALUE = 'Kaiser-0';
const KAISER_STATUS_FIELD = 'Kaiser_Status';
const REQUIRED_PRE_PUSH_KAISER_STATUSES = [
  'T2038 Received, Need First Contact',
  'T2038 Received, doc collection',
] as const;
const REQUIRED_PRE_PUSH_KAISER_STATUS_NORMALIZED = new Set(
  REQUIRED_PRE_PUSH_KAISER_STATUSES.map((status) => normalizeFieldName(status))
);
const isRequiredPrePushKaiserStatus = (status: string) =>
  REQUIRED_PRE_PUSH_KAISER_STATUS_NORMALIZED.has(normalizeFieldName(status));
const UNKNOWN_CONTACT_PLACEHOLDER = 'Unknown';
const KAISER_STAFF_ASSIGNMENT_FIELD_CANDIDATES = [
  'Kaiser_User_Assignment',
  'Kaiser_User_Assigned',
  'Kaiser_Staff_Assignment',
  'Kaiser_Staff_Assigned',
  'Kaiser_Staff',
];
const PRE_ASSESSMENT_NOTES_FIELD_CANDIDATES = [
  'Pre_Assessment_Care_Needs_Notes',
  'Pre_Assessment_Notes',
  'Care_Needs_Notes',
  'Care_Notes',
];
const SNF_DIVERSION_REASON_FIELD_CANDIDATES = [
  'SNFDiversionReason',
  'SNF_Diversion_Reason',
  'SNF_Diversion_Notes',
  'Diversion_Reason',
];
const LAST_ELIGIBILITY_CHECK_FIELD_CANDIDATES = [
  'Last_Eligibility_Check',
  'LastEligibilityCheck',
  'Eligibility_Check_Date',
  'Last_Eligibility_Date',
];
const MEDICAL_NUMBER_FIELD_CANDIDATES = [
  'Medical_Number',
  'MedicalNumber',
  'MediCal_Number',
  'Medi_Cal_Number',
  'MediCalNumber',
  'Medi_Cal',
  'MediCal',
  'MC',
  'MCP_CIN',
  'CIN',
  'CIN_Number',
];
const MEDI_CAL_APPLICATION_FIELD_CANDIDATES = [
  'confirmMemberMediCalNum',
  'memberMediCalNum',
  'memberMediCalNumber',
  'MediCal_Number',
  'Medi_Cal_Number',
  'Medi_Cal',
  'MediCal',
  'Medical_Number',
  'MCP_CIN',
  'cin',
  'CIN',
  'MC',
];
const MEDI_CAL_CS_FIELD_ALIASES = new Set([
  'medicalnumber',
  'medicalnum',
  'medical',
  'medcalnumber',
  'medcalnum',
  'medic',
  'mcpcin',
  'cin',
  'cinnumber',
]);
const extractMediCalNumberFromApplication = (applicationData: Record<string, any>) => {
  for (const key of MEDI_CAL_APPLICATION_FIELD_CANDIDATES) {
    const value = clean(applicationData?.[key]);
    if (value) return value;
  }
  for (const [key, rawValue] of Object.entries(applicationData || {})) {
    if (!looksLikeMedicalNumberField(key)) continue;
    const value = clean(rawValue);
    if (!value) continue;
    return value;
  }
  return '';
};
const pickFirstNonEmpty = (source: Record<string, any>, candidates: string[]) => {
  for (const key of candidates) {
    const value = source?.[key];
    if (value !== undefined && value !== null && clean(value) !== '') {
      return value;
    }
  }
  return '';
};
const toCaspioDate = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    const mmddyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mmddyyyy) {
      const mm = String(mmddyyyy[1]).padStart(2, '0');
      const dd = String(mmddyyyy[2]).padStart(2, '0');
      const yyyy = mmddyyyy[3];
      return `${mm}/${dd}/${yyyy}`;
    }
    return '';
  }
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};
const canonicalizeApplicationData = (raw: Record<string, any>) => {
  const app = { ...(raw || {}) } as Record<string, any>;
  const normalizedEntries = Object.entries(app).reduce((acc, [key, value]) => {
    const normalizedKey = normalizeFieldName(key);
    if (!normalizedKey) return acc;
    if (acc[normalizedKey] === undefined && clean(value) !== '') {
      acc[normalizedKey] = value;
    }
    return acc;
  }, {} as Record<string, any>);

  const setIfMissing = (targetKey: string, value: unknown) => {
    if (app[targetKey] !== undefined && app[targetKey] !== null && clean(app[targetKey]) !== '') return;
    if (value === undefined || value === null || clean(value) === '') return;
    app[targetKey] = value;
  };
  const fromNormalized = (normalizedKey: string) => normalizedEntries[normalizeFieldName(normalizedKey)];

  setIfMissing('memberFirstName', pickFirstNonEmpty(app, [
    'memberFirstName',
    'Member_First_Name',
    'Senior_First',
    'firstName',
    'First_Name',
  ]) || fromNormalized('member first name') || fromNormalized('senior first'));
  setIfMissing('memberLastName', pickFirstNonEmpty(app, [
    'memberLastName',
    'Member_Last_Name',
    'Senior_Last',
    'lastName',
    'Last_Name',
  ]) || fromNormalized('member last name') || fromNormalized('senior last'));
  setIfMissing('memberMrn', pickFirstNonEmpty(app, [
    'memberMrn',
    'medicalRecordNumber',
    'mrn',
    'Member_MRN',
    'MRN',
    'Medical_Record_Number',
  ]) || fromNormalized('member mrn') || fromNormalized('medical record number'));
  const mediCalNumber = extractMediCalNumberFromApplication(app);
  setIfMissing('memberMediCalNum', mediCalNumber);
  setIfMissing('confirmMemberMediCalNum', mediCalNumber);
  setIfMissing('memberSex', pickFirstNonEmpty(app, [
    'memberSex',
    'memberGender',
    'sex',
    'gender',
    'Member_Gender_Code',
  ]) || fromNormalized('member sex') || fromNormalized('member gender') || fromNormalized('sex'));
  setIfMissing('memberCounty', pickFirstNonEmpty(app, [
    'memberCounty',
    'memberCustomaryCounty',
    'customaryCounty',
    'currentCounty',
    'county',
    'Member_County',
  ]) || fromNormalized('member county') || fromNormalized('county'));
  setIfMissing('bestContactFirstName', pickFirstNonEmpty(app, [
    'bestContactFirstName',
    'referrerFirstName',
    'repFirstName',
    'contactFirstName',
  ]) || fromNormalized('best contact first name'));
  setIfMissing('bestContactLastName', pickFirstNonEmpty(app, [
    'bestContactLastName',
    'referrerLastName',
    'repLastName',
    'contactLastName',
  ]) || fromNormalized('best contact last name'));
  setIfMissing('bestContactEmail', pickFirstNonEmpty(app, [
    'bestContactEmail',
    'referrerEmail',
    'repEmail',
    'contactEmail',
  ]) || fromNormalized('best contact email'));
  setIfMissing('bestContactPhone', pickFirstNonEmpty(app, [
    'bestContactPhone',
    'referrerPhone',
    'repPhone',
    'contactPhone',
  ]) || fromNormalized('best contact phone'));
  setIfMissing('careManagerName', pickFirstNonEmpty(app, [
    'careManagerName',
    'caseManagerName',
    'Care_Manager_Name',
    'Care_Manager',
    'caseManager',
    'careManager',
  ]) || fromNormalized('care manager name') || fromNormalized('care manager') || fromNormalized('case manager'));
  setIfMissing('careManagerPhone', pickFirstNonEmpty(app, [
    'careManagerPhone',
    'caseManagerPhone',
    'Care_Manager_Phone',
    'caseManagerContact',
  ]) || fromNormalized('care manager phone') || fromNormalized('case manager phone'));
  setIfMissing('careManagerEmail', pickFirstNonEmpty(app, [
    'careManagerEmail',
    'caseManagerEmail',
    'Care_Manager_Email',
  ]) || fromNormalized('care manager email') || fromNormalized('case manager email'));
  setIfMissing('healthPlan', pickFirstNonEmpty(app, [
    'healthPlan',
    'CalAIM_MCO',
    'calaimMco',
    'memberHealthPlan',
    'CalAIM_MCP',
  ]) || fromNormalized('health plan') || fromNormalized('calaim mco'));
  setIfMissing('snfDiversionReason', pickFirstNonEmpty(app, [
    'snfDiversionReason',
    'SNFDiversionReason',
    'SNF_Diversion_Reason',
    'SNF_Diversion_Notes',
    'Diversion_Reason',
  ]) || fromNormalized('snf diversion reason') || fromNormalized('snf diversion notes') || fromNormalized('diversion reason'));
  const ispLocationTypeValue = pickFirstNonEmpty(app, [
    'ispLocationType',
    'ispLocation',
    'ISPLocationType',
    'ISP_Location_Type',
    'isp_location_type',
  ]) || fromNormalized('isp location type') || fromNormalized('isp location');
  setIfMissing('ispLocationType', ispLocationTypeValue);
  // Keep backwards compatibility with older saved mappings that used ispLocation.
  setIfMissing('ispLocation', ispLocationTypeValue);
  const ispAddressValue = pickFirstNonEmpty(app, [
    'ispAddress',
    'ISP_Address',
    'isp_location_address',
    'ISPLocationAddress',
    'ispStreetAddress',
  ]) || fromNormalized('isp address');
  setIfMissing('ispAddress', ispAddressValue);
  const ispCityValue = pickFirstNonEmpty(app, [
    'ispCity',
    'ISP_City',
    'isp_location_city',
    'ISPLocationCity',
  ]) || fromNormalized('isp city');
  setIfMissing('ispCity', ispCityValue);
  const ispStateValue = pickFirstNonEmpty(app, [
    'ispState',
    'ISP_State',
    'isp_location_state',
    'ISPLocationState',
  ]) || fromNormalized('isp state');
  setIfMissing('ispState', ispStateValue);
  const ispZipValue = pickFirstNonEmpty(app, [
    'ispZip',
    'ISP_Zip',
    'ISP_ZIP',
    'isp_location_zip',
    'ISPLocationZip',
  ]) || fromNormalized('isp zip');
  setIfMissing('ispZip', ispZipValue);
  const ispFacilityNameValue = pickFirstNonEmpty(app, [
    'ispFacilityName',
    'ISP_Facility_Name',
    'ispLocationName',
    'ISPLocationName',
    'ispFacility',
  ]) || fromNormalized('isp facility name') || fromNormalized('isp location name');
  setIfMissing('ispFacilityName', ispFacilityNameValue);
  // Preserve older mapping key variants for location/facility naming.
  setIfMissing('ispLocationName', ispFacilityNameValue);

  return app;
};
let adminDb: any = null;
try {
  if (!getApps().length) {
    const app = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94',
    });
    adminDb = getFirestore(app);
  } else {
    adminDb = getFirestore();
  }
} catch (error) {
  console.warn('Firebase Admin init failed for Caspio push mapping fallback:', error);
}

const getApplicationValueByCsField = (applicationData: any, csField: string) => {
  const direct = applicationData?.[csField];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  const normalizedTarget = normalizeFieldName(csField);
  if (!normalizedTarget || !applicationData || typeof applicationData !== 'object') return '';
  if (
    normalizedTarget === 'membermrn' ||
    normalizedTarget === 'mrn' ||
    normalizedTarget === 'medicalrecordnumber' ||
    normalizedTarget === 'medicalrecordnumbermrn' ||
    normalizedTarget === 'kaisermrn'
  ) {
    const mrnValue = pickFirstNonEmpty(applicationData as Record<string, any>, [
      'memberMrn',
      'medicalRecordNumber',
      'mrn',
      'Member_MRN',
      'MRN',
      'Medical_Record_Number',
      'Medical_Record_Number_MRN',
    ]);
    if (hasValue(mrnValue)) return mrnValue;
  }
  if (
    normalizedTarget === 'sex' ||
    normalizedTarget === 'gender' ||
    normalizedTarget === 'membersex'
  ) {
    const sexValue = pickFirstNonEmpty(applicationData as Record<string, any>, [
      'sex',
      'gender',
      'memberSex',
      'memberGender',
    ]);
    const normalizedSex = toCaspioSexValue(sexValue);
    if (normalizedSex) return normalizedSex;
  }
  if (
    normalizedTarget === 'membercounty' ||
    normalizedTarget === 'county'
  ) {
    const countyValue = pickFirstNonEmpty(applicationData as Record<string, any>, [
      'memberCounty',
      'memberCustomaryCounty',
      'currentCounty',
      'customaryCounty',
      'county',
      'member_county',
      'Member_County',
      'Current_County',
    ]);
    if (hasValue(countyValue)) return countyValue;
  }
  if (
    normalizedTarget === 'haslegalrep' ||
    normalizedTarget === 'legalrep' ||
    normalizedTarget === 'legalrepresentative'
  ) {
    return toCaspioLegalRepChoice(
      pickFirstNonEmpty(applicationData as Record<string, any>, [
        'hasLegalRep',
        'HasLegalRep',
        'legalRepresentative',
      ])
    );
  }
  if (MEDI_CAL_CS_FIELD_ALIASES.has(normalizedTarget)) {
    const mediCalValue = extractMediCalNumberFromApplication(applicationData as Record<string, any>);
    if (mediCalValue) return mediCalValue;
  }
  if (normalizedTarget === 'isplocation' || normalizedTarget === 'isplocationtype') {
    const ispLocationValue = pickFirstNonEmpty(applicationData as Record<string, any>, [
      'ispLocationType',
      'ispLocation',
      'ISPLocationType',
      'ISP_Location_Type',
      'isp_location_type',
    ]);
    if (hasValue(ispLocationValue)) return ispLocationValue;
  }
  if (normalizedTarget === 'ispaddress') {
    const ispAddressValue = pickFirstNonEmpty(applicationData as Record<string, any>, [
      'ispAddress',
      'ISP_Address',
      'isp_location_address',
      'ISPLocationAddress',
      'ispStreetAddress',
    ]);
    if (hasValue(ispAddressValue)) return ispAddressValue;
  }
  if (normalizedTarget === 'ispcity') {
    const ispCityValue = pickFirstNonEmpty(applicationData as Record<string, any>, [
      'ispCity',
      'ISP_City',
      'isp_location_city',
      'ISPLocationCity',
    ]);
    if (hasValue(ispCityValue)) return ispCityValue;
  }
  if (normalizedTarget === 'ispstate') {
    const ispStateValue = pickFirstNonEmpty(applicationData as Record<string, any>, [
      'ispState',
      'ISP_State',
      'isp_location_state',
      'ISPLocationState',
    ]);
    if (hasValue(ispStateValue)) return ispStateValue;
  }
  if (normalizedTarget === 'ispzip') {
    const ispZipValue = pickFirstNonEmpty(applicationData as Record<string, any>, [
      'ispZip',
      'ISP_Zip',
      'ISP_ZIP',
      'isp_location_zip',
      'ISPLocationZip',
    ]);
    if (hasValue(ispZipValue)) return ispZipValue;
  }
  if (normalizedTarget === 'ispfacilityname' || normalizedTarget === 'isplocationname') {
    const ispFacilityNameValue = pickFirstNonEmpty(applicationData as Record<string, any>, [
      'currentLocationName',
      'ispFacilityName',
      'ISP_Facility_Name',
      'ispLocationName',
      'ISPLocationName',
      'ispFacility',
      'rcfeName',
      'RCFE_Name',
    ]);
    if (hasValue(ispFacilityNameValue)) return ispFacilityNameValue;
  }
  if (normalizedTarget === 'ispcurrentlocation') {
    const currentLocationNameValue = pickFirstNonEmpty(applicationData as Record<string, any>, [
      'currentLocationName',
      'ispFacilityName',
      'ISP_Facility_Name',
      'ispLocationName',
      'ISPLocationName',
      'ispFacility',
      'rcfeName',
      'RCFE_Name',
    ]);
    if (hasValue(currentLocationNameValue)) return currentLocationNameValue;
  }
  for (const [key, value] of Object.entries(applicationData)) {
    if (normalizeFieldName(key) === normalizedTarget && value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
};

const looksLikeSyntheticFixtureValue = (value: string) => {
  const normalized = clean(value);
  const lower = normalized.toLowerCase();
  if (!lower) return false;
  if (
    lower === 'unknown' ||
    lower === 'unknown contact' ||
    lower === 'mrn-pending' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === '-' ||
    lower === 'dummy' ||
    lower === '5550000000'
  ) {
    return true;
  }
  if (lower.includes('@placeholder.')) return true;
  if (/^test[_\s-]/i.test(normalized)) return true;
  if (/[_-]\d{4,}$/.test(normalized) && /^test/i.test(normalized)) return true;
  return false;
};
const summarizeDebugValue = (raw: unknown) => {
  const value = clean(raw);
  if (!value) return { kind: 'empty', length: 0, preview: '' };
  const lower = value.toLowerCase();
  const isSynthetic =
    lower.includes('pending') ||
    lower.includes('unknown') ||
    lower.includes('placeholder') ||
    lower.includes('dummy') ||
    lower.includes('@placeholder.') ||
    lower.includes('mrn-pending');
  if (isSynthetic) {
    return { kind: 'synthetic', length: value.length, preview: value.slice(0, 80) };
  }
  if (/^\d+$/.test(value)) {
    return { kind: 'numeric', length: value.length, preview: `[numeric:${value.length}]` };
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value)) {
    return { kind: 'date-like', length: value.length, preview: '[date-like]' };
  }
  return { kind: 'text', length: value.length, preview: `[text:${value.length}]` };
};
const buildCaspioPayloadDebugSummary = (payload: Record<string, any>) =>
  Object.entries(payload || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([field, rawValue]) => ({
      field,
      ...summarizeDebugValue(rawValue),
    }));
type MappingDraftMeta = {
  draftName?: string;
  savedAtIso?: string;
  lockedAtIso?: string;
  source?: string;
} | null;

const getSharedLockedMapping = async (): Promise<{
  lockedMappings: Record<string, string> | null;
  mappingDraftMeta: MappingDraftMeta;
}> => {
  if (!adminDb) return { lockedMappings: null, mappingDraftMeta: null };
  try {
    const sharedSnap = await adminDb.collection('admin-settings').doc('caspio-field-mapping').get();
    if (!sharedSnap.exists) return { lockedMappings: null, mappingDraftMeta: null };
    const data = (sharedSnap.data() || {}) as Record<string, any>;
    const locked = data?.lockedMappings;
    const draftName = clean(data?.lockedDraftName);
    const savedAtIso = clean(data?.lockedDraftSavedAtIso);
    const lockedAtIso = clean(data?.lockedAtIso);
    const mappingDraftMeta: MappingDraftMeta =
      draftName || savedAtIso || lockedAtIso
        ? {
            draftName: draftName || undefined,
            savedAtIso: savedAtIso || undefined,
            lockedAtIso: lockedAtIso || undefined,
            source: 'shared',
          }
        : null;
    if (!locked || typeof locked !== 'object') return { lockedMappings: null, mappingDraftMeta };
    const entries = Object.entries(locked).filter(([k, v]) => hasValue(k) && hasValue(v));
    if (!entries.length) return { lockedMappings: null, mappingDraftMeta };
    return {
      lockedMappings: Object.fromEntries(entries) as Record<string, string>,
      mappingDraftMeta,
    };
  } catch (error) {
    console.warn('Failed to load shared locked Caspio mapping in API:', error);
    return { lockedMappings: null, mappingDraftMeta: null };
  }
};
const buildMemberDataFromMapping = (
  applicationData: any,
  mapping?: Record<string, string> | null
) => {
  const memberData: Record<string, any> = {};
  if (!mapping || typeof mapping !== 'object') return memberData;

  Object.entries(mapping).forEach(([csField, caspioField]) => {
    if (!caspioField) return;
    const value = getApplicationValueByCsField(applicationData, csField);
    if (value === undefined || value === null || value === '') return;
    if (looksLikeSexField(caspioField)) {
      const normalizedSex = toCaspioSexValue(value);
      if (!normalizedSex) return;
      memberData[caspioField] = normalizedSex;
      return;
    }
    memberData[caspioField] = value;
  });

  return memberData;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTableFieldNames(baseUrl: string, token: string, tableName: string): Promise<string[]> {
  const encodedTable = encodeURIComponent(tableName);
  const endpoints = [
    `${baseUrl}/tables/${encodedTable}/fields`,
    `${baseUrl}/tables/${encodedTable}/columns`,
  ];
  for (const url of endpoints) {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) continue;
    const json = await res.json().catch(() => ({} as any));
    const list = Array.isArray(json?.Result) ? json.Result : [];
    const names = list
      .map((item: any) => clean(item?.Name || item?.name))
      .filter(Boolean);
    if (names.length > 0) return names;
  }
  return [];
}

async function createClientAndGetClientId2(
  baseUrl: string,
  token: string,
  memberFirstName: string,
  memberLastName: string,
  primaryContactFirstName: string,
  primaryContactLastName: string
): Promise<string> {
  const clientTable = 'connect_tbl_clients';
  const whereCandidates = [
    // Current preferred lookup for client table records.
    `Senior_First='${esc(memberFirstName)}' AND Senior_Last='${esc(memberLastName)}'`,
    // Backward compatibility for old records created before Senior_* was enforced.
    `First_Name='${esc(primaryContactFirstName)}' AND Last_Name='${esc(primaryContactLastName)}'`,
    `First_Name='${esc(memberFirstName)}' AND Last_Name='${esc(memberLastName)}'`,
  ];
  const lookupOrderCandidates = ['client_ID2 DESC', 'Client_ID2 DESC', 'PK_ID DESC'];
  const lookupExistingClient = async (): Promise<{ clientId2: string; row: Record<string, any> | null }> => {
    for (const where of whereCandidates) {
      for (const orderBy of lookupOrderCandidates) {
        const lookupUrl =
          `${baseUrl}/tables/${clientTable}/records` +
          `?q.where=${encodeURIComponent(where)}` +
          `&q.select=${encodeURIComponent('PK_ID,client_ID2,Client_ID2,Record_ID,Senior_First,Senior_Last,First_Name,Last_Name')}` +
          `&q.orderBy=${encodeURIComponent(orderBy)}` +
          `&q.limit=1`;
        const lookupResponse = await fetch(lookupUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!lookupResponse.ok) continue;
        const lookupJson = await lookupResponse.json().catch(() => ({} as any));
        const row = Array.isArray(lookupJson?.Result) ? lookupJson.Result[0] : null;
        const clientId2 = clean(row?.client_ID2 || row?.Client_ID2 || row?.clientid2 || row?.Record_ID);
        if (clientId2) return { clientId2, row: row || null };
      }
    }
    return { clientId2: '', row: null };
  };

  const updateClientNameFields = async (pkId: number) => {
    const safePk = Number(pkId || 0);
    if (!safePk) return;
    const where = `PK_ID=${safePk}`;
    const updateUrl = `${baseUrl}/tables/${clientTable}/records?q.where=${encodeURIComponent(where)}`;
    const response = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        First_Name: primaryContactFirstName,
        Last_Name: primaryContactLastName,
        Senior_First: memberFirstName,
        Senior_Last: memberLastName,
      }),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => '');
      console.warn('Client name-field sync failed in connect_tbl_clients:', {
        status: response.status,
        errorPreview: clean(err).slice(0, 300),
        pkId: safePk,
      });
    }
  };

  // Prevent duplicate client rows on retries by reusing existing client_ID2 when possible.
  const existingClient = await lookupExistingClient();
  const existingClientId2 = existingClient.clientId2;
  if (existingClientId2) {
    const existingPkId = Number(existingClient.row?.PK_ID || existingClient.row?.pk_id || 0);
    if (existingPkId) await updateClientNameFields(existingPkId);
    return existingClientId2;
  }

  const createUrl = `${baseUrl}/tables/${clientTable}/records`;
  const createPayload = {
    // Primary contact identity on client row.
    First_Name: primaryContactFirstName,
    Last_Name: primaryContactLastName,
    // Member identity for reliable Senior_* lookup in clients table.
    Senior_First: memberFirstName,
    Senior_Last: memberLastName,
  };

  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createPayload),
  });
  if (!createResponse.ok) {
    const err = await createResponse.text().catch(() => '');
    throw new Error(`Failed to create client in connect_tbl_clients: ${createResponse.status} ${err}`);
  }
  const createJson = await createResponse.json().catch(() => ({} as any));
  const createResultRow = Array.isArray(createJson?.Result) ? createJson.Result[0] : createJson?.Result;
  const directClientId2 = clean(
    createResultRow?.client_ID2 ||
      createResultRow?.Client_ID2 ||
      createResultRow?.clientid2 ||
      createResultRow?.Record_ID
  );
  if (directClientId2) return directClientId2;

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const existing = await lookupExistingClient();
    if (existing.clientId2) {
      const existingPkId = Number(existing.row?.PK_ID || existing.row?.pk_id || 0);
      if (existingPkId) await updateClientNameFields(existingPkId);
      return existing.clientId2;
    }

    await sleep(250 * attempt);
  }

  throw new Error('Client was created, but generated client_ID2 was not available after retries.');
}

async function resolveClientNotesUserId(params: {
  baseUrl: string;
  token: string;
  clientId2: string;
  preferredUserId?: string;
}): Promise<number> {
  const preferredNumeric = Number.parseInt(clean(params.preferredUserId), 10);
  if (Number.isFinite(preferredNumeric) && preferredNumeric > 0) {
    return preferredNumeric;
  }

  try {
    const where = buildEqualsClause('Client_ID2', params.clientId2);
    if (where) {
      const url =
        `${params.baseUrl}/tables/connect_tbl_clientnotes/records` +
        `?q.where=${encodeURIComponent(where)}` +
        `&q.select=${encodeURIComponent('User_ID')}` +
        `&q.orderBy=${encodeURIComponent('Time_Stamp DESC')}` +
        `&q.limit=1`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${params.token}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const json = await response.json().catch(() => ({} as any));
        const row = Array.isArray(json?.Result) ? json.Result[0] : null;
        const parsed = Number.parseInt(clean(row?.User_ID), 10);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
    }
  } catch {
    // Fall back to safe default below.
  }

  return 1;
}

async function syncPrePushNoteToClientNotes(params: {
  baseUrl: string;
  token: string;
  clientId2: string;
  preAssessmentNotes: string;
  firstName: string;
  lastName: string;
  assignedStaffId: string;
  assignedStaffName: string;
  applicationReference?: string;
}) {
  const clientId2 = clean(params.clientId2);
  const prePushNotes = clean(params.preAssessmentNotes);
  if (!prePushNotes) {
    return { success: true, skipped: true, reason: 'no-pre-push-notes' as const };
  }
  if (!clientId2) {
    return { success: false, skipped: true, reason: 'missing-client-id2' as const };
  }

  try {
    const resolvedUserId = await resolveClientNotesUserId({
      baseUrl: params.baseUrl,
      token: params.token,
      clientId2,
      preferredUserId: params.assignedStaffId,
    });
    const suffix = params.applicationReference
      ? ` [Admin push: ${params.applicationReference}]`
      : ' [Admin push]';
    const basePayload: Record<string, any> = {
      Client_ID2: /^\d+$/.test(clientId2) ? Number(clientId2) : clientId2,
      User_ID: resolvedUserId,
      Comments: `${prePushNotes}${suffix}`,
      Time_Stamp: new Date().toISOString(),
    };
    const payload: Record<string, any> = {
      ...basePayload,
      Follow_Up_Status: '🟢Open',
    };
    if (hasValue(params.assignedStaffId)) payload.Follow_Up_Assignment = params.assignedStaffId;
    if (hasValue(params.assignedStaffName)) {
      payload.Assigned_First = params.assignedStaffName;
      payload.User_Full_Name = params.assignedStaffName;
    }

    const insertUrl = `${params.baseUrl}/tables/connect_tbl_clientnotes/records`;
    const postNote = async (notePayload: Record<string, any>) => {
      const insertResponse = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notePayload),
      });
      if (insertResponse.ok) return { ok: true as const, errorText: '' };
      const errorText = await insertResponse.text().catch(() => '');
      return { ok: false as const, errorText: `Caspio note insert failed: ${insertResponse.status} ${errorText}` };
    };
    const firstAttempt = await postNote(payload);
    if (!firstAttempt.ok) {
      // Some client-notes environments do not expose optional assignment/status columns.
      const fallbackAttempt = await postNote(basePayload);
      if (!fallbackAttempt.ok) {
        const secondFallbackPayload = { ...basePayload };
        delete secondFallbackPayload.Time_Stamp;
        const secondFallback = await postNote(secondFallbackPayload);
        if (!secondFallback.ok) {
          throw new Error([firstAttempt.errorText, fallbackAttempt.errorText, secondFallback.errorText].filter(Boolean).join(' | '));
        }
      }
    }

    return { success: true, skipped: false, reason: 'inserted' as const };
  } catch (error: any) {
    console.warn('Failed to sync pre-push notes to connect_tbl_clientnotes:', {
      clientId2,
      error: clean(error?.message || 'unknown'),
    });
    return { success: false, skipped: false, reason: 'insert-failed' as const, error: clean(error?.message || 'unknown') };
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isCaspioWriteReadOnly()) {
      return NextResponse.json(caspioWriteBlockedResponse(), { status: 423 });
    }

    const body = await request.json().catch(() => ({} as any));
    const rawApplicationData = body?.applicationData || null;
    const applicationData = rawApplicationData && typeof rawApplicationData === 'object'
      ? canonicalizeApplicationData(rawApplicationData as Record<string, any>)
      : null;
    const providedMapping = (body?.mapping || null) as Record<string, string> | null;
    const notesOnly = Boolean(body?.notesOnly);
    const skeletonPush = Boolean(body?.skeletonPush);
    const updateExistingOnly = Boolean(body?.updateExistingOnly);
    const sharedMappingPayload = await getSharedLockedMapping();
    const fallbackMapping = sharedMappingPayload?.lockedMappings || null;
    const requestedMappingDraftMeta = (() => {
      const raw = body?.mappingDraftMeta;
      if (!raw || typeof raw !== 'object') return null;
      const draftName = clean((raw as any)?.draftName);
      const savedAtIso = clean((raw as any)?.savedAtIso);
      const lockedAtIso = clean((raw as any)?.lockedAtIso);
      const source = clean((raw as any)?.source);
      if (!draftName && !savedAtIso && !lockedAtIso && !source) return null;
      return {
        draftName: draftName || undefined,
        savedAtIso: savedAtIso || undefined,
        lockedAtIso: lockedAtIso || undefined,
        source: source || undefined,
      };
    })();
    const resolvedMappingDraftMeta = requestedMappingDraftMeta || sharedMappingPayload?.mappingDraftMeta || null;
    const mapping =
      providedMapping && typeof providedMapping === 'object' && Object.keys(providedMapping).length > 0
        ? providedMapping
        : fallbackMapping;
    if (!applicationData || typeof applicationData !== 'object') {
      return NextResponse.json({ success: false, message: 'Application data is required.' }, { status: 400 });
    }

    const firstName = clean(applicationData.memberFirstName);
    const lastName = clean(applicationData.memberLastName);
    const primaryContactFirstNameDefault = clean(
      applicationData?.bestContactFirstName ||
      applicationData?.referrerFirstName ||
      firstName
    );
    const primaryContactLastNameDefault = clean(
      applicationData?.bestContactLastName ||
      applicationData?.referrerLastName ||
      lastName
    );
    const assignedStaffName = clean(applicationData?.assignedStaffName);
    const assignedStaffId = clean(applicationData?.assignedStaffId);
    const requestedCalAIMStatusRaw = clean(applicationData?.caspioCalAIMStatus || applicationData?.CalAIM_Status);
    const requestedKaiserStatusRaw = normalizeKaiserStatusForPush(
      clean(applicationData?.kaiserStatus || applicationData?.Kaiser_Status)
    );
    const kaiserAuthorizationMode = clean(applicationData?.kaiserAuthorizationMode).toLowerCase();
    const isAlreadySent = Boolean(applicationData?.caspioSent);
    const intakeType = clean(applicationData?.intakeType).toLowerCase();
    const applicationStatus = clean(applicationData?.status).toLowerCase();
    const isAuthReceivedMode =
      kaiserAuthorizationMode === 'authorization_received' ||
      Boolean(applicationData?.kaiserAuthReceivedViaIls) ||
      intakeType === 'kaiser_auth_received_via_ils' ||
      applicationStatus === 'authorization received (doc collection)';
    const requestedKaiserStatus =
      !isAlreadySent && isAuthReceivedMode
        ? 'T2038 Received, doc collection'
        : isAuthReceivedMode && isNotRequestedDocCollectionStatus(requestedKaiserStatusRaw)
          ? 'T2038 Received, doc collection'
          : requestedKaiserStatusRaw;
    const requestedSocialWorkerHold = clean(
      applicationData?.holdForSocialWorkerStatus ||
      applicationData?.Hold_For_Social_Worker_Visit ||
      applicationData?.Hold_For_Social_Worker ||
      applicationData?.hold_for_social_worker ||
      HOLD_FOR_SOCIAL_WORKER_VALUE
    ) || HOLD_FOR_SOCIAL_WORKER_VALUE;
    const requestedMediCalNumber = clean(
      extractMediCalNumberFromApplication(applicationData as Record<string, any>) ||
      applicationData?.MediCal_Number ||
      applicationData?.Medical_Number
    );
    const requestedMonthlyIncome = clean(
      applicationData?.proofIncomeActualAmount ||
      applicationData?.monthlyIncome ||
      applicationData?.Monthly_Income
    );
    const resolvedLastEligibilityCheckDate = toCaspioDate(
      pickFirstNonEmpty(applicationData as Record<string, any>, [
        'lastEligibilityCheckDate',
        'lastEligibilityCheckAt',
        'last_eligibility_check_date',
        'last_eligibility_check_at',
        'eligibilityCheckDate',
        'eligibilityCheckedAt',
        'eligibilityVerifiedAt',
        'verifiedAt',
      ])
    );
    const preAssessmentNotes = clean(
      applicationData?.preAssessmentCareNeedsNotes ||
      applicationData?.pre_assessment_care_needs_notes ||
      applicationData?.preAssessmentNotes
    );
    const snfDiversionReasonNotes = clean(
      applicationData?.snfDiversionReason ||
      applicationData?.SNFDiversionReason ||
      applicationData?.SNF_Diversion_Reason ||
      applicationData?.SNF_Diversion_Notes
    );
    const careManagerName = clean(
      applicationData?.careManagerName ||
      applicationData?.caseManagerName ||
      applicationData?.Care_Manager_Name ||
      applicationData?.Care_Manager ||
      applicationData?.careManager
    );
    const careManagerPhone = clean(
      applicationData?.careManagerPhone ||
      applicationData?.caseManagerPhone ||
      applicationData?.Care_Manager_Phone
    );
    const careManagerEmail = clean(
      applicationData?.careManagerEmail ||
      applicationData?.caseManagerEmail ||
      applicationData?.Care_Manager_Email
    );
    const careManagerNotesLine = (() => {
      if (!careManagerName) return '';
      const contactBits = [
        careManagerPhone ? `Phone: ${careManagerPhone}` : '',
        careManagerEmail ? `Email: ${careManagerEmail}` : '',
      ].filter(Boolean);
      if (contactBits.length === 0) return `ILS Care Manager: ${careManagerName}`;
      return `ILS Care Manager: ${careManagerName} (${contactBits.join(' | ')})`;
    })();
    const basePushNotes = (() => {
      const noteBlocks: string[] = [];
      if (preAssessmentNotes && snfDiversionReasonNotes) {
        if (normalizeFieldName(preAssessmentNotes) === normalizeFieldName(snfDiversionReasonNotes)) {
          noteBlocks.push(preAssessmentNotes);
        } else {
          noteBlocks.push(`${preAssessmentNotes}\n\nSNF Diversion Reason: ${snfDiversionReasonNotes}`);
        }
      } else if (preAssessmentNotes) {
        noteBlocks.push(preAssessmentNotes);
      } else if (snfDiversionReasonNotes) {
        noteBlocks.push(`SNF Diversion Reason: ${snfDiversionReasonNotes}`);
      }
      return noteBlocks.join('\n\n').trim();
    })();
    const combinedPushNotes = basePushNotes
      ? [basePushNotes, careManagerNotesLine].filter(Boolean).join('\n\n').trim()
      : '';
    const isDraftLikeForPush =
      clean(applicationData?.status).toLowerCase() === 'draft' ||
      Boolean(applicationData?.createdByAdmin) ||
      Boolean(applicationData?.allowDraftCaspioPush);
    const normalizedHealthPlan = clean(
      applicationData?.healthPlan || applicationData?.CalAIM_MCO || applicationData?.calaimMco
    ).toLowerCase();
    const isKaiserApplication =
      normalizedHealthPlan === 'kaiser' ||
      normalizedHealthPlan.includes('kaiser') ||
      kaiserAuthorizationMode === 'authorization_received' ||
      kaiserAuthorizationMode === 'authorization_needed' ||
      Boolean(applicationData?.kaiserAuthReceivedViaIls) ||
      Boolean(requestedKaiserStatus);
    const isHealthNetApplication =
      normalizedHealthPlan.includes('health net') ||
      normalizedHealthPlan.includes('healthnet') ||
      normalizedHealthPlan === 'hn';
    const requestedCalAIMStatus = (() => {
      // ILS auth-received intake (single-auth PDF + spreadsheet skeleton) must
      // always push Authorized, even if draft UI state still shows Pending.
      if (isAuthReceivedMode) return 'Authorized';
      if (!requestedCalAIMStatusRaw && isKaiserApplication) {
        if (kaiserAuthorizationMode === 'authorization_received') return 'Authorized';
        return 'Pending';
      }
      if (/^authorized$/i.test(requestedCalAIMStatusRaw)) return 'Authorized';
      if (/^pending$/i.test(requestedCalAIMStatusRaw)) return 'Pending';
      // In Kaiser auth-request flow, UI can display/store T2038 Requested while
      // CalAIM_Status in Caspio must remain Pending/Authorized.
      if (isKaiserApplication && /^t2038\s*requested$/i.test(requestedCalAIMStatusRaw)) return 'Pending';
      return requestedCalAIMStatusRaw;
    })();
    const explicitBestContactFirstName = clean(
      (rawApplicationData as Record<string, any> | null)?.bestContactFirstName ||
      (rawApplicationData as Record<string, any> | null)?.contactFirstName
    );
    const explicitBestContactLastName = clean(
      (rawApplicationData as Record<string, any> | null)?.bestContactLastName ||
      (rawApplicationData as Record<string, any> | null)?.contactLastName
    );
    const isSkeletonLikePush = skeletonPush || (isKaiserApplication && isDraftLikeForPush);
    const primaryContactFirstName = clean(
      isSkeletonLikePush
        ? (explicitBestContactFirstName || UNKNOWN_CONTACT_PLACEHOLDER)
        : primaryContactFirstNameDefault
    );
    const primaryContactLastName = clean(
      isSkeletonLikePush
        ? (explicitBestContactLastName || UNKNOWN_CONTACT_PLACEHOLDER)
        : primaryContactLastNameDefault
    );
    if (!firstName || !lastName) {
      return NextResponse.json(
        { success: false, message: 'Member first and last name are required.' },
        { status: 400 }
      );
    }
    if (!assignedStaffName && !assignedStaffId) {
      return NextResponse.json(
        {
          success: false,
          code: 'missing-assigned-staff',
          message: 'Assign staff before pushing this application to Caspio.',
        },
        { status: 400 }
      );
    }
    if (requestedCalAIMStatus !== 'Authorized' && requestedCalAIMStatus !== 'Pending') {
      return NextResponse.json(
        {
          success: false,
          code: 'missing-calaim-status',
          message: 'Select CalAIM Status (Authorized or Pending) on the main application page before pushing to Caspio.',
        },
        { status: 400 }
      );
    }
    if (isKaiserApplication && !requestedKaiserStatus) {
      return NextResponse.json(
        {
          success: false,
          code: 'missing-kaiser-status',
          message: 'Select Kaiser Status on the main application page before pushing this Kaiser application.',
        },
        { status: 400 }
      );
    }
    if (isKaiserApplication && !isRequiredPrePushKaiserStatus(requestedKaiserStatus)) {
      return NextResponse.json(
        {
          success: false,
          code: 'invalid-kaiser-status',
          message:
            'Before pushing to Caspio, Kaiser Status must be either "T2038 Received, Need First Contact" or "T2038 Received, doc collection".',
        },
        { status: 400 }
      );
    }
    if (isDraftLikeForPush && !combinedPushNotes) {
      return NextResponse.json(
        {
          success: false,
          code: 'missing-pre-push-notes',
            message: 'Pre-assessment notes or SNF diversion reason notes are required before pushing draft applications to Caspio.',
        },
        { status: 400 }
      );
    }
    if (skeletonPush && !requestedMediCalNumber) {
      return NextResponse.json(
        {
          success: false,
          code: 'missing-medical-number',
          message: 'Medical Number (Medi-Cal/CIN) is required before pushing this skeleton to Caspio.',
        },
        { status: 400 }
      );
    }

    const caspioConfig = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(caspioConfig);
    const baseUrl = caspioConfig.restBaseUrl;
    const membersTable = 'CalAIM_tbl_Members';
    const firstNameField = clean(mapping?.memberFirstName) || 'Senior_First';
    const lastNameField = clean(mapping?.memberLastName) || 'Senior_Last';

    const trySearchMember = async (whereClause: string) => {
      const searchUrl =
        `${baseUrl}/tables/${membersTable}/records` +
        `?q.where=${encodeURIComponent(whereClause)}` +
        `&q.select=${encodeURIComponent('PK_ID,client_ID2,Client_ID2')}` +
        `&q.orderBy=${encodeURIComponent('PK_ID DESC')}` +
        `&q.limit=1`;
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return null;
      const json = await response.json().catch(() => ({} as any));
      if (Array.isArray(json?.Result) && json.Result.length > 0) {
        return json.Result[0] as Record<string, any>;
      }
      return null;
    };

    const hintedClientId2 = clean(
      applicationData?.clientId2 ||
        applicationData?.client_ID2 ||
        applicationData?.Client_ID2 ||
        applicationData?.caspioClientId2
    );
    const hintedMrn = clean(
      applicationData?.memberMrn ||
        applicationData?.medicalRecordNumber ||
        applicationData?.mrn ||
        applicationData?.Member_MRN ||
        applicationData?.Medical_Record_Number ||
        applicationData?.Medical_Record_Number_MRN
    );
    const mappedFields = buildMemberDataFromMapping(applicationData, mapping);
    const mappedMrnEntry = Object.entries(mappedFields).find(
      ([fieldName, value]) => looksLikeMrnField(fieldName) && hasValue(value)
    );
    const mappedMediCalEntry = Object.entries(mappedFields).find(
      ([fieldName, value]) => looksLikeMediCalField(fieldName) && hasValue(value)
    );
    const hintedMediCalNumber = clean(
      extractMediCalNumberFromApplication(applicationData as Record<string, any>) ||
      (isHealthNetApplication ? hintedMrn : '') ||
      mappedMediCalEntry?.[1]
    );
    const effectiveHintedMrn = clean(
      isHealthNetApplication
        ? hintedMrn || clean(mappedMrnEntry?.[1]) || hintedMediCalNumber
        : hintedMrn || clean(mappedMrnEntry?.[1])
    );
    const applicationReference = clean(
      applicationData?.applicationId ||
      applicationData?.id ||
      body?.applicationId
    );
    if (notesOnly) {
      if (!hintedClientId2) {
        return NextResponse.json(
          {
            success: false,
            code: 'missing-client-id2',
            message: 'Client_ID2 is required to push notes separately.',
          },
          { status: 400 }
        );
      }
      if (!combinedPushNotes) {
        return NextResponse.json(
          {
            success: false,
            code: 'missing-pre-push-notes',
            message: 'Pre-assessment notes or SNF diversion reason notes are required before sending notes to Caspio.',
          },
          { status: 400 }
        );
      }
      const noteSync = await syncPrePushNoteToClientNotes({
        baseUrl,
        token,
        clientId2: hintedClientId2,
        preAssessmentNotes: combinedPushNotes,
        firstName,
        lastName,
        assignedStaffId,
        assignedStaffName,
        applicationReference,
      });
      if (!noteSync.success) {
        return NextResponse.json(
          {
            success: false,
            code: 'note-sync-failed',
            message: 'Failed to sync notes to Caspio client notes.',
            noteSync,
            clientId2: hintedClientId2,
          },
          { status: 502 }
        );
      }
      return NextResponse.json({
        success: true,
        message: 'Notes synced to Caspio client notes.',
        clientId2: hintedClientId2,
        noteSync,
        mappingDraftMeta: resolvedMappingDraftMeta,
      });
    }

    let existingRow: Record<string, any> | null = null;
    let existingRowMatchSource: 'client_id2' | 'mrn' | 'medi_cal' | 'name' | null = null;
    if (hintedClientId2) {
      const clientIdFieldCandidates = ['client_ID2', 'Client_ID2', 'clientid2'];
      for (const clientIdField of clientIdFieldCandidates) {
        if (existingRow) break;
        const whereByClientId = buildEqualsClause(clientIdField, hintedClientId2);
        if (!whereByClientId) continue;
        existingRow = await trySearchMember(whereByClientId);
        if (existingRow) existingRowMatchSource = 'client_id2';
      }
    }
    if (!existingRow && effectiveHintedMrn) {
      const mrnFieldCandidates = [
        'MRN',
        'Member_MRN',
        'Medical_Record_Number',
        'Medical_Record_Number_MRN',
        'MedicalRecordNumber',
      ];
      for (const mrnField of mrnFieldCandidates) {
        if (existingRow) break;
        const whereByMrn = buildEqualsClause(mrnField, effectiveHintedMrn);
        if (!whereByMrn) continue;
        existingRow = await trySearchMember(whereByMrn);
        if (existingRow) existingRowMatchSource = 'mrn';
      }
    }
    if (!existingRow && hintedMediCalNumber) {
      const medicalFieldCandidates = Array.from(
        new Set([
          ...MEDICAL_NUMBER_FIELD_CANDIDATES,
          clean(mappedMediCalEntry?.[0] || ''),
        ].filter(Boolean))
      );
      for (const fieldName of medicalFieldCandidates) {
        if (existingRow) break;
        const whereByMediCal = buildEqualsClause(fieldName, hintedMediCalNumber);
        if (!whereByMediCal) continue;
        existingRow = await trySearchMember(whereByMediCal);
        if (existingRow) existingRowMatchSource = 'medi_cal';
      }
    }
    // Name-only matching can accidentally update the wrong Caspio record when members share names.
    // Default to create-new behavior unless explicitly enabled by the caller.
    const allowNameOnlyMatch =
      String((applicationData as any)?.allowNameOnlyCaspioMatch || '').trim().toLowerCase() === 'true';
    if (!existingRow && allowNameOnlyMatch) {
      const where = `${firstNameField}='${esc(firstName)}' AND ${lastNameField}='${esc(lastName)}'`;
      existingRow = await trySearchMember(where);
      if (existingRow) existingRowMatchSource = 'name';
    }
    if (updateExistingOnly && !existingRow) {
      return NextResponse.json(
        {
          success: false,
          code: 'existing-member-not-found',
          message:
            'Update Existing Profile is enabled, but no existing Caspio member was found by Client_ID2/MRN/Medical Number. No new record was created.',
          details: {
            mode: 'update-only',
            hintedClientId2: hintedClientId2 || null,
            hintedMrn: effectiveHintedMrn || null,
            hintedMedicalNumber: hintedMediCalNumber || null,
          },
        },
        { status: 409 }
      );
    }

    // Prevent stale draft mappings from sending an invalid hold-column alias.
    // We set this field explicitly below using canonical column naming.
    Object.keys(mappedFields).forEach((fieldName) => {
      if (looksLikeHoldForSocialWorkerField(fieldName)) {
        delete mappedFields[fieldName];
      }
    });
    const explicitlyMappedFieldNames = new Set(Object.keys(mappedFields));
    const mappedClientIdField = Object.keys(mappedFields).find((field) => looksLikeClientId2(field));
    const inferredClientIdFieldFromMap =
      Object.values(mapping || {}).find((field) => looksLikeClientId2(String(field || ''))) || '';
    const clientIdField =
      clean(mappedClientIdField) ||
      clean(String(inferredClientIdFieldFromMap)) ||
      'client_ID2';
    const isUpdate = Boolean(existingRow?.PK_ID || existingRow?.pk_id);
    const memberData: Record<string, any> = { ...mappedFields };
    if (!memberData[firstNameField]) memberData[firstNameField] = firstName;
    if (!memberData[lastNameField]) memberData[lastNameField] = lastName;
    const existingClientId2 = clean(existingRow?.client_ID2 || existingRow?.Client_ID2);
    const canReuseExistingClientId2 = Boolean(existingClientId2);
    if (canReuseExistingClientId2) {
      memberData[clientIdField] = existingClientId2;
    } else {
      const currentClientId = clean(memberData[clientIdField]);
      if (!currentClientId && !isUpdate) {
        const generatedClientId2 = await createClientAndGetClientId2(
          baseUrl,
          token,
          firstName,
          lastName,
          primaryContactFirstName,
          primaryContactLastName
        );
        memberData[clientIdField] = generatedClientId2;
      }
    }
    memberData[CALAIM_STATUS_FIELD] = requestedCalAIMStatus;
    if (isKaiserApplication && requestedKaiserStatus) {
      memberData[KAISER_STATUS_FIELD] = requestedKaiserStatus;
    }
    if (requestedMonthlyIncome && !hasValue(memberData[MONTHLY_INCOME_FIELD])) {
      memberData[MONTHLY_INCOME_FIELD] = requestedMonthlyIncome;
    }
    const memberFieldNames = await fetchTableFieldNames(baseUrl, token, membersTable).catch(() => []);
    const fieldNameByNormalized = new Map<string, string>();
    memberFieldNames.forEach((name) => {
      fieldNameByNormalized.set(normalizeFieldName(name), name);
    });
    const resolveTableField = (candidates: string[]) => {
      for (const candidate of candidates) {
        const normalized = normalizeFieldName(candidate);
        const exact = fieldNameByNormalized.get(normalized);
        if (exact) return exact;
      }
      return '';
    };
    const setIfMissingField = (fieldName: string, value: unknown) => {
      if (!fieldName) return;
      if (hasValue(memberData[fieldName])) return;
      const normalizedValue = clean(value);
      if (!normalizedValue) return;
      memberData[fieldName] = normalizedValue;
    };
    const resolvedCountyValue = clean(
      pickFirstNonEmpty(applicationData as Record<string, any>, [
        'memberCounty',
        'memberCustomaryCounty',
        'customaryCounty',
        'currentCounty',
        'county',
        'Member_County',
      ])
    );
    const resolvedSexValue = toCaspioSexValue(
      pickFirstNonEmpty(applicationData as Record<string, any>, [
        'memberSex',
        'memberGender',
        'sex',
        'gender',
        'Member_Gender_Code',
      ])
    );
    const resolvedDiagnosticCode = clean(
      pickFirstNonEmpty(applicationData as Record<string, any>, [
        'Diagnostic_ICD_Code_1',
        'Diagnostic_Code',
        'diagnosticCode',
      ])
    );
    const memberCountyFieldName = resolveTableField([MEMBER_COUNTY_FIELD, 'membercounty', 'county']);
    const sexFieldName = resolveTableField(['Sex', 'Member_Sex', 'Gender', 'membersex']);
    const snfDiversionTransitionFieldName = resolveTableField([
      SNF_DIVERSION_OR_TRANSITION_FIELD,
      'SNF_Diversion_or_Transition',
      'SNFDiversionOrTransition',
    ]);
    const eligibilitySourceFieldName = resolveTableField([ELIGIBILITY_SOURCE_FIELD, 'EligibilitySource']);
    const normalHousingFieldName = resolveTableField([NORMAL_HOUSING_SITUATION_FIELD, 'NormalHousingSituation']);
    const diagnosticIcd1FieldName = resolveTableField([DIAGNOSTIC_ICD_CODE_1_FIELD, 'DiagnosticICDCode1']);
    setIfMissingField(memberCountyFieldName, resolvedCountyValue || UNKNOWN_REQUIRED_VALUE);
    setIfMissingField(sexFieldName, resolvedSexValue || UNKNOWN_REQUIRED_VALUE);
    setIfMissingField(snfDiversionTransitionFieldName, UNKNOWN_REQUIRED_VALUE);
    setIfMissingField(eligibilitySourceFieldName, UNKNOWN_REQUIRED_VALUE);
    setIfMissingField(normalHousingFieldName, UNKNOWN_REQUIRED_VALUE);
    setIfMissingField(diagnosticIcd1FieldName, resolvedDiagnosticCode || DEFAULT_DIAGNOSTIC_CODE);
    const requestedKaiserStaffAssigned = clean(
      applicationData?.kaiserStaffAssigned ||
      applicationData?.kaiserStaffAssignment ||
      applicationData?.Kaiser_Staff_Assignment ||
      applicationData?.assignedStaff ||
      assignedStaffName ||
      assignedStaffId
    );
    if (requestedKaiserStaffAssigned) {
      const exactKaiserStaffAssignmentField = fieldNameByNormalized.get(
        normalizeFieldName('Kaiser_Staff_Assignment')
      );
      const exactKaiserUserAssignmentField = fieldNameByNormalized.get(
        normalizeFieldName('Kaiser_User_Assignment')
      );
      const kaiserStaffFieldName =
        KAISER_STAFF_ASSIGNMENT_FIELD_CANDIDATES.find((name) =>
          fieldNameByNormalized.has(normalizeFieldName(name))
        ) ||
        memberFieldNames.find((name) => {
          const normalized = normalizeFieldName(name);
          return normalized.includes('kaiser') && normalized.includes('staff') && normalized.includes('assign');
        }) ||
        '';
      if (exactKaiserStaffAssignmentField) {
        memberData[exactKaiserStaffAssignmentField] = requestedKaiserStaffAssigned;
      }
      if (exactKaiserUserAssignmentField) {
        memberData[exactKaiserUserAssignmentField] = requestedKaiserStaffAssigned;
      }
      if (kaiserStaffFieldName) {
        memberData[kaiserStaffFieldName] = requestedKaiserStaffAssigned;
      }
    }
    if (resolvedLastEligibilityCheckDate) {
      const lastEligibilityCheckField =
        LAST_ELIGIBILITY_CHECK_FIELD_CANDIDATES.find((name) =>
          fieldNameByNormalized.has(normalizeFieldName(name))
        ) || '';
      if (lastEligibilityCheckField && !hasValue(memberData[lastEligibilityCheckField])) {
        memberData[lastEligibilityCheckField] = resolvedLastEligibilityCheckDate;
      }
    }
    const mappedMedicalField = Object.keys(memberData).find((fieldName) => looksLikeMediCalField(fieldName)) || '';
    const mediCalFieldName =
      clean(mappedMedicalField) ||
      MEDICAL_NUMBER_FIELD_CANDIDATES.find((name) => fieldNameByNormalized.has(normalizeFieldName(name))) ||
      '';
    if (mediCalFieldName && !hasValue(memberData[mediCalFieldName])) {
      if (hintedMediCalNumber) {
        memberData[mediCalFieldName] = hintedMediCalNumber;
      }
    }
    if (mediCalFieldName) {
      Object.keys(memberData).forEach((key) => {
        if (key === mediCalFieldName) return;
        // Keep any fields the admin explicitly mapped (e.g., MCP_CIN for MRN).
        // Only dedupe non-mapped fallback aliases to avoid dropping intended columns.
        if (looksLikeMediCalField(key) && !explicitlyMappedFieldNames.has(key)) {
          delete memberData[key];
        }
      });
    }
    if (preAssessmentNotes) {
      const mappedNotesField = Object.keys(memberData).find(
        (name) =>
          normalizeFieldName(name).includes('preassessment') &&
          normalizeFieldName(name).includes('notes')
      );
      const notesFieldName =
        mappedNotesField ||
        PRE_ASSESSMENT_NOTES_FIELD_CANDIDATES.find((name) => fieldNameByNormalized.has(normalizeFieldName(name)));
      if (notesFieldName) {
        memberData[notesFieldName] = preAssessmentNotes;
      }
    }
    if (snfDiversionReasonNotes) {
      const mappedDiversionField = Object.keys(memberData).find((name) =>
        normalizeFieldName(name).includes('snfdiversionreason')
      );
      const diversionReasonFieldName =
        mappedDiversionField ||
        SNF_DIVERSION_REASON_FIELD_CANDIDATES.find((name) =>
          fieldNameByNormalized.has(normalizeFieldName(name))
        );
      if (diversionReasonFieldName) {
        memberData[diversionReasonFieldName] = snfDiversionReasonNotes;
      }
    }
    const holdFieldCandidates = [
      HOLD_FOR_SOCIAL_WORKER_FIELD,
      'Hold_For_Social_Worker',
      'Hold_for_Social_Worker_Visit',
      'Hold_for_Social_Worker',
      'HoldForSocialWorker',
    ];
    const holdFieldName =
      holdFieldCandidates.find((name) => fieldNameByNormalized.has(normalizeFieldName(name))) ||
      HOLD_FOR_SOCIAL_WORKER_FIELD;
    // Always put pushed members into Social Worker hold queue.
    memberData[holdFieldName] = requestedSocialWorkerHold;
    Object.keys(memberData).forEach((key) => {
      if (looksLikePkField(key)) delete memberData[key];
    });
    const removedSyntheticFields: string[] = [];
    Object.entries(memberData).forEach(([fieldName, rawValue]) => {
      const value = clean(rawValue);
      if (!value) return;
      if (!looksLikeSyntheticFixtureValue(value)) return;
      delete memberData[fieldName];
      removedSyntheticFields.push(fieldName);
    });
    if (removedSyntheticFields.length > 0) {
      console.warn('Caspio push stripped synthetic values:', {
        removedSyntheticFields,
        removedCount: removedSyntheticFields.length,
      });
    }
    if (Object.keys(memberData).length === 0) {
      return NextResponse.json(
        {
          success: false,
          code: 'missing-mapping',
          message: 'No mapped Caspio fields were found. Please lock mapping in Admin → Caspio Test (shared mapping) first.',
        },
        { status: 400 }
      );
    }

    if (!isUpdate && isKaiserApplication) {
      // Only set default tier on first insert for Kaiser applications.
      memberData[MCO_AND_TIER_FIELD] = DEFAULT_KAISER_TIER_VALUE;
    }
    const updateWhere = isUpdate ? `PK_ID=${Number(existingRow?.PK_ID || existingRow?.pk_id || 0)}` : '';
    const upsertUrl = isUpdate
      ? `${baseUrl}/tables/${membersTable}/records?q.where=${encodeURIComponent(updateWhere)}`
      : `${baseUrl}/tables/${membersTable}/records`;
    const createUrl = `${baseUrl}/tables/${membersTable}/records`;
    const upsertMethod = isUpdate ? 'PUT' : 'POST';
    const doUpsert = async (payload: Record<string, any>) =>
      fetch(upsertUrl, {
      method: upsertMethod,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const doCreate = async (payload: Record<string, any>) =>
      fetch(createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    const doUpdateByPk = async (pkId: number, payload: Record<string, any>) => {
      const safePk = Number(pkId || 0);
      if (!safePk) return null;
      const where = `PK_ID=${safePk}`;
      const updateUrl = `${baseUrl}/tables/${membersTable}/records?q.where=${encodeURIComponent(where)}`;
      return fetch(updateUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    };
    const finalizeSuccessResponse = async (payload: Record<string, any>) => {
      const resolvedClientId2 = clean(
        payload?.clientId2 ||
        memberData[clientIdField] ||
        existingRow?.client_ID2 ||
        existingRow?.Client_ID2 ||
        hintedClientId2
      );
      const noteSync = await syncPrePushNoteToClientNotes({
        baseUrl,
        token,
        clientId2: resolvedClientId2,
        preAssessmentNotes: combinedPushNotes,
        firstName,
        lastName,
        assignedStaffId,
        assignedStaffName,
        applicationReference,
      });
      return NextResponse.json({
        success: true,
        ...payload,
        clientId2: resolvedClientId2,
        noteSync,
        mappingDraftMeta: resolvedMappingDraftMeta,
      });
    };
    let upsertResponse = await doUpsert(memberData);
    if (!upsertResponse.ok) {
      let firstErrorBody = await upsertResponse.text().catch(() => '');
      const holdPattern = /columnnotfound/i.test(firstErrorBody) && /hold[_\s-]*for[_\s-]*social[_\s-]*worker/i.test(firstErrorBody);
      if (holdPattern) {
        const fallbackData = { ...memberData };
        Object.keys(fallbackData).forEach((key) => {
          if (looksLikeHoldForSocialWorkerField(key)) delete fallbackData[key];
        });
        // Retry with canonical field in case table metadata was stale or endpoint returned a variant.
        fallbackData[HOLD_FOR_SOCIAL_WORKER_FIELD] = requestedSocialWorkerHold;
        upsertResponse = await doUpsert(fallbackData);
        if (upsertResponse.ok) {
          const result = await upsertResponse.json().catch(() => ({} as any));
          return finalizeSuccessResponse({
            message: isUpdate
              ? `Successfully updated Caspio profile for "${firstName} ${lastName}".`
              : `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio.`,
            mode: isUpdate ? 'update' : 'create',
            clientId2: clean(memberData[clientIdField]),
            data: result,
          });
        }
        // Last-chance fallback: some Caspio environments expose no hold column on this table.
        // Keep the member update unblocked by retrying without hold-related fields.
        const noHoldData = { ...memberData };
        Object.keys(noHoldData).forEach((key) => {
          if (looksLikeHoldForSocialWorkerField(key)) delete noHoldData[key];
        });
        upsertResponse = await doUpsert(noHoldData);
        if (upsertResponse.ok) {
          const result = await upsertResponse.json().catch(() => ({} as any));
          return finalizeSuccessResponse({
            message: isUpdate
              ? `Successfully updated Caspio profile for "${firstName} ${lastName}" (hold column not available on this table).`
              : `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio (hold column not available on this table).`,
            mode: isUpdate ? 'update' : 'create',
            clientId2: clean(memberData[clientIdField]),
            warning: 'hold-field-missing',
            data: result,
          });
        }
      }
      const caspioError = await upsertResponse.text().catch(() => '') || firstErrorBody;
      console.warn('Caspio upsert failed diagnostics:', {
        status: upsertResponse.status,
        mode: isUpdate ? 'update' : 'create',
        existingRowMatchSource,
        duplicateBlankField: parseDuplicateOrBlankField(caspioError) || null,
        errorPreview: clean(caspioError).slice(0, 1000),
        payloadSummary: buildCaspioPayloadDebugSummary(memberData),
      });
      const duplicateBlankField = parseDuplicateOrBlankField(caspioError);
      if (!isUpdate && duplicateBlankField) {
        const duplicateFieldCandidates = Array.from(
          new Set([
            duplicateBlankField,
            ...(looksLikeMediCalField(duplicateBlankField) ? MEDICAL_NUMBER_FIELD_CANDIDATES : []),
            clean(mappedMediCalEntry?.[0] || ''),
          ].filter(Boolean))
        );
        const duplicateValueCandidates = Array.from(
          new Set(
            [
              memberData[duplicateBlankField],
              hintedMediCalNumber,
              hintedMrn,
              mappedMediCalEntry?.[1],
              memberData[mediCalFieldName],
            ]
              .map((value) => clean(value))
              .filter(Boolean)
              .flatMap((value) => {
                const variants = [value];
                const upper = value.toUpperCase();
                const lower = value.toLowerCase();
                if (!variants.includes(upper)) variants.push(upper);
                if (!variants.includes(lower)) variants.push(lower);
                return variants;
              })
          )
        );

        let recoveredRow: Record<string, any> | null = null;
        for (const fieldName of duplicateFieldCandidates) {
          if (recoveredRow) break;
          for (const candidateValue of duplicateValueCandidates) {
            const whereClause = buildEqualsClause(fieldName, candidateValue);
            if (!whereClause) continue;
            recoveredRow = await trySearchMember(whereClause);
            if (recoveredRow) break;
          }
        }

        const recoveredPk = Number(recoveredRow?.PK_ID || recoveredRow?.pk_id || 0);
        if (recoveredPk) {
          const updateFromDuplicateResponse = await doUpdateByPk(recoveredPk, memberData);
          if (updateFromDuplicateResponse?.ok) {
            const updateResult = await updateFromDuplicateResponse.json().catch(() => ({} as any));
            return finalizeSuccessResponse({
              message: `Successfully updated Caspio profile for "${firstName} ${lastName}" (matched existing record by ${duplicateBlankField}).`,
              mode: 'update',
              clientId2: clean(memberData[clientIdField] || recoveredRow?.client_ID2 || recoveredRow?.Client_ID2),
              recoveredFromDuplicateField: duplicateBlankField,
              data: updateResult,
            });
          }
        }
        if (!recoveredPk && looksLikeMediCalField(duplicateBlankField) && hintedMediCalNumber) {
          const forceMediCalCreateData: Record<string, any> = { ...memberData };
          forceMediCalCreateData[duplicateBlankField] = hintedMediCalNumber;
          if (mediCalFieldName && duplicateBlankField !== mediCalFieldName) {
            forceMediCalCreateData[mediCalFieldName] = hintedMediCalNumber;
          }
          console.warn('Caspio forced MediCal create retry:', {
            duplicateBlankField,
            mediCalFieldName: mediCalFieldName || null,
            payloadSummary: buildCaspioPayloadDebugSummary(forceMediCalCreateData),
          });
          const forcedCreateResponse = await doCreate(forceMediCalCreateData);
          if (forcedCreateResponse.ok) {
            const forcedCreateResult = await forcedCreateResponse.json().catch(() => ({} as any));
            return finalizeSuccessResponse({
              message: `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio (forced MediCal retry).`,
              mode: 'create',
              warning: 'forced-medical-number-retry',
              clientId2: clean(forceMediCalCreateData[clientIdField]),
              data: forcedCreateResult,
            });
          }
          const forcedCreateError = await forcedCreateResponse.text().catch(() => '');
          console.warn('Caspio forced MediCal create retry failed:', {
            status: forcedCreateResponse.status,
            errorPreview: clean(forcedCreateError).slice(0, 1000),
          });
          const minimalForcedCreateData: Record<string, any> = {
            [firstNameField]: firstName,
            [lastNameField]: lastName,
            [duplicateBlankField]: hintedMediCalNumber,
            [CALAIM_STATUS_FIELD]: requestedCalAIMStatus,
          };
          if (hasValue(memberData[clientIdField])) {
            minimalForcedCreateData[clientIdField] = memberData[clientIdField];
          }
          if (isKaiserApplication && requestedKaiserStatus) {
            minimalForcedCreateData[KAISER_STATUS_FIELD] = requestedKaiserStatus;
          }
          if (hasValue(requestedSocialWorkerHold)) {
            minimalForcedCreateData[holdFieldName] = requestedSocialWorkerHold;
          }
          console.warn('Caspio minimal forced MediCal create retry:', {
            payloadSummary: buildCaspioPayloadDebugSummary(minimalForcedCreateData),
          });
          const minimalForcedResponse = await doCreate(minimalForcedCreateData);
          if (minimalForcedResponse.ok) {
            const minimalForcedResult = await minimalForcedResponse.json().catch(() => ({} as any));
            return finalizeSuccessResponse({
              message: `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio (minimal forced MediCal retry).`,
              mode: 'create',
              warning: 'minimal-forced-medical-number-retry',
              clientId2: clean(minimalForcedCreateData[clientIdField]),
              data: minimalForcedResult,
            });
          }
          const minimalForcedError = await minimalForcedResponse.text().catch(() => '');
          console.warn('Caspio minimal forced MediCal create retry failed:', {
            status: minimalForcedResponse.status,
            errorPreview: clean(minimalForcedError).slice(0, 1000),
          });
        }
      }
      const duplicateBlankMessage = duplicateBlankField
        ? `Caspio rejected this push because field "${duplicateBlankField}" is duplicate or blank. This usually means the member already exists in Caspio for that identifier, or the mapped value is empty.`
        : '';
      return NextResponse.json(
        {
          success: false,
          code: duplicateBlankField
            ? 'caspio-duplicate-or-blank'
            : (isUpdate ? 'caspio-update-failed' : 'caspio-insert-failed'),
          message: duplicateBlankMessage || (isUpdate
            ? 'Failed to update member record in Caspio.'
            : 'Failed to insert member record in Caspio.'),
          details: {
            caspioStatus: upsertResponse.status,
            caspioError,
            duplicateBlankField: duplicateBlankField || null,
            memberName: `${firstName} ${lastName}`.trim(),
            clientIdField,
            holdFieldTried: holdFieldName,
            membersTableFieldCount: memberFieldNames.length,
            mode: isUpdate ? 'update' : 'create',
          },
        },
        { status: 500 }
      );
    }

    const result = await upsertResponse.json().catch(() => ({} as any));
    return finalizeSuccessResponse({
      message: isUpdate
        ? `Successfully updated Caspio profile for "${firstName} ${lastName}".`
        : `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio.`,
      mode: isUpdate ? 'update' : 'create',
      clientId2: clean(memberData[clientIdField]),
      data: result,
    });
  } catch (error: any) {
    console.error('Caspio push API error:', error);
    return NextResponse.json(
      {
        success: false,
        code: 'internal',
        message: 'Unexpected error while publishing CS Summary to Caspio.',
        details: { rawError: String(error?.message || 'Unknown error') },
      },
      { status: 500 }
    );
  }
}

