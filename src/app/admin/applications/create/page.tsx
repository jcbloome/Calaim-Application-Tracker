'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Bell, Database, FileText, Loader2, RotateCcw, Upload, Users } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ToastAction } from '@/components/ui/toast';

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
  const last = String(name.lastName || '').trim();
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
    memberDob: string;
    memberPhone: string;
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
          if (parsedName.lastName) result.memberLastName = toNameCase(parsedName.lastName);
        }

        const tokens = valueLine.split(/\s+/).filter(Boolean);
        const firstTokenWithDigit = tokens.find((token) => /\d/.test(token));
        if (firstTokenWithDigit && /^[A-Z0-9-]{6,}$/i.test(firstTokenWithDigit)) {
          result.memberMrn = firstTokenWithDigit;
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
          const inferredCounty = inferCountyFromZip(zipMatch[1].trim());
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

    return { street, city, state, zip, county };
  }

  return { street: '', city: '', state: '', zip: '', county: '' };
};

const inferCountyFromZip = (zipRaw: unknown) => {
  const zip = String(zipRaw || '').match(/\d{5}/)?.[0] || '';
  if (!zip) return '';
  const countyByZip: Record<string, string> = {
    '90210': 'Los Angeles',
  };
  return countyByZip[zip] || '';
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
      county: inferredCounty || inferCountyFromZip(cityStateZipMatch[4].trim()),
    };
  }

  const commaParts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
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
      county: inferredCounty || inferCountyFromZip(zip),
    };
  }
  if (commaParts.length >= 3) {
    const street = commaParts[0];
    const city = commaParts[1];
    const stateZip = commaParts[2].match(/^([A-Za-z]{2})[, ]+\s*(\d{5}(?:-\d{4})?)$/);
    const zip = String(stateZip?.[2] || '').trim();
    return {
      street,
      city,
      state: String(stateZip?.[1] || '').toUpperCase(),
      zip,
      county: inferredCounty || inferCountyFromZip(zip),
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

  if (!next.memberCustomaryCounty && next.memberCustomaryZip) {
    const inferredCounty = inferCountyFromZip(next.memberCustomaryZip);
    if (inferredCounty) next.memberCustomaryCounty = inferredCounty;
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
      if (looksLikeStreet(cleaned)) return cleaned;
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

  const memberEmail = findFirst(flattened, [
    /email\s*:\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  ]);

  const parsedName = sanitizeParsedName(parseMemberName(memberNameRaw));
  const tableFields = extractMemberTableFieldsFromLines(lines);
  let updates: Record<string, string> = {};
  if (tableFields.memberFirstName || parsedName.firstName) {
    updates.memberFirstName = toNameCase(tableFields.memberFirstName || parsedName.firstName || '');
  }
  if (tableFields.memberLastName || parsedName.lastName) {
    updates.memberLastName = toNameCase(tableFields.memberLastName || parsedName.lastName || '');
  }
  if (memberMrn || tableFields.memberMrn) updates.memberMrn = memberMrn || tableFields.memberMrn || '';
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
  if (memberEmail) updates.contactEmail = memberEmail.toLowerCase();
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

  const memberEmail = findFirst(flattened, [
    /(?:member|patient)?\s*email\s*[:#-]?\s*(?:\r?\n\s*)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  ]);

  const parsedName = sanitizeParsedName(parseMemberName(memberNameRaw));
  const tableFields = extractMemberTableFieldsFromLines(lines);
  const parsedAddress = parseAddressParts(memberAddress);

  let updates: Partial<{
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

  if (tableFields.memberFirstName || parsedName.firstName) {
    updates.memberFirstName = toNameCase(tableFields.memberFirstName || parsedName.firstName || '');
  }
  if (tableFields.memberLastName || parsedName.lastName) {
    updates.memberLastName = toNameCase(tableFields.memberLastName || parsedName.lastName || '');
  }
  if (memberMrn || tableFields.memberMrn) updates.memberMrn = memberMrn || tableFields.memberMrn || '';
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
  if (memberEmail) updates.contactEmail = memberEmail.toLowerCase();
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

const extractSingleAuthContactPreview = (patch: Record<string, string>) => ({
  memberPhone: String(patch.memberPhone || '').trim(),
  cellPhone: String(patch.contactPhone || '').trim(),
  email: String(patch.contactEmail || '').trim().toLowerCase(),
});

const removeUnreliableSingleAuthContactFields = (patch: Record<string, string>) => {
  const { memberPhone: _memberPhone, contactPhone: _contactPhone, contactEmail: _contactEmail, ...rest } = patch;
  return rest;
};

type KaiserIlsImportRow = {
  rowId: string;
  sourceType: 'spreadsheet' | 'single_auth_pdf';
  sourceFileName: string;
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
  const [ilsImportRows, setIlsImportRows] = useState<KaiserIlsImportRow[]>([]);
  const [ilsImportSelected, setIlsImportSelected] = useState<Record<string, boolean>>({});
  const [quickViewIlsRowId, setQuickViewIlsRowId] = useState('');
  const [isParsingIlsSpreadsheet, setIsParsingIlsSpreadsheet] = useState(false);
  const [checkingRowDuplicates, setCheckingRowDuplicates] = useState<Record<string, boolean>>({});
  const [ilsRowDuplicateMatches, setIlsRowDuplicateMatches] = useState<Record<string, IlsDuplicateMatch[]>>({});
  const [isCreatingIlsRecords, setIsCreatingIlsRecords] = useState(false);
  const [isDeletingCreatedIlsRecords, setIsDeletingCreatedIlsRecords] = useState(false);
  const [isPushingIlsRows, setIsPushingIlsRows] = useState(false);
  const [isPushingSingleAuthToCaspio, setIsPushingSingleAuthToCaspio] = useState(false);
  const [isLoadingIntroEmailPreview, setIsLoadingIntroEmailPreview] = useState(false);
  const [isSendingIntroEmail, setIsSendingIntroEmail] = useState(false);
  const [introEmailDraft, setIntroEmailDraft] = useState<{
    to: string;
    subject: string;
    message: string;
  } | null>(null);
  const [lastCreatedSkeleton, setLastCreatedSkeleton] = useState<{ applicationId: string; memberName: string; clientId2: string } | null>(null);
  const [lockedCaspioPushMapping, setLockedCaspioPushMapping] = useState<Record<string, string> | null>(null);
  const ilsSpreadsheetInputRef = useRef<HTMLInputElement | null>(null);
  const serviceRequestFileInputRef = useRef<HTMLInputElement | null>(null);
  const parseAbortControllerRef = useRef<AbortController | null>(null);
  const parsedSingleAuthFilesRef = useRef<Record<string, File>>({});
  const ilsDuplicateIndexWarningShownRef = useRef(false);
  const createApplicationRef = useRef<() => Promise<string | null> | string | null>(() => null);
  const [memberData, setMemberData] = useState(getEmptyMemberData);

  useEffect(() => {
    const loadLockedMapping = async () => {
      if (!firestore || !user?.uid) return;
      try {
        const mappingRef = doc(firestore, 'users', user.uid, 'admin_settings', 'caspio_field_mapping');
        const mappingSnap = await getDoc(mappingRef);
        if (!mappingSnap.exists()) return;
        const data = (mappingSnap.data() || {}) as Record<string, any>;
        const locked = data?.lockedMappings;
        if (locked && typeof locked === 'object' && Object.keys(locked).length > 0) {
          setLockedCaspioPushMapping(locked as Record<string, string>);
        }
      } catch (error) {
        console.warn('Failed to load locked Caspio mapping from Firestore:', error);
      }
    };
    void loadLockedMapping();
  }, [firestore, user?.uid]);

  const activeCaspioPushMapping = useMemo<Record<string, string>>(
    () =>
      lockedCaspioPushMapping && Object.keys(lockedCaspioPushMapping).length > 0
        ? lockedCaspioPushMapping
        : CASPIO_PUSH_MAPPING,
    [lockedCaspioPushMapping]
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
    return Object.entries(activeCaspioPushMapping).map(([source, caspioField]) => ({
      source,
      caspioField,
      value: String(sourceValueMap[source] || '').trim() || '—',
    }));
  }, [activeCaspioPushMapping, quickViewIlsRow]);

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
            sourceType: 'spreadsheet',
            sourceFileName: String(file?.name || '').trim(),
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
      void Promise.all(parsed.map((row) => checkRowDuplicateAuthorizationByMrn(row)));
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
    setIlsRowEligibilityFiles({});
    setIlsRowDuplicateMatches({});
    setCheckingRowDuplicates({});
    setQuickViewIlsRowId('');
    setIlsSpreadsheetFileName('');
    parsedSingleAuthFilesRef.current = {};
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
        { name: 'Primary Contact Screenshot', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Alternative Contact Screenshot', status: 'Pending', type: 'Upload', href: '#' },
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
          const sourcePdf = row.sourceType === 'single_auth_pdf' ? parsedSingleAuthFilesRef.current[row.rowId] : null;
          if (sourcePdf && storage) {
            try {
              const safeFileName = sourcePdf.name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const storagePath = `applications/${applicationId}/parsed-intake/${Date.now()}-${safeFileName}`;
              const storageRef = ref(storage, storagePath);
              const uploadTask = uploadBytesResumable(storageRef, sourcePdf);
              await new Promise<void>((resolve, reject) => {
                uploadTask.on('state_changed', undefined, reject, () => resolve());
              });
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              formsForRow.unshift({
                name: 'ILS Authorization Sheet PDF',
                status: 'Completed',
                type: 'Upload',
                href: '#',
                fileName: sourcePdf.name,
                filePath: storagePath,
                downloadURL,
                dateCompleted: new Date().toISOString(),
                source: 'single_auth_pdf',
              } as any);
            } catch (uploadError) {
              console.warn('Failed to upload parsed source PDF:', uploadError);
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
            status: 'draft',
            currentStep: 1,
            isComplete: false,
            healthPlan: 'Kaiser',
            pathway: '',
            kaiserStatus: 'T2038 Received, Needs First Contact',
            caspioCalAIMStatus: 'Pending',
            allowDraftCaspioPush: true,
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
          const errorData = await response.json();
          throw new Error(errorData.error || 'Vision parsing failed');
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
        const contactPreview = extractSingleAuthContactPreview(normalizedPatch);
        const reliablePatch = removeUnreliableSingleAuthContactFields(normalizedPatch);
        setSingleAuthContactPreview(contactPreview);
        setMemberData((prev) => ({ ...prev, ...reliablePatch }));
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
      const contactPreview = extractSingleAuthContactPreview(normalizedPatch);
      const reliablePatch = removeUnreliableSingleAuthContactFields(normalizedPatch);
      setSingleAuthContactPreview(contactPreview);
      setMemberData((prev) => ({ ...prev, ...reliablePatch }));
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
          const normalizedPatch = normalizeMemberPatch((parsed?.updates || {}) as Record<string, unknown>);
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
            clientId2: '',
            memberAddress: String(normalizedPatch.memberCustomaryAddress || '').trim(),
            memberCounty: String(normalizedPatch.memberCustomaryCounty || '').trim(),
            memberDob: toMmDdYyyy(normalizedPatch.memberDob || ''),
            memberPhone: String(normalizedPatch.memberPhone || '').trim(),
            authorizationNumberT2038: String(normalizedPatch.Authorization_Number_T038 || '').trim(),
            authorizationStartT2038: toMmDdYyyy(normalizedPatch.Authorization_Start_T2038 || ''),
            authorizationEndT2038: toMmDdYyyy(normalizedPatch.Authorization_End_T2038 || ''),
            cptCode: '',
            diagnosticCode: String(normalizedPatch.Diagnostic_Code || '').trim(),
            assignedStaffId: selectedAssignedStaffId,
            assignedStaffName: selectedAssignedStaffName,
            createStatus: 'idle',
            pushStatus: 'idle',
            deleteStatus: 'idle',
            statusNote: '',
            applicationId: '',
            pushedClientId2: '',
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

      setIlsImportRows((prev) => [...rowsToAppend, ...prev]);
      setIlsImportSelected((prev) => {
        const next = { ...prev };
        rowsToAppend.forEach((row) => {
          next[row.rowId] = true;
        });
        return next;
      });
      setQuickViewIlsRowId(rowsToAppend[0]?.rowId || '');
      void Promise.all(rowsToAppend.map((row) => checkRowDuplicateAuthorizationByMrn(row)));
      setServiceRequestWarnings(warnings.slice(0, 10));
      toast({
        title: 'Single-auth PDFs parsed',
        description: `Added ${rowsToAppend.length} parsed row(s) to the batch table.`,
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
    setSingleAuthContactPreview({ memberPhone: '', cellPhone: '', email: '' });
    setIlsSpreadsheetFileName('');
    setIlsImportRows([]);
    setIlsImportSelected({});
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

  const createApplicationForMember = async (options?: { skipNavigate?: boolean; suppressSuccessToast?: boolean }) => {
    const isKaiserAuthReceived = intakeType === 'kaiser_auth_received_via_ils';
    const hasContactRequired =
      Boolean(memberData.contactFirstName && memberData.contactLastName && memberData.contactPhone && memberData.contactEmail) &&
      String(memberData.contactPhone || '').replace(/\D/g, '').length === 10;
    const submittingStaff = getSubmittingStaffIdentity(user);

    if (
      !firestore ||
      !hasRequiredMemberName ||
      !hasContactRequired
    ) {
      toast({
        title: "Missing Information",
        description: "Please fill member name and primary contact name, phone, and email before creating the draft application.",
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

        // Submitting user for draft intake (staff)
        referrerFirstName: submittingStaff.firstName || '',
        referrerLastName: submittingStaff.lastName || '',
        referrerEmail: submittingStaff.email || '',
        referrerPhone: submittingStaff.phone || memberData.contactPhone || memberData.memberPhone || '',
        referrerRelationship: 'Staff',
        agency: 'Connections Care Home Consultants',

        // Primary contact for member outreach
        isPrimaryContactSameAsReferrer: false,
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
        { name: 'Primary Contact Screenshot', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Alternative Contact Screenshot', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Proof of Income', status: 'Pending', type: 'Upload', href: '#' },
        { name: "LIC 602A - Physician's Report", status: 'Pending', type: 'Upload', href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
        { name: 'Medicine List', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Room and Board/Tier Level Agreement', status: 'Pending', type: 'Upload', href: '/forms/room-board-obligation/printable' },
      ];

      await setDoc(applicationRef, {
        ...baseApplication,
        healthPlan: isKaiserAuthReceived ? 'Kaiser' : '',
        pathway: '',
        kaiserStatus: isKaiserAuthReceived ? 'T2038 Received, Needs First Contact' : '',
        caspioCalAIMStatus: isKaiserAuthReceived ? 'Pending' : '',
        allowDraftCaspioPush: isKaiserAuthReceived ? true : false,
        forms: isKaiserAuthReceived ? authReceivedForms : [],
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
          action: isKaiserAuthReceived ? (
            <ToastAction altText="Go to this application" onClick={() => router.push(`/admin/applications/${applicationId}`)}>
              Go to this application
            </ToastAction>
          ) : undefined,
        });
      }
      const memberName = `${memberData.memberFirstName || ''} ${memberData.memberLastName || ''}`.trim() || 'Member';
      setLastCreatedSkeleton({ applicationId, memberName, clientId2: '' });
      setIntroEmailDraft(null);
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

  const pushSingleAuthToCaspio = async (options?: { createSkeletonFirst?: boolean }) => {
    if (intakeType !== 'kaiser_auth_received_via_ils') {
      toast({
        title: 'Wrong intake type',
        description: 'Switch to Kaiser Auth Received (via ILS) to use single-auth push.',
        variant: 'destructive',
      });
      return;
    }
    if (!hasRequiredMemberName) {
      toast({
        title: 'Missing member name',
        description: 'Parse the single auth PDF (or enter member first/last name) before creating/opening the main application record.',
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
          throw new Error('Could not create skeleton application.');
        }
      }
      toast({
        title: 'Skeleton created',
        description: createdApplicationId
          ? `Open application ${createdApplicationId} and push to Caspio from the main application page.`
          : 'Create a skeleton first, then push from the main application page.',
        action: createdApplicationId ? (
          <ToastAction altText="Go to this application" onClick={() => router.push(`/admin/applications/${createdApplicationId}`)}>
            Go to this application
          </ToastAction>
        ) : undefined,
      });
      if (createdApplicationId) {
        router.push(`/admin/applications/${createdApplicationId}`);
      }
    } catch (error: any) {
      toast({
        title: 'Create/open failed',
        description: String(error?.message || 'Unable to create/open the main application page.'),
        variant: 'destructive',
      });
    } finally {
      setIsPushingSingleAuthToCaspio(false);
    }
  };

  const isFormValid = hasRequiredMemberName && (
                       Boolean(
                         memberData.contactFirstName &&
                         memberData.contactLastName &&
                         memberData.contactPhone &&
                         memberData.contactEmail &&
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
                        Upload Excel files from Kaiser ILS or bulk single authorization-sheet PDFs to parse fields, create draft application records, assign staff, and push to Caspio when ready.
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
                        {isPushingIlsRows ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Database className="mr-2 h-4 w-4 text-sky-600" />
                        )}
                        Open Selected for Main-Page Push
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
                      multiple
                      onChange={(e) => {
                        const selectedList = Array.from(e.target.files || []);
                        const selected = selectedList[0] || null;
                        setServiceRequestFiles(selectedList);
                        setServiceRequestFile(selected);
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
                        Upload Single Auth PDF
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void parseServiceRequestPdfAndApply()}
                        disabled={!serviceRequestFile || isParsingServiceRequest}
                      >
                        {isParsingServiceRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                        {isParsingServiceRequest ? 'Parsing...' : 'Parse Single Auth PDF'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void parseSingleAuthPdfToIlsRows(serviceRequestFiles)}
                        disabled={serviceRequestFiles.length === 0 || isParsingServiceRequest}
                      >
                        {isParsingServiceRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                        Parse Selected PDFs Into Batch
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
                        {isPushingSingleAuthToCaspio ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Database className="mr-2 h-4 w-4 text-sky-600" />
                        )}
                        Create + Open Main Page
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
                      Spreadsheet file: {ilsSpreadsheetFileName || 'None'} • Single auth PDFs selected: {serviceRequestFiles.length || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Single-auth flow: Parse PDF(s) -&gt; Create skeleton(s) (draft) -&gt; Open main application page -&gt; Push to Caspio.
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Protocol: Upload single-auth PDF first, then click Parse Single Auth PDF to fill member name/details.
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
                          Parsed contact preview (not auto-applied to skeleton)
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
                          <Button type="button" size="sm" asChild>
                            <Link href={`/admin/applications/${lastCreatedSkeleton.applicationId}`}>
                              Go to This Application
                            </Link>
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
                            disabled={!introEmailDraft || isSendingIntroEmail || isLoadingIntroEmailPreview}
                          >
                            {isSendingIntroEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Send Introductory Email
                          </Button>
                        </div>
                        {introEmailDraft ? (
                          <div className="rounded-md border bg-white p-3 space-y-2">
                            <div className="text-xs font-medium">Edit Introductory Email Before Sending</div>
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
                            <th className="px-2 py-1.5">Source</th>
                            <th className="px-2 py-1.5">Auth #</th>
                            <th className="px-2 py-1.5">Start</th>
                            <th className="px-2 py-1.5">End</th>
                            <th className="px-2 py-1.5">Eligibility / Support Files</th>
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
                              <td className="px-2 py-1.5 whitespace-nowrap">{row.sourceFileName || row.sourceType}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{row.authorizationNumberT2038 || '—'}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{row.authorizationStartT2038 || '—'}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{row.authorizationEndT2038 || '—'}</td>
                              <td className="px-2 py-1.5 min-w-[260px]">
                                <div className="space-y-1">
                                  <Input
                                    type="file"
                                    multiple
                                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                                    className="h-8 text-[11px]"
                                    onChange={(event) => {
                                      const picked = Array.from(event.target.files || []);
                                      setIlsRowEligibilityFiles((prev) => ({
                                        ...prev,
                                        [row.rowId]: picked,
                                      }));
                                    }}
                                  />
                                  <div className="text-[11px] text-muted-foreground">
                                    {(ilsRowEligibilityFiles[row.rowId] || []).length > 0
                                      ? `${(ilsRowEligibilityFiles[row.rowId] || []).length} file(s) queued`
                                      : 'Optional'}
                                  </div>
                                  {checkingRowDuplicates[row.rowId] ? (
                                    <div className="text-[11px] text-amber-700">Checking duplicate authorizations by MRN...</div>
                                  ) : null}
                                  {(ilsRowEligibilityFiles[row.rowId] || []).length > 0 ? (
                                    <div className="space-y-1">
                                      {(ilsRowEligibilityFiles[row.rowId] || []).map((file, idx) => {
                                        return (
                                          <div key={`${row.rowId}-${file.name}-${idx}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-[11px]">
                                            <span className="text-muted-foreground">{file.name}</span>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 px-2 text-[11px]"
                                              onClick={() => {
                                                const next = (ilsRowEligibilityFiles[row.rowId] || []).filter((_, i) => i !== idx);
                                                setIlsRowEligibilityFiles((prev) => ({ ...prev, [row.rowId]: next }));
                                              }}
                                            >
                                              Remove
                                            </Button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                  {(ilsRowDuplicateMatches[row.rowId] || []).length > 0 ? (
                                    <div className="rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 space-y-1">
                                      <div>
                                        Duplicate authorization found for this member MRN ({(ilsRowDuplicateMatches[row.rowId] || []).length}).
                                        Remove this row before creating records.
                                      </div>
                                      {(ilsRowDuplicateMatches[row.rowId] || []).slice(0, 3).map((match) => (
                                        <div key={`${row.rowId}-${match.sourceId}-${match.matchedAuthorization}`} className="text-[11px]">
                                          Match: {match.matchedAuthorization} •{' '}
                                          <Link className="underline" href={`/admin/applications/${encodeURIComponent(match.sourceId)}`} target="_blank" rel="noreferrer">
                                            {match.sourceLabel}
                                          </Link>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
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
                                <div className="space-y-1">
                                  <div>
                                    {row.statusNote || [row.createStatus, row.pushStatus, row.deleteStatus].filter((x) => x !== 'idle').join(' • ') || 'Ready'}
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[11px]"
                                    onClick={() => {
                                      setIlsImportRows((prev) => prev.filter((r) => r.rowId !== row.rowId));
                                      setIlsImportSelected((prev) => {
                                        const next = { ...prev };
                                        delete next[row.rowId];
                                        return next;
                                      });
                                      setIlsRowEligibilityFiles((prev) => {
                                        const next = { ...prev };
                                        delete next[row.rowId];
                                        return next;
                                      });
                                      setIlsRowDuplicateMatches((prev) => {
                                        const next = { ...prev };
                                        delete next[row.rowId];
                                        return next;
                                      });
                                      setCheckingRowDuplicates((prev) => {
                                        const next = { ...prev };
                                        delete next[row.rowId];
                                        return next;
                                      });
                                      if (quickViewIlsRowId === row.rowId) {
                                        setQuickViewIlsRowId('');
                                      }
                                    }}
                                  >
                                    Delete Row
                                  </Button>
                                </div>
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
              This is who receives missing-document requests and status outreach (family member, caregiver, case worker, etc.).
            </p>
            <Alert className="mb-3">
              <AlertDescription>
                Submitting staff is tracked automatically for this draft. Primary contact is separate and required before draft creation.
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
                <Label htmlFor="contactFirstName">Contact First Name *</Label>
                <Input
                  id="contactFirstName"
                  value={memberData.contactFirstName || ''}
                  onChange={(e) => setMemberData({ ...memberData, contactFirstName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contactLastName">Contact Last Name *</Label>
                <Input
                  id="contactLastName"
                  value={memberData.contactLastName || ''}
                  onChange={(e) => setMemberData({ ...memberData, contactLastName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contactPhone">Contact Phone *</Label>
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
                <Label htmlFor="contactEmail">Contact Email *</Label>
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
              <p>Please fill in all required fields (marked with *) before creating the application draft.</p>
              {memberData.contactPhone && memberData.contactPhone.replace(/\D/g, '').length > 0 && memberData.contactPhone.replace(/\D/g, '').length < 10 && (
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