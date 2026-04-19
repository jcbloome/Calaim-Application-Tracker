import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TEMPLATE_PATH =
  'C:\\Users\\Jason.Jason-PC\\AppData\\Roaming\\Cursor\\User\\workspaceStorage\\2871420c389bbb745bfd4b95a2ccaf63\\pdfs\\00490bac-ad5b-4f06-8cba-374155b8db87\\#5 (2026) Kaiser Auth Sheet ORIGINAL (2).pdf';

function getTemplatePath() {
  return String(process.env.KAISER_REFERRAL_TEMPLATE_PATH || DEFAULT_TEMPLATE_PATH).trim();
}

function clean(value: string | null) {
  return String(value || '').trim();
}

function asDisplayDate(value: string) {
  const v = clean(value);
  if (!v) return '';
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return v;
}

function normalizePhone(value: string) {
  const raw = clean(value);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function normalizeAddress(value: string) {
  return clean(value).replace(/\s+/g, ' ');
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
  const templatePath = getTemplatePath();

  if (!templatePath) {
    return new NextResponse('Kaiser template path is not configured.', { status: 500 });
  }

  try {
    const rawPdfBuffer = await fs.readFile(templatePath);
    const params = req.nextUrl.searchParams;

    const prefill = {
      referralDate: asDisplayDate(params.get('referralDate')),
      referrerName: clean(params.get('referrerName')),
      referrerEmail: clean(params.get('referrerEmail')).toLowerCase(),
      referrerPhone: normalizePhone(params.get('referrerPhone')),
      referrerOrganization: clean(params.get('referrerOrganization')),
      referrerNpi: clean(params.get('referrerNpi')),
      referrerAddress: normalizeAddress(params.get('referrerAddress')),
      referrerRelationship: clean(params.get('referrerRelationship')) || 'Community Support (CalAim)',
      memberName: clean(params.get('memberName')),
      memberDob: asDisplayDate(params.get('memberDob')),
      memberPhone: normalizePhone(params.get('memberPhone')),
      memberAddress: normalizeAddress(params.get('memberAddress')),
      memberMrn: clean(params.get('memberMrn')) || clean(params.get('memberMediCal')),
      caregiverName: clean(params.get('caregiverName')),
      caregiverContact: clean(params.get('caregiverContact')) || normalizePhone(params.get('memberPhone')),
      healthPlan: clean(params.get('healthPlan')).toLowerCase(),
      currentLocationName: clean(params.get('currentLocationName')),
      currentLocationAddress: normalizeAddress(params.get('currentLocationAddress')),
      alft21Choice: clean(params.get('alft21Choice')).toUpperCase(),
      alft22Choice: clean(params.get('alft22Choice')).toUpperCase(),
      section1AlfUsage: clean(params.get('section1AlfUsage')).toLowerCase(),
    };

    const hasPrefillValues = Object.values(prefill).some(Boolean);

    let pdfBytes = new Uint8Array(rawPdfBuffer);
    if (hasPrefillValues) {
      const pdfDoc = await PDFDocument.load(rawPdfBuffer);
      const form = pdfDoc.getForm();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const setText = (name: string, value: string) => {
        if (!value) return;
        try {
          const field: unknown = form.getFieldMaybe(name);
          if (isTextFieldLike(field)) {
            field.setText(value);
          }
        } catch {
          // ignore unmapped fields
        }
      };

      const setChecked = (name: string, checked: boolean) => {
        try {
          const field: unknown = form.getFieldMaybe(name);
          if (!isCheckFieldLike(field)) return;
          if (checked) field.check();
          if (!checked) field.uncheck();
        } catch {
          // ignore unmapped fields
        }
      };

      const selectRadio = (name: string, wantYes: boolean) => {
        try {
          const field: unknown = form.getFieldMaybe(name);
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
          const field: unknown = form.getFieldMaybe(name);
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
          const field = form.getFieldMaybe(name) as FieldLike | undefined;
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

      setText('Date of Referral', prefill.referralDate);
      setText('Referrer Name', prefill.referrerName);
      setText('Referrer Email', prefill.referrerEmail);
      setText('Referrer Phone Number', prefill.referrerPhone);
      setText('Referring Organization Name', prefill.referrerOrganization);
      setText('Referring Organization National Provider Identifie', prefill.referrerNpi);
      setText('ReferrerReferring Organization Address Street City', prefill.referrerAddress);
      setText('Referrer Relationship - Other', prefill.referrerRelationship);
      setText('External referral - Other', 'Community Support (CalAim)');

      setText('Member Name First Name Middle Initial Last Name', prefill.memberName);
      setText('Member Date of Birth', prefill.memberDob);
      setText('Member Phone Number', prefill.memberPhone);
      setText('Member Mailing Address Street City State Zip Code', prefill.memberAddress);
      setText('Members Kaiser Permanente MRN or MediCal CIN if MR', prefill.memberMrn);
      setText('CaregiverSupport Person Name', prefill.caregiverName);
      setText('CaregiverSupport Person Contact EmailPhone Number', prefill.caregiverContact);

      setText('ALF 2.2 Facility Name', prefill.currentLocationName);
      setText('ALF 2.2 Address', prefill.currentLocationAddress || prefill.memberAddress);

      selectRadio('Is the person being referred a Kaiser Permanente K', prefill.healthPlan.includes('kaiser'));
      const alft21Index = prefill.alft21Choice === 'B' ? 1 : 0;
      selectWidgetOptionByIndex('ALF - 2.1', alft21Index);

      const resolvedAlft22Choice =
        prefill.alft22Choice === 'A' || prefill.alft22Choice === 'B' || prefill.alft22Choice === 'C'
          ? prefill.alft22Choice
          : prefill.currentLocationName || prefill.currentLocationAddress
            ? 'C'
            : '';
      if (resolvedAlft22Choice === 'A' || resolvedAlft22Choice === 'B' || resolvedAlft22Choice === 'C') {
        const alft22Index = resolvedAlft22Choice === 'B' ? 1 : resolvedAlft22Choice === 'C' ? 2 : 0;
        selectWidgetOptionByIndex('ALF 2.2', alft22Index);
      }

      // Section 1 ("Current Service Usage") should remain unchecked by default.
      // Best-effort clear: unknown names are safely ignored by setChecked().
      [
        'A. ECM',
        'B. CCM',
        'C. CHW',
        'D. CS Services',
        'Respite Services (Caregiver Respite)',
        'Assisted Living Facility Transitions',
        'Community or Home Transition Services',
        'Personal Care and Homemaker Services',
        'Environmental Accessibility Adaptations (Home Modifications)',
        'Medically Tailored Meals/Medically-Supportive Food',
        'Sobering Centers',
        'Asthma Remediation',
        'Housing Transition Navigation Services',
        'Housing Deposits',
        'Housing Tenancy and Sustaining Services',
        'Day Habilitation Programs',
        'Recuperative Care (Medical Respite)',
        'Short-Term Post-Hospitalization Housing',
      ].forEach((name) => setChecked(name, false));
      // Explicitly control Section 1 "Assisted Living Facility Transitions" checkbox by required selector.
      // Apply this after clear to avoid stale checked state.
      setChecked('Assisted Living Facility Transitions', prefill.section1AlfUsage === 'yes');

      // Section 2 must always be checked (template field name is `2` on both pages).
      setChecked('2', true);
      // Referrer relationship: force "Other please specify".
      selectWidgetOptionByIndex('Referrer Relationship', 3);
      // External referral by: force "Other, please specify" option.
      // This template uses a 12-widget checkbox group for this field.
      // Index 11 is the bottom "Other, please specify" option.
      const externalOtherSet = selectCheckWidgetByIndex('External referral by', 11);
      // Fallback for templates where "External referral by" is implemented as discrete checkboxes.
      if (!externalOtherSet) {
        setFirstMatchingCheckField(['external', 'other', 'specify'], true);
      }
      setChecked('By checking this box you confirm that all informat', true);

      form.updateFieldAppearances(font);
      pdfBytes = await pdfDoc.save();
    }

    const filename = '#5 (2026) Kaiser Auth Sheet ORIGINAL (2).pdf';
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new NextResponse(`Could not read Kaiser template PDF at: ${templatePath}`, { status: 404 });
  }
}
