export type CsSummaryPdfSectionInput = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

const s = (value: unknown) => String(value ?? '').trim();
const fullName = (first: unknown, last: unknown) => `${s(first)} ${s(last)}`.trim();
const joinAddress = (parts: Array<unknown>) => parts.map(s).filter(Boolean).join(', ');

/** Build labeled CS Summary PDF sections from application / form field values. */
export function buildCsSummaryPdfSectionsFromApplication(application: Record<string, any> | null | undefined): CsSummaryPdfSectionInput[] {
  const app = application || {};
  const incomeSource = Array.isArray(app.incomeSource)
    ? (app.incomeSource as string[]).map(s).filter(Boolean).join(', ')
    : s(app.incomeSource);

  const sections: Array<{ title: string; rows: Array<[string, string]> }> = [
    {
      title: 'Member',
      rows: [
        ['Member Name', fullName(app.memberFirstName, app.memberLastName)],
        ['Date of Birth', s(app.memberDob || app.Birth_Date)],
        ['Member Phone', s(app.memberPhone)],
        ['Member Email', s(app.memberEmail)],
        ['Preferred Language', s(app.memberLanguage)],
        ['MRN', s(app.memberMrn || app.memberMRN || app.MRN)],
        ['Medi-Cal', s(app.memberMediCalNum || app.MediCal_Number)],
        ['County', s(app.currentCounty || app.memberCounty)],
        ['Current Status', s(app.status)],
        ['Health Plan', s(app.healthPlan || app.CalAIM_MCO)],
        ['Pathway', s(app.pathway)],
      ],
    },
    {
      title: 'Submitting User',
      rows: [
        ['Referrer Name', fullName(app.referrerFirstName, app.referrerLastName)],
        ['Referrer Email', s(app.referrerEmail)],
        ['Referrer Phone', s(app.referrerPhone)],
        ['Referrer Relationship', s(app.referrerRelationship)],
        ['Agency', s(app.agency)],
      ],
    },
    {
      title: 'Primary Contact',
      rows: [
        ['Primary Contact', fullName(app.bestContactFirstName, app.bestContactLastName)],
        ['Primary Contact Relationship', s(app.bestContactRelationship)],
        ['Primary Contact Phone', s(app.bestContactPhone)],
        ['Primary Contact Email', s(app.bestContactEmail)],
        ['Primary Contact Language', s(app.bestContactLanguage)],
      ],
    },
    {
      title: 'Secondary Contact',
      rows: [
        ['Secondary Contact', fullName(app.secondaryContactFirstName, app.secondaryContactLastName)],
        ['Secondary Contact Relationship', s(app.secondaryContactRelationship)],
        ['Secondary Contact Phone', s(app.secondaryContactPhone)],
        ['Secondary Contact Email', s(app.secondaryContactEmail)],
        ['Secondary Contact Language', s(app.secondaryContactLanguage)],
      ],
    },
    {
      title: 'Legal Representative',
      rows: [
        ['Legal Representative Status', s(app.hasLegalRep)],
        ['Representative Name', fullName(app.repFirstName, app.repLastName)],
        ['Representative Relationship', s(app.repRelationship)],
        ['Representative Phone', s(app.repPhone)],
        ['Representative Email', s(app.repEmail)],
      ],
    },
    {
      title: 'Location',
      rows: [
        ['Current Location Type', s(app.currentLocation)],
        ['Current Location Name', s(app.currentLocationName)],
        [
          'Current Address',
          joinAddress([
            app.currentAddress,
            app.currentCity,
            [s(app.currentState), s(app.currentZip)].filter(Boolean).join(' '),
          ]),
        ],
        ['Customary Location Type', s(app.customaryLocationType)],
        ['Customary Location Name', s(app.customaryLocationName)],
        [
          'Customary Address',
          joinAddress([
            app.customaryAddress,
            app.customaryCity,
            [s(app.customaryState), s(app.customaryZip)].filter(Boolean).join(' '),
          ]),
        ],
      ],
    },
    {
      title: 'ISP and RCFE',
      rows: [
        ['ISP Contact', fullName(app.ispFirstName, app.ispLastName)],
        ['ISP Phone', s(app.ispPhone)],
        ['ISP Email', s(app.ispEmail)],
        ['ISP Relationship', s(app.ispRelationship)],
        [
          'ISP Address',
          joinAddress([app.ispAddress, app.ispCity, app.ispState, app.ispZip]),
        ],
        ['ISP Contact Is Member', app.ispContactIsMember ? 'Yes' : ''],
        ['ISP Contact Is Primary Contact', app.ispContactSameAsPrimary ? 'Yes' : ''],
        ['Secondary ISP Contact Is Primary Contact', app.ispSecondaryContactSameAsPrimary ? 'Yes' : ''],
        ['Secondary ISP Contact', fullName(app.ispSecondaryFirstName, app.ispSecondaryLastName)],
        ['Secondary ISP Phone', s(app.ispSecondaryPhone)],
        ['Secondary ISP Email', s(app.ispSecondaryEmail)],
        ['Secondary ISP Relationship', s(app.ispSecondaryRelationship)],
        ['On ALW Waitlist', s(app.onALWWaitlist)],
        ['Preferred RCFE', s(app.rcfeName)],
        ['Preferred RCFE Cities', s(app.rcfePreferredCities)],
        ['RCFE Admin', fullName(app.rcfeAdminFirstName, app.rcfeAdminLastName)],
        ['RCFE Admin Phone', s(app.rcfeAdminPhone)],
        ['RCFE Admin Email', s(app.rcfeAdminEmail)],
        ['SNF Diversion Notes', s(app.snfDiversionReason)],
      ],
    },
    {
      title: 'Financial and Program',
      rows: [
        ['Income Source', incomeSource],
        ['Monthly Income', s(app.monthlyIncome)],
        ['Share of Cost', s(app.shareOfCost)],
        ['Expected Room & Board Payment', s(app.expectedRoomBoardPayment)],
        [
          'Room & Board Acknowledged',
          app.ackRoomAndBoard === true ? 'Yes' : app.ackRoomAndBoard === false ? 'No' : '',
        ],
        [
          'SOC Determination Acknowledged',
          app.ackSocDetermination === true ? 'Yes' : app.ackSocDetermination === false ? 'No' : '',
        ],
        ['CalAIM Tracking Status', s(app.calaimTrackingStatus)],
        ['CalAIM Tracking Reason', s(app.calaimTrackingReason)],
      ],
    },
    {
      title: 'Authorization',
      rows: [
        ['T2038 Authorization Number', s(app.t2038AuthNumber || app.Authorization_Number_T2038)],
        ['T2038 Start', s(app.t2038AuthStart || app.Authorization_Start_Date_T2038)],
        ['T2038 End', s(app.t2038AuthEnd || app.Authorization_End_Date_T2038)],
      ],
    },
  ];

  return sections
    .map((section) => ({
      title: section.title,
      rows: section.rows
        .map(([label, value]) => ({ label, value: s(value) }))
        .filter((row) => row.value.length > 0),
    }))
    .filter((section) => section.rows.length > 0);
}

/** `Last, First - MRN - CS Summary.pdf` naming used for Drive / ZIP downloads. */
export function buildCsSummaryMemberFileName(application: Record<string, any> | null | undefined): string {
  const app = application || {};
  const clean = (value: unknown, fallback: string) => {
    const cleaned = s(value)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ');
    return cleaned || fallback;
  };
  const lastName = clean(app.memberLastName, 'UnknownLast');
  const firstName = clean(app.memberFirstName, 'UnknownFirst');
  const mrn = clean(
    app.memberMrn || app.memberMRN || app.medicalRecordNumber || app.mrn || app.Member_MRN || app.MCP_CIN,
    'UnknownMRN'
  );
  return `${lastName}, ${firstName} - ${mrn} - CS Summary.pdf`;
}
