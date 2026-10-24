import { findCountyByCity, findCountyByCityAndZip } from '@/lib/california-cities';
import { buildSingleAuthPdfDetailsNotes } from '@/lib/ils-admin-notes';
import { isKaiserMrnPlaceholder, looksLikeKaiserNumericMrn, resolveServiceRequestMrn } from '@/lib/kaiser-region';

export const toMmDdYyyy = (rawValue: unknown): string => {
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

export const toDateInputValue = (rawValue: unknown): string => {
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

export const parseMemberName = (rawValue: unknown): { firstName: string; lastName: string } => {
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

export const stripTrailingNonNameTokens = (rawLastName: unknown) => {
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

export const toNameCase = (value: unknown) =>
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

export const normalizePhoneDigits = (rawValue: unknown) => {
  const digits = String(rawValue || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length >= 10) return digits.slice(0, 10);
  return digits;
};

export const formatPhoneDashed = (rawValue: unknown) => {
  const digits = normalizePhoneDigits(rawValue);
  if (digits.length !== 10) return String(rawValue || '').trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export const normalizeMediCalNumber = (rawValue: unknown) =>
  String(rawValue || '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

export const normalizeMemberSex = (rawValue: unknown) => {
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
        // Typical value row: JOSE MELARA SNP 97242360F 110005643409
        // SNP is plan type (not MRN); CIN ends with a letter; Plan ID is the Kaiser MRN.
        const tokens = valueLine.split(/\s+/).filter(Boolean);
        const nameTokens: string[] = [];
        let planTypeToken = '';
        let cinToken = '';
        let planIdToken = '';
        for (const token of tokens) {
          if (!/\d/.test(token)) {
            if (isKaiserMrnPlaceholder(token) && !planTypeToken) {
              planTypeToken = token;
              continue;
            }
            if (!planTypeToken && !cinToken && !planIdToken) {
              nameTokens.push(token);
              continue;
            }
          }
          const compact = token.replace(/[^A-Z0-9]/gi, '').toUpperCase();
          if (!cinToken && /^[0-9]{7,8}[A-Z]$/.test(compact)) {
            cinToken = compact;
            continue;
          }
          if (!planIdToken && looksLikeKaiserNumericMrn(token)) {
            planIdToken = token.replace(/\D/g, '') || token;
            continue;
          }
          if (!cinToken && /^[A-Z0-9-]{6,}$/i.test(token) && /[A-Z]/i.test(token) && /\d/.test(token)) {
            cinToken = normalizeMediCalNumber(token);
            continue;
          }
          if (!planIdToken && /^[A-Z0-9-]{6,}$/i.test(token) && /\d/.test(token)) {
            planIdToken = token;
          }
        }
        if (nameTokens.length > 0) {
          const parsedName = parseMemberName(nameTokens.join(' '));
          if (parsedName.firstName) result.memberFirstName = toNameCase(parsedName.firstName);
          if (parsedName.lastName) {
            result.memberLastName = toNameCase(stripTrailingNonNameTokens(parsedName.lastName));
          }
        }
        if (cinToken) result.memberMediCalNum = normalizeMediCalNumber(cinToken);
        if (planIdToken) result.planId = planIdToken;
        const resolved = resolveServiceRequestMrn({
          mrn: planTypeToken || '',
          planId: planIdToken,
          mediCal: cinToken,
        });
        if (resolved.memberMrn) result.memberMrn = resolved.memberMrn;
        if (resolved.planId) result.planId = resolved.planId;
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

        // Prefer line-aware parse so city/zip on later lines (e.g. UNIT + city/state, then zip) are kept.
        const fromLines = parseAddressPartsFromLines(cleanedAddressLines);
        if (fromLines.street || fromLines.city || fromLines.state || fromLines.zip) {
          if (fromLines.street) result.memberCustomaryAddress = toNameCase(fromLines.street);
          if (fromLines.city) result.memberCustomaryCity = toNameCase(fromLines.city);
          if (fromLines.state) result.memberCustomaryState = fromLines.state;
          if (fromLines.zip) result.memberCustomaryZip = fromLines.zip;
          if (fromLines.county) result.memberCustomaryCounty = toNameCase(fromLines.county);
        } else {
          const joinedAddress = cleanedAddressLines.join(', ').replace(/,\s*,/g, ', ').trim();
          const parsedJoined = parseAddressParts(joinedAddress);
          if (parsedJoined.street) result.memberCustomaryAddress = toNameCase(parsedJoined.street);
          if (parsedJoined.city) result.memberCustomaryCity = toNameCase(parsedJoined.city);
          if (parsedJoined.state) result.memberCustomaryState = parsedJoined.state;
          if (parsedJoined.zip) result.memberCustomaryZip = parsedJoined.zip;
          if (parsedJoined.county) result.memberCustomaryCounty = toNameCase(parsedJoined.county);
        }
      }
    }
  }

  return result;
};

export const mergeAdminNotes = (existing: unknown, incoming: unknown) => {
  const current = String(existing || '').trim();
  const next = String(incoming || '').trim();
  if (!next) return current;
  if (!current) return next;
  if (current.includes(next)) return current;
  return `${current}\n\n${next}`;
};

const buildSingleAuthAdminNotes = (details: Record<string, string>) =>
  buildSingleAuthPdfDetailsNotes(details);

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
      // Keep collecting through a zip-only trailing line (common single-auth wrap).
      if (
        /\b[A-Za-z]{2}\s+\d{5}(?:-\d{4})?\b/.test(addressPortion) &&
        looksLikeStreetAddressLine(addressPortion)
      ) {
        break;
      }
    }

    if (rawParts.length === 0) continue;
    const cleanedParts = rawParts.map((part) => part.replace(/[,\s]+$/g, '').trim()).filter(Boolean);
    if (cleanedParts.length === 0) continue;

    // Prefer line-aware parse so city/zip on later lines are not lost.
    const fromLines = parseAddressPartsFromLines(cleanedParts);
    if (fromLines.city || fromLines.state || fromLines.zip) {
      return fromLines;
    }

    // Prefer parsing the joined multi-line address as a full US address.
    const joined = cleanedParts.join(', ').replace(/,\s*,/g, ', ').trim();
    const parsedJoined = parseAddressParts(joined);
    if (parsedJoined.city || parsedJoined.state || parsedJoined.zip) {
      return parsedJoined;
    }

    return {
      street: cleanedParts[0] || '',
      city: '',
      state: '',
      zip: '',
      county: '',
    };
  }

  return { street: '', city: '', state: '', zip: '', county: '' };
};

/** Parse multi-line Member Address blocks (street / unit+city+state / zip). */
const parseAddressPartsFromLines = (rawParts: string[]) => {
  const cleanedParts = rawParts.map((part) => String(part || '').replace(/[,\s]+$/g, '').trim()).filter(Boolean);
  if (cleanedParts.length === 0) {
    return { street: '', city: '', state: '', zip: '', county: '' };
  }

  const parts = [...cleanedParts];
  let zip = '';
  let state = '';
  let city = '';
  const streetBits: string[] = [];

  // Trailing zip-only line: "91202"
  if (parts.length >= 2 && /^(\d{5}(?:-\d{4})?)$/.test(parts[parts.length - 1])) {
    zip = parts.pop() || '';
  }

  // Line with city/state (and optional zip), possibly prefixed by unit:
  // "UNIT 111, GLENDALE, CA" | "GLENDALE, CA 91202" | "GLENDALE, CA"
  for (let idx = parts.length - 1; idx >= 0; idx -= 1) {
    const line = parts[idx];
    const unitCityState = line.match(
      /^(.*?),\s*([A-Za-z][A-Za-z .'-]*),\s*([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/
    );
    if (unitCityState) {
      const prefix = String(unitCityState[1] || '').trim();
      city = String(unitCityState[2] || '').trim();
      state = String(unitCityState[3] || '').trim().toUpperCase();
      zip = zip || String(unitCityState[4] || '').trim();
      if (prefix) streetBits.unshift(prefix);
      parts.splice(idx, 1);
      break;
    }
    const cityState = line.match(/^([A-Za-z][A-Za-z .'-]*),\s*([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
    if (cityState) {
      city = String(cityState[1] || '').trim();
      state = String(cityState[2] || '').trim().toUpperCase();
      zip = zip || String(cityState[3] || '').trim();
      parts.splice(idx, 1);
      break;
    }
    const cityStateSpace = line.match(/^([A-Za-z][A-Za-z .'-]*)\s+([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
    if (cityStateSpace && !looksLikeStreetAddressLine(line)) {
      city = String(cityStateSpace[1] || '').trim();
      state = String(cityStateSpace[2] || '').trim().toUpperCase();
      zip = zip || String(cityStateSpace[3] || '').trim();
      parts.splice(idx, 1);
      break;
    }
  }

  streetBits.unshift(...parts);
  const street = streetBits.join(', ').trim();

  if (!city && !state && !zip) {
    return parseAddressParts(cleanedParts.join(', '));
  }

  return {
    street: isStateZipOnlyLine(street) ? '' : street,
    city,
    state,
    zip,
    county: inferCountyFromCityZip({ city, zip }),
  };
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

const inferCountyFromCity = (cityRaw: unknown) => findCountyByCity(String(cityRaw || '')) || '';

export const inferCountyFromCityZip = (params: { city?: unknown; zip?: unknown }) =>
  findCountyByCityAndZip(params.city, params.zip) || '';

export const COUNTY_UNDETERMINED_MESSAGE = 'County cannot be determined from city/ZIP. Enter it manually.';

export const isCountyUndetermined = (params: { city?: unknown; zip?: unknown; county?: unknown }) => {
  const city = String(params.city || '').trim();
  const zip = String(params.zip || '').trim();
  const county = String(params.county || '').trim();
  if (county) return false;
  if (!city && !zip) return false;
  return !inferCountyFromCityZip({ city, zip });
};

export const inferStateFromCityZip = (params: { city?: unknown; zip?: unknown }) => {
  const byZip = inferStateFromZip(params.zip);
  if (byZip) return byZip;
  return inferCountyFromCityZip(params) ? 'CA' : '';
};

export const parseAddressParts = (rawValue: unknown) => {
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

  // Multi-part addresses like:
  // "1305 N COLUMBUS AVE, UNIT 111, GLENDALE, CA, 91202"
  // Parse from the end so unit lines don't steal the city slot.
  if (commaParts.length >= 3) {
    const parts = [...commaParts];
    let zip = '';
    let state = '';
    let city = '';

    const last = parts[parts.length - 1];
    const zipOnly = last.match(/^(\d{5}(?:-\d{4})?)$/);
    if (zipOnly) {
      zip = zipOnly[1];
      parts.pop();
    }

    if (parts.length > 0) {
      const maybeState = parts[parts.length - 1];
      if (/^[A-Za-z]{2}$/.test(maybeState)) {
        state = maybeState.toUpperCase();
        parts.pop();
      } else {
        const stateZip = maybeState.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
        if (stateZip) {
          state = stateZip[1].toUpperCase();
          zip = zip || stateZip[2];
          parts.pop();
        }
      }
    }

    if (parts.length > 0) {
      const maybeCity = parts[parts.length - 1];
      // City should be alphabetic words (not a street with house number alone as last token).
      if (/^[A-Za-z .'-]+$/.test(maybeCity) && !/^\d/.test(maybeCity)) {
        city = maybeCity.trim();
        parts.pop();
      }
    }

    const street = parts.join(', ').trim();
    if (city || state || zip) {
      return {
        street: isStateZipOnlyLine(street) ? '' : street,
        city,
        state,
        zip,
        county: inferredCounty || inferCountyFromCityZip({ city, zip }),
      };
    }
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
  const next: Record<string, string> = { ...updates };
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

  return next as T;
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

  const memberMrnRaw = findFirst(flattened, [
    /\bmrn\b\s*[:#-]?\s*([A-Z0-9-]{3,})/i,
    /medical\s*record\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{3,})/i,
  ]);
  const memberMediCalNum = normalizeMediCalNumber(
    findFirst(flattened, [
      /(?:medi[\s-]*cal|mcp[\s_-]*cin|cin)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([0-9][A-Z0-9-]{6,})/i,
    ])
  );
  const planIdRaw = findFirst(flattened, [/\bplan\s*id\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i]);

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
  const resolvedMediCalNum = memberMediCalNum || normalizeMediCalNumber(tableFields.memberMediCalNum || '');
  if (resolvedMediCalNum) {
    updates.memberMediCalNum = resolvedMediCalNum;
    updates.confirmMemberMediCalNum = resolvedMediCalNum;
  }
  const resolvedMrn = resolveServiceRequestMrn({
    mrn: memberMrnRaw || tableFields.memberMrn || '',
    planId: planIdRaw || tableFields.planId || '',
    mediCal: resolvedMediCalNum,
  });
  if (resolvedMrn.memberMrn) updates.memberMrn = resolvedMrn.memberMrn;
  if (resolvedMrn.planId) (tableFields as any).planId = resolvedMrn.planId;
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
  const extraNotes = buildSingleAuthAdminNotes({
    ...updates,
    ...extraDetails,
    sourceFileName: params.fileName,
  });
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

export const extractServiceRequestFields = (params: { text: string; fileName: string }) => {
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

  const memberMrnRaw = findFirst(flattened, [
    /\bmrn(?:\s*(?:number|no\.?|#))?\b\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{3,})/i,
    /medical\s*record\s*(?:number|no\.?|#)\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{3,})/i,
    /member\s*(?:id|identifier)\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i,
    /patient\s*(?:id|identifier)\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i,
  ]);
  const memberMediCalNum = normalizeMediCalNumber(
    findFirst(flattened, [
      /(?:medi[\s-]*cal|mcp[\s_-]*cin|cin)\s*(?:number|no\.?|#)?\s*[:#-]?\s*(?:\r?\n\s*)?([0-9][A-Z0-9-]{6,})/i,
    ])
  );
  const planIdRaw = findFirst(flattened, [/\bplan\s*id\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i]);

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
  const resolvedMediCalNum = memberMediCalNum || normalizeMediCalNumber(tableFields.memberMediCalNum || '');
  if (resolvedMediCalNum) {
    updates.memberMediCalNum = resolvedMediCalNum;
    updates.confirmMemberMediCalNum = resolvedMediCalNum;
  }
  const resolvedMrn = resolveServiceRequestMrn({
    mrn: memberMrnRaw || tableFields.memberMrn || '',
    planId: planIdRaw || tableFields.planId || '',
    mediCal: resolvedMediCalNum,
  });
  if (resolvedMrn.memberMrn) updates.memberMrn = resolvedMrn.memberMrn;
  if (resolvedMrn.planId) (tableFields as any).planId = resolvedMrn.planId;
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
  if (mergedUpdates.memberCustomaryAddress) {
    mergedUpdates.memberCustomaryAddress = toNameCase(mergedUpdates.memberCustomaryAddress);
  }
  if (mergedUpdates.memberCustomaryCity) {
    mergedUpdates.memberCustomaryCity = toNameCase(mergedUpdates.memberCustomaryCity);
  }
  if (mergedUpdates.memberCustomaryCounty) {
    mergedUpdates.memberCustomaryCounty = toNameCase(mergedUpdates.memberCustomaryCounty);
  }
  const fullNotes = buildSingleAuthAdminNotes({
    ...mergedUpdates,
    ...extraDetails,
    sourceFileName: params.fileName,
  });
  if (fullNotes) mergedUpdates.notes = fullNotes;
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
