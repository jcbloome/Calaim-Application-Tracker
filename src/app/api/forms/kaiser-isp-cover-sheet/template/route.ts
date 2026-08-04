import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import path from 'path';

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

function normalizePhone(value: string) {
  const raw = clean(value);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw;
}

function sanitizeFileComponent(value: string) {
  return clean(value)
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildOutputFileName(memberNameRaw: string) {
  const memberName = sanitizeFileComponent(memberNameRaw) || 'Member';
  return `${memberName} - Kaiser ISP Cover Sheet.pdf`;
}

function normalizeTruthText(value: string) {
  const raw = clean(value).toLowerCase();
  if (['1', 'y', 'yes', 'true', 'checked'].includes(raw)) return 'Yes';
  if (['0', 'n', 'no', 'false', 'unchecked'].includes(raw)) return 'No';
  return clean(value);
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

export async function GET(req: NextRequest) {
  const download = clean(req.nextUrl.searchParams.get('download')) === '1';
  const templateResult = await loadTemplatePdfBuffer(req);
  if (!templateResult.ok) {
    return new NextResponse(templateResult.error, { status: 500 });
  }

  try {
    const params = req.nextUrl.searchParams;
    const memberName = clean(params.get('memberName'));
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

    // Direct pass-through: if query key matches a PDF field name, fill it.
    params.forEach((rawValue, rawKey) => {
      const key = clean(rawKey);
      if (!key || key === 'download' || key === 'returnTo') return;
      setFieldValue(key, rawValue);
    });

    // Additional alias filling for common member fields.
    const aliases: Array<[string[], string]> = [
      [['Senior_Last_First_ID', 'Member_Name', 'Member Name'], memberName],
      [['Senior_First', 'Member_First_Name', 'First_Name'], clean(params.get('memberFirstName'))],
      [['Senior_Last', 'Member_Last_Name', 'Last_Name'], clean(params.get('memberLastName'))],
      [['MCP_CIN', 'Member_MRN', 'MRN', 'Member_MediCal_Number'], clean(params.get('memberMrn'))],
      [['Birth_Date', 'DOB', 'Date_of_Birth'], clean(params.get('memberDob'))],
      [['Member_Phone', 'Phone', 'Phone_Number'], normalizePhone(clean(params.get('memberPhone')))],
      [['Member_Email', 'Email', 'Email_Address'], clean(params.get('memberEmail')).toLowerCase()],
      [['Member_County', 'County'], clean(params.get('memberCounty'))],
      [['Client_ID2', 'Client ID2'], clean(params.get('memberClientId'))],
      [['At_ALW_Facility'], normalizeTruthText(clean(params.get('At_ALW_Facility')))],
      [['Did_Submit_ALW_Application'], normalizeTruthText(clean(params.get('Did_Submit_ALW_Application')))],
      [['On_ALW_Waitlist'], normalizeTruthText(clean(params.get('On_ALW_Waitlist')))],
      [['ISP_Cover_Page_Type', 'Cover_Page_Type'], clean(params.get('ispCoverPageType'))],
    ];

    aliases.forEach(([candidateNames, value]) => {
      if (!clean(value)) return;
      for (const fieldName of candidateNames) {
        const field = getFieldMaybe(fieldName);
        if (!field) continue;
        setFieldValue(fieldName, value);
        break;
      }
    });

    const coverPageType = clean(params.get('ispCoverPageType')).toLowerCase();
    if (coverPageType === 'authorization' || coverPageType === 'reauthorization') {
      const selectingReauth = coverPageType === 'reauthorization';
      // Best-effort: these names may vary by ISP template revision.
      setFirstMatchingCheckField(['authorization', 'cover'], !selectingReauth);
      setFirstMatchingCheckField(['reauthorization', 'cover'], selectingReauth);
      setFirstMatchingCheckField(['authorization', 'section'], !selectingReauth);
      setFirstMatchingCheckField(['reauthorization', 'section'], selectingReauth);
    }

    form.updateFieldAppearances(font);
    const pdfBytes = await pdfDoc.save();
    const filename = buildOutputFileName(memberName);

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'x-kaiser-isp-template-source': templateResult.source,
      },
    });
  } catch {
    return new NextResponse('Could not prepare Kaiser ISP cover sheet PDF for output.', { status: 500 });
  }
}

