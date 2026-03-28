'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Bell, FileText, Loader2, RotateCcw, Upload, Users } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

export default function CreateApplicationPage() {
  const router = useRouter();
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
  const [serviceRequestParseMode, setServiceRequestParseMode] = useState<'none' | 'text' | 'vision'>('none');
  const [serviceRequestTextPreview, setServiceRequestTextPreview] = useState('');
  const serviceRequestFileInputRef = useRef<HTMLInputElement | null>(null);
  const [memberData, setMemberData] = useState(getEmptyMemberData);

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
        // No text layer - use vision API
        toast({
          title: 'Scanned PDF detected',
          description: 'Using AI vision to extract fields...',
          variant: 'default',
        });

        const formData = new FormData();
        formData.append('pdf', serviceRequestFile);

        const response = await fetch('/api/admin/parse-service-request-vision', {
          method: 'POST',
          body: formData,
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
    if (serviceRequestFileInputRef.current) {
      serviceRequestFileInputRef.current.value = '';
    }
    toast({
      title: 'Form reset',
      description: 'All entered fields were cleared so you can start over.',
    });
  };

  const createApplicationForMember = async () => {
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
      return;
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
          const dueDate = new Date();
          dueDate.setHours(17, 0, 0, 0);
          const assignedByName = String(user?.displayName || user?.email || 'Manager').trim();
          await addDoc(collection(firestore, 'staff_notifications'), {
            userId: selectedAssignedStaffId,
            title: `Kaiser assignment: ${memberName}`,
            message: `You were assigned ${memberName} in Application Pathway. Please review and complete the next step.`,
            memberName,
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

      toast({
        title: "Application Created",
        description: isKaiserAuthReceived
          ? `Kaiser auth-received intake created for ${memberData.memberFirstName} ${memberData.memberLastName}.`
          : `Application created for ${memberData.memberFirstName} ${memberData.memberLastName}. Redirecting to CS Summary form.`,
      });

      if (isKaiserAuthReceived) {
        router.push(`/admin/applications/${applicationId}`);
      } else {
        // Redirect to CS Summary form with the application ID
        router.push(`/admin/applications/create/cs-summary?applicationId=${applicationId}`);
      }
      
    } catch (error) {
      console.error('Error creating application:', error);
      toast({
        title: "Creation Error",
        description: "Failed to create application. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
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
          Create a CS Summary application on behalf of a member/family. This is for families who need assistance completing their application or don't have email access.
        </p>
      </div>

      {/* Information Alert */}
      <Alert className="mb-6">
        <Users className="h-4 w-4" />
        <AlertDescription>
          <strong>Admin Application Creation:</strong> Use this form when families request help completing their CalAIM application. 
          You'll provide basic member and contact information, then complete the full CS Summary form on their behalf.
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
                    value={memberData.memberDob || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberDob: e.target.value })}
                  />
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
                <div className="md:col-span-2 p-3 border rounded-md bg-blue-50/60">
                  <Label htmlFor="serviceRequestPdf">Service Request Form (Kaiser PDF)</Label>
                  <Input
                    id="serviceRequestPdf"
                    ref={serviceRequestFileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="mt-2"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] || null;
                      setServiceRequestFile(selected);
                      setServiceRequestParsedFields([]);
                      setServiceRequestWarnings([]);
                    }}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={parseServiceRequestPdfAndApply}
                      disabled={!serviceRequestFile || isParsingServiceRequest}
                    >
                      {isParsingServiceRequest ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Parsing PDF...
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Parse PDF & Autofill
                        </>
                      )}
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      {serviceRequestFile ? `Selected: ${serviceRequestFile.name}` : 'Upload Kaiser Service Request Form PDF'}
                    </div>
                    {serviceRequestFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearServiceRequestFile}
                        disabled={isParsingServiceRequest}
                      >
                        Remove file
                      </Button>
                    )}
                  </div>
                  {serviceRequestParsedFields.length > 0 && (
                    <div className="text-xs text-green-700 mt-2">
                      Parsed via text: {serviceRequestParsedFields.join(', ')}
                    </div>
                  )}
                  {serviceRequestWarnings.length > 0 && (
                    <div className="text-xs text-amber-700 mt-2">
                      {serviceRequestWarnings.join(' ')}
                    </div>
                  )}
                  {serviceRequestTextPreview && (
                    <div className="mt-3 rounded-md border bg-muted/20 p-3">
                      <div className="text-xs font-medium mb-2">
                        Extracted Text Preview (troubleshooting, first ~8k chars)
                      </div>
                      <pre className="text-xs whitespace-pre-wrap break-words max-h-56 overflow-auto">
                        {serviceRequestTextPreview}
                      </pre>
                    </div>
                  )}
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
                  type="email"
                  value={memberData.contactEmail || ''}
                  onChange={(e) => setMemberData({ ...memberData, contactEmail: e.target.value })}
                />
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