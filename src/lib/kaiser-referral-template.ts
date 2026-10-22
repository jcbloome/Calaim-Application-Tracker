import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib';

export const KAISER_REFERRAL_TEMPLATE_UPLOADS_COLLECTION = 'kaiser_referral_templates';
export const KAISER_REFERRAL_TEMPLATE_SETTINGS_DOC = {
  collection: 'admin-settings',
  id: 'kaiser-referral-template',
};

export type ReferralFieldType = 'text' | 'dropdown' | 'list' | 'radio' | 'checkbox' | 'other';

export type ReferralFieldSummary = {
  name: string;
  type: ReferralFieldType;
  page: number | null;
  options?: string[];
  readOnly: boolean;
};

export type ReferralTemplateSummary = {
  pageCount: number;
  fieldCount: number;
  dropdownCount: number;
  fields: ReferralFieldSummary[];
  /** Generator fields with no match in this PDF (any accepted name per slot). */
  missingGeneratorFields: Array<{ section: string; label: string; acceptedNames: string[] }>;
};

/** Core fields the referral generator fills (exact AcroForm names from the current Kaiser PDF). */
export const REFERRAL_GENERATOR_FIELDS: Array<{ section: string; label: string; acceptedNames: string[] }> = [
  { section: 'Referrer', label: 'Date of Referral', acceptedNames: ['Date of Referral'] },
  { section: 'Referrer', label: 'Referrer Name', acceptedNames: ['Referrer Name'] },
  { section: 'Referrer', label: 'Referrer Email', acceptedNames: ['Referrer Email'] },
  { section: 'Referrer', label: 'Referrer Phone', acceptedNames: ['Referrer Phone Number'] },
  {
    section: 'Referrer',
    label: 'Referring Organization',
    acceptedNames: ['Referring Organization Name'],
  },
  {
    section: 'Referrer',
    label: 'Organization NPI',
    acceptedNames: ['Referring Organization National Provider Identifie'],
  },
  {
    section: 'Referrer',
    label: 'Organization Address',
    acceptedNames: ['ReferrerReferring Organization Address Street City'],
  },
  {
    section: 'Member',
    label: 'Member Name',
    acceptedNames: ['Member Name First Name Middle Initial Last Name'],
  },
  { section: 'Member', label: 'Member DOB', acceptedNames: ['Member Date of Birth'] },
  { section: 'Member', label: 'Member Phone', acceptedNames: ['Member Phone Number'] },
  {
    section: 'Member',
    label: 'Member Address',
    acceptedNames: ['Member Mailing Address Street City State Zip Code'],
  },
  {
    section: 'Member',
    label: 'MRN / Medi-Cal CIN',
    acceptedNames: ['Members Kaiser Permanente MRN or MediCal CIN if MR'],
  },
  { section: 'ALF', label: 'ALF 2.1', acceptedNames: ['2.1', 'ALF - 2.1'] },
  { section: 'ALF', label: 'ALF 2.2', acceptedNames: ['2.2', 'ALF 2.2'] },
  { section: 'ALF', label: 'Facility Name', acceptedNames: ['2.2 Facility Name', 'ALF 2.2 Facility Name'] },
  { section: 'ALF', label: 'Facility Address', acceptedNames: ['2.2 Address', 'ALF 2.2 Address'] },
  {
    section: 'Services',
    label: 'Assisted Living Facility Transitions',
    acceptedNames: ['2 Assisted Living Facility Transitions', 'Assisted Living Facility Transitions'],
  },
  {
    section: 'Referrer',
    label: 'Referrer relationship',
    acceptedNames: ['Referrer relationship', 'Referrer Relationship'],
  },
];

export async function summarizeReferralTemplate(
  bytes: Uint8Array | Buffer
): Promise<ReferralTemplateSummary> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const fields = doc.getForm().getFields();

  const summaries: ReferralFieldSummary[] = fields.map((field) => {
    let type: ReferralFieldType = 'other';
    let options: string[] | undefined;
    if (field instanceof PDFDropdown) {
      type = 'dropdown';
      options = field.getOptions();
    } else if (field instanceof PDFOptionList) {
      type = 'list';
      options = field.getOptions();
    } else if (field instanceof PDFRadioGroup) {
      type = 'radio';
      options = field.getOptions();
    } else if (field instanceof PDFCheckBox) {
      type = 'checkbox';
    } else if (field instanceof PDFTextField) {
      type = 'text';
    }
    let page: number | null = null;
    try {
      const widgetPageRef = field.acroField.getWidgets()[0]?.P();
      const idx = pages.findIndex((p) => p.ref === widgetPageRef);
      page = idx >= 0 ? idx + 1 : null;
    } catch {
      page = null;
    }
    const summary: ReferralFieldSummary = {
      name: field.getName(),
      type,
      page,
      readOnly: field.isReadOnly(),
    };
    if (options) summary.options = options;
    return summary;
  });

  summaries.sort((a, b) => (a.page ?? 99) - (b.page ?? 99));
  const names = new Set(summaries.map((f) => f.name));

  return {
    pageCount: pages.length,
    fieldCount: summaries.length,
    dropdownCount: summaries.filter((f) => f.type === 'dropdown' || f.type === 'list' || f.type === 'radio').length,
    fields: summaries,
    missingGeneratorFields: REFERRAL_GENERATOR_FIELDS.filter(
      (slot) => !slot.acceptedNames.some((name) => names.has(name))
    ),
  };
}
