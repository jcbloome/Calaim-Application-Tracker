import { NextRequest, NextResponse } from 'next/server';
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, StandardFonts, rgb } from 'pdf-lib';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  templateUrl?: string;
  templatePath?: string;
  preferLocalTemplate?: boolean;
  forceOverlay?: boolean;
  answers?: Record<string, string | string[]>;
};

const clean = (v: unknown, max = 4000) => String(v ?? '').trim().slice(0, max);
const cleanAscii = (v: unknown, max = 200) => clean(v, max).replace(/[^\x20-\x7E]/g, '?');

const normalize = (v: string) => clean(v, 500).toLowerCase().replace(/[^a-z0-9]+/g, '');

const baseKey = (key: string) => key.replace(/^p\d+_/, '');

const asString = (value: unknown) => clean(value, 3000);

const asArray = (value: unknown) => (Array.isArray(value) ? value.map((v) => clean(v, 300)).filter(Boolean) : []);

const toMmDdYyyy = (value: unknown) => {
  const raw = clean(value, 80);
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}-${iso[1]}`;
  const us = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (us) return `${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}-${us[3]}`;
  return raw;
};

const normalizeMemberName = (memberName: unknown, firstName: unknown, lastName: unknown) => {
  const first = clean(firstName, 120).replace(/\s+\d+$/, '').trim();
  const last = clean(lastName, 120).replace(/\s+\d+$/, '').trim();
  if (first || last) return `${first} ${last}`.trim();
  const full = clean(memberName, 220);
  if (!full) return '';
  if (full.includes(',')) {
    const [ln, fn] = full.split(',', 2).map((part) => clean(part, 120).replace(/\s+\d+$/, '').trim());
    return `${fn || ''} ${ln || ''}`.trim();
  }
  return full.replace(/\s+\d+$/, '').trim();
};

const buildKeyCandidates = (key: string) => {
  const raw = clean(key, 200);
  const base = baseKey(raw);
  const noUnderscore = base.replace(/_/g, '');
  return Array.from(
    new Set(
      [raw, base, noUnderscore, base.replace(/_/g, ' ')]
        .map((v) => normalize(v))
        .filter(Boolean)
    )
  );
};

const trySelectOptionValue = (options: string[], wanted: string) => {
  const wantedNorm = normalize(wanted);
  return options.find((opt) => normalize(opt) === wantedNorm || normalize(opt).includes(wantedNorm));
};

const isYesLike = (value: string) => /^(yes|y|true|1)$/i.test(clean(value, 40));

async function renderOverlayPdf(templateBuffer: ArrayBuffer, answers: Record<string, string | string[]>) {
  const pdfDoc = await PDFDocument.load(templateBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const put = (
    pageIdx1: number,
    x: number,
    y: number,
    value: unknown,
    size = 8,
    isBold = false,
    maxWidth = 220
  ) => {
    const page = pages[pageIdx1 - 1];
    if (!page) return;
    const text = clean(value, 500);
    if (!text) return;
    page.drawText(text, {
      x,
      y,
      size,
      font: isBold ? bold : font,
      color: rgb(0.06, 0.09, 0.14),
      maxWidth,
      lineHeight: size + 1,
    });
  };

  const markYesNo = (pageIdx1: number, yesX: number, noX: number, y: number, value: unknown) => {
    const page = pages[pageIdx1 - 1];
    if (!page) return;
    const yes = isYesLike(clean(value, 20));
    page.drawText('X', { x: yes ? yesX : noX, y, size: 8, font: bold, color: rgb(0.06, 0.09, 0.14) });
  };

  // Page 1 (header + demographic)
  put(1, 70, 745, answers.p1_agency || '');
  put(1, 255, 745, answers.p1_assessment_date || '');
  put(1, 475, 745, answers.p1_plan_id || '');
  put(1, 70, 710, answers.p1_member_name || '');
  put(1, 255, 710, answers.p1_assessor_name || '');
  put(1, 475, 710, answers.p1_referral_date || '');
  put(1, 70, 664, answers.p1_other_responder_relationship || '');
  put(1, 475, 682, answers.p1_other_responder_name || '');
  markYesNo(1, 86, 250, 682, answers.p1_other_responder || '');
  put(1, 70, 628, answers.p1_first_name || '');
  put(1, 255, 628, answers.p1_middle_name || '');
  put(1, 70, 592, answers.p1_last_name || '');
  put(1, 255, 592, answers.p1_mrn || '');
  put(1, 70, 555, answers.p1_phone || '');
  put(1, 255, 555, answers.p1_dob || '');
  put(1, 70, 518, answers.p1_sex || '');
  put(1, 70, 483, answers.p1_race_other || '');
  put(1, 255, 483, answers.p1_ethnicity || '');
  markYesNo(1, 86, 250, 445, answers.p1_ethnicity_hispanic || '');
  put(1, 70, 410, answers.p1_ethnicity_other || '');
  put(1, 255, 410, answers.p1_primary_language || '');

  // Page 2 (addresses/site/risk section shown in user screenshots)
  put(2, 70, 665, answers.p2_current_street || '', 8, false, 360);
  put(2, 360, 665, answers.p2_current_city || '', 8, false, 140);
  put(2, 70, 628, answers.p2_current_state || '', 8, false, 130);
  put(2, 360, 628, answers.p2_current_zip || '', 8, false, 120);
  put(2, 660, 592, answers.p2_current_type_other || '', 8, false, 130);
  put(2, 200, 555, answers.p2_facility_name || '', 8, false, 300);

  // Section 4: Home Address
  put(2, 200, 518, answers.p2_home_street || '', 8, false, 500);
  put(2, 200, 481, answers.p2_home_city || '', 8, false, 140);
  put(2, 430, 481, answers.p2_home_state || '', 8, false, 140);
  put(2, 610, 481, answers.p2_home_zip || '', 8, false, 120);

  // Section 5: Mailing Address
  put(2, 200, 444, answers.p2_mail_street || '', 8, false, 500);
  put(2, 200, 407, answers.p2_mail_city || '', 8, false, 140);
  put(2, 430, 407, answers.p2_mail_state || '', 8, false, 140);
  put(2, 610, 407, answers.p2_mail_zip || '', 8, false, 120);

  // Section 6: Assessment site (other)
  put(2, 660, 333, answers.p2_assessment_site_other || '', 8, false, 130);
  put(2, 70, 296, answers.p2_alwp_agency || '');
  put(2, 70, 260, answers.p2_previous_placement_explain || '');

  markYesNo(2, 86, 251, 333, answers.p2_imminent_nursing_home_risk || '');
  markYesNo(2, 330, 494, 333, answers.p2_alwp_waitlist || '');
  markYesNo(2, 330, 494, 296, answers.p2_previous_unsuccessful_placements || '');
  markYesNo(2, 86, 251, 223, answers.p2_primary_caregiver || '');

  const overlaid = await pdfDoc.save();
  return Buffer.from(overlaid);
}

async function resolveTemplateUrlFromRecentAlftSubmissions() {
  try {
    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const snap = await adminDb.collection('standalone_upload_submissions').orderBy('createdAt', 'desc').limit(200).get();
    for (const doc of snap.docs) {
      const row = (doc.data() || {}) as Record<string, any>;
      const docType = clean(row?.documentType, 160).toLowerCase();
      const source = clean(row?.source, 120).toLowerCase();
      const looksAlft = docType.includes('alft') || source.includes('alft');
      if (!looksAlft) continue;

      const explicit = clean(row?.officialPdfTemplateUrl, 2000);
      if (explicit && /^https?:\/\//i.test(explicit)) return explicit;

      const files = Array.isArray(row?.files) ? row.files : [];
      const pdfFile = files.find((f: any) => {
        const name = clean(f?.fileName, 220);
        const url = clean(f?.downloadURL, 2200);
        return Boolean(url) && (/\.pdf(\?|$)/i.test(name) || /\.pdf(\?|$)/i.test(url));
      });
      const fileUrl = clean(pdfFile?.downloadURL, 2200);
      if (fileUrl && /^https?:\/\//i.test(fileUrl)) return fileUrl;
    }
  } catch {
    // no-op
  }
  return '';
}

async function resolveTemplatePathFromLocalWorkspace(): Promise<string> {
  const explicitEnvPath = clean(process.env.ALFT_TEMPLATE_PATH, 2000);
  if (explicitEnvPath) {
    try {
      await fs.access(explicitEnvPath);
      return explicitEnvPath;
    } catch {
      // Continue to discovery fallbacks.
    }
  }

  const knownLegacyPath = clean(
    'C:/ConnectionsILOS/ALFT_Agreement.pdf',
    2000
  );
  if (knownLegacyPath) {
    try {
      await fs.access(knownLegacyPath);
      return knownLegacyPath;
    } catch {
      // Continue to discovery fallbacks.
    }
  }

  const appData = clean(process.env.APPDATA, 1000);
  if (!appData) return '';
  const workspaceStorageRoot = path.join(appData, 'Cursor', 'User', 'workspaceStorage');

  let workspaceDirs: string[] = [];
  try {
    const entries = await fs.readdir(workspaceStorageRoot, { withFileTypes: true });
    workspaceDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return '';
  }

  let newestPath = '';
  let newestMs = 0;

  for (const wsDir of workspaceDirs) {
    const pdfsRoot = path.join(workspaceStorageRoot, wsDir, 'pdfs');
    let pdfBuckets: string[] = [];
    try {
      const entries = await fs.readdir(pdfsRoot, { withFileTypes: true });
      pdfBuckets = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
      continue;
    }

    for (const bucket of pdfBuckets) {
      const bucketPath = path.join(pdfsRoot, bucket);
      let files: string[] = [];
      try {
        const entries = await fs.readdir(bucketPath, { withFileTypes: true });
        files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
      } catch {
        continue;
      }

      for (const fileName of files) {
        const lower = fileName.toLowerCase();
        if (!lower.endsWith('.pdf')) continue;
        if (!lower.includes('alft')) continue;
        const filePath = path.join(bucketPath, fileName);
        try {
          const stat = await fs.stat(filePath);
          const mtime = Number(stat.mtimeMs || 0);
          if (mtime > newestMs) {
            newestMs = mtime;
            newestPath = filePath;
          }
        } catch {
          // Ignore individual stat failures.
        }
      }
    }
  }

  return newestPath;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const requestedTemplateUrl = clean(body?.templateUrl, 2000);
    const requestedTemplatePath = clean(body?.templatePath, 2000);
    const preferLocalTemplate = Boolean(body?.preferLocalTemplate);
    let templateUrl = '';
    let discoveredTemplatePath = '';
    if (preferLocalTemplate) {
      discoveredTemplatePath = requestedTemplatePath || (await resolveTemplatePathFromLocalWorkspace());
      templateUrl = requestedTemplateUrl || (!discoveredTemplatePath ? await resolveTemplateUrlFromRecentAlftSubmissions() : '');
    } else {
      templateUrl = requestedTemplateUrl || (await resolveTemplateUrlFromRecentAlftSubmissions());
      discoveredTemplatePath = requestedTemplatePath || (!templateUrl ? await resolveTemplatePathFromLocalWorkspace() : '');
    }
    const answers = (body?.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<string, string | string[]>;
    const normalizedAnswers: Record<string, string | string[]> = {
      ...answers,
      p1_assessment_date: toMmDdYyyy(answers.p1_assessment_date),
      p1_dob: toMmDdYyyy(answers.p1_dob),
      p1_member_name: normalizeMemberName(answers.p1_member_name, answers.p1_first_name, answers.p1_last_name),
    };
    const normalizedMrn = clean(normalizedAnswers.p1_mrn, 80);
    if (normalizedMrn) normalizedAnswers.p1_plan_id = normalizedMrn;

    if (!discoveredTemplatePath && !templateUrl) {
      return NextResponse.json(
        { success: false, error: 'No ALFT template PDF could be resolved from recent ALFT submissions.' },
        { status: 404 }
      );
    }
    let templateBuffer: ArrayBuffer;
    if (discoveredTemplatePath) {
      try {
        const bytes = await fs.readFile(discoveredTemplatePath);
        templateBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      } catch (e: any) {
        if (!templateUrl) {
          return NextResponse.json(
            { success: false, error: `Could not read templatePath: ${e?.message || 'read failed'}` },
            { status: 400 }
          );
        }
        const templateRes = await fetch(templateUrl);
        if (!templateRes.ok) {
          return NextResponse.json(
            { success: false, error: `Could not read templatePath and could not fetch templateUrl (HTTP ${templateRes.status})` },
            { status: 400 }
          );
        }
        templateBuffer = await templateRes.arrayBuffer();
      }
    } else {
      if (!/^https?:\/\//i.test(templateUrl)) {
        return NextResponse.json({ success: false, error: 'templateUrl must be an http(s) URL' }, { status: 400 });
      }
      const templateRes = await fetch(templateUrl);
      if (!templateRes.ok) {
        return NextResponse.json(
          { success: false, error: `Could not fetch template PDF (HTTP ${templateRes.status})` },
          { status: 400 }
        );
      }
      templateBuffer = await templateRes.arrayBuffer();
    }

    const originalPdfBytes = Buffer.from(templateBuffer);
    if (Boolean(body?.forceOverlay)) {
      const forced = await renderOverlayPdf(templateBuffer, normalizedAnswers);
      return new NextResponse(forced, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
          'x-alft-template-fill-mode': 'overlay-forced',
        },
      });
    }
    const pdfDoc = await PDFDocument.load(templateBuffer);
    let form: ReturnType<PDFDocument['getForm']>;
    try {
      form = pdfDoc.getForm();
    } catch {
      return new NextResponse(originalPdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
          'x-alft-template-fill-mode': 'passthrough-no-form',
        },
      });
    }
    const fields = form.getFields();

    const byNormalizedName = new Map<string, (typeof fields)[number]>();
    fields.forEach((field) => {
      try {
        byNormalizedName.set(normalize(field.getName()), field);
      } catch {
        // ignore malformed field entries
      }
    });

    const explicitAlftFieldMap: Record<string, string> = {
      p1_agency: 'Text Field 3',
      p1_assessment_date: 'Date Field 1',
      p1_plan_id: 'Text Field 4',
      p1_member_name: 'Text Field 5',
      p1_assessor_name: 'Text Field 6',
      p1_referral_date: 'Date Field 2',
      p1_other_responder_name: 'Text Field 1',
      p1_other_responder_relationship: 'Text Field 2',
      p1_first_name: 'Text Field 8',
      p1_middle_name: 'Text Field 9',
      p1_last_name: 'Text Field 10',
      p1_mrn: 'Text Field 11',
      p1_phone: 'Text Field 162',
      p1_dob: 'Date Field 3',
      p1_sex: 'Text Field 12',
      p1_race_other: 'Text Field 13',
      p1_ethnicity: 'Text Field 14',
      p1_ethnicity_other: 'Text Field 15',
      p1_primary_language: 'Text Field 16',
      p2_current_street: 'Text Field 17',
      p2_current_city: 'Text Field 19',
      p2_current_state: 'Text Field 20',
      p2_current_zip: 'Text Field 132',
      p2_current_type_other: 'Text Field 21',
      p2_facility_name: 'Text Field 22',
      p2_home_street: 'Text Field 23',
      p2_home_city: 'Text Field 24',
      p2_home_state: 'Text Field 25',
      p2_home_zip: 'Text Field 133',
      p2_mail_street: 'Text Field 26',
      p2_mail_city: 'Text Field 28',
      p2_mail_state: 'Text Field 27',
      p2_mail_zip: 'Text Field 134',
      p2_assessment_site_other: 'Text Field 29',
      p2_alwp_agency: 'Text Field 31',
      p2_previous_placement_explain: 'Text Field 30',
    };
    const explicitlyHandledKeys = new Set<string>();

    Object.entries(explicitAlftFieldMap).forEach(([key, fieldName]) => {
      const rawValue = normalizedAnswers[key];
      const stringValue = asString(rawValue);
      if (!stringValue) return;
      const field = fields.find((f) => {
        try {
          return f.getName() === fieldName;
        } catch {
          return false;
        }
      });
      if (!field) return;
      try {
        if (field instanceof PDFTextField) {
          field.setText(stringValue);
          explicitlyHandledKeys.add(key);
        }
      } catch {
        // ignore explicit mapping failures and continue with generic mapping
      }
    });

    const explicitAlftCheckboxMap: Record<string, Record<string, string>> = {
      p1_purpose: {
        initial: 'Checkbox 1',
        change_condition: 'Checkbox 2',
        review: 'Checkbox 3',
      },
      p1_other_responder: {
        no: 'Checkbox 4',
        yes: 'Checkbox 5',
      },
      p1_ethnicity_hispanic: {
        yes: 'Checkbox 12',
        no: 'Checkbox 13',
      },
    };
    Object.entries(explicitAlftCheckboxMap).forEach(([key, optionMap]) => {
      const raw = clean(normalizedAnswers[key], 80).toLowerCase();
      if (!raw) return;
      const selectedFieldName = optionMap[raw];
      if (!selectedFieldName) return;
      Object.values(optionMap).forEach((fieldName) => {
        const field = fields.find((f) => {
          try {
            return f.getName() === fieldName;
          } catch {
            return false;
          }
        });
        if (!(field instanceof PDFCheckBox)) return;
        try {
          if (fieldName === selectedFieldName) field.check();
          else field.uncheck();
        } catch {
          // ignore checkbox mapping failures
        }
      });
      explicitlyHandledKeys.add(key);
    });

    Object.entries(normalizedAnswers).forEach(([key, rawValue]) => {
      if (explicitlyHandledKeys.has(key)) return;
      const candidates = buildKeyCandidates(key);
      if (!candidates.length) return;
      const field =
        candidates
          .map((c) => byNormalizedName.get(c))
          .find(Boolean) ||
        fields.find((f) => {
          const n = normalize(f.getName());
          return candidates.some((c) => n.includes(c));
        });
      if (!field) return;

      const stringValue = asString(rawValue);
      const arrayValue = asArray(rawValue);

      try {
        if (field instanceof PDFTextField) {
          if (arrayValue.length) field.setText(arrayValue.join(', '));
          else field.setText(stringValue);
          return;
        }

        if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
          const wanted = arrayValue[0] || stringValue;
          if (!wanted) return;
          const selected = trySelectOptionValue(field.getOptions(), wanted);
          if (selected) field.select(selected);
          return;
        }

        if (field instanceof PDFRadioGroup) {
          const wanted = arrayValue[0] || stringValue;
          if (!wanted) return;
          const selected = trySelectOptionValue(field.getOptions(), wanted);
          if (selected) field.select(selected);
          return;
        }

        if (field instanceof PDFCheckBox) {
          const boolLike = /^(true|yes|y|1|checked)$/i.test(stringValue);
          if (boolLike || arrayValue.length > 0 || stringValue.length > 0) field.check();
          else field.uncheck();
        }
      } catch {
        // Ignore individual field mapping failures for best-effort fill.
      }
    });

    // Some legacy ALFT PDFs contain malformed widget dictionaries that can throw
    // during appearance regeneration. We intentionally skip updateFieldAppearances
    // and rely on existing field appearances for preview stability.

    let out: Uint8Array;
    try {
      out = await pdfDoc.save();
    } catch {
      try {
        // Some malformed legacy PDFs save more reliably with object streams disabled.
        out = await pdfDoc.save({ useObjectStreams: false });
      } catch {
        try {
          const overlaid = await renderOverlayPdf(templateBuffer, normalizedAnswers);
          return new NextResponse(overlaid, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Cache-Control': 'no-store',
              'x-alft-template-fill-mode': 'overlay-fallback',
            },
          });
        } catch (overlayErr: any) {
          const overlayMsg = cleanAscii(overlayErr?.message || 'overlay-failed', 120);
          return new NextResponse(originalPdfBytes, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Cache-Control': 'no-store',
              'x-alft-template-fill-mode': 'passthrough-save-error',
              'x-alft-template-fill-overlay-error': overlayMsg,
            },
          });
        }
      }
    }
    return new NextResponse(Buffer.from(out), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
        'x-alft-template-fill-mode': 'filled',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Failed to fill ALFT template' }, { status: 500 });
  }
}

