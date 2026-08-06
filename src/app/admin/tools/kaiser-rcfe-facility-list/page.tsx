'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Building2, Check, Download, Loader2, Pencil, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type RawKaiserMember = {
  id?: string;
  Client_ID2?: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  CalAIM_MCO?: string;
  RCFE_Name?: string;
  RCFE_Admin_Name?: string;
  RCFE_Admin_Email?: string;
  RCFE_Address?: string;
  RCFE_City?: string;
  RCFE_State?: string;
  RCFE_Zip?: string;
  caspioRaw?: Record<string, unknown>;
};

type FacilityRow = {
  key: string;
  memberIds: string[];
  rcfeRegisteredIds: string[];
  facilityName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  licenseNumber: string;
  npiNumber: string;
  npiFirst: string;
  npiLast: string;
  memberCount: number;
  members: string[];
};

type RcfeDirectoryStatusRow = {
  rcfeRegisteredId?: string;
  lastCounty?: string | null;
  lastRcfeName?: string | null;
  lastNpiNumber?: string | null;
  lastLicenseNumber?: string | null;
  lastAdminName?: string | null;
  lastAdminEmail?: string | null;
  lastAdminPhone?: string | null;
  lastStreet?: string | null;
  lastCity?: string | null;
  lastState?: string | null;
  lastZip?: string | null;
  lastAddress?: string | null;
};

type RcfeOverlayFields = {
  lastCounty?: string | null;
  lastRcfeName?: string | null;
  lastNpiNumber?: string | null;
  lastLicenseNumber?: string | null;
  lastAdminName?: string | null;
  lastAdminEmail?: string | null;
  lastAdminPhone?: string | null;
  lastAddress?: string | null;
  lastCity?: string | null;
  lastState?: string | null;
  lastZip?: string | null;
};

type RcfeDirectorySyncPayload = {
  success?: boolean;
  statuses?: RcfeDirectoryStatusRow[];
  historyBySignature?: Record<string, RcfeOverlayFields>;
  historyByName?: Record<string, RcfeOverlayFields>;
  rcfeRegistryByRegisteredId?: Record<
    string,
    { rcfeRegisteredId?: string; rcfeName?: string; numberOfBeds?: string | null; county?: string | null; npiNumber?: string | null }
  >;
  rcfeRegistryByName?: Record<
    string,
    { rcfeRegisteredId?: string; rcfeName?: string; numberOfBeds?: string | null; county?: string | null; npiNumber?: string | null }
  >;
  progressOverrides?: Record<
    string,
    {
      RCFE_County?: string | null;
      RCFE_Name?: string | null;
      NPI?: string | null;
      NPI_Number?: string | null;
      NPI_RCFE_Owner?: string | null;
      RCFE_License_Number?: string | null;
      RCFE_Admin_Name?: string | null;
      RCFE_Admin_Email?: string | null;
      RCFE_Admin_RCFE_Owner_Phone?: string | null;
      RCFE_Address?: string | null;
      RCFE_City?: string | null;
      RCFE_State?: string | null;
      RCFE_Zip?: string | null;
    }
  >;
  progressBySignature?: Record<
    string,
    {
      RCFE_County?: string | null;
      RCFE_Name?: string | null;
      NPI?: string | null;
      NPI_Number?: string | null;
      NPI_RCFE_Owner?: string | null;
      RCFE_License_Number?: string | null;
      RCFE_Admin_Name?: string | null;
      RCFE_Admin_Email?: string | null;
      RCFE_Admin_RCFE_Owner_Phone?: string | null;
      RCFE_Address?: string | null;
      RCFE_City?: string | null;
      RCFE_State?: string | null;
      RCFE_Zip?: string | null;
    }
  >;
};

type EditableFacilityField =
  | 'contactPerson'
  | 'email'
  | 'phone'
  | 'npiNumber'
  | 'licenseNumber'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'county';

type EditableFacilityValues = Record<EditableFacilityField, string>;

type RcfeBulkPreviewRow = {
  rowKey: string;
  facilityName: string;
  memberIds: string[];
  rcfeRegisteredIds: string[];
  changedFields: EditableFacilityField[];
  previousValues: EditableFacilityValues;
  currentValues: EditableFacilityValues;
  updates: Record<string, string>;
};

type RcfeBulkPreviewState = {
  snapshotId: string;
  batchId: string;
  rowCount: number;
  changedFieldCount: number;
  rows: RcfeBulkPreviewRow[];
};

const EDITABLE_FIELDS: Array<{ key: EditableFacilityField; label: string }> = [
  { key: 'contactPerson', label: 'Contact Person' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'npiNumber', label: 'NPI Number' },
  { key: 'licenseNumber', label: 'RCFE License Number' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Zip' },
  { key: 'county', label: 'County' },
];

const MISSING_LABEL_TO_FIELD: Record<string, EditableFacilityField> = {
  'Contact Person': 'contactPerson',
  Email: 'email',
  Phone: 'phone',
  'NPI Number': 'npiNumber',
  'RCFE License Number': 'licenseNumber',
  Address: 'address',
  City: 'city',
  State: 'state',
  Zip: 'zip',
};

const toEditableValuesFromRow = (row: FacilityRow): EditableFacilityValues => ({
  contactPerson: String(row.contactPerson || '').trim(),
  email: normalizeEmail(row.email),
  phone: String(row.phone || '').trim(),
  npiNumber: String(row.npiNumber || '').trim(),
  licenseNumber: String(row.licenseNumber || '').trim(),
  address: String(row.address || '').trim(),
  city: String(row.city || '').trim(),
  state: String(row.state || '').trim(),
  zip: String(row.zip || '').trim(),
  county: String(row.county || '').trim(),
});

const toEditableValuesFromDraftAndRow = (
  row: FacilityRow,
  getRowFieldValue: (row: FacilityRow, field: EditableFacilityField) => string
): EditableFacilityValues => ({
  contactPerson: String(getRowFieldValue(row, 'contactPerson') || '').trim(),
  email: normalizeEmail(getRowFieldValue(row, 'email')),
  phone: String(getRowFieldValue(row, 'phone') || '').trim(),
  npiNumber: String(getRowFieldValue(row, 'npiNumber') || '').trim(),
  licenseNumber: String(getRowFieldValue(row, 'licenseNumber') || '').trim(),
  address: String(getRowFieldValue(row, 'address') || '').trim(),
  city: String(getRowFieldValue(row, 'city') || '').trim(),
  state: String(getRowFieldValue(row, 'state') || '').trim(),
  zip: String(getRowFieldValue(row, 'zip') || '').trim(),
  county: String(getRowFieldValue(row, 'county') || '').trim(),
});

const buildRcfeApiUpdates = (
  current: EditableFacilityValues,
  previous: EditableFacilityValues,
  options?: { forceAllFields?: boolean }
) => {
  const forceAllFields = Boolean(options?.forceAllFields);
  const updates: Record<string, string> = {};
  const changedFields: EditableFacilityField[] = [];
  const assign = (field: EditableFacilityField, apiField: string) => {
    const nextValue = String(current[field] || '').trim();
    const previousValue = String(previous[field] || '').trim();
    if (!nextValue) return;
    if (!forceAllFields && nextValue === previousValue) return;
    updates[apiField] = nextValue;
    changedFields.push(field);
  };
  assign('contactPerson', 'RCFE_Admin_Name');
  assign('email', 'RCFE_Admin_Email');
  assign('phone', 'RCFE_Admin_RCFE_Owner_Phone');
  assign('npiNumber', 'NPI');
  assign('licenseNumber', 'RCFE_License_Number');
  assign('address', 'RCFE_Address');
  assign('city', 'RCFE_City');
  assign('state', 'RCFE_State');
  assign('zip', 'RCFE_Zip');
  assign('county', 'RCFE_County');
  return { updates, changedFields };
};

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeDisplay = (value: unknown, fallback = '—') => {
  const cleaned = String(value || '').trim();
  return cleaned || fallback;
};
const pickFirstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

const normalizeLookupToken = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const normalizeSpreadsheetIdToken = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^-?\d+(\.0+)?$/i.test(raw)) {
    return raw.replace(/\.0+$/i, '');
  }
  if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(raw)) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed).toString();
    }
  }
  return raw;
};

const normalizeSheetHeader = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const pickSpreadsheetValue = (row: Record<string, unknown>, aliases: string[]) => {
  const wanted = new Set(aliases.map((alias) => normalizeSheetHeader(alias)));
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(normalizeSheetHeader(key))) {
      return String(normalizeSpreadsheetIdToken(value)).trim();
    }
  }
  return '';
};

const SPREADSHEET_ALIASES = {
  licenseNumber: ['License #', 'License', 'License Number', 'RCFE License Number', 'RCFE_License_Number'],
  facilityName: ['Facility Name', 'RCFE Name', 'RCFE_Name', 'RCFE Facility Name'],
  contactPerson: ['Contact Person', 'RCFE Admin Name', 'RCFE_Admin_Name', 'RCFE Administrator Name'],
  email: ['Email', 'RCFE Admin Email', 'RCFE_Admin_Email', 'RCFE Administrator Email'],
  phone: [
    'Phone',
    'RCFE Admin / RCFE Owner Phone',
    'RCFE Admin Phone',
    'RCFE Owner Phone',
    'RCFE_Admin_RCFE_Owner_Phone',
  ],
  npiNumber: ['NPI', 'NPI Number', 'NPI_Number', 'NPI RCFE Owner', 'NPI_RCFE_Owner'],
  addressOrCounty: ['Address or County', 'Address', 'RCFE Address', 'RCFE_Address'],
  county: ['County', 'RCFE County', 'RCFE_County'],
  city: ['City', 'RCFE City', 'RCFE_City'],
  state: ['State', 'RCFE State', 'RCFE_State'],
  zip: ['Zip', 'Zip Code', 'RCFE Zip', 'RCFE_Zip'],
} as const;

const parseAddressOrCountyCell = (value: string) => {
  const text = String(value || '').trim();
  if (!text) {
    return { address: '', city: '', state: '', zip: '', county: '' };
  }
  const zip = text.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || '';
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    const stateCandidate = String(parts[parts.length - 2] || '').toUpperCase();
    const cityCandidate = parts[parts.length - 3] || '';
    const streetCandidate = parts.slice(0, Math.max(1, parts.length - 3)).join(', ');
    const state = /^[A-Z]{2}$/.test(stateCandidate) ? stateCandidate : '';
    return {
      address: streetCandidate,
      city: cityCandidate,
      state,
      zip,
      county: '',
    };
  }
  if (!zip && /^[A-Za-z .'-]+$/.test(text)) {
    return { address: '', city: '', state: '', zip: '', county: text };
  }
  return { address: text, city: '', state: '', zip, county: '' };
};

const buildRowSignature = (row: FacilityRow) =>
  [
    normalizeLookupToken(row.facilityName),
    normalizeLookupToken(row.address),
    normalizeLookupToken(row.city),
    normalizeLookupToken(row.zip),
  ].join('|');

const buildExportAddressOrCounty = (row: FacilityRow) => {
  const city = String(row.city || '').trim();
  const state = String(row.state || '').trim();
  const zip = String(row.zip || '').trim();
  const county = String(row.county || '').trim();
  const rawAddress = String(row.address || '')
    .replace(/\s+/g, ' ')
    .trim();

  let street = rawAddress;
  if (rawAddress && city) {
    const tokens = rawAddress
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const cityToken = normalize(city);
    const cityIndex = tokens.findIndex((token, index) => index > 0 && normalize(token) === cityToken);
    if (cityIndex > 0) {
      street = tokens.slice(0, cityIndex).join(', ').trim();
    } else if (tokens.length > 0) {
      street = tokens[0] || '';
    }
  }
  if (normalize(street) === normalize(city)) {
    street = '';
  }

  const locality = [city, state, zip].filter(Boolean).join(', ');
  const rebuilt = [street, locality].filter(Boolean).join(', ').trim();
  return rebuilt || county || rawAddress || '';
};

const getMissingFields = (row: FacilityRow) => {
  const missing: string[] = [];
  if (!String(row.contactPerson || '').trim()) missing.push('Contact Person');
  if (!String(row.email || '').trim()) missing.push('Email');
  if (!String(row.phone || '').trim()) missing.push('Phone');
  if (!String(row.npiNumber || '').trim()) missing.push('NPI Number');
  if (!String(row.licenseNumber || '').trim()) missing.push('RCFE License Number');
  if (!String(row.address || '').trim()) missing.push('Address');
  if (!String(row.city || '').trim()) missing.push('City');
  if (!String(row.state || '').trim()) missing.push('State');
  if (!String(row.zip || '').trim()) missing.push('Zip');
  return missing;
};

const isKaiserPlan = (value: unknown) => normalize(value).includes('kaiser');

const toFacilityRowFromMember = (member: RawKaiserMember): FacilityRow | null => {
  const raw = (member.caspioRaw || {}) as Record<string, unknown>;
  const memberId = String(member.Client_ID2 || member.id || raw.Client_ID2 || '').trim();
  const rcfeRegisteredId = String(raw.RCFE_Registered_ID || '').trim();
  const assignedRcfeName = pickFirstNonEmpty(member.RCFE_Name, raw.RCFE_Name);
  const facilityName = pickFirstNonEmpty(assignedRcfeName, raw.ISP_Current_Location, raw.Facility_Name);
  const licenseNumber = pickFirstNonEmpty(raw.RCFE_License_Number, raw.RCFE_License, raw.License_Number, raw.RCFE_Licence_Number);
  const contactPerson = pickFirstNonEmpty(member.RCFE_Admin_Name, raw.RCFE_Admin_Name, raw.RCFE_Administrator, raw.RCFE_Admin);
  const email = normalizeEmail(
    pickFirstNonEmpty(member.RCFE_Admin_Email, raw.RCFE_Admin_Email, raw.RCFE_Administrator_Email, raw.RCFE_AdminEmail)
  );
  const phone = pickFirstNonEmpty(
    raw.RCFE_Admin_RCFE_Owner_Phone,
    raw.RCFE_Owner_Phone,
    raw.RCFE_Admin_Phone,
    raw.RCFE_Administrator_Phone,
    raw.RCFE_Phone
  );
  const npiNumber = pickFirstNonEmpty(raw.NPI, raw.NPI_RCFE_Owner, raw.NPI_Number, raw.Provider_NPI);
  const address = pickFirstNonEmpty(member.RCFE_Address, raw.RCFE_Address, raw.RCFE_Street, raw.RCFE_Street_Address);
  const city = pickFirstNonEmpty(member.RCFE_City, raw.RCFE_City);
  const state = pickFirstNonEmpty(member.RCFE_State, raw.RCFE_State);
  const zip = pickFirstNonEmpty(member.RCFE_Zip, raw.RCFE_Zip);
  const county = pickFirstNonEmpty(raw.RCFE_County, raw.RCFE_County_Name, raw.Facility_County, raw.Member_County);
  const npiFirst = pickFirstNonEmpty(raw.NPI_First, raw.NPI_First_Name);
  const npiLast = pickFirstNonEmpty(raw.NPI_Last, raw.NPI_Last_Name, raw.NPI_RCFE_Owner);

  // Only include facilities when RCFE is explicitly assigned on the member record.
  const hasRcfeAssigned = Boolean(assignedRcfeName);
  if (!hasRcfeAssigned) return null;

  const memberName = `${String(member.memberLastName || '').trim()}, ${String(member.memberFirstName || '').trim()}`
    .replace(/^,\s*/, '')
    .trim();
  const memberLabel = pickFirstNonEmpty(memberName, String(member.memberMrn || '').trim(), 'Unknown Member');

  const dedupeKey = [
    normalize(licenseNumber),
    normalize(facilityName),
    normalize(address),
    normalize(city),
    normalize(zip),
  ].join('|');

  return {
    key: dedupeKey || `${normalize(facilityName)}|${normalize(contactPerson)}|${normalize(email)}`,
    memberIds: memberId ? [memberId] : [],
    rcfeRegisteredIds: rcfeRegisteredId ? [rcfeRegisteredId] : [],
    facilityName: facilityName || 'Unknown Facility',
    contactPerson,
    email,
    phone,
    address,
    city,
    state,
    zip,
    county,
    licenseNumber,
    npiNumber,
    npiFirst,
    npiLast,
    memberCount: 1,
    members: [memberLabel],
  };
};

const applyFirestoreOverridesToRow = (
  row: FacilityRow,
  syncPayload: RcfeDirectorySyncPayload | null
): FacilityRow => {
  if (!syncPayload) return row;

  const statusByRegisteredId = new Map<string, RcfeDirectoryStatusRow>();
  (syncPayload.statuses || []).forEach((status) => {
    const id = String(status?.rcfeRegisteredId || '').trim();
    if (id) statusByRegisteredId.set(id, status);
  });
  const status =
    row.rcfeRegisteredIds
      .map((id) => statusByRegisteredId.get(String(id || '').trim()))
      .find(Boolean) || null;
  const signature = buildRowSignature(row);
  const normalizedRowKey = String(row.key || '').trim().toLowerCase();
  const historyBySignature = (syncPayload.historyBySignature || {}) as Record<string, RcfeOverlayFields>;
  const historyByName = (syncPayload.historyByName || {}) as Record<string, RcfeOverlayFields>;
  const progressOverrides = (syncPayload.progressOverrides || {}) as RcfeDirectorySyncPayload['progressOverrides'];
  const progressBySignature = (syncPayload.progressBySignature || {}) as RcfeDirectorySyncPayload['progressBySignature'];
  const registryByRegisteredId = (syncPayload.rcfeRegistryByRegisteredId || {}) as NonNullable<
    RcfeDirectorySyncPayload['rcfeRegistryByRegisteredId']
  >;
  const registryByName = (syncPayload.rcfeRegistryByName || {}) as NonNullable<RcfeDirectorySyncPayload['rcfeRegistryByName']>;
  const historySig = historyBySignature[signature];
  const historyName = historyByName[normalizeLookupToken(row.facilityName)];
  const progressByKey = progressOverrides[normalizedRowKey];
  const progressSig = progressBySignature[signature];
  const registryMatchById =
    row.rcfeRegisteredIds
      .map((rid) => registryByRegisteredId[String(rid || '').trim()])
      .find(Boolean) || null;
  const registryMatchByName = registryByName[normalizeLookupToken(row.facilityName)] || null;

  const overlayCounty = pickFirstNonEmpty(
    status?.lastCounty,
    progressByKey?.RCFE_County,
    progressSig?.RCFE_County,
    historySig?.lastCounty,
    historyName?.lastCounty
  );
  const overlayFacilityName = pickFirstNonEmpty(
    status?.lastRcfeName,
    progressByKey?.RCFE_Name,
    progressSig?.RCFE_Name,
    historySig?.lastRcfeName,
    historyName?.lastRcfeName
  );
  const overlayNpiNumber = pickFirstNonEmpty(
    status?.lastNpiNumber,
    registryMatchById?.npiNumber,
    registryMatchByName?.npiNumber,
    progressByKey?.NPI,
    progressByKey?.NPI_RCFE_Owner,
    progressByKey?.NPI_Number,
    progressSig?.NPI,
    progressSig?.NPI_RCFE_Owner,
    progressSig?.NPI_Number,
    historySig?.lastNpiNumber,
    historyName?.lastNpiNumber
  );
  const overlayLicenseNumber = pickFirstNonEmpty(
    status?.lastLicenseNumber,
    progressByKey?.RCFE_License_Number,
    progressSig?.RCFE_License_Number,
    historySig?.lastLicenseNumber,
    historyName?.lastLicenseNumber
  );
  const overlayContactPerson = pickFirstNonEmpty(
    status?.lastAdminName,
    progressByKey?.RCFE_Admin_Name,
    progressSig?.RCFE_Admin_Name,
    historySig?.lastAdminName,
    historyName?.lastAdminName
  );
  const overlayEmail = pickFirstNonEmpty(
    status?.lastAdminEmail,
    progressByKey?.RCFE_Admin_Email,
    progressSig?.RCFE_Admin_Email,
    historySig?.lastAdminEmail,
    historyName?.lastAdminEmail
  );
  const overlayPhone = pickFirstNonEmpty(
    status?.lastAdminPhone,
    progressByKey?.RCFE_Admin_RCFE_Owner_Phone,
    progressSig?.RCFE_Admin_RCFE_Owner_Phone,
    historySig?.lastAdminPhone,
    historyName?.lastAdminPhone
  );
  const overlayAddress = pickFirstNonEmpty(
    status?.lastAddress,
    status?.lastStreet,
    progressByKey?.RCFE_Address,
    progressSig?.RCFE_Address,
    historySig?.lastAddress,
    historyName?.lastAddress
  );
  const overlayCity = pickFirstNonEmpty(
    status?.lastCity,
    progressByKey?.RCFE_City,
    progressSig?.RCFE_City,
    historySig?.lastCity,
    historyName?.lastCity
  );
  const overlayState = pickFirstNonEmpty(
    status?.lastState,
    progressByKey?.RCFE_State,
    progressSig?.RCFE_State,
    historySig?.lastState,
    historyName?.lastState
  );
  const overlayZip = pickFirstNonEmpty(
    status?.lastZip,
    progressByKey?.RCFE_Zip,
    progressSig?.RCFE_Zip,
    historySig?.lastZip,
    historyName?.lastZip
  );

  if (
    !overlayCounty &&
    !overlayFacilityName &&
    !overlayNpiNumber &&
    !overlayLicenseNumber &&
    !overlayContactPerson &&
    !overlayEmail &&
    !overlayPhone &&
    !overlayAddress &&
    !overlayCity &&
    !overlayState &&
    !overlayZip
  ) {
    return row;
  }

  return {
    ...row,
    facilityName: overlayFacilityName || row.facilityName,
    contactPerson: overlayContactPerson || row.contactPerson,
    email: overlayEmail || row.email,
    phone: overlayPhone || row.phone,
    npiNumber: overlayNpiNumber || row.npiNumber,
    licenseNumber: overlayLicenseNumber || row.licenseNumber,
    address: overlayAddress || row.address,
    city: overlayCity || row.city,
    state: overlayState || row.state,
    zip: overlayZip || row.zip,
    county: overlayCounty || row.county,
  };
};

export default function KaiserRcfeFacilityListPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const { toast } = useToast();
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [removedFacilityKeys, setRemovedFacilityKeys] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'auto' | 'compact' | 'table'>('auto');
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [editDraftByRowKey, setEditDraftByRowKey] = useState<Record<string, Partial<Record<EditableFacilityField, string>>>>({});
  const [editingRowKeys, setEditingRowKeys] = useState<string[]>([]);
  const [savingRowKeys, setSavingRowKeys] = useState<string[]>([]);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [isPreparingBulkPreview, setIsPreparingBulkPreview] = useState(false);
  const [isRollingBackBulkSnapshot, setIsRollingBackBulkSnapshot] = useState(false);
  const [rowSaveErrors, setRowSaveErrors] = useState<Record<string, string>>({});
  const [baselineByRowKey, setBaselineByRowKey] = useState<Record<string, EditableFacilityValues>>({});
  const [bulkPreviewState, setBulkPreviewState] = useState<RcfeBulkPreviewState | null>(null);
  const [lastBulkSnapshotId, setLastBulkSnapshotId] = useState('');
  const excelUploadInputRef = useRef<HTMLInputElement | null>(null);

  const isRowEditing = useCallback((rowKey: string) => editingRowKeys.includes(rowKey), [editingRowKeys]);
  const isRowSaving = useCallback((rowKey: string) => savingRowKeys.includes(rowKey), [savingRowKeys]);

  const getRowFieldValue = useCallback(
    (row: FacilityRow, field: EditableFacilityField) => {
      const draftValue = editDraftByRowKey[row.key]?.[field];
      if (draftValue !== undefined) return String(draftValue || '');
      return String(row[field] || '');
    },
    [editDraftByRowKey]
  );

  const startEditingRow = useCallback((row: FacilityRow, fieldToSeed?: EditableFacilityField) => {
    setEditingRowKeys((prev) => (prev.includes(row.key) ? prev : [...prev, row.key]));
    setRowSaveErrors((prev) => {
      if (!prev[row.key]) return prev;
      const copy = { ...prev };
      delete copy[row.key];
      return copy;
    });
    if (fieldToSeed) {
      setEditDraftByRowKey((prev) => ({
        ...prev,
        [row.key]: {
          ...(prev[row.key] || {}),
          [fieldToSeed]: String(prev[row.key]?.[fieldToSeed] ?? row[fieldToSeed] ?? ''),
        },
      }));
    }
  }, []);

  const cancelEditingRow = useCallback((rowKey: string) => {
    setEditingRowKeys((prev) => prev.filter((key) => key !== rowKey));
    setEditDraftByRowKey((prev) => {
      if (!(rowKey in prev)) return prev;
      const copy = { ...prev };
      delete copy[rowKey];
      return copy;
    });
    setRowSaveErrors((prev) => {
      if (!prev[rowKey]) return prev;
      const copy = { ...prev };
      delete copy[rowKey];
      return copy;
    });
  }, []);

  const updateRowDraftField = useCallback((rowKey: string, field: EditableFacilityField, value: string) => {
    const normalizedValue = field === 'email' ? normalizeEmail(value) : value;
    setBulkPreviewState(null);
    setEditDraftByRowKey((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || {}),
        [field]: normalizedValue,
      },
    }));
  }, []);

  const fetchFacilities = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    setError(null);
    try {
      let syncPayload: RcfeDirectorySyncPayload | null = null;
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          const syncResponse = await fetch('/api/admin/rcfe-directory/upsert', {
            cache: 'no-store',
            headers: { authorization: `Bearer ${idToken}` },
          });
          const syncJson = await syncResponse.json().catch(() => ({} as any));
          if (syncResponse.ok && syncJson?.success) {
            syncPayload = syncJson as RcfeDirectorySyncPayload;
          }
        } catch {
          // Best effort only; we still load from Caspio members if this fails.
        }
      }

      const response = await fetch('/api/kaiser-members', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok || !payload?.success) {
        throw new Error(String(payload?.error || `Failed to load Kaiser members (HTTP ${response.status})`));
      }

      const members: RawKaiserMember[] = Array.isArray(payload?.members) ? payload.members : [];
      const aggregated = new Map<string, FacilityRow>();
      members
        .filter((member) => isKaiserPlan(member.CalAIM_MCO))
        .forEach((member) => {
          const row = toFacilityRowFromMember(member);
          if (!row) return;
          const existing = aggregated.get(row.key);
          if (!existing) {
            aggregated.set(row.key, row);
            return;
          }
          const mergedMemberIds = new Set([...existing.memberIds, ...row.memberIds]);
          const mergedRcfeRegisteredIds = new Set([...existing.rcfeRegisteredIds, ...row.rcfeRegisteredIds]);
          const mergedMembers = new Set([...existing.members, ...row.members]);
          aggregated.set(row.key, {
            ...existing,
            memberIds: Array.from(mergedMemberIds),
            rcfeRegisteredIds: Array.from(mergedRcfeRegisteredIds),
            contactPerson: existing.contactPerson || row.contactPerson,
            email: existing.email || row.email,
            phone: existing.phone || row.phone,
            address: existing.address || row.address,
            city: existing.city || row.city,
            state: existing.state || row.state,
            zip: existing.zip || row.zip,
            county: existing.county || row.county,
            licenseNumber: existing.licenseNumber || row.licenseNumber,
            npiNumber: existing.npiNumber || row.npiNumber,
            npiFirst: existing.npiFirst || row.npiFirst,
            npiLast: existing.npiLast || row.npiLast,
            memberCount: mergedMembers.size,
            members: Array.from(mergedMembers),
          });
        });

      const nextRows = Array.from(aggregated.values())
        .map((row) => applyFirestoreOverridesToRow(row, syncPayload))
        .sort((a, b) =>
        a.facilityName.localeCompare(b.facilityName, undefined, { sensitivity: 'base' })
      );
      setFacilities(nextRows);
      const nextBaseline: Record<string, EditableFacilityValues> = {};
      nextRows.forEach((row) => {
        nextBaseline[row.key] = toEditableValuesFromRow(row);
      });
      setBaselineByRowKey(nextBaseline);
      setBulkPreviewState(null);
      setLastBulkSnapshotId('');
      setRemovedFacilityKeys([]);
      setEditDraftByRowKey({});
      setEditingRowKeys([]);
      setSavingRowKeys([]);
      setRowSaveErrors({});
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      setFacilities([]);
      setError(String(err?.message || 'Could not load facility list.'));
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  const filteredRows = useMemo(() => {
    const q = normalize(searchTerm);
    if (!q) return facilities;
    return facilities.filter((row) =>
      [
        row.facilityName,
        row.contactPerson,
        row.email,
        row.phone,
        row.address,
        row.city,
        row.state,
        row.zip,
        row.county,
        row.licenseNumber,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [facilities, searchTerm]);

  const removedKeysSet = useMemo(() => new Set(removedFacilityKeys), [removedFacilityKeys]);

  const outputRows = useMemo(
    () => filteredRows.filter((row) => !removedKeysSet.has(row.key)),
    [filteredRows, removedKeysSet]
  );
  const rowsWithMissingData = useMemo(
    () => outputRows.filter((row) => getMissingFields(row).length > 0),
    [outputRows]
  );
  const displayRows = useMemo(
    () => (showMissingOnly ? rowsWithMissingData : outputRows),
    [showMissingOnly, rowsWithMissingData, outputRows]
  );

  const handleRemoveFacility = useCallback((key: string) => {
    setRemovedFacilityKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const handleRestoreAllRemoved = useCallback(() => {
    setRemovedFacilityKeys([]);
  }, []);

  const saveFacilityRowToCaspio = useCallback(
    async (
      row: FacilityRow,
      options?: {
        silent?: boolean;
        forceAllFields?: boolean;
        preparedUpdates?: Record<string, string>;
        bulkOperationBatchId?: string;
        bulkOperationSnapshotId?: string;
        bulkOperationMode?: 'preview_push' | 'snapshot_rollback' | 'single_row_save';
      }
    ) => {
      const silent = Boolean(options?.silent);
      const forceAllFields = Boolean(options?.forceAllFields);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setRowSaveErrors((prev) => ({ ...prev, [row.key]: 'You must be signed in to save changes.' }));
        if (!silent) {
          toast({
            title: 'Save failed',
            description: 'You must be signed in to save changes.',
            variant: 'destructive',
          });
        }
        return { success: false, skipped: false, partial: false, error: 'You must be signed in to save changes.' };
      }

      const updates = toEditableValuesFromDraftAndRow(row, getRowFieldValue);
      const baseline = baselineByRowKey[row.key] || toEditableValuesFromRow(row);
      const payloadUpdates =
        options?.preparedUpdates ||
        buildRcfeApiUpdates(updates, baseline, { forceAllFields }).updates;

      if (Object.keys(payloadUpdates).length === 0) {
        if (!silent) {
          toast({
            title: forceAllFields ? 'No data to push' : 'No changes to save',
            description: forceAllFields
              ? 'This row has no non-empty RCFE fields to push.'
              : 'Update at least one field before saving this facility row.',
          });
        }
        return { success: true, skipped: true, partial: false };
      }

      if (row.memberIds.length === 0 && row.rcfeRegisteredIds.length === 0) {
        const missingIdMessage = 'No member or RCFE registration IDs were found for this facility row.';
        setRowSaveErrors((prev) => ({
          ...prev,
          [row.key]: missingIdMessage,
        }));
        if (!silent) {
          toast({
            title: 'Save failed',
            description: missingIdMessage,
            variant: 'destructive',
          });
        }
        return { success: false, skipped: false, partial: false, error: missingIdMessage };
      }

      setSavingRowKeys((prev) => (prev.includes(row.key) ? prev : [...prev, row.key]));
      setRowSaveErrors((prev) => {
        if (!prev[row.key]) return prev;
        const copy = { ...prev };
        delete copy[row.key];
        return copy;
      });

      try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch('/api/admin/rcfe-directory/upsert', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            memberIds: row.memberIds,
            rcfeRegisteredIds: row.rcfeRegisteredIds,
            updates: payloadUpdates,
            bulkOperationBatchId: options?.bulkOperationBatchId || '',
            bulkOperationSnapshotId: options?.bulkOperationSnapshotId || '',
            bulkOperationMode: options?.bulkOperationMode || 'single_row_save',
          }),
        });

        const payload = await response.json().catch(() => ({} as any));
        const isPartial = response.status === 207 && payload?.success;
        if ((!response.ok && !isPartial) || !payload?.success) {
          throw new Error(String(payload?.error || `Save failed (HTTP ${response.status})`));
        }

        setFacilities((prev) =>
          prev.map((item) =>
            item.key !== row.key
              ? item
              : {
                  ...item,
                  contactPerson: updates.contactPerson || item.contactPerson,
                  email: updates.email || item.email,
                  phone: updates.phone || item.phone,
                  npiNumber: updates.npiNumber || item.npiNumber,
                  licenseNumber: updates.licenseNumber || item.licenseNumber,
                  address: updates.address || item.address,
                  city: updates.city || item.city,
                  state: updates.state || item.state,
                  zip: updates.zip || item.zip,
                  county: updates.county || item.county,
                }
          )
        );
        setBaselineByRowKey((prev) => ({
          ...prev,
          [row.key]: {
            ...updates,
          },
        }));
        setBulkPreviewState(null);

        cancelEditingRow(row.key);
        if (!silent) {
          toast({
            title: isPartial ? 'Saved with partial updates' : 'Saved to Caspio',
            description: isPartial
              ? String(payload?.error || 'Most updates were saved, but some member rows may need review.')
              : `${row.facilityName} was updated in Caspio.`,
            variant: isPartial ? 'default' : 'default',
          });
        }
        return { success: true, skipped: false, partial: Boolean(isPartial) };
      } catch (err: any) {
        const message = String(err?.message || 'Could not save row to Caspio.');
        setRowSaveErrors((prev) => ({ ...prev, [row.key]: message }));
        if (!silent) {
          toast({
            title: 'Save failed',
            description: message,
            variant: 'destructive',
          });
        }
        return { success: false, skipped: false, partial: false, error: message };
      } finally {
        setSavingRowKeys((prev) => prev.filter((key) => key !== row.key));
      }
    },
    [baselineByRowKey, cancelEditingRow, getRowFieldValue, toast]
  );

  const buildBulkPreviewRows = useCallback(() => {
    const rowsToInspect = facilities.filter((row) => !removedKeysSet.has(row.key));
    const previewRows: RcfeBulkPreviewRow[] = [];
    rowsToInspect.forEach((row) => {
      const currentValues = toEditableValuesFromDraftAndRow(row, getRowFieldValue);
      const previousValues = baselineByRowKey[row.key] || toEditableValuesFromRow(row);
      const { updates, changedFields } = buildRcfeApiUpdates(currentValues, previousValues);
      if (Object.keys(updates).length === 0) return;
      previewRows.push({
        rowKey: row.key,
        facilityName: row.facilityName,
        memberIds: row.memberIds,
        rcfeRegisteredIds: row.rcfeRegisteredIds,
        changedFields,
        previousValues,
        currentValues,
        updates,
      });
    });
    return previewRows;
  }, [baselineByRowKey, facilities, getRowFieldValue, removedKeysSet]);

  const prepareBulkPushPreview = useCallback(async () => {
    if (isPreparingBulkPreview || isSavingAll) return;
    const previewRows = buildBulkPreviewRows();
    if (previewRows.length === 0) {
      toast({
        title: 'No staged changes',
        description: 'There are no changed RCFE rows to push right now.',
      });
      setBulkPreviewState(null);
      return;
    }

    setIsPreparingBulkPreview(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('You must be signed in to create a bulk snapshot.');
      }
      const idToken = await currentUser.getIdToken();
      const generatedBatchId = `rcfe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const response = await fetch('/api/admin/rcfe-directory/bulk-snapshots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          label: 'RCFE bulk push preview',
          batchId: generatedBatchId,
          rows: previewRows,
        }),
      });
      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok || !payload?.success) {
        throw new Error(String(payload?.error || `Failed to create snapshot (HTTP ${response.status})`));
      }
      const changedFieldCount = previewRows.reduce((sum, row) => sum + row.changedFields.length, 0);
      setBulkPreviewState({
        snapshotId: String(payload.snapshotId || '').trim(),
        batchId: String(payload.batchId || generatedBatchId).trim(),
        rowCount: previewRows.length,
        changedFieldCount,
        rows: previewRows,
      });
      setLastBulkSnapshotId(String(payload.snapshotId || '').trim());
      toast({
        title: 'Bulk preview ready',
        description: `Snapshot ${String(payload.snapshotId || '').trim()} created for ${previewRows.length} changed row(s).`,
      });
    } catch (error: any) {
      toast({
        title: 'Preview failed',
        description: String(error?.message || 'Could not prepare bulk push preview.'),
        variant: 'destructive',
      });
    } finally {
      setIsPreparingBulkPreview(false);
    }
  }, [buildBulkPreviewRows, isPreparingBulkPreview, isSavingAll, toast]);

  const rollbackBulkSnapshot = useCallback(
    async (snapshotId: string) => {
      const trimmedSnapshotId = String(snapshotId || '').trim();
      if (!trimmedSnapshotId || isRollingBackBulkSnapshot) return;
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm(
              `Rollback RCFE snapshot ${trimmedSnapshotId}?\n\nThis will push previous values back to Caspio for all rows in that snapshot.`
            )
          : false;
      if (!confirmed) return;

      setIsRollingBackBulkSnapshot(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error('You must be signed in to run rollback.');
        }
        const idToken = await currentUser.getIdToken();
        const loadResponse = await fetch(
          `/api/admin/rcfe-directory/bulk-snapshots?snapshotId=${encodeURIComponent(trimmedSnapshotId)}`,
          {
            headers: { authorization: `Bearer ${idToken}` },
            cache: 'no-store',
          }
        );
        const loadPayload = await loadResponse.json().catch(() => ({} as any));
        if (!loadResponse.ok || !loadPayload?.success || !loadPayload?.snapshot) {
          throw new Error(String(loadPayload?.error || 'Could not load bulk snapshot for rollback.'));
        }
        const snapshotRows = Array.isArray(loadPayload?.snapshot?.rows) ? loadPayload.snapshot.rows : [];
        if (snapshotRows.length === 0) {
          throw new Error('Snapshot has no rows to rollback.');
        }

        const batchId = String(loadPayload?.snapshot?.batchId || `rollback-${Date.now()}`).trim();
        let restored = 0;
        let failed = 0;
        for (const row of snapshotRows) {
          const previousValues = (row?.previousValues || {}) as EditableFacilityValues;
          const { updates } = buildRcfeApiUpdates(previousValues, {} as EditableFacilityValues, { forceAllFields: true });
          if (Object.keys(updates).length === 0) continue;
          const response = await fetch('/api/admin/rcfe-directory/upsert', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              memberIds: Array.isArray(row?.memberIds) ? row.memberIds : [],
              rcfeRegisteredIds: Array.isArray(row?.rcfeRegisteredIds) ? row.rcfeRegisteredIds : [],
              updates,
              bulkOperationBatchId: batchId,
              bulkOperationSnapshotId: trimmedSnapshotId,
              bulkOperationMode: 'snapshot_rollback',
            }),
          });
          const payload = await response.json().catch(() => ({} as any));
          if (response.ok && payload?.success) {
            restored += 1;
          } else {
            failed += 1;
          }
        }

        toast({
          title: failed > 0 ? 'Rollback completed with issues' : 'Rollback complete',
          description: `Restored: ${restored} • Failed: ${failed}`,
          variant: failed > 0 ? 'destructive' : 'default',
        });
        await fetchFacilities();
      } catch (error: any) {
        toast({
          title: 'Rollback failed',
          description: String(error?.message || 'Could not rollback snapshot.'),
          variant: 'destructive',
        });
      } finally {
        setIsRollingBackBulkSnapshot(false);
      }
    },
    [fetchFacilities, isRollingBackBulkSnapshot, toast]
  );

  const handlePushAllChangesToCaspio = useCallback(async () => {
    if (isSavingAll) return;
    const preview = bulkPreviewState;
    if (!preview || preview.rows.length === 0) {
      toast({
        title: 'Preview required',
        description: 'Click Preview Bulk Push first so we can snapshot and stage your changes.',
      });
      return;
    }

    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm(
            `Push staged RCFE updates for ${preview.rows.length} row(s)?\n\nSnapshot ID: ${preview.snapshotId}\nBatch ID: ${preview.batchId}`
          )
        : false;
    if (!confirmed) return;

    setIsSavingAll(true);
    let saved = 0;
    let partial = 0;
    let failed = 0;
    let skipped = 0;
    for (const staged of preview.rows) {
      const currentRow = facilities.find((row) => row.key === staged.rowKey);
      if (!currentRow) {
        failed += 1;
        continue;
      }
      const result = await saveFacilityRowToCaspio(currentRow, {
        silent: true,
        preparedUpdates: staged.updates,
        bulkOperationBatchId: preview.batchId,
        bulkOperationSnapshotId: preview.snapshotId,
        bulkOperationMode: 'preview_push',
      });
      if (result?.skipped) {
        skipped += 1;
      } else if (result?.success) {
        saved += 1;
        if (result.partial) partial += 1;
      } else {
        failed += 1;
      }
    }

    toast({
      title: failed > 0 ? 'Bulk push finished with issues' : 'Bulk push complete',
      description: `Saved: ${saved}${partial > 0 ? ` (${partial} partial)` : ''} • Skipped: ${skipped} • Failed: ${failed} • Snapshot: ${preview.snapshotId}`,
      variant: failed > 0 ? 'destructive' : 'default',
    });
    setIsSavingAll(false);
    setBulkPreviewState(null);
  }, [bulkPreviewState, facilities, isSavingAll, saveFacilityRowToCaspio, toast]);

  const handleUploadExcelChanges = useCallback(async (file: File) => {
    if (!file) return;
    if (facilities.length === 0) {
      toast({
        title: 'No facilities loaded',
        description: 'Click Refresh Data first, then upload your Excel changes.',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);
    try {
      const xlsxMod: any = await import('xlsx');
      const XLSX = xlsxMod?.default ?? xlsxMod;
      const fileBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames?.[0];
      const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
      if (!firstSheet) {
        throw new Error('No worksheet found in uploaded file.');
      }
      const importedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      if (!importedRows.length) {
        throw new Error('Uploaded file has no data rows.');
      }

      const byLicense = new Map<string, number>();
      const byFacilityName = new Map<string, number>();
      const byFacilityNameAndCity = new Map<string, number>();
      const byNpi = new Map<string, number>();
      const byEmail = new Map<string, number>();
      const byAddressCity = new Map<string, number>();
      facilities.forEach((row, index) => {
        const licenseKey = normalizeLookupToken(normalizeSpreadsheetIdToken(row.licenseNumber));
        const nameKey = normalizeLookupToken(row.facilityName);
        const cityKey = normalizeLookupToken(row.city);
        const npiKey = normalizeLookupToken(normalizeSpreadsheetIdToken(row.npiNumber));
        const emailKey = normalizeLookupToken(row.email);
        const addressKey = normalizeLookupToken(row.address);
        const nameCityKey = nameKey && cityKey ? `${nameKey}|${cityKey}` : '';
        const addressCityKey = addressKey && cityKey ? `${addressKey}|${cityKey}` : '';
        if (licenseKey && !byLicense.has(licenseKey)) byLicense.set(licenseKey, index);
        if (nameKey && !byFacilityName.has(nameKey)) byFacilityName.set(nameKey, index);
        if (nameCityKey && !byFacilityNameAndCity.has(nameCityKey)) byFacilityNameAndCity.set(nameCityKey, index);
        if (npiKey && !byNpi.has(npiKey)) byNpi.set(npiKey, index);
        if (emailKey && !byEmail.has(emailKey)) byEmail.set(emailKey, index);
        if (addressCityKey && !byAddressCity.has(addressCityKey)) byAddressCity.set(addressCityKey, index);
      });

      const nextFacilities = [...facilities];
      let matchedCount = 0;
      let updatedCount = 0;
      const unmatchedLabels: string[] = [];

      for (const imported of importedRows) {
        const licenseNumber = pickSpreadsheetValue(imported, [...SPREADSHEET_ALIASES.licenseNumber]);
        const facilityName = pickSpreadsheetValue(imported, [...SPREADSHEET_ALIASES.facilityName]);
        const contactPerson = pickSpreadsheetValue(imported, [...SPREADSHEET_ALIASES.contactPerson]);
        const email = normalizeEmail(pickSpreadsheetValue(imported, [...SPREADSHEET_ALIASES.email]));
        const phone = pickSpreadsheetValue(imported, [...SPREADSHEET_ALIASES.phone]);
        const npiNumber = pickSpreadsheetValue(imported, [...SPREADSHEET_ALIASES.npiNumber]);
        const addressOrCounty = pickSpreadsheetValue(imported, [...SPREADSHEET_ALIASES.addressOrCounty]);
        const explicitCounty = pickSpreadsheetValue(imported, [...SPREADSHEET_ALIASES.county]);
        const explicitCity = pickSpreadsheetValue(imported, [...SPREADSHEET_ALIASES.city]);
        const explicitState = pickSpreadsheetValue(imported, [...SPREADSHEET_ALIASES.state]).toUpperCase();
        const explicitZip = pickSpreadsheetValue(imported, [...SPREADSHEET_ALIASES.zip]);

        const parsedAddress = parseAddressOrCountyCell(addressOrCounty);
        const cityForMatch = explicitCity || parsedAddress.city;
        const zipForMatch = explicitZip || parsedAddress.zip;
        const licenseKey = normalizeLookupToken(normalizeSpreadsheetIdToken(licenseNumber));
        const facilityNameKey = normalizeLookupToken(facilityName);
        const npiKey = normalizeLookupToken(normalizeSpreadsheetIdToken(npiNumber));
        const emailKey = normalizeLookupToken(email);
        const addressKey = normalizeLookupToken(parsedAddress.address || addressOrCounty);
        const nameCityKey =
          facilityNameKey && cityForMatch ? `${facilityNameKey}|${normalizeLookupToken(cityForMatch)}` : '';
        const addressCityKey = addressKey && cityForMatch ? `${addressKey}|${normalizeLookupToken(cityForMatch)}` : '';
        let targetIndex =
          (licenseKey ? byLicense.get(licenseKey) : undefined) ??
          (npiKey ? byNpi.get(npiKey) : undefined) ??
          (emailKey ? byEmail.get(emailKey) : undefined) ??
          (addressCityKey ? byAddressCity.get(addressCityKey) : undefined) ??
          (nameCityKey ? byFacilityNameAndCity.get(nameCityKey) : undefined) ??
          (facilityNameKey ? byFacilityName.get(facilityNameKey) : undefined);
        if (targetIndex === undefined && facilityNameKey) {
          let bestScore = 0;
          facilities.forEach((row, index) => {
            const rowNameKey = normalizeLookupToken(row.facilityName);
            if (!rowNameKey) return;
            let score = 0;
            if (rowNameKey === facilityNameKey) {
              score += 3;
            } else if (
              (rowNameKey.includes(facilityNameKey) && facilityNameKey.length >= 6) ||
              (facilityNameKey.includes(rowNameKey) && rowNameKey.length >= 6)
            ) {
              score += 2;
            } else {
              return;
            }
            const rowCityKey = normalizeLookupToken(row.city);
            const matchCityKey = normalizeLookupToken(cityForMatch);
            if (rowCityKey && matchCityKey && rowCityKey === matchCityKey) score += 1;
            const rowZipKey = normalizeLookupToken(normalizeSpreadsheetIdToken(row.zip)).slice(0, 5);
            const matchZipKey = normalizeLookupToken(normalizeSpreadsheetIdToken(zipForMatch)).slice(0, 5);
            if (rowZipKey && matchZipKey && rowZipKey === matchZipKey) score += 1;
            if (score > bestScore) {
              bestScore = score;
              targetIndex = index;
            }
          });
          if (bestScore < 2) {
            targetIndex = undefined;
          }
        }
        if (targetIndex === undefined) {
          const label = facilityName || licenseNumber || '';
          if (label) unmatchedLabels.push(label);
          continue;
        }

        matchedCount += 1;
        const target = nextFacilities[targetIndex];
        const updates: Partial<FacilityRow> = {};
        if (facilityName) updates.facilityName = facilityName;
        if (contactPerson) updates.contactPerson = contactPerson;
        if (email) updates.email = email;
        if (phone) updates.phone = phone;
        if (licenseNumber) updates.licenseNumber = licenseNumber;
        if (npiNumber) updates.npiNumber = npiNumber;
        if (parsedAddress.address) updates.address = parsedAddress.address;
        if (explicitCity || parsedAddress.city) updates.city = explicitCity || parsedAddress.city;
        if (explicitState || parsedAddress.state) updates.state = (explicitState || parsedAddress.state || '').toUpperCase();
        if (explicitZip || parsedAddress.zip) updates.zip = explicitZip || parsedAddress.zip;
        if (explicitCounty || parsedAddress.county) updates.county = explicitCounty || parsedAddress.county;

        const merged = { ...target, ...updates };
        const changed =
          merged.facilityName !== target.facilityName ||
          merged.contactPerson !== target.contactPerson ||
          merged.email !== target.email ||
          merged.phone !== target.phone ||
          merged.licenseNumber !== target.licenseNumber ||
          merged.npiNumber !== target.npiNumber ||
          merged.address !== target.address ||
          merged.city !== target.city ||
          merged.state !== target.state ||
          merged.zip !== target.zip ||
          merged.county !== target.county;
        if (changed) {
          nextFacilities[targetIndex] = merged;
          updatedCount += 1;
        }
      }

      setFacilities(nextFacilities);
      setBulkPreviewState(null);
      toast({
        title: 'Excel changes loaded',
        description:
          matchedCount === 0
            ? 'No rows matched current facilities. Check that facility name/license columns are present.'
            : unmatchedLabels.length > 0
              ? `Matched ${matchedCount}, updated ${updatedCount}. Unmatched rows: ${unmatchedLabels.slice(0, 3).join(', ')}${unmatchedLabels.length > 3 ? ` +${unmatchedLabels.length - 3} more` : ''}.`
              : `Matched ${matchedCount}, updated ${updatedCount}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: String(error?.message || 'Could not parse uploaded Excel file.'),
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  }, [facilities, toast]);

  const handleExportExcel = useCallback(async () => {
    if (displayRows.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const xlsxMod: any = await import('xlsx');
      const XLSX = xlsxMod?.default ?? xlsxMod;
      const rowsForExcel = displayRows.map((row) => ({
        'Facility Name': row.facilityName,
        'Contact Person': row.contactPerson,
        Email: row.email,
        Phone: row.phone,
        'Address or County': buildExportAddressOrCounty(row),
        NPI: row.npiNumber,
        'License #': row.licenseNumber,
        'Specialty (Ex: Memory Care, Behavioral or Mental Health)': '',
      }));
      const worksheet = XLSX.utils.json_to_sheet(rowsForExcel);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'ALF Facility Contacts');
      const stamp = format(new Date(), 'yyyy-MM-dd');
      XLSX.writeFile(workbook, `ALF_Facility_Contact_Listing_${stamp}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  }, [displayRows, isExporting]);

  if (isAdminLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading permissions...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return <p className="p-6 text-sm text-destructive">Admin access required.</p>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Kaiser RCFE Current Facility List</h1>
          <p className="text-sm text-muted-foreground">
            Current RCFE list from Kaiser members with assigned facilities, ready for ILS long-term contract outreach.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => void fetchFacilities()} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh Data
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isImporting}
            onClick={() => excelUploadInputRef.current?.click()}
          >
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
            Upload Excel Changes
          </Button>
          <Button onClick={() => void handleExportExcel()} disabled={displayRows.length === 0 || isExporting} variant="outline">
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download Excel
          </Button>
          <input
            ref={excelUploadInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleUploadExcelChanges(file);
              }
              event.currentTarget.value = '';
            }}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                RCFE Facilities
              </CardTitle>
              <CardDescription>
                Includes RCFE license, admin contact, owner/admin phone, and address fields from `CalAIM_tbl_Members`.
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground">
              {lastRefreshedAt ? `Last refreshed ${format(lastRefreshedAt, 'MMM d, yyyy h:mm a')}` : 'No data loaded yet'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Facilities</div>
              <div className="text-2xl font-bold">{facilities.length}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Filtered Facilities</div>
              <div className="text-2xl font-bold">{displayRows.length}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Total Kaiser Members in List</div>
              <div className="text-2xl font-bold">
                {displayRows.reduce((sum, row) => sum + row.memberCount, 0)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowMissingOnly((prev) => !prev)}
              className={`rounded-md border p-3 text-left transition ${
                showMissingOnly
                  ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-200'
                  : 'hover:border-amber-300 hover:bg-amber-50/50'
              }`}
            >
              <div className="text-sm text-muted-foreground">
                Facilities Missing Required Info {showMissingOnly ? '(Showing only missing)' : '(Click to filter)'}
              </div>
              <div className="text-2xl font-bold text-amber-700">{rowsWithMissingData.length}</div>
            </button>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              placeholder="Search by facility, contact, license, city, phone, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="md:flex-1"
            />
            <div className="flex items-center gap-1 rounded-md border p-1">
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'auto' ? 'default' : 'ghost'}
                onClick={() => setViewMode('auto')}
              >
                Auto
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'compact' ? 'default' : 'ghost'}
                onClick={() => setViewMode('compact')}
              >
                Compact
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                onClick={() => setViewMode('table')}
              >
                Table
              </Button>
            </div>
            {showMissingOnly ? (
              <Button type="button" variant="outline" onClick={() => setShowMissingOnly(false)} className="md:w-auto">
                Show All Records
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={handleRestoreAllRemoved}
              disabled={removedFacilityKeys.length === 0}
              className="md:w-auto"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore Removed ({removedFacilityKeys.length})
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void prepareBulkPushPreview()}
              disabled={isPreparingBulkPreview || isSavingAll || isLoading}
              className="md:w-auto"
            >
              {isPreparingBulkPreview ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Preview Bulk Push
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void rollbackBulkSnapshot(lastBulkSnapshotId)}
              disabled={!lastBulkSnapshotId || isRollingBackBulkSnapshot || isSavingAll || isLoading}
              className="md:w-auto"
            >
              {isRollingBackBulkSnapshot ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Rollback Last Snapshot
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handlePushAllChangesToCaspio()}
              disabled={isSavingAll || isLoading || !bulkPreviewState}
              className="md:w-auto"
            >
              {isSavingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Push All Changes to Caspio
            </Button>
          </div>

          {bulkPreviewState ? (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">
              <div className="font-medium">Bulk Preview Ready</div>
              <div>
                Snapshot: <span className="font-mono">{bulkPreviewState.snapshotId}</span> • Batch:{' '}
                <span className="font-mono">{bulkPreviewState.batchId}</span>
              </div>
              <div>
                Rows staged: {bulkPreviewState.rowCount} • Field updates: {bulkPreviewState.changedFieldCount}
              </div>
              <div className="mt-1 text-xs text-blue-900/80">
                First rows: {bulkPreviewState.rows.slice(0, 3).map((row) => row.facilityName).join(', ')}
                {bulkPreviewState.rows.length > 3 ? ` +${bulkPreviewState.rows.length - 3} more` : ''}
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {facilities.length === 0 && !isLoading ? (
            <p className="text-sm text-muted-foreground">
              Click <span className="font-medium">Refresh Data</span> to load the current Kaiser RCFE facility list.
            </p>
          ) : null}

          <div className="rounded-md border">
            <div className={viewMode === 'table' ? 'hidden' : `px-3 py-2 text-xs text-muted-foreground ${viewMode === 'auto' ? 'xl:hidden' : ''}`}>
              Compact 2-line view is shown on smaller screens. Full multi-column table appears on larger desktop.
            </div>

            <div className={`${viewMode === 'table' ? 'hidden' : ''} ${viewMode === 'auto' ? 'xl:hidden' : ''} space-y-2 p-3`}>
              {isLoading ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading facilities...
                  </span>
                </div>
              ) : displayRows.length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  No matching facilities found.
                </div>
              ) : (
                displayRows.map((row) => (
                  <div key={row.key} className="rounded-md border px-3 py-2">
                    {getMissingFields(row).length > 0 ? (
                      <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                        <div className="mb-1">
                          Missing fields: {getMissingFields(row).map((label, idx) => {
                            const fieldKey = MISSING_LABEL_TO_FIELD[label];
                            const suffix = idx < getMissingFields(row).length - 1 ? ', ' : '';
                            if (!fieldKey) return <span key={`${row.key}-${label}`}>{label}{suffix}</span>;
                            return (
                              <button
                                key={`${row.key}-${label}`}
                                type="button"
                                className="underline underline-offset-2 hover:text-amber-700"
                                onClick={() => startEditingRow(row, fieldKey)}
                              >
                                {label}
                                {suffix}
                              </button>
                            );
                          })}
                        </div>
                        <div>Member refs: {row.members.slice(0, 3).join('; ')}</div>
                      </div>
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{normalizeDisplay(row.facilityName)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Contact: {normalizeDisplay(row.contactPerson)} • Phone: {normalizeDisplay(row.phone)} • License: {normalizeDisplay(row.licenseNumber)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          NPI Number: {normalizeDisplay(row.npiNumber)} • Address: {normalizeDisplay(row.address)} • City: {normalizeDisplay(row.city)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          Email: {normalizeDisplay(row.email)} • {normalizeDisplay(row.state)} {normalizeDisplay(row.zip)} • Members: {row.memberCount}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col gap-1">
                        {isRowEditing(row.key) ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void saveFacilityRowToCaspio(row)}
                              disabled={isRowSaving(row.key)}
                            >
                              {isRowSaving(row.key) ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-2 h-3.5 w-3.5" />}
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => cancelEditingRow(row.key)}
                              disabled={isRowSaving(row.key)}
                            >
                              <X className="mr-2 h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button type="button" size="sm" variant="outline" onClick={() => startEditingRow(row)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Edit
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveFacility(row.key)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </div>
                    </div>
                    {isRowEditing(row.key) ? (
                      <div className="mt-2 grid gap-2 rounded-md border bg-muted/20 p-2">
                        {EDITABLE_FIELDS.map((field) => (
                          <div key={`${row.key}-mobile-${field.key}`} className="grid gap-1">
                            <label className="text-[11px] font-medium text-muted-foreground">{field.label}</label>
                            <Input
                              value={getRowFieldValue(row, field.key)}
                              onChange={(e) => updateRowDraftField(row.key, field.key, e.target.value)}
                              placeholder={field.label}
                              className="h-8"
                            />
                          </div>
                        ))}
                        {rowSaveErrors[row.key] ? <p className="text-xs text-destructive">{rowSaveErrors[row.key]}</p> : null}
                      </div>
                    ) : null}
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <span className="text-muted-foreground">County</span>
                      <span>{normalizeDisplay(row.county)}</span>
                      <span className="text-muted-foreground">NPI Number</span>
                      <span>{normalizeDisplay(row.npiNumber)}</span>
                      <span className="text-muted-foreground">NPI First Name</span>
                      <span>{normalizeDisplay(row.npiFirst)}</span>
                      <span className="text-muted-foreground">NPI Last Name</span>
                      <span>{normalizeDisplay(row.npiLast)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className={`${viewMode === 'compact' ? 'hidden' : ''} ${viewMode === 'auto' ? 'hidden xl:block' : ''}`}>
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Desktop tip: this table supports horizontal scrolling. Scroll left/right (Shift + mouse wheel also works) to view all columns.
              </div>
              <div className="overflow-x-auto">
                <div className="max-h-[72vh] overflow-y-auto min-w-full">
              <Table className="min-w-[1380px]">
                <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Facility Name</TableHead>
                    <TableHead className="whitespace-nowrap">Contact Person</TableHead>
                    <TableHead className="whitespace-nowrap">Email</TableHead>
                    <TableHead className="whitespace-nowrap">Phone</TableHead>
                    <TableHead className="whitespace-nowrap">RCFE License Number</TableHead>
                    <TableHead className="whitespace-nowrap">Address</TableHead>
                    <TableHead className="whitespace-nowrap">City</TableHead>
                    <TableHead className="whitespace-nowrap">State</TableHead>
                    <TableHead className="whitespace-nowrap">Zip</TableHead>
                    <TableHead className="whitespace-nowrap">County</TableHead>
                    <TableHead className="whitespace-nowrap">NPI Number</TableHead>
                    <TableHead className="whitespace-nowrap">NPI First Name</TableHead>
                    <TableHead className="whitespace-nowrap">NPI Last Name</TableHead>
                    <TableHead className="whitespace-nowrap">Missing Fields</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={16} className="py-6 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading facilities...
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : displayRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={16} className="py-6 text-center text-sm text-muted-foreground">
                        No matching facilities found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayRows.map((row) => {
                      const missingFields = getMissingFields(row);
                      const hasMissing = missingFields.length > 0;
                      const isEditing = isRowEditing(row.key);
                      const isSaving = isRowSaving(row.key);
                      return (
                      <TableRow key={row.key} className={hasMissing ? 'bg-amber-50/50' : ''}>
                        <TableCell className="min-w-[220px]">{normalizeDisplay(row.facilityName)}</TableCell>
                        <TableCell className="min-w-[160px]">
                          {isEditing ? (
                            <Input
                              value={getRowFieldValue(row, 'contactPerson')}
                              onChange={(e) => updateRowDraftField(row.key, 'contactPerson', e.target.value)}
                              placeholder="Contact Person"
                              className="h-8"
                            />
                          ) : (
                            normalizeDisplay(row.contactPerson)
                          )}
                        </TableCell>
                        <TableCell className="min-w-[220px] break-words">
                          {isEditing ? (
                            <Input
                              value={getRowFieldValue(row, 'email')}
                              onChange={(e) => updateRowDraftField(row.key, 'email', e.target.value)}
                              placeholder="Email"
                              className="h-8"
                            />
                          ) : (
                            normalizeDisplay(row.email)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isEditing ? (
                            <Input
                              value={getRowFieldValue(row, 'phone')}
                              onChange={(e) => updateRowDraftField(row.key, 'phone', e.target.value)}
                              placeholder="Phone"
                              className="h-8 min-w-[140px]"
                            />
                          ) : (
                            normalizeDisplay(row.phone)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isEditing ? (
                            <Input
                              value={getRowFieldValue(row, 'licenseNumber')}
                              onChange={(e) => updateRowDraftField(row.key, 'licenseNumber', e.target.value)}
                              placeholder="License"
                              className="h-8 min-w-[140px]"
                            />
                          ) : (
                            normalizeDisplay(row.licenseNumber)
                          )}
                        </TableCell>
                        <TableCell className="min-w-[260px]">
                          {isEditing ? (
                            <Input
                              value={getRowFieldValue(row, 'address')}
                              onChange={(e) => updateRowDraftField(row.key, 'address', e.target.value)}
                              placeholder="Address"
                              className="h-8 min-w-[220px]"
                            />
                          ) : (
                            normalizeDisplay(row.address)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isEditing ? (
                            <Input
                              value={getRowFieldValue(row, 'city')}
                              onChange={(e) => updateRowDraftField(row.key, 'city', e.target.value)}
                              placeholder="City"
                              className="h-8 min-w-[120px]"
                            />
                          ) : (
                            normalizeDisplay(row.city)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isEditing ? (
                            <Input
                              value={getRowFieldValue(row, 'state')}
                              onChange={(e) => updateRowDraftField(row.key, 'state', e.target.value)}
                              placeholder="State"
                              className="h-8 min-w-[90px]"
                            />
                          ) : (
                            normalizeDisplay(row.state)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isEditing ? (
                            <Input
                              value={getRowFieldValue(row, 'zip')}
                              onChange={(e) => updateRowDraftField(row.key, 'zip', e.target.value)}
                              placeholder="Zip"
                              className="h-8 min-w-[100px]"
                            />
                          ) : (
                            normalizeDisplay(row.zip)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isEditing ? (
                            <Input
                              value={getRowFieldValue(row, 'county')}
                              onChange={(e) => updateRowDraftField(row.key, 'county', e.target.value)}
                              placeholder="County"
                              className="h-8 min-w-[120px]"
                            />
                          ) : (
                            normalizeDisplay(row.county)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isEditing ? (
                            <Input
                              value={getRowFieldValue(row, 'npiNumber')}
                              onChange={(e) => updateRowDraftField(row.key, 'npiNumber', e.target.value)}
                              placeholder="NPI Number"
                              className="h-8 min-w-[120px]"
                            />
                          ) : (
                            normalizeDisplay(row.npiNumber)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{normalizeDisplay(row.npiFirst)}</TableCell>
                        <TableCell className="whitespace-nowrap">{normalizeDisplay(row.npiLast)}</TableCell>
                        <TableCell className="min-w-[260px]">
                          {hasMissing ? (
                            <div className="text-xs text-amber-800">
                              {missingFields.map((label, idx) => {
                                const fieldKey = MISSING_LABEL_TO_FIELD[label];
                                const suffix = idx < missingFields.length - 1 ? ', ' : '';
                                if (!fieldKey) return <span key={`${row.key}-${label}`}>{label}{suffix}</span>;
                                return (
                                  <button
                                    key={`${row.key}-${label}`}
                                    type="button"
                                    className="underline underline-offset-2 hover:text-amber-700"
                                    onClick={() => startEditingRow(row, fieldKey)}
                                  >
                                    {label}
                                    {suffix}
                                  </button>
                                );
                              })}
                              <span>. Member refs: {row.members.slice(0, 3).join('; ')}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-emerald-700">Complete</span>
                          )}
                          {rowSaveErrors[row.key] ? <p className="mt-1 text-xs text-destructive">{rowSaveErrors[row.key]}</p> : null}
                        </TableCell>
                        <TableCell className="text-right">{row.memberCount}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <Button type="button" size="sm" onClick={() => void saveFacilityRowToCaspio(row)} disabled={isSaving}>
                                  {isSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-2 h-3.5 w-3.5" />}
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => cancelEditingRow(row.key)}
                                  disabled={isSaving}
                                >
                                  <X className="mr-2 h-3.5 w-3.5" />
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button type="button" size="sm" variant="outline" onClick={() => startEditingRow(row)}>
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Edit
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleRemoveFacility(row.key)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Remove
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )})
                  )}
                </TableBody>
              </Table>
                </div>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Export includes only the visible list after your manual removals.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

