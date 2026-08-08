'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Bell, Check, Database, FileText, Loader2, RotateCcw, Upload, Users } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ToastAction } from '@/components/ui/toast';
import { findCountyByCity } from '@/lib/california-cities';
import { extractIdentitySignals } from '@/lib/member-identity';

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

const ILS_DECISION_RECIPIENTS = ['ils-calaim@ilshealth.com', 'jason@carehomefinders.com'] as const;
const ILS_DECISION_SIGNATURE = ['Jason Bloome', 'Connections Care Home Consultants', '800-330-5993'].join('\n');
type IlsDecisionChoice = 'accept' | 'decline';
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
  message: string;
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
      }
    }

    if (/\bdob\s*:.*\bage\s*:.*preferred\s*language/i.test(line)) {
      const valueLine = findNextNonEmptyLine(lines, i + 1);
      const dobMatch = valueLine.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
      if (dobMatch?.[1]) {
        result.memberDob = toMmDdYyyy(dobMatch[1]);
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
      const phonePattern = /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b\d{10}\b/g;
      const matches = joined.match(phonePattern) || [];
      const normalizedPhones = matches
        .map((value) => normalizePhoneDigits(value))
        .filter((value) => value.length === 10);
      if (normalizedPhones[0]) result.memberPhone = formatPhoneDashed(normalizedPhones[0]);
      if (normalizedPhones[1]) result.contactPhone = formatPhoneDashed(normalizedPhones[1]);
      else if (normalizedPhones[0]) result.contactPhone = formatPhoneDashed(normalizedPhones[0]);
      const emailMatch = joined.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      if (emailMatch?.[0]) result.memberEmail = String(emailMatch[0]).trim().toLowerCase();

      const addressOnlyLines = blockLines.filter((entry) => !phonePattern.test(entry) && !/@/.test(entry));
      if (addressOnlyLines.length > 0) {
        const cleanedAddressLines = addressOnlyLines
          .map((entry) => String(entry || '').replace(/[,\s]+$/g, '').trim())
          .filter(Boolean);

        const cityStateRegex = /^([A-Za-z .'-]+?)(?:,\s*|\s+)([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/;
        const looksLikeStreet = (value: string) =>
          /\d/.test(value) ||
          /\b(?:st|street|ave|avenue|dr|drive|rd|road|ln|lane|blvd|boulevard|ct|court|way|pl|place|hwy|highway)\b/i.test(value);

        const streetLine = cleanedAddressLines.find((value) => looksLikeStreet(value)) || cleanedAddressLines[0] || '';
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

        const countyMatch = addressOnlyLines.join(' ').match(/([A-Za-z .'-]+)\s+County\b/i);

        const cleanedStreet = stripContactInfoFromAddressLine(streetLine);
        if (cleanedStreet && looksLikeStreet(cleanedStreet)) result.memberCustomaryAddress = cleanedStreet;
        if (cityStateMatch?.[1]) result.memberCustomaryCity = cityStateMatch[1].trim();
        if (cityStateMatch?.[2]) result.memberCustomaryState = cityStateMatch[2].trim().toUpperCase();
        if (zipMatch?.[1]) result.memberCustomaryZip = zipMatch[1].trim();

        const explicitCounty = String(countyMatch?.[1] || '').trim();
        if (explicitCounty) {
          result.memberCustomaryCounty = explicitCounty;
        } else if (zipMatch?.[1]) {
          const inferredCounty = inferCountyFromCityZip({
            city: cityStateMatch?.[1] || '',
            zip: zipMatch[1].trim(),
          });
          if (inferredCounty) result.memberCustomaryCounty = inferredCounty;
        } else if (cityStateMatch?.[1]) {
          const inferredCounty = inferCountyFromCity(cityStateMatch[1]);
          if (inferredCounty) result.memberCustomaryCounty = inferredCounty;
        }
      }
    }
  }

  return result;
};

const extractAddressFromLines = (lines: string[]) => {
  const stopLinePattern =
    /\b(?:member|patient)?\s*(?:phone|cell(?:ular)?|mobile|email|population|provider|authorization|care\s*manager|contact\s*person|special\s*instructions|dob|date\s*of\s*birth)\b/i;
  const phonePattern = /(?:\(\d{3}\)\s*|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b)/;
  const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    if (!/\b(?:member|patient)\s*address\b/i.test(line)) continue;

    const inlineValue = truncateAtNextLabel(
      line.replace(/^.*?\b(?:member|patient)\s*address\s*[:#-]?\s*/i, '').trim()
    );
    if (
      inlineValue &&
      !stopLinePattern.test(inlineValue) &&
      !phonePattern.test(inlineValue) &&
      !emailPattern.test(inlineValue)
    ) {
      return inlineValue;
    }

    const addressParts: string[] = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      const next = String(lines[j] || '').replace(/\s+/g, ' ').trim();
      if (!next) continue;
      if (stopLinePattern.test(next) || emailPattern.test(next) || phonePattern.test(next)) break;
      addressParts.push(next);
    }

    if (addressParts.length > 0) {
      return addressParts.join(', ');
    }
  }

  return '';
};

const splitAddressFromLines = (lines: string[]) => {
  const stopLinePattern =
    /\b(?:member|patient)?\s*(?:phone|cell(?:ular)?|mobile|email|population|provider|authorization|care\s*manager|contact\s*person|special\s*instructions|dob|date\s*of\s*birth)\b/i;
  const phonePattern = /(?:\(\d{3}\)\s*|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b)/;
  const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    if (!/\b(?:member|patient)\s*address\b/i.test(line)) continue;

    const rawParts: string[] = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      const next = String(lines[j] || '').replace(/\s+/g, ' ').trim();
      if (!next) continue;
      if (stopLinePattern.test(next) || emailPattern.test(next) || phonePattern.test(next)) break;
      rawParts.push(next);
    }

    if (rawParts.length === 0) continue;
    const cleanedParts = rawParts.map((part) => part.replace(/[,\s]+$/g, '').trim()).filter(Boolean);
    if (cleanedParts.length === 0) continue;

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
      } else {
        city = cleanedParts[1].replace(/[,\s]+$/g, '').trim();
      }
    }

    if (!zip && cleanedParts.length >= 3) {
      const zipCandidate = cleanedParts[2].match(/(\d{5}(?:-\d{4})?)/);
      if (zipCandidate?.[1]) zip = zipCandidate[1];
    }

    return {
      street,
      city,
      state,
      zip,
      county: county || inferCountyFromCityZip({ city, zip }),
    };
  }

  return { street: '', city: '', state: '', zip: '', county: '' };
};

const inferCountyFromZip = (zipRaw: unknown) => {
  const zip = String(zipRaw || '').match(/\d{5}/)?.[0] || '';
  if (!zip) return '';
  const countyByZip: Record<string, string> = {
    '90210': 'Los Angeles',
    '90262': 'Los Angeles',
  };
  return countyByZip[zip] || '';
};

const inferStateFromZip = (zipRaw: unknown) => {
  const zip = String(zipRaw || '').match(/\d{5}/)?.[0] || '';
  if (!zip) return '';
  const zipNumber = Number(zip);
  if (Number.isNaN(zipNumber)) return '';
  // Current intake data is California-based; CA ZIP range covers 90000-96699.
  if (zipNumber >= 90000 && zipNumber <= 96699) return 'CA';
  return '';
};

const inferCountyFromCity = (cityRaw: unknown) => {
  const city = String(cityRaw || '')
    .trim()
    .toLowerCase()
    .replace(/^city\s+of\s+/i, '');
  if (!city) return '';
  return findCountyByCity(city) || '';
};

const inferCountyFromCityZip = (params: { city?: unknown; zip?: unknown }) => {
  const byZip = inferCountyFromZip(params.zip);
  if (byZip) return byZip;
  return inferCountyFromCity(params.city);
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

  const cleaned = raw.replace(/\s{2,}/g, ' ').trim();
  const countyMatch = cleaned.match(/([A-Za-z .'-]+)\s+County\b/i);
  const inferredCounty = countyMatch?.[1] ? countyMatch[1].trim() : '';

  const cityStateZipMatch = cleaned.match(/(.+?),\s*([A-Za-z .'-]+?)\s+([A-Za-z]{2})[, ]+\s*(\d{5}(?:-\d{4})?)$/);
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
      return {
        street: '',
        city,
        state: /^[A-Za-z]{2}$/.test(state) ? state : '',
        zip,
        county: inferredCounty || inferCountyFromCityZip({ city, zip }),
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

  const zipOnly = /^\d{5}(?:-\d{4})?$/.test(street);
  if (street !== String(next.memberCustomaryAddress || '').trim()) {
    next.memberCustomaryAddress = street;
  }

  if (zipOnly) {
    if (!zip) next.memberCustomaryZip = street;
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
  // e.g. "APT 75, PETALUMA, CA" with ZIP on the next OCR line.
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
    }
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
      .trim();
    if (cleanedStreetOnly) next.memberCustomaryAddress = cleanedStreetOnly;
  }

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
  updates = normalizeAddressFieldPlacement(updates);
  if (!updates.memberCustomaryAddress && (updates.memberCustomaryCity || updates.memberCustomaryState)) {
    const inferredStreet = inferStreetFromCityStateContext({
      lines,
      city: updates.memberCustomaryCity,
      state: updates.memberCustomaryState,
      zip: updates.memberCustomaryZip,
    });
    if (inferredStreet) updates.memberCustomaryAddress = inferredStreet;
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
  updates = normalizeAddressFieldPlacement(updates as Record<string, string>);
  if (!updates.memberCustomaryAddress && (updates.memberCustomaryCity || updates.memberCustomaryState)) {
    const inferredStreet = inferStreetFromCityStateContext({
      lines,
      city: updates.memberCustomaryCity,
      state: updates.memberCustomaryState,
      zip: updates.memberCustomaryZip,
    });
    if (inferredStreet) updates.memberCustomaryAddress = inferredStreet;
  }

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
  memberMediCalNum: '',
  confirmMemberMediCalNum: '',
  memberSex: '',
  parsedSourceType: '',
  createServiceDeliveryFormPdf: false,
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

const extractSingleAuthContactPreview = (patch: Record<string, string>) => ({
  memberPhone: String(patch.memberPhone || '').trim(),
  cellPhone: String(patch.contactPhone || '').trim(),
  email: String(patch.memberEmail || patch.contactEmail || '').trim().toLowerCase(),
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
    email: string;
  }>({ memberPhone: '', cellPhone: '', email: '' });
  const [ilsSpreadsheetFileName, setIlsSpreadsheetFileName] = useState('');
  const [ilsSpreadsheetHeaders, setIlsSpreadsheetHeaders] = useState<string[]>([]);
  const [ilsImportRows, setIlsImportRows] = useState<KaiserIlsImportRow[]>([]);
  const [ilsImportSelected, setIlsImportSelected] = useState<Record<string, boolean>>({});
  const [pickedIlsRowId, setPickedIlsRowId] = useState('');
  const [activeSpreadsheetUploadLogId, setActiveSpreadsheetUploadLogId] = useState('');
  const [showOnlyNotInCaspio, setShowOnlyNotInCaspio] = useState(false);
  const [ilsPickerSearch, setIlsPickerSearch] = useState('');
  const [isParsingIlsSpreadsheet, setIsParsingIlsSpreadsheet] = useState(false);
  const [isCheckingCaspioExisting, setIsCheckingCaspioExisting] = useState(false);
  const [checkingRowDuplicates, setCheckingRowDuplicates] = useState<Record<string, boolean>>({});
  const [ilsRowDuplicateMatches, setIlsRowDuplicateMatches] = useState<Record<string, IlsDuplicateMatch[]>>({});
  const [isCreatingIlsRecords, setIsCreatingIlsRecords] = useState(false);
  const [isDeletingCreatedIlsRecords, setIsDeletingCreatedIlsRecords] = useState(false);
  const [isPushingIlsRows, setIsPushingIlsRows] = useState(false);
  const [sendingIlsDecisionRowId, setSendingIlsDecisionRowId] = useState('');
  const [ilsDecisionLogByRowId, setIlsDecisionLogByRowId] = useState<Record<string, IlsDecisionLogState>>({});
  const [pendingIlsDecisionDraft, setPendingIlsDecisionDraft] = useState<IlsDecisionPreviewDraft | null>(null);
  const [isPreparingCreateSnapshot, setIsPreparingCreateSnapshot] = useState(false);
  const [isRollingBackCreateSnapshot, setIsRollingBackCreateSnapshot] = useState(false);
  const [createPreviewSnapshot, setCreatePreviewSnapshot] = useState<{ snapshotId: string; batchId: string; signature: string } | null>(null);
  const [lastCreateSnapshotId, setLastCreateSnapshotId] = useState('');
  const [isLoadingIntroEmailPreview, setIsLoadingIntroEmailPreview] = useState(false);
  const [isSendingIntroEmail, setIsSendingIntroEmail] = useState(false);
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
  const PRE_PUSH_KAISER_STATUS_OPTIONS = useMemo(
    () =>
      [
        'T2038 Received, Need First Contact',
        'T2038 Received, doc collection',
        'T2038, Not Requested, Doc Collection',
      ] as const,
    []
  );

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
    if (intakeType !== 'kaiser_auth_received_via_ils') return;
    if (String(memberData.kaiserStatus || '').trim()) return;
    setMemberData((prev) => ({
      ...prev,
      kaiserStatus: 'T2038 Received, doc collection',
    }));
  }, [intakeType, memberData.kaiserStatus]);

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
    assignedBy: string;
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
        kaiserStatus: 'T2038 Received, doc collection',
        calaimStatus: 'Authorized',
        assignedBy: params.assignedBy,
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
    if (!storage) return null;
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const memberName = `${params.row.memberFirstName || ''} ${params.row.memberLastName || ''}`.trim() || 'Member';
    const memberMrnLabel = String(params.row.memberMrn || '').trim() || 'MRN Unknown';
    const displayFileName = `Service Delivery Form for ${memberName} (${memberMrnLabel}).pdf`;
    const safeFileName = displayFileName.replace(/[<>:"/\\|?*]/g, '_');
    const statusLabel = String(params.row.kaiserStatus || '').trim() || 'T2038 Received, doc collection';
    const lines = [
      `Service Delivery Form for ${memberName} (${memberMrnLabel})`,
      'Generated by app from MIF Spreadsheet',
      '',
      'Authorization Status: Authorized',
      `Kaiser Status: ${statusLabel}`,
      '',
      'Reason: ILS spreadsheet intake did not include actual Service Delivery Form.',
      `Generated: ${new Date().toISOString()}`,
      '',
      '--- Parsed Member Data (MIF Spreadsheet) ---',
      `Member First Name: ${params.row.memberFirstName || ''}`,
      `Member Last Name: ${params.row.memberLastName || ''}`,
      `Member MRN: ${params.row.memberMrn || ''}`,
      `Medical Number (CIN): ${params.row.memberMediCalNum || ''}`,
      `Sex: ${params.row.memberSex || ''}`,
      `Date of Birth: ${params.row.memberDob || ''}`,
      `Member Phone: ${params.row.memberPhone || ''}`,
      `Member Email: ${params.row.memberEmail || ''}`,
      `Address: ${params.row.memberAddress || ''}`,
      `City: ${params.row.memberCity || ''}`,
      `State: ${params.row.memberState || ''}`,
      `ZIP: ${params.row.memberZip || ''}`,
      `County: ${params.row.memberCounty || ''}`,
      '',
      '--- Authorization Data ---',
      `Authorization Number T2038: ${params.row.authorizationNumberT2038 || ''}`,
      `Authorization Start T2038: ${params.row.authorizationStartT2038 || ''}`,
      `Authorization End T2038: ${params.row.authorizationEndT2038 || ''}`,
      `Date Received Request for Authorization: ${params.row.dateReceivedRequestForAuthorization || ''}`,
      `Date of Referral Authorization Decision: ${params.row.dateOfReferralAuthorizationDecision || ''}`,
      `Diagnostic Code: ${params.row.diagnosticCode || ''}`,
      `CPT Code: ${params.row.cptCode || ''}`,
      '',
      '--- Referral / Contact Data ---',
      `Referring Organization: ${params.row.referringOrganization || ''}`,
      `Care Manager Name: ${params.row.careManagerName || ''}`,
      `Care Manager Phone: ${params.row.careManagerPhone || ''}`,
      `Care Manager Email: ${params.row.careManagerEmail || ''}`,
      `Emergency Contact Name: ${params.row.emergencyContactName || ''}`,
      `Emergency Contact Relationship: ${params.row.emergencyContactRelationship || ''}`,
      `Emergency Contact Phone: ${params.row.emergencyContactPhone || ''}`,
      `Contact Phone: ${params.row.contactPhone || ''}`,
      `Contact Email: ${params.row.contactEmail || ''}`,
      '',
      '--- Workflow Metadata ---',
      `Source File: ${params.row.sourceFileName || ''}`,
      `Source Type: ${params.row.sourceType || ''}`,
      `Eligibility Check Status: ${params.row.eligibilityCheckStatus || ''}`,
      `Caspio Exists At Import: ${params.row.caspioExists ? 'Yes' : 'No'}`,
      '',
      'Assigned staff: This generated PDF serves as proof that member data was authorized via spreadsheet intake.',
    ];
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 10;
    const lineHeight = 14;
    const marginX = 36;
    let y = 760;
    const maxChars = 95;
    for (const rawLine of lines) {
      const line = String(rawLine || '');
      const chunks =
        !line
          ? ['']
          : line.length <= maxChars
            ? [line]
            : Array.from({ length: Math.ceil(line.length / maxChars) }, (_, i) =>
                line.slice(i * maxChars, (i + 1) * maxChars)
              );
      for (const chunk of chunks) {
        if (y < 40) {
          page = pdfDoc.addPage([612, 792]);
          y = 760;
        }
        page.drawText(chunk, {
          x: marginX,
          y,
          size: fontSize,
          font,
        });
        y -= lineHeight;
      }
    }
    const pdfBytes = await pdfDoc.save();
    const file = new File([new Uint8Array(pdfBytes)], safeFileName, { type: 'application/pdf' });
    const storagePath = `applications/${params.applicationId}/service-delivery-form/${Date.now()}-${safeFileName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);
    await new Promise<void>((resolve, reject) => {
      uploadTask.on('state_changed', undefined, reject, () => resolve());
    });
    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
    return {
      name: 'Service Delivery Form',
      status: 'Completed',
      type: 'Upload',
      href: '#',
      fileName: displayFileName,
      filePath: storagePath,
      downloadURL,
      dateCompleted: new Date().toISOString(),
      source: 'spreadsheet_service_delivery_placeholder',
      uploadedFiles: [{ fileName: displayFileName, filePath: storagePath, downloadURL }],
      notes:
        'Auto-generated placeholder because spreadsheet intake did not include the actual Service Delivery Form.',
    } as any;
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
        const mrnKey = signals.mrnToken;
        const mediCalKey = signals.mediCalToken;
        const nameKey = buildMemberLookupNameKey(firstName, lastName);
        const clientId2Key = signals.clientId2Token;
        if (mrnKey && !byMrn.has(mrnKey)) {
          byMrn.set(mrnKey, { label, clientId2 });
        }
        if (mediCalKey && !byMediCal.has(mediCalKey)) {
          byMediCal.set(mediCalKey, { label, clientId2 });
        }
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
        const mrnMatch = !clientId2Match && rowSignals.mrnToken ? byMrn.get(rowSignals.mrnToken) : undefined;
        const mediCalMatch =
          !clientId2Match && !mrnMatch && rowSignals.mediCalToken ? byMediCal.get(rowSignals.mediCalToken) : undefined;
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
      const headerRows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date | null>>(ws, {
        header: 1,
        defval: '',
      });
      const detectedHeaders = (Array.isArray(headerRows[0]) ? headerRows[0] : [])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      setIlsSpreadsheetHeaders(detectedHeaders);
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
          const memberCity =
            toNameCase(mailingCity) ||
            toNameCase(residentialCity) ||
            toNameCase(parsedAddress.city) ||
            '';
          const memberZip =
            normalizeUsZip(residentialZip) ||
            normalizeUsZip(mailingZip) ||
            normalizeUsZip(parsedAddress.zip) ||
            '';
          const memberState = inferStateFromCityZip({ city: memberCity, zip: memberZip });
          const memberCountyRaw = getSpreadsheetValue(raw, [
            'Medi-Cal Coverage County',
          ]);
          const memberCounty = toNameCase(
            memberCountyRaw || inferCountyFromCityZip({ city: memberCity, zip: memberZip }) || ''
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
          const emergencyContactPhone = getSpreadsheetValue(raw, [
            'Emergency/Contact Alternate Contact Phone Number',
          ]);
          const contactPhone = emergencyContactPhone || referringIndividualPhone;
          const contactEmail = referringIndividualEmail;
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
          const kaiserStatus = 'T2038 Received, doc collection';
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
          } as KaiserIlsImportRow;
        })
        .filter((row) => Boolean(row.memberFirstName && row.memberLastName));

      if (!parsed.length) {
        throw new Error('No usable rows found. Make sure spreadsheet has member first/last name columns.');
      }
      const annotated = await annotateRowsWithCaspioExists(parsed);
      const nextSelected: Record<string, boolean> = {};
      annotated.forEach((row) => {
        nextSelected[row.rowId] = false;
      });
      const uploadLogId = `ils_upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setIlsImportRows(annotated);
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
      const existingCount = annotated.filter((row) => row.caspioExists).length;
      const importDefaultCount = annotated.filter((row) => !row.caspioExists).length;
      toast({
        title: 'Spreadsheet parsed',
        description: `Loaded ${annotated.length} row(s): ${importDefaultCount} new, ${existingCount} already in Caspio.`,
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
    setIlsSpreadsheetHeaders([]);
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

  const buildIlsRowAdminNotes = (row: KaiserIlsImportRow) => {
    const lines = [
      'ILS Spreadsheet Details',
      `Source File: ${row.sourceFileName || 'Unknown'}`,
      row.referringOrganization ? `Referring Organization: ${row.referringOrganization}` : '',
      row.careManagerName ? `Referring Individual: ${row.careManagerName}` : '',
      row.careManagerPhone ? `Referring Individual Phone: ${row.careManagerPhone}` : '',
      row.careManagerEmail ? `Referring Individual Email: ${row.careManagerEmail}` : '',
      row.emergencyContactName ? `Emergency/Alternate Contact: ${row.emergencyContactName}` : '',
      row.emergencyContactRelationship ? `Emergency Contact Relationship: ${row.emergencyContactRelationship}` : '',
      row.emergencyContactPhone ? `Emergency Contact Phone: ${row.emergencyContactPhone}` : '',
      row.dateReceivedRequestForAuthorization
        ? `Date Received Request for Authorization: ${row.dateReceivedRequestForAuthorization}`
        : '',
      row.dateOfReferralAuthorizationDecision
        ? `Date of Referral Authorization Decision: ${row.dateOfReferralAuthorizationDecision}`
        : '',
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
      kaiserStatus: row.kaiserStatus || 'T2038 Received, doc collection',
      notes,
    }));
    if (!options?.silent) {
      toast({
        title: 'Member loaded into form',
        description:
          `${row.memberFirstName || ''} ${row.memberLastName || ''}`.trim() +
          (normalizedZip ? ` • ZIP ${normalizedZip}` : ''),
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
          const formsForRow = authReceivedForms.map((form) => ({ ...form }));
          let serviceDeliveryFormUrl = '';
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
            kaiserAuthReceivedDate: serverTimestamp(),
            createdAt: serverTimestamp(),
            createdByAdmin: true,
            status: 'draft',
            currentStep: 1,
            isComplete: false,
            healthPlan: 'Kaiser',
            pathway: '',
            kaiserStatus: String(row.kaiserStatus || '').trim() || 'T2038 Received, doc collection',
            caspioCalAIMStatus: 'Authorized',
            allowDraftCaspioPush: true,
            adminNotes: buildIlsRowAdminNotes(row),
            forms: formsForRow,
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
                  `Kaiser Status: ${String(row.kaiserStatus || '').trim() || 'T2038 Received, doc collection'}\n` +
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
                assignedBy: assignedByName,
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
      setIlsImportSelected((prev) => {
        const next = { ...prev };
        selectedIlsRows.forEach((row) => {
          next[row.rowId] = false;
        });
        return next;
      });
      setIlsRowEligibilityFiles((prev) => {
        const next = { ...prev };
        selectedIlsRows.forEach((row) => {
          delete next[row.rowId];
        });
        return next;
      });
      setIlsRowDuplicateMatches((prev) => {
        const next = { ...prev };
        selectedIlsRows.forEach((row) => {
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
      router.push(`/admin/applications/${target.applicationId}`);
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
          setSingleAuthContactPreview({ memberPhone: '', cellPhone: '', email: '' });
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
        const contactPreview = extractSingleAuthContactPreview(sanitizedPatch);
        setSingleAuthContactPreview(contactPreview);
        setMemberData((prev) => ({ ...prev, ...sanitizedPatch }));
        setServiceRequestParsedFields(parsedFieldKeys);
        setServiceRequestWarnings(visionWarnings);
        setServiceRequestParseMode('vision');
        toast({
          title: 'Service request parsed (Vision)',
          description: `Autofilled ${parsedFieldKeys.length} field(s) using AI vision.`,
        });
        return;
      }

      const parsed = extractServiceRequestFields({ text, fileName: targetFile.name });
      const updates = parsed.updates;
      const parsedFieldKeys = parsed.parsedFields;
      warnings.push(...parsed.warnings);

      if (parsedFieldKeys.length === 0) {
        setSingleAuthContactPreview({ memberPhone: '', cellPhone: '', email: '' });
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
      const contactPreview = extractSingleAuthContactPreview(sanitizedPatch);
      setSingleAuthContactPreview(contactPreview);
      setMemberData((prev) => ({ ...prev, ...sanitizedPatch }));
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
      const lowerMessage = safeMessage.toLowerCase();
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
        title: isVisionQuotaError ? 'Vision parsing unavailable' : 'Parse failed',
        description: isVisionQuotaError
          ? 'Gemini vision credits/quota are currently unavailable. Enter fields manually and continue, or retry later.'
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
            careManagerName: String(normalizedPatch.careManagerName || '').trim(),
            careManagerPhone: String(normalizedPatch.careManagerPhone || '').trim(),
            careManagerEmail: String(normalizedPatch.careManagerEmail || '').trim().toLowerCase(),
            eligibilityCheckStatus: normalizeEligibilityStatus((memberData as any)?.eligibilityCheckStatus),
            authorizationNumberT2038: String(normalizedPatch.Authorization_Number_T038 || '').trim(),
            authorizationStartT2038: toMmDdYyyy(normalizedPatch.Authorization_Start_T2038 || ''),
            authorizationEndT2038: toMmDdYyyy(normalizedPatch.Authorization_End_T2038 || ''),
            kaiserStatus: 'T2038 Received, doc collection',
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

      const annotatedRows = await annotateRowsWithCaspioExists(rowsToAppend);
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
      toast({
        title: 'Single-auth PDFs parsed',
        description: `Added ${annotatedRows.length} row(s) (${existingCount} already in Caspio).`,
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
    const decisionText =
      choice === 'accept'
        ? 'Please note we have STARTED service delivery for this member.'
        : 'Please note we have DECLINED service delivery for this member.';
    const subject = `To ILS RE: ${memberName}: MRN: ${memberMrn || 'N/A'}`;
    const message = [
      'Dear ILS,',
      '',
      decisionText,
      '',
      `Member: ${memberName}`,
      `MRN: ${memberMrn || 'N/A'}`,
      `County: ${memberCounty || 'N/A'}`,
      '',
      ILS_DECISION_SIGNATURE,
    ]
      .filter(Boolean)
      .join('\n');
    return {
      rowId: row.rowId,
      choice,
      memberName,
      memberMrn,
      memberCounty,
      memberClientId,
      recipients: [...ILS_DECISION_RECIPIENTS],
      subject,
      message,
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
    setSingleAuthContactPreview({ memberPhone: '', cellPhone: '', email: '' });
    setIlsSpreadsheetFileName('');
    setIlsSpreadsheetHeaders([]);
    setIlsImportRows([]);
    setIlsImportSelected({});
    setPickedIlsRowId('');
    setActiveSpreadsheetUploadLogId('');
    setShowOnlyNotInCaspio(false);
    setLastCreatedSkeleton(null);
    setCreatePreviewSnapshot(null);
    setLastCreateSnapshotId('');
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
  const hasPrimaryContactComplete =
    Boolean(memberData.contactFirstName && memberData.contactLastName && memberData.contactPhone && memberData.contactEmail) &&
    String(memberData.contactPhone || '').replace(/\D/g, '').length === 10;
  const createSnapshotSignature = useMemo(
    () =>
      JSON.stringify({
        intakeType: String(intakeType || '').trim(),
        parsedSourceType: String(memberData.parsedSourceType || '').trim(),
        memberFirstName: String(memberData.memberFirstName || '').trim(),
        memberLastName: String(memberData.memberLastName || '').trim(),
        memberMrn: String(memberData.memberMrn || '').trim(),
        memberMediCalNum: String(memberData.memberMediCalNum || '').trim(),
        memberDob: String(memberData.memberDob || '').trim(),
        memberPhone: String(memberData.memberPhone || '').trim(),
        memberEmail: String(memberData.memberEmail || '').trim(),
        contactFirstName: String(memberData.contactFirstName || '').trim(),
        contactLastName: String(memberData.contactLastName || '').trim(),
        contactPhone: String(memberData.contactPhone || '').trim(),
        contactEmail: String(memberData.contactEmail || '').trim(),
        kaiserStatus: String(memberData.kaiserStatus || '').trim(),
        selectedAssignedStaffId: String(selectedAssignedStaffId || '').trim(),
        selectedAssignedStaffName: String(selectedAssignedStaffName || '').trim(),
      }),
    [intakeType, memberData, selectedAssignedStaffId, selectedAssignedStaffName]
  );

  const prepareCreateSnapshot = async () => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Sign in before preparing a create snapshot.', variant: 'destructive' });
      return;
    }
    const isKaiserAuthReceived = intakeType === 'kaiser_auth_received_via_ils';
    const hasRequiredCreateInputs = isKaiserAuthReceived ? true : (hasRequiredMemberName && hasPrimaryContactComplete);
    if (!hasRequiredCreateInputs) {
      toast({
        title: 'Missing Information',
        description: isKaiserAuthReceived
          ? 'Please complete required draft fields before preparing the snapshot.'
          : 'Please fill required fields before preparing the snapshot.',
        variant: 'destructive',
      });
      return;
    }
    setIsPreparingCreateSnapshot(true);
    try {
      const token = await user.getIdToken();
      const batchId = `ils-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const response = await fetch('/api/admin/operation-snapshots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scope: 'ils_skeleton_create',
          label: 'ILS skeleton create preview',
          batchId,
          status: 'prepared',
          payload: {
            signature: createSnapshotSignature,
            intakeType: String(intakeType || '').trim(),
            parsedSourceType: String(memberData.parsedSourceType || '').trim(),
            memberSummary: {
              firstName: String(memberData.memberFirstName || '').trim(),
              lastName: String(memberData.memberLastName || '').trim(),
              mrn: String(memberData.memberMrn || '').trim(),
              mediCal: String(memberData.memberMediCalNum || '').trim(),
              dob: String(memberData.memberDob || '').trim(),
            },
            contactSummary: {
              firstName: String(memberData.contactFirstName || '').trim(),
              lastName: String(memberData.contactLastName || '').trim(),
              phone: String(memberData.contactPhone || '').trim(),
              email: String(memberData.contactEmail || '').trim(),
            },
            selectedAssignedStaffId: String(selectedAssignedStaffId || '').trim(),
            selectedAssignedStaffName: String(selectedAssignedStaffName || '').trim(),
            kaiserStatus: String(memberData.kaiserStatus || '').trim(),
          },
        }),
      });
      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok || !payload?.success) {
        throw new Error(String(payload?.error || `Failed to create snapshot (HTTP ${response.status})`));
      }
      const snapshotId = String(payload.snapshotId || '').trim();
      const resolvedBatchId = String(payload.batchId || batchId).trim();
      setCreatePreviewSnapshot({ snapshotId, batchId: resolvedBatchId, signature: createSnapshotSignature });
      setLastCreateSnapshotId(snapshotId);
      toast({
        title: 'Create preview ready',
        description: `Snapshot ${snapshotId} created. You can now create the skeleton application.`,
      });
    } catch (error: any) {
      toast({
        title: 'Snapshot failed',
        description: String(error?.message || 'Could not prepare create snapshot.'),
        variant: 'destructive',
      });
    } finally {
      setIsPreparingCreateSnapshot(false);
    }
  };

  const rollbackLastCreateSnapshot = async () => {
    const snapshotId = String(lastCreateSnapshotId || '').trim();
    if (!snapshotId || !firestore || !user || isRollingBackCreateSnapshot) return;
    const confirmed = window.confirm(
      `Rollback last create snapshot ${snapshotId}?\n\nThis will delete the created application from that snapshot if it exists.`
    );
    if (!confirmed) return;
    setIsRollingBackCreateSnapshot(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/operation-snapshots?snapshotId=${encodeURIComponent(snapshotId)}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok || !payload?.success || !payload?.snapshot) {
        throw new Error(String(payload?.error || 'Could not load snapshot for rollback.'));
      }
      const snapshotPayload = (payload.snapshot.payload || {}) as Record<string, any>;
      const createdApplicationId = String(snapshotPayload.createdApplicationId || '').trim();
      if (!createdApplicationId) {
        throw new Error('Snapshot has no created application to rollback.');
      }

      await deleteDoc(doc(firestore, 'applications', createdApplicationId));
      const notifSnap = await getDocs(
        query(collection(firestore, 'staff_notifications'), where('applicationId', '==', createdApplicationId))
      );
      if (!notifSnap.empty) {
        const batch = writeBatch(firestore);
        notifSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      await fetch('/api/admin/operation-snapshots', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          snapshotId,
          status: 'rolled_back',
          payloadMerge: {
            rollbackAtIso: new Date().toISOString(),
            rollbackApplicationId: createdApplicationId,
          },
        }),
      }).catch(() => undefined);

      if (lastCreatedSkeleton?.applicationId === createdApplicationId) {
        setLastCreatedSkeleton(null);
      }
      toast({
        title: 'Rollback complete',
        description: `Deleted application ${createdApplicationId} from the last create snapshot.`,
      });
    } catch (error: any) {
      toast({
        title: 'Rollback failed',
        description: String(error?.message || 'Could not rollback last create snapshot.'),
        variant: 'destructive',
      });
    } finally {
      setIsRollingBackCreateSnapshot(false);
    }
  };

  useEffect(() => {
    if (!createPreviewSnapshot) return;
    if (createPreviewSnapshot.signature !== createSnapshotSignature) {
      setCreatePreviewSnapshot(null);
    }
  }, [createPreviewSnapshot, createSnapshotSignature]);

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
    if (isKaiserAuthReceived) {
      const snapshot = createPreviewSnapshot;
      if (!snapshot || snapshot.signature !== createSnapshotSignature) {
        toast({
          title: 'Preview required',
          description: 'Click "Preview Create Snapshot" first, then create the Kaiser skeleton application.',
          variant: 'destructive',
        });
        return null;
      }
    }
    const activeCreateSnapshot = createPreviewSnapshot;

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

      await setDoc(applicationRef, {
        ...baseApplication,
        healthPlan: isKaiserAuthReceived ? 'Kaiser' : '',
        pathway: '',
        kaiserStatus: isKaiserAuthReceived
          ? (String(memberData.kaiserStatus || '').trim() || 'T2038 Received, doc collection')
          : '',
        caspioCalAIMStatus: isKaiserAuthReceived ? 'Authorized' : '',
        allowDraftCaspioPush: isKaiserAuthReceived ? true : false,
        forms: isKaiserAuthReceived ? currentAuthForms : [],
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
      if (
        isKaiserAuthReceived &&
        storage &&
        String(memberData.parsedSourceType || '').trim() === 'spreadsheet' &&
        Boolean(memberData.createServiceDeliveryFormPdf)
      ) {
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
            careManagerName: String(memberData.careManagerName || '').trim(),
            careManagerPhone: String(memberData.careManagerPhone || '').trim(),
            careManagerEmail: String(memberData.careManagerEmail || '').trim(),
            eligibilityCheckStatus: normalizeEligibilityStatus(memberData.eligibilityCheckStatus),
            authorizationNumberT2038: String(memberData.Authorization_Number_T038 || '').trim(),
            authorizationStartT2038: String(memberData.Authorization_Start_T2038 || '').trim(),
            authorizationEndT2038: String(memberData.Authorization_End_T2038 || '').trim(),
            kaiserStatus: String(memberData.kaiserStatus || '').trim() || 'T2038 Received, doc collection',
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
          };
          const serviceDeliveryForm = await createSpreadsheetServiceDeliveryPlaceholder({
            applicationId,
            row: spreadsheetRowLike,
          });
          if (serviceDeliveryForm) {
            generatedServiceDeliveryFormUrl = String(serviceDeliveryForm.downloadURL || '').trim();
            currentAuthForms = [serviceDeliveryForm, ...currentAuthForms];
            await setDoc(applicationRef, { forms: currentAuthForms, lastUpdated: serverTimestamp() }, { merge: true });
          }
        } catch (error) {
          console.warn('Failed to create spreadsheet Service Delivery Form PDF:', error);
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
            assignedBy: assignedByName,
          });
        } catch (error) {
          console.warn('Failed to create initial staff assignment notification:', error);
        }
      }

      if (!options?.suppressSuccessToast) {
        toast({
          title: isKaiserAuthReceived ? "Created" : "Application Created",
          description: isKaiserAuthReceived
            ? `Kaiser skeleton application created for ${memberData.memberFirstName} ${memberData.memberLastName}. Redirecting to Application Pathway...`
            : `Application created for ${memberData.memberFirstName} ${memberData.memberLastName}. Redirecting to CS Summary form.`,
          action: isKaiserAuthReceived ? (
            <ToastAction altText="Go to this application" onClick={() => router.push(`/admin/applications/${applicationId}`)}>
              Go to this application
            </ToastAction>
          ) : undefined,
        });
      }
      const memberName = `${memberData.memberFirstName || ''} ${memberData.memberLastName || ''}`.trim() || 'Member';
      setLastCreatedSkeleton({ applicationId, memberName, clientId2: '' });
      if (activeCreateSnapshot?.snapshotId && user) {
        try {
          const token = await user.getIdToken();
          await fetch('/api/admin/operation-snapshots', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              snapshotId: activeCreateSnapshot.snapshotId,
              status: 'applied',
              applicationId,
              payloadMerge: {
                createdApplicationId: applicationId,
                appliedAtIso: new Date().toISOString(),
              },
            }),
          });
          setLastCreateSnapshotId(activeCreateSnapshot.snapshotId);
        } catch {
          // non-fatal snapshot update failure
        }
      }
      setCreatePreviewSnapshot(null);
      setIntroEmailDraft(null);
      const shouldSkipNavigate = options?.skipNavigate ?? false;
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
      if (activeCreateSnapshot?.snapshotId && user) {
        try {
          const token = await user.getIdToken();
          await fetch('/api/admin/operation-snapshots', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              snapshotId: activeCreateSnapshot.snapshotId,
              status: 'failed',
              payloadMerge: {
                failedAtIso: new Date().toISOString(),
                failureMessage: String((error as any)?.message || 'Unknown create failure'),
              },
            }),
          });
        } catch {
          // non-fatal snapshot update failure
        }
      }
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="md:col-span-2 space-y-3">
                  <div className="p-3 border rounded-md bg-indigo-50/40 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">Section 1: Spreadsheet Parse (No Batch Create)</div>
                        <div className="text-xs text-muted-foreground">
                          Use this section to upload spreadsheet rows and manually parse selected members into the form.
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
                          {isParsingIlsSpreadsheet ? 'Parsing spreadsheet...' : '1) Upload Spreadsheet'}
                        </Button>
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
                      Recommended order: upload spreadsheet - pick row - parse row into form - create one application using the main Create button.
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Spreadsheet file: {ilsSpreadsheetFileName || 'None'}
                    </div>
                    {ilsSpreadsheetHeaders.length > 0 ? (
                      <div className="rounded-md border bg-white p-2 text-xs">
                        <div className="font-medium mb-1">Detected headers ({ilsSpreadsheetHeaders.length})</div>
                        <div className="text-muted-foreground break-words">
                          {ilsSpreadsheetHeaders.join(' | ')}
                        </div>
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
                      Upload one or more single-auth PDFs, parse to row list, and send Accept/Decline service-delivery updates to ILS.
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
                        setSingleAuthContactPreview({ memberPhone: '', cellPhone: '', email: '' });
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
                        variant="outline"
                        onClick={() => void parseSingleAuthPdfToIlsRows(serviceRequestFiles)}
                        disabled={serviceRequestFiles.length === 0 || isParsingServiceRequest}
                      >
                        {isParsingServiceRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {isParsingServiceRequest ? 'Parsing PDFs...' : '3) Parse Selected PDF(s) to Rows'}
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
                      Subject template for ILS updates: <span className="font-medium">To ILS RE: (Name of Member): MRN: (MRN)</span>
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
                    {(singleAuthContactPreview.memberPhone || singleAuthContactPreview.cellPhone || singleAuthContactPreview.email) ? (
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
                        <div className="text-amber-800">
                          Email: {singleAuthContactPreview.email || 'Not found'}
                        </div>
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
                      <div className="overflow-x-auto rounded border bg-white">
                        <table className="min-w-[1500px] w-full text-[12px] leading-5">
                          <thead className="bg-slate-50">
                            <tr className="text-left">
                              <th className="px-2 py-2 font-semibold whitespace-nowrap w-[56px]">Pick</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[96px]">Parse Row</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[110px]">First Name</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[120px]">Last Name</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[120px]">City</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[120px]">County</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[120px]">MRN</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[150px]">Medical Number (CIN)</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[250px]">Kaiser Push Status</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[150px]">Skeleton Status</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[220px]">Caspio Match</th>
                              <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[220px]">ILS Decision</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ilsImportRows.length === 0 ? (
                              <tr className="border-t">
                                <td colSpan={12} className="px-2 py-2 text-muted-foreground">
                                  No parsed rows yet. Click <span className="font-medium">1) Upload Spreadsheet</span>. If your file uses uncommon headers, I can add them.
                                </td>
                              </tr>
                            ) : ilsPickerRows.length === 0 ? (
                              <tr className="border-t">
                                <td colSpan={12} className="px-2 py-2 text-muted-foreground">
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
                                  <td className="px-2 py-2 align-top">
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
                                  <td className="px-2 py-2 align-top">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 text-[11px]"
                                      disabled={isLockedForSkeleton}
                                      onClick={() => {
                                        setPickedIlsRowId(row.rowId);
                                        populateMemberDataFromIlsRow(row);
                                      }}
                                    >
                                      Parse Row
                                    </Button>
                                  </td>
                                  <td className="px-2 py-2 align-top whitespace-nowrap">{row.memberFirstName || '—'}</td>
                                  <td className="px-2 py-2 align-top whitespace-nowrap">{row.memberLastName || '—'}</td>
                                  <td className="px-2 py-2 align-top whitespace-nowrap">{row.memberCity || '—'}</td>
                                  <td className="px-2 py-2 align-top whitespace-nowrap">{row.memberCounty || '—'}</td>
                                  <td className="px-2 py-2 align-top whitespace-nowrap">{row.memberMrn || '—'}</td>
                                  <td className="px-2 py-2 align-top whitespace-nowrap">{row.memberMediCalNum || '—'}</td>
                                  <td className="px-2 py-2 align-top min-w-[250px]">
                                    <Select
                                      value={String(row.kaiserStatus || '').trim() || 'T2038 Received, doc collection'}
                                      onValueChange={(value) => {
                                        setIlsImportRows((prev) =>
                                          prev.map((r) =>
                                            r.rowId === row.rowId ? { ...r, kaiserStatus: value } : r
                                          )
                                        );
                                      }}
                                      disabled={isLockedForSkeleton}
                                    >
                                      <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="T2038 Received, doc collection">
                                          T2038 Received, doc collection
                                        </SelectItem>
                                        <SelectItem value="T2038 Received, Need First Contact">
                                          T2038 Received, Need First Contact
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </td>
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
                          <div className="rounded border bg-white p-2 whitespace-pre-wrap">
                            {pendingIlsDecisionDraft.message}
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
                  <Input
                    id="memberSex"
                    placeholder="F or M"
                    value={memberData.memberSex || ''}
                    onChange={(e) => {
                      const normalized = normalizeMemberSex(e.target.value);
                      setMemberData({ ...memberData, memberSex: normalized });
                    }}
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
                    onBlur={(e) =>
                      setMemberData((prev) => ({
                        ...prev,
                        memberCustomaryAddress: toNameCase(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryCity">Member Customary City</Label>
                  <Input
                    id="memberCustomaryCity"
                    value={memberData.memberCustomaryCity || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryCity: e.target.value })}
                    onBlur={(e) =>
                      setMemberData((prev) => ({
                        ...prev,
                        memberCustomaryCity: toNameCase(e.target.value),
                      }))
                    }
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
                        memberCustomaryCounty: toNameCase(
                          inferCountyFromCityZip({
                            city: prev.memberCustomaryCity,
                            zip: normalizedZip,
                          }) || prev.memberCustomaryCounty || ''
                        ),
                      }));
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryCounty">Member Customary County</Label>
                  <Input
                    id="memberCustomaryCounty"
                    value={memberData.memberCustomaryCounty || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryCounty: e.target.value })}
                    onBlur={(e) =>
                      setMemberData((prev) => ({
                        ...prev,
                        memberCustomaryCounty: toNameCase(e.target.value),
                      }))
                    }
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
                  <Label htmlFor="kaiserStatus">Kaiser Status</Label>
                  <Select
                    value={String(memberData.kaiserStatus || '').trim() || PRE_PUSH_KAISER_STATUS_OPTIONS[1]}
                    onValueChange={(value) => setMemberData({ ...memberData, kaiserStatus: value })}
                  >
                    <SelectTrigger id="kaiserStatus">
                      <SelectValue placeholder="Select Kaiser status" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRE_PUSH_KAISER_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Required for Caspio push. Use "T2038 Received, doc collection" when authorization is already received.
                  </p>
                </div>
                {String(memberData.parsedSourceType || '').trim() === 'spreadsheet' && (
                  <div className="md:col-span-2 rounded-md border p-3">
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={Boolean(memberData.createServiceDeliveryFormPdf)}
                        onChange={(e) =>
                          setMemberData((prev) => ({
                            ...prev,
                            createServiceDeliveryFormPdf: e.target.checked,
                          }))
                        }
                      />
                      <span>
                        Create Service Delivery Form PDF from this parsed spreadsheet row when creating skeleton application.
                      </span>
                    </label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The generated PDF is added as the first file under the member and included in staff assignment notifications.
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
            {intakeType === 'kaiser_auth_received_via_ils' ? (
              <div className="grid gap-2 md:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void prepareCreateSnapshot()}
                  disabled={isCreating || isPreparingCreateSnapshot}
                >
                  {isPreparingCreateSnapshot ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Preview Create Snapshot
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void rollbackLastCreateSnapshot()}
                  disabled={isCreating || isRollingBackCreateSnapshot || !lastCreateSnapshotId}
                >
                  {isRollingBackCreateSnapshot ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  Rollback Last Snapshot
                </Button>
              </div>
            ) : null}
            {intakeType === 'kaiser_auth_received_via_ils' && createPreviewSnapshot ? (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-900">
                Snapshot ready: <span className="font-mono">{createPreviewSnapshot.snapshotId}</span> • Batch:{' '}
                <span className="font-mono">{createPreviewSnapshot.batchId}</span>
              </div>
            ) : null}
            <Button 
              onClick={createApplicationForMember}
              disabled={
                isCreating ||
                !isFormValid ||
                (intakeType === 'kaiser_auth_received_via_ils' &&
                  (!createPreviewSnapshot || createPreviewSnapshot.signature !== createSnapshotSignature))
              }
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