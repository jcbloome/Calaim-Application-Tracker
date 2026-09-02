import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const clean = (value: unknown) => String(value ?? '').trim();
const esc = (value: unknown) => clean(value).replace(/'/g, "''");
const normalizeFieldName = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const CS_FIELD_ALIASES: Record<string, string> = {
  primarycontactfirstname: 'bestContactFirstName',
  primarycontactlastname: 'bestContactLastName',
  primarycontactrelationship: 'bestContactRelationship',
  primarycontactphone: 'bestContactPhone',
  primarycontactemail: 'bestContactEmail',
  primarycontactlanguage: 'bestContactLanguage',
  ispcontactfirstname: 'ispFirstName',
  ispcontactlastname: 'ispLastName',
  ispcontactrelationship: 'ispRelationship',
  ispcontactphone: 'ispPhone',
  ispcontactemail: 'ispEmail',
  isplocation: 'ispLocationType',
  isplocationtype: 'ispLocationType',
  isplocationname: 'ispFacilityName',
  ispfacilityname: 'ispFacilityName',
  isplocationaddress: 'ispAddress',
  isplocationcity: 'ispCity',
  isplocationstate: 'ispState',
  isplocationzip: 'ispZip',
};

const CS_SUMMARY_ALLOWED_FIELDS = new Set<string>([
  'memberFirstName',
  'memberLastName',
  'memberDob',
  'sex',
  'memberAge',
  'memberMediCalNum',
  'confirmMemberMediCalNum',
  'memberMrn',
  'confirmMemberMrn',
  'memberLanguage',
  'memberPhone',
  'memberEmail',
  'Authorization_Number_T038',
  'Authorization_Start_T2038',
  'Authorization_End_T2038',
  'Diagnostic_Code',
  'referrerFirstName',
  'referrerLastName',
  'referrerEmail',
  'referrerPhone',
  'referrerRelationship',
  'agency',
  'isPrimaryContactSameAsReferrer',
  'isPrimaryContactSameAsMember',
  'bestContactFirstName',
  'bestContactLastName',
  'bestContactRelationship',
  'bestContactPhone',
  'bestContactEmail',
  'bestContactLanguage',
  'secondaryContactFirstName',
  'secondaryContactLastName',
  'secondaryContactRelationship',
  'secondaryContactPhone',
  'secondaryContactEmail',
  'secondaryContactLanguage',
  'hasLegalRep',
  'repFirstName',
  'repLastName',
  'repRelationship',
  'repPhone',
  'repEmail',
  'currentLocation',
  'currentLocationName',
  'currentAddress',
  'currentCity',
  'currentState',
  'currentZip',
  'currentCounty',
  'copyAddress',
  'customaryLocationType',
  'customaryLocationName',
  'customaryAddress',
  'customaryCity',
  'customaryState',
  'customaryZip',
  'customaryCounty',
  'healthPlan',
  'existingHealthPlan',
  'switchingHealthPlan',
  'pathway',
  'pathwaySelectionConfirmedAt',
  'snfDiversionReason',
  'ispContactIsMember',
  'ispContactSameAsPrimary',
  'ispSecondaryContactSameAsPrimary',
  'ispFirstName',
  'ispLastName',
  'ispRelationship',
  'ispPhone',
  'ispEmail',
  'ispSecondaryFirstName',
  'ispSecondaryLastName',
  'ispSecondaryRelationship',
  'ispSecondaryPhone',
  'ispSecondaryEmail',
  'ispLocationSameAsCurrent',
  'ispLocationType',
  'ispAddress',
  'ispCity',
  'ispState',
  'ispZip',
  'ispFacilityName',
  'preAssessmentCareNeedsNotes',
  'onALWWaitlist',
  'hasPrefRCFE',
  'rcfeSameAsCurrentLocation',
  'rcfeName',
  'rcfeAddress',
  'rcfePreferredCities',
  'rcfeAdminFirstName',
  'rcfeAdminLastName',
  'rcfeAdminPhone',
  'rcfeAdminEmail',
]);

const CS_SUMMARY_INFERRED_FIELDS: Record<string, string[]> = {
  memberFirstName: ['Senior_First', 'Member_First_Name', 'First_Name'],
  memberLastName: ['Senior_Last', 'Member_Last_Name', 'Last_Name'],
  memberMediCalNum: ['Medical_Number', 'MediCal_Number', 'Medi_Cal_Number', 'MCP_CIN', 'CIN'],
  confirmMemberMediCalNum: ['Medical_Number', 'MediCal_Number', 'Medi_Cal_Number', 'MCP_CIN', 'CIN'],
  memberMrn: ['Member_MRN', 'MRN', 'Medical_Record_Number'],
  confirmMemberMrn: ['Member_MRN', 'MRN', 'Medical_Record_Number'],
  memberDob: ['Birth_Date', 'DOB', 'Date_of_Birth'],
  sex: ['Sex', 'Gender', 'Member_Gender', 'Senior_Gender'],
  memberLanguage: ['Primary_Language', 'Member_Language', 'Language'],
  memberPhone: ['Best_Contact_Phone', 'Best_Contact_Number', 'Best_Phone', 'Member_Phone', 'Phone_Number'],
  memberEmail: ['Senior_Email', 'Member_Email', 'Email'],
  bestContactFirstName: ['Authorized_Party_First', 'Primary_Contact_First'],
  bestContactLastName: ['Authorized_Party_Last', 'Primary_Contact_Last'],
  bestContactRelationship: ['Authorized_Party_Relationship', 'Primary_Contact_Relationship'],
  bestContactPhone: ['Authorized_Party_Phone', 'Primary_Contact_Phone', 'Best_Contact_Phone'],
  bestContactEmail: ['Authorized_Party_Email', 'Primary_Contact_Email', 'Best_Contact_Email'],
  currentAddress: ['Normal_Housing_Street', 'Normal_Housing_Address', 'Home_Address', 'Member_Address'],
  currentCity: ['Normal_Housing_City', 'Member_City', 'City'],
  currentState: ['Normal_Housing_State', 'Member_State', 'State'],
  currentZip: ['Normal_Housing_Zip', 'Member_Zip', 'Zip'],
  currentCounty: ['Member_County', 'County'],
  customaryAddress: ['Normal_Housing_Street', 'Normal_Housing_Address', 'Home_Address', 'Member_Address'],
  customaryCity: ['Normal_Housing_City', 'Member_City', 'City'],
  customaryState: ['Normal_Housing_State', 'Member_State', 'State'],
  customaryZip: ['Normal_Housing_Zip', 'Member_Zip', 'Zip'],
  customaryCounty: ['Member_County', 'County'],
  ispFirstName: ['ISP_Contact_First', 'Authorized_Party_First'],
  ispLastName: ['ISP_Contact_Last', 'Authorized_Party_Last'],
  ispRelationship: ['Authorized_Party_Relationship', 'ISP_Contact_Relationship'],
  ispPhone: ['ISP_Contact_Phone', 'Authorized_Party_Phone', 'Best_Contact_Phone'],
  ispEmail: ['ISP_Contact_Email', 'Authorized_Party_Email', 'Senior_Email', 'Member_Email'],
  ispLocationType: ['ISP_Location_Type', 'Where_Living', 'Current_Living_Situation'],
  ispFacilityName: ['RCFE_Name', 'ISP_Current_Location', 'Facility_Name'],
  ispAddress: ['RCFE_Address', 'ISP_Current_Address', 'Member_Address', 'Address'],
  ispCity: ['RCFE_City', 'ISP_Current_City', 'Member_City', 'City'],
  ispState: ['RCFE_State', 'ISP_Current_State', 'Member_State', 'State'],
  ispZip: ['RCFE_Zip', 'ISP_Current_Zip', 'Member_Zip', 'Zip'],
  rcfeName: ['RCFE_Name'],
  rcfeAddress: ['RCFE_Address', 'ISP_Current_Address'],
  rcfeAdminFirstName: ['RCFE_Admin_First'],
  rcfeAdminLastName: ['RCFE_Admin_Last'],
  rcfeAdminPhone: [
    'RCFE_Owner_Phone',
    'RCFE_Admin_RCFE_Owner_Phone',
    'RCFE_Admin_Phone',
    'RCFE_Administrator_Phone',
  ],
  rcfeAdminEmail: ['RCFE_Admin_Email', 'RCFE_Administrator_Email'],
  preAssessmentCareNeedsNotes: ['Describe_Member_Living_Situation', 'Current_Living_Situation'],
};

const looksLikeNumericId = (value: unknown) => /^-?\d+(?:\.\d+)?$/.test(clean(value));

const buildEqualsClause = (fieldName: string, value: unknown) => {
  const normalizedValue = clean(value);
  if (!normalizedValue) return '';
  if (/^0\d+$/.test(normalizedValue)) {
    return `${fieldName}='${esc(normalizedValue)}'`;
  }
  return looksLikeNumericId(normalizedValue)
    ? `${fieldName}=${normalizedValue}`
    : `${fieldName}='${esc(normalizedValue)}'`;
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
  console.warn('Firebase Admin init failed for reverse Caspio pull:', error);
}

const getSharedLockedMapping = async () => {
  if (!adminDb) return null as Record<string, string> | null;
  try {
    const sharedSnap = await adminDb.collection('admin-settings').doc('caspio-field-mapping').get();
    if (!sharedSnap.exists) return null;
    const data = sharedSnap.data() || {};
    const locked = data?.lockedMappings;
    if (!locked || typeof locked !== 'object') return null;
    const entries = Object.entries(locked as Record<string, unknown>).filter(
      ([csField, caspioField]) => clean(csField) && clean(caspioField)
    );
    if (!entries.length) return null;
    return Object.fromEntries(entries) as Record<string, string>;
  } catch (error) {
    console.warn('Failed to load shared locked Caspio mapping for reverse pull:', error);
    return null;
  }
};

const normalizePhoneForForm = (value: unknown) => {
  const digits = clean(value).replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
};

const normalizeDateForForm = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split('-');
    return `${month}/${day}/${year}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const year = String(parsed.getFullYear());
  return `${month}/${day}/${year}`;
};

const normalizeSexForForm = (value: unknown) => {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  if (raw === 'f' || raw === 'female') return 'Female';
  if (raw === 'm' || raw === 'male') return 'Male';
  return clean(value);
};

const normalizeIncomingForCsField = (csField: string, value: unknown) => {
  const normalizedCsField = normalizeFieldName(csField);
  if (!normalizedCsField) return clean(value);
  if (normalizedCsField.includes('phone')) return normalizePhoneForForm(value) || clean(value);
  if (normalizedCsField.includes('dob') || normalizedCsField.includes('date')) {
    return normalizeDateForForm(value) || clean(value);
  }
  if (
    normalizedCsField === 'sex' ||
    normalizedCsField === 'gender' ||
    normalizedCsField === 'membersex' ||
    normalizedCsField === 'membergender'
  ) {
    return normalizeSexForForm(value);
  }
  return clean(value);
};

const valuesEquivalent = (left: unknown, right: unknown) => {
  const l = clean(left);
  const r = clean(right);
  if (l === r) return true;
  return normalizeFieldName(l) === normalizeFieldName(r);
};

const findValueByCaspioField = (row: Record<string, unknown>, caspioField: string) => {
  const direct = row?.[caspioField];
  if (clean(direct)) return clean(direct);
  const target = normalizeFieldName(caspioField);
  if (!target) return '';
  for (const [key, value] of Object.entries(row || {})) {
    if (normalizeFieldName(key) !== target) continue;
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return '';
};

const resolveCsFieldTarget = (csFieldRaw: string, applicationData: Record<string, unknown>) => {
  const csField = clean(csFieldRaw);
  if (!csField) return '';
  if (Object.prototype.hasOwnProperty.call(applicationData, csField)) return csField;

  const normalized = normalizeFieldName(csField);
  if (!normalized) return csField;

  const directAlias = CS_FIELD_ALIASES[normalized];
  if (directAlias) return directAlias;

  for (const key of Object.keys(applicationData || {})) {
    if (normalizeFieldName(key) === normalized) return key;
  }

  return csField;
};

const fetchMemberByWhere = async (baseUrl: string, token: string, whereClause: string) => {
  const url =
    `${baseUrl}/tables/CalAIM_tbl_Members/records` +
    `?q.where=${encodeURIComponent(whereClause)}` +
    `&q.orderBy=${encodeURIComponent('PK_ID DESC')}` +
    `&q.limit=1`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const json = await response.json().catch(() => ({} as any));
  const rows = Array.isArray(json?.Result) ? (json.Result as Array<Record<string, unknown>>) : [];
  return rows[0] || null;
};

type PreviewStatus = 'missing' | 'fill_empty' | 'overwrite' | 'unchanged';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const applicationData = (body?.applicationData || {}) as Record<string, unknown>;
    const providedMapping = (body?.mapping || null) as Record<string, string> | null;
    const sharedMapping = await getSharedLockedMapping();
    const mapping =
      providedMapping && typeof providedMapping === 'object' && Object.keys(providedMapping).length > 0
        ? providedMapping
        : sharedMapping;

    if (!mapping || !Object.keys(mapping).length) {
      return NextResponse.json(
        {
          success: false,
          error: 'Locked mapping required. Save and lock CS → Caspio mappings first.',
        },
        { status: 409 }
      );
    }

    const clientId2 = clean(
      applicationData?.client_ID2 || applicationData?.clientId2 || applicationData?.caspioClientId2 || ''
    );
    if (!clientId2) {
      return NextResponse.json(
        {
          success: false,
          error: 'Client_ID2 is required. Use "Pull Client_ID2 only" (or "Update Kaiser Status + retrieve Client_ID2") first.',
        },
        { status: 400 }
      );
    }

    const caspioConfig = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(caspioConfig);
    const baseUrl = caspioConfig.restBaseUrl;

    const whereCandidates = [
      buildEqualsClause('Client_ID2', clientId2),
      buildEqualsClause('client_ID2', clientId2),
      `Client_ID2='${esc(clientId2)}'`,
      `client_ID2='${esc(clientId2)}'`,
    ].filter(Boolean);

    let row: Record<string, unknown> | null = null;
    for (const whereClause of whereCandidates) {
      row = await fetchMemberByWhere(baseUrl, token, whereClause);
      if (row) break;
    }

    if (!row) {
      return NextResponse.json(
        {
          success: false,
          error: `No Caspio member row found for Client_ID2 ${clientId2}.`,
        },
        { status: 404 }
      );
    }

    const safePatch: Record<string, string> = {};
    const fullPatch: Record<string, string> = {};
    const items: Array<{
      csField: string;
      targetCsField: string;
      caspioField: string;
      currentValue: string;
      incomingValue: string;
      status: PreviewStatus;
    }> = [];

    let missing = 0;
    let fillEmpty = 0;
    let overwrite = 0;
    let unchanged = 0;

    const processedTargets = new Set<string>();

    const pushPreviewItem = (csFieldRaw: string, caspioFieldRaw: string) => {
      const csField = clean(csFieldRaw);
      const caspioField = clean(caspioFieldRaw);
      if (!csField || !caspioField) return;
      const targetCsField = resolveCsFieldTarget(csField, applicationData);
      if (!targetCsField || processedTargets.has(targetCsField)) return;
      if (!CS_SUMMARY_ALLOWED_FIELDS.has(targetCsField)) return;

      const currentValue = clean(applicationData?.[targetCsField]);
      const incomingRawValue = findValueByCaspioField(row as Record<string, unknown>, caspioField);
      const incomingValue = normalizeIncomingForCsField(targetCsField, incomingRawValue);

      let status: PreviewStatus = 'missing';
      if (!incomingValue) {
        missing += 1;
      } else if (!currentValue) {
        status = 'fill_empty';
        fillEmpty += 1;
        safePatch[targetCsField] = incomingValue;
        fullPatch[targetCsField] = incomingValue;
      } else if (valuesEquivalent(currentValue, incomingValue)) {
        status = 'unchanged';
        unchanged += 1;
      } else {
        status = 'overwrite';
        overwrite += 1;
        fullPatch[targetCsField] = incomingValue;
      }

      items.push({
        csField,
        targetCsField,
        caspioField,
        currentValue,
        incomingValue,
        status,
      });
      processedTargets.add(targetCsField);
    };

    Object.entries(mapping).forEach(([csFieldRaw, caspioFieldRaw]) => {
      pushPreviewItem(csFieldRaw, caspioFieldRaw);
    });

    Object.entries(CS_SUMMARY_INFERRED_FIELDS).forEach(([targetCsField, caspioCandidates]) => {
      if (processedTargets.has(targetCsField)) return;
      const firstPopulatedCaspioField =
        caspioCandidates.find((caspioField) => clean(findValueByCaspioField(row as Record<string, unknown>, caspioField))) ||
        caspioCandidates[0] ||
        '';
      if (!firstPopulatedCaspioField) return;
      pushPreviewItem(targetCsField, firstPopulatedCaspioField);
    });

    return NextResponse.json({
      success: true,
      clientId2,
      mappingSource:
        providedMapping && typeof providedMapping === 'object' && Object.keys(providedMapping).length > 0
          ? 'local-preview'
          : 'shared-locked',
      summary: {
        totalMapped: items.length,
        missing,
        fillEmpty,
        overwrite,
        unchanged,
      },
      preview: {
        items,
        safePatch,
        fullPatch,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: String(error?.message || 'Failed to build reverse pull preview.'),
      },
      { status: 500 }
    );
  }
}
