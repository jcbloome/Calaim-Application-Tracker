export type IlsDecisionChoice = 'accept' | 'decline';

export const ILS_DECISION_TO = ['ils-calaim@ilshealth.com'] as const;
export const ILS_DECISION_CC = ['jason@carehomefinders.com'] as const;
export const ILS_DECISION_RECIPIENTS = [...ILS_DECISION_TO, ...ILS_DECISION_CC] as const;
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
  /** When declining because Connections does not serve the member's county. */
  declineReason?: 'out_of_county' | '';
};

export type IlsBulkDeclineMember = {
  memberName: string;
  memberMrn?: string;
  memberCounty?: string;
};

type BuildBulkOutOfCountyDeclineInput = {
  members: IlsBulkDeclineMember[];
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

export const buildIlsDecisionSubject = (memberName: string, memberMrn?: string) =>
  `To ILS RE: ${clean(memberName) || 'Unknown Member'} MRN: ${clean(memberMrn) || 'N/A'}`;

export const buildIlsDecisionNarrative = (
  choice: IlsDecisionChoice,
  options?: { declineReason?: 'out_of_county' | '' }
) => {
  if (choice === 'accept') {
    return 'Please note we have STARTED service delivery for this member.';
  }
  if (options?.declineReason === 'out_of_county') {
    return 'Please note we are DECLINING service delivery for this member since we do not serve this county.';
  }
  return 'Please note we have DECLINED service delivery for this member.';
};

/** Plural out-of-county narrative for one email covering many northern declines. */
export const buildIlsBulkOutOfCountyDeclineNarrative = () =>
  'Please note we are DECLINING service delivery for these members since we do not serve those counties.';

export const buildIlsBulkOutOfCountyDeclineSubject = (memberCount: number) => {
  const count = Math.max(0, Number(memberCount) || 0);
  return `To ILS RE: Northern California declines (${count} member${count === 1 ? '' : 's'})`;
};

const normalizeBulkDeclineMembers = (members: IlsBulkDeclineMember[]) =>
  (Array.isArray(members) ? members : [])
    .map((member) => ({
      memberName: clean(member?.memberName) || 'Unknown Member',
      memberMrn: clean(member?.memberMrn) || 'N/A',
      memberCounty: clean(member?.memberCounty) || 'N/A',
    }))
    .filter((member) => member.memberName);

const formatBulkDeclineMemberTextBlock = (members: ReturnType<typeof normalizeBulkDeclineMembers>) =>
  members
    .map(
      (member) =>
        `Member: ${member.memberName}\nMRN: ${member.memberMrn}\nCounty: ${member.memberCounty}`
    )
    .join('\n\n');

export const buildIlsBulkOutOfCountyDeclineTextBody = (
  input: BuildBulkOutOfCountyDeclineInput
): string => {
  const members = normalizeBulkDeclineMembers(input.members);
  const customText = normalizeIlsDecisionCustomText(input.customText);
  const decisionText = buildIlsBulkOutOfCountyDeclineNarrative();
  const memberBlock = formatBulkDeclineMemberTextBlock(members) || 'No members listed.';

  return [
    'Hi ILS,',
    decisionText,
    customText || null,
    memberBlock,
    'Kind regards,',
    ILS_DECISION_SIGNATURE_TEXT,
  ]
    .filter((block): block is string => Boolean(block))
    .join('\n\n');
};

export const buildIlsBulkOutOfCountyDeclineHtmlBody = (
  input: BuildBulkOutOfCountyDeclineInput
): string => {
  const members = normalizeBulkDeclineMembers(input.members);
  const customText = normalizeIlsDecisionCustomText(input.customText);
  const decisionText = buildIlsBulkOutOfCountyDeclineNarrative();
  const memberHtml = members.length
    ? members
        .map(
          (member) => `<p style="margin: 0 0 14px 0; line-height: 1.6;">
        <strong>Member:</strong> ${escapeHtml(member.memberName)}<br/>
        <strong>MRN:</strong> ${escapeHtml(member.memberMrn)}<br/>
        <strong>County:</strong> ${escapeHtml(member.memberCounty)}
      </p>`
        )
        .join('')
    : `<p style="margin: 0 0 14px 0; line-height: 1.6;">No members listed.</p>`;

  return `<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
      <p style="margin: 0 0 14px 0; line-height: 1.6;">Hi ILS,</p>
      <p style="margin: 0 0 14px 0; line-height: 1.6;">${escapeHtml(decisionText)}</p>
      ${customText ? `<p style="margin: 0 0 14px 0; line-height: 1.6;">${toHtmlWithBreaks(customText)}</p>` : ''}
      ${memberHtml}
      <p style="margin: 0 0 14px 0; line-height: 1.6;">Kind regards,</p>
      <p style="margin: 0; line-height: 1.6;">${ILS_DECISION_SIGNATURE_LINES.map((line) => escapeHtml(line)).join('<br/>')}</p>
    </div>`;
};

export const buildIlsDecisionTextBody = (input: BuildEmailPartsInput): string => {
  const memberName = clean(input.memberName);
  const memberMrn = clean(input.memberMrn) || 'N/A';
  const memberCounty = clean(input.memberCounty) || 'N/A';
  const customText = normalizeIlsDecisionCustomText(input.customText);
  const decisionText = buildIlsDecisionNarrative(input.choice, { declineReason: input.declineReason || '' });

  return [
    'Hi ILS,',
    decisionText,
    customText || null,
    [`Member: ${memberName}`, `MRN: ${memberMrn}`, `County: ${memberCounty}`].join('\n'),
    'Kind regards,',
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
  const decisionText = buildIlsDecisionNarrative(input.choice, { declineReason: input.declineReason || '' });

  return `<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
      <p style="margin: 0 0 14px 0; line-height: 1.6;">Hi ILS,</p>
      <p style="margin: 0 0 14px 0; line-height: 1.6;">${escapeHtml(decisionText)}</p>
      ${customText ? `<p style="margin: 0 0 14px 0; line-height: 1.6;">${toHtmlWithBreaks(customText)}</p>` : ''}
      <p style="margin: 0 0 14px 0; line-height: 1.6;">
        <strong>Member:</strong> ${escapeHtml(memberName)}<br/>
        <strong>MRN:</strong> ${escapeHtml(memberMrn)}<br/>
        <strong>County:</strong> ${escapeHtml(memberCounty)}
      </p>
      <p style="margin: 0 0 14px 0; line-height: 1.6;">Kind regards,</p>
      <p style="margin: 0; line-height: 1.6;">${ILS_DECISION_SIGNATURE_LINES.map((line) => escapeHtml(line)).join('<br/>')}</p>
    </div>`;
};
