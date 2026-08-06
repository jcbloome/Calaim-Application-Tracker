import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import path from 'path';
import { adminDb, adminStorage } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TEMPLATE_PATH = '';
const DEFAULT_TEMPLATE_URL = '';
const PUBLIC_TEMPLATE_CANDIDATE_FILES = [
  path.join(process.cwd(), 'public', 'Templates', 'Kaiser ISP Cover Sheet.pdf'),
  path.join(process.cwd(), 'public', 'Templates', 'Kaiser ISP Coversheet.pdf'),
  path.join(process.cwd(), 'public', 'Templates', 'Kaiser Cover Sheet.pdf'),
  path.join(process.cwd(), 'public', 'templates', 'Kaiser ISP Cover Sheet.pdf'),
  path.join(process.cwd(), 'public', 'templates', 'Kaiser ISP Coversheet.pdf'),
  path.join(process.cwd(), 'public', 'templates', 'Kaiser Cover Sheet.pdf'),
];

const PUBLIC_TEMPLATE_CANDIDATE_PATHS = [
  '/Templates/Kaiser%20ISP%20Cover%20Sheet.pdf',
  '/Templates/Kaiser%20ISP%20Coversheet.pdf',
  '/Templates/Kaiser%20Cover%20Sheet.pdf',
  '/templates/Kaiser%20ISP%20Cover%20Sheet.pdf',
  '/templates/Kaiser%20ISP%20Coversheet.pdf',
  '/templates/Kaiser%20Cover%20Sheet.pdf',
];

function clean(value: string | null) {
  return String(value || '').trim();
}

function asDisplayDate(value: string) {
  const v = clean(value);
  if (!v) return '';
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const isoWithTime = v.match(/^(\d{4})-(\d{2})-(\d{2})T.*$/);
  if (isoWithTime) return `${isoWithTime[2]}/${isoWithTime[3]}/${isoWithTime[1]}`;
  return v;
}

function normalizePhone(value: string) {
  const raw = clean(value);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw;
}

function sanitizeFileComponent(value: string) {
  return clean(value)
    .replace(/[^\w\s.,-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildOutputFileName(memberNameRaw: string, memberMrnRaw: string, createdAtIso?: string) {
  const memberName = sanitizeFileComponent(memberNameRaw) || 'Unknown Member';
  const memberMrn = sanitizeFileComponent(memberMrnRaw) || 'N-A';
  const baseDate = createdAtIso ? new Date(createdAtIso) : new Date();
  const yyyy = Number.isNaN(baseDate.getTime()) ? '0000' : String(baseDate.getFullYear());
  const mm = Number.isNaN(baseDate.getTime()) ? '00' : String(baseDate.getMonth() + 1).padStart(2, '0');
  const dd = Number.isNaN(baseDate.getTime()) ? '00' : String(baseDate.getDate()).padStart(2, '0');
  return `ISP Cover Sheet, ${memberName}, MRN ${memberMrn}, ${yyyy}-${mm}-${dd}.pdf`;
}

function sanitizeStoragePathComponent(value: string) {
  return clean(value)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

async function archiveDownloadedPdf(params: {
  pdfBytes: Uint8Array;
  memberName: string;
  memberClientId: string;
  coverPageType: string;
  downloadLogId: string;
}) {
  const bucket = adminStorage.bucket();
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const memberPart = sanitizeStoragePathComponent(params.memberName || 'member');
  const clientPart = sanitizeStoragePathComponent(params.memberClientId || 'unknown-client');
  const coverPart = sanitizeStoragePathComponent(params.coverPageType || 'unknown-cover');
  const logPart = sanitizeStoragePathComponent(params.downloadLogId || 'no-log');
  const fileName = `${stamp}_${clientPart}_${coverPart}.pdf`;
  const storagePath = `generated-forms/kaiser-isp-cover-sheet/${yyyy}/${mm}/${dd}/${memberPart}_${logPart}/${fileName}`;
  const file = bucket.file(storagePath);
  await file.save(Buffer.from(params.pdfBytes), {
    resumable: false,
    metadata: {
      contentType: 'application/pdf',
      cacheControl: 'private, max-age=0, no-store',
      metadata: {
        formType: 'kaiser-isp-cover-sheet',
        memberName: params.memberName || '',
        memberClientId: params.memberClientId || '',
        coverPageType: params.coverPageType || '',
        downloadLogId: params.downloadLogId || '',
        generatedAt: now.toISOString(),
      },
    },
  });
  return storagePath;
}

async function loadTemplatePdfBuffer(req: NextRequest) {
  const templatePath = String(process.env.KAISER_ISP_COVER_SHEET_TEMPLATE_PATH || DEFAULT_TEMPLATE_PATH).trim();
  const templateUrl = String(process.env.KAISER_ISP_COVER_SHEET_TEMPLATE_URL || DEFAULT_TEMPLATE_URL).trim();

  if (templatePath) {
    try {
      const bytes = await fs.readFile(templatePath);
      return { ok: true as const, buffer: bytes, source: `path:${templatePath}` };
    } catch {
      // Continue to URL and public fallbacks.
    }
  }

  if (templateUrl && /^https?:\/\//i.test(templateUrl)) {
    try {
      const res = await fetch(templateUrl, { cache: 'no-store' });
      if (res.ok) {
        const arr = await res.arrayBuffer();
        return { ok: true as const, buffer: Buffer.from(arr), source: `url:${templateUrl}` };
      }
      return { ok: false as const, error: `Template URL responded HTTP ${res.status}: ${templateUrl}` };
    } catch (error: any) {
      return { ok: false as const, error: `Template URL fetch failed: ${String(error?.message || templateUrl)}` };
    }
  }

  for (const candidateFile of PUBLIC_TEMPLATE_CANDIDATE_FILES) {
    try {
      const bytes = await fs.readFile(candidateFile);
      if (bytes?.length) return { ok: true as const, buffer: bytes, source: `public-file:${candidateFile}` };
    } catch {
      // Continue.
    }
  }

  const origin = String(req.nextUrl.origin || '').trim();
  if (origin) {
    for (const candidatePath of PUBLIC_TEMPLATE_CANDIDATE_PATHS) {
      try {
        const url = `${origin}${candidatePath}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        const contentType = String(res.headers.get('content-type') || '').toLowerCase();
        if (contentType && !contentType.includes('pdf')) continue;
        const arr = await res.arrayBuffer();
        if (!arr.byteLength) continue;
        return { ok: true as const, buffer: Buffer.from(arr), source: `public:${url}` };
      } catch {
        // Continue.
      }
    }
  }

  return {
    ok: false as const,
    error:
      'Kaiser ISP cover sheet template PDF not found. Configure KAISER_ISP_COVER_SHEET_TEMPLATE_URL (preferred for deployed), or KAISER_ISP_COVER_SHEET_TEMPLATE_PATH for local, or commit the template into /public/Templates.',
  };
}

type TextFieldLike = { setText: (value: string) => void };
type CheckFieldLike = { check: () => void; uncheck: () => void };
type RadioFieldLike = { getOptions: () => string[]; select: (value: string) => void };
type DropdownFieldLike = { getOptions: () => string[]; select: (value: string) => void };

function isTextFieldLike(field: unknown): field is TextFieldLike {
  return Boolean(field && typeof (field as TextFieldLike).setText === 'function');
}

function isCheckFieldLike(field: unknown): field is CheckFieldLike {
  return Boolean(
    field &&
      typeof (field as CheckFieldLike).check === 'function' &&
      typeof (field as CheckFieldLike).uncheck === 'function'
  );
}

function isRadioFieldLike(field: unknown): field is RadioFieldLike {
  return Boolean(
    field &&
      typeof (field as RadioFieldLike).getOptions === 'function' &&
      typeof (field as RadioFieldLike).select === 'function'
  );
}

function isDropdownFieldLike(field: unknown): field is DropdownFieldLike {
  return Boolean(
    field &&
      typeof (field as DropdownFieldLike).getOptions === 'function' &&
      typeof (field as DropdownFieldLike).select === 'function'
  );
}

function normalizeCountyForDropdown(value: string): string {
  const raw = clean(value);
  if (!raw) return '';
  return raw.replace(/\s+county$/i, '').trim();
}

function toNcalscal(value: string): string {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  if (raw.includes('north')) return 'NCAL';
  if (raw.includes('south')) return 'SCAL';
  if (raw === 'ncal' || raw === 'scal') return raw.toUpperCase();
  return '';
}

function toYesNo(value: string): string {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  if (['1', 'y', 'yes', 'true', 'checked'].includes(raw)) return 'Yes';
  if (['0', 'n', 'no', 'false', 'unchecked'].includes(raw)) return 'No';
  return clean(value);
}

function parseChangeOfConditionChoice(value: string): 'yes' | 'no' | '' {
  const normalized = normalizeOptionText(value);
  if (!normalized) return '';
  if (
    normalized.startsWith('yes') ||
    normalized.includes('clinical reassessment') ||
    normalized.includes('changes in condition')
  ) {
    return 'yes';
  }
  if (
    normalized.startsWith('no') ||
    normalized.includes('kp will reauthorize at current tier level') ||
    normalized.includes('reauthorize at current tier level')
  ) {
    return 'no';
  }
  return '';
}

function normalizeSubmittedOption(value: string): string {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  if (raw === 'yes' || raw === 'y' || raw === '1' || raw === 'true') return 'Yes';
  if (raw.includes('no') && raw.includes('assist')) {
    return 'No, ILS/external providers to assist Member with completing ALW Application';
  }
  if (raw === 'no' || raw === 'n' || raw === '0' || raw === 'false') {
    return 'No, ILS/external providers to assist Member with completing ALW Application';
  }
  return clean(value);
}

function toTierLabel(value: string): string {
  const raw = clean(value).toLowerCase().replace(/[_-]/g, ' ');
  if (!raw) return '';
  const match = raw.match(/(\d+)/);
  if (match) {
    const num = match[1];
    if (raw.includes('tier level')) return `Tier Level ${num}`;
    if (raw.includes('tier')) return `Tier ${num}`;
    return `Tier ${num}`;
  }
  return clean(value);
}

function ensureMswTitle(value: string): string {
  const normalized = clean(value);
  if (!normalized) return '';
  if (/\bmsw\b/i.test(normalized)) {
    return normalized.replace(/\bmsw\b/gi, 'MSW');
  }
  return `${normalized}, MSW`;
}

const normalizeOptionText = (value: string) =>
  clean(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();

export async function GET(req: NextRequest) {
  const download = clean(req.nextUrl.searchParams.get('download')) === '1';
  const downloadVerified = clean(req.nextUrl.searchParams.get('verified')) === '1';
  const downloadLogId = clean(req.nextUrl.searchParams.get('downloadLogId'));
  if (download && !downloadVerified) {
    return new NextResponse('Verification is required before downloading this form.', { status: 400 });
  }
  const templateResult = await loadTemplatePdfBuffer(req);
  if (!templateResult.ok) {
    return new NextResponse(templateResult.error, { status: 500 });
  }

  try {
    const params = req.nextUrl.searchParams;
    const memberNameForFileName = clean(params.get('memberName'));
    const memberNameValue = memberNameForFileName;
    const pdfDoc = await PDFDocument.load(templateResult.buffer);
    const form = pdfDoc.getForm();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const formAny = form as any;
    const getFieldMaybe = (name: string): unknown => {
      if (!name) return null;
      try {
        if (typeof formAny.getFieldMaybe === 'function') return formAny.getFieldMaybe(name);
        return form.getField(name);
      } catch {
        return null;
      }
    };

    const setFieldValue = (name: string, value: string) => {
      const trimmed = clean(value);
      if (!trimmed) return;
      try {
        const field = getFieldMaybe(name);
        if (!field) return;
        if (isTextFieldLike(field)) {
          field.setText(trimmed);
          return;
        }
        if (isCheckFieldLike(field)) {
          const truthy = ['yes', 'true', '1', 'checked', 'y'].includes(trimmed.toLowerCase());
          if (truthy) field.check();
          else field.uncheck();
          return;
        }
        if (isRadioFieldLike(field)) {
          const options = field.getOptions();
          if (!Array.isArray(options) || options.length === 0) return;
          const normalized = trimmed.toLowerCase();
          const preferred =
            options.find((option) => String(option || '').toLowerCase() === normalized) ||
            options.find((option) => String(option || '').toLowerCase().includes(normalized)) ||
            options[0];
          field.select(preferred);
          return;
        }
        if (isDropdownFieldLike(field)) {
          const options = field.getOptions();
          if (!Array.isArray(options) || options.length === 0) return;
          const normalized = trimmed.toLowerCase();
          const preferred =
            options.find((option) => String(option || '').toLowerCase() === normalized) ||
            options.find((option) => String(option || '').toLowerCase().includes(normalized)) ||
            options.find((option) => normalized.includes(String(option || '').toLowerCase())) ||
            null;
          if (preferred) field.select(preferred);
        }
      } catch {
        // ignore single-field fill errors so one bad value does not fail entire PDF
      }
    };

    const setFirstMatchingCheckField = (nameTokens: string[], checked: boolean) => {
      const tokens = nameTokens.map((token) => token.toLowerCase());
      for (const candidateField of form.getFields()) {
        const fieldName = String(candidateField.getName() || '').toLowerCase();
        if (!tokens.every((token) => fieldName.includes(token))) continue;
        if (!isCheckFieldLike(candidateField)) continue;
        if (checked) candidateField.check();
        else candidateField.uncheck();
        return true;
      }
      return false;
    };

    const setDropdownByPredicate = (fieldName: string, predicate: (normalizedOption: string) => boolean) => {
      const field = getFieldMaybe(fieldName);
      if (!field || !isDropdownFieldLike(field)) return false;
      const options = field.getOptions();
      if (!Array.isArray(options) || options.length === 0) return false;
      const matched = options.find((option) => predicate(normalizeOptionText(String(option || ''))));
      if (!matched) return false;
      field.select(matched);
      return true;
    };

    const setFirstMatchingDropdownByTokens = (
      nameTokens: string[],
      predicate: (normalizedOption: string) => boolean
    ) => {
      const tokens = nameTokens.map((token) => token.toLowerCase());
      for (const candidateField of form.getFields()) {
        const fieldName = String(candidateField.getName() || '').toLowerCase();
        if (!tokens.every((token) => fieldName.includes(token))) continue;
        if (!isDropdownFieldLike(candidateField)) continue;
        const options = candidateField.getOptions();
        if (!Array.isArray(options) || options.length === 0) continue;
        const matched = options.find((option) => predicate(normalizeOptionText(String(option || ''))));
        if (!matched) continue;
        candidateField.select(matched);
        return true;
      }
      return false;
    };

    const setFirstDropdownByOptionMatch = (predicate: (normalizedOption: string) => boolean) => {
      for (const candidateField of form.getFields()) {
        if (!isDropdownFieldLike(candidateField)) continue;
        const options = candidateField.getOptions();
        if (!Array.isArray(options) || options.length === 0) continue;
        const matched = options.find((option) => predicate(normalizeOptionText(String(option || ''))));
        if (!matched) continue;
        candidateField.select(matched);
        return true;
      }
      return false;
    };

    // Direct pass-through: if query key matches a PDF field name, fill it.
    params.forEach((rawValue, rawKey) => {
      const key = clean(rawKey);
      if (!key || key === 'download' || key === 'returnTo') return;
      setFieldValue(key, rawValue);
    });

    // Do not run broad alias filling here because it can populate
    // authorization and reauthorization sections at the same time.
    // Section-specific mapping below is intentionally isolated by selected type.

    const coverPageType = clean(params.get('ispCoverPageType')).toLowerCase();
    if (coverPageType === 'authorization' || coverPageType === 'reauthorization') {
      const selectingReauth = coverPageType === 'reauthorization';
      // Best-effort: these names may vary by ISP template revision.
      setFirstMatchingCheckField(['authorization', 'cover'], !selectingReauth);
      setFirstMatchingCheckField(['reauthorization', 'cover'], selectingReauth);
      setFirstMatchingCheckField(['authorization', 'section'], !selectingReauth);
      setFirstMatchingCheckField(['reauthorization', 'section'], selectingReauth);
    }

    // Explicit mapping to the known Kaiser cover sheet fields (auth + reauth pages).
    const memberName = memberNameValue;
    const memberMrn = clean(params.get('memberMrn'));
    const memberDob = asDisplayDate(clean(params.get('memberDob')));
    const memberPhone = normalizePhone(clean(params.get('memberPhone')));
    const memberCounty = normalizeCountyForDropdown(clean(params.get('memberCounty')));
    const regionNcalScal = toNcalscal(clean(params.get('Kaiser_North_or_South')));
    const livingSituation = clean(params.get('Describe_Member_Living_Situation'));
    const assessmentDate = asDisplayDate(clean(params.get('ISP_Assessment_Date')));
    const rnReviewer = clean(params.get('ISP_RN'));
    const assessmentAdmin = ensureMswTitle(clean(params.get('ISP_Social_Worker')));
    const atAlw = toYesNo(clean(params.get('At_ALW_Facility')));
    const alwSubmitted = normalizeSubmittedOption(clean(params.get('Did_Submit_ALW_Application')));
    const alwWaitlist = toYesNo(clean(params.get('On_ALW_Waitlist')));
    const changeOfCondition = clean(params.get('Change_of_Condition'));
    const changeOfConditionChoice = parseChangeOfConditionChoice(changeOfCondition);
    const requestedTier = clean(params.get('Requested_Tier_Level'));
    const requestedTierTier = toTierLabel(requestedTier);
    const roomBoardAmount = clean(params.get('Room_and_Board_Amount'));
    const facilityName = clean(params.get('Facility_Name'));
    const facilityAddress = clean(params.get('Facility_Address'));
    const facilityType = clean(params.get('Facility_Type')) || 'RCFE';
    const moveInDate = asDisplayDate(clean(params.get('Verified_Move_In_Date') || params.get('Move_In_Date')));
    const facilityVettedContracted = toYesNo(clean(params.get('Facility_Vetted_Contracted')) || 'Yes');
    const inAlwCounty = toYesNo(clean(params.get('In_ALW_County')));
    if (!alwSubmitted) {
      return new NextResponse(
        'Did Submit ALW Application is required before generating the ISP cover sheet PDF.',
        { status: 400 }
      );
    }
    const isAlwSubmittedYes = normalizeOptionText(alwSubmitted) === 'yes';

    const isAuthorization = coverPageType === 'authorization';
    const isReauthorization = coverPageType === 'reauthorization';
    if (isReauthorization && !moveInDate) {
      return new NextResponse(
        'Date Member Moved Into Facility is required for reauthorization cover sheets.',
        { status: 400 }
      );
    }
    if (isReauthorization && !changeOfConditionChoice) {
      return new NextResponse(
        'Change in condition selection is required for reauthorization cover sheets.',
        { status: 400 }
      );
    }

    if (isAuthorization) {
      // Authorization page fields only.
      setFieldValue('Name First MI Last', memberName);
      setFieldValue('MRN', memberMrn);
      setFieldValue('DOB (MM/DD/YYYY)_af_date', memberDob);
      setFieldValue('Cell Phone Number', memberPhone);
      setFieldValue('Describe Members current living situation eg at home with caregiver in a nursing facility etc', livingSituation);
      setFieldValue('Name Type of Professional Licensure of person who administered assessment First Last Name and Title', assessmentAdmin);
      setFieldValue('RN who reviewed the assessment First Last Name', rnReviewer);
      setFieldValue('Assessment Date (MM/DD/YYY)', assessmentDate);
      setFieldValue('Members Financial Responsibility of Room and Board', roomBoardAmount);
      setFieldValue('Dropdown3', regionNcalScal);
      setFieldValue('County', memberCounty);
      setFieldValue('Dropdown4', atAlw);
      const authAlwSelected = setDropdownByPredicate(
        'Dropdown5',
        (opt) => (isAlwSubmittedYes ? opt === 'yes' : opt.includes('external providers') && opt.includes('completing alw application'))
      );
      if (!authAlwSelected) {
        return new NextResponse(
          'Could not map "Has the Member submitted an ALW application?" to a valid authorization dropdown option.',
          { status: 400 }
        );
      }
      setFieldValue('Dropdown6', alwWaitlist);
      setFieldValue('Facility Name', facilityName);
      setFieldValue('Facility Address', facilityAddress);
      setFieldValue('Facility Type', facilityType);
      setFieldValue('Text30', moveInDate);
      setFieldValue('Dropdown9', facilityVettedContracted);
      setFieldValue('Dropdown8', inAlwCounty);
      setFieldValue('Dropdown10', requestedTierTier);
      // Always check ALW Assessment for authorization section.
      setFieldValue('Check Box28', 'Yes');
      // Always check member financial responsibility checklist for authorization section.
      setFieldValue('Check Box12', 'Yes');
      // Explicitly uncheck reauthorization equivalents.
      setFieldValue('Check Box32', 'No');
      setFieldValue('Check Box5', 'No');
      // Always check room/board financial responsibility checklist.
      setFirstMatchingCheckField(['financial', 'responsibility'], true);
      setFirstMatchingCheckField(['room', 'board'], true);
    } else if (isReauthorization) {
      // Reauthorization page fields only.
      setFieldValue('Name', memberName);
      setFieldValue('MRN_2', memberMrn);
      setFieldValue('DOB MMDDYYY', memberDob);
      setFieldValue('Cell Phone Number_2', memberPhone);
      setFieldValue('Describe Members current living situation eg at home with caregiver in a nursing facility etc_2', livingSituation);
      setFieldValue('Assessment Date', assessmentDate);
      setFieldValue('First Last Name and Title', assessmentAdmin);
      setFieldValue('RN who reviewed the assessment', rnReviewer);
      setFieldValue('Dropdown31', regionNcalScal);
      setFieldValue('Dropdown17', memberCounty);
      setFieldValue('Dropdown18', atAlw);
      const reauthAlwSelected = setDropdownByPredicate(
        'Dropdown19',
        (opt) => (isAlwSubmittedYes ? opt === 'yes' : opt.includes('external providers') && opt.includes('completing alw application'))
      );
      if (!reauthAlwSelected) {
        return new NextResponse(
          'Could not map "Has the Member submitted an ALW application?" to a valid reauthorization dropdown option.',
          { status: 400 }
        );
      }
      setFieldValue('Dropdown20', alwWaitlist);
      setFieldValue('Facility Name_2', facilityName);
      setFieldValue('Street City Zip', facilityAddress);
      setFieldValue('Facility Type_2', facilityType);
      setFieldValue('eg RCFE ARF etcDate Member Moved Into Facility', moveInDate);
      // Keep a broad set of aliases to match varying PDF template field labels.
      setFieldValue('Change_of_Condition', changeOfCondition);
      setFieldValue('Change of Condition', changeOfCondition);
      setFieldValue('Has Member Had Change in Condition', changeOfCondition);
      setFieldValue('Has Member had change in condition', changeOfCondition);
      setFieldValue('Has member had change in condition', changeOfCondition);
      setFieldValue(
        'Has member had a change in condition since last ongoing care referral?',
        changeOfCondition
      );
      setFieldValue(
        'Has Member Had A Change In Condition Since Last Ongoing Care Referral?',
        changeOfCondition
      );
      setFieldValue(
        'Has member had a change in condition since last ongoing care referral',
        changeOfCondition
      );
      setFirstMatchingDropdownByTokens(
        ['change', 'condition', 'ongoing', 'referral'],
        (opt) => {
          if (changeOfConditionChoice === 'yes') {
            return (
              opt === 'yes' ||
              opt.includes('clinical reassessment') ||
              opt.includes('changes in condition')
            );
          }
          if (changeOfConditionChoice === 'no') {
            return (
              opt === 'no' ||
              opt.startsWith('no ') ||
              opt.includes('kp will reauthorize at current tier level') ||
              opt.includes('reauthorize at current tier level')
            );
          }
          return false;
        }
      );
      // Fallback: find the correct dropdown by its unique long option text,
      // independent of field name (template revisions often rename fields).
      setFirstDropdownByOptionMatch((opt) => {
        if (changeOfConditionChoice === 'yes') {
          return (
            opt.includes('clinical reassessment') &&
            opt.includes('changes in condition')
          );
        }
        if (changeOfConditionChoice === 'no') {
          return opt.includes('reauthorize at current tier level');
        }
        return false;
      });
      setFieldValue('Dropdown21', facilityVettedContracted);
      setFieldValue('Dropdown34', inAlwCounty);
      setFieldValue('Text3', roomBoardAmount);
      // Always check ALW Assessment for reauthorization section.
      setFieldValue('Check Box32', 'Yes');
      // Always check member financial responsibility checklist for reauthorization section.
      setFieldValue('Check Box5', 'Yes');
      // Explicitly uncheck authorization equivalents.
      setFieldValue('Check Box28', 'No');
      setFieldValue('Check Box12', 'No');
      // Always check room/board financial responsibility checklist.
      setFirstMatchingCheckField(['financial', 'responsibility'], true);
      setFirstMatchingCheckField(['room', 'board'], true);
    }

    form.updateFieldAppearances(font);
    // Persist filled values (especially dropdown selections) across PDF viewers/download flows.
    form.flatten();
    const pdfBytes = await pdfDoc.save();
    const memberMrnForFileName = clean(params.get('memberMrn'));
    let filename = buildOutputFileName(memberNameForFileName, memberMrnForFileName);

    let archivedPath = '';
    if (download) {
      if (!downloadLogId) {
        return new NextResponse('Download log id is required before downloading.', { status: 400 });
      }
      try {
        const logDoc = await adminDb.collection('kaiser_isp_cover_sheet_download_logs').doc(downloadLogId).get();
        const logData = logDoc.exists ? (logDoc.data() || {}) : {};
        const loggedDownloadName = clean(logData.downloadName);
        const loggedCreatedAt = clean(logData.createdAtIso);
        if (loggedDownloadName) {
          filename = `${sanitizeFileComponent(loggedDownloadName) || 'ISP Cover Sheet'}.pdf`;
        } else {
          filename = buildOutputFileName(memberNameForFileName, memberMrnForFileName, loggedCreatedAt || undefined);
        }

        const memberClientId = clean(params.get('memberClientId'));
        archivedPath = await archiveDownloadedPdf({
          pdfBytes,
          memberName: memberNameForFileName,
          memberClientId,
          coverPageType,
          downloadLogId,
        });
        await adminDb.collection('kaiser_isp_cover_sheet_download_logs').doc(downloadLogId).set(
          {
            archived: true,
            archivedAt: new Date().toISOString(),
            archivedStoragePath: archivedPath,
          },
          { merge: true }
        );
      } catch (archiveError) {
        console.error('Failed to archive downloaded Kaiser ISP form:', archiveError);
        return new NextResponse('Could not archive this downloaded form. Download aborted.', { status: 500 });
      }
    }

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'x-kaiser-isp-template-source': templateResult.source,
        ...(archivedPath ? { 'x-kaiser-isp-archive-path': archivedPath } : {}),
      },
    });
  } catch (error) {
    console.error('Kaiser ISP template generation failed:', error);
    return new NextResponse('Could not prepare Kaiser ISP cover sheet PDF for output.', { status: 500 });
  }
}

