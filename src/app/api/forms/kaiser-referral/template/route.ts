import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import path from 'path';
import { adminDb, adminStorage } from '@/firebase-admin';
import { KAISER_REFERRAL_TEMPLATE_SETTINGS_DOC } from '@/lib/kaiser-referral-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Prefer the committed Jan 2026 Chronic Conditions referral form; avoid machine-local Cursor PDF paths. */
const DEFAULT_TEMPLATE_PATH = '';
const DEFAULT_TEMPLATE_URL = '';
const PUBLIC_TEMPLATE_CANDIDATE_PATHS = [
  '/Templates/Kaiser%20Referral%20Form.pdf',
  '/Templates/Kaiser%20Referral%20Form%20Jan%202026.pdf',
  '/templates/Kaiser%20Referral%20Form.pdf',
];
const PUBLIC_TEMPLATE_CANDIDATE_FILES = [
  path.join(process.cwd(), 'public', 'Templates', 'Kaiser Referral Form.pdf'),
  path.join(process.cwd(), 'public', 'Templates', 'Kaiser Referral Form Jan 2026.pdf'),
  path.join(process.cwd(), 'public', 'templates', 'Kaiser Referral Form.pdf'),
];
const DEFAULT_REFERRER_NAME = 'jason@carehomefinders.com';
const DEFAULT_REFERRER_ORGANIZATION = 'Connections Care Home Consultants, LLC';
const DEFAULT_REFERRER_NPI = '1508537325';
const DEFAULT_REFERRER_ADDRESS = '1763 East Sandalwood Drive, Palm Springs, CA 92262';
const DEFAULT_REFERRER_EMAIL = 'jason@carehomefinders.com';
const DEFAULT_REFERRER_PHONE = '800-330-5993';
const DEFAULT_REFERRER_RELATIONSHIP = 'Community Support (CalAIM)';

function getTemplatePath() {
  return String(process.env.KAISER_REFERRAL_TEMPLATE_PATH || DEFAULT_TEMPLATE_PATH).trim();
}

function getTemplateUrl() {
  return String(process.env.KAISER_REFERRAL_TEMPLATE_URL || DEFAULT_TEMPLATE_URL).trim();
}

function clean(value: string | null) {
  return String(value || '').trim();
}

function asDisplayDate(value: string | null) {
  const v = clean(value);
  if (!v) return '';
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const isoWithTime = v.match(/^(\d{4})-(\d{2})-(\d{2})T.*$/);
  if (isoWithTime) return `${isoWithTime[2]}/${isoWithTime[3]}/${isoWithTime[1]}`;
  return v;
}

function normalizePhone(value: string | null) {
  const raw = clean(value);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function normalizeAddress(value: string | null) {
  return clean(value).replace(/\s+/g, ' ');
}

function sanitizeFileComponent(value: string) {
  return clean(value)
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildKaiserReferralFileName(memberNameRaw: string, generatedAt: Date = new Date()) {
  const memberName = sanitizeFileComponent(memberNameRaw) || 'Member';
  const label = 'Kaiser Authorization Request';
  const month = String(generatedAt.getMonth() + 1).padStart(2, '0');
  const day = String(generatedAt.getDate()).padStart(2, '0');
  const year = generatedAt.getFullYear();
  const generatedDate = `${month}-${day}-${year}`;
  return `${memberName} - ${label} - ${generatedDate}.pdf`;
}

async function resolveTemplateUrlFromRecentKaiserSubmissions(): Promise<string> {
  try {
    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const snap = await adminDb.collection('standalone_upload_submissions').orderBy('createdAt', 'desc').limit(250).get();
    for (const doc of snap.docs) {
      const row = (doc.data() || {}) as Record<string, any>;
      const docType = String(row?.documentType || '').trim().toLowerCase();
      const source = String(row?.source || '').trim().toLowerCase();
      const title = String(row?.title || row?.name || '').trim().toLowerCase();
      const looksKaiser = docType.includes('kaiser') || source.includes('kaiser') || title.includes('kaiser');
      if (!looksKaiser) continue;

      const files = Array.isArray(row?.files) ? row.files : [];
      for (const file of files) {
        const url = String(file?.downloadURL || '').trim();
        const name = String(file?.fileName || '').trim().toLowerCase();
        if (!url) continue;
        if (!/\.pdf(\?|$)/i.test(url) && !/\.pdf(\?|$)/i.test(name)) continue;
        const looksAuthSheet =
          name.includes('kaiser') ||
          name.includes('auth') ||
          name.includes('authorization') ||
          name.includes('referral');
        if (looksAuthSheet) return url;
      }
    }
  } catch {
    // best-effort discovery only
  }
  return '';
}

async function loadActiveUploadedTemplate() {
  try {
    const settingsSnap = await adminDb
      .collection(KAISER_REFERRAL_TEMPLATE_SETTINGS_DOC.collection)
      .doc(KAISER_REFERRAL_TEMPLATE_SETTINGS_DOC.id)
      .get();
    const storagePath = clean(String(settingsSnap.data()?.activeStoragePath || ''));
    if (!storagePath) return null;
    const [bytes] = await adminStorage.bucket().file(storagePath).download();
    return bytes?.length ? { buffer: bytes, source: `uploaded:${storagePath}` } : null;
  } catch (error) {
    console.warn('[kaiser-referral/template] active uploaded template unavailable; using fallback', error);
    return null;
  }
}

async function loadTemplatePdfBuffer(req: NextRequest) {
  const uploaded = await loadActiveUploadedTemplate();
  if (uploaded) return { ok: true as const, ...uploaded };

  const templatePath = getTemplatePath();
  const envTemplateUrl = getTemplateUrl();

  // Prefer repo / public built-in over a machine-local Cursor path that only exists on one PC.
  for (const candidateFile of PUBLIC_TEMPLATE_CANDIDATE_FILES) {
    try {
      const bytes = await fs.readFile(candidateFile);
      if (bytes?.length) {
        return { ok: true as const, buffer: bytes, source: `public-file:${candidateFile}` };
      }
    } catch {
      // keep trying
    }
  }

  if (templatePath) {
    try {
      const bytes = await fs.readFile(templatePath);
      return { ok: true as const, buffer: bytes, source: `path:${templatePath}` };
    } catch {
      // Continue to URL fallbacks.
    }
  }

  const discoveredUrl = envTemplateUrl || (await resolveTemplateUrlFromRecentKaiserSubmissions());
  if (discoveredUrl && /^https?:\/\//i.test(discoveredUrl)) {
    try {
      const res = await fetch(discoveredUrl, { cache: 'no-store' });
      if (res.ok) {
        const arr = await res.arrayBuffer();
        return { ok: true as const, buffer: Buffer.from(arr), source: `url:${discoveredUrl}` };
      }
      return {
        ok: false as const,
        error: `Template URL responded HTTP ${res.status}: ${discoveredUrl}`,
      };
    } catch (e: any) {
      return {
        ok: false as const,
        error: `Template URL fetch failed: ${String(e?.message || discoveredUrl)}`,
      };
    }
  }

  // Repo-hosted fallback for published environments:
  // if the template PDF is committed under /public/Templates, use it directly from this app origin.
  const origin = String(req.nextUrl.origin || '').trim();
  if (origin) {
    for (const candidatePath of PUBLIC_TEMPLATE_CANDIDATE_PATHS) {
      const candidateUrl = `${origin}${candidatePath}`;
      try {
        const res = await fetch(candidateUrl, { cache: 'no-store' });
        if (!res.ok) continue;
        const contentType = String(res.headers.get('content-type') || '').toLowerCase();
        if (contentType && !contentType.includes('pdf')) continue;
        const arr = await res.arrayBuffer();
        if (!arr.byteLength) continue;
        return { ok: true as const, buffer: Buffer.from(arr), source: `public:${candidateUrl}` };
      } catch {
        // keep trying candidate paths
      }
    }
  }

  return {
    ok: false as const,
    error:
      'Kaiser template PDF not found. Configure KAISER_REFERRAL_TEMPLATE_URL (preferred for published), or KAISER_REFERRAL_TEMPLATE_PATH for local, or commit template to /public/Templates.',
  };
}

type TextFieldLike = { setText: (value: string) => void };
type CheckFieldLike = { check: () => void; uncheck: () => void };
type RadioFieldLike = { getOptions: () => string[]; select: (value: string) => void };
type MultiWidgetChoiceField = {
  acroField: {
    getWidgets: () => Array<{ getOnValue: () => unknown }>;
    setValue: (value: unknown) => void;
  };
};

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

function isMultiWidgetChoiceField(field: unknown): field is MultiWidgetChoiceField {
  const candidate = field as MultiWidgetChoiceField | undefined;
  return Boolean(
    candidate &&
      candidate.acroField &&
      typeof candidate.acroField.getWidgets === 'function' &&
      typeof candidate.acroField.setValue === 'function'
  );
}

export async function GET(req: NextRequest) {
  const download = String(req.nextUrl.searchParams.get('download') || '') === '1';
  const templateResult = await loadTemplatePdfBuffer(req);
  if (!templateResult.ok) {
    return new NextResponse(templateResult.error, { status: 500 });
  }

  try {
    const rawPdfBuffer = templateResult.buffer;
    const params = req.nextUrl.searchParams;

    const prefill = {
      referralDate: asDisplayDate(params.get('referralDate')),
      referrerName: clean(params.get('referrerName')) || DEFAULT_REFERRER_NAME,
      referrerEmail: (clean(params.get('referrerEmail')) || DEFAULT_REFERRER_EMAIL).toLowerCase(),
      referrerPhone: normalizePhone(clean(params.get('referrerPhone')) || DEFAULT_REFERRER_PHONE),
      referrerOrganization: clean(params.get('referrerOrganization')) || DEFAULT_REFERRER_ORGANIZATION,
      referrerNpi: clean(params.get('referrerNpi')) || DEFAULT_REFERRER_NPI,
      referrerAddress: normalizeAddress(clean(params.get('referrerAddress')) || DEFAULT_REFERRER_ADDRESS),
      referrerRelationship: clean(params.get('referrerRelationship')) || DEFAULT_REFERRER_RELATIONSHIP,
      memberName: clean(params.get('memberName')),
      memberDob: asDisplayDate(params.get('memberDob')),
      memberPhone: normalizePhone(params.get('memberPhone')),
      memberAddress: normalizeAddress(params.get('memberAddress')),
      memberMrn: clean(params.get('memberMrn')) || clean(params.get('memberMediCal')),
      caregiverName: clean(params.get('caregiverName')),
      caregiverContact: clean(params.get('caregiverContact')),
      healthPlan: clean(params.get('healthPlan')).toLowerCase(),
      currentLocationName: clean(params.get('currentLocationName')),
      currentLocationAddress: normalizeAddress(params.get('currentLocationAddress')),
      alft22CurrentCost: clean(params.get('alft22CurrentCost')),
      alftTransitionsComments: clean(params.get('alftTransitionsComments')),
      alft21Choice: clean(params.get('alft21Choice')).toUpperCase(),
      alft22Choice: clean(params.get('alft22Choice')).toUpperCase(),
      section1AlfUsage: clean(params.get('section1AlfUsage')).toLowerCase(),
      section1Usage: clean(params.get('section1Usage')).toLowerCase(),
      ecmProviderName: clean(params.get('ecmProviderName')),
      ecmProviderContact: clean(params.get('ecmProviderContact')),
      respite11Choice: clean(params.get('respite11Choice')).toUpperCase(),
      respiteComments: clean(params.get('respiteComments')),
      respite11Subsets: clean(params.get('respite11Subsets')).toLowerCase(),
    };

    const hasPrefillValues = Object.values(prefill).some(Boolean);

    let pdfBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(rawPdfBuffer);
    if (hasPrefillValues) {
      const pdfDoc = await PDFDocument.load(rawPdfBuffer);
      const form = pdfDoc.getForm();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const formAny = form as { getFieldMaybe?: (name: string) => unknown; getField: (name: string) => unknown };
      const getFieldMaybe = (name: string): unknown => {
        if (!name) return null;
        try {
          if (typeof formAny.getFieldMaybe === 'function') return formAny.getFieldMaybe(name);
          return form.getField(name);
        } catch {
          return null;
        }
      };

      const setText = (name: string, value: string) => {
        if (!value) return;
        try {
          const field: unknown = getFieldMaybe(name);
          if (isTextFieldLike(field)) {
            field.setText(value);
            return;
          }
          const tokens = name.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
          if (!tokens.length) return;
          for (const candidate of form.getFields()) {
            const fieldName = String(candidate.getName() || '').toLowerCase();
            if (!tokens.every((token) => fieldName.includes(token))) continue;
            if (isTextFieldLike(candidate)) {
              candidate.setText(value);
              return;
            }
          }
        } catch {
          // ignore unmapped fields
        }
      };

      const setChecked = (name: string, checked: boolean) => {
        try {
          const field: unknown = getFieldMaybe(name);
          if (!isCheckFieldLike(field)) return;
          if (checked) field.check();
          if (!checked) field.uncheck();
        } catch {
          // ignore unmapped fields
        }
      };

      const selectRadio = (name: string, wantYes: boolean) => {
        try {
          const field: unknown = getFieldMaybe(name);
          if (!isRadioFieldLike(field)) return;
          const options: string[] = field.getOptions();
          if (!Array.isArray(options) || options.length === 0) return;
          const preferred = options.find((opt) =>
            wantYes ? /yes/i.test(String(opt)) : /no/i.test(String(opt))
          );
          field.select(preferred || options[0]);
        } catch {
          // ignore unmapped fields
        }
      };

      const selectWidgetOptionByIndex = (name: string, index: number) => {
        try {
          const field: unknown = getFieldMaybe(name);
          if (isRadioFieldLike(field)) {
            const options = field.getOptions();
            if (!Array.isArray(options) || options.length === 0) return;
            const safeIndex = Math.max(0, Math.min(index, options.length - 1));
            field.select(options[safeIndex]);
            return;
          }
          if (isMultiWidgetChoiceField(field)) {
            const widgets = field.acroField.getWidgets();
            if (!Array.isArray(widgets) || widgets.length === 0) return;
            const safeIndex = Math.max(0, Math.min(index, widgets.length - 1));
            const onValue = widgets[safeIndex]?.getOnValue?.();
            if (!onValue) return;
            try {
              field.acroField.setValue(onValue);
              return;
            } catch {
              // Some grouped checkbox fields (ex: ALF 2.2) reject setValue(onValue).
              // Force parent value + widget appearance state to keep deterministic selection.
              const parentDict = (field as { acroField?: { dict?: { set: (key: unknown, value: unknown) => void } } })
                ?.acroField?.dict;
              parentDict?.set(PDFName.of('V'), onValue);
              widgets.forEach((widget, idx) => {
                (
                  widget as { dict?: { set: (key: unknown, value: unknown) => void } }
                ).dict?.set(PDFName.of('AS'), idx === safeIndex ? onValue : PDFName.of('Off'));
              });
            }
          }
        } catch {
          // ignore unmapped fields
        }
      };

      const setFirstMatchingCheckField = (tokens: string[], checked: boolean) => {
        const loweredTokens = tokens.map((t) => t.toLowerCase());
        for (const candidate of form.getFields()) {
          const fieldName = String(candidate.getName() || '');
          const loweredName = fieldName.toLowerCase();
          if (!loweredTokens.every((token) => loweredName.includes(token))) continue;
          if (!isCheckFieldLike(candidate)) continue;
          if (checked) candidate.check();
          else candidate.uncheck();
          return true;
        }
        return false;
      };

      const selectCheckWidgetByIndex = (name: string, index: number) => {
        type WidgetLike = {
          getOnValue?: () => unknown;
          dict?: { set: (key: unknown, value: unknown) => void };
        };
        type FieldLike = {
          acroField?: {
            getWidgets?: () => WidgetLike[];
            setValue?: (value: unknown) => void;
            dict?: { set: (key: unknown, value: unknown) => void };
          };
        };
        try {
          const field = getFieldMaybe(name) as FieldLike | undefined;
          const widgets = field?.acroField?.getWidgets?.();
          if (!Array.isArray(widgets) || widgets.length === 0) return false;
          const safeIndex = Math.max(0, Math.min(index, widgets.length - 1));
          const onValue = widgets[safeIndex]?.getOnValue?.();
          if (!onValue || typeof field?.acroField?.setValue !== 'function') return false;
          // Some Kaiser template check-groups reject setValue(onValue) even when widget values differ.
          // Set parent value + widget appearances directly to ensure deterministic selection.
          field.acroField.dict?.set(PDFName.of('V'), onValue);
          widgets.forEach((widget, idx: number) => {
            widget.dict?.set(PDFName.of('AS'), idx === safeIndex ? onValue : PDFName.of('Off'));
          });
          return true;
        } catch {
          return false;
        }
      };

      const setTextAny = (names: string[], value: string) => {
        for (const name of names) setText(name, value);
      };
      const setCheckedAny = (names: string[], checked: boolean) => {
        for (const name of names) setChecked(name, checked);
      };
      const selectWidgetAny = (names: string[], index: number) => {
        for (const name of names) {
          const before = getFieldMaybe(name);
          if (!before) continue;
          selectWidgetOptionByIndex(name, index);
          return;
        }
      };
      const selectCheckWidgetAny = (names: string[], index: number) => {
        for (const name of names) {
          if (selectCheckWidgetByIndex(name, index)) return true;
        }
        return false;
      };

      setTextAny(['Date of Referral'], prefill.referralDate);
      setTextAny(['Referrer Name'], prefill.referrerName);
      setTextAny(['Referrer Email'], prefill.referrerEmail);
      setTextAny(['Referrer Phone Number'], prefill.referrerPhone);
      setTextAny(['Referring Organization Name'], prefill.referrerOrganization);
      setTextAny(['Referring Organization National Provider Identifie'], prefill.referrerNpi);
      setTextAny(['ReferrerReferring Organization Address Street City'], prefill.referrerAddress);
      setTextAny(['Referrer Relationship - Other'], prefill.referrerRelationship);
      setTextAny(['External referral by - Other', 'External referral - Other'], 'Community Support (CalAim)');

      setTextAny(['Member Name First Name Middle Initial Last Name'], prefill.memberName);
      setTextAny(['Member Date of Birth'], prefill.memberDob);
      setTextAny(['Member Phone Number'], prefill.memberPhone);
      setTextAny(['Member Mailing Address Street City State Zip Code'], prefill.memberAddress);
      setTextAny(['Members Kaiser Permanente MRN or MediCal CIN if MR'], prefill.memberMrn);
      setTextAny(['CaregiverSupport Person Name'], prefill.caregiverName);
      setTextAny(['CaregiverSupport Person Contact EmailPhone Number'], prefill.caregiverContact);

      selectRadio('Is the person being referred a Kaiser Permanente K', prefill.healthPlan.includes('kaiser'));
      const alft21Index = 0; // Always A (Time-Limited). B reserved for future H2022 reauth.
      // Jan 2026 form: `2.1` / `2.2`. Older auth sheet used `ALF - 2.1` / `ALF 2.2`.
      selectWidgetAny(['2.1', 'ALF - 2.1'], alft21Index);

      const resolvedAlft22Choice =
        prefill.alft22Choice === 'A' || prefill.alft22Choice === 'B' || prefill.alft22Choice === 'C'
          ? prefill.alft22Choice
          : '';
      if (resolvedAlft22Choice === 'A' || resolvedAlft22Choice === 'B' || resolvedAlft22Choice === 'C') {
        const alft22Index = resolvedAlft22Choice === 'B' ? 1 : resolvedAlft22Choice === 'C' ? 2 : 0;
        selectWidgetAny(['2.2', 'ALF 2.2'], alft22Index);
      }
      // Always copy facility details from the viewable page when present.
      setTextAny(['2.2 Facility Name', 'ALF 2.2 Facility Name'], prefill.currentLocationName);
      setTextAny(['2.2 Address', 'ALF 2.2 Address'], prefill.currentLocationAddress);
      setTextAny(
        ["2.2 Current Cost and how its being covered", "ALF 2.2 Current cost and how it's being covered"],
        prefill.alft22CurrentCost
      );
      setTextAny(['ALF Transitions COMMENTS optional', 'ALF Transitions - Comments'], prefill.alftTransitionsComments);

      const section1Selected = new Set(
        String(prefill.section1Usage || '')
          .split(',')
          .map((token) => token.trim().toLowerCase())
          .filter(Boolean)
      );
      const hasRespiteDetails =
        prefill.respite11Choice === 'A' ||
        prefill.respite11Choice === 'B' ||
        Boolean(prefill.respiteComments) ||
        Boolean(prefill.respite11Subsets);
      const hasEcmDetails = Boolean(prefill.ecmProviderName || prefill.ecmProviderContact);
      if (hasRespiteDetails) section1Selected.add('respite');
      if (hasEcmDetails) section1Selected.add('ecm');

      const section1FieldMap: Array<{ key: string; names: string[] }> = [
        { key: 'ecm', names: ['A ECM  If selected please include the following in'] },
        { key: 'ccm', names: ['B CCM'] },
        { key: 'chw', names: ['C CHW'] },
        { key: 'cs', names: ['D CS Services'] },
        {
          key: 'respite',
          names: [
            '1 Respite Services Caregiver Respite',
            'Respite Services Caregiver Respite',
            'Respite Services (Caregiver Respite)',
          ],
        },
        {
          key: 'alftransitions',
          names: ['2 Assisted Living Facility Transitions', 'Assisted Living Facility Transitions'],
        },
        { key: 'hometransition', names: ['3 Community or Home Transition Services', 'Community or Home Transition Services'] },
        {
          key: 'personalcare',
          names: ['4 Personal Care and Homemaker Services', 'Personal Care and Homemaker Services'],
        },
        { key: 'envadaptations', names: ['Environmental Accessibility Adaptations'] },
        { key: 'meals', names: ['6. MTM/MSF', 'Medically Tailored MealsMedicallySupportive Food'] },
        { key: 'sobering', names: ['Sobering Centers'] },
        { key: 'asthma', names: ['7 Asthma Remediation', 'Asthma Remediation'] },
        { key: 'housingnavigation', names: ['Housing Transition Navigation Services'] },
        { key: 'housingdeposits', names: ['Housing Deposits'] },
        { key: 'housingtenancy', names: ['Housing Tenancy and Sustaining Services'] },
        { key: 'dayhabilitation', names: ['Day Habilitation Programs'] },
        { key: 'recuperativecare', names: ['Recuperative Care Medical Respite'] },
        { key: 'shorttermhousing', names: ['ShortTerm PostHospitalization Housing'] },
      ];
      section1FieldMap.forEach(({ key, names }) => {
        const checked =
          section1Selected.has(key) ||
          (key === 'alftransitions' && prefill.section1AlfUsage === 'yes');
        names.forEach((name) => setChecked(name, checked));
      });
      setCheckedAny(
        ['2 Assisted Living Facility Transitions', 'Assisted Living Facility Transitions'],
        prefill.section1AlfUsage === 'yes' || section1Selected.has('alftransitions')
      );

      if (hasEcmDetails || section1Selected.has('ecm')) {
        setChecked('A ECM  If selected please include the following in', true);
        setTextAny(['ECM - Provider Name', 'Provider Name'], prefill.ecmProviderName);
        setTextAny(['ECM - Email or Phone Number', 'Email or Phone Number'], prefill.ecmProviderContact);
      }

      if (prefill.respite11Choice === 'A' || prefill.respite11Choice === 'B') {
        // Jan 2026: discrete `1.1` / `1.1 B` checkboxes. Older: `Caregiver Respite - 1.1` widget group.
        if (prefill.respite11Choice === 'A') {
          setCheckedAny(['1.1'], true);
          selectWidgetAny(['Caregiver Respite - 1.1'], 0);
        } else {
          setCheckedAny(['1.1 B'], true);
          selectWidgetAny(['Caregiver Respite - 1.1'], 1);
        }
      }
      const respiteSubsets = new Set(
        String(prefill.respite11Subsets || '')
          .split(',')
          .map((token) => token.trim().toLowerCase())
          .filter(Boolean)
      );
      // Older template subset boxes (may be absent on Jan 2026).
      setChecked('Previously covered for Respite Services under the', respiteSubsets.has('pediatricwaiver'));
      setChecked('Foster care program beneficiaries', respiteSubsets.has('foster'));
      setChecked('Members enrolled in either California Childrens Se', respiteSubsets.has('ccs'));
      setChecked('Genetically Handicapped Persons Program', respiteSubsets.has('ghpp'));
      setChecked('Members with Complex Care Needs', respiteSubsets.has('complexcare'));
      setChecked('Members live in a location where services can be p', respiteSubsets.has('locationok'));
      setTextAny(
        ['Caregiver Respite COMMENTS optional', 'Caregiver Respite - Comments'],
        prefill.respiteComments
      );

      // Older templates used a bare section-2 checkbox named `2`.
      setChecked('2', true);
      // Referrer relationship: force "Other please specify" (Jan 2026 uses lowercase "relationship").
      selectWidgetAny(['Referrer relationship', 'Referrer Relationship'], 3);
      // External referral by: force "Other, please specify" (still 12 widgets on Jan 2026).
      const externalOtherSet = selectCheckWidgetAny(['External referral by'], 11);
      if (!externalOtherSet) {
        setFirstMatchingCheckField(['external', 'other', 'specify'], true);
      }
      setChecked('By checking this box you confirm that all informat', true);

      form.updateFieldAppearances(font);
      pdfBytes = await pdfDoc.save();
    }

    const filename = buildKaiserReferralFileName(prefill.memberName);
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'x-kaiser-template-source': templateResult.source,
      },
    });
  } catch {
    return new NextResponse('Could not prepare Kaiser template PDF for output.', { status: 500 });
  }
}
