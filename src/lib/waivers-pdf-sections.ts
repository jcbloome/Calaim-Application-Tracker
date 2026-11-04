export type WaiversPdfSectionInput = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

const s = (value: unknown) => String(value ?? '').trim();

const cleanFileToken = (value: unknown, fallback: string) => {
  const cleaned = s(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ');
  return cleaned || fallback;
};

/** `Last, First - MRN - Document.pdf` naming used for Drive / ZIP downloads. */
export function buildMemberLabeledPdfFileName(
  application: Record<string, any> | null | undefined,
  documentLabel: string
): string {
  const app = application || {};
  const lastName = cleanFileToken(app.memberLastName, 'UnknownLast');
  const firstName = cleanFileToken(app.memberFirstName, 'UnknownFirst');
  const mrn = cleanFileToken(
    app.memberMrn || app.memberMRN || app.medicalRecordNumber || app.mrn || app.Member_MRN || app.MCP_CIN,
    'UnknownMRN'
  );
  const label = cleanFileToken(documentLabel, 'Document');
  return `${lastName}, ${firstName} - ${mrn} - ${label}.pdf`;
}

/** Build Waivers & Authorizations PDF sections when the online form is complete enough to download. */
export function buildWaiversPdfSectionsFromApplication(
  application: Record<string, any> | null | undefined
): WaiversPdfSectionInput[] | null {
  const app = application || {};
  const forms = Array.isArray(app.forms) ? (app.forms as any[]) : [];
  const waiverForm = forms.find((form) => {
    const name = s(form?.name).toLowerCase();
    return name === 'waivers & authorizations' || name === 'waivers';
  });
  if (!waiverForm) return null;

  const status = s(waiverForm?.status).toLowerCase();
  const signerName = s(waiverForm?.signerName);
  const signerType = s(waiverForm?.signerType);
  const choice = s(waiverForm?.choice);
  const ackHipaa = Boolean(waiverForm?.ackHipaa);
  const ackLiability = Boolean(waiverForm?.ackLiability);
  const ackFoc = Boolean(waiverForm?.ackFoc);
  const ackRoomAndBoard = Boolean(
    waiverForm?.ackRoomAndBoard ??
      app.ackRoomAndBoard ??
      waiverForm?.ackSocDetermination ??
      app.ackSocDetermination
  );
  const monthlyIncome = s(waiverForm?.monthlyIncome || app.monthlyIncome);
  const incomeSource = Array.isArray(waiverForm?.incomeSource)
    ? waiverForm.incomeSource.map((value: unknown) => s(value)).filter(Boolean).join(', ')
    : s(waiverForm?.incomeSource || app.incomeSource);

  const isComplete =
    status === 'completed' ||
    Boolean(
      signerName && signerType && choice && ackHipaa && ackLiability && ackFoc && ackRoomAndBoard && monthlyIncome
    );
  if (!isComplete) return null;

  const yesNo = (value: unknown) => (value ? 'Yes' : 'No');
  const choiceLabel =
    choice === 'accept'
      ? 'Accept Community Supports'
      : choice === 'decline'
        ? 'Decline Community Supports'
        : choice;
  const memberName = [s(app.memberFirstName), s(app.memberLastName)].filter(Boolean).join(' ');
  const memberMrn = s(app.memberMrn || app.memberMRN || app.mrn || app.Member_MRN || app.MCP_CIN);

  return [
    {
      title: 'Member',
      rows: [
        { label: 'Member Name', value: memberName },
        { label: 'MRN', value: memberMrn },
      ].filter((row) => row.value),
    },
    {
      title: 'Acknowledgments',
      rows: [
        { label: 'HIPAA Authorization', value: yesNo(ackHipaa) },
        { label: 'Liability Waiver', value: yesNo(ackLiability) },
        { label: 'Freedom of Choice', value: yesNo(ackFoc) },
        { label: 'Room & Board Commitment', value: yesNo(ackRoomAndBoard) },
        { label: 'Choice', value: choiceLabel },
      ],
    },
    {
      title: 'Income',
      rows: [
        { label: 'Monthly Income', value: monthlyIncome },
        { label: 'Income Source', value: incomeSource },
      ].filter((row) => row.value),
    },
    {
      title: 'Electronic Signature',
      rows: [
        {
          label: 'Signer',
          value:
            signerType === 'representative'
              ? 'Authorized Representative (POA)'
              : signerType === 'member'
                ? 'Member'
                : signerType,
        },
        { label: 'Signature', value: signerName },
        { label: 'Relationship', value: s(waiverForm?.signerRelationship) },
      ].filter((row) => row.value),
    },
  ].filter((section) => section.rows.length > 0);
}
