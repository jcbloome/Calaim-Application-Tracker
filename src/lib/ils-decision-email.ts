export type IlsDecisionChoice = 'accept' | 'decline';

export const ILS_DECISION_RECIPIENTS = ['ils-calaim@ilshealth.com', 'jason@carehomefinders.com'] as const;
export const ILS_DECISION_SIGNATURE_LINES = ['Jason Bloome', 'Connections Care Home Consultants', '800-330-5993'] as const;
export const ILS_DECISION_SIGNATURE_TEXT = ILS_DECISION_SIGNATURE_LINES.join('\n');
export const ILS_DECISION_CUSTOM_TEXT_MAX = 1000;
export const ILS_DECISION_IDEMPOTENCY_KEY_MAX = 120;

type BuildEmailPartsInput = {
  choice: IlsDecisionChoice;
  memberName: string;
  memberMrn?: string;
  memberCounty?: string;
  customText?: string;
};

const clean = (value: unknown) => String(value || '').trim();

const escapeHtml = (value: unknown) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const toHtmlWithBreaks = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br/>');

export const normalizeIlsDecisionCustomText = (value: unknown) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();

export const validateIlsDecisionCustomText = (value: unknown): string | null => {
  const raw = String(value || '').replace(/\r\n/g, '\n');
  if (raw.length > ILS_DECISION_CUSTOM_TEXT_MAX) {
    return `customText must be ${ILS_DECISION_CUSTOM_TEXT_MAX} characters or less.`;
  }
  return null;
};

export const validateIlsDecisionIdempotencyKey = (value: unknown): string | null => {
  const key = clean(value);
  if (!key || key.length > ILS_DECISION_IDEMPOTENCY_KEY_MAX) {
    return `idempotencyKey is required and must be ${ILS_DECISION_IDEMPOTENCY_KEY_MAX} characters or less.`;
  }
  return null;
};

export const buildIlsDecisionNarrative = (choice: IlsDecisionChoice) =>
  choice === 'accept'
    ? 'Please note we have STARTED service delivery for this member.'
    : 'Please note we have DECLINED service delivery for this member.';

export const buildIlsDecisionTextBody = (input: BuildEmailPartsInput): string => {
  const memberName = clean(input.memberName);
  const memberMrn = clean(input.memberMrn) || 'N/A';
  const memberCounty = clean(input.memberCounty) || 'N/A';
  const customText = normalizeIlsDecisionCustomText(input.customText);
  const decisionText = buildIlsDecisionNarrative(input.choice);

  return [
    'Dear ILS,',
    decisionText,
    customText || null,
    [`Member: ${memberName}`, `MRN: ${memberMrn}`, `County: ${memberCounty}`].join('\n'),
    ILS_DECISION_SIGNATURE_TEXT,
  ]
    .filter((block): block is string => Boolean(block))
    .join('\n\n');
};

export const buildIlsDecisionHtmlBody = (input: BuildEmailPartsInput): string => {
  const memberName = clean(input.memberName);
  const memberMrn = clean(input.memberMrn) || 'N/A';
  const memberCounty = clean(input.memberCounty) || 'N/A';
  const customText = normalizeIlsDecisionCustomText(input.customText);
  const decisionText = buildIlsDecisionNarrative(input.choice);

  return `<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
      <p style="margin: 0 0 14px 0; line-height: 1.6;">Dear ILS,</p>
      <p style="margin: 0 0 14px 0; line-height: 1.6;">${escapeHtml(decisionText)}</p>
      ${customText ? `<p style="margin: 0 0 14px 0; line-height: 1.6;">${toHtmlWithBreaks(customText)}</p>` : ''}
      <p style="margin: 0 0 14px 0; line-height: 1.6;">
        <strong>Member:</strong> ${escapeHtml(memberName)}<br/>
        <strong>MRN:</strong> ${escapeHtml(memberMrn)}<br/>
        <strong>County:</strong> ${escapeHtml(memberCounty)}
      </p>
      <p style="margin: 0; line-height: 1.6;">${ILS_DECISION_SIGNATURE_LINES.map((line) => escapeHtml(line)).join('<br/>')}</p>
    </div>`;
};
