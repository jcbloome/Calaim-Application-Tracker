'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Bell, Database, FileText, Loader2, RotateCcw, Search, Trash2, Upload, Users } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ToastAction } from '@/components/ui/toast';
import { findCountyByCity, findCountyByCityAndZip, findCountyByZip } from '@/lib/california-cities';
import { extractIdentitySignals, identityTokenLookupKeys } from '@/lib/member-identity';
import {
  annotateIdentityRowsAgainstMasterMembers,
  buildIlsMifDedupeKey,
  ILS_MIF_AUDIT_COLLECTION,
  ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
  ILS_MIF_CONSOLIDATOR_HANDOFF_KEY,
  ILS_MIF_DECLINED_COLLECTION,
  ILS_MIF_MASTER_COLLECTION,
  ILS_MIF_REMOVED_COLLECTION,
  ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
  ILS_MIF_UPLOADED_FILES_COLLECTION,
  type IlsMifConsolidationRunRecord,
  type IlsMifMasterRow,
  type IlsMifUploadedFileRecord,
} from '@/lib/ils-mif-parse';
import {
  excludeIlsMifMemberFromCreateApp,
  findExistingApplicationsForMember,
  loadCreateAppExcludedDedupeKeys,
  loadExistingApplicationIdentityIndex,
  markIlsMifMemberPushedToCaspio,
  markIlsMifMemberSkeletonCreated,
  matchIdentityToExistingApplications,
  resolveIlsMifDedupeKey,
} from '@/lib/ils-mif-consolidator-sync';
import { MIF_SERVICE_DELIVERY_LAYOUT_VERSION, uploadMifServiceDeliveryForm } from '@/lib/mif-service-delivery-form';
import {
  ILS_DECISION_CUSTOM_TEXT_MAX,
  ILS_DECISION_RECIPIENTS,
  ILS_DECISION_SIGNATURE_LINES,
  buildIlsDecisionNarrative,
  buildIlsDecisionSubject,
  type IlsDecisionChoice,
} from '@/lib/ils-decision-email';

let pdfJsLoaderPromise: Promise<any> | null = null;
const loadPdfJs = async () => {
  if (pdfJsLoaderPromise) return pdfJsLoaderPromise;
  pdfJsLoaderPromise = (async () => {
    let pdfjs: any = null;
    // Prefer local package so parse does not depend on CDN reachability.
    try {
      const mod: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs = mod?.getDocument ? mod : mod?.default || mod;
    } catch (localError) {
      console.warn('Local pdfjs-dist load failed, trying CDN fallback:', localError);
      try {
        const mod: any = await import(
          /* webpackIgnore: true */
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.min.mjs'
        );
        pdfjs = mod?.getDocument ? mod : mod?.default || mod;
      } catch (cdnError) {
        const localMsg = String((localError as any)?.message || localError || 'local import failed');
        const cdnMsg = String((cdnError as any)?.message || cdnError || 'cdn import failed');
        throw new Error(
          `Could not load PDF parser (${localMsg}; CDN: ${cdnMsg}). Check network/firewall and retry.`
        );
      }
    }

    try {
      if (pdfjs?.GlobalWorkerOptions) {
        // Parsing uses disableWorker: true; still set a valid workerSrc for pdf.js internals.
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.worker.min.mjs';
      }
    } catch {
      // no-op
    }
    return pdfjs;
  })().catch((error) => {
    // Allow retry on next parse click after a failed load.
    pdfJsLoaderPromise = null;
    throw error;
  });
  return pdfJsLoaderPromise;
};

type IlsDecisionLogState = {
  choice: IlsDecisionChoice;
  sentAtIso: string;
  sentBy: string;
  logId: string;
};
type IlsDecisionPreviewDraft = {
  rowId: string;
  choice: IlsDecisionChoice;
  memberName: string;
  memberMrn: string;
  memberCounty: string;
  memberClientId: string;
  recipients: string[];
  subject: string;
  customText: string;
  idempotencyKey: string;
};
type IlsDecisionEmailParts = {
  decisionText: string;
  customText: string;
  memberLines: string[];
  signatureLines: string[];
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

const TRAILING_NON_NAME_TOKENS = new Set([
  'mrn',
  'cin',
  'plan',
  'id',
  'member',
  'name',
  'dob',
  'age',
  'phone',
  'email',
  'snp',
  'hmo',
  'ppo',
  'epo',
  'pos',
  'mmp',
  'dsnp',
  'd-snp',
  'planid',
]);

const stripTrailingNonNameTokens = (rawLastName: unknown) => {
  const tokens = String(rawLastName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 0) {
    const token = String(tokens[tokens.length - 1] || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
    if (!TRAILING_NON_NAME_TOKENS.has(token)) break;
    tokens.pop();
  }
  return tokens.join(' ').trim();
};

const sanitizeParsedName = (name: { firstName: string; lastName: string }) => {
  const blockedTokens = new Set([
    'mrn',
    'cin',
    'plan',
    'id',
    'member',
    'name',
    'dob',
    'age',
    'phone',
    'email',
  ]);
  const first = String(name.firstName || '').trim();
  const last = stripTrailingNonNameTokens(name.lastName);
  if (!first) return { firstName: '', lastName: '' };
  if (blockedTokens.has(first.toLowerCase())) return { firstName: '', lastName: '' };
  if (blockedTokens.has(last.toLowerCase())) return { firstName: first, lastName: '' };
  return { firstName: first, lastName: last };
};

const extractNameFromFileName = (rawFileName: unknown) => {
  const fileBase = String(rawFileName || '').replace(/\.pdf$/i, '').trim();
  if (!fileBase) return '';
  const noDatePrefix = fileBase.replace(/^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\s+/, '');
  const candidate = noDatePrefix.split('-')[0].replace(/\(.*?\)/g, '').trim();
  if (!candidate) return '';

  const noiseTokens = new Set([
    'nft',
    'cc',
    'auth',
    'authorization',
    'sheet',
    'single',
    'ils',
    'kaiser',
    'received',
    'via',
  ]);

  const tokens = candidate
    .replace(/[_]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z'-]/g, '').trim())
    .filter((token) => token.length > 1)
    .filter((token) => !noiseTokens.has(token.toLowerCase()));

  if (tokens.length >= 2) return `${tokens[0]} ${tokens[1]}`;
  if (tokens.length === 1) return tokens[0];
  return '';
};

const ADDRESS_DIRECTIONALS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  po: 'PO',
  'p.o': 'P.O.',
  'p.o.': 'P.O.',
  apt: 'Apt',
  'apt.': 'Apt.',
  ste: 'Ste',
  'ste.': 'Ste.',
  unit: 'Unit',
  box: 'Box',
};

const toNameCasePart = (part: string) => {
  if (!part) return part;
  const key = part.toLowerCase();
  if (ADDRESS_ABBREVIATIONS[key]) return ADDRESS_ABBREVIATIONS[key];
  if (ADDRESS_DIRECTIONALS.has(key)) return part.toUpperCase();
  if (/^\d+[A-Za-z]?$/.test(part)) return part.toUpperCase();
  let seenLetter = false;
  return part
    .split('')
    .map((ch) => {
      if (!/[A-Za-z]/.test(ch)) return ch;
      if (!seenLetter) {
        seenLetter = true;
        return ch.toUpperCase();
      }
      return ch.toLowerCase();
    })
    .join('');
};

const toNameCase = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => token.split(/([-/'])/).map(toNameCasePart).join(''))
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

const normalizePhoneDigits = (rawValue: unknown) => {
  const digits = String(rawValue || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length >= 10) return digits.slice(0, 10);
  return digits;
};

const formatPhoneDashed = (rawValue: unknown) => {
  const digits = normalizePhoneDigits(rawValue);
  if (digits.length !== 10) return String(rawValue || '').trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const normalizeMediCalNumber = (rawValue: unknown) =>
  String(rawValue || '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

const normalizeMemberSex = (rawValue: unknown) => {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value) return '';
  if (['f', 'female', 'woman', 'girl'].includes(value)) return 'F';
  if (['m', 'male', 'man', 'boy'].includes(value)) return 'M';
  return '';
};

const ADDRESS_PHONE_PATTERN =
  /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b\d{10}\b/;

const stripContactInfoFromAddressLine = (rawValue: unknown) => {
  let value = String(rawValue || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  value = value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ');
  value = value.replace(/\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/g, ' ');
  value = value.replace(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, ' ');
  value = value.replace(/\b\d{10}\b/g, ' ');
  value = value.replace(/\s{2,}/g, ' ').trim();
  return value.replace(/[,\s]+$/g, '').trim();
};

/** Keep address text when a phone sits on the same OCR/PDF line. */
const takeAddressPortionFromMixedLine = (rawValue: unknown) => {
  const raw = String(rawValue || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const phoneMatch = raw.match(ADDRESS_PHONE_PATTERN);
  if (phoneMatch && typeof phoneMatch.index === 'number') {
    const beforePhone = raw.slice(0, phoneMatch.index).replace(/[,\s|/]+$/g, '').trim();
    if (beforePhone.length >= 5) return stripContactInfoFromAddressLine(beforePhone);
  }
  return stripContactInfoFromAddressLine(raw);
};

const looksLikeStreetAddressLine = (value: string) =>
  /\d/.test(value) ||
  /\b(?:st|street|ave|avenue|dr|drive|rd|road|ln|lane|blvd|boulevard|ct|court|way|pl|place|hwy|highway|apt|unit)\b/i.test(
    value
  );

const isStateZipOnlyLine = (value: string) =>
  /^[A-Za-z]{2}\s+\d{5}(?:-\d{4})?$/.test(String(value || '').trim());

const extractPhonesFromLines = (lines: string[]) => {
  const phonePattern = /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b\d{10}\b/g;
  const stopLinePattern = /\b(?:population\s*of\s*focus|provider|authorization|care\s*manager|special\s*instructions|page\s+\d+\s+of)\b/i;
  const numbers: string[] = [];

  const pushMatches = (line: string) => {
    const matches = String(line || '').match(phonePattern) || [];
    matches.forEach((m) => {
      const normalized = normalizePhoneDigits(m);
      if (normalized.length === 10) numbers.push(normalized);
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    if (!/(?:member|patient)\s*phone|cell\s*phone|mobile\s*phone/i.test(line)) continue;

    pushMatches(line);
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      const next = String(lines[j] || '').replace(/\s+/g, ' ').trim();
      if (!next) continue;
      if (stopLinePattern.test(next)) break;
      pushMatches(next);
    }
    if (numbers.length > 0) break;
  }

  return {
    memberPhone: numbers[0] || '',
    cellPhone: numbers[1] || numbers[0] || '',
  };
};

const extractCareManagerFromLines = (lines: string[], flattened: string) => {
  const phonePattern = /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b\d{10}\b/g;
  const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
  const stopLinePattern =
    /\b(?:authorization|special\s*instructions|provider|member\s*information|page\s+\d+\s+of|contact\s*person)\b/i;

  let careManagerName = '';
  let careManagerPhone = '';
  let careManagerEmail = '';

  const inlinePhoneMatch = flattened.match(
    /care\s*manager[\s\S]{0,180}?((?:\(\d{3}\)\s*\d{3}[-.\s]?\d{4})|(?:\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b)|(?:\b\d{10}\b))/i
  );
  if (inlinePhoneMatch?.[1]) {
    const normalized = normalizePhoneDigits(inlinePhoneMatch[1]);
    if (normalized.length === 10) careManagerPhone = formatPhoneDashed(normalized);
  }
  const inlineEmailMatch = flattened.match(/care\s*manager[\s\S]{0,180}?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  if (inlineEmailMatch?.[1]) {
    careManagerEmail = String(inlineEmailMatch[1]).trim().toLowerCase();
  }

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').replace(/\s+/g, ' ').trim();
    if (!line || !/care\s*manager/i.test(line)) continue;

    const blockLines: string[] = [];
    for (let j = i; j < Math.min(lines.length, i + 6); j++) {
      const next = String(lines[j] || '').replace(/\s+/g, ' ').trim();
      if (!next) continue;
      if (j > i && stopLinePattern.test(next)) break;
      blockLines.push(next);
    }
    const joined = blockLines.join(' ');

    if (!careManagerPhone) {
      const phoneMatch = joined.match(phonePattern);
      const normalized = normalizePhoneDigits(phoneMatch?.[0] || '');
      if (normalized.length === 10) careManagerPhone = formatPhoneDashed(normalized);
    }

    if (!careManagerEmail) {
      const emailMatch = joined.match(emailPattern);
      if (emailMatch?.[0]) careManagerEmail = String(emailMatch[0]).trim().toLowerCase();
    }

    const nameMatch =
      joined.match(/care\s*manager\s*[:#-]?\s*name\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,80})/i) ||
      joined.match(/care\s*manager\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,80})/i) ||
      joined.match(/\bname\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,80})\s*(?:phone|email|$)/i);

    if (!careManagerName && nameMatch?.[1]) {
      const cleaned = String(nameMatch[1] || '')
        .replace(/\b(?:phone|email)\b[\s\S]*$/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      careManagerName = toNameCase(cleaned);
    }

    if (!careManagerName) {
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        const next = String(lines[j] || '').replace(/\s+/g, ' ').trim();
        if (!next) continue;
        if (stopLinePattern.test(next)) break;
        if (phonePattern.test(next) || emailPattern.test(next)) continue;
        if (/^(?:name|phone|email)\s*[:#-]?\s*$/i.test(next)) continue;
        const candidate = next.replace(/^(?:name)\s*[:#-]?\s*/i, '').trim();
        if (candidate) {
          careManagerName = toNameCase(candidate);
          break;
        }
      }
    }

    if (careManagerName || careManagerPhone || careManagerEmail) break;
  }

  return {
    careManagerName,
    careManagerPhone,
    careManagerEmail,
  };
};

const findNextNonEmptyLine = (lines: string[], startIndex: number) => {
  for (let i = startIndex; i < lines.length; i++) {
    const value = String(lines[i] || '').replace(/\s+/g, ' ').trim();
    if (value) return value;
  }
  return '';
};

const extractMemberTableFieldsFromLines = (lines: string[]) => {
  const result: Partial<{
    memberFirstName: string;
    memberLastName: string;
    memberMrn: string;
    memberMediCalNum: string;
    memberDob: string;
    memberPhone: string;
    memberEmail: string;
    contactPhone: string;
    memberCustomaryAddress: string;
    memberCustomaryCity: string;
    memberCustomaryState: string;
    memberCustomaryZip: string;
    memberCustomaryCounty: string;
    planId: string;
    preferredLanguage: string;
    age: string;
  }> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').replace(/\s+/g, ' ').trim();
    if (!line) continue;

    if (/member\s*name\s*:.*\bmrn\b\s*:.*\bcin\b\s*:.*plan\s*id\s*:/i.test(line)) {
      const valueLine = findNextNonEmptyLine(lines, i + 1);
      if (valueLine) {
        const namePart = valueLine.replace(/\s+\S*\d[\s\S]*$/, '').trim();
        if (namePart) {
          const parsedName = parseMemberName(namePart);
          if (parsedName.firstName) result.memberFirstName = toNameCase(parsedName.firstName);
          if (parsedName.lastName) result.memberLastName = toNameCase(stripTrailingNonNameTokens(parsedName.lastName));
        }

        const tokens = valueLine.split(/\s+/).filter(Boolean);
        const digitTokens = tokens.filter((token) => /\d/.test(token));
        const firstTokenWithDigit = digitTokens[0] || '';
        if (firstTokenWithDigit && /^[A-Z0-9-]{6,}$/i.test(firstTokenWithDigit)) {
          result.memberMrn = firstTokenWithDigit;
        }
        const secondTokenWithDigit = digitTokens[1] || '';
        if (secondTokenWithDigit && /^[A-Z0-9-]{6,}$/i.test(secondTokenWithDigit)) {
          result.memberMediCalNum = normalizeMediCalNumber(secondTokenWithDigit);
        }
        const thirdTokenWithDigit = digitTokens[2] || '';
        if (thirdTokenWithDigit && /^[A-Z0-9-]{4,}$/i.test(thirdTokenWithDigit)) {
          result.planId = thirdTokenWithDigit;
        }
      }
    }

    if (/\bdob\s*:.*\bage\s*:.*preferred\s*language/i.test(line)) {
      const valueLine = findNextNonEmptyLine(lines, i + 1);
      const dobMatch = valueLine.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
      if (dobMatch?.[1]) {
        result.memberDob = toMmDdYyyy(dobMatch[1]);
      }
      const remainder = valueLine.replace(dobMatch?.[0] || '', ' ').replace(/\s+/g, ' ').trim();
      const ageMatch = remainder.match(/\b(\d{1,3})\b/);
      if (ageMatch?.[1]) result.age = ageMatch[1];
      const language = remainder.replace(/\b\d{1,3}\b/g, ' ').replace(/\s+/g, ' ').trim();
      if (language && /^[A-Za-z][A-Za-z /-]{1,40}$/.test(language)) {
        result.preferredLanguage = toNameCase(language);
      }
    }

    if (/(?:member|patient)\s*address\s*:.*(?:member|patient)\s*phone\s*:.*cell\s*phone\s*:.*email\s*:/i.test(line)) {
      const blockLines: string[] = [];
      for (let j = i + 1; j < Math.min(lines.length, i + 7); j++) {
        const next = String(lines[j] || '').replace(/\s+/g, ' ').trim();
        if (!next) continue;
        if (/\bpopulation\s*of\s*focus\b|\bprovider\b|\bauthorization\b/i.test(next)) break;
        blockLines.push(next);
      }
      const joined = blockLines.join(' ');
      const phoneGlobal = new RegExp(ADDRESS_PHONE_PATTERN.source, 'g');
      const matches = joined.match(phoneGlobal) || [];
      const normalizedPhones = matches
        .map((value) => normalizePhoneDigits(value))
        .filter((value) => value.length === 10);
      if (normalizedPhones[0]) result.memberPhone = formatPhoneDashed(normalizedPhones[0]);
      if (normalizedPhones[1]) result.contactPhone = formatPhoneDashed(normalizedPhones[1]);
      else if (normalizedPhones[0]) result.contactPhone = formatPhoneDashed(normalizedPhones[0]);
      const emailMatch = joined.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      if (emailMatch?.[0]) result.memberEmail = String(emailMatch[0]).trim().toLowerCase();

      // Keep address text even when a phone sits on the same OCR line.
      const addressOnlyLines = blockLines
        .map((entry) => takeAddressPortionFromMixedLine(entry))
        .map((entry) => String(entry || '').replace(/[,\s]+$/g, '').trim())
        .filter(Boolean)
        .filter((entry) => !/@/.test(entry));
      if (addressOnlyLines.length > 0) {
        const cleanedAddressLines = addressOnlyLines;

        const cityStateRegex = /^([A-Za-z .'-]+?)(?:,\s*|\s+)([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/;
        const looksLikeStreet = looksLikeStreetAddressLine;

        // Prefer a full one-line US address when present.
        const joinedAddress = cleanedAddressLines.join(', ').replace(/,\s*,/g, ', ').trim();
        const parsedJoined = parseAddressParts(joinedAddress);
        if (parsedJoined.street || parsedJoined.city || parsedJoined.state || parsedJoined.zip) {
          if (parsedJoined.street) result.memberCustomaryAddress = toNameCase(parsedJoined.street);
          if (parsedJoined.city) result.memberCustomaryCity = toNameCase(parsedJoined.city);
          if (parsedJoined.state) result.memberCustomaryState = parsedJoined.state;
          if (parsedJoined.zip) result.memberCustomaryZip = parsedJoined.zip;
          if (parsedJoined.county) result.memberCustomaryCounty = toNameCase(parsedJoined.county);
        } else {
          const streetLine =
            cleanedAddressLines.find((value) => looksLikeStreet(value) && !isStateZipOnlyLine(value)) ||
            cleanedAddressLines[0] ||
            '';
          const nonStreetLines = cleanedAddressLines.filter((value) => value !== streetLine);
          const cityStateLine = nonStreetLines.find((value) => cityStateRegex.test(value)) || nonStreetLines[0] || '';
          const zipLine = nonStreetLines.find((value) => /\d{5}(?:-\d{4})?/.test(value)) || '';

          let cityStateMatch = cityStateLine.match(cityStateRegex);
          let zipMatch = zipLine.match(/(\d{5}(?:-\d{4})?)/);

          // Guard against city/state accidentally being placed in the street slot.
          if (!looksLikeStreet(streetLine) && cityStateRegex.test(streetLine)) {
            cityStateMatch = streetLine.match(cityStateRegex);
            if (!zipMatch && cityStateMatch?.[3]) {
              zipMatch = [cityStateMatch[3], cityStateMatch[3]] as RegExpMatchArray;
            }
          }
          if (isStateZipOnlyLine(streetLine)) {
            const stateZipOnly = streetLine.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
            if (stateZipOnly) {
              result.memberCustomaryState = stateZipOnly[1].toUpperCase();
              result.memberCustomaryZip = stateZipOnly[2];
            }
          } else {
            const cleanedStreet = stripContactInfoFromAddressLine(streetLine);
            if (cleanedStreet && looksLikeStreet(cleanedStreet)) result.memberCustomaryAddress = toNameCase(cleanedStreet);
          }
          if (cityStateMatch?.[1]) result.memberCustomaryCity = toNameCase(cityStateMatch[1].trim());
          if (cityStateMatch?.[2]) result.memberCustomaryState = cityStateMatch[2].trim().toUpperCase();
          if (zipMatch?.[1]) result.memberCustomaryZip = zipMatch[1].trim();

          const countyMatch = addressOnlyLines.join(' ').match(/([A-Za-z .'-]+)\s+County\b/i);
          const explicitCounty = String(countyMatch?.[1] || '').trim();
          if (explicitCounty) {
            result.memberCustomaryCounty = toNameCase(explicitCounty);
          } else if (result.memberCustomaryZip || result.memberCustomaryCity) {
            const inferredCounty = inferCountyFromCityZip({
              city: result.memberCustomaryCity || '',
              zip: result.memberCustomaryZip || '',
            });
            if (inferredCounty) result.memberCustomaryCounty = inferredCounty;
          }
        }
      }
    }
  }

  return result;
};

const mergeAdminNotes = (existing: unknown, incoming: unknown) => {
  const current = String(existing || '').trim();
  const next = String(incoming || '').trim();
  if (!next) return current;
  if (!current) return next;
  if (current.includes(next)) return current;
  return `${current}\n\n${next}`;
};

const buildSingleAuthAdminNotes = (details: Record<string, string>) => {
  const lines = [
    'Single Auth PDF Details',
    details.preferredLanguage ? `Preferred Language: ${details.preferredLanguage}` : '',
    details.age ? `Age: ${details.age}` : '',
    details.planId ? `Plan ID: ${details.planId}` : '',
    details.populationOfFocus ? `Population of Focus: ${details.populationOfFocus}` : '',
    details.providerName ? `Provider: ${details.providerName}` : '',
    details.cptCode ? `CPT Code: ${details.cptCode}` : '',
    details.specialInstructions ? `Special Instructions: ${details.specialInstructions}` : '',
  ].filter(Boolean);
  return lines.length > 1 ? lines.join('\n') : '';
};

const extractExtraServiceRequestDetails = (
  lines: string[],
  flattened: string,
  tableFields: Partial<{ planId: string; preferredLanguage: string; age: string }>
) => {
  const stopLabels = [
    'provider',
    'authorization',
    'care\\s*manager',
    'special\\s*instructions',
    'population\\s*of\\s*focus',
    'preferred\\s*language',
    'plan\\s*id',
    'member\\s*information',
    'page\\s+\\d+',
  ];
  const preferredLanguage =
    String(tableFields.preferredLanguage || '').trim() ||
    findFirst(flattened, [
      /preferred\s*language\s*[:#-]?\s*(?:\r?\n\s*)?([A-Za-z][A-Za-z /-]{1,40})/i,
    ]);
  const age =
    String(tableFields.age || '').trim() ||
    findFirst(flattened, [/\bage\s*[:#-]?\s*(?:\r?\n\s*)?(\d{1,3})\b/i]);
  const planId =
    String(tableFields.planId || '').trim() ||
    findFirst(flattened, [/\bplan\s*id\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i]);
  const populationOfFocus = truncateAtNextLabel(
    findLabeledValue(flattened, 'population\\s*of\\s*focus', stopLabels) ||
      findFirst(flattened, [/population\s*of\s*focus\s*[:#-]?\s*([^\n]{2,120})/i]) ||
      ''
  );
  const providerName = truncateAtNextLabel(
    findLabeledValue(flattened, 'provider(?:\\s*name)?', stopLabels) ||
      findFirst(flattened, [/\bprovider(?:\s*name)?\s*[:#-]?\s*([A-Za-z0-9][^\n]{2,80})/i]) ||
      ''
  );
  const specialInstructions = truncateAtNextLabel(
    findLabeledValue(flattened, 'special\\s*instructions(?:\\s*/\\s*comments)?', [
      'authorization',
      'care\\s*manager',
      'member\\s*information',
      'page\\s+\\d+',
    ]) ||
      findFirst(flattened, [
        /special\s*instructions(?:\s*\/\s*comments)?\s*[:#-]?\s*([^\n]{3,200})/i,
        /\bcomments\s*[:#-]?\s*([^\n]{3,200})/i,
      ]) ||
      ''
  );
  const cptCode = findFirst(flattened, [
    /\bcpt(?:\s*code)?\s*[:#-]?\s*([A-Z0-9]{4,8})/i,
    /\bhcpcs\s*[:#-]?\s*([A-Z0-9]{4,8})/i,
  ]);
  return {
    preferredLanguage: preferredLanguage.replace(/\b(?:age|dob|plan)\b.*$/i, '').trim(),
    age,
    planId,
    populationOfFocus,
    providerName,
    specialInstructions,
    cptCode,
  };
};

const extractAddressFromLines = (lines: string[]) => {
  const stopLinePattern =
    /\b(?:member|patient)?\s*(?:phone|cell(?:ular)?|mobile|email|population|provider|authorization|care\s*manager|contact\s*person|special\s*instructions|dob|date\s*of\s*birth)\b/i;
  const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    if (!/\b(?:member|patient)\s*address\b/i.test(line)) continue;

    const inlineValue = truncateAtNextLabel(
      line.replace(/^.*?\b(?:member|patient)\s*address\s*[:#-]?\s*/i, '').trim()
    );
    const inlineAddress = takeAddressPortionFromMixedLine(inlineValue);
    if (
      inlineAddress &&
      !stopLinePattern.test(inlineAddress) &&
      !emailPattern.test(inlineAddress) &&
      (looksLikeStreetAddressLine(inlineAddress) || /,/.test(inlineAddress) || isStateZipOnlyLine(inlineAddress))
    ) {
      return inlineAddress;
    }

    const addressParts: string[] = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      const next = String(lines[j] || '').replace(/\s+/g, ' ').trim();
      if (!next) continue;
      if (stopLinePattern.test(next) || emailPattern.test(next)) break;
      // Phone on same line should not discard address text.
      const addressPortion = takeAddressPortionFromMixedLine(next);
      if (!addressPortion) {
        if (ADDRESS_PHONE_PATTERN.test(next)) break;
        continue;
      }
      addressParts.push(addressPortion);
      // If this line already contains a complete city/state/zip, stop collecting.
      if (/\b[A-Za-z]{2}\s+\d{5}(?:-\d{4})?\b/.test(addressPortion) && looksLikeStreetAddressLine(addressPortion)) {
        break;
      }
    }

    if (addressParts.length > 0) {
      return addressParts.join(', ').replace(/,\s*,/g, ', ').trim();
    }
  }

  return '';
};

const splitAddressFromLines = (lines: string[]) => {
  const stopLinePattern =
    /\b(?:member|patient)?\s*(?:phone|cell(?:ular)?|mobile|email|population|provider|authorization|care\s*manager|contact\s*person|special\s*instructions|dob|date\s*of\s*birth)\b/i;
  const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    if (!/\b(?:member|patient)\s*address\b/i.test(line)) continue;

    const rawParts: string[] = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      const next = String(lines[j] || '').replace(/\s+/g, ' ').trim();
      if (!next) continue;
      if (stopLinePattern.test(next) || emailPattern.test(next)) break;
      const addressPortion = takeAddressPortionFromMixedLine(next);
      if (!addressPortion) {
        if (ADDRESS_PHONE_PATTERN.test(next)) break;
        continue;
      }
      rawParts.push(addressPortion);
      if (/\b[A-Za-z]{2}\s+\d{5}(?:-\d{4})?\b/.test(addressPortion) && looksLikeStreetAddressLine(addressPortion)) {
        break;
      }
    }

    if (rawParts.length === 0) continue;
    const cleanedParts = rawParts.map((part) => part.replace(/[,\s]+$/g, '').trim()).filter(Boolean);
    if (cleanedParts.length === 0) continue;

    // Prefer parsing the joined multi-line address as a full US address.
    const joined = cleanedParts.join(', ').replace(/,\s*,/g, ', ').trim();
    const parsedJoined = parseAddressParts(joined);
    if (parsedJoined.street || parsedJoined.city || parsedJoined.state || parsedJoined.zip) {
      return parsedJoined;
    }

    const street = cleanedParts[0] || '';
    let city = '';
    let state = '';
    let zip = '';
    let county = '';

    const countyMatch = cleanedParts.join(' ').match(/([A-Za-z .'-]+)\s+County\b/i);
    if (countyMatch?.[1]) county = countyMatch[1].trim();

    if (cleanedParts.length >= 2) {
      const cityStateZipMatch = cleanedParts[1].match(
        /^([A-Za-z .'-]+?)(?:,\s*|\s+)([A-Za-z]{2})(?:,\s*|\s+)?(\d{5}(?:-\d{4})?)?$/
      );
      if (cityStateZipMatch) {
        city = cityStateZipMatch[1].trim();
        state = cityStateZipMatch[2].trim().toUpperCase();
        zip = String(cityStateZipMatch[3] || '').trim();
      } else if (isStateZipOnlyLine(cleanedParts[1])) {
        const stateZipOnly = cleanedParts[1].match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
        if (stateZipOnly) {
          state = stateZipOnly[1].toUpperCase();
          zip = stateZipOnly[2];
        }
      } else {
        city = cleanedParts[1].replace(/[,\s]+$/g, '').trim();
      }
    }

    if (!zip && cleanedParts.length >= 3) {
      const zipCandidate = cleanedParts[2].match(/(\d{5}(?:-\d{4})?)/);
      if (zipCandidate?.[1]) zip = zipCandidate[1];
    }

    return {
      street: isStateZipOnlyLine(street) ? '' : street,
      city,
      state: state || (isStateZipOnlyLine(street) ? street.slice(0, 2).toUpperCase() : ''),
      zip: zip || (isStateZipOnlyLine(street) ? street.slice(3).trim() : ''),
      county: county || inferCountyFromCityZip({ city, zip }),
    };
  }

  return { street: '', city: '', state: '', zip: '', county: '' };
};

const inferCountyFromZip = (zipRaw: unknown) => findCountyByZip(zipRaw) || '';

const inferStateFromZip = (zipRaw: unknown) => {
  const zip = String(zipRaw || '').match(/\d{5}/)?.[0] || '';
  if (!zip) return '';
  const zipNumber = Number(zip);
  if (Number.isNaN(zipNumber)) return '';
  // Current intake data is California-based; CA ZIP range covers 90000-96699.
  if (zipNumber >= 90000 && zipNumber <= 96699) return 'CA';
  return '';
};

const inferCountyFromCity = (cityRaw: unknown) => findCountyByCity(String(cityRaw || '')) || '';

const inferCountyFromCityZip = (params: { city?: unknown; zip?: unknown }) =>
  findCountyByCityAndZip(params.city, params.zip) || '';

const COUNTY_UNDETERMINED_MESSAGE = 'County cannot be determined from city/ZIP. Enter it manually.';

const isCountyUndetermined = (params: { city?: unknown; zip?: unknown; county?: unknown }) => {
  const city = String(params.city || '').trim();
  const zip = String(params.zip || '').trim();
  const county = String(params.county || '').trim();
  if (county) return false;
  if (!city && !zip) return false;
  return !inferCountyFromCityZip({ city, zip });
};

const inferStateFromCityZip = (params: { city?: unknown; zip?: unknown }) => {
  const byZip = inferStateFromZip(params.zip);
  if (byZip) return byZip;
  return inferCountyFromCityZip(params) ? 'CA' : '';
};

const parseAddressParts = (rawValue: unknown) => {
  const raw = String(rawValue || '').replace(/\s+/g, ' ').trim();
  if (!raw) {
    return { street: '', city: '', state: '', zip: '', county: '' };
  }

  const cleaned = raw.replace(/\s{2,}/g, ' ').trim().replace(/,\s*,/g, ',').replace(/[,\s]+$/g, '').trim();
  const countyMatch = cleaned.match(/([A-Za-z .'-]+)\s+County\b/i);
  const inferredCounty = countyMatch?.[1] ? countyMatch[1].trim() : '';

  // "CA 94598" alone (common PDF wrap fragment) — never treat as street.
  const stateZipOnly = cleaned.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (stateZipOnly) {
    const state = stateZipOnly[1].toUpperCase();
    const zip = stateZipOnly[2];
    return {
      street: '',
      city: '',
      state,
      zip,
      county: inferredCounty || inferCountyFromCityZip({ zip }),
    };
  }

  // Preferred: "123 Main St, City, ST 94598" (comma before state).
  const cityCommaStateZipMatch = cleaned.match(
    /^(.+?),\s*([A-Za-z .'-]+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/
  );
  if (cityCommaStateZipMatch) {
    return {
      street: cityCommaStateZipMatch[1].trim(),
      city: cityCommaStateZipMatch[2].trim(),
      state: cityCommaStateZipMatch[3].trim().toUpperCase(),
      zip: cityCommaStateZipMatch[4].trim(),
      county:
        inferredCounty ||
        inferCountyFromCityZip({
          city: cityCommaStateZipMatch[2].trim(),
          zip: cityCommaStateZipMatch[4].trim(),
        }),
    };
  }

  // Alternate: "123 Main St, City ST 94598" (space before state).
  const cityStateZipMatch = cleaned.match(
    /^(.+?),\s*([A-Za-z .'-]+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/
  );
  if (cityStateZipMatch) {
    return {
      street: cityStateZipMatch[1].trim(),
      city: cityStateZipMatch[2].trim(),
      state: cityStateZipMatch[3].trim().toUpperCase(),
      zip: cityStateZipMatch[4].trim(),
      county:
        inferredCounty ||
        inferCountyFromCityZip({ city: cityStateZipMatch[2].trim(), zip: cityStateZipMatch[4].trim() }),
    };
  }

  const commaParts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
  if (commaParts.length === 2) {
    const cityStateZip = commaParts[1].match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (cityStateZip) {
      const city = commaParts[0];
      const state = String(cityStateZip[1] || '').toUpperCase();
      const zip = String(cityStateZip[2] || '');
      // "Walnut, CA 94598" → city/state/zip (no street).
      // "1150 WIGET LN, CA 94598" is rare; treat first part as street if it looks like one.
      if (looksLikeStreetAddressLine(city) && /\d/.test(city)) {
        return {
          street: city,
          city: '',
          state: /^[A-Za-z]{2}$/.test(state) ? state : '',
          zip,
          county: inferredCounty || inferCountyFromCityZip({ zip }),
        };
      }
      return {
        street: '',
        city,
        state: /^[A-Za-z]{2}$/.test(state) ? state : '',
        zip,
        county: inferredCounty || inferCountyFromCityZip({ city, zip }),
      };
    }

    // "1150 WIGET LN, Walnut" (PDF wrap before state/zip).
    if (looksLikeStreetAddressLine(commaParts[0]) && /^[A-Za-z .'-]+$/.test(commaParts[1])) {
      return {
        street: commaParts[0],
        city: commaParts[1],
        state: '',
        zip: '',
        county: inferredCounty || inferCountyFromCity(commaParts[1]),
      };
    }
  }
  if (commaParts.length >= 4) {
    const street = commaParts[0];
    const city = commaParts[1];
    const state = String(commaParts[2] || '').toUpperCase();
    const zip = String(commaParts[3] || '').match(/\d{5}(?:-\d{4})?/)?.[0] || '';
    return {
      street,
      city,
      state: /^[A-Za-z]{2}$/.test(state) ? state : '',
      zip,
      county: inferredCounty || inferCountyFromCityZip({ city, zip }),
    };
  }
  if (commaParts.length >= 3) {
    const street = commaParts[0];
    const city = commaParts[1];
    const stateZip = commaParts[2].match(/^([A-Za-z]{2})(?:[, ]+\s*(\d{5}(?:-\d{4})?))?$/);
    const zip = String(stateZip?.[2] || '').trim();
    return {
      street,
      city,
      state: String(stateZip?.[1] || '').toUpperCase(),
      zip,
      county: inferredCounty || inferCountyFromCityZip({ city, zip }),
    };
  }

  // "1150 WIGET LN Walnut CA 94598" (no commas)
  const noCommaMatch = cleaned.match(
    /^(.+?)\s+([A-Za-z .'-]+)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/
  );
  if (noCommaMatch && looksLikeStreetAddressLine(noCommaMatch[1])) {
    return {
      street: noCommaMatch[1].trim(),
      city: noCommaMatch[2].trim(),
      state: noCommaMatch[3].trim().toUpperCase(),
      zip: noCommaMatch[4].trim(),
      county:
        inferredCounty ||
        inferCountyFromCityZip({ city: noCommaMatch[2].trim(), zip: noCommaMatch[4].trim() }),
    };
  }

  return { street: cleaned, city: '', state: '', zip: '', county: inferredCounty };
};

const normalizeAddressFieldPlacement = <T extends Record<string, string>>(updates: T): T => {
  const next = { ...updates };
  const street = stripContactInfoFromAddressLine(next.memberCustomaryAddress || '');
  const city = String(next.memberCustomaryCity || '').trim();
  const state = String(next.memberCustomaryState || '').trim();
  const zip = String(next.memberCustomaryZip || '').trim();
  const cityStateZipOnlyMatch = street.match(/^([A-Za-z .'-]+)\s*,\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  const aptCityStateZipMatch = street.match(/^(\d{1,6})\s*,\s*([A-Za-z .'-]+)\s*,\s*([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/i);
  const stateZipOnlyMatch = street.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);

  const zipOnly = /^\d{5}(?:-\d{4})?$/.test(street);
  if (street !== String(next.memberCustomaryAddress || '').trim()) {
    next.memberCustomaryAddress = street;
  }

  if (zipOnly) {
    if (!zip) next.memberCustomaryZip = street;
    next.memberCustomaryAddress = '';
  }

  // Never leave "CA 94598" in the street field.
  if (stateZipOnlyMatch) {
    if (!state) next.memberCustomaryState = stateZipOnlyMatch[1].toUpperCase();
    if (!zip) next.memberCustomaryZip = stateZipOnlyMatch[2];
    next.memberCustomaryAddress = '';
  }

  const cityStateOnlyMatch = street.match(/^([A-Za-z .'-]+),\s*([A-Za-z]{2})$/);
  if (cityStateOnlyMatch) {
    if (!city) next.memberCustomaryCity = cityStateOnlyMatch[1].trim();
    if (!state) next.memberCustomaryState = cityStateOnlyMatch[2].trim().toUpperCase();
    next.memberCustomaryAddress = '';
  }
  if (cityStateZipOnlyMatch) {
    if (!city) next.memberCustomaryCity = cityStateZipOnlyMatch[1].trim();
    if (!state) next.memberCustomaryState = cityStateZipOnlyMatch[2].trim().toUpperCase();
    if (!zip) next.memberCustomaryZip = cityStateZipOnlyMatch[3].trim();
    next.memberCustomaryAddress = '';
  }
  if (aptCityStateZipMatch) {
    if (!city) next.memberCustomaryCity = aptCityStateZipMatch[2].trim();
    if (!state) next.memberCustomaryState = aptCityStateZipMatch[3].trim().toUpperCase();
    if (!zip && aptCityStateZipMatch[4]) next.memberCustomaryZip = aptCityStateZipMatch[4].trim();
    // This line is unit + city/state/zip, not a true street address.
    next.memberCustomaryAddress = '';
  }

  // Handle cases where street line still contains city/state (and sometimes zip),
  // e.g. "1150 WIGET LN, Walnut, CA 94598" or "APT 75, PETALUMA, CA".
  if (
    next.memberCustomaryAddress &&
    (!next.memberCustomaryCity || !next.memberCustomaryState || !next.memberCustomaryZip || !next.memberCustomaryCounty)
  ) {
    const addressLineForParsing =
      /\d{5}(?:-\d{4})?/.test(next.memberCustomaryAddress) || !next.memberCustomaryZip
        ? next.memberCustomaryAddress
        : `${next.memberCustomaryAddress} ${next.memberCustomaryZip}`;
    const parsedFromStreet = parseAddressParts(addressLineForParsing);
    if (!next.memberCustomaryCity && parsedFromStreet.city) next.memberCustomaryCity = parsedFromStreet.city;
    if (!next.memberCustomaryState && parsedFromStreet.state) next.memberCustomaryState = parsedFromStreet.state;
    if (!next.memberCustomaryZip && parsedFromStreet.zip) next.memberCustomaryZip = parsedFromStreet.zip;
    if (!next.memberCustomaryCounty && parsedFromStreet.county) next.memberCustomaryCounty = parsedFromStreet.county;
    if (parsedFromStreet.street) {
      const normalizedStreet = stripContactInfoFromAddressLine(parsedFromStreet.street);
      if (normalizedStreet) next.memberCustomaryAddress = normalizedStreet;
    } else if (parsedFromStreet.city || parsedFromStreet.state || parsedFromStreet.zip) {
      // Parsed as city/state/zip only — clear bogus street fragments like "CA 94598".
      next.memberCustomaryAddress = '';
    }
  }

  if (!next.memberCustomaryState && next.memberCustomaryZip) {
    const inferredState = inferStateFromZip(next.memberCustomaryZip);
    if (inferredState) next.memberCustomaryState = inferredState;
  }

  if (!next.memberCustomaryCounty && (next.memberCustomaryZip || next.memberCustomaryCity)) {
    const inferredCounty = inferCountyFromCityZip({
      city: next.memberCustomaryCity,
      zip: next.memberCustomaryZip,
    });
    if (inferredCounty) next.memberCustomaryCounty = inferredCounty;
  }

  // Final cleanup: remove trailing "City, ST [ZIP]" if it still leaked into street.
  if (next.memberCustomaryAddress) {
    const cleanedStreetOnly = next.memberCustomaryAddress
      .replace(/,\s*[A-Za-z .'-]+,\s*[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/i, '')
      .replace(/,\s*[A-Za-z .'-]+\s+[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/i, '')
      .trim();
    if (cleanedStreetOnly && !isStateZipOnlyLine(cleanedStreetOnly)) {
      next.memberCustomaryAddress = cleanedStreetOnly;
    } else if (isStateZipOnlyLine(cleanedStreetOnly)) {
      next.memberCustomaryAddress = '';
    }
  }

  if (next.memberCustomaryAddress) next.memberCustomaryAddress = toNameCase(next.memberCustomaryAddress);
  if (next.memberCustomaryCity) next.memberCustomaryCity = toNameCase(next.memberCustomaryCity);
  if (next.memberCustomaryCounty) next.memberCustomaryCounty = toNameCase(next.memberCustomaryCounty);

  return next;
};

const inferStreetFromCityStateContext = (params: {
  lines: string[];
  city?: string;
  state?: string;
  zip?: string;
}) => {
  const city = String(params.city || '').trim();
  const state = String(params.state || '').trim().toUpperCase();
  const zip = String(params.zip || '').trim();
  if (!city || !state) return '';

  const normalizedLines = (params.lines || [])
    .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const cityStatePattern = new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,\\s*${state}(?:\\s+\\d{5}(?:-\\d{4})?)?$`, 'i');
  const cityStateAnywherePattern = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b.*\\b${state}\\b`, 'i');
  const aptCityStateZipPattern = /^(\d{1,6})\s*,\s*[A-Za-z .'-]+\s*,\s*[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i;
  const zipOnlyPattern = /^\d{5}(?:-\d{4})?$/;
  const looksLikeStreet = (value: string) =>
    /\d/.test(value) &&
    !zipOnlyPattern.test(value) &&
    /\b(?:st|street|ave|avenue|dr|drive|rd|road|ln|lane|blvd|boulevard|ct|court|way|pl|place|hwy|highway|apt|unit)\b/i.test(value);

  for (let i = 0; i < normalizedLines.length; i++) {
    const current = normalizedLines[i];
    if (!cityStatePattern.test(current) && !cityStateAnywherePattern.test(current)) continue;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const previous = normalizedLines[j];
      if (!previous || zipOnlyPattern.test(previous)) continue;
      const cleaned = stripContactInfoFromAddressLine(previous);
      if (looksLikeStreet(cleaned)) {
        const unitMatch = current.match(aptCityStateZipPattern);
        if (unitMatch?.[1] && /\b(?:apt|unit|#)\s*$/i.test(cleaned)) {
          return `${cleaned} ${unitMatch[1]}`.replace(/\s{2,}/g, ' ').trim();
        }
        return cleaned;
      }
    }
  }

  if (zip) {
    const zipPattern = new RegExp(`^${zip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    const zipIndex = normalizedLines.findIndex((line) => zipPattern.test(line));
    if (zipIndex > 0) {
      for (let j = zipIndex - 1; j >= Math.max(0, zipIndex - 3); j--) {
        const previous = normalizedLines[j];
        const cleaned = stripContactInfoFromAddressLine(previous);
        if (looksLikeStreet(cleaned)) return cleaned;
      }
    }
  }

  return '';
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
    ]) || extractNameFromFileName(params.fileName);

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
  const memberMediCalNum = normalizeMediCalNumber(
    findFirst(flattened, [
      /(?:medi[\s-]*cal|mcp[\s_-]*cin|cin)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([0-9][A-Z0-9-]{6,})/i,
    ])
  );

  const memberAddress =
    extractAddressFromLines(lines) ||
    findLabeledValue(flattened, 'member\\s*address', [
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
  const linePhones = extractPhonesFromLines(lines);
  const memberEmail = String(
    findFirst(flattened, [
      /(?:member|patient)\s*email\s*[:#-]?\s*(?:\r?\n\s*)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
      /\bemail\s*[:#-]?\s*(?:\r?\n\s*)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
    ]) || ''
  )
    .trim()
    .toLowerCase();

  const parsedName = sanitizeParsedName(parseMemberName(memberNameRaw));
  const tableFields = extractMemberTableFieldsFromLines(lines);
  const careManagerFields = extractCareManagerFromLines(lines, flattened);
  let updates: Record<string, string> = {};
  if (tableFields.memberFirstName || parsedName.firstName) {
    updates.memberFirstName = toNameCase(tableFields.memberFirstName || parsedName.firstName || '');
  }
  if (tableFields.memberLastName || parsedName.lastName) {
    const sanitizedLast = stripTrailingNonNameTokens(tableFields.memberLastName || parsedName.lastName || '');
    updates.memberLastName = toNameCase(sanitizedLast);
  }
  if (memberMrn || tableFields.memberMrn) updates.memberMrn = memberMrn || tableFields.memberMrn || '';
  const resolvedMediCalNum = memberMediCalNum || normalizeMediCalNumber(tableFields.memberMediCalNum || '');
  if (resolvedMediCalNum) {
    updates.memberMediCalNum = resolvedMediCalNum;
    updates.confirmMemberMediCalNum = resolvedMediCalNum;
  }
  if (tableFields.memberDob) updates.memberDob = tableFields.memberDob;
  if (authorizationNumber) updates.Authorization_Number_T038 = authorizationNumber;
  if (authorizationStart) updates.Authorization_Start_T2038 = toMmDdYyyy(authorizationStart);
  if (authorizationEnd) updates.Authorization_End_T2038 = toMmDdYyyy(authorizationEnd);
  if (diagnosticCode) updates.Diagnostic_Code = diagnosticCode;
  if (memberAddress) updates.memberCustomaryAddress = memberAddress;
  if (tableFields.memberCustomaryAddress) updates.memberCustomaryAddress = tableFields.memberCustomaryAddress;
  if (tableFields.memberCustomaryCity) updates.memberCustomaryCity = tableFields.memberCustomaryCity;
  if (tableFields.memberCustomaryState) updates.memberCustomaryState = tableFields.memberCustomaryState;
  if (tableFields.memberCustomaryZip) updates.memberCustomaryZip = tableFields.memberCustomaryZip;
  if (tableFields.memberCustomaryCounty) updates.memberCustomaryCounty = tableFields.memberCustomaryCounty;
  if (tableFields.memberPhone || linePhones.cellPhone || linePhones.memberPhone || cellPhone || memberPhone) {
    const normalizedPhone = normalizePhoneDigits(
      tableFields.memberPhone || linePhones.cellPhone || linePhones.memberPhone || cellPhone || memberPhone
    );
    if (normalizedPhone) updates.memberPhone = formatPhoneDashed(normalizedPhone);
  }
  if (tableFields.contactPhone || linePhones.memberPhone || memberPhone) {
    const normalizedContactPhone = normalizePhoneDigits(tableFields.contactPhone || linePhones.memberPhone || memberPhone);
    if (normalizedContactPhone) updates.contactPhone = formatPhoneDashed(normalizedContactPhone);
  }
  if (tableFields.memberEmail || memberEmail) {
    updates.memberEmail = String(tableFields.memberEmail || memberEmail || '').trim().toLowerCase();
  }
  if (careManagerFields.careManagerName) updates.careManagerName = careManagerFields.careManagerName;
  if (careManagerFields.careManagerPhone) updates.careManagerPhone = careManagerFields.careManagerPhone;
  if (careManagerFields.careManagerEmail) updates.careManagerEmail = careManagerFields.careManagerEmail;
  const extraDetails = extractExtraServiceRequestDetails(lines, flattened, tableFields);
  const extraNotes = buildSingleAuthAdminNotes(extraDetails);
  if (extraNotes) updates.notes = extraNotes;
  updates = normalizeAddressFieldPlacement(updates);
  if (!updates.memberCustomaryAddress && (updates.memberCustomaryCity || updates.memberCustomaryState)) {
    const inferredStreet = inferStreetFromCityStateContext({
      lines,
      city: updates.memberCustomaryCity,
      state: updates.memberCustomaryState,
      zip: updates.memberCustomaryZip,
    });
    if (inferredStreet) updates.memberCustomaryAddress = toNameCase(inferredStreet);
  }
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
    ]) || extractNameFromFileName(params.fileName);

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
  const memberMediCalNum = normalizeMediCalNumber(
    findFirst(flattened, [
      /(?:medi[\s-]*cal|mcp[\s_-]*cin|cin)\s*(?:number|no\.?|#)?\s*[:#-]?\s*(?:\r?\n\s*)?([0-9][A-Z0-9-]{6,})/i,
    ])
  );

  const memberAddressRaw =
    extractAddressFromLines(lines) ||
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
  const splitAddress = splitAddressFromLines(lines);

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
  const linePhones = extractPhonesFromLines(lines);
  const memberEmail = String(
    findFirst(flattened, [
      /(?:member|patient)\s*email\s*[:#-]?\s*(?:\r?\n\s*)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
      /\bemail\s*[:#-]?\s*(?:\r?\n\s*)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
    ]) || ''
  )
    .trim()
    .toLowerCase();

  const parsedName = sanitizeParsedName(parseMemberName(memberNameRaw));
  const tableFields = extractMemberTableFieldsFromLines(lines);
  const careManagerFields = extractCareManagerFromLines(lines, flattened);
  const parsedAddress = parseAddressParts(memberAddress);

  let updates: Partial<{
    memberFirstName: string;
    memberLastName: string;
    memberMrn: string;
    memberMediCalNum: string;
    confirmMemberMediCalNum: string;
    memberPhone: string;
    memberEmail: string;
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
    careManagerName: string;
    careManagerPhone: string;
    careManagerEmail: string;
    notes: string;
  }> = {};

  if (tableFields.memberFirstName || parsedName.firstName) {
    updates.memberFirstName = toNameCase(tableFields.memberFirstName || parsedName.firstName || '');
  }
  if (tableFields.memberLastName || parsedName.lastName) {
    const sanitizedLast = stripTrailingNonNameTokens(tableFields.memberLastName || parsedName.lastName || '');
    updates.memberLastName = toNameCase(sanitizedLast);
  }
  if (memberMrn || tableFields.memberMrn) updates.memberMrn = memberMrn || tableFields.memberMrn || '';
  const resolvedMediCalNum = memberMediCalNum || normalizeMediCalNumber(tableFields.memberMediCalNum || '');
  if (resolvedMediCalNum) {
    updates.memberMediCalNum = resolvedMediCalNum;
    updates.confirmMemberMediCalNum = resolvedMediCalNum;
  }
  if (authorizationNumber) updates.Authorization_Number_T038 = authorizationNumber;
  if (authorizationStart) updates.Authorization_Start_T2038 = toMmDdYyyy(authorizationStart);
  if (authorizationEnd) updates.Authorization_End_T2038 = toMmDdYyyy(authorizationEnd);
  if (diagnosticCode) updates.Diagnostic_Code = diagnosticCode;
  if (memberDob || tableFields.memberDob) updates.memberDob = toMmDdYyyy(memberDob || tableFields.memberDob || '');
  const hasSplitAddressParts = Boolean(
    splitAddress.street || splitAddress.city || splitAddress.state || splitAddress.zip || splitAddress.county
  );
  const resolvedStreetAddress =
    tableFields.memberCustomaryAddress ||
    splitAddress.street ||
    parsedAddress.street ||
    memberAddress;
  if (resolvedStreetAddress) updates.memberCustomaryAddress = resolvedStreetAddress;
  if (tableFields.memberCustomaryCity || splitAddress.city || parsedAddress.city) {
    updates.memberCustomaryCity = tableFields.memberCustomaryCity || splitAddress.city || parsedAddress.city || '';
  }
  if (tableFields.memberCustomaryState || splitAddress.state || parsedAddress.state) {
    updates.memberCustomaryState = tableFields.memberCustomaryState || splitAddress.state || parsedAddress.state || '';
  }
  if (tableFields.memberCustomaryZip || splitAddress.zip || parsedAddress.zip) {
    updates.memberCustomaryZip = tableFields.memberCustomaryZip || splitAddress.zip || parsedAddress.zip || '';
  }
  if (tableFields.memberCustomaryCounty || splitAddress.county || parsedAddress.county) {
    updates.memberCustomaryCounty = tableFields.memberCustomaryCounty || splitAddress.county || parsedAddress.county || '';
  }
  if (!resolvedStreetAddress && hasSplitAddressParts && memberAddress) {
    updates.memberCustomaryAddress = memberAddress;
  }
  if (tableFields.memberPhone || linePhones.cellPhone || linePhones.memberPhone || cellPhone || memberPhone) {
    const normalizedPhone = normalizePhoneDigits(
      tableFields.memberPhone || linePhones.cellPhone || linePhones.memberPhone || cellPhone || memberPhone
    );
    if (normalizedPhone) updates.memberPhone = formatPhoneDashed(normalizedPhone);
  }
  if (tableFields.contactPhone || linePhones.memberPhone || memberPhone) {
    const normalizedContactPhone = normalizePhoneDigits(tableFields.contactPhone || linePhones.memberPhone || memberPhone);
    if (normalizedContactPhone) updates.contactPhone = formatPhoneDashed(normalizedContactPhone);
  }
  if (tableFields.memberEmail || memberEmail) {
    updates.memberEmail = String(tableFields.memberEmail || memberEmail || '').trim().toLowerCase();
  }
  if (careManagerFields.careManagerName) updates.careManagerName = careManagerFields.careManagerName;
  if (careManagerFields.careManagerPhone) updates.careManagerPhone = careManagerFields.careManagerPhone;
  if (careManagerFields.careManagerEmail) updates.careManagerEmail = careManagerFields.careManagerEmail;
  const extraDetails = extractExtraServiceRequestDetails(lines, flattened, tableFields);
  const extraNotes = buildSingleAuthAdminNotes(extraDetails);
  if (extraNotes) updates.notes = extraNotes;
  updates = normalizeAddressFieldPlacement(updates as Record<string, string>);
  if (!updates.memberCustomaryAddress && (updates.memberCustomaryCity || updates.memberCustomaryState)) {
    const inferredStreet = inferStreetFromCityStateContext({
      lines,
      city: updates.memberCustomaryCity,
      state: updates.memberCustomaryState,
      zip: updates.memberCustomaryZip,
    });
    if (inferredStreet) updates.memberCustomaryAddress = toNameCase(inferredStreet);
  }

  // Safety fallback: preserve original fast extraction behavior for core fields.
  const legacyUpdates = extractServiceRequestFieldsLegacy(params);
  const mergedUpdates = { ...legacyUpdates, ...updates };
  if (legacyUpdates.notes || updates.notes) {
    mergedUpdates.notes = mergeAdminNotes(legacyUpdates.notes, updates.notes);
  }
  if (mergedUpdates.memberCustomaryAddress) {
    mergedUpdates.memberCustomaryAddress = toNameCase(mergedUpdates.memberCustomaryAddress);
  }
  if (mergedUpdates.memberCustomaryCity) {
    mergedUpdates.memberCustomaryCity = toNameCase(mergedUpdates.memberCustomaryCity);
  }
  if (mergedUpdates.memberCustomaryCounty) {
    mergedUpdates.memberCustomaryCounty = toNameCase(mergedUpdates.memberCustomaryCounty);
  }
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

const getSubmittingStaffIdentity = (user: unknown) => {
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

const withInferredCountyFromAddress = (patch: Record<string, string>) => {
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

const withoutCurrentAddressPrefill = (patch: Record<string, string>) => {
  const next = { ...patch };
  // Keep parsed/imported customary address fields.
  // This helper only prevents automatic location-type prefill defaults.
  next.memberCustomaryLocation = '';
  return next;
};

const EMPTY_SINGLE_AUTH_CONTACT_PREVIEW = {
  memberPhone: '',
  cellPhone: '',
  memberEmail: '',
};

const extractSingleAuthContactPreview = (patch: Record<string, string>) => ({
  memberPhone: String(patch.memberPhone || '').trim(),
  cellPhone: String(patch.contactPhone || '').trim(),
  memberEmail: String(patch.memberEmail || '').trim().toLowerCase(),
});

type KaiserIlsImportRow = {
  rowId: string;
  sourceType: 'spreadsheet' | 'single_auth_pdf';
  sourceFileName: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberMediCalNum: string;
  memberSex: string;
  clientId2: string;
  memberAddress: string;
  memberCity: string;
  memberZip: string;
  memberState: string;
  memberCounty: string;
  memberDob: string;
  memberPhone: string;
  memberEmail: string;
  contactPhone: string;
  contactEmail: string;
  referringOrganization: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  emergencyContactEmail: string;
  careManagerName: string;
  careManagerPhone: string;
  careManagerEmail: string;
  eligibilityCheckStatus: 'Pending' | 'CalAIM Eligible' | 'Not CalAIM Eligible';
  authorizationNumberT2038: string;
  authorizationStartT2038: string;
  authorizationEndT2038: string;
  kaiserStatus: string;
  dateReceivedRequestForAuthorization: string;
  dateOfReferralAuthorizationDecision: string;
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
  caspioExists: boolean;
  caspioMatchLabel: string;
  caspioMatchedClientId2: string;
  caspioMatchedBy: 'mrn' | 'medi_cal' | 'name' | '';
  mifMasterExists: boolean;
  mifMasterMatchLabel: string;
  mifMasterMatchedBy: 'client_id2' | 'mrn' | 'medi_cal' | 'name' | '';
  extraAdminNotes?: string;
};

const normalizeEligibilityStatus = (value: unknown): 'Pending' | 'CalAIM Eligible' | 'Not CalAIM Eligible' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Pending';
  if (normalized === 'calaim eligible' || normalized === 'eligible') return 'CalAIM Eligible';
  if (
    normalized === 'not calaim eligible' ||
    normalized === 'not eligible' ||
    normalized === 'ineligible'
  ) {
    return 'Not CalAIM Eligible';
  }
  return 'Pending';
};

const isIlsRowCreated = (row: KaiserIlsImportRow) =>
  Boolean(String(row.applicationId || '').trim()) || row.createStatus === 'created';
const isIlsRowLockedForSkeletonCreate = (row: KaiserIlsImportRow) =>
  isIlsRowCreated(row) || Boolean(row.caspioExists);
const getIlsRowCreateAppDedupeKey = (row: KaiserIlsImportRow) =>
  resolveIlsMifDedupeKey({
    memberFirstName: String(row.memberFirstName || '').trim(),
    memberLastName: String(row.memberLastName || '').trim(),
    memberMrn: String(row.memberMrn || '').trim(),
    memberMediCalNum: String(row.memberMediCalNum || '').trim(),
    memberDob: String(row.memberDob || '').trim(),
    clientId2: String(row.clientId2 || row.pushedClientId2 || '').trim(),
  });

const toSpreadsheetTrackingMembers = (rows: KaiserIlsImportRow[]) =>
  rows
    .filter((row) => row.sourceType === 'spreadsheet')
    .map((row) => ({
    rowId: row.rowId,
    memberFirstName: row.memberFirstName || '',
    memberLastName: row.memberLastName || '',
    memberMrn: row.memberMrn || '',
    memberCity: row.memberCity || '',
    caspioExists: Boolean(row.caspioExists),
    caspioMatchLabel: row.caspioMatchLabel || '',
    skeletonCreated: isIlsRowCreated(row),
    applicationId: row.applicationId || '',
    statusNote: row.statusNote || '',
    authorizationNumberT2038: row.authorizationNumberT2038 || '',
    authorizationStartT2038: row.authorizationStartT2038 || '',
    authorizationEndT2038: row.authorizationEndT2038 || '',
    kaiserStatus: row.kaiserStatus || '',
  }));

type IlsDuplicateMatch = {
  source: 'application';
  sourceId: string;
  sourceLabel: string;
  matchedAuthorization: string;
};

const CASPIO_CLIENT_ID_CONFLICT_WARNING =
  'This application already has Client_ID2. Delete the existing record in Caspio Clients Table and CalAIM Members tables before pushing again.';

const normalizeSheetHeader = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const normalizeLookupToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const buildMemberLookupNameKey = (firstName: unknown, lastName: unknown) =>
  `${normalizeLookupToken(firstName)}|${normalizeLookupToken(lastName)}`;

const pickIlsSheetName = (sheetNames: string[]): string => {
  if (!Array.isArray(sheetNames) || sheetNames.length === 0) return '';
  const exact = sheetNames.find((name) => normalizeLookupToken(name) === 'csmif');
  if (exact) return exact;
  const includes = sheetNames.find((name) => normalizeLookupToken(name).includes('csmif'));
  if (includes) return includes;
  return sheetNames[0] || '';
};

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

const normalizeUsZip = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const exact = text.match(/\b\d{5}(?:-\d{4})?\b/);
  if (exact?.[0]) return exact[0];
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 9) return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  if (digits.length >= 5) return digits.slice(0, 5);
  return text;
};

const getSpreadsheetValue = (row: Record<string, unknown>, aliases: string[]) => {
  const normalizedAlias = aliases.map((x) => normalizeSheetHeader(x));
  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    if (normalizedAlias.includes(nk)) return String(value ?? '').trim();
  }
  return '';
};

const getSpreadsheetRawValue = (row: Record<string, unknown>, aliases: string[]) => {
  const normalizedAlias = aliases.map((x) => normalizeSheetHeader(x));
  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    if (normalizedAlias.includes(nk)) return value;
  }
  return '';
};

const MIF_MAPPED_SHEET_HEADERS = [
  'Member First Name',
  'Member Last Name',
  'Medical Record Number (MRN)',
  'Medi-Cal Member Client Index Number (CIN)',
  'Medi Cal Member Client Index Number (CIN)',
  'Medi-Cal Member Client Index Number',
  'Medi Cal Member Client Index Number',
  'Member Client Index Number (CIN)',
  'MCP_CIN',
  'MCP CIN',
  'CIN',
  'Member Gender Code',
  'Member Gender',
  'Member Sex',
  'Gender',
  'Sex',
  'Client_ID2',
  'Client ID2',
  'client_ID2',
  'Member Residential City',
  'Member Residential Zip Code',
  'Member Resdidential Zip Code',
  'Member Resdential Zip Code',
  'Member Residential Zip',
  'Residential Zip Code',
  'Residential Zip',
  'Member Mailing Address',
  'Member Mailing City',
  'Member Mailing Zip Code',
  'Medi-Cal Coverage County',
  'Member County',
  'County',
  'Member Date of Birth',
  'Primary Phone Number',
  'Home Phone Number',
  'Referring Organization',
  'Referring Individual Name',
  'Referring Individual Phone Number',
  'Referring Individual Email Address',
  'Emergency/ Alternate Contact Name',
  'Emergency/Alternate Contact Name',
  'Emergency/Alternate Contact Relation',
  'Emergency/ Alternate Contact Relation',
  'Emergency/Alternate Contact Phone Number',
  'Emergency/ Alternate Contact Phone Number',
  'Emergency/Contact Alternate Contact Phone Number',
  'Emergency/Alternate Contact Email Address',
  'Emergency/ Alternate Contact Email Address',
  'Emergency/Alternate Contact Email',
  'Emergency Contact Email Address',
  'Emergency Contact Email',
  'Member Email Address',
  'Authorization Number',
  'Authorization Start Date',
  'Authorizatin End Date',
  'Authorization End Date',
  'Date Received Request for Authorization',
  'Date of Referral Authorization Decision',
];

const collectUnusedSpreadsheetNotes = (row: Record<string, unknown>) => {
  const consumed = new Set(MIF_MAPPED_SHEET_HEADERS.map((header) => normalizeSheetHeader(header)));
  const lines: string[] = [];
  for (const [key, value] of Object.entries(row || {})) {
    const label = String(key || '').replace(/\s+/g, ' ').trim();
    const nk = normalizeSheetHeader(label);
    if (!nk || consumed.has(nk) || /^empty/i.test(nk) || nk.startsWith('__')) continue;
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text || text === '0' || text.toLowerCase() === 'n/a' || text.toLowerCase() === 'na') continue;
    if (text.length > 400) continue;
    lines.push(`${label}: ${text}`);
  }
  return lines;
};

const extractSpreadsheetMediCalNumber = (row: Record<string, unknown>) => {
  const direct = getSpreadsheetValue(row, [
    'Medi-Cal Member Client Index Number (CIN)',
    'Medi Cal Member Client Index Number (CIN)',
    'Medi-Cal Member Client Index Number',
    'Medi Cal Member Client Index Number',
    'Member Client Index Number (CIN)',
    'MCP_CIN',
    'MCP CIN',
    'MCP CIN Number',
    'Medi-Cal Number',
    'Medi Cal Number',
    'Medical Number',
    'Member Medical Number',
    'Member Medi-Cal Number',
    'Member Medi Cal Number',
    'CIN',
    'CIN Number',
  ]);
  if (String(direct || '').trim()) return normalizeMediCalNumber(direct);

  // Fallback for spreadsheets where XLSX de-duplicates repeated headers
  // (e.g. appending `_1`) or where CIN headers vary slightly.
  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    const looksLikeCinHeader =
      (nk.includes('clientindexnumber') && nk.includes('cin')) ||
      (nk.includes('mcp') && nk.includes('cin')) ||
      nk === 'cin' ||
      nk === 'cinnumber' ||
      (nk.includes('medicalnumber') && !nk.includes('medicalrecord'));
    if (!looksLikeCinHeader) continue;
    const candidate = normalizeMediCalNumber(value);
    if (candidate) return candidate;
  }

  return '';
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
  const [kaiserStaffList, setKaiserStaffList] = useState<Array<{ uid: string; displayName: string; email: string }>>([]);
  const [isLoadingKaiserStaff, setIsLoadingKaiserStaff] = useState(false);
  const [selectedAssignedStaffId, setSelectedAssignedStaffId] = useState('');
  const [selectedAssignedStaffName, setSelectedAssignedStaffName] = useState('');
  const [selectedStaffActionItemCount, setSelectedStaffActionItemCount] = useState(0);
  const [eligibilityScreenshotFiles, setEligibilityScreenshotFiles] = useState<File[]>([]);
  const [serviceRequestFile, setServiceRequestFile] = useState<File | null>(null);
  const [serviceRequestFiles, setServiceRequestFiles] = useState<File[]>([]);
  const [isParsingServiceRequest, setIsParsingServiceRequest] = useState(false);
  const [serviceRequestParsedFields, setServiceRequestParsedFields] = useState<string[]>([]);
  const [serviceRequestWarnings, setServiceRequestWarnings] = useState<string[]>([]);
  const [, setServiceRequestParseMode] = useState<'none' | 'text' | 'vision'>('none');
  const [serviceRequestTextPreview, setServiceRequestTextPreview] = useState('');
  const [ilsRowEligibilityFiles, setIlsRowEligibilityFiles] = useState<Record<string, File[]>>({});
  const [singleAuthContactPreview, setSingleAuthContactPreview] = useState<{
    memberPhone: string;
    cellPhone: string;
    memberEmail: string;
  }>(EMPTY_SINGLE_AUTH_CONTACT_PREVIEW);
  const [ilsSpreadsheetFileName, setIlsSpreadsheetFileName] = useState('');
  const [ilsImportRows, setIlsImportRows] = useState<KaiserIlsImportRow[]>([]);
  const [ilsImportSelected, setIlsImportSelected] = useState<Record<string, boolean>>({});
  const [pickedIlsRowId, setPickedIlsRowId] = useState('');
  const [activeSpreadsheetUploadLogId, setActiveSpreadsheetUploadLogId] = useState('');
  const [showOnlyNotInCaspio, setShowOnlyNotInCaspio] = useState(false);
  const [ilsPickerSearch, setIlsPickerSearch] = useState('');
  const [isExcludingFromCreateApp, setIsExcludingFromCreateApp] = useState(false);
  const [isParsingIlsSpreadsheet, setIsParsingIlsSpreadsheet] = useState(false);
  const [isCheckingCaspioExisting, setIsCheckingCaspioExisting] = useState(false);
  const [hasMifCaspioRefresh, setHasMifCaspioRefresh] = useState(false);
  const [mifLastCaspioRefreshAtIso, setMifLastCaspioRefreshAtIso] = useState('');
  const [consolidatorRuns, setConsolidatorRuns] = useState<IlsMifConsolidationRunRecord[]>([]);
  const [consolidatorUploadedFiles, setConsolidatorUploadedFiles] = useState<IlsMifUploadedFileRecord[]>([]);
  const [selectedConsolidatorRunId, setSelectedConsolidatorRunId] = useState('');
  const [createAppLoadedRunId, setCreateAppLoadedRunId] = useState('');
  const [createAppLoadedAtIso, setCreateAppLoadedAtIso] = useState('');
  const [isLoadingConsolidatorRuns, setIsLoadingConsolidatorRuns] = useState(false);
  const [mifMasterSearchMrn, setMifMasterSearchMrn] = useState('');
  const [mifMasterSearchLastName, setMifMasterSearchLastName] = useState('');
  const [mifMasterSearchFirstName, setMifMasterSearchFirstName] = useState('');
  const [mifMasterSearchMediCal, setMifMasterSearchMediCal] = useState('');
  const [isSearchingMifMaster, setIsSearchingMifMaster] = useState(false);
  const [mifMasterSearchResult, setMifMasterSearchResult] = useState<{
    exists: boolean;
    matchLabel: string;
    matchedBy: string;
    queriedAs: string;
    runLabel?: string;
  } | null>(null);
  const [singleAuthMifMasterHit, setSingleAuthMifMasterHit] = useState<{
    exists: boolean;
    matchLabel: string;
    matchedBy: string;
    runLabel?: string;
    caspioExists?: boolean;
    caspioMatchLabel?: string;
    alreadyInApp?: boolean;
    existingApplicationIds?: string[];
  } | null>(null);
  const [checkingRowDuplicates, setCheckingRowDuplicates] = useState<Record<string, boolean>>({});
  const [ilsRowDuplicateMatches, setIlsRowDuplicateMatches] = useState<Record<string, IlsDuplicateMatch[]>>({});
  const [isCreatingIlsRecords, setIsCreatingIlsRecords] = useState(false);
  const [isDeletingCreatedIlsRecords, setIsDeletingCreatedIlsRecords] = useState(false);
  const [isPushingIlsRows, setIsPushingIlsRows] = useState(false);
  const [sendingIlsDecisionRowId, setSendingIlsDecisionRowId] = useState('');
  const [ilsDecisionLogByRowId, setIlsDecisionLogByRowId] = useState<Record<string, IlsDecisionLogState>>({});
  const [pendingIlsDecisionDraft, setPendingIlsDecisionDraft] = useState<IlsDecisionPreviewDraft | null>(null);
  const [isLoadingIntroEmailPreview, setIsLoadingIntroEmailPreview] = useState(false);
  const [isSendingIntroEmail, setIsSendingIntroEmail] = useState(false);
  const navigationFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateWithHardFallback = useCallback((target: string) => {
    const destination = String(target || '').trim();
    if (!destination) return;
    if (navigationFallbackTimerRef.current) {
      clearTimeout(navigationFallbackTimerRef.current);
      navigationFallbackTimerRef.current = null;
    }
    if (typeof window === 'undefined') {
      router.push(destination);
      return;
    }
    const startPath = `${window.location.pathname}${window.location.search}`;
    try {
      router.push(destination);
      navigationFallbackTimerRef.current = window.setTimeout(() => {
        try {
          const expected = new URL(destination, window.location.origin);
          const currentPath = `${window.location.pathname}${window.location.search}`;
          const expectedPath = `${expected.pathname}${expected.search}`;
          // Only force hard navigation if we are still on the same page where
          // navigation started (prevents stale fallback from hijacking later clicks).
          if (currentPath === startPath && currentPath !== expectedPath) {
            window.location.assign(expected.href);
          }
        } catch {
          window.location.assign(destination);
        }
      }, 1200);
    } catch {
      window.location.assign(destination);
    }
  }, [router]);

  useEffect(() => {
    return () => {
      if (navigationFallbackTimerRef.current) {
        clearTimeout(navigationFallbackTimerRef.current);
        navigationFallbackTimerRef.current = null;
      }
    };
  }, []);
  const [introEmailDraft, setIntroEmailDraft] = useState<{
    to: string;
    subject: string;
    message: string;
    senderFrom?: string;
    senderWarning?: string;
    senderUsesFallbackFrom?: boolean;
  } | null>(null);
  const [lastCreatedSkeleton, setLastCreatedSkeleton] = useState<{ applicationId: string; memberName: string; clientId2: string } | null>(null);
  const ilsSpreadsheetInputRef = useRef<HTMLInputElement | null>(null);
  const serviceRequestFileInputRef = useRef<HTMLInputElement | null>(null);
  const parseAbortControllerRef = useRef<AbortController | null>(null);
  const parsedSingleAuthFilesRef = useRef<Record<string, File>>({});
  const ilsSpreadsheetSourceFileRef = useRef<File | null>(null);
  const ilsDuplicateIndexWarningShownRef = useRef(false);
  const spreadsheetLogPermissionWarnedRef = useRef(false);
  const createApplicationRef = useRef<() => Promise<string | null> | string | null>(() => null);
  const [memberData, setMemberData] = useState(getEmptyMemberData);

  useEffect(() => {
    const intakeSource = String(searchParams.get('intakeSource') || '').trim().toLowerCase();
    const intakeAlias = String(searchParams.get('intake') || '').trim().toLowerCase();
    const fromConsolidator = searchParams.get('fromConsolidator') === '1';
    if (
      fromConsolidator ||
      intakeSource === 'ils_single_authorization_sheet' ||
      intakeSource === 'ils_spreadsheet_batch' ||
      intakeAlias === 'ils_mif' ||
      intakeAlias === 'kaiser_auth_received_via_ils'
    ) {
      setIntakeType('kaiser_auth_received_via_ils');
      if (typeof window !== 'undefined' && (window.location.hash.includes('kaiser-auth-received-via-ils') || window.location.hash.includes('kaiser-ils-datapage'))) {
        window.setTimeout(() => {
          document
            .getElementById('kaiser-ils-datapage')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }
      return;
    }
    if (!intakeSource) return;
    if (intakeSource === 'family_call') {
      setIntakeType('standard');
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
            return { uid: d.id, displayName, email };
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
    const city = String(memberData.memberCustomaryCity || '').trim();
    const zip = String(memberData.memberCustomaryZip || '').trim();
    if (String(memberData.memberCustomaryCounty || '').trim()) return;
    if (!city && !zip) return;
    const inferredCounty = inferCountyFromCityZip({ city, zip });
    if (!inferredCounty) return;
    setMemberData((prev) => {
      if (String(prev.memberCustomaryCounty || '').trim()) return prev;
      return {
        ...prev,
        memberCustomaryCounty: toNameCase(inferredCounty),
      };
    });
  }, [memberData.memberCustomaryCity, memberData.memberCustomaryZip, memberData.memberCustomaryCounty]);

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

  const sendStaffAssignmentWorkflowEmail = async (params: {
    applicationId: string;
    appUserId: string;
    staffId: string;
    staffName: string;
    memberName: string;
    memberMrn?: string;
    memberCounty?: string;
    serviceDeliveryFormUrl?: string;
    serviceDeliveryFormFileName?: string;
    serviceDeliveryFormFilePath?: string;
    kaiserStatus?: string;
    assignedBy: string;
    alreadyPushedToCaspio?: boolean;
  }) => {
    const staffEmail = String(
      kaiserStaffList.find((staff) => staff.uid === params.staffId)?.email || ''
    ).trim();
    const res = await fetch('/api/admin/send-staff-assignment-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId: params.applicationId,
        appUserId: params.appUserId,
        staffId: params.staffId,
        staffName: params.staffName,
        to: staffEmail || undefined,
        memberName: params.memberName,
        memberMrn: params.memberMrn || '',
        memberCounty: params.memberCounty || '',
        serviceDeliveryFormUrl: String(params.serviceDeliveryFormUrl || '').trim(),
        serviceDeliveryFormFileName: String(params.serviceDeliveryFormFileName || '').trim(),
        serviceDeliveryFormFilePath: String(params.serviceDeliveryFormFilePath || '').trim(),
        kaiserStatus: String(params.kaiserStatus || '').trim(),
        calaimStatus: 'Authorized',
        assignedBy: params.assignedBy,
        alreadyPushedToCaspio: Boolean(params.alreadyPushedToCaspio),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(String(data?.error || 'Failed to send staff assignment email.'));
    }
  };

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

  const uploadIlsRowEligibilityFiles = async (applicationId: string, rowId: string) => {
    const files = Array.isArray(ilsRowEligibilityFiles[rowId]) ? ilsRowEligibilityFiles[rowId] : [];
    if (!storage || files.length === 0) return [];
    const uploads = files.map((file) => {
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

  const uploadIntakeSourceFile = async (params: {
    applicationId: string;
    file: File;
    sourceLabel: string;
    sourceTag: string;
  }) => {
    if (!storage) return null;
    const safeFileName = params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `applications/${params.applicationId}/original-intake/${Date.now()}-${safeFileName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, params.file);
    await new Promise<void>((resolve, reject) => {
      uploadTask.on('state_changed', undefined, reject, () => resolve());
    });
    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
    return {
      name: params.sourceLabel,
      status: 'Completed',
      type: 'Upload',
      href: '#',
      fileName: params.file.name,
      filePath: storagePath,
      downloadURL,
      dateCompleted: new Date().toISOString(),
      source: params.sourceTag,
      uploadedFiles: [{ fileName: params.file.name, filePath: storagePath, downloadURL }],
    } as any;
  };

  const createSpreadsheetServiceDeliveryPlaceholder = async (params: {
    applicationId: string;
    row: KaiserIlsImportRow;
  }) => {
    const storageClient = storage || getStorage();
    if (!storageClient) return null;
    const selectedRun = consolidatorRuns.find(
      (run) =>
        run.id ===
        String(selectedConsolidatorRunId || createAppLoadedRunId || '').trim()
    );
    const uploaded = await uploadMifServiceDeliveryForm({
      storage: storageClient,
      applicationId: params.applicationId,
      identity: {
        memberFirstName: params.row.memberFirstName,
        memberLastName: params.row.memberLastName,
        memberMrn: params.row.memberMrn,
        memberMediCalNum: params.row.memberMediCalNum,
        memberSex: params.row.memberSex,
        memberDob: params.row.memberDob,
        memberPhone: params.row.memberPhone,
        memberEmail: params.row.memberEmail,
        memberAddress: params.row.memberAddress,
        memberCity: params.row.memberCity,
        memberState: params.row.memberState,
        memberZip: params.row.memberZip,
        memberCounty: params.row.memberCounty,
        contactPhone: params.row.contactPhone,
        contactEmail: params.row.contactEmail,
        referringOrganization: params.row.referringOrganization,
        emergencyContactName: params.row.emergencyContactName,
        emergencyContactRelationship: params.row.emergencyContactRelationship,
        emergencyContactPhone: params.row.emergencyContactPhone,
        emergencyContactEmail: params.row.emergencyContactEmail,
        careManagerName: params.row.careManagerName,
        careManagerPhone: params.row.careManagerPhone,
        careManagerEmail: params.row.careManagerEmail,
        authorizationNumberT2038: params.row.authorizationNumberT2038,
        authorizationStartT2038: params.row.authorizationStartT2038,
        authorizationEndT2038: params.row.authorizationEndT2038,
        dateReceivedRequestForAuthorization: params.row.dateReceivedRequestForAuthorization,
        dateOfReferralAuthorizationDecision: params.row.dateOfReferralAuthorizationDecision,
        diagnosticCode: params.row.diagnosticCode,
        cptCode: params.row.cptCode,
        kaiserStatus: params.row.kaiserStatus,
        sourceFileName: params.row.sourceFileName,
        sourceType: params.row.sourceType,
        eligibilityCheckStatus: params.row.eligibilityCheckStatus,
        caspioExists: params.row.caspioExists,
        mifMasterExists: params.row.mifMasterExists,
      },
      extraFileNames: [
        ilsSpreadsheetFileName,
        ...(Array.isArray(selectedRun?.sourceFiles) ? selectedRun.sourceFiles : []),
      ],
    });
    return uploaded.formRecord as any;
  };

  const normalizeAuthorizationValue = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const checkRowDuplicateAuthorizationByMrn = async (row: KaiserIlsImportRow) => {
    const rowId = String(row?.rowId || '').trim();
    const mrn = String(row?.memberMrn || '').trim();
    const authNumber = String(row?.authorizationNumberT2038 || '').trim();
    const authStart = String(row?.authorizationStartT2038 || '').trim();
    const authEnd = String(row?.authorizationEndT2038 || '').trim();
    const normalizedAuth = normalizeAuthorizationValue(authNumber);
    const fallbackAuthKey =
      authStart && authEnd ? `${normalizeAuthorizationValue(authStart)}|${normalizeAuthorizationValue(authEnd)}` : '';
    if (!rowId) return;
    if (!firestore || !mrn || (!normalizedAuth && !fallbackAuthKey)) {
      setIlsRowDuplicateMatches((prev) => ({ ...prev, [rowId]: [] }));
      return;
    }

    setCheckingRowDuplicates((prev) => ({ ...prev, [rowId]: true }));
    try {
      const adminAppsSnap = await getDocs(query(collection(firestore, 'applications'), where('memberMrn', '==', mrn)));
      let userAppsDocs: Array<any> = [];
      try {
        const userAppsSnap = await getDocs(query(collectionGroup(firestore, 'applications'), where('memberMrn', '==', mrn)));
        userAppsDocs = userAppsSnap.docs;
      } catch (groupError: any) {
        const code = String(groupError?.code || '').trim().toLowerCase();
        const msg = String(groupError?.message || '').toLowerCase();
        const missingIndex = code === 'failed-precondition' || msg.includes('requires a collection_group') || msg.includes('index');
        if (!missingIndex) throw groupError;
        if (!ilsDuplicateIndexWarningShownRef.current) {
          ilsDuplicateIndexWarningShownRef.current = true;
          toast({
            title: 'Duplicate check limited',
            description: 'Cross-user duplicate checks are temporarily limited until the Firestore index is available.',
          });
        }
      }

      const matches: IlsDuplicateMatch[] = [];

      adminAppsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const existingAuth = String(data?.Authorization_Number_T038 || '').trim();
        const existingStart = String(data?.Authorization_Start_T2038 || '').trim();
        const existingEnd = String(data?.Authorization_End_T2038 || '').trim();
        const normalizedExistingAuth = normalizeAuthorizationValue(existingAuth);
        const existingFallbackAuthKey =
          existingStart && existingEnd
            ? `${normalizeAuthorizationValue(existingStart)}|${normalizeAuthorizationValue(existingEnd)}`
            : '';

        const authMatches =
          (normalizedAuth && normalizedExistingAuth && normalizedAuth === normalizedExistingAuth) ||
          (!normalizedAuth && fallbackAuthKey && existingFallbackAuthKey && fallbackAuthKey === existingFallbackAuthKey);
        if (!authMatches) return;
        matches.push({
          source: 'application',
          sourceId: docSnap.id,
          sourceLabel: `Application ${docSnap.id}`,
          matchedAuthorization: existingAuth || `${existingStart} - ${existingEnd}` || 'Authorization match',
        });
      });

      userAppsDocs.forEach((docSnap: any) => {
        const data = docSnap.data() as any;
        const existingAuth = String(data?.Authorization_Number_T038 || '').trim();
        const existingStart = String(data?.Authorization_Start_T2038 || '').trim();
        const existingEnd = String(data?.Authorization_End_T2038 || '').trim();
        const normalizedExistingAuth = normalizeAuthorizationValue(existingAuth);
        const existingFallbackAuthKey =
          existingStart && existingEnd
            ? `${normalizeAuthorizationValue(existingStart)}|${normalizeAuthorizationValue(existingEnd)}`
            : '';

        const authMatches =
          (normalizedAuth && normalizedExistingAuth && normalizedAuth === normalizedExistingAuth) ||
          (!normalizedAuth && fallbackAuthKey && existingFallbackAuthKey && fallbackAuthKey === existingFallbackAuthKey);
        if (!authMatches) return;
        matches.push({
          source: 'application',
          sourceId: docSnap.id,
          sourceLabel: `Application ${docSnap.id}`,
          matchedAuthorization: existingAuth || `${existingStart} - ${existingEnd}` || 'Authorization match',
        });
      });

      const dedup = new Map<string, IlsDuplicateMatch>();
      matches.forEach((match) => {
        dedup.set(`${match.source}:${match.sourceId}:${normalizeAuthorizationValue(match.matchedAuthorization)}`, match);
      });

      setIlsRowDuplicateMatches((prev) => ({ ...prev, [rowId]: Array.from(dedup.values()) }));
    } catch (error) {
      console.warn('Duplicate check failed:', error);
      setIlsRowDuplicateMatches((prev) => ({ ...prev, [rowId]: [] }));
    } finally {
      setCheckingRowDuplicates((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  const selectedIlsRows = useMemo(
    () =>
      ilsImportRows.filter(
        (row) => Boolean(ilsImportSelected[row.rowId]) && !isIlsRowLockedForSkeletonCreate(row)
      ),
    [ilsImportRows, ilsImportSelected]
  );
  const selectedCreatedIlsRows = useMemo(
    () => selectedIlsRows.filter((row) => Boolean(String(row.applicationId || '').trim())),
    [selectedIlsRows]
  );
  const caspioExistingRowCount = useMemo(
    () => ilsImportRows.filter((row) => row.caspioExists).length,
    [ilsImportRows]
  );
  const nonCaspioRowCount = useMemo(
    () => ilsImportRows.filter((row) => !row.caspioExists).length,
    [ilsImportRows]
  );
  const ilsPickerRows = useMemo(
    () => {
      const baseRows = showOnlyNotInCaspio ? ilsImportRows.filter((row) => !row.caspioExists) : ilsImportRows;
      const needle = normalizeLookupToken(ilsPickerSearch);
      if (!needle) return baseRows;
      return baseRows.filter((row) => {
        const first = String(row.memberFirstName || '').trim();
        const last = String(row.memberLastName || '').trim();
        const fullName = `${first} ${last}`.trim();
        const reverseName = `${last}, ${first}`.trim().replace(/^,\s*/, '');
        const mrn = String(row.memberMrn || '').trim();
        const cin = String(row.memberMediCalNum || '').trim();
        return [
          normalizeLookupToken(first),
          normalizeLookupToken(last),
          normalizeLookupToken(fullName),
          normalizeLookupToken(reverseName),
          normalizeLookupToken(mrn),
          normalizeLookupToken(cin),
        ].some((token) => token.includes(needle));
      });
    },
    [ilsImportRows, showOnlyNotInCaspio, ilsPickerSearch]
  );

  const syncSpreadsheetUploadLog = async (params: {
    uploadLogId: string;
    fileName: string;
    rows: KaiserIlsImportRow[];
    isNewUpload?: boolean;
  }) => {
    if (!firestore || !params.uploadLogId) return;
    const logRef = doc(firestore, 'ils_spreadsheet_upload_logs', params.uploadLogId);
    const uploadedBy = String(user?.displayName || user?.email || 'Unknown').trim();
    const trackedMembers = toSpreadsheetTrackingMembers(params.rows);
    const payload: Record<string, unknown> = {
      uploadLogId: params.uploadLogId,
      fileName: params.fileName || 'Unknown Spreadsheet',
      uploadedBy,
      uploadedByUid: String(user?.uid || '').trim() || '',
      members: trackedMembers,
      totalMembers: trackedMembers.length,
      caspioMatchedMembers: trackedMembers.filter((row) => Boolean(row.caspioExists)).length,
      skeletonCreatedMembers: trackedMembers.filter((row) => Boolean(row.skeletonCreated)).length,
      lastSyncedAt: serverTimestamp(),
    };
    if (params.isNewUpload) {
      payload.createdAt = serverTimestamp();
    }
    try {
      await setDoc(logRef, payload, { merge: true });
    } catch (error: any) {
      const code = String(error?.code || '').trim().toLowerCase();
      const message = String(error?.message || '').toLowerCase();
      const isPermissionError =
        code.includes('permission-denied') ||
        message.includes('permission-denied') ||
        message.includes('missing or insufficient permissions');
      if (isPermissionError && !spreadsheetLogPermissionWarnedRef.current) {
        spreadsheetLogPermissionWarnedRef.current = true;
        toast({
          title: 'Spreadsheet status tracking is blocked',
          description:
            'Your upload and skeleton workflow still works. Spreadsheet history logging is disabled until Firestore permissions are updated.',
          variant: 'default',
        });
      } else if (!isPermissionError) {
        console.warn('Spreadsheet upload log sync failed:', error);
      }
    }
  };

  useEffect(() => {
    if (!activeSpreadsheetUploadLogId || !ilsSpreadsheetFileName) return;
    const timeout = setTimeout(() => {
      void syncSpreadsheetUploadLog({
        uploadLogId: activeSpreadsheetUploadLogId,
        fileName: ilsSpreadsheetFileName,
        rows: ilsImportRows,
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [activeSpreadsheetUploadLogId, ilsSpreadsheetFileName, ilsImportRows]);

  const loadLatestIlsMifMasterMembers = async () => {
    if (!firestore) {
      return { members: [] as Array<Partial<IlsMifMasterRow>>, runId: '', runLabel: '' };
    }
    let runId = String(selectedConsolidatorRunId || '').trim();
    if (!runId) {
      const metaSnap = await getDoc(doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta'));
      runId = String(metaSnap.exists() ? metaSnap.data()?.latestRunId || '' : '').trim();
    }
    if (!runId && consolidatorRuns[0]?.id) runId = consolidatorRuns[0].id;

    let members: Array<Partial<IlsMifMasterRow>> = [];
    let runLabel = runId;
    if (runId) {
      const [runSnap, memberSnap] = await Promise.all([
        getDoc(doc(firestore, ILS_MIF_CONSOLIDATION_RUNS_COLLECTION, runId)),
        getDocs(
          collection(
            firestore,
            ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
            runId,
            ILS_MIF_RUN_MEMBERS_SUBCOLLECTION
          )
        ),
      ]);
      if (runSnap.exists()) {
        const data = runSnap.data() || {};
        const createdAtIso = String(data.createdAtIso || '').trim();
        runLabel =
          String(data.label || '').trim() ||
          (createdAtIso ? new Date(createdAtIso).toLocaleString() : runId);
      }
      memberSnap.forEach((docSnap) => {
        const data = docSnap.data() as Partial<IlsMifMasterRow>;
        if (!data?.memberFirstName && !data?.memberLastName && !data?.memberMrn && !data?.memberMediCalNum) return;
        members.push({ ...data, rowId: String(data.rowId || docSnap.id) });
      });
    }

    if (!members.length) {
      const snap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
      snap.forEach((docSnap) => {
        if (docSnap.id === '_meta') return;
        members.push(docSnap.data() as Partial<IlsMifMasterRow>);
      });
      if (!runLabel) runLabel = 'shared master list';
    }
    return { members, runId, runLabel };
  };

  const annotateRowsWithMifMasterList = async (rows: KaiserIlsImportRow[]) => {
    if (!rows.length) return rows;
    if (!firestore) {
      return rows.map((row) => ({
        ...row,
        mifMasterExists: false,
        mifMasterMatchLabel: '',
        mifMasterMatchedBy: '' as const,
      }));
    }
    try {
      const { members } = await loadLatestIlsMifMasterMembers();
      return annotateIdentityRowsAgainstMasterMembers(rows, members);
    } catch (error) {
      console.warn('Failed to annotate rows against consolidated MIF master list:', error);
      toast({
        title: 'MIF master check unavailable',
        description: 'Could not check the latest consolidated MIF master list. Caspio matching still applies.',
      });
      return rows.map((row) => ({
        ...row,
        mifMasterExists: Boolean(row.mifMasterExists),
        mifMasterMatchLabel: String(row.mifMasterMatchLabel || ''),
        mifMasterMatchedBy: row.mifMasterMatchedBy || '',
      }));
    }
  };

  const lookupIdentityOnMifMaster = async (identity: {
    memberFirstName?: string;
    memberLastName?: string;
    memberMrn?: string;
    memberMediCalNum?: string;
    clientId2?: string;
  }) => {
    if (!firestore) {
      throw new Error('Firestore unavailable');
    }
    const { members, runLabel } = await loadLatestIlsMifMasterMembers();
    const probe = {
      memberFirstName: String(identity.memberFirstName || '').trim(),
      memberLastName: String(identity.memberLastName || '').trim(),
      memberMrn: String(identity.memberMrn || '').trim(),
      memberMediCalNum: String(identity.memberMediCalNum || '').trim(),
      clientId2: String(identity.clientId2 || '').trim(),
    };
    if (!probe.memberFirstName && !probe.memberLastName && !probe.memberMrn && !probe.memberMediCalNum && !probe.clientId2) {
      return {
        exists: false,
        matchLabel: '',
        matchedBy: '' as const,
        queriedAs: '',
        runLabel,
      };
    }
    const [annotated] = annotateIdentityRowsAgainstMasterMembers([probe], members);
    const queriedAs = [
      probe.memberLastName || probe.memberFirstName
        ? `${probe.memberLastName || ''}, ${probe.memberFirstName || ''}`.replace(/^,\s*|,\s*$/g, '').trim()
        : '',
      probe.memberMrn ? `MRN ${probe.memberMrn}` : '',
      probe.memberMediCalNum ? `CIN ${probe.memberMediCalNum}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      exists: Boolean(annotated.mifMasterExists),
      matchLabel: String(annotated.mifMasterMatchLabel || ''),
      matchedBy: annotated.mifMasterMatchedBy || '',
      queriedAs,
      runLabel,
    };
  };

  const searchMifMasterList = async () => {
    const identity = {
      memberFirstName: mifMasterSearchFirstName,
      memberLastName: mifMasterSearchLastName,
      memberMrn: mifMasterSearchMrn,
      memberMediCalNum: mifMasterSearchMediCal,
    };
    if (
      !String(identity.memberFirstName || '').trim() &&
      !String(identity.memberLastName || '').trim() &&
      !String(identity.memberMrn || '').trim() &&
      !String(identity.memberMediCalNum || '').trim()
    ) {
      toast({
        title: 'Enter search criteria',
        description: 'Use MRN, Medi-Cal/CIN, and/or first + last name to check the consolidated MIF master list.',
      });
      return;
    }
    setIsSearchingMifMaster(true);
    try {
      const result = await lookupIdentityOnMifMaster(identity);
      setMifMasterSearchResult(result);
      toast({
        title: result.exists ? 'On latest consolidated MIF master' : 'Not on latest consolidated MIF master',
        description: result.exists
          ? `Matched by ${result.matchedBy || 'identity'}${result.matchLabel ? `: ${result.matchLabel}` : ''}${
              result.runLabel ? ` · ${result.runLabel}` : ''
            }.`
          : `No master-list match for ${result.queriedAs || 'that search'}${
              result.runLabel ? ` (${result.runLabel})` : ''
            }.`,
        className: result.exists
          ? 'bg-indigo-100 text-indigo-950 border-indigo-200'
          : 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'MIF master search failed',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setIsSearchingMifMaster(false);
    }
  };

  const checkParsedIdentityAgainstMifAndCaspio = async (identity: {
    memberFirstName?: string;
    memberLastName?: string;
    memberMrn?: string;
    memberMediCalNum?: string;
    clientId2?: string;
  }) => {
    try {
      const mif = await lookupIdentityOnMifMaster(identity);
      const probeRow = {
        rowId: 'single-auth-probe',
        sourceType: 'single_auth_pdf',
        sourceFileName: '',
        memberFirstName: String(identity.memberFirstName || '').trim(),
        memberLastName: String(identity.memberLastName || '').trim(),
        memberMrn: String(identity.memberMrn || '').trim(),
        memberMediCalNum: String(identity.memberMediCalNum || '').trim(),
        clientId2: String(identity.clientId2 || '').trim(),
        memberDob: '',
        memberSex: '',
        memberAddress: '',
        memberCity: '',
        memberZip: '',
        memberState: '',
        memberCounty: '',
        memberPhone: '',
        memberEmail: '',
        contactPhone: '',
        contactEmail: '',
        referringOrganization: '',
        emergencyContactName: '',
        emergencyContactRelationship: '',
        emergencyContactPhone: '',
        emergencyContactEmail: '',
        careManagerName: '',
        careManagerPhone: '',
        careManagerEmail: '',
        eligibilityCheckStatus: 'Pending',
        authorizationNumberT2038: '',
        authorizationStartT2038: '',
        authorizationEndT2038: '',
        kaiserStatus: '',
        dateReceivedRequestForAuthorization: '',
        dateOfReferralAuthorizationDecision: '',
        cptCode: '',
        diagnosticCode: '',
        assignedStaffId: '',
        assignedStaffName: '',
        createStatus: 'idle',
        pushStatus: 'idle',
        deleteStatus: 'idle',
        statusNote: '',
        applicationId: '',
        pushedClientId2: '',
        caspioExists: false,
        caspioMatchLabel: '',
        caspioMatchedClientId2: '',
        caspioMatchedBy: '',
        mifMasterExists: mif.exists,
        mifMasterMatchLabel: mif.matchLabel,
        mifMasterMatchedBy: mif.matchedBy,
      } as KaiserIlsImportRow;
      const [caspio] = await annotateRowsWithCaspioExists([probeRow]);
      let existing: Awaited<ReturnType<typeof findExistingApplicationsForMember>> = [];
      if (firestore) {
        existing = await findExistingApplicationsForMember(firestore, {
          memberMrn: identity.memberMrn,
          memberMediCalNum: identity.memberMediCalNum,
        });
      }
      setSingleAuthMifMasterHit({
        exists: mif.exists,
        matchLabel: mif.matchLabel,
        matchedBy: mif.matchedBy,
        runLabel: mif.runLabel,
        caspioExists: Boolean(caspio?.caspioExists),
        caspioMatchLabel: String(caspio?.caspioMatchLabel || ''),
        alreadyInApp: existing.length > 0,
        existingApplicationIds: existing.map((item) => item.applicationId),
      });
      const hits: string[] = [];
      if (caspio?.caspioExists) {
        hits.push(`Caspio${caspio.caspioMatchLabel ? ` (${caspio.caspioMatchLabel})` : ''}`);
      }
      if (existing.length) {
        hits.push(`application ${existing[0].applicationId}`);
      }
      if (mif.exists) {
        hits.push(
          `latest MIF master${mif.matchLabel ? ` (${mif.matchLabel})` : ''}${
            mif.runLabel ? ` · ${mif.runLabel}` : ''
          }`
        );
      }
      if (hits.length) {
        toast({
          variant: caspio?.caspioExists || existing.length ? 'destructive' : 'default',
          title: 'Possible duplicate — review before skeleton create',
          description: `This member already appears in ${hits.join(' and ')}.`,
          className:
            caspio?.caspioExists || existing.length
              ? undefined
              : 'bg-amber-100 text-amber-950 border-amber-200',
        });
      }
    } catch (error) {
      console.warn('Single-auth duplicate check failed:', error);
      setSingleAuthMifMasterHit(null);
    }
  };

  const annotateRowsWithCaspioAndMifMaster = async (rows: KaiserIlsImportRow[]) => {
    const withCaspio = await annotateRowsWithCaspioExists(rows);
    return annotateRowsWithMifMasterList(withCaspio);
  };

  const annotateRowsWithCaspioExists = async (rows: KaiserIlsImportRow[]) => {
    if (!rows.length) return rows;
    setIsCheckingCaspioExisting(true);
    try {
      const response = await fetch('/api/kaiser-members?source=caspio&refresh=1', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success || !Array.isArray(data?.members)) {
        throw new Error(data?.error || `Failed to check existing Caspio members (HTTP ${response.status})`);
      }

      const byMrn = new Map<string, { label: string; clientId2: string }>();
      const byMediCal = new Map<string, { label: string; clientId2: string }>();
      const byName = new Map<string, { label: string; clientId2: string }>();
      const byClientId2 = new Map<string, { label: string; clientId2: string }>();

      (data.members as any[]).forEach((member) => {
        const raw = (member?.caspioRaw || {}) as Record<string, unknown>;
        const firstName = String(member?.memberFirstName || member?.Senior_First || '').trim();
        const lastName = String(member?.memberLastName || member?.Senior_Last || '').trim();
        const label = `${lastName}, ${firstName}`.trim().replace(/^,\s*/, '') || 'Caspio Member';
        const clientId2 = String(member?.client_ID2 || member?.Client_ID2 || '').trim();
        const signals = extractIdentitySignals(
          {
            ...raw,
            ...member,
            memberFirstName: firstName,
            memberLastName: lastName,
            clientId2,
          },
          {
            firstNameFields: ['memberFirstName', 'Senior_First', 'First_Name'],
            lastNameFields: ['memberLastName', 'Senior_Last', 'Last_Name'],
            mrnFields: ['Member_MRN', 'MRN', 'Medical_Record_Number', 'memberMrn'],
            mediCalFields: ['memberMediCalNum', 'MediCal_Number', 'MCP_CIN', 'Medical_Number', 'CIN'],
            clientId2Fields: ['clientId2', 'client_ID2', 'Client_ID2'],
          }
        );
        identityTokenLookupKeys(signals.mrnToken).forEach((key) => {
          if (key && !byMrn.has(key)) byMrn.set(key, { label, clientId2 });
        });
        identityTokenLookupKeys(signals.mediCalToken).forEach((key) => {
          if (key && !byMediCal.has(key)) byMediCal.set(key, { label, clientId2 });
        });
        const nameKey = buildMemberLookupNameKey(firstName, lastName);
        const clientId2Key = signals.clientId2Token;
        if (clientId2Key && !byClientId2.has(clientId2Key)) {
          byClientId2.set(clientId2Key, { label, clientId2 });
        }
        if (nameKey !== '|' && !byName.has(nameKey)) {
          byName.set(nameKey, { label, clientId2 });
        }
      });

      return rows.map((row) => {
        const rowSignals = extractIdentitySignals(
          {
            memberFirstName: row.memberFirstName,
            memberLastName: row.memberLastName,
            memberMrn: row.memberMrn,
            memberMediCalNum: row.memberMediCalNum,
            clientId2: (row as any).clientId2 || (row as any).caspioMatchedClientId2,
          },
          {
            mrnFields: ['memberMrn'],
            mediCalFields: ['memberMediCalNum'],
            clientId2Fields: ['clientId2', 'caspioMatchedClientId2'],
          }
        );

        const nameKey = buildMemberLookupNameKey(row.memberFirstName, row.memberLastName);
        const clientId2Match = rowSignals.clientId2Token ? byClientId2.get(rowSignals.clientId2Token) : undefined;
        const mrnMatch = !clientId2Match
          ? identityTokenLookupKeys(rowSignals.mrnToken)
              .map((key) => byMrn.get(key))
              .find(Boolean)
          : undefined;
        const mediCalMatch =
          !clientId2Match && !mrnMatch
            ? identityTokenLookupKeys(rowSignals.mediCalToken)
                .map((key) => byMediCal.get(key))
                .find(Boolean)
            : undefined;
        const nameMatch = !clientId2Match && !mrnMatch && !mediCalMatch && nameKey !== '|' ? byName.get(nameKey) : undefined;
        const match = clientId2Match || mrnMatch || mediCalMatch || nameMatch;
        if (!match) {
          return {
            ...row,
            caspioExists: false,
            caspioMatchLabel: '',
            caspioMatchedClientId2: '',
            caspioMatchedBy: '',
          };
        }
        const matchReasonCode = clientId2Match
          ? 'match_by_client_id2'
          : mrnMatch
            ? 'match_by_mrn'
            : mediCalMatch
              ? 'match_by_medi_cal'
              : 'match_by_name';
        const matchedBy =
          matchReasonCode === 'match_by_mrn'
            ? 'mrn'
            : matchReasonCode === 'match_by_medi_cal'
              ? 'medi_cal'
              : mrnMatch
                ? 'mrn'
                : mediCalMatch
                  ? 'medi_cal'
                  : 'name';
        return {
          ...row,
          caspioExists: true,
          caspioMatchLabel: match.label,
          caspioMatchedClientId2: match.clientId2,
          caspioMatchedBy: matchedBy,
        };
      });
    } catch (error) {
      console.warn('Failed to annotate rows with existing Caspio members:', error);
      toast({
        title: 'Caspio match check unavailable',
        description: 'Could not verify existing Caspio members. You can still choose rows and import.',
      });
      return rows.map((row) => ({
        ...row,
        caspioExists: false,
        caspioMatchLabel: '',
        caspioMatchedClientId2: '',
        caspioMatchedBy: '',
      }));
    } finally {
      setIsCheckingCaspioExisting(false);
    }
  };

  const parseIlsSpreadsheetFile = async (file: File) => {
    if (!hasMifCaspioRefresh) {
      toast({
        title: 'Refresh Caspio first',
        description: 'Run "1) Refresh Caspio Members" before uploading a MIF spreadsheet.',
        variant: 'destructive',
      });
      if (ilsSpreadsheetInputRef.current) {
        ilsSpreadsheetInputRef.current.value = '';
      }
      return;
    }
    setIsParsingIlsSpreadsheet(true);
    setIlsSpreadsheetFileName(String(file?.name || '').trim());
    ilsSpreadsheetSourceFileRef.current = file;
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = pickIlsSheetName(wb.SheetNames);
      if (!sheetName) throw new Error('No worksheet found in spreadsheet.');
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (!rows.length) throw new Error('Spreadsheet has no data rows.');

      const parsed: KaiserIlsImportRow[] = rows
        .map((raw, idx) => {
          // CS_MIF import: pull only approved column headers.
          const memberFirstNameRaw = getSpreadsheetValue(raw, ['Member First Name']);
          const memberLastNameRaw = getSpreadsheetValue(raw, ['Member Last Name']);
          const memberFirstName = toNameCase(memberFirstNameRaw);
          const memberLastName = toNameCase(stripTrailingNonNameTokens(memberLastNameRaw));
          const memberMrn = getSpreadsheetValue(raw, [
            'Medical Record Number (MRN)',
          ]);
          const memberMediCalNum = extractSpreadsheetMediCalNumber(raw);
          const memberSex = normalizeMemberSex(
            getSpreadsheetValue(raw, [
              'Member Gender Code',
              'Member Gender',
              'Member Sex',
              'Gender',
              'Sex',
            ])
          );
          const clientId2 = getSpreadsheetValue(raw, ['Client_ID2', 'Client ID2', 'client_ID2']);
          const residentialCity = getSpreadsheetValue(raw, [
            'Member Residential City',
          ]);
          const residentialZip = getSpreadsheetValue(raw, [
            'Member Residential Zip Code',
            'Member Resdidential Zip Code',
            'Member Resdential Zip Code',
            'Member Residential Zip',
            'Residential Zip Code',
            'Residential Zip',
          ]);
          const mailingAddress = getSpreadsheetValue(raw, [
            'Member Mailing Address',
          ]);
          const mailingCity = getSpreadsheetValue(raw, ['Member Mailing City']);
          const mailingZip = getSpreadsheetValue(raw, ['Member Mailing Zip Code']);
          const memberAddress = toNameCase(mailingAddress);
          const parsedAddress = parseAddressParts(memberAddress);
          const mailingCityNorm = toNameCase(mailingCity);
          const residentialCityNorm = toNameCase(residentialCity);
          const mailingZipNorm = normalizeUsZip(mailingZip);
          const residentialZipNorm = normalizeUsZip(residentialZip);
          const memberCity =
            mailingCityNorm ||
            residentialCityNorm ||
            toNameCase(parsedAddress.city) ||
            '';
          const memberZip = mailingCityNorm
            ? mailingZipNorm || residentialZipNorm || normalizeUsZip(parsedAddress.zip)
            : residentialCityNorm
              ? residentialZipNorm || mailingZipNorm || normalizeUsZip(parsedAddress.zip)
              : mailingZipNorm || residentialZipNorm || normalizeUsZip(parsedAddress.zip) || '';
          const memberState = inferStateFromCityZip({ city: memberCity, zip: memberZip });
          const memberCountyRaw = String(
            getSpreadsheetValue(raw, [
              'Medi-Cal Coverage County',
              'Member County',
              'County',
            ]) || ''
          )
            .replace(/\s+county$/i, '')
            .trim();
          const memberCountyLooksValid =
            memberCountyRaw.length >= 3 && !/^\d+$/.test(memberCountyRaw);
          const memberCounty = toNameCase(
            (memberCountyLooksValid ? memberCountyRaw : '') ||
              inferCountyFromCityZip({ city: memberCity, zip: memberZip }) ||
              ''
          );
          const memberDob = toSpreadsheetDate(getSpreadsheetRawValue(raw, ['Member Date of Birth']));
          const primaryPhone = getSpreadsheetValue(raw, ['Primary Phone Number']);
          const homePhone = getSpreadsheetValue(raw, ['Home Phone Number']);
          const memberPhone = primaryPhone || homePhone;
          const referringOrganization = getSpreadsheetValue(raw, ['Referring Organization']);
          const referringIndividualName = getSpreadsheetValue(raw, ['Referring Individual Name']);
          const referringIndividualPhone = getSpreadsheetValue(raw, [
            'Referring Individual Phone Number',
          ]);
          const referringIndividualEmail = getSpreadsheetValue(raw, [
            'Referring Individual Email Address',
          ]);
          const emergencyContactName = getSpreadsheetValue(raw, [
            'Emergency/ Alternate Contact Name',
            'Emergency/Alternate Contact Name',
          ]);
          const emergencyContactRelationship = getSpreadsheetValue(raw, [
            'Emergency/Alternate Contact Relation',
            'Emergency/ Alternate Contact Relation',
          ]);
          const emergencyContactPhone =
            getSpreadsheetValue(raw, [
              'Emergency/Alternate Contact Phone Number',
              'Emergency/ Alternate Contact Phone Number',
              'Emergency/Contact Alternate Contact Phone Number',
            ]) ||
            Object.entries(raw || {}).reduce((found, [key, value]) => {
              if (found) return found;
              const nk = normalizeSheetHeader(key);
              if (
                nk.includes('emergency') &&
                nk.includes('phone') &&
                !nk.includes('referring') &&
                !nk.includes('primary') &&
                !nk.includes('home')
              ) {
                return String(value ?? '').trim();
              }
              return '';
            }, '');
          const emergencyContactEmail = String(
            getSpreadsheetValue(raw, [
              'Emergency/Alternate Contact Email Address',
              'Emergency/ Alternate Contact Email Address',
              'Emergency/Alternate Contact Email',
              'Emergency Contact Email Address',
              'Emergency Contact Email',
            ]) ||
              Object.entries(raw || {}).reduce((found, [key, value]) => {
                if (found) return found;
                const nk = normalizeSheetHeader(key);
                if (nk.includes('emergency') && nk.includes('email') && !nk.includes('referring')) {
                  return String(value ?? '').trim();
                }
                return '';
              }, '') ||
              ''
          )
            .trim()
            .toLowerCase();
          const contactPhone = emergencyContactPhone || referringIndividualPhone;
          const contactEmail = emergencyContactEmail || referringIndividualEmail;
          const careManagerName = referringIndividualName;
          const careManagerPhone = referringIndividualPhone;
          const careManagerEmail = referringIndividualEmail;
          const memberEmail = String(
            getSpreadsheetValue(raw, ['Member Email Address']) || ''
          )
            .trim()
            .toLowerCase();
          const eligibilityCheckStatus = 'Pending' as const;
          const authorizationNumberT2038 = getSpreadsheetValue(raw, ['Authorization Number']);
          const authorizationStartT2038 = toSpreadsheetDate(
            getSpreadsheetRawValue(raw, ['Authorization Start Date'])
          );
          const authorizationEndT2038 = toSpreadsheetDate(
            getSpreadsheetRawValue(raw, ['Authorizatin End Date', 'Authorization End Date'])
          );
          const dateReceivedRequestForAuthorization = toSpreadsheetDate(
            getSpreadsheetRawValue(raw, ['Date Received Request for Authorization'])
          );
          const dateOfReferralAuthorizationDecision = toSpreadsheetDate(
            getSpreadsheetRawValue(raw, ['Date of Referral Authorization Decision'])
          );
          const cptCode = '';
          const diagnosticCode = '';
          const ready = Boolean(memberFirstName && memberLastName && memberMediCalNum);
          const kaiserStatus = '';
          const extraAdminNotesLines = collectUnusedSpreadsheetNotes(raw);
          if (
            homePhone &&
            primaryPhone &&
            normalizePhoneDigits(homePhone) !== normalizePhoneDigits(primaryPhone)
          ) {
            extraAdminNotesLines.unshift(`Home Phone Number: ${homePhone}`);
          }
          const extraAdminNotes = extraAdminNotesLines.join('\n');
          return {
            rowId: `ils-${Date.now()}-${idx}`,
            sourceType: 'spreadsheet',
            sourceFileName: String(file?.name || '').trim(),
            memberFirstName,
            memberLastName,
            memberMrn,
            memberMediCalNum,
            memberSex,
            clientId2,
            memberAddress,
            memberCity: String(memberCity || '').trim(),
            memberZip: String(memberZip || '').trim(),
            memberState: String(memberState || '').trim().toUpperCase(),
            memberCounty,
            memberDob,
            memberPhone,
            memberEmail,
            contactPhone: normalizePhoneDigits(contactPhone)
              ? formatPhoneDashed(normalizePhoneDigits(contactPhone))
              : '',
            contactEmail: String(contactEmail || '').trim().toLowerCase(),
            referringOrganization: toNameCase(String(referringOrganization || '').trim()),
            emergencyContactName: toNameCase(String(emergencyContactName || '').trim()),
            emergencyContactRelationship: toNameCase(String(emergencyContactRelationship || '').trim()),
            emergencyContactPhone: normalizePhoneDigits(emergencyContactPhone)
              ? formatPhoneDashed(normalizePhoneDigits(emergencyContactPhone))
              : '',
            emergencyContactEmail,
            careManagerName: toNameCase(String(careManagerName || '').trim()),
            careManagerPhone: normalizePhoneDigits(careManagerPhone)
              ? formatPhoneDashed(normalizePhoneDigits(careManagerPhone))
              : '',
            careManagerEmail: String(careManagerEmail || '').trim().toLowerCase(),
            eligibilityCheckStatus,
            authorizationNumberT2038,
            authorizationStartT2038,
            authorizationEndT2038,
            kaiserStatus,
            dateReceivedRequestForAuthorization,
            dateOfReferralAuthorizationDecision,
            cptCode,
            diagnosticCode,
            assignedStaffId: '',
            assignedStaffName: '',
            createStatus: 'idle',
            pushStatus: 'idle',
            deleteStatus: 'idle',
            statusNote: ready ? '' : 'Missing member name or Medi-Cal/CIN',
            applicationId: '',
            pushedClientId2: '',
            caspioExists: false,
            caspioMatchLabel: '',
            caspioMatchedClientId2: '',
            caspioMatchedBy: '',
            mifMasterExists: false,
            mifMasterMatchLabel: '',
            mifMasterMatchedBy: '',
            extraAdminNotes,
          } as KaiserIlsImportRow;
        })
        .filter((row) => Boolean(row.memberFirstName && row.memberLastName));

      if (!parsed.length) {
        throw new Error('No usable rows found. Make sure spreadsheet has member first/last name columns.');
      }
      const annotated = await annotateRowsWithCaspioAndMifMaster(parsed);
      let createAppExcludedKeys = new Set<string>();
      try {
        if (firestore) createAppExcludedKeys = await loadCreateAppExcludedDedupeKeys(firestore);
      } catch {
        createAppExcludedKeys = new Set();
      }
      const visibleAnnotated = annotated.filter((row) => {
        const key = getIlsRowCreateAppDedupeKey(row);
        return !(key && createAppExcludedKeys.has(key));
      });
      const nextSelected: Record<string, boolean> = {};
      visibleAnnotated.forEach((row) => {
        nextSelected[row.rowId] = false;
      });
      const uploadLogId = `ils_upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setIlsImportRows(visibleAnnotated);
      setIlsImportSelected(nextSelected);
      setPickedIlsRowId('');
      setActiveSpreadsheetUploadLogId(uploadLogId);
      await syncSpreadsheetUploadLog({
        uploadLogId,
        fileName: String(file?.name || '').trim(),
        rows: annotated,
        isNewUpload: true,
      });
      void Promise.all(annotated.map((row) => checkRowDuplicateAuthorizationByMrn(row)));
      const existingCount = visibleAnnotated.filter((row) => row.caspioExists).length;
      const importDefaultCount = visibleAnnotated.filter((row) => !row.caspioExists).length;
      const mifMasterCount = visibleAnnotated.filter((row) => row.mifMasterExists).length;
      const hiddenCount = annotated.length - visibleAnnotated.length;
      setHasMifCaspioRefresh(false);
      toast({
        title: 'Spreadsheet parsed',
        description: `Loaded ${visibleAnnotated.length} row(s): ${importDefaultCount} new, ${existingCount} already in Caspio, ${mifMasterCount} also on consolidated MIF master${
          hiddenCount ? ` (${hiddenCount} hidden from Create App)` : ''
        }.`,
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
    setPickedIlsRowId('');
    setActiveSpreadsheetUploadLogId('');
    setShowOnlyNotInCaspio(false);
    setIlsPickerSearch('');
    setIlsRowEligibilityFiles({});
    setIlsRowDuplicateMatches({});
    setCheckingRowDuplicates({});
    setIlsSpreadsheetFileName('');
    setHasMifCaspioRefresh(false);
    setMifLastCaspioRefreshAtIso('');
    setCreateAppLoadedRunId('');
    setCreateAppLoadedAtIso('');
    setIlsDecisionLogByRowId({});
    setPendingIlsDecisionDraft(null);
    ilsSpreadsheetSourceFileRef.current = null;
    parsedSingleAuthFilesRef.current = {};
    if (ilsSpreadsheetInputRef.current) {
      ilsSpreadsheetInputRef.current.value = '';
    }
    toast({
      title: 'Spreadsheet upload removed',
      description: 'Spreadsheet rows were cleared. You can upload again and start over.',
    });
  };

  const applyIlsRowsFromConsolidator = async (
    incomingRows: KaiserIlsImportRow[],
    sourceLabel: string,
    options?: { skippedDeclined?: number; silent?: boolean; runId?: string }
  ) => {
    if (!incomingRows.length) {
      if (options?.silent) {
        setIlsImportRows([]);
        setIlsImportSelected({});
        setPickedIlsRowId('');
        toast({
          title: 'Picker updated',
          description: 'No remaining new members in this consolidation run.',
        });
        return;
      }
      toast({
        variant: 'destructive',
        title: 'No members to load',
        description: 'The consolidator handoff did not include any rows.',
      });
      return;
    }
    const withCaspio = await annotateRowsWithCaspioExists(incomingRows);
    let liveAppHits = 0;
    let liveCaspioHits = withCaspio.filter((row) => row.caspioExists).length;
    let remaining = withCaspio.filter((row) => !row.caspioExists);
    if (firestore && remaining.length) {
      try {
        const appIndex = await loadExistingApplicationIdentityIndex(firestore);
        const stillNew: KaiserIlsImportRow[] = [];
        for (const row of remaining) {
          const existing = matchIdentityToExistingApplications(appIndex, row);
          if (existing.length) {
            liveAppHits += 1;
            try {
              await markIlsMifMemberSkeletonCreated(firestore, {
                memberFirstName: row.memberFirstName,
                memberLastName: row.memberLastName,
                memberMrn: row.memberMrn,
                memberMediCalNum: row.memberMediCalNum,
                memberDob: row.memberDob,
                clientId2: row.clientId2,
                consolidatorRunId: options?.runId,
                applicationId: existing[0].applicationId,
                actor: user?.email || user?.uid || '',
              });
            } catch (flagError) {
              console.warn('Failed to mark existing app member on consolidator list:', flagError);
            }
            continue;
          }
          stillNew.push(row);
        }
        remaining = stillNew;
      } catch (appLookupError) {
        console.warn('Live application match during consolidator refresh failed:', appLookupError);
      }
    }
    if (firestore && liveCaspioHits > 0) {
      await Promise.all(
        withCaspio
          .filter((row) => row.caspioExists)
          .map(async (row) => {
            try {
              await markIlsMifMemberPushedToCaspio(firestore, {
                memberFirstName: row.memberFirstName,
                memberLastName: row.memberLastName,
                memberMrn: row.memberMrn,
                memberMediCalNum: row.memberMediCalNum,
                memberDob: row.memberDob,
                clientId2: row.clientId2 || row.caspioMatchedClientId2,
                consolidatorRunId: options?.runId,
                actor: user?.email || user?.uid || '',
              });
            } catch (flagError) {
              console.warn('Failed to mark Caspio member on consolidator list:', flagError);
            }
          })
      );
    }
    const skippedLive = liveCaspioHits + liveAppHits;
    if (!remaining.length) {
      setIlsImportRows([]);
      setIlsImportSelected({});
      setPickedIlsRowId('');
      setCreateAppLoadedAtIso(new Date().toISOString());
      toast({
        title: options?.silent ? 'Picker updated' : 'Loaded from ILS MIF Consolidator',
        description:
          skippedLive > 0
            ? `No remaining new members. Excluded ${liveCaspioHits} already in Kaiser Caspio and ${liveAppHits} already in the app.`
            : 'No remaining new members in this consolidation run.',
      });
      return;
    }
    const annotatedRows = await annotateRowsWithMifMasterList(
      remaining.map((row) => ({
        ...row,
        mifMasterExists: Boolean(row.mifMasterExists),
        mifMasterMatchLabel: String(row.mifMasterMatchLabel || ''),
        mifMasterMatchedBy: row.mifMasterMatchedBy || '',
      }))
    );
    const nextSelected: Record<string, boolean> = {};
    annotatedRows.forEach((row) => {
      // Leave all picks off so staff choose one member at a time (parse → skeleton → assign).
      nextSelected[row.rowId] = false;
    });
    setIntakeType('kaiser_auth_received_via_ils');
    setIlsImportRows(annotatedRows);
    setIlsImportSelected(nextSelected);
    setPickedIlsRowId('');
    setIlsSpreadsheetFileName(sourceLabel);
    setHasMifCaspioRefresh(true);
    setMifLastCaspioRefreshAtIso(new Date().toISOString());
    setCreateAppLoadedAtIso(new Date().toISOString());
    setShowOnlyNotInCaspio(true);
    const declinedNote =
      options?.skippedDeclined && options.skippedDeclined > 0
        ? ` Excluded ${options.skippedDeclined} Northern California decline(s).`
        : '';
    const liveSkipNote =
      skippedLive > 0
        ? ` Excluded ${liveCaspioHits} already in Kaiser Caspio and ${liveAppHits} already in the app.`
        : '';
    toast({
      title: options?.silent ? 'Picker refreshed' : 'Loaded from ILS MIF Consolidator',
      description: options?.silent
        ? `${annotatedRows.length} remaining new member(s) from this run.${declinedNote}${liveSkipNote}`
        : `${annotatedRows.length} members loaded (not in Caspio, not already in the app). All picks are off — select one, parse into the form, create skeleton, then assign staff.${declinedNote}${liveSkipNote}`,
      className: options?.silent ? undefined : 'bg-green-100 text-green-900 border-green-200',
    });
    if (!options?.silent && typeof window !== 'undefined') {
      window.setTimeout(() => {
        document.getElementById('kaiser-ils-datapage')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 160);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (searchParams.get('fromConsolidator') !== '1') return;
    try {
      const raw = window.sessionStorage.getItem(ILS_MIF_CONSOLIDATOR_HANDOFF_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { rows?: KaiserIlsImportRow[]; sourceFiles?: string[]; runId?: string };
      const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
      if (!rows.length) return;
      const sourceLabel =
        Array.isArray(parsed.sourceFiles) && parsed.sourceFiles.length
          ? `MIF Consolidator (${parsed.sourceFiles.join(', ')})`
          : 'MIF Consolidator handoff';
      if (parsed.runId) {
        setSelectedConsolidatorRunId(String(parsed.runId));
        setCreateAppLoadedRunId(String(parsed.runId));
      }
      void applyIlsRowsFromConsolidator(rows, sourceLabel, { runId: String(parsed.runId || '') });
      window.sessionStorage.removeItem(ILS_MIF_CONSOLIDATOR_HANDOFF_KEY);
    } catch (error) {
      console.warn('Failed to load consolidator handoff:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const loadConsolidatorRunsForCreate = async () => {
    if (!firestore) return [] as IlsMifConsolidationRunRecord[];
    setIsLoadingConsolidatorRuns(true);
    try {
      const [runsSnap, uploadsSnap] = await Promise.all([
        getDocs(
          query(
            collection(firestore, ILS_MIF_CONSOLIDATION_RUNS_COLLECTION),
            orderBy('createdAtIso', 'desc'),
            limit(25)
          )
        ),
        getDocs(
          query(
            collection(firestore, ILS_MIF_UPLOADED_FILES_COLLECTION),
            orderBy('uploadedAtIso', 'desc'),
            limit(100)
          )
        ),
      ]);
      const nextRuns: IlsMifConsolidationRunRecord[] = [];
      runsSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        nextRuns.push({
          id: docSnap.id,
          createdAtIso: String(data.createdAtIso || ''),
          label: String(data.label || docSnap.id),
          sourceFiles: Array.isArray(data.sourceFiles) ? data.sourceFiles.map(String) : [],
          newMemberCount: Number(data.newMemberCount || data?.totals?.unique || 0),
          totals: data.totals || {},
        });
      });
      setConsolidatorRuns(nextRuns);

      const nextUploads: IlsMifUploadedFileRecord[] = [];
      uploadsSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        nextUploads.push({
          id: docSnap.id,
          fileName: String(data.fileName || docSnap.id),
          uploadedAtIso: String(data.uploadedAtIso || ''),
          rowCount: Number(data.rowCount || 0),
          uploadedBy: String(data.uploadedBy || ''),
          runId: String(data.runId || ''),
        });
      });
      setConsolidatorUploadedFiles(nextUploads);
      return nextRuns;
    } catch (error) {
      console.warn('Failed to load consolidator runs for create page:', error);
      return [] as IlsMifConsolidationRunRecord[];
    } finally {
      setIsLoadingConsolidatorRuns(false);
    }
  };

  useEffect(() => {
    if (intakeType !== 'kaiser_auth_received_via_ils') return;
    void loadConsolidatorRunsForCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intakeType, firestore]);

  const loadNewMembersFromMifMasterList = async (
    runId?: string,
    options?: { silent?: boolean; preferLatest?: boolean }
  ) => {
    if (!firestore) {
      if (!options?.silent) {
        toast({ variant: 'destructive', title: 'Firestore unavailable' });
      }
      return;
    }
    try {
      let preferredRunId = String(runId || '').trim();
      if (options?.preferLatest || !preferredRunId) {
        const runs = await loadConsolidatorRunsForCreate();
        if (options?.preferLatest && runs[0]?.id) {
          preferredRunId = runs[0].id;
        } else if (!preferredRunId) {
          preferredRunId = String(
            selectedConsolidatorRunId || createAppLoadedRunId || searchParams.get('consolidatorRunId') || runs[0]?.id || ''
          ).trim();
        }
      } else {
        preferredRunId = String(
          preferredRunId || selectedConsolidatorRunId || createAppLoadedRunId || searchParams.get('consolidatorRunId') || ''
        ).trim();
      }
      if (!preferredRunId) {
        if (!options?.silent) {
          toast({
            title: 'No consolidation run yet',
            description: 'Save a dated run in ILS MIF Consolidator, then refresh this filtered Create App list.',
          });
        }
        return;
      }
      setSelectedConsolidatorRunId(preferredRunId);

      const [memberSnapInitial, declinedSnap, removedSnap, createAppExcludedKeys] = await Promise.all([
        getDocs(
          collection(
            firestore,
            ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
            preferredRunId,
            ILS_MIF_RUN_MEMBERS_SUBCOLLECTION
          )
        ),
        getDocs(collection(firestore, ILS_MIF_DECLINED_COLLECTION)),
        getDocs(collection(firestore, ILS_MIF_REMOVED_COLLECTION)),
        loadCreateAppExcludedDedupeKeys(firestore),
      ]);

      const declinedKeys = new Set<string>();
      declinedSnap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const keyFromFields = buildIlsMifDedupeKey({
          clientId2: String(data.clientId2 || ''),
          memberMrn: String(data.memberMrn || ''),
          memberMediCalNum: String(data.memberMediCalNum || ''),
          memberFirstName: String(data.memberFirstName || ''),
          memberLastName: String(data.memberLastName || ''),
          memberDob: String(data.memberDob || ''),
        }).replace(/[\/#?[\]]/g, '_').slice(0, 700);
        if (keyFromFields) declinedKeys.add(keyFromFields);
        if (docSnap.id) declinedKeys.add(docSnap.id);
        const dedupeKey = String(data.dedupeKey || '').trim();
        if (dedupeKey) declinedKeys.add(dedupeKey);
      });

      const removedKeys = new Set<string>();
      removedSnap.forEach((docSnap) => {
        removedKeys.add(docSnap.id);
        const dedupeKey = String(docSnap.data()?.dedupeKey || '').trim();
        if (dedupeKey) removedKeys.add(dedupeKey);
      });

      let usedRunSnapshot = true;
      let memberSnap = memberSnapInitial;
      if (memberSnap.empty) {
        usedRunSnapshot = false;
        memberSnap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
      }

      const rows: KaiserIlsImportRow[] = [];
      let skippedDeclined = 0;
      let skippedRemoved = 0;
      let skippedCreateAppExcluded = 0;
      let skippedSkeletonOrCaspio = 0;
      memberSnap.forEach((docSnap) => {
        if (docSnap.id === '_meta') return;
        const data = docSnap.data() as any;
        if (!data?.memberFirstName || !data?.memberLastName) return;
        if (!usedRunSnapshot && String(data.runId || '') !== preferredRunId) return;
        if (data.mergeStatus && data.mergeStatus !== 'unique') return;
        if (data.caspioExists || String(data.mergeStatus || '') === 'already_in_caspio') {
          skippedSkeletonOrCaspio += 1;
          return;
        }
        if (String(data.skeletonApplicationId || '').trim()) {
          skippedSkeletonOrCaspio += 1;
          return;
        }

        const dedupeKey = buildIlsMifDedupeKey({
          clientId2: String(data.clientId2 || ''),
          memberMrn: String(data.memberMrn || ''),
          memberMediCalNum: String(data.memberMediCalNum || ''),
          memberFirstName: String(data.memberFirstName || ''),
          memberLastName: String(data.memberLastName || ''),
          memberDob: String(data.memberDob || ''),
        }).replace(/[\/#?[\]]/g, '_').slice(0, 700);
        if (removedKeys.has(docSnap.id) || (dedupeKey && removedKeys.has(dedupeKey))) {
          skippedRemoved += 1;
          return;
        }
        if (
          createAppExcludedKeys.has(docSnap.id) ||
          (dedupeKey && createAppExcludedKeys.has(dedupeKey))
        ) {
          skippedCreateAppExcluded += 1;
          return;
        }
        const isDeclined =
          Boolean(data.declined) ||
          declinedKeys.has(docSnap.id) ||
          (dedupeKey ? declinedKeys.has(dedupeKey) : false);
        if (isDeclined) {
          skippedDeclined += 1;
          return;
        }

        rows.push({
          rowId: String(data.rowId || docSnap.id),
          sourceType: 'spreadsheet',
          sourceFileName: String(data.sourceFileName || 'MIF Master List'),
          memberFirstName: String(data.memberFirstName || ''),
          memberLastName: String(data.memberLastName || ''),
          memberMrn: String(data.memberMrn || ''),
          memberMediCalNum: String(data.memberMediCalNum || ''),
          memberSex: String(data.memberSex || ''),
          clientId2: String(data.clientId2 || ''),
          memberAddress: String(data.memberAddress || ''),
          memberCity: String(data.memberCity || ''),
          memberZip: String(data.memberZip || ''),
          memberState: String(data.memberState || ''),
          memberCounty: String(data.memberCounty || ''),
          memberDob: String(data.memberDob || ''),
          memberPhone: String(data.memberPhone || ''),
          memberEmail: String(data.memberEmail || ''),
          contactPhone: String(data.contactPhone || ''),
          contactEmail: String(data.contactEmail || ''),
          referringOrganization: String(data.referringOrganization || ''),
          emergencyContactName: String(data.emergencyContactName || ''),
          emergencyContactRelationship: String(data.emergencyContactRelationship || ''),
          emergencyContactPhone: String(data.emergencyContactPhone || ''),
          emergencyContactEmail: String(data.emergencyContactEmail || '')
            .trim()
            .toLowerCase(),
          careManagerName: String(data.careManagerName || ''),
          careManagerPhone: String(data.careManagerPhone || ''),
          careManagerEmail: String(data.careManagerEmail || ''),
          eligibilityCheckStatus: 'Pending',
          authorizationNumberT2038: String(data.authorizationNumberT2038 || ''),
          authorizationStartT2038: String(data.authorizationStartT2038 || ''),
          authorizationEndT2038: String(data.authorizationEndT2038 || ''),
          kaiserStatus: '',
          dateReceivedRequestForAuthorization: String(data.dateReceivedRequestForAuthorization || ''),
          dateOfReferralAuthorizationDecision: String(data.dateOfReferralAuthorizationDecision || ''),
          cptCode: '',
          diagnosticCode: '',
          assignedStaffId: '',
          assignedStaffName: '',
          createStatus: 'idle',
          pushStatus: 'idle',
          deleteStatus: 'idle',
          statusNote: String(data.statusNote || ''),
          applicationId: '',
          pushedClientId2: '',
          caspioExists: false,
          caspioMatchLabel: '',
          caspioMatchedClientId2: '',
          caspioMatchedBy: '',
          mifMasterExists: true,
          mifMasterMatchLabel: `${String(data.memberLastName || '').trim()}, ${String(data.memberFirstName || '').trim()}`.trim(),
          mifMasterMatchedBy: 'name',
          extraAdminNotes: String(data.extraAdminNotes || ''),
        });
      });
      if (!rows.length) {
        setCreateAppLoadedRunId(preferredRunId);
        setCreateAppLoadedAtIso(new Date().toISOString());
        if (options?.silent) {
          setIlsImportRows([]);
          setIlsImportSelected({});
          setPickedIlsRowId('');
          toast({
            title: 'Picker updated',
            description: `No remaining new members in this run${
              skippedSkeletonOrCaspio || skippedDeclined || skippedRemoved || skippedCreateAppExcluded
                ? ` (excluded ${skippedSkeletonOrCaspio} skeleton/Caspio, ${skippedDeclined} decline(s), ${skippedRemoved} removal(s), ${skippedCreateAppExcluded} Create App hide(s))`
                : ''
            }.`,
          });
          return;
        }
        toast({
          title: 'No new master-list members',
          description: skippedDeclined || skippedRemoved || skippedSkeletonOrCaspio || skippedCreateAppExcluded
            ? `That run has no remaining not-in-Caspio members after excluding ${skippedSkeletonOrCaspio} skeleton/Caspio, ${skippedDeclined} decline(s), ${skippedRemoved} removal(s), and ${skippedCreateAppExcluded} Create App hide(s).`
            : 'That consolidation run has no new (not-in-Caspio) members left to load. Save a dated run in ILS MIF Consolidator first.',
        });
        return;
      }
      setCreateAppLoadedRunId(preferredRunId);
      setCreateAppLoadedAtIso(new Date().toISOString());
      const selectedRun = consolidatorRuns.find((run) => run.id === preferredRunId);
      if (!options?.silent) {
        try {
          await addDoc(collection(firestore, ILS_MIF_AUDIT_COLLECTION), {
            action: 'create_app_load',
            summary: `Loaded ${rows.length} not-in-Caspio member(s) into Create Application from ${preferredRunId}`,
            atIso: new Date().toISOString(),
            atServer: serverTimestamp(),
            actor: user?.email || user?.uid || '',
            runId: preferredRunId,
            count: rows.length,
            skippedDeclined,
            skippedRemoved,
            skippedCreateAppExcluded,
            skippedSkeletonOrCaspio,
          });
        } catch (auditError) {
          console.warn('Create App MIF audit write failed:', auditError);
        }
      }
      void applyIlsRowsFromConsolidator(
        rows,
        `ILS MIF Run ${
          selectedRun?.createdAtIso
            ? new Date(selectedRun.createdAtIso).toLocaleString()
            : preferredRunId
        }`,
        {
          skippedDeclined: skippedDeclined + skippedRemoved + skippedSkeletonOrCaspio,
          silent: Boolean(options?.silent),
          runId: preferredRunId,
        }
      );
    } catch (error: any) {
      if (!options?.silent) {
        toast({
          variant: 'destructive',
          title: 'Unable to load MIF master list',
          description: String(error?.message || 'Unknown error'),
        });
      } else {
        console.warn('Silent consolidator picker refresh failed:', error);
      }
    }
  };

  // When returning from application Caspio push (or another tab), refresh the already-loaded filtered list.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (intakeType !== 'kaiser_auth_received_via_ils') return;

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!createAppLoadedRunId) return;
      void loadNewMembersFromMifMasterList(undefined, { silent: true, preferLatest: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intakeType, createAppLoadedRunId, firestore]);

  const selectAllVisibleIlsRows = () => {
    setIlsImportSelected((prev) => {
      const next = { ...prev };
      ilsPickerRows.forEach((row) => {
        next[row.rowId] = !isIlsRowLockedForSkeletonCreate(row);
      });
      return next;
    });
  };

  const clearAllVisibleIlsSelections = () => {
    setIlsImportSelected((prev) => {
      const next = { ...prev };
      ilsPickerRows.forEach((row) => {
        next[row.rowId] = false;
      });
      return next;
    });
  };

  const selectOnlyNotInCaspio = () => {
    setIlsImportSelected((prev) => {
      const next = { ...prev };
      ilsImportRows.forEach((row) => {
        next[row.rowId] = !isIlsRowLockedForSkeletonCreate(row);
      });
      return next;
    });
    const firstNotInCaspio = ilsImportRows.find((row) => !row.caspioExists);
    setPickedIlsRowId(firstNotInCaspio?.rowId || '');
    setShowOnlyNotInCaspio(true);
  };

  const selectOnlyInCaspio = () => {
    setIlsImportSelected((prev) => {
      const next = { ...prev };
      ilsImportRows.forEach((row) => {
        next[row.rowId] = false;
      });
      return next;
    });
    setPickedIlsRowId('');
    setShowOnlyNotInCaspio(false);
    toast({
      title: 'Rows already in Caspio are locked',
      description:
        'To create a new skeleton from these rows again, delete the member in both Application records and Caspio, then re-upload/re-check.',
    });
  };

  const excludeRowsFromCreateApp = async (rows: KaiserIlsImportRow[]) => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return;
    }
    if (!rows.length) {
      toast({
        title: 'Nothing selected',
        description: 'Select one or more members, or use Hide on a single row.',
      });
      return;
    }
    const label =
      rows.length === 1
        ? `${rows[0].memberFirstName || ''} ${rows[0].memberLastName || ''}`.trim() || 'this member'
        : `${rows.length} members`;
    const ok = window.confirm(
      `Hide ${label} from Create Application runs?\n\nThey stay on the full consolidator / master list. They just will not appear here again.`
    );
    if (!ok) return;

    setIsExcludingFromCreateApp(true);
    try {
      const excludedRowIds = new Set<string>();
      for (const row of rows) {
        await excludeIlsMifMemberFromCreateApp(firestore, {
          memberFirstName: row.memberFirstName,
          memberLastName: row.memberLastName,
          memberMrn: row.memberMrn,
          memberMediCalNum: row.memberMediCalNum,
          memberDob: row.memberDob,
          clientId2: row.clientId2 || row.pushedClientId2,
          ilsMifDedupeKey: getIlsRowCreateAppDedupeKey(row),
          reason: 'Hidden from Create Application (kept on consolidator master list)',
          actor: user?.email || user?.uid || '',
          consolidatorRunId: selectedConsolidatorRunId || createAppLoadedRunId || '',
        });
        excludedRowIds.add(row.rowId);
      }
      setIlsImportRows((prev) => prev.filter((row) => !excludedRowIds.has(row.rowId)));
      setIlsImportSelected((prev) => {
        const next = { ...prev };
        excludedRowIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      if (pickedIlsRowId && excludedRowIds.has(pickedIlsRowId)) {
        setPickedIlsRowId('');
      }
      toast({
        title: 'Hidden from Create Application',
        description: `${rows.length} member${rows.length === 1 ? '' : 's'} will stay on the consolidator list but no longer appear in Create App runs.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not hide member',
        description: String(error?.message || 'Unable to exclude from Create Application.'),
      });
    } finally {
      setIsExcludingFromCreateApp(false);
    }
  };

  const excludeSelectedFromCreateApp = async () => {
    const selected = ilsImportRows.filter((row) => ilsImportSelected[row.rowId]);
    await excludeRowsFromCreateApp(selected);
  };

  const refreshIlsRowsFromCaspio = async () => {
    if (!ilsImportRows.length) {
      toast({
        title: 'No rows to refresh',
        description: 'Upload or parse spreadsheet rows first, then run Caspio refresh.',
      });
      return;
    }
    const annotatedRows = await annotateRowsWithCaspioAndMifMaster(ilsImportRows);
    let createAppExcludedKeys = new Set<string>();
    try {
      if (firestore) createAppExcludedKeys = await loadCreateAppExcludedDedupeKeys(firestore);
    } catch {
      createAppExcludedKeys = new Set();
    }
    const visibleRows = annotatedRows.filter((row) => {
      const key = getIlsRowCreateAppDedupeKey(row);
      return !(key && createAppExcludedKeys.has(key));
    });
    setIlsImportRows(visibleRows);
    setIlsImportSelected((prev) => {
      const next: Record<string, boolean> = {};
      visibleRows.forEach((row) => {
        const isLocked = isIlsRowLockedForSkeletonCreate(row);
        next[row.rowId] = isLocked ? false : Boolean(prev[row.rowId]);
      });
      return next;
    });
    if (pickedIlsRowId && !visibleRows.some((row) => row.rowId === pickedIlsRowId)) {
      setPickedIlsRowId('');
    } else if (showOnlyNotInCaspio && pickedIlsRowId) {
      const pickedRow = visibleRows.find((row) => row.rowId === pickedIlsRowId);
      if (pickedRow?.caspioExists) {
        const firstNotInCaspio = visibleRows.find((row) => !row.caspioExists);
        setPickedIlsRowId(firstNotInCaspio?.rowId || '');
      }
    }
    const existingCount = visibleRows.filter((row) => row.caspioExists).length;
    const newCount = visibleRows.length - existingCount;
    const mifMasterCount = visibleRows.filter((row) => row.mifMasterExists).length;
    setHasMifCaspioRefresh(true);
    setMifLastCaspioRefreshAtIso(new Date().toISOString());
    toast({
      title: 'Caspio + MIF master match refreshed',
      description: `${visibleRows.length} row(s): ${newCount} new to Caspio, ${existingCount} in Caspio, ${mifMasterCount} on consolidated MIF master.`,
    });
  };

  const refreshCaspioBeforeSpreadsheetParse = async () => {
    setIsCheckingCaspioExisting(true);
    try {
      const response = await fetch('/api/kaiser-members?source=caspio&refresh=1', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success || !Array.isArray(data?.members)) {
        throw new Error(String(data?.error || `Failed to refresh Caspio members (HTTP ${response.status})`));
      }
      setHasMifCaspioRefresh(true);
      setMifLastCaspioRefreshAtIso(new Date().toISOString());
      toast({
        title: 'Caspio refresh complete',
        description: `Fetched ${data.members.length} current member record(s). You can now upload the MIF spreadsheet for parsing.`,
      });
    } catch (error: any) {
      toast({
        title: 'Caspio refresh failed',
        description: String(error?.message || 'Could not refresh Caspio members right now.'),
        variant: 'destructive',
      });
    } finally {
      setIsCheckingCaspioExisting(false);
    }
  };

  const buildIlsRowAdminNotes = (row: KaiserIlsImportRow) => {
    const heading = row.sourceType === 'single_auth_pdf' ? 'Single Auth PDF Details' : 'ILS Spreadsheet Details';
    const lines = [
      heading,
      `Source File: ${row.sourceFileName || 'Unknown'}`,
      row.referringOrganization ? `Referring Organization: ${row.referringOrganization}` : '',
      row.careManagerName ? `Referring Individual: ${row.careManagerName}` : '',
      row.careManagerPhone ? `Referring Individual Phone: ${row.careManagerPhone}` : '',
      row.careManagerEmail ? `Referring Individual Email: ${row.careManagerEmail}` : '',
      row.emergencyContactName ? `Emergency/Alternate Contact: ${row.emergencyContactName}` : '',
      row.emergencyContactRelationship ? `Emergency Contact Relationship: ${row.emergencyContactRelationship}` : '',
      row.emergencyContactPhone ? `Emergency Contact Phone: ${row.emergencyContactPhone}` : '',
      row.emergencyContactEmail ? `Emergency Contact Email: ${row.emergencyContactEmail}` : '',
      row.dateReceivedRequestForAuthorization
        ? `Date Received Request for Authorization: ${row.dateReceivedRequestForAuthorization}`
        : '',
      row.dateOfReferralAuthorizationDecision
        ? `Date of Referral Authorization Decision: ${row.dateOfReferralAuthorizationDecision}`
        : '',
      row.mifMasterExists
        ? `On Consolidated MIF Master: Yes (${row.mifMasterMatchedBy || 'match'}${
            row.mifMasterMatchLabel ? ` - ${row.mifMasterMatchLabel}` : ''
          })`
        : 'On Consolidated MIF Master: No',
      row.extraAdminNotes || '',
    ].filter(Boolean);
    return lines.join('\n');
  };

  const populateMemberDataFromIlsRow = (row: KaiserIlsImportRow, options?: { silent?: boolean }) => {
    const notes = buildIlsRowAdminNotes(row);
    const normalizedAddress = toNameCase(row.memberAddress || '');
    const normalizedCity = toNameCase(row.memberCity || '');
    const normalizedZip = normalizeUsZip(row.memberZip || parseAddressParts(row.memberAddress || '').zip || '');
    const normalizedCounty = toNameCase(
      inferCountyFromCityZip({ city: normalizedCity, zip: normalizedZip }) || row.memberCounty || ''
    );
    const normalizedState = String(
      inferStateFromCityZip({ city: normalizedCity, zip: normalizedZip }) || row.memberState || ''
    )
      .trim()
      .toUpperCase();
    setMemberData((prev) => ({
      ...prev,
      memberFirstName: row.memberFirstName || '',
      memberLastName: row.memberLastName || '',
      memberMrn: row.memberMrn || '',
      memberMediCalNum: row.memberMediCalNum || '',
      confirmMemberMediCalNum: row.memberMediCalNum || '',
      memberSex: row.memberSex || '',
      parsedSourceType: row.sourceType || '',
      createServiceDeliveryFormPdf: row.sourceType === 'spreadsheet',
      memberDob: row.memberDob || '',
      memberPhone: row.memberPhone || '',
      memberEmail: row.memberEmail || '',
      memberCustomaryAddress: normalizedAddress,
      memberCustomaryCity: normalizedCity,
      memberCustomaryState: normalizedState,
      memberCustomaryZip: normalizedZip,
      memberCustomaryCounty: normalizedCounty,
      Authorization_Number_T038: row.authorizationNumberT2038 || '',
      Authorization_Start_T2038: row.authorizationStartT2038 || '',
      Authorization_End_T2038: row.authorizationEndT2038 || '',
      Diagnostic_Code: row.diagnosticCode || '',
      careManagerName: '',
      careManagerPhone: '',
      careManagerEmail: '',
      contactFirstName: '',
      contactLastName: '',
      contactPhone: '',
      contactEmail: '',
      contactRelationship: '',
      eligibilityCheckStatus: normalizeEligibilityStatus(row.eligibilityCheckStatus),
      kaiserStatus: row.kaiserStatus || '',
      notes,
    }));
    if (!options?.silent) {
      const countyUndetermined = isCountyUndetermined({
        city: normalizedCity,
        zip: normalizedZip,
        county: normalizedCounty,
      });
      toast({
        title: countyUndetermined ? 'County cannot be determined' : 'Member loaded into form',
        description: countyUndetermined
          ? COUNTY_UNDETERMINED_MESSAGE
          : `${row.memberFirstName || ''} ${row.memberLastName || ''}`.trim() +
            (normalizedZip ? ` • ZIP ${normalizedZip}` : ''),
        variant: countyUndetermined ? 'destructive' : 'default',
      });
    }
  };

  const parsePickedIlsRowToForm = () => {
    const pickedById = ilsImportRows.find((row) => row.rowId === pickedIlsRowId) || null;
    const firstChecked = ilsImportRows.find((row) => Boolean(ilsImportSelected[row.rowId])) || null;
    const targetRow = pickedById || firstChecked;
    if (!targetRow) {
      toast({
        title: 'No row picked',
        description: 'Pick a spreadsheet row first, then click Parse Picked Row.',
        variant: 'destructive',
      });
      return;
    }
    if (isIlsRowCreated(targetRow)) {
      toast({
        title: 'Row already created',
        description: 'This row already has a skeleton application and is locked from re-picking.',
      });
      return;
    }
    setPickedIlsRowId(targetRow.rowId);
    populateMemberDataFromIlsRow(targetRow);
  };

  const createIlsSkeletonApplications = async () => {
    if (!firestore) return;
    if (!selectedIlsRows.length) {
      toast({ title: 'No selected rows', description: 'Select one or more imported rows first.' });
      return;
    }
    const rowsMissingMediCal = selectedIlsRows.filter(
      (row) => !normalizeMediCalNumber(String(row.memberMediCalNum || '').trim())
    );
    if (rowsMissingMediCal.length > 0) {
      toast({
        title: 'Medical Number (CIN) required',
        description: `${rowsMissingMediCal.length} selected row(s) are missing Medi-Cal/CIN. Re-parse or fix spreadsheet headers before creating skeletons.`,
        variant: 'destructive',
      });
      return;
    }
    const rowsWithDuplicateAuthorization = selectedIlsRows.filter((row) => (ilsRowDuplicateMatches[row.rowId] || []).length > 0);
    if (rowsWithDuplicateAuthorization.length > 0) {
      toast({
        title: 'Remove duplicate authorizations first',
        description: `${rowsWithDuplicateAuthorization.length} selected row(s) match an existing authorization for this MRN.`,
        variant: 'destructive',
      });
      return;
    }

    // Live Caspio + existing-application guards before any skeleton writes.
    let rowsReadyForCreate = selectedIlsRows.filter((row) => !isIlsRowLockedForSkeletonCreate(row));
    try {
      const annotated = await annotateRowsWithCaspioExists(rowsReadyForCreate);
      const caspioBlocked = annotated.filter((row) => row.caspioExists);
      if (caspioBlocked.length) {
        setIlsImportRows((prev) =>
          prev.map((row) => {
            const hit = annotated.find((a) => a.rowId === row.rowId);
            return hit
              ? {
                  ...row,
                  caspioExists: hit.caspioExists,
                  caspioMatchLabel: hit.caspioMatchLabel,
                  caspioMatchedClientId2: hit.caspioMatchedClientId2,
                  caspioMatchedBy: hit.caspioMatchedBy,
                }
              : row;
          })
        );
        toast({
          variant: 'destructive',
          title: 'Already in Caspio',
          description: `${caspioBlocked.length} selected row(s) already exist in Caspio. Skeleton create is blocked for those members.`,
        });
        rowsReadyForCreate = annotated.filter((row) => !row.caspioExists);
      } else {
        rowsReadyForCreate = annotated;
      }
    } catch (liveCaspioError) {
      console.warn('Batch live Caspio check failed:', liveCaspioError);
    }

    const alreadyInAppRows: Array<{ row: KaiserIlsImportRow; appIds: string[] }> = [];
    for (const row of rowsReadyForCreate) {
      try {
        const matches = await findExistingApplicationsForMember(firestore, {
          memberMrn: row.memberMrn,
          memberMediCalNum: row.memberMediCalNum,
        });
        if (matches.length) {
          alreadyInAppRows.push({ row, appIds: matches.map((m) => m.applicationId) });
        }
      } catch (existingAppError) {
        console.warn('Batch existing-app check failed:', existingAppError);
      }
    }
    if (alreadyInAppRows.length) {
      const blockedIds = new Set(alreadyInAppRows.map((item) => item.row.rowId));
      toast({
        variant: 'destructive',
        title: 'Already in Applications',
        description: `${alreadyInAppRows.length} selected row(s) already have an application (e.g. ${
          alreadyInAppRows[0]?.appIds[0] || '—'
        }). Skeleton create is blocked for those members.`,
      });
      rowsReadyForCreate = rowsReadyForCreate.filter((row) => !blockedIds.has(row.rowId));
    }

    if (!rowsReadyForCreate.length) {
      toast({
        title: 'No rows eligible to create',
        description: 'All selected rows are already in Caspio, already have an application, or are locked.',
        variant: 'destructive',
      });
      return;
    }

    const consolidatorRunIdForBatch = String(
      selectedConsolidatorRunId || searchParams.get('consolidatorRunId') || ''
    ).trim();

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

      for (const row of rowsReadyForCreate) {
        try {
          const applicationId = `admin_app_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const applicationRef = doc(firestore, 'applications', applicationId);
          const formsForRow = authReceivedForms.map((form) => ({ ...form }));
          let serviceDeliveryFormUrl = '';
          let serviceDeliveryFormFileName = '';
          let serviceDeliveryFormFilePath = '';
          const sourceFile =
            row.sourceType === 'single_auth_pdf'
              ? parsedSingleAuthFilesRef.current[row.rowId]
              : row.sourceType === 'spreadsheet'
                ? ilsSpreadsheetSourceFileRef.current
                : null;
          if (sourceFile && storage) {
            try {
              const sourceForm = await uploadIntakeSourceFile({
                applicationId,
                file: sourceFile,
                sourceLabel:
                  row.sourceType === 'spreadsheet'
                    ? 'Kaiser ILS Spreadsheet Upload'
                    : 'ILS Authorization Sheet PDF',
                sourceTag: row.sourceType,
              });
              if (sourceForm) {
                formsForRow.unshift(sourceForm);
              }
            } catch (uploadError) {
              console.warn('Failed to upload original intake source file:', uploadError);
            }
          }
          if (row.sourceType === 'spreadsheet' && storage) {
            try {
              const placeholderForm = await createSpreadsheetServiceDeliveryPlaceholder({
                applicationId,
                row,
              });
              if (placeholderForm) {
                serviceDeliveryFormUrl = String(placeholderForm.downloadURL || '').trim();
                serviceDeliveryFormFileName = String(placeholderForm.fileName || '').trim();
                serviceDeliveryFormFilePath = String(placeholderForm.filePath || '').trim();
                formsForRow.unshift(placeholderForm);
              }
            } catch (placeholderError) {
              console.warn('Failed to create Service Delivery placeholder file:', placeholderError);
            }
          }
          const rowEligibilityUploads = await uploadIlsRowEligibilityFiles(applicationId, row.rowId);
          if (rowEligibilityUploads.length > 0) {
            const completedEligibilityForm = {
              name: 'Eligibility Screenshot',
              status: 'Completed',
              type: 'Upload',
              href: '#',
              fileName: rowEligibilityUploads[0].fileName,
              filePath: rowEligibilityUploads[0].filePath,
              downloadURL: rowEligibilityUploads[0].downloadURL,
              uploadedFiles: rowEligibilityUploads,
              dateCompleted: new Date().toISOString(),
              source: 'batch_row_eligibility_upload',
            };
            const eligibilityIndex = formsForRow.findIndex((form) => String(form?.name || '').trim() === 'Eligibility Screenshot');
            if (eligibilityIndex >= 0) {
              formsForRow[eligibilityIndex] = completedEligibilityForm as any;
            } else {
              formsForRow.push(completedEligibilityForm as any);
            }
          }
          await setDoc(applicationRef, {
            memberFirstName: row.memberFirstName,
            memberLastName: row.memberLastName,
            memberMrn: row.memberMrn || '',
            memberMediCalNum: row.memberMediCalNum || '',
            confirmMemberMediCalNum: row.memberMediCalNum || '',
            memberSex: row.memberSex || '',
            memberDob: row.memberDob || '',
            memberPhone: row.memberPhone || '',
            memberEmail: row.memberEmail || '',
            contactPhone: '',
            contactEmail: '',
            careManagerName: '',
            careManagerPhone: '',
            careManagerEmail: '',
            Authorization_Number_T038: row.authorizationNumberT2038 || '',
            Authorization_Start_T2038: row.authorizationStartT2038 || '',
            Authorization_End_T2038: row.authorizationEndT2038 || '',
            CPT_Code: row.cptCode || '',
            Diagnostic_Code: row.diagnosticCode || '',
            memberCustomaryAddress: toNameCase(row.memberAddress || ''),
            memberCustomaryCity: toNameCase(row.memberCity || ''),
            memberCustomaryState: String(
              inferStateFromCityZip({
                city: row.memberCity,
                zip: row.memberZip || parseAddressParts(row.memberAddress || '').zip || '',
              }) || row.memberState || ''
            )
              .trim()
              .toUpperCase(),
            memberCustomaryZip: normalizeUsZip(row.memberZip || parseAddressParts(row.memberAddress || '').zip || ''),
            memberCustomaryCounty: toNameCase(
              inferCountyFromCityZip({
                city: row.memberCity,
                zip: row.memberZip || parseAddressParts(row.memberAddress || '').zip || '',
              }) || row.memberCounty || ''
            ),
            calaimTrackingStatus: normalizeEligibilityStatus(row.eligibilityCheckStatus),
            intakeType: 'kaiser_auth_received_via_ils',
            intakeSource: 'ils_spreadsheet_batch',
            kaiserAuthReceivedViaIls: true,
            ilsMifSourceFileName: String(row.sourceFileName || '').trim(),
            kaiserAuthReceivedDate: serverTimestamp(),
            createdAt: serverTimestamp(),
            createdByAdmin: true,
            status: 'draft',
            currentStep: 1,
            isComplete: false,
            healthPlan: 'Kaiser',
            pathway: '',
            kaiserStatus: '',
            Kaiser_Status: '',
            kaiserPrePushStatusPickedAt: '',
            kaiserStatusSyncSource: '',
            caspioCalAIMStatus: 'Authorized',
            allowDraftCaspioPush: true,
            consolidatorRunId: consolidatorRunIdForBatch || null,
            ilsMifDedupeKey: resolveIlsMifDedupeKey(row, buildIlsMifDedupeKey(row)) || null,
            adminNotes: buildIlsRowAdminNotes(row),
            forms: formsForRow,
            ...(serviceDeliveryFormUrl
              ? {
                  serviceDeliveryForm: {
                    fileName: serviceDeliveryFormFileName,
                    filePath: serviceDeliveryFormFilePath,
                    downloadURL: serviceDeliveryFormUrl,
                    generatedAtIso: new Date().toISOString(),
                    source: 'spreadsheet_service_delivery_placeholder',
                    layoutVersion: MIF_SERVICE_DELIVERY_LAYOUT_VERSION,
                  },
                }
              : {}),
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
                  `Kaiser Status: ${String(row.kaiserStatus || '').trim() || 'Not specified'}\n` +
                  (serviceDeliveryFormUrl ? `Service Delivery Form PDF: ${serviceDeliveryFormUrl}\n` : '') +
                  `Next steps: (1) Confirm Caspio record created, (2) Create Google Drive member folder, (3) Service Delivery Form PDF was auto-created in files for Drive handoff, (4) Upload eligibility evidence, (5) After first member/POA contact, use Application Portal in app to schedule auto-emails.`,
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
              await sendStaffAssignmentWorkflowEmail({
                applicationId,
                appUserId,
                staffId: row.assignedStaffId,
                staffName: row.assignedStaffName || 'Kaiser Staff',
                memberName,
                memberMrn: row.memberMrn || '',
                memberCounty: row.memberCounty || '',
                serviceDeliveryFormUrl,
                serviceDeliveryFormFileName,
                serviceDeliveryFormFilePath,
                kaiserStatus: String(row.kaiserStatus || '').trim(),
                assignedBy: assignedByName,
                alreadyPushedToCaspio: Boolean(row.caspioExists),
              });
            } catch (notifyError) {
              console.warn('Failed to create staff notification for spreadsheet row:', notifyError);
            }
          }
          setIlsImportRows((prev) => prev.filter((r) => r.rowId !== row.rowId));
          try {
            await markIlsMifMemberSkeletonCreated(firestore, {
              memberFirstName: row.memberFirstName,
              memberLastName: row.memberLastName,
              memberMrn: row.memberMrn,
              memberMediCalNum: row.memberMediCalNum,
              memberDob: row.memberDob,
              consolidatorRunId: consolidatorRunIdForBatch,
              ilsMifDedupeKey: resolveIlsMifDedupeKey(row, buildIlsMifDedupeKey(row)),
              applicationId,
              actor: user?.email || user?.uid || '',
            });
          } catch (skeletonSyncError) {
            console.warn('Batch skeleton consolidator sync failed:', skeletonSyncError);
          }
        } catch (err: any) {
          setIlsImportRows((prev) =>
            prev.map((r) =>
              r.rowId === row.rowId ? { ...r, createStatus: 'failed', statusNote: String(err?.message || 'Create failed') } : r
            )
          );
        }
      }
      toast({ title: 'Batch create finished', description: `Processed ${rowsReadyForCreate.length} selected row(s).` });
      if (consolidatorRunIdForBatch) {
        void loadNewMembersFromMifMasterList(consolidatorRunIdForBatch, { silent: true });
      }
      setIlsImportSelected((prev) => {
        const next = { ...prev };
        rowsReadyForCreate.forEach((row) => {
          next[row.rowId] = false;
        });
        return next;
      });
      setIlsRowEligibilityFiles((prev) => {
        const next = { ...prev };
        rowsReadyForCreate.forEach((row) => {
          delete next[row.rowId];
        });
        return next;
      });
      setIlsRowDuplicateMatches((prev) => {
        const next = { ...prev };
        rowsReadyForCreate.forEach((row) => {
          delete next[row.rowId];
        });
        return next;
      });
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
    const createdRows = selectedIlsRows.filter((row) => Boolean(String(row.applicationId || '').trim()));
    if (createdRows.length === 0) {
      toast({
        title: 'Create records first',
        description: 'Create selected application records first, then open one from the main application page to push to Caspio.',
        variant: 'destructive',
      });
      return;
    }
    if (createdRows.length > 1) {
      toast({
        title: 'Select one record',
        description: 'Push must happen from the main application page. Select one created record at a time.',
        variant: 'destructive',
      });
      return;
    }
    setIsPushingIlsRows(true);
    try {
      const target = createdRows[0];
      setIlsImportRows((prev) =>
        prev.map((r) =>
          r.rowId === target.rowId
            ? { ...r, statusNote: 'Open main application page and use Push to Caspio there.' }
            : r
        )
      );
      navigateWithHardFallback(`/admin/applications/${target.applicationId}`);
    } finally {
      setIsPushingIlsRows(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedPhone = formatPhoneDashed(e.currentTarget.value || '');
    setMemberData((prev) => ({ ...prev, contactPhone: formattedPhone }));
  };

  useEffect(() => {
    const current = String(memberData.contactPhone || '');
    const formatted = formatPhoneDashed(current);
    if (formatted !== current) {
      setMemberData((prev) => ({ ...prev, contactPhone: formatted }));
    }
  }, [memberData.contactPhone]);

  const formatMemberPhoneWithDashes = (value: string) => {
    const phoneNumber = value.replace(/\D/g, '');
    const limitedPhoneNumber = phoneNumber.substring(0, 10);
    if (limitedPhoneNumber.length <= 3) return limitedPhoneNumber;
    if (limitedPhoneNumber.length <= 6) {
      return `${limitedPhoneNumber.substring(0, 3)}-${limitedPhoneNumber.substring(3)}`;
    }
    return `${limitedPhoneNumber.substring(0, 3)}-${limitedPhoneNumber.substring(3, 6)}-${limitedPhoneNumber.substring(6)}`;
  };

  const parseServiceRequestPdfAndApply = async (fileOverride?: File | null) => {
    const targetFile = fileOverride instanceof File ? fileOverride : serviceRequestFile;
    if (!targetFile) {
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
      const bytes = await targetFile.arrayBuffer();
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
          const errorData = await response.json().catch(() => ({} as any));
          const errorMessage = String(errorData?.error || 'Vision parsing failed').trim();
          const errorDetails = String(errorData?.details || '').trim();
          const combinedMessage = errorDetails
            ? `${errorMessage} ${errorDetails}`
            : errorMessage;
          throw new Error(combinedMessage);
        }

        const visionResult = await response.json();
        const updates = visionResult.fields;
        const parsedFieldKeys = visionResult.parsedFieldKeys;
        const visionWarnings = visionResult.warnings || [];

        if (parsedFieldKeys.length === 0) {
          setSingleAuthContactPreview(EMPTY_SINGLE_AUTH_CONTACT_PREVIEW);
          setServiceRequestWarnings(visionWarnings);
          setServiceRequestParseMode('vision');
          toast({
            title: 'No fields extracted',
            description: 'Could not extract fields from scanned PDF. Please enter data manually.',
            variant: 'default',
          });
          return;
        }

        const normalizedPatch = normalizeMemberPatch(updates as Record<string, unknown>);
        const sanitizedPatch = withInferredCountyFromAddress(
          withoutCurrentAddressPrefill({ ...normalizedPatch, contactEmail: '' })
        );
        const countyUndetermined = isCountyUndetermined({
          city: sanitizedPatch.memberCustomaryCity,
          zip: sanitizedPatch.memberCustomaryZip,
          county: sanitizedPatch.memberCustomaryCounty,
        });
        if (countyUndetermined) visionWarnings.push(COUNTY_UNDETERMINED_MESSAGE);
        const contactPreview = extractSingleAuthContactPreview(sanitizedPatch);
        setSingleAuthContactPreview(contactPreview);
        setMemberData((prev) => ({
          ...prev,
          ...sanitizedPatch,
          notes: mergeAdminNotes(prev.notes, sanitizedPatch.notes),
        }));
        setServiceRequestParsedFields(parsedFieldKeys);
        setServiceRequestWarnings(visionWarnings);
        setServiceRequestParseMode('vision');
        void checkParsedIdentityAgainstMifAndCaspio({
          memberFirstName: String(sanitizedPatch.memberFirstName || ''),
          memberLastName: String(sanitizedPatch.memberLastName || ''),
          memberMrn: String(sanitizedPatch.memberMrn || ''),
          memberMediCalNum: String(sanitizedPatch.memberMediCalNum || ''),
        });
        toast({
          title: countyUndetermined ? 'County cannot be determined' : 'Service request parsed (Vision)',
          description: countyUndetermined
            ? `${parsedFieldKeys.length} field(s) autofilled. ${COUNTY_UNDETERMINED_MESSAGE}`
            : `Autofilled ${parsedFieldKeys.length} field(s) using AI vision.`,
          variant: countyUndetermined ? 'destructive' : 'default',
        });
        return;
      }

      const parsed = extractServiceRequestFields({ text, fileName: targetFile.name });
      const updates = parsed.updates;
      const parsedFieldKeys = parsed.parsedFields;
      warnings.push(...parsed.warnings);

      if (parsedFieldKeys.length === 0) {
        setSingleAuthContactPreview(EMPTY_SINGLE_AUTH_CONTACT_PREVIEW);
        setServiceRequestWarnings(warnings);
        setServiceRequestParseMode('text');
        toast({
          title: 'No autofill fields found',
          description: warnings[0] || 'No matching fields were found. You can continue entering data manually.',
          variant: 'default',
        });
        return;
      }

      const normalizedPatch = normalizeMemberPatch(updates as Record<string, unknown>);
      const sanitizedPatch = withInferredCountyFromAddress(
        withoutCurrentAddressPrefill({ ...normalizedPatch, contactEmail: '' })
      );
      const countyUndetermined = isCountyUndetermined({
        city: sanitizedPatch.memberCustomaryCity,
        zip: sanitizedPatch.memberCustomaryZip,
        county: sanitizedPatch.memberCustomaryCounty,
      });
      if (countyUndetermined) warnings.push(COUNTY_UNDETERMINED_MESSAGE);
      const contactPreview = extractSingleAuthContactPreview(sanitizedPatch);
      setSingleAuthContactPreview(contactPreview);
      setMemberData((prev) => ({
        ...prev,
        ...sanitizedPatch,
        notes: mergeAdminNotes(prev.notes, sanitizedPatch.notes),
      }));
      setServiceRequestParsedFields(parsedFieldKeys);
      setServiceRequestWarnings(warnings);
      setServiceRequestParseMode('text');
      void checkParsedIdentityAgainstMifAndCaspio({
        memberFirstName: String(sanitizedPatch.memberFirstName || ''),
        memberLastName: String(sanitizedPatch.memberLastName || ''),
        memberMrn: String(sanitizedPatch.memberMrn || ''),
        memberMediCalNum: String(sanitizedPatch.memberMediCalNum || ''),
      });
      toast({
        title: countyUndetermined ? 'County cannot be determined' : 'Service request parsed',
        description: countyUndetermined
          ? `${parsedFieldKeys.length} field(s) autofilled. ${COUNTY_UNDETERMINED_MESSAGE}`
          : `Autofilled ${parsedFieldKeys.length} field(s) from PDF text.`,
        variant: countyUndetermined ? 'destructive' : 'default',
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
      const lowerMessage = safeMessage.toLowerCase();
      const isFetchError =
        lowerMessage.includes('failed to fetch') ||
        lowerMessage.includes('networkerror') ||
        lowerMessage.includes('load failed') ||
        lowerMessage.includes('could not load pdf parser');
      const isVisionQuotaError =
        lowerMessage.includes('credits') ||
        lowerMessage.includes('quota') ||
        lowerMessage.includes('too many requests') ||
        lowerMessage.includes('vision parsing is temporarily unavailable');
      // Avoid logging raw Error objects in dev overlay, which can appear as unhandled runtime errors.
      console.warn('Service request parse failed:', safeMessage);
      if (isVisionQuotaError) {
        setServiceRequestWarnings((prev) => [
          ...prev,
          'Vision parser credits/quota are currently unavailable. Please enter fields manually for now.',
        ]);
      }
      toast({
        title: isVisionQuotaError
          ? 'Vision parsing unavailable'
          : isFetchError
            ? 'Parse network error'
            : 'Parse failed',
        description: isVisionQuotaError
          ? 'Gemini vision credits/quota are currently unavailable. Enter fields manually and continue, or retry later.'
          : isFetchError
            ? 'Could not reach the PDF parser or vision API. Hard-refresh the page, confirm the app is running, then try Parse again.'
            : safeMessage,
        variant: 'destructive',
      });
    } finally {
      setIsParsingServiceRequest(false);
      parseAbortControllerRef.current = null;
    }
  };

  const parseSingleAuthPdfToIlsRows = async (files: File[]) => {
    const pdfFiles = files.filter((file) => file && /\.pdf$/i.test(file.name));
    if (pdfFiles.length === 0) {
      toast({
        title: 'No PDF files selected',
        description: 'Choose one or more single-auth PDF files to parse.',
        variant: 'destructive',
      });
      return;
    }

    const rowsToAppend: KaiserIlsImportRow[] = [];
    const warnings: string[] = [];
    setIsParsingServiceRequest(true);
    parseAbortControllerRef.current = new AbortController();

    try {
      for (const file of pdfFiles) {
        if (parseAbortControllerRef.current?.signal.aborted) break;
        try {
          const pdfjs = await loadPdfJs();
          const bytes = await file.arrayBuffer();
          const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true });
          const pdf = await loadingTask.promise;
          const lines: string[] = [];
          const maxPagesForText = Math.min(pdf.numPages, 8);

          for (let pageNum = 1; pageNum <= maxPagesForText; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const tc = await page.getTextContent();
            const items = (tc.items || []) as Array<any>;
            const pageRows: Array<{ str: string; x: number; y: number }> = [];
            for (const it of items) {
              const str = String(it?.str || '').trim();
              if (!str) continue;
              const tr = it?.transform || [];
              const x = Number(tr?.[4] ?? 0);
              const y = Number(tr?.[5] ?? 0);
              pageRows.push({ str, x, y });
            }

            const byY = new Map<number, Array<{ str: string; x: number }>>();
            for (const row of pageRows) {
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
          if (!text) {
            warnings.push(`${file.name}: no text layer found`);
            continue;
          }
          const parsed = extractServiceRequestFields({ text, fileName: file.name });
          const normalizedPatch = withInferredCountyFromAddress(
            withoutCurrentAddressPrefill(normalizeMemberPatch((parsed?.updates || {}) as Record<string, unknown>))
          );
          const parsedName = sanitizeParsedName({
            firstName: toNameCase(normalizedPatch.memberFirstName || ''),
            lastName: toNameCase(normalizedPatch.memberLastName || ''),
          });
          if (!parsedName.firstName || !parsedName.lastName) {
            warnings.push(`${file.name}: missing member first/last name`);
            continue;
          }

          const rowId = `ils-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          parsedSingleAuthFilesRef.current[rowId] = file;
          rowsToAppend.push({
            rowId,
            sourceType: 'single_auth_pdf',
            sourceFileName: file.name,
            memberFirstName: parsedName.firstName,
            memberLastName: parsedName.lastName,
            memberMrn: String(normalizedPatch.memberMrn || '').trim(),
            memberMediCalNum: normalizeMediCalNumber(String(normalizedPatch.memberMediCalNum || '').trim()),
            memberSex: normalizeMemberSex(String((normalizedPatch as any).memberSex || '').trim()),
            clientId2: '',
            memberAddress: toNameCase(String(normalizedPatch.memberCustomaryAddress || '').trim()),
            memberCity: toNameCase(String(normalizedPatch.memberCustomaryCity || '').trim()),
            memberZip: normalizeUsZip(String(normalizedPatch.memberCustomaryZip || '').trim()),
            memberState: String(
              String(normalizedPatch.memberCustomaryState || '').trim().toUpperCase() ||
                inferStateFromCityZip({
                  city: normalizedPatch.memberCustomaryCity,
                  zip: normalizedPatch.memberCustomaryZip,
                })
            )
              .trim()
              .toUpperCase(),
            memberCounty: toNameCase(
              String(normalizedPatch.memberCustomaryCounty || '').trim() ||
                inferCountyFromCityZip({
                  city: normalizedPatch.memberCustomaryCity,
                  zip: normalizedPatch.memberCustomaryZip,
                }) ||
                ''
            ),
            memberDob: toMmDdYyyy(normalizedPatch.memberDob || ''),
            memberPhone: String(normalizedPatch.memberPhone || '').trim(),
            memberEmail: String(normalizedPatch.memberEmail || '').trim().toLowerCase(),
            contactPhone: String(normalizedPatch.contactPhone || '').trim(),
            contactEmail: '',
            referringOrganization: '',
            emergencyContactName: '',
            emergencyContactRelationship: '',
            emergencyContactPhone: '',
            emergencyContactEmail: '',
            careManagerName: String(normalizedPatch.careManagerName || '').trim(),
            careManagerPhone: String(normalizedPatch.careManagerPhone || '').trim(),
            careManagerEmail: String(normalizedPatch.careManagerEmail || '').trim().toLowerCase(),
            eligibilityCheckStatus: normalizeEligibilityStatus((memberData as any)?.eligibilityCheckStatus),
            authorizationNumberT2038: String(normalizedPatch.Authorization_Number_T038 || '').trim(),
            authorizationStartT2038: toMmDdYyyy(normalizedPatch.Authorization_Start_T2038 || ''),
            authorizationEndT2038: toMmDdYyyy(normalizedPatch.Authorization_End_T2038 || ''),
            kaiserStatus: '',
            dateReceivedRequestForAuthorization: '',
            dateOfReferralAuthorizationDecision: '',
            cptCode: '',
            diagnosticCode: String(normalizedPatch.Diagnostic_Code || '').trim(),
            assignedStaffId: '',
            assignedStaffName: '',
            createStatus: 'idle',
            pushStatus: 'idle',
            deleteStatus: 'idle',
            statusNote: '',
            applicationId: '',
            pushedClientId2: '',
            caspioExists: false,
            caspioMatchLabel: '',
            caspioMatchedClientId2: '',
            caspioMatchedBy: '',
            mifMasterExists: false,
            mifMasterMatchLabel: '',
            mifMasterMatchedBy: '',
            extraAdminNotes: String(normalizedPatch.notes || '').trim(),
          });
        } catch (error: any) {
          warnings.push(`${file.name}: ${String(error?.message || 'Parse failed')}`);
        }
      }

      if (rowsToAppend.length === 0) {
        toast({
          title: 'No usable PDF rows found',
          description: warnings[0] || 'Could not parse member fields from selected PDFs.',
          variant: 'destructive',
        });
        return;
      }

      const annotatedRows = await annotateRowsWithCaspioAndMifMaster(rowsToAppend);
      setIlsImportRows((prev) => [...annotatedRows, ...prev]);
      setIlsImportSelected((prev) => {
        const next = { ...prev };
        annotatedRows.forEach((row) => {
          next[row.rowId] = false;
        });
        return next;
      });
      setPickedIlsRowId('');
      void Promise.all(annotatedRows.map((row) => checkRowDuplicateAuthorizationByMrn(row)));
      setServiceRequestWarnings(warnings.slice(0, 10));
      const existingCount = annotatedRows.filter((row) => row.caspioExists).length;
      const mifMasterCount = annotatedRows.filter((row) => row.mifMasterExists).length;
      const first = annotatedRows[0];
      if (first) {
        void checkParsedIdentityAgainstMifAndCaspio({
          memberFirstName: first.memberFirstName,
          memberLastName: first.memberLastName,
          memberMrn: first.memberMrn,
          memberMediCalNum: first.memberMediCalNum,
          clientId2: first.clientId2,
        });
      }
      toast({
        title: 'Single-auth PDFs parsed',
        description: `Added ${annotatedRows.length} row(s) (${existingCount} already in Caspio, ${mifMasterCount} on latest MIF master). Duplicate matches are flagged before skeleton create.`,
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
    resetAllCreateFields();
  };

  const buildIlsDecisionPreviewDraft = (row: KaiserIlsImportRow, choice: IlsDecisionChoice): IlsDecisionPreviewDraft => {
    const memberName = `${String(row.memberFirstName || '').trim()} ${String(row.memberLastName || '').trim()}`.trim() || 'Unknown Member';
    const memberMrn = String(row.memberMrn || '').trim();
    const memberCounty = String(row.memberCounty || '').trim();
    const memberClientId = String(row.clientId2 || row.caspioMatchedClientId2 || '').trim();
    const subject = buildIlsDecisionSubject(memberName, memberMrn || 'N/A');
    return {
      rowId: row.rowId,
      choice,
      memberName,
      memberMrn,
      memberCounty,
      memberClientId,
      recipients: [...ILS_DECISION_RECIPIENTS],
      subject,
      customText: '',
      idempotencyKey:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    };
  };

  const buildIlsDecisionEmailParts = (draft: IlsDecisionPreviewDraft): IlsDecisionEmailParts => {
    const decisionText = buildIlsDecisionNarrative(draft.choice);
    const customText = String(draft.customText || '').trim();
    return {
      decisionText,
      customText,
      memberLines: [
        `Member: ${draft.memberName}`,
        `MRN: ${draft.memberMrn || 'N/A'}`,
        `County: ${draft.memberCounty || 'N/A'}`,
      ],
      signatureLines: Array.from(ILS_DECISION_SIGNATURE_LINES),
    };
  };

  const openIlsServiceDecisionPreview = (row: KaiserIlsImportRow, choice: IlsDecisionChoice) => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in and retry.', variant: 'destructive' });
      return;
    }
    setPendingIlsDecisionDraft(buildIlsDecisionPreviewDraft(row, choice));
  };

  const sendIlsServiceDecision = async (draft: IlsDecisionPreviewDraft) => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in and retry.', variant: 'destructive' });
      return;
    }
    setSendingIlsDecisionRowId(draft.rowId);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/ils-service-delivery-decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          rowId: draft.rowId,
          sourceType: (ilsImportRows.find((entry) => entry.rowId === draft.rowId)?.sourceType as string) || '',
          sourceFileName: String(ilsImportRows.find((entry) => entry.rowId === draft.rowId)?.sourceFileName || ''),
          memberName: draft.memberName,
          memberMrn: draft.memberMrn,
          memberCounty: draft.memberCounty,
          memberClientId: draft.memberClientId,
          choice: draft.choice,
          customText: draft.customText,
          idempotencyKey: draft.idempotencyKey,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || `Failed to send decision email (HTTP ${response.status})`));
      }
      const log = (body?.log || {}) as any;
      const sentAtIso = String(log?.createdAtIso || new Date().toISOString());
      const sentBy = String(log?.actedByName || user.displayName || user.email || 'Staff').trim();
      setIlsDecisionLogByRowId((prev) => ({
        ...prev,
        [draft.rowId]: {
          choice: draft.choice,
          sentAtIso,
          sentBy,
          logId: String(log?.id || ''),
        },
      }));
      setPendingIlsDecisionDraft(null);
      toast({
        title: draft.choice === 'accept' ? 'Accepted update sent' : 'Declined update sent',
        description: `${draft.memberName} (${draft.memberCounty || 'County N/A'}) was logged and emailed to ILS recipients.`,
      });
    } catch (error: any) {
      toast({
        title: 'Decision send failed',
        description: String(error?.message || 'Could not send decision email.'),
        variant: 'destructive',
      });
    } finally {
      setSendingIlsDecisionRowId('');
    }
  };

  const resetAllCreateFields = () => {
    setMemberData(getEmptyMemberData());
    setSelectedAssignedStaffId('');
    setSelectedAssignedStaffName('');
    setSelectedStaffActionItemCount(0);
    setEligibilityScreenshotFiles([]);
    setServiceRequestFile(null);
    setServiceRequestFiles([]);
    setServiceRequestParsedFields([]);
    setServiceRequestWarnings([]);
    setServiceRequestTextPreview('');
    setIlsRowEligibilityFiles({});
    setIlsRowDuplicateMatches({});
    setCheckingRowDuplicates({});
    setIlsDecisionLogByRowId({});
    setPendingIlsDecisionDraft(null);
    setHasMifCaspioRefresh(false);
    setMifLastCaspioRefreshAtIso('');
    setSingleAuthContactPreview(EMPTY_SINGLE_AUTH_CONTACT_PREVIEW);
    setIlsSpreadsheetFileName('');
    setIlsImportRows([]);
    setIlsImportSelected({});
    setPickedIlsRowId('');
    setActiveSpreadsheetUploadLogId('');
    setShowOnlyNotInCaspio(false);
    setLastCreatedSkeleton(null);
    setIntroEmailDraft(null);
    parsedSingleAuthFilesRef.current = {};
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

  const hasValidMemberName = (value: unknown) => {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    const lowered = normalized.toLowerCase();
    return !['undefined', 'null', 'nan'].includes(lowered);
  };

  const hasRequiredMemberName = hasValidMemberName(memberData.memberFirstName) && hasValidMemberName(memberData.memberLastName);
  const isKaiserAuthReceivedIntake = intakeType === 'kaiser_auth_received_via_ils';
  const countyCannotBeDetermined = isCountyUndetermined({
    city: memberData.memberCustomaryCity,
    zip: memberData.memberCustomaryZip,
    county: memberData.memberCustomaryCounty,
  });
  const notifyCountyUndetermined = (params: { city?: unknown; zip?: unknown; county?: unknown }) => {
    if (!String(params.zip || '').trim()) return;
    if (!isCountyUndetermined(params)) return;
    toast({
      title: 'County cannot be determined',
      description: COUNTY_UNDETERMINED_MESSAGE,
      variant: 'destructive',
    });
  };
  const hasPrimaryContactComplete =
    Boolean(memberData.contactFirstName && memberData.contactLastName && memberData.contactPhone && memberData.contactEmail) &&
    String(memberData.contactPhone || '').replace(/\D/g, '').length === 10;
  const createApplicationForMember = async (options?: { skipNavigate?: boolean; suppressSuccessToast?: boolean }) => {
    const isKaiserAuthReceived = isKaiserAuthReceivedIntake;
    const hasRequiredCreateInputs = isKaiserAuthReceived ? true : (hasRequiredMemberName && hasPrimaryContactComplete);
    const submittingStaff = getSubmittingStaffIdentity(user);

    if (!firestore || !hasRequiredCreateInputs) {
      toast({
        title: "Missing Information",
        description: isKaiserAuthReceived
          ? "Please complete required draft fields before creating the Kaiser auth draft."
          : "Please fill member name and primary contact name, phone, and email before creating the draft application.",
        variant: "destructive",
      });
      return null;
    }

    let ilsConsolidatorRunId = '';
    let ilsMifDedupeKeyForApp = '';
    let ilsPickedRowIdForLock = '';

    if (isKaiserAuthReceived) {
      const pickedRow = ilsImportRows.find((row) => row.rowId === pickedIlsRowId);
      const identity = {
        memberFirstName: String(memberData.memberFirstName || pickedRow?.memberFirstName || '').trim(),
        memberLastName: String(memberData.memberLastName || pickedRow?.memberLastName || '').trim(),
        memberMrn: String(memberData.memberMrn || pickedRow?.memberMrn || '').trim(),
        memberMediCalNum: String(memberData.memberMediCalNum || pickedRow?.memberMediCalNum || '').trim(),
        clientId2: String(pickedRow?.clientId2 || '').trim(),
      };
      const dedupeKey = resolveIlsMifDedupeKey(
        {
          ...identity,
          memberDob: String(memberData.memberDob || pickedRow?.memberDob || ''),
        },
        pickedRow ? buildIlsMifDedupeKey(pickedRow) : ''
      );
      ilsConsolidatorRunId = String(
        selectedConsolidatorRunId || searchParams.get('consolidatorRunId') || ''
      ).trim();
      ilsMifDedupeKeyForApp = dedupeKey;
      ilsPickedRowIdForLock = String(pickedRow?.rowId || '').trim();

      if (pickedRow && isIlsRowCreated(pickedRow)) {
        toast({
          variant: 'destructive',
          title: 'Already has a skeleton',
          description: `This row already has application ${pickedRow.applicationId || ''}.`,
        });
        return null;
      }

      // Live Caspio re-check (row flag can be stale after handoff).
      let liveCaspioHit = Boolean(pickedRow?.caspioExists);
      try {
        const probeRow = (pickedRow ||
          ({
            rowId: 'form-probe',
            sourceType: 'spreadsheet',
            sourceFileName: '',
            memberFirstName: identity.memberFirstName,
            memberLastName: identity.memberLastName,
            memberMrn: identity.memberMrn,
            memberMediCalNum: identity.memberMediCalNum,
            memberDob: String(memberData.memberDob || ''),
            memberSex: '',
            clientId2: identity.clientId2,
            memberAddress: '',
            memberCity: '',
            memberZip: '',
            memberState: '',
            memberCounty: '',
            memberPhone: '',
            memberEmail: '',
            contactPhone: '',
            contactEmail: '',
            referringOrganization: '',
            emergencyContactName: '',
            emergencyContactRelationship: '',
            emergencyContactPhone: '',
            emergencyContactEmail: '',
            careManagerName: '',
            careManagerPhone: '',
            careManagerEmail: '',
            eligibilityCheckStatus: 'Pending',
            authorizationNumberT2038: '',
            authorizationStartT2038: '',
            authorizationEndT2038: '',
            kaiserStatus: '',
            dateReceivedRequestForAuthorization: '',
            dateOfReferralAuthorizationDecision: '',
            cptCode: '',
            diagnosticCode: '',
            assignedStaffId: '',
            assignedStaffName: '',
            createStatus: 'idle',
            pushStatus: 'idle',
            deleteStatus: 'idle',
            statusNote: '',
            applicationId: '',
            pushedClientId2: '',
            caspioExists: false,
            caspioMatchLabel: '',
            caspioMatchedClientId2: '',
            caspioMatchedBy: '',
            mifMasterExists: false,
            mifMasterMatchLabel: '',
            mifMasterMatchedBy: '',
          } as KaiserIlsImportRow));
        const [annotatedProbe] = await annotateRowsWithCaspioExists([probeRow]);
        liveCaspioHit = Boolean(annotatedProbe?.caspioExists);
        if (liveCaspioHit && pickedRow) {
          setIlsImportRows((prev) =>
            prev.map((row) =>
              row.rowId === pickedRow.rowId
                ? {
                    ...row,
                    caspioExists: true,
                    caspioMatchLabel: annotatedProbe.caspioMatchLabel || row.caspioMatchLabel,
                    caspioMatchedClientId2:
                      annotatedProbe.caspioMatchedClientId2 || row.caspioMatchedClientId2,
                    caspioMatchedBy: annotatedProbe.caspioMatchedBy || row.caspioMatchedBy,
                  }
                : row
            )
          );
        }
      } catch (liveCaspioError) {
        console.warn('Live Caspio check failed during skeleton create:', liveCaspioError);
      }

      let existingAppHit: Awaited<ReturnType<typeof findExistingApplicationsForMember>> = [];
      try {
        existingAppHit = await findExistingApplicationsForMember(firestore, {
          memberMrn: identity.memberMrn,
          memberMediCalNum: identity.memberMediCalNum,
        });
      } catch (existingAppError) {
        console.warn('Existing application check failed during skeleton create:', existingAppError);
      }

      let declinedHit = false;
      try {
        const declinedSnap = await getDocs(collection(firestore, ILS_MIF_DECLINED_COLLECTION));
        declinedSnap.forEach((docSnap) => {
          if (declinedHit) return;
          if (docSnap.id === dedupeKey) {
            declinedHit = true;
            return;
          }
          const data = docSnap.data() as any;
          const key = resolveIlsMifDedupeKey({
            clientId2: String(data.clientId2 || ''),
            memberMrn: String(data.memberMrn || ''),
            memberMediCalNum: String(data.memberMediCalNum || ''),
            memberFirstName: String(data.memberFirstName || ''),
            memberLastName: String(data.memberLastName || ''),
            memberDob: String(data.memberDob || ''),
          });
          if (key && key === dedupeKey) declinedHit = true;
        });
      } catch (error) {
        console.warn('Declined-list check failed during skeleton create:', error);
      }

      const caspioHit = liveCaspioHit;
      const alreadyInApp = existingAppHit.length > 0;
      let masterHit = Boolean(pickedRow?.mifMasterExists || singleAuthMifMasterHit?.exists);
      let masterHitLabel = String(pickedRow?.mifMasterMatchLabel || singleAuthMifMasterHit?.matchLabel || '');
      try {
        const liveMif = await lookupIdentityOnMifMaster({
          ...identity,
          memberDob: String(memberData.memberDob || pickedRow?.memberDob || ''),
        });
        if (liveMif.exists) {
          masterHit = true;
          masterHitLabel = liveMif.matchLabel || liveMif.runLabel || masterHitLabel;
          setSingleAuthMifMasterHit((prev) => ({
            exists: true,
            matchLabel: liveMif.matchLabel,
            matchedBy: liveMif.matchedBy,
            runLabel: liveMif.runLabel,
            caspioExists: Boolean(prev?.caspioExists || liveCaspioHit),
            caspioMatchLabel: prev?.caspioMatchLabel || '',
            alreadyInApp: Boolean(prev?.alreadyInApp || alreadyInApp),
            existingApplicationIds: prev?.existingApplicationIds || existingAppHit.map((m) => m.applicationId),
          }));
        }
      } catch (liveMifError) {
        console.warn('Live MIF master check failed during skeleton create:', liveMifError);
      }

      if (caspioHit || declinedHit || alreadyInApp) {
        const blockReason = caspioHit
          ? 'already in Caspio'
          : alreadyInApp
            ? `already has application ${existingAppHit[0]?.applicationId || ''}`
            : 'declined Northern CA';
        try {
          await addDoc(collection(firestore, ILS_MIF_AUDIT_COLLECTION), {
            action: 'skeleton_create_blocked',
            summary: `Blocked skeleton create for ${identity.memberLastName}, ${identity.memberFirstName} (${blockReason})`,
            atIso: new Date().toISOString(),
            atServer: serverTimestamp(),
            actor: user?.email || user?.uid || '',
            caspioHit,
            declinedHit,
            alreadyInApp,
            existingApplicationIds: existingAppHit.map((m) => m.applicationId),
            memberMrn: identity.memberMrn,
          });
        } catch {
          // ignore audit failure
        }
        toast({
          variant: 'destructive',
          title: caspioHit
            ? 'Already in Caspio'
            : alreadyInApp
              ? 'Already in Applications'
              : 'Declined to serve (Northern CA)',
          description: caspioHit
            ? 'This member already exists in Caspio. Skeleton create is blocked to avoid duplicates.'
            : alreadyInApp
              ? `An application already exists for this member (${existingAppHit
                  .slice(0, 3)
                  .map((m) => m.applicationId)
                  .join(', ')}${existingAppHit.length > 3 ? '…' : ''}). Skeleton create is blocked.`
              : 'This member is on the Northern California declined list. Skeleton create is blocked.',
        });
        return null;
      }

      if (masterHit) {
        const proceed = window.confirm(
          `This member appears on the latest consolidated MIF master list${
            masterHitLabel ? ` (${masterHitLabel})` : ''
          }.\n\nCreate a skeleton application anyway?`
        );
        if (!proceed) {
          try {
            await addDoc(collection(firestore, ILS_MIF_AUDIT_COLLECTION), {
              action: 'skeleton_create_blocked',
              summary: `User cancelled skeleton create for master-list member ${identity.memberLastName}, ${identity.memberFirstName}`,
              atIso: new Date().toISOString(),
              atServer: serverTimestamp(),
              actor: user?.email || user?.uid || '',
              masterHit: true,
              memberMrn: identity.memberMrn,
            });
          } catch {
            // ignore
          }
          return null;
        }
      }
    }

    setIsCreating(true);
    try {
      // Create a unique application ID for this member
      const applicationId = `admin_app_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const applicationRef = doc(firestore, 'applications', applicationId);
      
      const ilsReferrerName = parseMemberName(memberData.careManagerName || '');
      const ilsReferrerFirstName = memberData.contactFirstName || ilsReferrerName.firstName || '';
      const ilsReferrerLastName = memberData.contactLastName || ilsReferrerName.lastName || '';
      const ilsReferrerEmail = memberData.contactEmail || memberData.careManagerEmail || '';
      const ilsReferrerPhone = memberData.contactPhone || memberData.careManagerPhone || memberData.memberPhone || '';

      // Create the application document with initial member and contact information
      const baseApplication: Record<string, unknown> = {
        // Member information
        memberFirstName: memberData.memberFirstName,
        memberLastName: memberData.memberLastName,
        ...(isKaiserAuthReceived
          ? {
              memberMrn: memberData.memberMrn || '',
              confirmMemberMrn: memberData.memberMrn || '',
              memberMediCalNum: memberData.memberMediCalNum || '',
              confirmMemberMediCalNum: memberData.confirmMemberMediCalNum || memberData.memberMediCalNum || '',
              memberSex: memberData.memberSex || '',
              memberDob: memberData.memberDob || '',
              memberPhone: memberData.memberPhone || '',
              memberEmail: memberData.memberEmail || '',
              careManagerName: memberData.careManagerName || '',
              careManagerPhone: memberData.careManagerPhone || '',
              careManagerEmail: memberData.careManagerEmail || '',
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
              calaimTrackingStatus: String(memberData.eligibilityCheckStatus || '').trim() || 'Pending',
            }
          : {}),

        // Referrer details
        // For ILS auth intake, do not default referrer to submitting staff.
        referrerFirstName: isKaiserAuthReceived ? ilsReferrerFirstName : (submittingStaff.firstName || ''),
        referrerLastName: isKaiserAuthReceived ? ilsReferrerLastName : (submittingStaff.lastName || ''),
        referrerEmail: isKaiserAuthReceived ? ilsReferrerEmail : (submittingStaff.email || ''),
        referrerPhone: isKaiserAuthReceived ? ilsReferrerPhone : (submittingStaff.phone || memberData.contactPhone || memberData.memberPhone || ''),
        referrerRelationship: isKaiserAuthReceived ? 'ILS Referral' : 'Staff',
        agency: 'Connections Care Home Consultants',

        // Primary contact for member outreach
        isPrimaryContactSameAsReferrer: false,
        bestContactFirstName: memberData.contactFirstName || parseMemberName(memberData.careManagerName || '').firstName || '',
        bestContactLastName: memberData.contactLastName || parseMemberName(memberData.careManagerName || '').lastName || '',
        bestContactPhone: memberData.contactPhone || memberData.careManagerPhone || memberData.memberPhone || '',
        bestContactRelationship: memberData.contactRelationship || '',
        bestContactEmail: memberData.contactEmail || memberData.careManagerEmail || '',

        intakeType,
        intakeSource: isKaiserAuthReceived
          ? (String(memberData.parsedSourceType || '').trim() === 'spreadsheet'
              ? 'ils_spreadsheet_batch'
              : 'ils_single_authorization_sheet')
          : 'family_call',
        kaiserAuthReceivedViaIls: isKaiserAuthReceived,
        kaiserAuthReceivedDate: isKaiserAuthReceived ? serverTimestamp() : null,
        ilsMifSourceFileName: isKaiserAuthReceived ? String(ilsSpreadsheetFileName || '').trim() : '',

        // Application metadata
        createdAt: serverTimestamp(),
        createdByAdmin: true,
        draftSubmittedByStaffUid: submittingStaff.uid || null,
        draftSubmittedByStaffName: submittingStaff.name || null,
        draftSubmittedByStaffEmail: submittingStaff.email || null,
        status: 'draft',
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
      let currentAuthForms = authReceivedForms.map((form) => ({ ...form }));
      let generatedServiceDeliveryFormUrl = '';
      let generatedServiceDeliveryFormFileName = '';
      let generatedServiceDeliveryFormFilePath = '';
      const isMifSpreadsheetCreate =
        isKaiserAuthReceived &&
        !serviceRequestFile &&
        String(memberData.parsedSourceType || '').trim() !== 'single_auth_pdf';

      if (isMifSpreadsheetCreate) {
        try {
          const spreadsheetRowLike: KaiserIlsImportRow = {
            rowId: 'manual-spreadsheet-parse',
            sourceType: 'spreadsheet',
            sourceFileName: String(ilsSpreadsheetFileName || '').trim(),
            memberFirstName: String(memberData.memberFirstName || '').trim(),
            memberLastName: String(memberData.memberLastName || '').trim(),
            memberMrn: String(memberData.memberMrn || '').trim(),
            memberMediCalNum: String(memberData.memberMediCalNum || '').trim(),
            memberSex: String(memberData.memberSex || '').trim(),
            clientId2: '',
            memberAddress: String(memberData.memberCustomaryAddress || '').trim(),
            memberCity: String(memberData.memberCustomaryCity || '').trim(),
            memberZip: String(memberData.memberCustomaryZip || '').trim(),
            memberState: String(memberData.memberCustomaryState || '').trim(),
            memberCounty: String(memberData.memberCustomaryCounty || '').trim(),
            memberDob: String(memberData.memberDob || '').trim(),
            memberPhone: String(memberData.memberPhone || '').trim(),
            memberEmail: String(memberData.memberEmail || '').trim(),
            contactPhone: String(memberData.contactPhone || '').trim(),
            contactEmail: String(memberData.contactEmail || '').trim(),
            referringOrganization: '',
            emergencyContactName: '',
            emergencyContactRelationship: '',
            emergencyContactPhone: '',
            emergencyContactEmail: '',
            careManagerName: String(memberData.careManagerName || '').trim(),
            careManagerPhone: String(memberData.careManagerPhone || '').trim(),
            careManagerEmail: String(memberData.careManagerEmail || '').trim(),
            eligibilityCheckStatus: normalizeEligibilityStatus(memberData.eligibilityCheckStatus),
            authorizationNumberT2038: String(memberData.Authorization_Number_T038 || '').trim(),
            authorizationStartT2038: String(memberData.Authorization_Start_T2038 || '').trim(),
            authorizationEndT2038: String(memberData.Authorization_End_T2038 || '').trim(),
            kaiserStatus: String(memberData.kaiserStatus || '').trim(),
            dateReceivedRequestForAuthorization: '',
            dateOfReferralAuthorizationDecision: '',
            cptCode: '',
            diagnosticCode: String(memberData.Diagnostic_Code || '').trim(),
            assignedStaffId: selectedAssignedStaffId || '',
            assignedStaffName: selectedAssignedStaffName || '',
            createStatus: 'idle',
            pushStatus: 'idle',
            deleteStatus: 'idle',
            statusNote: '',
            applicationId: '',
            pushedClientId2: '',
            caspioExists: false,
            caspioMatchLabel: '',
            caspioMatchedClientId2: '',
            caspioMatchedBy: '',
            mifMasterExists: false,
            mifMasterMatchLabel: '',
            mifMasterMatchedBy: '',
          };
          const serviceDeliveryForm = await createSpreadsheetServiceDeliveryPlaceholder({
            applicationId,
            row: spreadsheetRowLike,
          });
          if (serviceDeliveryForm) {
            generatedServiceDeliveryFormUrl = String(serviceDeliveryForm.downloadURL || '').trim();
            generatedServiceDeliveryFormFileName = String(serviceDeliveryForm.fileName || '').trim();
            generatedServiceDeliveryFormFilePath = String(serviceDeliveryForm.filePath || '').trim();
            currentAuthForms = [serviceDeliveryForm, ...currentAuthForms];
          }
        } catch (error) {
          console.warn('Failed to create spreadsheet Service Delivery Form PDF:', error);
          toast({
            variant: 'destructive',
            title: 'Service Delivery Form not saved',
            description: 'Skeleton was created, but the MIF Service Delivery Form PDF could not be generated. Open the application Files dialog to retry.',
          });
        }
      }

      await setDoc(applicationRef, {
        ...baseApplication,
        healthPlan: isKaiserAuthReceived ? 'Kaiser' : '',
        pathway: '',
        kaiserStatus: '',
        Kaiser_Status: '',
        kaiserPrePushStatusPickedAt: '',
        kaiserStatusSyncSource: '',
        caspioCalAIMStatus: isKaiserAuthReceived ? 'Authorized' : '',
        allowDraftCaspioPush: isKaiserAuthReceived ? true : false,
        ...(isKaiserAuthReceived
          ? {
              consolidatorRunId: ilsConsolidatorRunId || null,
              ilsMifDedupeKey: ilsMifDedupeKeyForApp || null,
            }
          : {}),
        forms: isKaiserAuthReceived ? currentAuthForms : [],
        ...(generatedServiceDeliveryFormUrl
          ? {
              serviceDeliveryForm: {
                fileName: generatedServiceDeliveryFormFileName,
                filePath: generatedServiceDeliveryFormFilePath,
                downloadURL: generatedServiceDeliveryFormUrl,
                generatedAtIso: new Date().toISOString(),
                source: 'spreadsheet_service_delivery_placeholder',
                layoutVersion: MIF_SERVICE_DELIVERY_LAYOUT_VERSION,
              },
            }
          : {}),
        ...(isKaiserAuthReceived
          ? (selectedAssignedStaffId
              ? {
              assignedStaffId: selectedAssignedStaffId,
              assignedStaffName: selectedAssignedStaffName,
              assignedDate: new Date().toISOString(),
                }
              : {})
          : {}),
      });

      if (isKaiserAuthReceived && serviceRequestFile && storage) {
        try {
          const sourceForm = await uploadIntakeSourceFile({
            applicationId,
            file: serviceRequestFile,
            sourceLabel: 'ILS Authorization Sheet PDF',
            sourceTag: 'single_auth_pdf',
          });
          if (sourceForm) {
            currentAuthForms = [sourceForm, ...currentAuthForms];
            await setDoc(applicationRef, { forms: currentAuthForms, lastUpdated: serverTimestamp() }, { merge: true });
          }
        } catch (error) {
          console.warn('Failed to upload single-auth source PDF:', error);
        }
      }

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
            const updatedForms = currentAuthForms.map((f) =>
              f.name === 'Eligibility Screenshot' ? completedEligibilityForm : f
            );
            currentAuthForms = updatedForms;
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
              `You were assigned ${memberName} in Application Pathway.\n` +
              `MRN: ${memberMrn} • DOB: ${memberDob} • County: ${memberCounty}\n` +
              `MCP: ${mcpName} • Pathway: ${pathwayName}\n` +
              (generatedServiceDeliveryFormUrl
                ? `Service Delivery Form PDF: ${generatedServiceDeliveryFormUrl}\n`
                : '') +
              `Next steps: (1) Confirm Caspio record created, (2) Create Google Drive member folder, (3) Upload eligibility evidence, (4) After first member/POA contact, use Application Portal in app to schedule auto-emails.`,
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
          await sendStaffAssignmentWorkflowEmail({
            applicationId,
            appUserId,
            staffId: selectedAssignedStaffId,
            staffName: selectedAssignedStaffName || 'Kaiser Staff',
            memberName,
            memberMrn: memberMrn === '—' ? '' : memberMrn,
            memberCounty: memberCounty === '—' ? '' : memberCounty,
            serviceDeliveryFormUrl: generatedServiceDeliveryFormUrl,
            serviceDeliveryFormFileName: generatedServiceDeliveryFormFileName,
            serviceDeliveryFormFilePath: generatedServiceDeliveryFormFilePath,
            kaiserStatus: String(memberData.kaiserStatus || '').trim(),
            assignedBy: assignedByName,
            alreadyPushedToCaspio: Boolean(isKaiserAuthReceived && (memberData as any)?.caspioExists),
          });
        } catch (error) {
          console.warn('Failed to create initial staff assignment notification:', error);
        }
      }

      const nextTarget = isKaiserAuthReceived
        ? `/admin/applications/${applicationId}`
        : `/admin/applications/create/cs-summary?applicationId=${applicationId}`;
      if (!options?.suppressSuccessToast) {
        toast({
          title: isKaiserAuthReceived ? "Created" : "Application Created",
          description: isKaiserAuthReceived
            ? `Application created for ${memberData.memberFirstName} ${memberData.memberLastName}. Redirecting to Application Pathway for eligibility checks.`
            : `Application created for ${memberData.memberFirstName} ${memberData.memberLastName}. Redirecting to CS Summary form.`,
          action: (
            <ToastAction
              altText={isKaiserAuthReceived ? "Open application pathway" : "Open CS Summary form"}
              onClick={() => navigateWithHardFallback(nextTarget)}
            >
              {isKaiserAuthReceived ? 'Open Application Pathway' : 'Open CS Summary'}
            </ToastAction>
          ),
        });
      }
      const memberName = `${memberData.memberFirstName || ''} ${memberData.memberLastName || ''}`.trim() || 'Member';
      setLastCreatedSkeleton({ applicationId, memberName, clientId2: '' });
      if (isKaiserAuthReceived && ilsPickedRowIdForLock) {
        setIlsImportRows((prev) => prev.filter((row) => row.rowId !== ilsPickedRowIdForLock));
        setIlsImportSelected((prev) => {
          const next = { ...prev };
          delete next[ilsPickedRowIdForLock];
          return next;
        });
        if (pickedIlsRowId === ilsPickedRowIdForLock) setPickedIlsRowId('');
      }
      if (isKaiserAuthReceived && firestore) {
        try {
          await markIlsMifMemberSkeletonCreated(firestore, {
            memberFirstName: String(memberData.memberFirstName || '').trim(),
            memberLastName: String(memberData.memberLastName || '').trim(),
            memberMrn: String(memberData.memberMrn || '').trim(),
            memberMediCalNum: String(memberData.memberMediCalNum || '').trim(),
            memberDob: String(memberData.memberDob || '').trim(),
            consolidatorRunId: ilsConsolidatorRunId,
            ilsMifDedupeKey: ilsMifDedupeKeyForApp,
            applicationId,
            actor: user?.email || user?.uid || '',
            assignedStaffId: selectedAssignedStaffId || '',
            assignedStaffName: selectedAssignedStaffName || '',
          });
        } catch (skeletonSyncError) {
          console.warn('Skeleton create consolidator sync failed:', skeletonSyncError);
        }
        try {
          await addDoc(collection(firestore, ILS_MIF_AUDIT_COLLECTION), {
            action: 'skeleton_create',
            summary: `Created skeleton ${applicationId} for ${memberName}${
              selectedAssignedStaffName ? ` · assigned ${selectedAssignedStaffName}` : ''
            }`,
            atIso: new Date().toISOString(),
            atServer: serverTimestamp(),
            actor: user?.email || user?.uid || '',
            applicationId,
            memberMrn: String(memberData.memberMrn || ''),
            consolidatorRunId: ilsConsolidatorRunId || '',
            ilsMifDedupeKey: ilsMifDedupeKeyForApp || '',
            assignedStaffId: selectedAssignedStaffId || '',
            assignedStaffName: selectedAssignedStaffName || '',
          });
        } catch (auditError) {
          console.warn('Skeleton create audit write failed:', auditError);
        }
        if (ilsConsolidatorRunId) {
          void loadNewMembersFromMifMasterList(ilsConsolidatorRunId, { silent: true });
        }
      }
      setIntroEmailDraft(null);
      const shouldSkipNavigate = options?.skipNavigate ?? false;
      if (!shouldSkipNavigate) {
        navigateWithHardFallback(nextTarget);
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

  const loadIntroEmailPreview = async () => {
    const applicationId = String(lastCreatedSkeleton?.applicationId || '').trim();
    if (!applicationId) {
      toast({ title: 'No skeleton application', description: 'Create a skeleton application first.' });
      return;
    }
    if (!user) {
      toast({ title: 'Not signed in', description: 'Please refresh and try again.', variant: 'destructive' });
      return;
    }
    setIsLoadingIntroEmailPreview(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/send-introductory-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          applicationId,
          mode: 'preview',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load introductory email preview.');
      }
      setIntroEmailDraft({
        to: String(data?.draft?.to || '').trim(),
        subject: String(data?.draft?.subject || '').trim(),
        message: String(data?.draft?.message || '').trim(),
        senderFrom: String(data?.sender?.from || '').trim(),
        senderWarning: String(data?.sender?.warning || '').trim(),
        senderUsesFallbackFrom: Boolean(data?.sender?.usesFallbackFrom),
      });
      toast({
        title: 'Preview loaded',
        description: `Introductory email draft is ready for review.`,
      });
    } catch (error: any) {
      toast({
        title: 'Preview failed',
        description: String(error?.message || 'Unable to load introductory email preview.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoadingIntroEmailPreview(false);
    }
  };

  const sendIntroductoryEmail = async () => {
    const applicationId = String(lastCreatedSkeleton?.applicationId || '').trim();
    if (!applicationId) {
      toast({ title: 'No skeleton application', description: 'Create a skeleton application first.' });
      return;
    }
    if (!introEmailDraft) {
      toast({ title: 'No preview loaded', description: 'Load an introductory email preview first.' });
      return;
    }
    if (!selectedAssignedStaffId) {
      toast({
        title: 'Assigned case manager required',
        description: 'Assign staff before sending the introductory invite.',
        variant: 'destructive',
      });
      return;
    }
    if (!user) {
      toast({ title: 'Not signed in', description: 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    const to = String(introEmailDraft.to || '').trim();
    const subject = String(introEmailDraft.subject || '').trim();
    const message = String(introEmailDraft.message || '').trim();
    if (!to || !subject || !message) {
      toast({
        title: 'Missing email content',
        description: 'Recipient, subject, and message are required before sending.',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingIntroEmail(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/send-introductory-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          applicationId,
          mode: 'send',
          to,
          subject,
          message,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to send introductory email.');
      }
      toast({
        title: 'Introductory email sent',
        description: `Email sent to ${to} and logged in Email Logs.`,
      });
    } catch (error: any) {
      toast({
        title: 'Send failed',
        description: String(error?.message || 'Unable to send introductory email.'),
        variant: 'destructive',
      });
    } finally {
      setIsSendingIntroEmail(false);
    }
  };

  const isFormValid = isKaiserAuthReceivedIntake ? true : (hasRequiredMemberName && hasPrimaryContactComplete);

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
    <div className="w-full px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.assign('/admin/applications');
              return;
            }
            navigateWithHardFallback('/admin/applications');
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Applications
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
                id="kaiser-auth-received-via-ils"
                variant={intakeType === 'kaiser_auth_received_via_ils' ? 'default' : 'outline'}
                onClick={() => setIntakeType('kaiser_auth_received_via_ils')}
                className="justify-start scroll-mt-24"
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
            {intakeType === 'kaiser_auth_received_via_ils' && (
              <p className="text-xs text-blue-700 mt-1">
                Workflow order: create skeleton draft first, then complete eligibility check and uploads from Quick Actions on the main application page.
              </p>
            )}
          </div>

          {/* Member Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Member Information</h3>
            {intakeType !== 'kaiser_auth_received_via_ils' && (
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
            )}
            {intakeType === 'kaiser_auth_received_via_ils' && (
              <div id="kaiser-ils-datapage" className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 scroll-mt-24">
                <div className="md:col-span-2 space-y-3">
                  <div className="p-3 border rounded-md bg-indigo-50/40 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">Section 1: Spreadsheet Parse (No Batch Create)</div>
                        <div className="text-xs text-muted-foreground">
                          Load a consolidator run, leave picks off, then select one member at a time: parse → create
                          skeleton → assign staff.
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void refreshCaspioBeforeSpreadsheetParse()}
                          disabled={isCheckingCaspioExisting || isParsingIlsSpreadsheet}
                        >
                          {isCheckingCaspioExisting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Refreshing Caspio...
                            </>
                          ) : (
                            <>
                              <Database className="mr-2 h-4 w-4" />
                              1) Refresh Caspio Members
                            </>
                          )}
                        </Button>
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
                          disabled={isParsingIlsSpreadsheet || isCheckingCaspioExisting || !hasMifCaspioRefresh}
                        >
                          {isParsingIlsSpreadsheet ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                          {isParsingIlsSpreadsheet ? 'Parsing spreadsheet...' : '2) Upload MIF Spreadsheet'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            void loadNewMembersFromMifMasterList(selectedConsolidatorRunId || undefined, {
                              preferLatest: !selectedConsolidatorRunId,
                            })
                          }
                          disabled={isParsingIlsSpreadsheet || isCheckingCaspioExisting || isLoadingConsolidatorRuns}
                        >
                          <Users className="mr-2 h-4 w-4" />
                          Refresh Consolidated Run
                        </Button>
                        <div className="w-full space-y-2 rounded-md border bg-white p-3">
                          <div className="text-sm font-medium">Create App filtered list (not in Caspio)</div>
                          <div className="text-xs text-muted-foreground">
                            Comprehensive MIF members stay on ILS MIF Consolidator. This page loads the filtered
                            Create App list: not already in Caspio, no skeleton yet, and not Northern declined.
                            Refresh after new MIF uploads or skeleton creates.
                          </div>
                          <Select
                            value={selectedConsolidatorRunId || undefined}
                            onValueChange={(value) => setSelectedConsolidatorRunId(value)}
                          >
                            <SelectTrigger className="max-w-xl bg-white">
                              <SelectValue
                                placeholder={
                                  isLoadingConsolidatorRuns
                                    ? 'Loading consolidation runs…'
                                    : consolidatorRuns.length
                                      ? 'Optional: pick a run, or refresh to use the latest'
                                      : 'No consolidation runs saved yet'
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {consolidatorRuns.map((run) => (
                                <SelectItem key={run.id} value={run.id}>
                                  {(run.createdAtIso
                                    ? new Date(run.createdAtIso).toLocaleString()
                                    : run.label) +
                                    ` · ${run.newMemberCount} new` +
                                    (run.sourceFiles.length ? ` · ${run.sourceFiles.length} MIF file(s)` : '')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="text-xs text-slate-700">
                            <div>
                              Master list create date:{' '}
                              <span className="font-medium">
                                {createAppLoadedRunId
                                  ? (() => {
                                      const selected = consolidatorRuns.find(
                                        (run) => run.id === createAppLoadedRunId
                                      );
                                      return selected?.createdAtIso
                                        ? new Date(selected.createdAtIso).toLocaleString()
                                        : '—';
                                    })()
                                  : '—'}
                              </span>
                            </div>
                            <div className="mt-1">
                              Last consolidated refresh:{' '}
                              <span className="font-medium">
                                {createAppLoadedAtIso
                                  ? new Date(createAppLoadedAtIso).toLocaleString()
                                  : '—'}
                              </span>
                            </div>
                            <div className="mt-1">
                              Source MIF files:{' '}
                              {createAppLoadedRunId
                                ? (() => {
                                    const selected = consolidatorRuns.find(
                                      (run) => run.id === createAppLoadedRunId
                                    );
                                    return selected?.sourceFiles?.length
                                      ? selected.sourceFiles.join(', ')
                                      : '—';
                                  })()
                                : '—'}
                            </div>
                          </div>
                          {consolidatorUploadedFiles.length > 0 ? (
                            <div className="max-h-28 overflow-auto rounded border bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                              <div className="font-medium">Recently uploaded MIFs</div>
                              {consolidatorUploadedFiles.slice(0, 12).map((file) => (
                                <div key={file.id}>
                                  {file.fileName} ·{' '}
                                  {file.uploadedAtIso
                                    ? new Date(file.uploadedAtIso).toLocaleString()
                                    : '—'}{' '}
                                  · {file.rowCount} rows
                                  {file.runId ? ` · run ${file.runId}` : ''}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground md:col-span-2">
                          Refresh loads the latest consolidator run (or the run you picked) into this filtered list.
                          Members already in Caspio or with a skeleton application stay on the comprehensive MIF list
                          but are removed here.
                        </p>
                        <Link
                          href="/admin/tools/ils-mif-consolidator"
                          className="inline-flex items-center text-xs text-blue-700 underline"
                        >
                          Open ILS MIF Consolidator
                        </Link>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={parsePickedIlsRowToForm}
                          disabled={ilsImportRows.length === 0}
                        >
                          Manual Parse Picked Row to Form
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={clearIlsSpreadsheetImport}
                          disabled={isParsingIlsSpreadsheet || (ilsImportRows.length === 0 && !ilsSpreadsheetFileName)}
                        >
                          Delete Spreadsheet Upload
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md border bg-slate-50 px-2 py-1 text-xs text-slate-700">
                      Recommended order: refresh Caspio members - upload MIF spreadsheet - pick row - parse row into form - create one application using the main Create button.
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Spreadsheet file: {ilsSpreadsheetFileName || 'None'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last Caspio refresh:{' '}
                      {mifLastCaspioRefreshAtIso ? new Date(mifLastCaspioRefreshAtIso).toLocaleString() : 'Not run yet'}
                    </div>
                    {!hasMifCaspioRefresh ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        Step required: click <span className="font-medium">1) Refresh Caspio Members</span> before each MIF upload.
                      </div>
                    ) : null}
                    {ilsSpreadsheetFileName ? (
                      <div className="rounded-md border bg-emerald-50/60 px-2 py-1 text-xs text-emerald-800">
                        Uploaded spreadsheet: <span className="font-medium">{ilsSpreadsheetFileName}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="p-3 border rounded-md bg-white/80 space-y-2">
                    <div className="font-medium">Section 2: Single Auth (Allow Multiple PDFs)</div>
                    <div className="text-xs text-muted-foreground">
                      Parse always checks the latest consolidated MIF master list and Caspio. Duplicates show a warning,
                      and skeleton create is blocked if the member is already in Caspio or already has an application.
                    </div>
                    <div className="rounded-md border border-indigo-200 bg-indigo-50/50 p-2 space-y-2">
                      <div className="text-xs font-medium text-indigo-950">
                        Check latest consolidated MIF master + Caspio
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <Input
                          value={mifMasterSearchMrn}
                          onChange={(e) => setMifMasterSearchMrn(e.target.value)}
                          placeholder="MRN"
                          className="h-8 bg-white text-xs"
                        />
                        <Input
                          value={mifMasterSearchMediCal}
                          onChange={(e) => setMifMasterSearchMediCal(e.target.value)}
                          placeholder="Medi-Cal / CIN"
                          className="h-8 bg-white text-xs"
                        />
                        <Input
                          value={mifMasterSearchLastName}
                          onChange={(e) => setMifMasterSearchLastName(e.target.value)}
                          placeholder="Last name"
                          className="h-8 bg-white text-xs"
                        />
                        <Input
                          value={mifMasterSearchFirstName}
                          onChange={(e) => setMifMasterSearchFirstName(e.target.value)}
                          placeholder="First name"
                          className="h-8 bg-white text-xs"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={isSearchingMifMaster}
                          onClick={() => void searchMifMasterList()}
                        >
                          {isSearchingMifMaster ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Search className="mr-2 h-3.5 w-3.5" />
                          )}
                          Search MIF Master List
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => {
                            setMifMasterSearchMrn(String(memberData.memberMrn || ''));
                            setMifMasterSearchMediCal(String(memberData.memberMediCalNum || ''));
                            setMifMasterSearchLastName(String(memberData.memberLastName || ''));
                            setMifMasterSearchFirstName(String(memberData.memberFirstName || ''));
                          }}
                        >
                          Use form fields
                        </Button>
                      </div>
                      {mifMasterSearchResult ? (
                        <div
                          className={`rounded border px-2 py-1.5 text-xs ${
                            mifMasterSearchResult.exists
                              ? 'border-indigo-300 bg-indigo-100 text-indigo-950'
                              : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          }`}
                        >
                          {mifMasterSearchResult.exists ? (
                            <>
                              On latest MIF master
                              {mifMasterSearchResult.matchedBy
                                ? ` (matched by ${mifMasterSearchResult.matchedBy})`
                                : ''}
                              {mifMasterSearchResult.matchLabel
                                ? `: ${mifMasterSearchResult.matchLabel}`
                                : ''}
                              {mifMasterSearchResult.runLabel ? ` · ${mifMasterSearchResult.runLabel}` : ''}
                              .
                            </>
                          ) : (
                            <>Not on latest consolidated MIF master{mifMasterSearchResult.queriedAs ? ` for ${mifMasterSearchResult.queriedAs}` : ''}{mifMasterSearchResult.runLabel ? ` (${mifMasterSearchResult.runLabel})` : ''}.</>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <input
                      ref={serviceRequestFileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const selectedList = Array.from(e.target.files || []);
                        setServiceRequestFiles(selectedList);
                        setServiceRequestFile(selectedList[0] || null);
                        setServiceRequestParsedFields([]);
                        setServiceRequestWarnings([]);
                        setSingleAuthContactPreview(EMPTY_SINGLE_AUTH_CONTACT_PREVIEW);
                        setSingleAuthMifMasterHit(null);
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => serviceRequestFileInputRef.current?.click()}
                        disabled={isParsingServiceRequest}
                      >
                        1) Upload Single Auth PDF
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void parseServiceRequestPdfAndApply()}
                        disabled={!serviceRequestFile || isParsingServiceRequest}
                      >
                        {isParsingServiceRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                        {isParsingServiceRequest ? 'Parsing...' : '2) Parse First PDF to Form'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={clearServiceRequestFile}
                        disabled={!serviceRequestFile || isParsingServiceRequest}
                      >
                        Delete Single Auth PDF + Reset Form
                      </Button>
                    </div>
                    {singleAuthMifMasterHit ? (
                      <div
                        className={`rounded-md border px-2 py-1.5 text-xs ${
                          singleAuthMifMasterHit.caspioExists || singleAuthMifMasterHit.alreadyInApp
                            ? 'border-red-300 bg-red-50 text-red-950'
                            : singleAuthMifMasterHit.exists
                              ? 'border-amber-300 bg-amber-50 text-amber-950'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        }`}
                      >
                        {singleAuthMifMasterHit.caspioExists ||
                        singleAuthMifMasterHit.alreadyInApp ||
                        singleAuthMifMasterHit.exists ? (
                          <div className="space-y-0.5">
                            <div className="font-medium">Duplicate warning — review before creating a skeleton.</div>
                            {singleAuthMifMasterHit.caspioExists ? (
                              <div>
                                Already in Caspio
                                {singleAuthMifMasterHit.caspioMatchLabel
                                  ? ` (${singleAuthMifMasterHit.caspioMatchLabel})`
                                  : ''}
                                . Skeleton create will be blocked.
                              </div>
                            ) : null}
                            {singleAuthMifMasterHit.alreadyInApp ? (
                              <div>
                                Already has application
                                {singleAuthMifMasterHit.existingApplicationIds?.length
                                  ? ` (${singleAuthMifMasterHit.existingApplicationIds.slice(0, 3).join(', ')})`
                                  : ''}
                                . Skeleton create will be blocked.
                              </div>
                            ) : null}
                            {singleAuthMifMasterHit.exists ? (
                              <div>
                                On latest consolidated MIF master
                                {singleAuthMifMasterHit.matchedBy
                                  ? ` (${singleAuthMifMasterHit.matchedBy}`
                                  : ''}
                                {singleAuthMifMasterHit.matchLabel
                                  ? `${singleAuthMifMasterHit.matchedBy ? ' - ' : ': '}${singleAuthMifMasterHit.matchLabel}`
                                  : ''}
                                {singleAuthMifMasterHit.matchedBy ? ')' : ''}
                                {singleAuthMifMasterHit.runLabel ? ` · ${singleAuthMifMasterHit.runLabel}` : ''}. You
                                will be asked to confirm before creating a skeleton.
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <>Parsed member is not on the latest MIF master list and was not found in Caspio.</>
                        )}
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      Single auth PDF selected: {serviceRequestFiles.length}
                    </div>
                    {serviceRequestFiles.length > 0 ? (
                      <div className="rounded-md border bg-slate-50 p-2 space-y-1">
                        <div className="text-xs font-medium text-slate-700">Uploaded single-auth PDF:</div>
                        <div className="space-y-1">
                          {serviceRequestFiles.map((file, idx) => (
                            <div key={`${file.name}-${idx}`} className="text-xs text-slate-700 break-all">
                              {idx + 1}. {file.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      Subject template for ILS updates: <span className="font-medium">To ILS RE: (Name of Member) MRN: (MRN)</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ILS recipients for Accept/Decline: <span className="font-medium">{ILS_DECISION_RECIPIENTS.join(', ')}</span>
                    </div>
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
                    {(singleAuthContactPreview.memberPhone || singleAuthContactPreview.cellPhone || singleAuthContactPreview.memberEmail) ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs space-y-1">
                        <div className="font-medium text-amber-900">
                          Parsed contact preview (autofilled on this page)
                        </div>
                        <div className="text-amber-800">
                          Member Phone: {singleAuthContactPreview.memberPhone || 'Not found'}
                        </div>
                        <div className="text-amber-800">
                          Cell Phone: {singleAuthContactPreview.cellPhone || 'Not found'}
                        </div>
                        {singleAuthContactPreview.memberEmail ? (
                          <div className="text-amber-800">
                            Member Email: {singleAuthContactPreview.memberEmail}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {lastCreatedSkeleton ? (
                      <>
                      <div className="rounded-md border bg-emerald-50/60 p-2 space-y-2">
                        <div className="text-xs font-medium">
                          Skeleton created: <span className="font-semibold">{lastCreatedSkeleton.applicationId}</span> ({lastCreatedSkeleton.memberName})
                        </div>
                        <div className="text-xs">
                          <Link
                            href={`/admin/applications/${lastCreatedSkeleton.applicationId}`}
                            className="font-medium text-primary underline underline-offset-2"
                          >
                            Go to this application
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Client_ID2: <span className="font-mono">{lastCreatedSkeleton.clientId2 || 'Pending (set after Caspio push)'}</span>
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
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void loadIntroEmailPreview()}
                            disabled={isLoadingIntroEmailPreview || isSendingIntroEmail}
                          >
                            {isLoadingIntroEmailPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Preview Introductory Email
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void sendIntroductoryEmail()}
                            disabled={!introEmailDraft || isSendingIntroEmail || isLoadingIntroEmailPreview || !selectedAssignedStaffId}
                          >
                            {isSendingIntroEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Send Introductory Email
                          </Button>
                        </div>
                        {introEmailDraft ? (
                          <div className="rounded-md border bg-white p-3 space-y-2">
                            <div className="text-xs font-medium">Edit Introductory Email Before Sending</div>
                            {introEmailDraft.senderFrom ? (
                              <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
                                Sending as: <span className="font-medium">{introEmailDraft.senderFrom}</span>
                              </div>
                            ) : null}
                            {introEmailDraft.senderWarning ? (
                              <Alert variant={introEmailDraft.senderUsesFallbackFrom ? 'warning' : 'default'}>
                                <AlertTitle>Sender fallback notice</AlertTitle>
                                <AlertDescription>{introEmailDraft.senderWarning}</AlertDescription>
                              </Alert>
                            ) : null}
                            {!selectedAssignedStaffId ? (
                              <Alert variant="destructive">
                                <AlertTitle>Assigned case manager required</AlertTitle>
                                <AlertDescription>
                                  Assign staff before sending the introductory invite.
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            <div className="space-y-1">
                              <Label htmlFor="intro-email-to" className="text-xs">To</Label>
                              <Input
                                id="intro-email-to"
                                value={introEmailDraft.to}
                                onChange={(event) =>
                                  setIntroEmailDraft((prev) => (prev ? { ...prev, to: event.target.value } : prev))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="intro-email-subject" className="text-xs">Subject</Label>
                              <Input
                                id="intro-email-subject"
                                value={introEmailDraft.subject}
                                onChange={(event) =>
                                  setIntroEmailDraft((prev) => (prev ? { ...prev, subject: event.target.value } : prev))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="intro-email-message" className="text-xs">Message</Label>
                              <Textarea
                                id="intro-email-message"
                                value={introEmailDraft.message}
                                rows={10}
                                onChange={(event) =>
                                  setIntroEmailDraft((prev) => (prev ? { ...prev, message: event.target.value } : prev))
                                }
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              This email is logged in <span className="font-medium">Admin &gt; Email Logs</span> after sending.
                            </p>
                          </div>
                        ) : null}
                      </div>
                      <Button type="button" className="w-full" asChild>
                        <Link href={`/admin/applications/${lastCreatedSkeleton.applicationId}`}>
                          Go to Application Main Page
                        </Link>
                      </Button>
                      </>
                    ) : null}
                  </div>
                  <div className="md:col-span-2 text-xs text-muted-foreground">
                    Selected rows: {selectedIlsRows.length} / {ilsImportRows.length}
                  </div>
                  <div className="md:col-span-2 text-xs text-muted-foreground">
                    Created records in selection: {selectedCreatedIlsRows.length}
                  </div>
                  <div className="md:col-span-2 text-xs text-muted-foreground">
                    Picked row for parse:{' '}
                    {(() => {
                      if (!pickedIlsRowId) return 'None';
                      const picked = ilsImportRows.find((row) => row.rowId === pickedIlsRowId);
                      if (!picked) return 'None';
                      const label = `${picked.memberFirstName || ''} ${picked.memberLastName || ''}`.trim();
                      return label || picked.rowId;
                    })()}
                  </div>
                  <div className="md:col-span-2 rounded-md border bg-slate-50 p-2 text-xs space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">Spreadsheet member picker</span>
                        <span className="text-muted-foreground">New (not in Caspio): {nonCaspioRowCount}</span>
                        <span className="text-muted-foreground">Already in Caspio: {caspioExistingRowCount}</span>
                        {isCheckingCaspioExisting ? (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Checking Caspio matches...
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={selectAllVisibleIlsRows} disabled={ilsImportRows.length === 0}>
                          Select Visible
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={clearAllVisibleIlsSelections} disabled={ilsImportRows.length === 0}>
                          Clear Visible
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={selectOnlyNotInCaspio} disabled={ilsImportRows.length === 0}>
                          Select Only Not In Caspio
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={selectOnlyInCaspio} disabled={ilsImportRows.length === 0}>
                          Select Only In Caspio
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-amber-800 border-amber-200"
                          onClick={() => void excludeSelectedFromCreateApp()}
                          disabled={
                            isExcludingFromCreateApp ||
                            !Object.values(ilsImportSelected).some(Boolean)
                          }
                          title="Hide selected members from Create Application only. They stay on the consolidator master list."
                        >
                          {isExcludingFromCreateApp ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Hiding...
                            </>
                          ) : (
                            <>
                              <Trash2 className="mr-1 h-3 w-3" />
                              Hide Selected from Create App
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => void refreshIlsRowsFromCaspio()}
                          disabled={ilsImportRows.length === 0 || isCheckingCaspioExisting}
                        >
                          {isCheckingCaspioExisting ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Refreshing Caspio...
                            </>
                          ) : (
                            'Refresh Caspio + MIF Match'
                          )}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" asChild>
                          <Link href="/admin/tools/spreadsheet-uploads">
                            Spreadsheet Upload Status
                          </Link>
                        </Button>
                        <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Checkbox
                            checked={showOnlyNotInCaspio}
                            onCheckedChange={(checked) => setShowOnlyNotInCaspio(Boolean(checked))}
                          />
                          Show only rows not in Caspio
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={ilsPickerSearch}
                          onChange={(event) => setIlsPickerSearch(event.target.value)}
                          placeholder="Search member or MRN (also supports CIN)"
                          className="h-8 w-full max-w-sm text-xs"
                        />
                        <span className="text-[11px] text-muted-foreground">
                          Showing {ilsPickerRows.length} of {ilsImportRows.length} rows
                        </span>
                        {ilsPickerSearch.trim() ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => setIlsPickerSearch('')}
                          >
                            Clear Search
                          </Button>
                        ) : null}
                      </div>
                      <div className="max-h-[500px] overflow-auto rounded border bg-white">
                        <table className="min-w-[1600px] w-full table-fixed text-[11px] md:text-[12px] leading-5">
                          <thead className="sticky top-0 z-40 bg-slate-50">
                            <tr className="text-left">
                              <th className="sticky left-0 top-0 z-50 bg-slate-50 px-2 py-2 font-semibold whitespace-nowrap border-r w-[52px] min-w-[52px] max-w-[52px]">
                                Pick
                              </th>
                              <th className="sticky left-[52px] top-0 z-50 bg-slate-50 px-1 py-2 font-semibold whitespace-nowrap border-r w-[100px] min-w-[100px] max-w-[100px]">
                                Parse Row
                              </th>
                              <th className="sticky left-[152px] top-0 z-50 bg-slate-50 px-1 py-2 font-semibold whitespace-nowrap border-r w-[88px] min-w-[88px] max-w-[88px]">
                                Hide
                              </th>
                              <th className="sticky left-[240px] top-0 z-50 bg-slate-50 px-2 py-2 font-semibold whitespace-nowrap border-r w-[128px] min-w-[128px] max-w-[128px]">
                                First Name
                              </th>
                              <th className="sticky left-[368px] top-0 z-50 bg-slate-50 px-2 py-2 font-semibold whitespace-nowrap border-r w-[140px] min-w-[140px] max-w-[140px]">
                                Last Name
                              </th>
                              <th className="sticky left-[508px] top-0 z-50 bg-slate-50 px-2 py-2 font-semibold whitespace-nowrap border-r w-[180px] min-w-[180px] max-w-[180px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                                City
                              </th>
                              <th className="hidden md:table-cell px-2 py-2 font-semibold whitespace-nowrap min-w-[120px] w-[120px]">County</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[120px] w-[120px]">MRN</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[150px] w-[150px]">Medical Number (CIN)</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[150px] w-[150px]">Skeleton Status</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[220px] w-[220px]">Caspio Match</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[220px] w-[220px]">MIF Master Match</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[220px] w-[220px]">ILS Decision</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ilsImportRows.length === 0 ? (
                              <tr className="border-t">
                                <td colSpan={13} className="px-2 py-2 text-muted-foreground">
                                  No parsed rows yet. Click <span className="font-medium">2) Upload MIF Spreadsheet</span>. If your file uses uncommon headers, I can add them.
                                </td>
                              </tr>
                            ) : ilsPickerRows.length === 0 ? (
                              <tr className="border-t">
                                <td colSpan={13} className="px-2 py-2 text-muted-foreground">
                                  No rows in this filter.
                                </td>
                              </tr>
                            ) : (
                              ilsPickerRows.map((row) => (
                                <tr key={`picker-${row.rowId}`} className="border-t">
                                  {(() => {
                                    const isCreated = isIlsRowCreated(row);
                                    const isLockedForSkeleton = isIlsRowLockedForSkeletonCreate(row);
                                    return (
                                      <>
                                  <td className="sticky left-0 z-20 bg-white px-2 py-2 align-top border-r w-[52px] min-w-[52px] max-w-[52px]">
                                    <Checkbox
                                      checked={Boolean(ilsImportSelected[row.rowId])}
                                      disabled={isLockedForSkeleton}
                                      onCheckedChange={(checked) => {
                                        if (isLockedForSkeleton) return;
                                        const isChecked = Boolean(checked);
                                        setIlsImportSelected((prev) => ({ ...prev, [row.rowId]: isChecked }));
                                        if (isChecked) {
                                          setPickedIlsRowId(row.rowId);
                                        } else if (pickedIlsRowId === row.rowId) {
                                          setPickedIlsRowId('');
                                        }
                                      }}
                                    />
                                  </td>
                                  <td className="sticky left-[52px] z-20 bg-white px-1 py-2 align-top border-r w-[100px] min-w-[100px] max-w-[100px]">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 w-full px-1 text-[10px]"
                                      disabled={isLockedForSkeleton}
                                      onClick={() => {
                                        setPickedIlsRowId(row.rowId);
                                        populateMemberDataFromIlsRow(row);
                                      }}
                                    >
                                      Parse Row
                                    </Button>
                                  </td>
                                  <td className="sticky left-[152px] z-20 bg-white px-1 py-2 align-top border-r w-[88px] min-w-[88px] max-w-[88px]">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-full px-1 text-[10px] text-amber-800 hover:bg-amber-50"
                                      disabled={isExcludingFromCreateApp}
                                      title="Hide from Create Application only. Stays on consolidator master list."
                                      onClick={() => void excludeRowsFromCreateApp([row])}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </td>
                                  <td className="sticky left-[240px] z-20 bg-white px-2 py-2 align-top whitespace-nowrap border-r w-[128px] min-w-[128px] max-w-[128px] overflow-hidden text-ellipsis" title={row.memberFirstName || undefined}>
                                    {row.memberFirstName || '—'}
                                  </td>
                                  <td className="sticky left-[368px] z-20 bg-white px-2 py-2 align-top whitespace-nowrap border-r w-[140px] min-w-[140px] max-w-[140px] overflow-hidden text-ellipsis" title={row.memberLastName || undefined}>
                                    {row.memberLastName || '—'}
                                  </td>
                                  <td className="sticky left-[508px] z-20 bg-white px-2 py-2 align-top border-r w-[180px] min-w-[180px] max-w-[180px] whitespace-normal break-words shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]" title={row.memberCity || undefined}>
                                    {row.memberCity || '—'}
                                  </td>
                                  <td className="hidden md:table-cell px-2 py-2 align-top whitespace-nowrap">
                                    {row.memberCounty ||
                                      (row.memberCity || row.memberZip ? (
                                        <span className="font-medium text-amber-800">Cannot determine</span>
                                      ) : (
                                        '—'
                                      ))}
                                  </td>
                                  <td className="px-2 py-2 align-top whitespace-nowrap">{row.memberMrn || '—'}</td>
                                  <td className="px-2 py-2 align-top whitespace-nowrap">{row.memberMediCalNum || '—'}</td>
                                  <td className="px-2 py-2 align-top whitespace-nowrap">
                                    {isCreated ? (
                                      <span className="text-emerald-700 font-medium">Created</span>
                                    ) : row.caspioExists ? (
                                      <span className="text-amber-700 font-medium">Locked (in Caspio)</span>
                                    ) : (
                                      <span className="text-muted-foreground">Not created</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2 align-top min-w-[220px]">
                                    {row.caspioExists ? (
                                      <span className="text-amber-700 whitespace-nowrap">
                                        Yes
                                        {row.caspioMatchedBy
                                          ? ` (${
                                              row.caspioMatchedBy === 'mrn'
                                                ? 'MRN'
                                                : row.caspioMatchedBy === 'medi_cal'
                                                  ? 'MEDI-CAL/CIN'
                                                  : 'NAME'
                                            })`
                                          : ''}
                                        {row.caspioMatchedClientId2 ? ` - Client_ID2 ${row.caspioMatchedClientId2}` : ''}
                                      </span>
                                    ) : (
                                      <span className="text-emerald-700">No</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2 align-top min-w-[220px]">
                                    {row.mifMasterExists ? (
                                      <span className="text-indigo-700 whitespace-nowrap">
                                        Yes
                                        {row.mifMasterMatchedBy
                                          ? ` (${
                                              row.mifMasterMatchedBy === 'mrn'
                                                ? 'MRN'
                                                : row.mifMasterMatchedBy === 'medi_cal'
                                                  ? 'MEDI-CAL/CIN'
                                                  : row.mifMasterMatchedBy === 'client_id2'
                                                    ? 'Client_ID2'
                                                    : 'NAME'
                                            })`
                                          : ''}
                                        {row.mifMasterMatchLabel ? ` - ${row.mifMasterMatchLabel}` : ''}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">No</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2 align-top min-w-[220px]">
                                    {(() => {
                                      const decisionLog = ilsDecisionLogByRowId[row.rowId];
                                      return (
                                        <div className="space-y-1">
                                          <div className="flex flex-wrap gap-1">
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="h-7 px-2 text-[11px]"
                                              disabled={sendingIlsDecisionRowId === row.rowId}
                                              onClick={() => openIlsServiceDecisionPreview(row, 'accept')}
                                            >
                                              {sendingIlsDecisionRowId === row.rowId ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                              Accept
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="h-7 px-2 text-[11px]"
                                              disabled={sendingIlsDecisionRowId === row.rowId}
                                              onClick={() => openIlsServiceDecisionPreview(row, 'decline')}
                                            >
                                              {sendingIlsDecisionRowId === row.rowId ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                              Decline
                                            </Button>
                                          </div>
                                          {decisionLog ? (
                                            <div className="text-[11px] text-muted-foreground">
                                              {decisionLog.choice === 'accept' ? 'Accepted' : 'Declined'} ·{' '}
                                              {decisionLog.sentAtIso ? new Date(decisionLog.sentAtIso).toLocaleString() : 'Logged'} · {decisionLog.sentBy || 'Staff'}
                                            </div>
                                          ) : (
                                            <div className="text-[11px] text-muted-foreground">No decision sent yet</div>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </td>
                                      </>
                                    );
                                  })()}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      {pendingIlsDecisionDraft ? (
                        <div className="mt-3 rounded-md border bg-slate-50 p-3 text-xs space-y-2">
                          <div className="font-medium">
                            Verification Email Preview ({pendingIlsDecisionDraft.choice === 'accept' ? 'Accept' : 'Decline'})
                          </div>
                          <div>
                            <span className="font-medium">To:</span> {pendingIlsDecisionDraft.recipients.join(', ')}
                          </div>
                          <div>
                            <span className="font-medium">Subject:</span> {pendingIlsDecisionDraft.subject}
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="ilsDecisionCustomText" className="text-xs font-medium">
                              Optional custom paragraph
                            </Label>
                            <Textarea
                              id="ilsDecisionCustomText"
                              value={pendingIlsDecisionDraft.customText}
                              onChange={(event) =>
                                setPendingIlsDecisionDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        customText: event.target.value.slice(0, ILS_DECISION_CUSTOM_TEXT_MAX),
                                      }
                                    : prev
                                )
                              }
                              placeholder="Add optional notes to include in the email body."
                              className="min-h-[84px] bg-white text-sm"
                              maxLength={ILS_DECISION_CUSTOM_TEXT_MAX}
                              disabled={sendingIlsDecisionRowId === pendingIlsDecisionDraft.rowId}
                            />
                            <div className="text-[11px] text-muted-foreground">
                              {pendingIlsDecisionDraft.customText.length}/{ILS_DECISION_CUSTOM_TEXT_MAX}
                            </div>
                          </div>
                          <div className="rounded border bg-white p-3 text-sm leading-6 text-slate-900">
                            {(() => {
                              const previewParts = buildIlsDecisionEmailParts(pendingIlsDecisionDraft);
                              return (
                                <div className="font-sans text-slate-900">
                                  <p className="m-0 mb-[14px] leading-[1.6]">Dear ILS,</p>
                                  <p className="m-0 mb-[14px] leading-[1.6]">{previewParts.decisionText}</p>
                                  {previewParts.customText ? (
                                    <p className="m-0 mb-[14px] whitespace-pre-wrap leading-[1.6]">{previewParts.customText}</p>
                                  ) : null}
                                  <p className="m-0 mb-[14px] leading-[1.6]">
                                    <span className="font-semibold">Member:</span> {pendingIlsDecisionDraft.memberName}
                                    <br />
                                    <span className="font-semibold">MRN:</span> {pendingIlsDecisionDraft.memberMrn || 'N/A'}
                                    <br />
                                    <span className="font-semibold">County:</span> {pendingIlsDecisionDraft.memberCounty || 'N/A'}
                                  </p>
                                  <p className="m-0 leading-[1.6]">
                                    {previewParts.signatureLines.map((line, index) => (
                                      <React.Fragment key={`ils-signature-line-${index}`}>
                                        {line}
                                        {index < previewParts.signatureLines.length - 1 ? <br /> : null}
                                      </React.Fragment>
                                    ))}
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void sendIlsServiceDecision(pendingIlsDecisionDraft)}
                              disabled={sendingIlsDecisionRowId === pendingIlsDecisionDraft.rowId}
                            >
                              {sendingIlsDecisionRowId === pendingIlsDecisionDraft.rowId ? (
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              ) : null}
                              Confirm & Send to ILS + Jason
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setPendingIlsDecisionDraft(null)}
                              disabled={sendingIlsDecisionRowId === pendingIlsDecisionDraft.rowId}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : null}
                  </div>
                <div>
                  <Label htmlFor="memberFirstName">Member First Name</Label>
                  <Input
                    id="memberFirstName"
                    value={memberData.memberFirstName || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberFirstName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberLastName">Member Last Name</Label>
                  <Input
                    id="memberLastName"
                    value={memberData.memberLastName || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberLastName: e.target.value })}
                  />
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
                  <Label htmlFor="memberMediCalNum">Medical Number (Medi-Cal/CIN)</Label>
                  <Input
                    id="memberMediCalNum"
                    value={memberData.memberMediCalNum || ''}
                    onChange={(e) => {
                      const normalized = normalizeMediCalNumber(e.target.value);
                      setMemberData({
                        ...memberData,
                        memberMediCalNum: normalized,
                        confirmMemberMediCalNum: normalized,
                      });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="memberSex">Sex</Label>
                  <Select
                    value={
                      memberData.memberSex === 'M' || memberData.memberSex === 'F'
                        ? memberData.memberSex
                        : '__none__'
                    }
                    onValueChange={(value) => {
                      setMemberData({
                        ...memberData,
                        memberSex: value === '__none__' ? '' : normalizeMemberSex(value),
                      });
                    }}
                  >
                    <SelectTrigger id="memberSex">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="M">M</SelectItem>
                      <SelectItem value="F">F</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <Label htmlFor="memberEmail">Member Email</Label>
                  <Input
                    id="memberEmail"
                    type="email"
                    value={memberData.memberEmail || ''}
                    onChange={(e) =>
                      setMemberData({
                        ...memberData,
                        memberEmail: String(e.target.value || '').trim().toLowerCase(),
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="careManagerName">Care Manager Name</Label>
                  <Input
                    id="careManagerName"
                    value={memberData.careManagerName || ''}
                    onChange={(e) => setMemberData({ ...memberData, careManagerName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="careManagerPhone">Care Manager Phone</Label>
                  <Input
                    id="careManagerPhone"
                    type="tel"
                    value={memberData.careManagerPhone || ''}
                    onChange={(e) => {
                      const formattedPhone = formatMemberPhoneWithDashes(e.target.value);
                      setMemberData({ ...memberData, careManagerPhone: formattedPhone });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="careManagerEmail">Care Manager Email</Label>
                  <Input
                    id="careManagerEmail"
                    type="email"
                    value={memberData.careManagerEmail || ''}
                    onChange={(e) =>
                      setMemberData({ ...memberData, careManagerEmail: String(e.target.value || '').trim().toLowerCase() })
                    }
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
                    onBlur={(e) => {
                      const street = toNameCase(e.target.value);
                      const zipFromStreet = String(e.target.value || '').match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] || '';
                      const nextZip = String(memberData.memberCustomaryZip || zipFromStreet).trim();
                      const inferredCounty = inferCountyFromCityZip({
                        city: memberData.memberCustomaryCity,
                        zip: nextZip,
                      });
                      const nextCounty = toNameCase(inferredCounty || memberData.memberCustomaryCounty || '');
                      notifyCountyUndetermined({
                        city: memberData.memberCustomaryCity,
                        zip: nextZip,
                        county: nextCounty,
                      });
                      setMemberData((prev) => ({
                        ...prev,
                        memberCustomaryAddress: street,
                        memberCustomaryCounty: nextCounty,
                      }));
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryCity">Member Customary City</Label>
                  <Input
                    id="memberCustomaryCity"
                    value={memberData.memberCustomaryCity || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryCity: e.target.value })}
                    onBlur={(e) => {
                      const city = toNameCase(e.target.value);
                      const inferredCounty = inferCountyFromCityZip({
                        city,
                        zip: memberData.memberCustomaryZip,
                      });
                      const inferredState = inferStateFromCityZip({
                        city,
                        zip: memberData.memberCustomaryZip,
                      });
                      const nextCounty = toNameCase(inferredCounty || memberData.memberCustomaryCounty || '');
                      notifyCountyUndetermined({
                        city,
                        zip: memberData.memberCustomaryZip,
                        county: nextCounty,
                      });
                      setMemberData((prev) => ({
                        ...prev,
                        memberCustomaryCity: city,
                        memberCustomaryState: String(
                          inferredState || prev.memberCustomaryState || ''
                        )
                          .trim()
                          .toUpperCase(),
                        memberCustomaryCounty: nextCounty,
                      }));
                    }}
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
                    onBlur={(e) => {
                      const normalizedZip = normalizeUsZip(e.target.value);
                      const nextCounty = toNameCase(
                        inferCountyFromCityZip({
                          city: memberData.memberCustomaryCity,
                          zip: normalizedZip,
                        }) || memberData.memberCustomaryCounty || ''
                      );
                      notifyCountyUndetermined({
                        city: memberData.memberCustomaryCity,
                        zip: normalizedZip,
                        county: nextCounty,
                      });
                      setMemberData((prev) => ({
                        ...prev,
                        memberCustomaryZip: normalizedZip,
                        memberCustomaryState: String(
                          inferStateFromCityZip({
                            city: prev.memberCustomaryCity,
                            zip: normalizedZip,
                          }) || prev.memberCustomaryState || ''
                        )
                          .trim()
                          .toUpperCase(),
                        memberCustomaryCounty: nextCounty,
                      }));
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryCounty">Member Customary County</Label>
                  <Input
                    id="memberCustomaryCounty"
                    value={memberData.memberCustomaryCounty || ''}
                    placeholder={countyCannotBeDetermined ? 'County cannot be determined' : ''}
                    className={countyCannotBeDetermined ? 'border-amber-500 bg-amber-50' : undefined}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryCounty: e.target.value })}
                    onFocus={() => {
                      setMemberData((prev) => {
                        if (String(prev.memberCustomaryCounty || '').trim()) return prev;
                        const inferredCounty = inferCountyFromCityZip({
                          city: prev.memberCustomaryCity,
                          zip: prev.memberCustomaryZip,
                        });
                        if (!inferredCounty) return prev;
                        return {
                          ...prev,
                          memberCustomaryCounty: toNameCase(inferredCounty),
                        };
                      });
                    }}
                    onBlur={(e) => {
                      const nextCounty = toNameCase(
                        e.target.value ||
                          inferCountyFromCityZip({
                            city: memberData.memberCustomaryCity,
                            zip: memberData.memberCustomaryZip,
                          }) ||
                          ''
                      );
                      notifyCountyUndetermined({
                        city: memberData.memberCustomaryCity,
                        zip: memberData.memberCustomaryZip,
                        county: nextCounty,
                      });
                      setMemberData((prev) => ({
                        ...prev,
                        memberCustomaryCounty: nextCounty,
                      }));
                    }}
                  />
                  {countyCannotBeDetermined ? (
                    <p className="mt-1 text-xs font-medium text-amber-800">{COUNTY_UNDETERMINED_MESSAGE}</p>
                  ) : null}
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
                {String(memberData.parsedSourceType || '').trim() === 'spreadsheet' && (
                  <div className="md:col-span-2 rounded-md border p-3 text-sm">
                    <p>
                      A Service Delivery Form PDF is always created from this parsed MIF row, saved in member files,
                      and attached to the staff assignment email.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Staff can open it from member files or as a PDF attachment on the assignment email.
                    </p>
                  </div>
                )}
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
              </div>
            )}
          </div>

          {/* Contact Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Primary Contact Person</h3>
            <p className="text-sm text-gray-600 mb-3">
              This is who receives missing-document requests and status outreach (family member, caregiver, case worker, etc.).
            </p>
            <Alert className="mb-3">
              <AlertDescription>
                {intakeType === 'kaiser_auth_received_via_ils'
                  ? 'Submitting staff is tracked automatically for this draft. For Kaiser auth upload, primary contact can be entered after eligibility review in CS Summary.'
                  : 'Submitting staff is tracked automatically for this draft. Primary contact is separate and required before draft creation.'}
              </AlertDescription>
            </Alert>
            <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {(() => {
                const submittingStaff = getSubmittingStaffIdentity(user);
                return `Submitting staff: ${submittingStaff.name}${submittingStaff.email ? ` (${submittingStaff.email})` : ''}`;
              })()}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contactFirstName">Contact First Name {intakeType !== 'kaiser_auth_received_via_ils' ? '*' : ''}</Label>
                <Input
                  id="contactFirstName"
                  value={memberData.contactFirstName || ''}
                  onChange={(e) => setMemberData({ ...memberData, contactFirstName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contactLastName">Contact Last Name {intakeType !== 'kaiser_auth_received_via_ils' ? '*' : ''}</Label>
                <Input
                  id="contactLastName"
                  value={memberData.contactLastName || ''}
                  onChange={(e) => setMemberData({ ...memberData, contactLastName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contactPhone">Contact Phone {intakeType !== 'kaiser_auth_received_via_ils' ? '*' : ''}</Label>
                <Input
                  id="contactPhone"
                  type="text"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={12}
                  placeholder="xxx-xxx-xxxx"
                  value={memberData.contactPhone || ''}
                  onChange={handlePhoneChange}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Tip: Use xxx-xxx-xxxx format (you can type with or without dashes).
                </p>
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
                <Label htmlFor="contactEmail">Contact Email {intakeType !== 'kaiser_auth_received_via_ils' ? '*' : ''}</Label>
                <Input
                  id="contactEmail"
                  type="text"
                  inputMode="email"
                  value={memberData.contactEmail || ''}
                  onChange={(e) => setMemberData({ ...memberData, contactEmail: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">If no email exists, enter &quot;N/A&quot; so follow-up staff can update it later.</p>
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
              <p>
                {intakeType === 'kaiser_auth_received_via_ils'
                  ? 'Please complete required draft fields before creating the Kaiser auth draft.'
                  : 'Please fill in all required fields (marked with *) before creating the application draft.'}
              </p>
              {memberData.contactPhone && memberData.contactPhone.replace(/\D/g, '').length > 0 && memberData.contactPhone.replace(/\D/g, '').length < 10 && (
                <p className="text-red-500">Contact phone number must be 10 digits (xxx-xxx-xxxx)</p>
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