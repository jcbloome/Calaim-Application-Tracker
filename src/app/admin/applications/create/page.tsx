'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Bell, FileText, Loader2, RotateCcw, Upload, Users } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

let pdfJsLoaderPromise: Promise<any> | null = null;
const loadPdfJs = async () => {
  if (pdfJsLoaderPromise) return pdfJsLoaderPromise;
  pdfJsLoaderPromise = import(
    /* webpackIgnore: true */
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.min.mjs'
  ).then((mod: any) => {
    const pdfjs = mod?.getDocument ? mod : mod?.default || mod;
    try {
      if (pdfjs?.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.worker.min.mjs';
      }
    } catch {
      // no-op
    }
    return pdfjs;
  });
  return pdfJsLoaderPromise;
};

const toMmDdYyyy = (rawValue: unknown): string => {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const mm = slash[1].padStart(2, '0');
    const dd = slash[2].padStart(2, '0');
    const yyyy = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${mm}/${dd}/${yyyy}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const yyyy = String(parsed.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
  }
  return raw;
};

const toDateInputValue = (rawValue: unknown): string => {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const mm = slash[1].padStart(2, '0');
    const dd = slash[2].padStart(2, '0');
    const yyyy = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
};

const parseMemberName = (rawValue: unknown): { firstName: string; lastName: string } => {
  const raw = String(rawValue || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { firstName: '', lastName: '' };
  if (raw.includes(',')) {
    const [last, first] = raw.split(',').map((part) => String(part || '').trim());
    return { firstName: first || '', lastName: last || '' };
  }
  const parts = raw.split(' ').filter(Boolean);
  if (parts.length <= 1) return { firstName: raw, lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
};

const toNameCase = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join(' ');

const findFirst = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = String(match?.[1] || '').trim();
    if (value) return value;
  }
  return '';
};

const findLabeledValue = (text: string, labelPattern: string, stopLabels: string[]) => {
  const stop = stopLabels.join('|');
  const pattern = new RegExp(
    `${labelPattern}\\b\\s*(?:[:#-]|\\s)?\\s*([\\s\\S]*?)(?=\\s*(?:${stop})\\b(?:\\s*[:#-])?|$)`,
    'i'
  );
  const match = text.match(pattern);
  return String(match?.[1] || '').replace(/\s+/g, ' ').trim();
};

const truncateAtNextLabel = (value: string) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const nextLabel = text.match(
    /\b(?:member|patient)?\s*(?:phone|cell(?:ular)?|mobile|email|dob|date\s*of\s*birth|mrn|authorization|provider|care\s*manager)\b/i
  );
  if (!nextLabel || typeof nextLabel.index !== 'number') return text;
  return text.slice(0, nextLabel.index).trim().replace(/[,:;\-]+$/, '').trim();
};

const parseAddressParts = (rawValue: unknown) => {
  const raw = String(rawValue || '').replace(/\s+/g, ' ').trim();
  if (!raw) {
    return { street: '', city: '', state: '', zip: '', county: '' };
  }

  const cleaned = raw.replace(/\s{2,}/g, ' ').trim();
  const cityStateZipMatch = cleaned.match(/(.+?),\s*([A-Za-z .'-]+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (cityStateZipMatch) {
    return {
      street: cityStateZipMatch[1].trim(),
      city: cityStateZipMatch[2].trim(),
      state: cityStateZipMatch[3].trim().toUpperCase(),
      zip: cityStateZipMatch[4].trim(),
      county: '',
    };
  }

  const commaParts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 3) {
    const street = commaParts[0];
    const city = commaParts[1];
    const stateZip = commaParts[2].match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    return {
      street,
      city,
      state: String(stateZip?.[1] || '').toUpperCase(),
      zip: String(stateZip?.[2] || ''),
      county: '',
    };
  }

  return { street: cleaned, city: '', state: '', zip: '', county: '' };
};

const extractServiceRequestFieldsLegacy = (params: { text: string; fileName: string }) => {
  const text = String(params.text || '');
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const flattened = lines.join('\n');

  const memberNameRaw =
    findFirst(flattened, [
      /(?:member|patient|beneficiary)\s*name\s*[:#-]?\s*([A-Z][A-Z ,.'-]{2,})/i,
      /name\s*[:#-]?\s*([A-Z][A-Z ,.'-]{2,})\s*(?:dob|date of birth|mrn|member id|auth|authorization)/i,
    ]) ||
    (() => {
      const fileBase = String(params.fileName || '').replace(/\.pdf$/i, '').trim();
      const noDatePrefix = fileBase.replace(/^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\s+/, '');
      const candidate = noDatePrefix.split('-')[0].replace(/\(.*?\)/g, '').trim();
      if (!candidate) return '';
      return candidate
        .split(' ')
        .filter((w) => /^[A-Za-z'-]+$/.test(w))
        .slice(0, 3)
        .join(' ');
    })();

  const authorizationNumber = findFirst(flattened, [
    /authorization\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
    /\bauth(?:orization)?\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
    /\bref(?:erence)?\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
  ]);

  const authorizationStart = findFirst(flattened, [
    /authorization\s*(?:start|from)\s*(?:date)?\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\beffective\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bstart\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ]);

  const authorizationEnd = findFirst(flattened, [
    /authorization\s*(?:end|to)\s*(?:date)?\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\btermination\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bend\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ]);

  const diagnosticCode = findFirst(flattened, [
    /(?:diagnostic|diagnosis|dx)\s*code\s*[:#-]?\s*([A-Z0-9.-]{3,10})/i,
    /\bicd(?:-10)?\s*[:#-]?\s*([A-Z0-9.-]{3,10})/i,
  ]);

  const memberMrn = findFirst(flattened, [
    /\bmrn\b\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
    /medical\s*record\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
  ]);

  const memberAddress = findLabeledValue(flattened, 'member\\s*address', [
    'member\\s*phone',
    'cell\\s*phone',
    'email',
    'population\\s*of\\s*focus',
    'provider',
    'authorization',
    'care\\s*manager',
  ]);

  const memberPhone = findFirst(flattened, [
    /member\s*phone\s*:\s*([()0-9.\-\s]{7,})/i,
    /\bphone\s*:\s*([()0-9.\-\s]{7,})/i,
  ]);

  const cellPhone = findFirst(flattened, [
    /cell\s*phone\s*:\s*([()0-9.\-\s]{7,})/i,
  ]);

  const memberEmail = findFirst(flattened, [
    /email\s*:\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  ]);

  const parsedName = parseMemberName(memberNameRaw);
  const updates: Record<string, string> = {};
  if (parsedName.firstName) updates.memberFirstName = toNameCase(parsedName.firstName);
  if (parsedName.lastName) updates.memberLastName = toNameCase(parsedName.lastName);
  if (memberMrn) updates.memberMrn = memberMrn;
  if (authorizationNumber) updates.Authorization_Number_T038 = authorizationNumber;
  if (authorizationStart) updates.Authorization_Start_T2038 = toMmDdYyyy(authorizationStart);
  if (authorizationEnd) updates.Authorization_End_T2038 = toMmDdYyyy(authorizationEnd);
  if (diagnosticCode) updates.Diagnostic_Code = diagnosticCode;
  if (memberAddress) updates.memberCustomaryAddress = memberAddress;
  if (cellPhone || memberPhone) {
    const normalizedPhone = String(cellPhone || memberPhone || '').replace(/[^\d-]/g, '').trim();
    if (normalizedPhone) updates.memberPhone = normalizedPhone;
  }
  if (memberPhone) {
    const normalizedContactPhone = String(memberPhone || '').replace(/[^\d.()-]/g, '').trim();
    if (normalizedContactPhone) updates.contactPhone = normalizedContactPhone;
  }
  if (memberEmail) updates.contactEmail = memberEmail.toLowerCase();
  return updates;
};

const extractServiceRequestFields = (params: { text: string; fileName: string }) => {
  const text = String(params.text || '');
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const flattened = lines.join('\n');

  const memberNameRaw =
    findFirst(flattened, [
      /(?:member|patient|beneficiary)\s*name\s*[:#-]?\s*([A-Z][A-Z ,.'-]{2,})/i,
      /name\s*[:#-]?\s*([A-Z][A-Z ,.'-]{2,})\s*(?:dob|date of birth|mrn|member id|auth|authorization)/i,
    ]) ||
    (() => {
      const fileBase = String(params.fileName || '').replace(/\.pdf$/i, '').trim();
      const noDatePrefix = fileBase.replace(/^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\s+/, '');
      const candidate = noDatePrefix.split('-')[0].replace(/\(.*?\)/g, '').trim();
      if (!candidate) return '';
      const uppercaseWords = candidate
        .split(' ')
        .filter((w) => /^[A-Za-z'-]+$/.test(w))
        .slice(0, 3)
        .join(' ');
      return uppercaseWords;
    })();

  const authorizationNumber = findFirst(flattened, [
    /authorization\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
    /\bauth(?:orization)?\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
    /\bref(?:erence)?\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
  ]);

  const authorizationStart = findFirst(flattened, [
    /authorization\s*(?:start|from)\s*(?:date)?\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\beffective\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bstart\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bfrom\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s*(?:to|-)\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ]);

  const authorizationEnd = findFirst(flattened, [
    /authorization\s*(?:end|to)\s*(?:date)?\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\btermination\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bend\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bfrom\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\s*(?:to|-)\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ]);

  const diagnosticCode = findFirst(flattened, [
    /(?:diagnostic|diagnosis|dx)\s*code\s*[:#-]?\s*([A-Z0-9.-]{3,10})/i,
    /\bicd(?:-10)?\s*[:#-]?\s*([A-Z0-9.-]{3,10})/i,
    /\bdiagnosis\s*[:#-]?\s*([A-Z][0-9][A-Z0-9.-]{1,8})/i,
  ]);

  const memberMrn = findFirst(flattened, [
    /\bmrn(?:\s*(?:number|no\.?|#))?\b\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i,
    /medical\s*record\s*(?:number|no\.?|#)\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i,
    /member\s*(?:id|identifier)\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i,
    /patient\s*(?:id|identifier)\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i,
  ]);

  const memberAddressRaw =
    findLabeledValue(flattened, '(?:member|patient)?\\s*address', [
      'member\\s*phone',
      'patient\\s*phone',
      'phone',
      'cell\\s*phone',
      'mobile\\s*phone',
      'dob',
      'date\\s*of\\s*birth',
      'email',
      'population\\s*of\\s*focus',
      'provider',
      'authorization',
      'care\\s*manager',
    ]) ||
    findFirst(flattened, [
      /(?:member|patient)\s*address\s*[:#-]?\s*([^\n]{8,})/i,
      /\baddress\s*[:#-]?\s*([^\n]{8,})/i,
    ]);
  const memberAddress = truncateAtNextLabel(memberAddressRaw);

  const memberDob = findFirst(flattened, [
    /(?:member|patient|beneficiary)?\s*(?:dob|date\s*of\s*birth)\s*[:#-]?\s*(?:\r?\n\s*)?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bdob\b\s*[:#-]?\s*(?:\r?\n\s*)?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ]);

  const memberPhone = findFirst(flattened, [
    /member\s*phone\s*[:#-]?\s*(?:\r?\n\s*)?([+()0-9.\-\s]{7,})/i,
    /patient\s*phone\s*[:#-]?\s*(?:\r?\n\s*)?([+()0-9.\-\s]{7,})/i,
    /\bphone\s*[:#-]?\s*(?:\r?\n\s*)?([+()0-9.\-\s]{7,})/i,
  ]);

  const cellPhone = findFirst(flattened, [
    /cell\s*phone\s*[:#-]?\s*(?:\r?\n\s*)?([+()0-9.\-\s]{7,})/i,
    /mobile\s*phone\s*[:#-]?\s*(?:\r?\n\s*)?([+()0-9.\-\s]{7,})/i,
  ]);

  const memberEmail = findFirst(flattened, [
    /(?:member|patient)?\s*email\s*[:#-]?\s*(?:\r?\n\s*)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  ]);

  const parsedName = parseMemberName(memberNameRaw);
  const parsedAddress = parseAddressParts(memberAddress);

  const updates: Partial<{
    memberFirstName: string;
    memberLastName: string;
    memberMrn: string;
    memberPhone: string;
    memberDob: string;
    Authorization_Number_T038: string;
    Authorization_Start_T2038: string;
    Authorization_End_T2038: string;
    Diagnostic_Code: string;
    memberCustomaryLocation: string;
    memberCustomaryAddress: string;
    memberCustomaryCity: string;
    memberCustomaryState: string;
    memberCustomaryZip: string;
    memberCustomaryCounty: string;
    contactPhone: string;
    contactEmail: string;
  }> = {};

  if (parsedName.firstName) updates.memberFirstName = toNameCase(parsedName.firstName);
  if (parsedName.lastName) updates.memberLastName = toNameCase(parsedName.lastName);
  if (memberMrn) updates.memberMrn = memberMrn;
  if (authorizationNumber) updates.Authorization_Number_T038 = authorizationNumber;
  if (authorizationStart) updates.Authorization_Start_T2038 = toMmDdYyyy(authorizationStart);
  if (authorizationEnd) updates.Authorization_End_T2038 = toMmDdYyyy(authorizationEnd);
  if (diagnosticCode) updates.Diagnostic_Code = diagnosticCode;
  if (memberDob) updates.memberDob = toMmDdYyyy(memberDob);
  if (memberAddress) {
    updates.memberCustomaryAddress = parsedAddress.street || memberAddress;
    if (parsedAddress.city) updates.memberCustomaryCity = parsedAddress.city;
    if (parsedAddress.state) updates.memberCustomaryState = parsedAddress.state;
    if (parsedAddress.zip) updates.memberCustomaryZip = parsedAddress.zip;
    if (parsedAddress.county) updates.memberCustomaryCounty = parsedAddress.county;
  }
  if (cellPhone || memberPhone) {
    const normalizedPhone = String(cellPhone || memberPhone || '').replace(/[^\d-]/g, '').trim();
    if (normalizedPhone) updates.memberPhone = normalizedPhone;
  }
  if (memberPhone) {
    const normalizedContactPhone = String(memberPhone || '').replace(/[^\d.()-]/g, '').trim();
    if (normalizedContactPhone) updates.contactPhone = normalizedContactPhone;
  }
  if (memberEmail) updates.contactEmail = memberEmail.toLowerCase();

  // Safety fallback: preserve original fast extraction behavior for core fields.
  const legacyUpdates = extractServiceRequestFieldsLegacy(params);
  const mergedUpdates = { ...legacyUpdates, ...updates };
  const mergedFields = Object.keys(mergedUpdates);

  return {
    updates: mergedUpdates,
    parsedFields: mergedFields,
    warnings:
      mergedFields.length === 0
        ? ['No recognizable fields were found. The PDF may be scanned or use different labels.']
        : [],
  };
};

const getEmptyMemberData = () => ({
  memberFirstName: '',
  memberLastName: '',
  memberMrn: '',
  memberDob: '',
  memberPhone: '',
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
  contactFirstName: '',
  contactLastName: '',
  contactPhone: '',
  contactEmail: '',
  contactRelationship: '',
  notes: '',
});

const normalizeMemberPatch = (patch: Record<string, unknown>) => {
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

type KaiserIlsImportRow = {
  rowId: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  clientId2: string;
  memberAddress: string;
  memberCounty: string;
  memberDob: string;
  memberPhone: string;
  authorizationNumberT2038: string;
  authorizationStartT2038: string;
  authorizationEndT2038: string;
  cptCode: string;
  diagnosticCode: string;
  assignedStaffId: string;
  assignedStaffName: string;
  createStatus: 'idle' | 'created' | 'failed';
  pushStatus: 'idle' | 'pushed' | 'failed';
  deleteStatus: 'idle' | 'deleted' | 'failed';
  statusNote: string;
  applicationId: string;
  pushedClientId2: string;
};

const normalizeSheetHeader = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const toSpreadsheetDate = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 90000) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return toMmDdYyyy(d.toISOString().slice(0, 10));
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toMmDdYyyy(value.toISOString().slice(0, 10));
  }
  return toMmDdYyyy(String(value || '').trim());
};

const getSpreadsheetValue = (row: Record<string, unknown>, aliases: string[]) => {
  const normalizedAlias = aliases.map((x) => normalizeSheetHeader(x));
  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    if (normalizedAlias.includes(nk)) return String(value ?? '').trim();
  }
  return '';
};

const CASPIO_PUSH_MAPPING: Record<string, string> = {
  memberFirstName: 'Senior_First',
  memberLastName: 'Senior_Last',
  clientId2: 'client_ID2',
  memberMrn: 'MCP_CIN',
  memberAddress: 'ISP_Current_Address',
  memberCounty: 'Member_County',
  memberDob: 'Birth_Date',
  memberPhone: 'Member_Phone',
  Authorization_Number_T038: 'Authorization_Number_T038',
  Authorization_Start_T2038: 'Authorization_Start_T2038',
  Authorization_End_T2038: 'Authorization_End_T2038',
  cptCode: 'CPT_Code',
  Diagnostic_Code: 'Diagnostic_Code',
  kaiserStatus: 'Kaiser_Status',
  workflowStep: 'workflow_step',
  assignedStaffName: 'Kaiser_User_Assignment',
  healthPlan: 'CalAIM_MCO',
};

export default function CreateApplicationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const firestore = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  
  const [isCreating, setIsCreating] = useState(false);
  const [intakeType, setIntakeType] = useState<'standard' | 'kaiser_auth_received_via_ils'>('standard');
  const [kaiserStaffList, setKaiserStaffList] = useState<Array<{ uid: string; displayName: string }>>([]);
  const [isLoadingKaiserStaff, setIsLoadingKaiserStaff] = useState(false);
  const [selectedAssignedStaffId, setSelectedAssignedStaffId] = useState('');
  const [selectedAssignedStaffName, setSelectedAssignedStaffName] = useState('');
  const [selectedStaffActionItemCount, setSelectedStaffActionItemCount] = useState(0);
  const [eligibilityScreenshotFiles, setEligibilityScreenshotFiles] = useState<File[]>([]);
  const [serviceRequestFile, setServiceRequestFile] = useState<File | null>(null);
  const [isParsingServiceRequest, setIsParsingServiceRequest] = useState(false);
  const [serviceRequestParsedFields, setServiceRequestParsedFields] = useState<string[]>([]);
  const [serviceRequestWarnings, setServiceRequestWarnings] = useState<string[]>([]);
  const [, setServiceRequestParseMode] = useState<'none' | 'text' | 'vision'>('none');
  const [serviceRequestTextPreview, setServiceRequestTextPreview] = useState('');
  const [ilsSpreadsheetFileName, setIlsSpreadsheetFileName] = useState('');
  const [ilsImportRows, setIlsImportRows] = useState<KaiserIlsImportRow[]>([]);
  const [ilsImportSelected, setIlsImportSelected] = useState<Record<string, boolean>>({});
  const [quickViewIlsRowId, setQuickViewIlsRowId] = useState('');
  const [isParsingIlsSpreadsheet, setIsParsingIlsSpreadsheet] = useState(false);
  const [isCreatingIlsRecords, setIsCreatingIlsRecords] = useState(false);
  const [isDeletingCreatedIlsRecords, setIsDeletingCreatedIlsRecords] = useState(false);
  const [isPushingIlsRows, setIsPushingIlsRows] = useState(false);
  const [isPushingSingleAuthToCaspio, setIsPushingSingleAuthToCaspio] = useState(false);
  const [isSendingFamilyInviteEmail, setIsSendingFamilyInviteEmail] = useState(false);
  const [lastCreatedSkeleton, setLastCreatedSkeleton] = useState<{ applicationId: string; memberName: string } | null>(null);
  const ilsSpreadsheetInputRef = useRef<HTMLInputElement | null>(null);
  const serviceRequestFileInputRef = useRef<HTMLInputElement | null>(null);
  const parseAbortControllerRef = useRef<AbortController | null>(null);
  const createApplicationRef = useRef<() => Promise<string | null> | string | null>(() => null);
  const [memberData, setMemberData] = useState(getEmptyMemberData);

  useEffect(() => {
    const intakeSource = String(searchParams.get('intakeSource') || '').trim().toLowerCase();
    if (!intakeSource) return;
    if (intakeSource === 'family_call') {
      setIntakeType('standard');
      return;
    }
    if (intakeSource === 'ils_single_authorization_sheet' || intakeSource === 'ils_spreadsheet_batch') {
      setIntakeType('kaiser_auth_received_via_ils');
    }
  }, [searchParams]);

  useEffect(() => {
    const loadKaiserStaff = async () => {
      if (!firestore || intakeType !== 'kaiser_auth_received_via_ils') return;
      setIsLoadingKaiserStaff(true);
      try {
        const snap = await getDocs(query(collection(firestore, 'users'), where('isKaiserStaff', '==', true)));
        const staff = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const firstName = String(data?.firstName || '').trim();
            const lastName = String(data?.lastName || '').trim();
            const email = String(data?.email || '').trim();
            const displayName = `${firstName} ${lastName}`.trim() || email || d.id;
            return { uid: d.id, displayName };
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        setKaiserStaffList(staff);
      } catch (error) {
        console.error('Failed to load Kaiser staff list:', error);
      } finally {
        setIsLoadingKaiserStaff(false);
      }
    };
    void loadKaiserStaff();
  }, [firestore, intakeType]);

  useEffect(() => {
    const loadActionItemCount = async () => {
      if (!firestore || !selectedAssignedStaffId) {
        setSelectedStaffActionItemCount(0);
        return;
      }
      try {
        const snap = await getDocs(query(collection(firestore, 'staff_notifications'), where('userId', '==', selectedAssignedStaffId)));
        const count = snap.docs.filter((d) => {
          const n = d.data() as any;
          const status = String(n?.status || '').trim().toLowerCase();
          const requiresAction = Boolean(n?.requiresStaffAction);
          return requiresAction && (status === 'open' || status === '');
        }).length;
        setSelectedStaffActionItemCount(count);
      } catch (error) {
        console.warn('Could not load staff action item count:', error);
        setSelectedStaffActionItemCount(0);
      }
    };
    void loadActionItemCount();
  }, [firestore, selectedAssignedStaffId]);

  const uploadEligibilityFiles = async (applicationId: string) => {
    if (!storage || eligibilityScreenshotFiles.length === 0) return [];
    const uploads = eligibilityScreenshotFiles.map((file) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `applications/${applicationId}/eligibility-screenshots/${Date.now()}-${safeName}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);
      return new Promise<{ fileName: string; filePath: string; downloadURL: string }>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          undefined,
          reject,
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve({ fileName: file.name, filePath: storagePath, downloadURL });
            } catch (error) {
              reject(error);
            }
          }
        );
      });
    });
    return Promise.all(uploads);
  };

  const selectedIlsRows = useMemo(
    () => ilsImportRows.filter((row) => Boolean(ilsImportSelected[row.rowId])),
    [ilsImportRows, ilsImportSelected]
  );
  const selectedCreatedIlsRows = useMemo(
    () => selectedIlsRows.filter((row) => Boolean(String(row.applicationId || '').trim())),
    [selectedIlsRows]
  );
  const quickViewIlsRow = useMemo(
    () => ilsImportRows.find((row) => row.rowId === quickViewIlsRowId) || null,
    [ilsImportRows, quickViewIlsRowId]
  );
  const caspioFieldPreview = useMemo(() => {
    const sample = quickViewIlsRow;
    if (!sample) return [] as Array<{ source: string; caspioField: string; value: string }>;
    const sourceValueMap: Record<string, string> = {
      memberFirstName: sample.memberFirstName,
      memberLastName: sample.memberLastName,
      clientId2: sample.clientId2,
      memberMrn: sample.memberMrn,
      memberAddress: sample.memberAddress,
      memberCounty: sample.memberCounty,
      memberDob: sample.memberDob,
      memberPhone: sample.memberPhone,
      Authorization_Number_T038: sample.authorizationNumberT2038,
      Authorization_Start_T2038: sample.authorizationStartT2038,
      Authorization_End_T2038: sample.authorizationEndT2038,
      cptCode: sample.cptCode,
      Diagnostic_Code: sample.diagnosticCode,
      kaiserStatus: 'T2038 Received, Needs First Contact',
      workflowStep: 'Needs First Contact',
      assignedStaffName: sample.assignedStaffName,
      healthPlan: 'Kaiser',
    };
    return Object.entries(CASPIO_PUSH_MAPPING).map(([source, caspioField]) => ({
      source,
      caspioField,
      value: String(sourceValueMap[source] || '').trim() || '—',
    }));
  }, [quickViewIlsRow]);

  const parseIlsSpreadsheetFile = async (file: File) => {
    setIsParsingIlsSpreadsheet(true);
    setIlsSpreadsheetFileName(String(file?.name || '').trim());
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error('No worksheet found in spreadsheet.');
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (!rows.length) throw new Error('Spreadsheet has no data rows.');

      const parsed: KaiserIlsImportRow[] = rows
        .map((raw, idx) => {
          const memberFirstNameRaw = getSpreadsheetValue(raw, ['Member First Name', 'First Name', 'Senior_First']);
          const memberLastNameRaw = getSpreadsheetValue(raw, ['Member Last Name', 'Last Name', 'Senior_Last']);
          const fullNameRaw = getSpreadsheetValue(raw, ['Member Name', 'Senior_Last_First_ID', 'Name']);
          const parsedName = parseMemberName(fullNameRaw);
          const memberFirstName = toNameCase(memberFirstNameRaw || parsedName.firstName);
          const memberLastName = toNameCase(memberLastNameRaw || parsedName.lastName);
          const memberMrn = getSpreadsheetValue(raw, ['Member MRN', 'MCP_CIN', 'MRN', 'CIN']);
          const clientId2 = getSpreadsheetValue(raw, ['Client_ID2', 'Client ID2', 'client_ID2']);
          const memberAddress = getSpreadsheetValue(raw, ['Member Address', 'Address', 'ISP_Current_Address']);
          const memberCounty = getSpreadsheetValue(raw, ['County', 'Member County', 'RCFE County', 'Member_County']);
          const memberDob = toSpreadsheetDate(
            getSpreadsheetValue(raw, ['Date of Birth', 'DOB', 'Birth_Date', 'Member DOB'])
          );
          const memberPhone = getSpreadsheetValue(raw, ['Member Phone Number', 'Member Phone', 'Phone', 'Member_Phone']);
          const authorizationNumberT2038 = getSpreadsheetValue(raw, ['ILS Auth Number', 'Authorization_Number_T038', 'Authorization Number', 'Auth Number', 'T2038 Authorization Number']);
          const authorizationStartT2038 = toSpreadsheetDate(
            getSpreadsheetValue(raw, ['Auth Start Date', 'Authorization_Start_T2038', 'Authorization Start', 'Auth Start', 'Start Date'])
          );
          const authorizationEndT2038 = toSpreadsheetDate(
            getSpreadsheetValue(raw, ['Auth End Date', 'Authorization_End_T2038', 'Authorization End', 'Auth End', 'End Date'])
          );
          const cptCode = getSpreadsheetValue(raw, ['CPT Code', 'CPT', 'Procedure Code']);
          const diagnosticCode = getSpreadsheetValue(raw, ['Diagnostic_Code', 'Diagnostic Code', 'Dx Code']);
          const ready = Boolean(memberFirstName && memberLastName);
          return {
            rowId: `ils-${Date.now()}-${idx}`,
            memberFirstName,
            memberLastName,
            memberMrn,
            clientId2,
            memberAddress,
            memberCounty,
            memberDob,
            memberPhone,
            authorizationNumberT2038,
            authorizationStartT2038,
            authorizationEndT2038,
            cptCode,
            diagnosticCode,
            assignedStaffId: selectedAssignedStaffId,
            assignedStaffName: selectedAssignedStaffName,
            createStatus: 'idle',
            pushStatus: 'idle',
            deleteStatus: 'idle',
            statusNote: ready ? '' : 'Missing member name',
            applicationId: '',
            pushedClientId2: '',
          } as KaiserIlsImportRow;
        })
        .filter((row) => Boolean(row.memberFirstName && row.memberLastName));

      if (!parsed.length) {
        throw new Error('No usable rows found. Make sure spreadsheet has member first/last name columns.');
      }
      const nextSelected: Record<string, boolean> = {};
      parsed.forEach((row) => {
        nextSelected[row.rowId] = true;
      });
      setIlsImportRows(parsed);
      setIlsImportSelected(nextSelected);
      setQuickViewIlsRowId(parsed[0]?.rowId || '');
      toast({
        title: 'Spreadsheet parsed',
        description: `Loaded ${parsed.length} Kaiser ILS row(s).`,
      });
    } catch (error: any) {
      toast({
        title: 'Spreadsheet parse failed',
        description: String(error?.message || 'Unable to parse this spreadsheet.'),
        variant: 'destructive',
      });
    } finally {
      setIsParsingIlsSpreadsheet(false);
    }
  };

  const clearIlsSpreadsheetImport = () => {
    setIlsImportRows([]);
    setIlsImportSelected({});
    setQuickViewIlsRowId('');
    setIlsSpreadsheetFileName('');
    if (ilsSpreadsheetInputRef.current) {
      ilsSpreadsheetInputRef.current.value = '';
    }
    toast({
      title: 'Spreadsheet upload removed',
      description: 'Spreadsheet rows were cleared. You can upload again and start over.',
    });
  };

  const applyStaffToSelectedIlsRows = () => {
    if (!selectedAssignedStaffId || !selectedAssignedStaffName) {
      toast({ title: 'Select Kaiser staff first', description: 'Choose a staff member above to assign selected rows.' });
      return;
    }
    setIlsImportRows((prev) =>
      prev.map((row) =>
        ilsImportSelected[row.rowId]
          ? { ...row, assignedStaffId: selectedAssignedStaffId, assignedStaffName: selectedAssignedStaffName }
          : row
      )
    );
    toast({
      title: 'Assignment applied',
      description: `Assigned ${selectedIlsRows.length} selected row(s) to ${selectedAssignedStaffName}.`,
    });
  };

  const createIlsSkeletonApplications = async () => {
    if (!firestore) return;
    if (!selectedIlsRows.length) {
      toast({ title: 'No selected rows', description: 'Select one or more imported rows first.' });
      return;
    }
    setIsCreatingIlsRecords(true);
    try {
      const authReceivedForms = [
        { name: 'CS Member Summary', status: 'Pending', type: 'online-form', href: '/admin/forms/edit' },
        { name: 'Waivers & Authorizations', status: 'Pending', type: 'online-form', href: '/admin/forms/waivers' },
        { name: 'Eligibility Screenshot', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Proof of Income', status: 'Pending', type: 'Upload', href: '#' },
        { name: "LIC 602A - Physician's Report", status: 'Pending', type: 'Upload', href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
        { name: 'Medicine List', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Room and Board/Tier Level Agreement', status: 'Pending', type: 'Upload', href: '/forms/room-board-obligation/printable' },
      ];

      for (const row of selectedIlsRows) {
        try {
          const applicationId = `admin_app_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const applicationRef = doc(firestore, 'applications', applicationId);
          await setDoc(applicationRef, {
            memberFirstName: row.memberFirstName,
            memberLastName: row.memberLastName,
            memberMrn: row.memberMrn || '',
            memberDob: row.memberDob || '',
            memberPhone: row.memberPhone || '',
            Authorization_Number_T038: row.authorizationNumberT2038 || '',
            Authorization_Start_T2038: row.authorizationStartT2038 || '',
            Authorization_End_T2038: row.authorizationEndT2038 || '',
            CPT_Code: row.cptCode || '',
            Diagnostic_Code: row.diagnosticCode || '',
            memberCustomaryAddress: row.memberAddress || '',
            memberCustomaryCounty: row.memberCounty || '',
            referrerFirstName: '',
            referrerLastName: '',
            referrerPhone: '',
            bestContactFirstName: '',
            bestContactLastName: '',
            bestContactPhone: '',
            bestContactRelationship: '',
            bestContactEmail: '',
            intakeType: 'kaiser_auth_received_via_ils',
            intakeSource: 'ils_spreadsheet_batch',
            kaiserAuthReceivedViaIls: true,
            kaiserAuthReceivedDate: serverTimestamp(),
            createdAt: serverTimestamp(),
            createdByAdmin: true,
            status: 'T2038 Received, Needs First Contact',
            currentStep: 1,
            isComplete: false,
            healthPlan: 'Kaiser',
            pathway: 'SNF Transition',
            kaiserStatus: 'T2038 Received, Needs First Contact',
            forms: authReceivedForms,
            assignedStaffId: row.assignedStaffId || '',
            assignedStaffName: row.assignedStaffName || '',
            assignedDate: row.assignedStaffId ? new Date().toISOString() : '',
          });
          if (row.assignedStaffId) {
            try {
              const memberName = `${row.memberFirstName || ''} ${row.memberLastName || ''}`.trim() || 'Member';
              const assignedByName = String(user?.displayName || user?.email || 'Manager').trim();
              const dueDate = new Date();
              dueDate.setHours(17, 0, 0, 0);
              await addDoc(collection(firestore, 'staff_notifications'), {
                userId: row.assignedStaffId,
                title: `Kaiser assignment: ${memberName}`,
                message:
                  `You were assigned ${memberName} from Kaiser ILS spreadsheet intake.\n` +
                  `MRN: ${row.memberMrn || '—'} • DOB: ${row.memberDob || '—'} • County: ${row.memberCounty || '—'}\n` +
                  `Status: T2038 Received, Needs First Contact`,
                memberName,
                memberMrn: row.memberMrn || null,
                memberDob: row.memberDob || null,
                county: row.memberCounty || null,
                mcpName: 'Kaiser',
                pathway: 'SNF Transition',
                healthPlan: 'Kaiser',
                type: 'assignment',
                priority: 'Priority',
                status: 'Open',
                isRead: false,
                requiresStaffAction: true,
                followUpRequired: true,
                followUpDate: dueDate.toISOString(),
                senderName: assignedByName,
                assignedByUid: String(user?.uid || '').trim() || null,
                assignedByName,
                actionUrl: `/admin/applications/${applicationId}`,
                applicationId,
                source: 'kaiser-ils-spreadsheet',
                timestamp: serverTimestamp(),
              });
            } catch (notifyError) {
              console.warn('Failed to create staff notification for spreadsheet row:', notifyError);
            }
          }
          setIlsImportRows((prev) =>
            prev.map((r) =>
              r.rowId === row.rowId
                ? { ...r, createStatus: 'created', applicationId, statusNote: `Created app ${applicationId}` }
                : r
            )
          );
        } catch (err: any) {
          setIlsImportRows((prev) =>
            prev.map((r) =>
              r.rowId === row.rowId ? { ...r, createStatus: 'failed', statusNote: String(err?.message || 'Create failed') } : r
            )
          );
        }
      }
      toast({ title: 'Batch create finished', description: `Processed ${selectedIlsRows.length} selected row(s).` });
    } finally {
      setIsCreatingIlsRecords(false);
    }
  };

  const deleteCreatedIlsRecords = async () => {
    if (!firestore) return;
    if (!selectedCreatedIlsRows.length) {
      toast({
        title: 'No created records selected',
        description: 'Select one or more rows that already created application records.',
      });
      return;
    }
    setIsDeletingCreatedIlsRecords(true);
    let deletedCount = 0;
    try {
      for (const row of selectedCreatedIlsRows) {
        const applicationId = String(row.applicationId || '').trim();
        if (!applicationId) continue;
        try {
          await deleteDoc(doc(firestore, 'applications', applicationId));
          const notifSnap = await getDocs(
            query(collection(firestore, 'staff_notifications'), where('applicationId', '==', applicationId))
          );
          if (!notifSnap.empty) {
            const batch = writeBatch(firestore);
            notifSnap.docs.forEach((d) => batch.delete(d.ref));
            await batch.commit();
          }
          deletedCount += 1;
          setIlsImportRows((prev) =>
            prev.map((r) =>
              r.rowId === row.rowId
                ? {
                    ...r,
                    createStatus: 'idle',
                    applicationId: '',
                    statusNote: 'Created application deleted (ready to recreate)',
                  }
                : r
            )
          );
        } catch (err: any) {
          setIlsImportRows((prev) =>
            prev.map((r) =>
              r.rowId === row.rowId
                ? { ...r, statusNote: `Delete created app failed: ${String(err?.message || 'Unknown error')}` }
                : r
            )
          );
        }
      }
      toast({
        title: 'Delete created records complete',
        description: `Deleted ${deletedCount} of ${selectedCreatedIlsRows.length} selected created application record(s).`,
      });
    } finally {
      setIsDeletingCreatedIlsRecords(false);
    }
  };

  const pushSelectedIlsRowsToCaspio = async () => {
    if (!selectedIlsRows.length) {
      toast({ title: 'No selected rows', description: 'Select one or more imported rows first.' });
      return;
    }
    setIsPushingIlsRows(true);
    try {
      for (const row of selectedIlsRows) {
        try {
          if (!row.assignedStaffName && !row.assignedStaffId) {
            throw new Error('Assign staff before pushing.');
          }
          const applicationData = {
            memberFirstName: row.memberFirstName,
            memberLastName: row.memberLastName,
            clientId2: row.clientId2,
            memberMrn: row.memberMrn,
            memberAddress: row.memberAddress,
            memberCounty: row.memberCounty,
            memberDob: row.memberDob,
            memberPhone: row.memberPhone,
            Authorization_Number_T038: row.authorizationNumberT2038,
            Authorization_Start_T2038: row.authorizationStartT2038,
            Authorization_End_T2038: row.authorizationEndT2038,
            cptCode: row.cptCode,
            Diagnostic_Code: row.diagnosticCode,
            kaiserStatus: 'T2038 Received, Needs First Contact',
            workflowStep: 'Needs First Contact',
            assignedStaffId: row.assignedStaffId,
            assignedStaffName: row.assignedStaffName,
            healthPlan: 'Kaiser',
          };
          const res = await fetch('/api/admin/caspio/push-cs-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              applicationData,
              mapping: CASPIO_PUSH_MAPPING,
            }),
          });
          const data = (await res.json().catch(() => ({}))) as any;
          if (!res.ok || !data?.success) {
            throw new Error(data?.message || data?.details?.rawError || `Push failed (HTTP ${res.status})`);
          }
          const pushedClientId2 = String(data?.clientId2 || row.clientId2 || '').trim();
          const linkedApplicationId = String(row.applicationId || '').trim();
          if (firestore && linkedApplicationId && pushedClientId2) {
            await setDoc(
              doc(firestore, 'applications', linkedApplicationId),
              {
                clientId2: pushedClientId2,
                client_ID2: pushedClientId2,
                caspioClientId2: pushedClientId2,
                caspioSent: true,
                caspioSentDate: serverTimestamp(),
                lastUpdated: serverTimestamp(),
              },
              { merge: true }
            );
          }
          setIlsImportRows((prev) =>
            prev.map((r) =>
              r.rowId === row.rowId
                ? {
                    ...r,
                    pushStatus: 'pushed',
                    pushedClientId2,
                    statusNote: data?.message || 'Pushed to Caspio',
                  }
                : r
            )
          );
        } catch (err: any) {
          setIlsImportRows((prev) =>
            prev.map((r) =>
              r.rowId === row.rowId ? { ...r, pushStatus: 'failed', statusNote: String(err?.message || 'Push failed') } : r
            )
          );
        }
      }
      toast({ title: 'Caspio push finished', description: `Processed ${selectedIlsRows.length} selected row(s).` });
    } finally {
      setIsPushingIlsRows(false);
    }
  };

  // Phone number formatting function
  const formatPhoneNumber = (value: string) => {
    // Remove all non-numeric characters
    const phoneNumber = value.replace(/\D/g, '');
    
    // Limit to 10 digits
    const limitedPhoneNumber = phoneNumber.substring(0, 10);
    
    // Format as xxx.xxx.xxxx
    if (limitedPhoneNumber.length >= 6) {
      return `${limitedPhoneNumber.substring(0, 3)}.${limitedPhoneNumber.substring(3, 6)}.${limitedPhoneNumber.substring(6)}`;
    } else if (limitedPhoneNumber.length >= 3) {
      return `${limitedPhoneNumber.substring(0, 3)}.${limitedPhoneNumber.substring(3)}`;
    } else {
      return limitedPhoneNumber;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedPhone = formatPhoneNumber(e.target.value);
    setMemberData({ ...memberData, contactPhone: formattedPhone });
  };

  const formatMemberPhoneWithDashes = (value: string) => {
    const phoneNumber = value.replace(/\D/g, '');
    const limitedPhoneNumber = phoneNumber.substring(0, 10);
    if (limitedPhoneNumber.length >= 6) {
      return `${limitedPhoneNumber.substring(0, 3)}-${limitedPhoneNumber.substring(3, 6)}-${limitedPhoneNumber.substring(6)}`;
    } else if (limitedPhoneNumber.length >= 3) {
      return `${limitedPhoneNumber.substring(0, 3)}-${limitedPhoneNumber.substring(3)}`;
    }
    return limitedPhoneNumber;
  };

  const parseServiceRequestPdfAndApply = async () => {
    if (!serviceRequestFile) {
      toast({ title: 'No PDF selected', description: 'Choose a Service Request Form PDF first.', variant: 'destructive' });
      return;
    }
    
    // Create abort controller for this parse operation
    parseAbortControllerRef.current = new AbortController();
    
    setIsParsingServiceRequest(true);
    setServiceRequestParsedFields([]);
    setServiceRequestWarnings([]);
    setServiceRequestParseMode('none');
    try {
      const pdfjs = await loadPdfJs();
      const bytes = await serviceRequestFile.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true });
      const pdf = await loadingTask.promise;
      const lines: string[] = [];
      const warnings: string[] = [];
      const maxPagesForText = Math.min(pdf.numPages, 8);
      if (pdf.numPages > maxPagesForText) warnings.push(`Parsed first ${maxPagesForText} pages.`);

      for (let pageNum = 1; pageNum <= maxPagesForText; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const tc = await page.getTextContent();
        const items = (tc.items || []) as Array<any>;
        const rows: Array<{ str: string; x: number; y: number }> = [];
        for (const it of items) {
          const str = String(it?.str || '').trim();
          if (!str) continue;
          const tr = it?.transform || [];
          const x = Number(tr?.[4] ?? 0);
          const y = Number(tr?.[5] ?? 0);
          rows.push({ str, x, y });
        }
        const byY = new Map<number, Array<{ str: string; x: number }>>();
        for (const row of rows) {
          const yk = Math.round(row.y);
          const arr = byY.get(yk) || [];
          arr.push({ str: row.str, x: row.x });
          byY.set(yk, arr);
        }
        const yKeys = Array.from(byY.keys()).sort((a, b) => b - a);
        for (const yk of yKeys) {
          const parts = (byY.get(yk) || []).sort((a, b) => a.x - b.x).map((p) => p.str);
          const line = parts.join(' ').replace(/\s{2,}/g, ' ').trim();
          if (line) lines.push(line);
        }
      }

      const text = lines.join('\n').trim();
      setServiceRequestTextPreview(text ? text.slice(0, 8000) : '');

      if (!text) {
        // No text layer - use vision API with browser-based image conversion
        toast({
          title: 'Scanned PDF detected',
          description: 'Using AI vision to extract fields...',
          variant: 'default',
        });

        // Convert PDF page to image in browser
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        if (!context) {
          throw new Error('Could not get canvas context');
        }

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        // Convert canvas to blob
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png');
        });

        // Send image to vision API
        const formData = new FormData();
        formData.append('image', blob, 'page.png');

        const response = await fetch('/api/admin/parse-service-request-vision', {
          method: 'POST',
          body: formData,
          signal: parseAbortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Vision parsing failed');
        }

        const visionResult = await response.json();
        const updates = visionResult.fields;
        const parsedFieldKeys = visionResult.parsedFieldKeys;
        const visionWarnings = visionResult.warnings || [];

        if (parsedFieldKeys.length === 0) {
          setServiceRequestWarnings(visionWarnings);
          setServiceRequestParseMode('vision');
          toast({
            title: 'No fields extracted',
            description: 'Could not extract fields from scanned PDF. Please enter data manually.',
            variant: 'default',
          });
          return;
        }

        setMemberData((prev) => ({ ...prev, ...normalizeMemberPatch(updates as Record<string, unknown>) }));
        setServiceRequestParsedFields(parsedFieldKeys);
        setServiceRequestWarnings(visionWarnings);
        setServiceRequestParseMode('vision');
        toast({
          title: 'Service request parsed (Vision)',
          description: `Autofilled ${parsedFieldKeys.length} field(s) using AI vision.`,
        });
        return;
      }

      const parsed = extractServiceRequestFields({ text, fileName: serviceRequestFile.name });
      const updates = parsed.updates;
      const parsedFieldKeys = parsed.parsedFields;
      warnings.push(...parsed.warnings);

      if (parsedFieldKeys.length === 0) {
        setServiceRequestWarnings(warnings);
        setServiceRequestParseMode('text');
        toast({
          title: 'No autofill fields found',
          description: warnings[0] || 'No matching fields were found. You can continue entering data manually.',
          variant: 'default',
        });
        return;
      }

      setMemberData((prev) => ({ ...prev, ...normalizeMemberPatch(updates as Record<string, unknown>) }));
      setServiceRequestParsedFields(parsedFieldKeys);
      setServiceRequestWarnings(warnings);
      setServiceRequestParseMode('text');
      toast({
        title: 'Service request parsed',
        description: `Autofilled ${parsedFieldKeys.length} field(s) from PDF text.`,
      });
    } catch (error: any) {
      // Check if it was aborted
      if (error.name === 'AbortError') {
        toast({
          title: 'Parsing cancelled',
          description: 'PDF parsing was stopped.',
          variant: 'default',
        });
        return;
      }
      
      const safeMessage = String(error?.message || 'Could not parse Service Request PDF.');
      // Avoid logging raw Error objects in dev overlay, which can appear as unhandled runtime errors.
      console.warn('Service request parse failed:', safeMessage);
      toast({
        title: 'Parse failed',
        description: safeMessage,
        variant: 'destructive',
      });
    } finally {
      setIsParsingServiceRequest(false);
      parseAbortControllerRef.current = null;
    }
  };

  const cancelParsing = () => {
    if (parseAbortControllerRef.current) {
      parseAbortControllerRef.current.abort();
      toast({
        title: 'Cancelling...',
        description: 'Stopping PDF parsing.',
        variant: 'default',
      });
    }
  };

  const clearServiceRequestFile = () => {
    setServiceRequestFile(null);
    setServiceRequestParsedFields([]);
    setServiceRequestWarnings([]);
    setServiceRequestParseMode('none');
    setServiceRequestTextPreview('');
    if (serviceRequestFileInputRef.current) {
      serviceRequestFileInputRef.current.value = '';
    }
    toast({
      title: 'Service request file removed',
      description: 'You can choose a different PDF.',
    });
  };

  const resetAllCreateFields = () => {
    setMemberData(getEmptyMemberData());
    setSelectedAssignedStaffId('');
    setSelectedAssignedStaffName('');
    setSelectedStaffActionItemCount(0);
    setEligibilityScreenshotFiles([]);
    setServiceRequestFile(null);
    setServiceRequestParsedFields([]);
    setServiceRequestWarnings([]);
    setServiceRequestTextPreview('');
    setIlsSpreadsheetFileName('');
    setIlsImportRows([]);
    setIlsImportSelected({});
    setLastCreatedSkeleton(null);
    if (serviceRequestFileInputRef.current) {
      serviceRequestFileInputRef.current.value = '';
    }
    if (ilsSpreadsheetInputRef.current) {
      ilsSpreadsheetInputRef.current.value = '';
    }
    toast({
      title: 'Form reset',
      description: 'All entered fields were cleared so you can start over.',
    });
  };

  const createApplicationForMember = async (options?: { skipNavigate?: boolean; suppressSuccessToast?: boolean }) => {
    const isKaiserAuthReceived = intakeType === 'kaiser_auth_received_via_ils';
    const hasStandardRequired = memberData.contactPhone && memberData.contactFirstName && memberData.contactLastName;
    const hasKaiserRequired = true;

    if (
      !firestore ||
      !memberData.memberFirstName ||
      !memberData.memberLastName ||
      (!isKaiserAuthReceived && !hasStandardRequired) ||
      (isKaiserAuthReceived && !hasKaiserRequired)
    ) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields for this intake type.",
        variant: "destructive",
      });
      return null;
    }

    setIsCreating(true);
    try {
      // Create a unique application ID for this member
      const applicationId = `admin_app_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const applicationRef = doc(firestore, 'applications', applicationId);
      
      // Create the application document with initial member and contact information
      const baseApplication: Record<string, unknown> = {
        // Member information
        memberFirstName: memberData.memberFirstName,
        memberLastName: memberData.memberLastName,
        ...(isKaiserAuthReceived
          ? {
              memberMrn: memberData.memberMrn || '',
              memberDob: memberData.memberDob || '',
              memberPhone: memberData.memberPhone || '',
              Authorization_Number_T038: memberData.Authorization_Number_T038 || '',
              Authorization_Start_T2038: memberData.Authorization_Start_T2038 || '',
              Authorization_End_T2038: memberData.Authorization_End_T2038 || '',
              Diagnostic_Code: memberData.Diagnostic_Code || '',
              customaryLocationType: memberData.memberCustomaryLocation || '',
              currentLocation: 'Unknown',
              currentAddress: 'Unknown',
              currentCity: 'Unknown',
              currentState: 'Unknown',
              currentZip: 'Unknown',
              currentCounty: 'Unknown',
              customaryAddress: memberData.memberCustomaryAddress || '',
              customaryCity: memberData.memberCustomaryCity || '',
              customaryState: memberData.memberCustomaryState || '',
              customaryZip: memberData.memberCustomaryZip || '',
              customaryCounty: memberData.memberCustomaryCounty || '',
            }
          : {}),

        // Contact/Referrer information (person helping with application)
        referrerFirstName: memberData.contactFirstName || '',
        referrerLastName: memberData.contactLastName || '',
        referrerPhone: memberData.contactPhone || memberData.memberPhone || '',
        referrerRelationship: memberData.contactRelationship || '',

        // Best contact defaults to same as referrer for admin-created applications
        bestContactFirstName: memberData.contactFirstName || '',
        bestContactLastName: memberData.contactLastName || '',
        bestContactPhone: memberData.contactPhone || memberData.memberPhone || '',
        bestContactRelationship: memberData.contactRelationship || '',
        bestContactEmail: memberData.contactEmail || '',

        intakeType,
        intakeSource: isKaiserAuthReceived ? 'ils_single_authorization_sheet' : 'family_call',
        kaiserAuthReceivedViaIls: isKaiserAuthReceived,
        kaiserAuthReceivedDate: isKaiserAuthReceived ? serverTimestamp() : null,

        // Application metadata
        createdAt: serverTimestamp(),
        createdByAdmin: true,
        status: isKaiserAuthReceived ? 'Authorization Received (Doc Collection)' : 'draft',
        currentStep: 1,
        adminNotes: memberData.notes,

        // Mark as incomplete - will be completed through the form
        isComplete: false,
      };

      const authReceivedForms = [
        { name: 'CS Member Summary', status: 'Pending', type: 'online-form', href: '/admin/forms/edit' },
        { name: 'Waivers & Authorizations', status: 'Pending', type: 'online-form', href: '/admin/forms/waivers' },
        { name: 'Eligibility Screenshot', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Proof of Income', status: 'Pending', type: 'Upload', href: '#' },
        { name: "LIC 602A - Physician's Report", status: 'Pending', type: 'Upload', href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
        { name: 'Medicine List', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Room and Board/Tier Level Agreement', status: 'Pending', type: 'Upload', href: '/forms/room-board-obligation/printable' },
      ];

      await setDoc(applicationRef, {
        ...baseApplication,
        healthPlan: isKaiserAuthReceived ? 'Kaiser' : '',
        pathway: isKaiserAuthReceived ? 'SNF Transition' : '',
        kaiserStatus: isKaiserAuthReceived ? 'Authorization Received (Doc Collection)' : '',
        forms: isKaiserAuthReceived ? authReceivedForms : [],
        ...(isKaiserAuthReceived
          ? {
              assignedStaffId: selectedAssignedStaffId,
              assignedStaffName: selectedAssignedStaffName,
              assignedDate: new Date().toISOString(),
            }
          : {}),
      });

      if (isKaiserAuthReceived && eligibilityScreenshotFiles.length > 0) {
        try {
          const uploadedFiles = await uploadEligibilityFiles(applicationId);
          if (uploadedFiles.length > 0) {
            const completedEligibilityForm = {
              name: 'Eligibility Screenshot',
              status: 'Completed',
              type: 'Upload',
              fileName: uploadedFiles[0].fileName,
              filePath: uploadedFiles[0].filePath,
              downloadURL: uploadedFiles[0].downloadURL,
              uploadedFiles,
              dateCompleted: new Date().toISOString(),
            };
            const updatedForms = authReceivedForms.map((f) =>
              f.name === 'Eligibility Screenshot' ? completedEligibilityForm : f
            );
            await setDoc(applicationRef, { forms: updatedForms, lastUpdated: serverTimestamp() }, { merge: true });
          }
        } catch (error) {
          console.error('Eligibility screenshot upload failed:', error);
          toast({
            variant: 'destructive',
            title: 'Eligibility upload failed',
            description: 'Application was created, but eligibility screenshots failed to upload. You can upload them on the application details page.',
          });
        }
      }

      if (isKaiserAuthReceived && selectedAssignedStaffId) {
        try {
          const memberName = `${memberData.memberFirstName || ''} ${memberData.memberLastName || ''}`.trim() || 'Member';
          const memberMrn = String(memberData.memberMrn || '').trim() || '—';
          const memberDob = String(memberData.memberDob || '').trim() || '—';
          const memberCounty = String(memberData.memberCustomaryCounty || '').trim() || '—';
          const mcpName = 'Kaiser';
          const pathwayName = 'SNF Transition';
          const dueDate = new Date();
          dueDate.setHours(17, 0, 0, 0);
          const assignedByName = String(user?.displayName || user?.email || 'Manager').trim();
          await addDoc(collection(firestore, 'staff_notifications'), {
            userId: selectedAssignedStaffId,
            title: `Kaiser assignment: ${memberName}`,
            message:
              `You were assigned ${memberName} in Application Pathway. Please review and complete the next step.\n` +
              `MRN: ${memberMrn} • DOB: ${memberDob} • County: ${memberCounty}\n` +
              `MCP: ${mcpName} • Pathway: ${pathwayName}`,
            memberName,
            memberMrn: memberMrn === '—' ? null : memberMrn,
            memberDob: memberDob === '—' ? null : memberDob,
            county: memberCounty === '—' ? null : memberCounty,
            mcpName,
            pathway: pathwayName,
            healthPlan: 'Kaiser',
            type: 'assignment',
            priority: 'Priority',
            status: 'Open',
            isRead: false,
            requiresStaffAction: true,
            followUpRequired: true,
            followUpDate: dueDate.toISOString(),
            senderName: assignedByName,
            assignedByUid: String(user?.uid || '').trim() || null,
            assignedByName,
            actionUrl: `/admin/applications/${applicationId}`,
            applicationId,
            source: 'application-pathway',
            timestamp: serverTimestamp(),
          });
        } catch (error) {
          console.warn('Failed to create initial staff assignment notification:', error);
        }
      }

      if (!options?.suppressSuccessToast) {
        toast({
          title: "Application Created",
          description: isKaiserAuthReceived
            ? `Kaiser auth-received intake created for ${memberData.memberFirstName} ${memberData.memberLastName}.`
            : `Application created for ${memberData.memberFirstName} ${memberData.memberLastName}. Redirecting to CS Summary form.`,
        });
      }
      const memberName = `${memberData.memberFirstName || ''} ${memberData.memberLastName || ''}`.trim() || 'Member';
      setLastCreatedSkeleton({ applicationId, memberName });
      const shouldSkipNavigate = options?.skipNavigate ?? isKaiserAuthReceived;
      if (!shouldSkipNavigate) {
        if (isKaiserAuthReceived) {
          router.push(`/admin/applications/${applicationId}`);
        } else {
          // Redirect to CS Summary form with the application ID
          router.push(`/admin/applications/create/cs-summary?applicationId=${applicationId}`);
        }
      }
      return applicationId;
      
    } catch (error) {
      console.error('Error creating application:', error);
      toast({
        title: "Creation Error",
        description: "Failed to create application. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  const familyPortalContinueLink = useMemo(() => {
    if (!lastCreatedSkeleton?.applicationId) return '';
    return `https://connectcalaim.com/pathway?applicationId=${encodeURIComponent(lastCreatedSkeleton.applicationId)}`;
  }, [lastCreatedSkeleton?.applicationId]);

  const familyPortalSignInLink = useMemo(() => {
    if (!lastCreatedSkeleton?.applicationId) return '';
    return `https://connectcalaim.com/invite/continue?applicationId=${encodeURIComponent(lastCreatedSkeleton.applicationId)}`;
  }, [lastCreatedSkeleton?.applicationId]);

  const copyToClipboard = async (label: string, value: string) => {
    const text = String(value || '').trim();
    if (!text) {
      toast({ title: `${label} unavailable`, description: 'Create a skeleton application first.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied`, description: text });
    } catch {
      toast({ title: `Copy failed`, description: `Please copy manually: ${text}`, variant: 'destructive' });
    }
  };

  const sendFamilyInviteEmail = async () => {
    const applicationId = String(lastCreatedSkeleton?.applicationId || '').trim();
    if (!applicationId) {
      toast({ title: 'No skeleton application', description: 'Create a skeleton application first.' });
      return;
    }
    const fallbackEmail = String(memberData.contactEmail || '').trim();
    setIsSendingFamilyInviteEmail(true);
    try {
      const res = await fetch('/api/admin/send-cs-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          reminderType: 'email',
          overrideEmail: fallbackEmail || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to send invite email.');
      }
      toast({
        title: 'Invite email sent',
        description: `Family invite sent for application ${applicationId}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Invite email failed',
        description: String(error?.message || 'Unable to send family invite email.'),
        variant: 'destructive',
      });
    } finally {
      setIsSendingFamilyInviteEmail(false);
    }
  };

  const pushSingleAuthToCaspio = async (options?: { createSkeletonFirst?: boolean }) => {
    if (intakeType !== 'kaiser_auth_received_via_ils') {
      toast({
        title: 'Wrong intake type',
        description: 'Switch to Kaiser Auth Received (via ILS) to use single-auth push.',
        variant: 'destructive',
      });
      return;
    }
    if (!memberData.memberFirstName || !memberData.memberLastName) {
      toast({
        title: 'Missing member name',
        description: 'Parse the single auth PDF (or enter member first/last name) before pushing.',
        variant: 'destructive',
      });
      return;
    }
    if (!selectedAssignedStaffName && !selectedAssignedStaffId) {
      toast({
        title: 'Assign staff first',
        description: 'Select Kaiser staff before pushing this record to Caspio.',
        variant: 'destructive',
      });
      return;
    }

    setIsPushingSingleAuthToCaspio(true);
    try {
      let createdApplicationId: string | null = null;
      if (options?.createSkeletonFirst) {
        createdApplicationId = await createApplicationForMember({ skipNavigate: true, suppressSuccessToast: true });
        if (!createdApplicationId) {
          throw new Error('Could not create skeleton application before Caspio push.');
        }
      }
      const applicationData = {
        memberFirstName: memberData.memberFirstName || '',
        memberLastName: memberData.memberLastName || '',
        clientId2: '',
        memberMrn: memberData.memberMrn || '',
        memberAddress: memberData.memberCustomaryAddress || '',
        memberCounty: memberData.memberCustomaryCounty || '',
        memberDob: memberData.memberDob || '',
        memberPhone: memberData.memberPhone || '',
        Authorization_Number_T038: memberData.Authorization_Number_T038 || '',
        Authorization_Start_T2038: memberData.Authorization_Start_T2038 || '',
        Authorization_End_T2038: memberData.Authorization_End_T2038 || '',
        cptCode: '',
        Diagnostic_Code: memberData.Diagnostic_Code || '',
        kaiserStatus: 'Authorization Received (Doc Collection)',
        workflowStep: 'Needs First Contact',
        assignedStaffId: selectedAssignedStaffId || '',
        assignedStaffName: selectedAssignedStaffName || '',
        healthPlan: 'Kaiser',
      };
      const res = await fetch('/api/admin/caspio/push-cs-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationData,
          mapping: CASPIO_PUSH_MAPPING,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.details?.rawError || `Push failed (HTTP ${res.status})`);
      }
      const pushedClientId2 = String(data?.clientId2 || '').trim();
      if (firestore && createdApplicationId && pushedClientId2) {
        await setDoc(
          doc(firestore, 'applications', createdApplicationId),
          {
            clientId2: pushedClientId2,
            client_ID2: pushedClientId2,
            caspioClientId2: pushedClientId2,
            caspioSent: true,
            caspioSentDate: serverTimestamp(),
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );
      }
      toast({
        title: 'Single auth pushed to Caspio',
        description: createdApplicationId
          ? `Created skeleton ${createdApplicationId} and pushed this member to Caspio.`
          : 'Successfully pushed this single-auth intake to Caspio.',
      });
      if (createdApplicationId) {
        router.push(`/admin/applications/${createdApplicationId}`);
      }
    } catch (error: any) {
      toast({
        title: 'Single auth push failed',
        description: String(error?.message || 'Unable to push single-auth intake to Caspio.'),
        variant: 'destructive',
      });
    } finally {
      setIsPushingSingleAuthToCaspio(false);
    }
  };

  const isFormValid = memberData.memberFirstName && 
                     memberData.memberLastName && (
                       intakeType === 'kaiser_auth_received_via_ils'
                         ? true
                         : Boolean(
                             memberData.contactFirstName &&
                             memberData.contactLastName &&
                             memberData.contactPhone &&
                             memberData.contactPhone.replace(/\D/g, '').length === 10
                           )
                     );

  const hasUnsavedChanges = useMemo(() => {
    const memberDefaults = getEmptyMemberData();
    const normalizedMemberData = Object.keys(memberDefaults).reduce<Record<string, string>>((acc, key) => {
      acc[key] = String((memberData as any)?.[key] || '');
      return acc;
    }, {});
    const baseMemberData = Object.keys(memberDefaults).reduce<Record<string, string>>((acc, key) => {
      acc[key] = String((memberDefaults as any)?.[key] || '');
      return acc;
    }, {});

    const currentSnapshot = JSON.stringify({
      intakeType,
      memberData: normalizedMemberData,
      selectedAssignedStaffId: String(selectedAssignedStaffId || ''),
      selectedAssignedStaffName: String(selectedAssignedStaffName || ''),
      eligibilityScreenshotCount: eligibilityScreenshotFiles.length,
      serviceRequestFileName: serviceRequestFile?.name || '',
    });
    const initialSnapshot = JSON.stringify({
      intakeType: 'standard',
      memberData: baseMemberData,
      selectedAssignedStaffId: '',
      selectedAssignedStaffName: '',
      eligibilityScreenshotCount: 0,
      serviceRequestFileName: '',
    });
    return currentSnapshot !== initialSnapshot;
  }, [
    intakeType,
    memberData,
    selectedAssignedStaffId,
    selectedAssignedStaffName,
    eligibilityScreenshotFiles.length,
    serviceRequestFile?.name,
  ]);

  useEffect(() => {
    if (!hasUnsavedChanges || isCreating) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges, isCreating]);

  useEffect(() => {
    createApplicationRef.current = createApplicationForMember;
  }, [createApplicationForMember]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
      if (!isSaveShortcut) return;
      event.preventDefault();
      if (isCreating) return;
      if (!isFormValid) {
        toast({
          title: 'Missing Information',
          description: 'Fill required fields before creating the application.',
          variant: 'destructive',
        });
        return;
      }
      void createApplicationRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCreating, isFormValid, toast]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Button variant="outline" asChild>
          <Link href="/admin/applications">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Applications
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Create Application for Member</h1>
        <p className="text-gray-600 mt-2">
          Create a CS Summary application on behalf of a member/family. This is for families who need assistance completing their application or don&apos;t have email access.
        </p>
      </div>

      {/* Information Alert */}
      <Alert className="mb-6">
        <Users className="h-4 w-4" />
        <AlertDescription>
          <strong>Admin Application Creation:</strong> Use this form when families request help completing their CalAIM application. 
          You&apos;ll provide basic member and contact information, then complete the full CS Summary form on their behalf.
        </AlertDescription>
      </Alert>

      {/* Member & Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="mr-2 h-5 w-5" />
            Member & Contact Information
          </CardTitle>
          <CardDescription>
            Provide basic information about the member and the primary contact person (family member, caregiver, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label>Intake Type</Label>
            <div className="mt-2 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant={intakeType === 'standard' ? 'default' : 'outline'}
                onClick={() => setIntakeType('standard')}
                className="justify-start"
              >
                Standard CS Summary Intake
              </Button>
              <Button
                type="button"
                variant={intakeType === 'kaiser_auth_received_via_ils' ? 'default' : 'outline'}
                onClick={() => setIntakeType('kaiser_auth_received_via_ils')}
                className="justify-start"
              >
                Kaiser Auth Received (via ILS)
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Kaiser Auth Received creates an early tracking application with authorization already received and supports staff assignment, task notifications, and optional early Caspio push for client ID tracking.
            </p>
            {intakeType === 'kaiser_auth_received_via_ils' && (
              <p className="text-xs text-muted-foreground mt-1">
                Name-only intake is supported for spreadsheet workflows. You can assign staff now and complete MRN, auth dates, diagnostics, and eligibility uploads later.
              </p>
            )}
          </div>

          {/* Member Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Member Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="memberFirstName">Member First Name *</Label>
                <Input
                  id="memberFirstName"
                  value={memberData.memberFirstName || ''}
                  onChange={(e) => setMemberData({ ...memberData, memberFirstName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="memberLastName">Member Last Name *</Label>
                <Input
                  id="memberLastName"
                  value={memberData.memberLastName || ''}
                  onChange={(e) => setMemberData({ ...memberData, memberLastName: e.target.value })}
                />
              </div>
            </div>
            {intakeType === 'kaiser_auth_received_via_ils' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="md:col-span-2 p-3 border rounded-md bg-muted/30 space-y-3">
                  <div>
                    <Label>Assign Kaiser Staff (optional)</Label>
                    <Select
                      value={selectedAssignedStaffId}
                      onValueChange={(value) => {
                        const selected = kaiserStaffList.find((s) => s.uid === value);
                        setSelectedAssignedStaffId(value);
                        setSelectedAssignedStaffName(selected?.displayName || '');
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={isLoadingKaiserStaff ? 'Loading Kaiser staff...' : 'Select Kaiser staff'} />
                      </SelectTrigger>
                      <SelectContent>
                        {kaiserStaffList.length === 0 ? (
                          <SelectItem value="none" disabled>No Kaiser staff found</SelectItem>
                        ) : (
                          kaiserStaffList.map((staff) => (
                            <SelectItem key={staff.uid} value={staff.uid}>
                              {staff.displayName}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedAssignedStaffId && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Bell className="h-3.5 w-3.5" />
                      Current open action items for this staff: <span className="font-semibold">{selectedStaffActionItemCount}</span>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    If selected on create, this assignment is added to the staff member&apos;s Action Items (bell) and daily task calendar. You can also assign staff later.
                  </div>
                </div>
                <div className="md:col-span-2 p-3 border rounded-md bg-indigo-50/40 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">Kaiser (ILS) Spreadsheet Parser</div>
                      <div className="text-xs text-muted-foreground">
                        Upload an Excel file from Kaiser ILS or a single authorization-sheet PDF to parse fields, create application records, assign staff, and push to Caspio.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={ilsSpreadsheetInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                        className="hidden"
                        onChange={(e) => {
                          const picked = e.target.files?.[0];
                          if (picked) void parseIlsSpreadsheetFile(picked);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => ilsSpreadsheetInputRef.current?.click()}
                        disabled={isParsingIlsSpreadsheet}
                      >
                        {isParsingIlsSpreadsheet ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {isParsingIlsSpreadsheet ? 'Parsing spreadsheet...' : 'Upload ILS Spreadsheet'}
                      </Button>
                      <Button type="button" variant="outline" onClick={applyStaffToSelectedIlsRows} disabled={selectedIlsRows.length === 0}>
                        Assign Staff to Selected
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={clearIlsSpreadsheetImport}
                        disabled={isParsingIlsSpreadsheet || (ilsImportRows.length === 0 && !ilsSpreadsheetFileName)}
                      >
                        Delete Spreadsheet Upload
                      </Button>
                      <Button type="button" variant="outline" onClick={createIlsSkeletonApplications} disabled={isCreatingIlsRecords || selectedIlsRows.length === 0}>
                        {isCreatingIlsRecords ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Create Selected Records
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={deleteCreatedIlsRecords}
                        disabled={isDeletingCreatedIlsRecords || selectedCreatedIlsRows.length === 0}
                      >
                        {isDeletingCreatedIlsRecords ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Delete Created Records
                      </Button>
                      <Button type="button" onClick={pushSelectedIlsRowsToCaspio} disabled={isPushingIlsRows || selectedIlsRows.length === 0}>
                        {isPushingIlsRows ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Push Selected to Caspio
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md border bg-white/80 p-2 space-y-2">
                    <div className="text-xs font-medium">Single authorization sheet PDF parser</div>
                    <input
                      ref={serviceRequestFileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const selected = e.target.files?.[0] || null;
                        setServiceRequestFile(selected);
                        setServiceRequestParsedFields([]);
                        setServiceRequestWarnings([]);
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => serviceRequestFileInputRef.current?.click()}
                        disabled={isParsingServiceRequest}
                      >
                        Upload Single Auth PDF
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={parseServiceRequestPdfAndApply}
                        disabled={!serviceRequestFile || isParsingServiceRequest}
                      >
                        {isParsingServiceRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                        {isParsingServiceRequest ? 'Parsing...' : 'Parse Single Auth PDF'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void createApplicationForMember()}
                        disabled={isCreating || !isFormValid}
                      >
                        {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Create Single Auth Skeleton
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void pushSingleAuthToCaspio({ createSkeletonFirst: true })}
                        disabled={isPushingSingleAuthToCaspio || isCreating}
                      >
                        {isPushingSingleAuthToCaspio ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Create + Push Single Auth
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={clearServiceRequestFile}
                        disabled={!serviceRequestFile || isParsingServiceRequest}
                      >
                        Delete Single Auth PDF
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Spreadsheet file: {ilsSpreadsheetFileName || 'None'} • Single auth PDF: {serviceRequestFile?.name || 'None'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Single-auth flow: Parse PDF -> Create skeleton -> Create + Push to Caspio.
                    </div>
                    {serviceRequestParsedFields.length > 0 ? (
                      <div className="text-xs text-green-700">
                        Parsed via PDF: {serviceRequestParsedFields.join(', ')}
                      </div>
                    ) : null}
                    {serviceRequestWarnings.length > 0 ? (
                      <div className="text-xs text-amber-700">
                        {serviceRequestWarnings.join(' ')}
                      </div>
                    ) : null}
                    {lastCreatedSkeleton ? (
                      <div className="rounded-md border bg-emerald-50/60 p-2 space-y-2">
                        <div className="text-xs font-medium">
                          Skeleton created: <span className="font-semibold">{lastCreatedSkeleton.applicationId}</span> ({lastCreatedSkeleton.memberName})
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Share these links with family so they can sign in, continue the application, and upload required documents.
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Primary contact email: {memberData.contactEmail || 'Not entered yet'}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void copyToClipboard('Portal sign-in link', familyPortalSignInLink)}
                          >
                            Copy Sign-in Link
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void copyToClipboard('Portal continue link', familyPortalContinueLink)}
                          >
                            Copy Continue Link
                          </Button>
                          <Button type="button" size="sm" asChild>
                            <Link href={`/admin/applications/${lastCreatedSkeleton.applicationId}`}>
                              Open Created Skeleton
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void sendFamilyInviteEmail()}
                            disabled={isSendingFamilyInviteEmail}
                          >
                            {isSendingFamilyInviteEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Send Family Invite Email
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Selected rows: {selectedIlsRows.length} / {ilsImportRows.length}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created records in selection: {selectedCreatedIlsRows.length}
                  </div>
                  {ilsImportRows.length > 0 && !quickViewIlsRow ? (
                    <div className="text-xs text-muted-foreground">
                      Click <span className="font-medium">Quick View</span> on any row to preview its full Caspio field mapping.
                    </div>
                  ) : null}
                  {caspioFieldPreview.length > 0 ? (
                    <div className="rounded border bg-white p-2">
                      <div className="text-xs font-medium mb-1">
                        Caspio field match preview (quick view)
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        {quickViewIlsRow
                          ? `${quickViewIlsRow.memberLastName}, ${quickViewIlsRow.memberFirstName} • Auth ${quickViewIlsRow.authorizationNumberT2038 || '—'}`
                          : 'No row selected'}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                        {caspioFieldPreview.map((item) => (
                          <div key={`${item.source}-${item.caspioField}`} className="flex items-start gap-2 rounded border px-2 py-1">
                            <div className="min-w-[130px] font-medium">{item.caspioField}</div>
                            <div className="text-muted-foreground">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {ilsImportRows.length > 0 ? (
                    <div className="overflow-auto rounded border bg-white">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50">
                          <tr className="text-left">
                            <th className="px-2 py-1.5">Pick / Quick View</th>
                            <th className="px-2 py-1.5">Member</th>
                            <th className="px-2 py-1.5">Auth #</th>
                            <th className="px-2 py-1.5">Start</th>
                            <th className="px-2 py-1.5">End</th>
                            <th className="px-2 py-1.5">Assigned Staff</th>
                            <th className="px-2 py-1.5">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ilsImportRows.map((row) => (
                            <tr key={row.rowId} className="border-t">
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={Boolean(ilsImportSelected[row.rowId])}
                                    onCheckedChange={(checked) =>
                                      setIlsImportSelected((prev) => ({ ...prev, [row.rowId]: Boolean(checked) }))
                                    }
                                  />
                                  <Button
                                    type="button"
                                    variant={quickViewIlsRowId === row.rowId ? 'default' : 'outline'}
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => setQuickViewIlsRowId(row.rowId)}
                                  >
                                    Quick View
                                  </Button>
                                </div>
                              </td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{`${row.memberLastName}, ${row.memberFirstName}`}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{row.authorizationNumberT2038 || '—'}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{row.authorizationStartT2038 || '—'}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{row.authorizationEndT2038 || '—'}</td>
                              <td className="px-2 py-1.5 min-w-[220px]">
                                <Select
                                  value={row.assignedStaffId || 'unassigned'}
                                  onValueChange={(value) => {
                                    const nextId = value === 'unassigned' ? '' : value;
                                    const staff = kaiserStaffList.find((s) => s.uid === nextId);
                                    setIlsImportRows((prev) =>
                                      prev.map((r) =>
                                        r.rowId === row.rowId
                                          ? { ...r, assignedStaffId: nextId, assignedStaffName: staff?.displayName || '' }
                                          : r
                                      )
                                    );
                                  }}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Assign Kaiser staff" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    {kaiserStaffList.length === 0 ? (
                                      <SelectItem value="none" disabled>No Kaiser staff found</SelectItem>
                                    ) : (
                                      kaiserStaffList.map((staff) => (
                                        <SelectItem key={`${row.rowId}-${staff.uid}`} value={staff.uid}>
                                          {staff.displayName}
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-2 py-1.5">
                                {row.statusNote || [row.createStatus, row.pushStatus, row.deleteStatus].filter((x) => x !== 'idle').join(' • ') || 'Ready'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor="memberMrn">Member MRN</Label>
                  <Input
                    id="memberMrn"
                    value={memberData.memberMrn || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberMrn: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberPhone">Member Phone</Label>
                  <Input
                    id="memberPhone"
                    type="tel"
                    value={memberData.memberPhone || ''}
                    onChange={(e) => {
                      const formattedPhone = formatMemberPhoneWithDashes(e.target.value);
                      setMemberData({ ...memberData, memberPhone: formattedPhone });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="memberDob">Member DOB</Label>
                  <Input
                    id="memberDob"
                    placeholder="MM/DD/YYYY"
                    value={memberData.memberDob || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberDob: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Use MM/DD/YYYY format (example: 01/31/1940).</p>
                </div>
                <div>
                  <Label htmlFor="memberCustomaryLocation">Member Customary Location Type</Label>
                  <Input
                    id="memberCustomaryLocation"
                    value={memberData.memberCustomaryLocation || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryLocation: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="memberCustomaryAddress">Member Customary Street Address</Label>
                  <Input
                    id="memberCustomaryAddress"
                    value={memberData.memberCustomaryAddress || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryAddress: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryCity">Member Customary City</Label>
                  <Input
                    id="memberCustomaryCity"
                    value={memberData.memberCustomaryCity || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryCity: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryState">Member Customary State</Label>
                  <Input
                    id="memberCustomaryState"
                    value={memberData.memberCustomaryState || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryState: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryZip">Member Customary ZIP</Label>
                  <Input
                    id="memberCustomaryZip"
                    value={memberData.memberCustomaryZip || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryZip: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryCounty">Member Customary County</Label>
                  <Input
                    id="memberCustomaryCounty"
                    value={memberData.memberCustomaryCounty || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryCounty: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="Authorization_Number_T038">Authorization Number T2038</Label>
                  <Input
                    id="Authorization_Number_T038"
                    value={memberData.Authorization_Number_T038 || ''}
                    onChange={(e) => setMemberData({ ...memberData, Authorization_Number_T038: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="Diagnostic_Code">Diagnostic Code</Label>
                  <Input
                    id="Diagnostic_Code"
                    value={memberData.Diagnostic_Code || ''}
                    onChange={(e) => setMemberData({ ...memberData, Diagnostic_Code: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="Authorization_Start_T2038">Authorization Start T2038</Label>
                  <Input
                    id="Authorization_Start_T2038"
                    type="date"
                    value={toDateInputValue(memberData.Authorization_Start_T2038)}
                    onChange={(e) => setMemberData({ ...memberData, Authorization_Start_T2038: toMmDdYyyy(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="Authorization_End_T2038">Authorization End T2038</Label>
                  <Input
                    id="Authorization_End_T2038"
                    type="date"
                    value={toDateInputValue(memberData.Authorization_End_T2038)}
                    onChange={(e) => setMemberData({ ...memberData, Authorization_End_T2038: toMmDdYyyy(e.target.value) })}
                  />
                </div>
                <div className="md:col-span-2 p-3 border rounded-md bg-muted/20">
                  <Label htmlFor="eligibilityScreenshots">Eligibility Check Screenshots (optional, multiple pages)</Label>
                  <Input
                    id="eligibilityScreenshots"
                    type="file"
                    multiple
                    accept=".png,.jpg,.jpeg,.webp,.pdf"
                    className="mt-2"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setEligibilityScreenshotFiles(files);
                    }}
                  />
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                    <Upload className="h-3.5 w-3.5" />
                    {eligibilityScreenshotFiles.length > 0
                      ? `${eligibilityScreenshotFiles.length} file(s) selected`
                      : 'Upload one or more screenshot pages.'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Contact Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Primary Contact Person</h3>
            <p className="text-sm text-gray-600 mb-3">
              This is the person helping with the application (family member, caregiver, case worker, etc.)
            </p>
            {intakeType === 'kaiser_auth_received_via_ils' && (
              <Alert className="mb-3">
                <AlertDescription>
                  Contact person can be added later. Once available, add contact info so document and status reminders can be sent.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contactFirstName">Contact First Name{intakeType === 'standard' ? ' *' : ''}</Label>
                <Input
                  id="contactFirstName"
                  value={memberData.contactFirstName || ''}
                  onChange={(e) => setMemberData({ ...memberData, contactFirstName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contactLastName">Contact Last Name{intakeType === 'standard' ? ' *' : ''}</Label>
                <Input
                  id="contactLastName"
                  value={memberData.contactLastName || ''}
                  onChange={(e) => setMemberData({ ...memberData, contactLastName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contactPhone">Contact Phone{intakeType === 'standard' ? ' *' : ''}</Label>
                <Input
                  id="contactPhone"
                  type="tel"
                  value={memberData.contactPhone || ''}
                  onChange={handlePhoneChange}
                />
              </div>
              <div>
                <Label htmlFor="contactRelationship">Relationship to Member</Label>
                <Input
                  id="contactRelationship"
                  value={memberData.contactRelationship || ''}
                  onChange={(e) => setMemberData({ ...memberData, contactRelationship: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="contactEmail">Contact Email (Optional)</Label>
                <Input
                  id="contactEmail"
                  type="text"
                  inputMode="email"
                  value={memberData.contactEmail || ''}
                  onChange={(e) => setMemberData({ ...memberData, contactEmail: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">If no email, enter &quot;N/A&quot;.</p>
              </div>
            </div>
          </div>

          {/* Admin Notes */}
          <div>
            <Label htmlFor="notes">Admin Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={memberData.notes || ''}
              onChange={(e) => setMemberData({ ...memberData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <div className="sticky bottom-3 z-20 space-y-2 rounded-lg border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/90">
            <Button 
              onClick={createApplicationForMember}
              disabled={isCreating || !isFormValid}
              className="w-full"
              size="lg"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Application...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  {intakeType === 'kaiser_auth_received_via_ils'
                    ? 'Create Kaiser Skeleton Application'
                    : 'Create Application & Continue to CS Summary Form'}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={resetAllCreateFields}
              disabled={isCreating}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Form (Start Over)
            </Button>
            <p className="text-center text-xs text-muted-foreground">Shortcut: Ctrl/Cmd + S to create application</p>
          </div>

          {!isFormValid && (
            <div className="text-sm text-gray-500 text-center space-y-1">
              <p>Please fill in all required fields (marked with *) for the selected intake type.</p>
              {intakeType === 'standard' && memberData.contactPhone && memberData.contactPhone.replace(/\D/g, '').length < 10 && (
                <p className="text-red-500">Contact phone number must be 10 digits (xxx.xxx.xxxx)</p>
              )}
              {intakeType === 'kaiser_auth_received_via_ils' && memberData.memberPhone && memberData.memberPhone.replace(/\D/g, '').length > 0 && memberData.memberPhone.replace(/\D/g, '').length < 10 && (
                <p className="text-red-500">Member phone number must be 10 digits (xxx.xxx.xxxx)</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}