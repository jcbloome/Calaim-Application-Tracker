import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib';

export const KAISER_COVER_TEMPLATE_UPLOADS_COLLECTION = 'kaiser_isp_cover_sheet_templates';
export const KAISER_COVER_TEMPLATE_SETTINGS_DOC = { collection: 'admin-settings', id: 'kaiser-isp-cover-sheet-template' };

export type CoverSheetFieldType = 'text' | 'dropdown' | 'list' | 'radio' | 'checkbox' | 'other';

export type CoverSheetFieldSummary = {
  name: string;
  type: CoverSheetFieldType;
  page: number | null;
  options?: string[];
  readOnly: boolean;
};

export type CoverSheetTemplateSummary = {
  pageCount: number;
  fieldCount: number;
  dropdownCount: number;
  fields: CoverSheetFieldSummary[];
  /** Generator fields with no match in this PDF (any accepted name per slot). */
  missingGeneratorFields: Array<{ section: string; label: string; acceptedNames: string[] }>;
};

/**
 * Fields the cover sheet generator fills, grouped by slot. Each slot lists every field name the
 * generator accepts (current template first, then older revisions).
 */
export const COVER_SHEET_GENERATOR_FIELDS: Array<{ section: string; label: string; acceptedNames: string[] }> = [
  { section: 'Authorization', label: 'Member name', acceptedNames: ['Name First MI Last'] },
  { section: 'Authorization', label: 'MRN', acceptedNames: ['MRN'] },
  { section: 'Authorization', label: 'DOB', acceptedNames: ['DOB (MM/DD/YYYY)_af_date'] },
  { section: 'Authorization', label: 'NCAL / SCAL', acceptedNames: ['Dropdown3'] },
  { section: 'Authorization', label: 'County', acceptedNames: ['County'] },
  { section: 'Authorization', label: 'At ALW facility', acceptedNames: ['Dropdown4'] },
  { section: 'Authorization', label: 'ALW application submitted', acceptedNames: ['Dropdown5'] },
  { section: 'Authorization', label: 'On ALW waitlist', acceptedNames: ['Dropdown6'] },
  { section: 'Authorization', label: 'Facility vetted / contracted', acceptedNames: ['Dropdown9'] },
  { section: 'Authorization', label: 'In ALW county', acceptedNames: ['Dropdown8'] },
  { section: 'Authorization', label: 'Requested tier (ILS)', acceptedNames: ['Dropdown10'] },
  {
    section: 'Authorization',
    label: 'KP tier determination (leave blank for Kaiser)',
    acceptedNames: ['Dropdown25', 'Dropdown15'],
  },
  { section: 'Authorization', label: 'Room & board amount', acceptedNames: ['Members Financial Responsibility of Room and Board'] },
  { section: 'Authorization', label: 'ALW assessment checklist', acceptedNames: ['Check Box28'] },
  { section: 'Authorization', label: 'Room & board checklist', acceptedNames: ['Check Box14', 'Check Box12'] },
  { section: 'Reauthorization', label: 'Member name', acceptedNames: ['Name'] },
  { section: 'Reauthorization', label: 'MRN', acceptedNames: ['MRN_2'] },
  { section: 'Reauthorization', label: 'DOB', acceptedNames: ['DOB MMDDYYY'] },
  { section: 'Reauthorization', label: 'NCAL / SCAL', acceptedNames: ['Dropdown31'] },
  { section: 'Reauthorization', label: 'County', acceptedNames: ['Dropdown17'] },
  { section: 'Reauthorization', label: 'At ALW facility', acceptedNames: ['Dropdown18'] },
  { section: 'Reauthorization', label: 'ALW application submitted', acceptedNames: ['Dropdown19'] },
  { section: 'Reauthorization', label: 'On ALW waitlist', acceptedNames: ['Dropdown20'] },
  { section: 'Reauthorization', label: 'Change in condition', acceptedNames: ['Dropdown16'] },
  { section: 'Reauthorization', label: 'Facility vetted / contracted', acceptedNames: ['Dropdown21'] },
  { section: 'Reauthorization', label: 'In ALW county', acceptedNames: ['Dropdown34'] },
  { section: 'Reauthorization', label: 'Move-in date', acceptedNames: ['eg RCFE ARF etcDate Member Moved Into Facility'] },
  { section: 'Reauthorization', label: 'Room & board amount', acceptedNames: ['Text22', 'Text3'] },
  { section: 'Reauthorization', label: 'Preliminary tier (ILS)', acceptedNames: ['Dropdown35', 'Dropdown7'] },
  { section: 'Reauthorization', label: 'ALW assessment checklist', acceptedNames: ['Check Box32'] },
  { section: 'Reauthorization', label: 'Room & board checklist', acceptedNames: ['Check Box27', 'Check Box5'] },
];

export async function summarizeCoverSheetTemplate(bytes: Uint8Array | Buffer): Promise<CoverSheetTemplateSummary> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const fields = doc.getForm().getFields();

  const summaries: CoverSheetFieldSummary[] = fields.map((field) => {
    let type: CoverSheetFieldType = 'other';
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
    const summary: CoverSheetFieldSummary = { name: field.getName(), type, page, readOnly: field.isReadOnly() };
    if (options) summary.options = options;
    return summary;
  });

  summaries.sort((a, b) => (a.page ?? 99) - (b.page ?? 99));
  const names = new Set(summaries.map((f) => f.name));

  return {
    pageCount: pages.length,
    fieldCount: summaries.length,
    dropdownCount: summaries.filter((f) => f.type === 'dropdown').length,
    fields: summaries,
    missingGeneratorFields: COVER_SHEET_GENERATOR_FIELDS.filter(
      (slot) => !slot.acceptedNames.some((name) => names.has(name))
    ),
  };
}
