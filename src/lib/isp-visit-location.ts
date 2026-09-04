export type IspVisitLocationSource = 'rcfe' | 'isp_location';

export type IspAssessmentPurpose = 'initial' | 'change_condition' | 'review' | string;

export type IspLocationSnapshot = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  type: string;
};

export type IspRcfeMismatch = {
  field: string;
  label: string;
  ispValue: string;
  rcfeValue: string;
};

const clean = (value: unknown, max = 300) => {
  const next = String(value ?? '').trim();
  return next.length > max ? next.slice(0, max) : next;
};

const getCaseInsensitive = (source: Record<string, unknown>, key: string): unknown => {
  const wanted = key.toLowerCase();
  const direct = source[key];
  if (direct != null && String(direct).trim() !== '') return direct;
  for (const [k, value] of Object.entries(source || {})) {
    if (k.toLowerCase() === wanted) return value;
  }
  return undefined;
};

const pick = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = clean(getCaseInsensitive(source, key));
    if (value) return value;
  }
  return '';
};

const normalizeForCompare = (value: string) =>
  clean(value)
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    // Treat common street abbreviations as equivalent (South vs S, Avenue vs Ave, etc.).
    .replace(/\bsouth\b/g, 's')
    .replace(/\bnorth\b/g, 'n')
    .replace(/\beast\b/g, 'e')
    .replace(/\bwest\b/g, 'w')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bapartment\b/g, 'apt')
    .replace(/\bsuite\b/g, 'ste')
    .replace(/\s+/g, ' ')
    .trim();

export function getIspLocationSnapshot(source: Record<string, unknown>): IspLocationSnapshot {
  return {
    name: pick(source, ['ISP_Contact_Location']),
    street: pick(source, ['ISP_Contact_Address']),
    city: pick(source, ['ISP_Contact_City']),
    state: pick(source, ['ISP_Contact_State']) || 'CA',
    zip: pick(source, ['ISP_Contact_Zip']),
    phone: pick(source, ['ISP_Contact_Phone']),
    type: pick(source, ['ISP_Location_Type']) || 'ISP Location',
  };
}

export function getRcfeLocationSnapshot(source: Record<string, unknown>): IspLocationSnapshot {
  return {
    name: pick(source, ['RCFE_Name', 'Facility_Name']),
    street: pick(source, ['RCFE_Address', 'RCFE_Street', 'RCFE_Street_Address']),
    city: pick(source, ['RCFE_City']),
    state: pick(source, ['RCFE_State']) || 'CA',
    zip: pick(source, ['RCFE_Zip']),
    phone: pick(source, [
      'RCFE_Admin_RCFE_Owner_Phone',
      'RCFE_Owner_Phone',
      'RCFE_Admin_Phone',
      'RCFE_Administrator_Phone',
      'RCFE_Phone',
      'RCFE_Facility_Phone',
    ]),
    type: 'RCFE',
  };
}

/** Caspio field payload to set ISP_Contact_* from RCFE_* (member at RCFE). */
export function buildIspContactUpdatesFromRcfe(source: Record<string, unknown>): Record<string, string> {
  const rcfe = getRcfeLocationSnapshot(source);
  const updates: Record<string, string> = {};
  if (rcfe.name) updates.ISP_Contact_Location = rcfe.name;
  if (rcfe.street) updates.ISP_Contact_Address = rcfe.street;
  if (rcfe.city) updates.ISP_Contact_City = rcfe.city;
  if (rcfe.state) updates.ISP_Contact_State = rcfe.state;
  if (rcfe.zip) updates.ISP_Contact_Zip = rcfe.zip;
  if (rcfe.phone) updates.ISP_Contact_Phone = rcfe.phone;
  updates.ISP_Location_Type = 'RCFE';
  return updates;
}

export function compareIspLocationToRcfe(source: Record<string, unknown>): {
  isp: IspLocationSnapshot;
  rcfe: IspLocationSnapshot;
  mismatches: IspRcfeMismatch[];
  matches: boolean;
  hasRcfeData: boolean;
  hasIspData: boolean;
} {
  const isp = getIspLocationSnapshot(source);
  const rcfe = getRcfeLocationSnapshot(source);

  // Compare when RCFE_Name is present (and RCFE_Address when present).
  const pairs: Array<{ field: string; label: string; ispValue: string; rcfeValue: string }> = [];
  if (rcfe.name) {
    pairs.push({
      field: 'name',
      label: 'RCFE_Name',
      ispValue: isp.name,
      rcfeValue: rcfe.name,
    });
  }
  if (rcfe.street) {
    pairs.push({
      field: 'street',
      label: 'RCFE_Address',
      ispValue: isp.street,
      rcfeValue: rcfe.street,
    });
  }

  const mismatches = pairs.filter((row) => {
    if (!row.ispValue) return true;
    return normalizeForCompare(row.ispValue) !== normalizeForCompare(row.rcfeValue);
  });
  const hasRcfeData = Boolean(rcfe.name);
  const hasIspData = Boolean(isp.name || isp.street || isp.city);
  return {
    isp,
    rcfe,
    mismatches,
    matches: hasRcfeData ? mismatches.length === 0 : true,
    hasRcfeData,
    hasIspData,
  };
}

/**
 * Apply ISP Visit / current physical location from Caspio into form/tool fields.
 * Always uses ISP_Contact_* (never RCFE) so the tool matches Caspio ISP current location.
 * visitLocationSource is kept for visit-type / email context only.
 */
export function applyIspVisitLocationFromCaspio(
  resolved: Record<string, string>,
  source: Record<string, unknown>,
  _locationSource?: IspVisitLocationSource,
  _opts?: { preserveIspContactFields?: boolean }
): Record<string, string> {
  const next = { ...resolved };
  const isp = getIspLocationSnapshot(source);

  if (isp.name) {
    next.p2_facility_name = isp.name;
    next.isp_location_name = isp.name;
  }
  if (isp.street) {
    next.p2_current_street = isp.street;
    next.isp_location_address = isp.street;
    next.isp_contact_street = isp.street;
  }
  if (isp.city) {
    next.p2_current_city = isp.city;
    next.isp_location_city = isp.city;
    next.isp_contact_city = isp.city;
  }
  next.p2_current_state = isp.state || 'CA';
  next.isp_location_state = isp.state || 'CA';
  next.isp_contact_state = isp.state || 'CA';
  if (isp.zip) {
    next.p2_current_zip = isp.zip;
    next.isp_location_zip = isp.zip;
    next.isp_contact_zip = isp.zip;
  }
  if (isp.phone) next.isp_contact_phone = isp.phone;
  next.p2_current_type = isp.type;
  next.p2_current_type_other = isp.type;
  next.isp_location_type = isp.type;
  return next;
}

export function summarizeIspVisitLocationFromCaspio(
  source: Record<string, unknown>,
  locationSource: IspVisitLocationSource
): { name: string; street: string; city: string; phone: string; label: string } {
  if (locationSource === 'rcfe') {
    const rcfe = getRcfeLocationSnapshot(source);
    return {
      label: 'RCFE (Caspio reference)',
      name: rcfe.name,
      street: rcfe.street,
      city: rcfe.city,
      phone: rcfe.phone,
    };
  }
  const isp = getIspLocationSnapshot(source);
  return {
    label: 'ISP location (Caspio)',
    name: isp.name,
    street: isp.street,
    city: isp.city,
    phone: isp.phone,
  };
}

function looksLikeRcfe(facilityType?: string, facilityName?: string, visitLocationSource?: string) {
  if (clean(visitLocationSource).toLowerCase() === 'rcfe') return true;
  const hay = `${clean(facilityType)} ${clean(facilityName)}`.toLowerCase();
  return /\brcfe\b/.test(hay) || hay.includes('residential care');
}

/** Canonical purpose values used on ALFT `p1_purpose` and assignment `prefillPurpose`. */
export type IspAssessmentPurposeValue = 'initial' | 'change_condition' | 'review';

export function normalizeIspAssessmentPurpose(raw?: unknown): IspAssessmentPurposeValue | '' {
  const next = clean(raw).toLowerCase();
  if (next === 'initial' || next === 'change_condition' || next === 'review') return next;
  return '';
}

/** Short label for staff email subjects/bodies (Initial vs Reassessment). */
export function formatIspAssessmentTypeLabel(purpose?: IspAssessmentPurpose | null): string {
  const next = normalizeIspAssessmentPurpose(purpose);
  if (next === 'initial') return 'Initial assessment';
  if (next === 'review') return 'Reassessment';
  if (next === 'change_condition') return 'Change of condition assessment';
  return '';
}

/**
 * Plain-language visit context for SW invite emails.
 * Always leads with Initial assessment vs Reassessment when purpose is known.
 */
export function formatIspVisitTypeForSwEmail(opts: {
  purpose?: IspAssessmentPurpose | null;
  visitLocationSource?: IspVisitLocationSource | string | null;
  facilityType?: string | null;
  facilityName?: string | null;
  askCaregiverOnArrival?: boolean;
}): { headline: string; detailLines: string[]; subjectTag: string } {
  const purpose = clean(opts.purpose).toLowerCase();
  const locationSource = clean(opts.visitLocationSource).toLowerCase();
  const facilityType = clean(opts.facilityType);
  const facilityName = clean(opts.facilityName);
  const askCaregiverOnArrival = Boolean(opts.askCaregiverOnArrival);
  const atRcfe = looksLikeRcfe(facilityType, facilityName, locationSource);
  const locationLabel =
    facilityType ||
    (locationSource === 'rcfe'
      ? 'RCFE'
      : locationSource === 'isp_location'
        ? 'ISP location (home, SNF, or other)'
        : '');
  const caregiverLine = askCaregiverOnArrival
    ? 'On arrival at the RCFE, ask for the caregiver assigned to this member (ISP contact phone/email may not be on file).'
    : '';

  if (purpose === 'initial') {
    if (atRcfe) {
      return {
        subjectTag: 'Initial assessment — at RCFE',
        headline: 'Assessment type: Initial assessment — member is already at an RCFE.',
        detailLines: [
          'This is an initial assessment visit for a member who is already living at an RCFE.',
          facilityName ? `RCFE / facility: ${facilityName}` : '',
          caregiverLine,
        ].filter(Boolean),
      };
    }
    return {
      subjectTag: 'Initial assessment',
      headline: 'Assessment type: Initial assessment.',
      detailLines: [
        locationLabel
          ? `Current member location type: ${locationLabel}. Confirm the ISP location below before scheduling.`
          : 'Confirm the ISP location below before scheduling.',
        caregiverLine,
      ].filter(Boolean),
    };
  }

  if (purpose === 'review') {
    if (atRcfe || locationSource === 'rcfe') {
      return {
        subjectTag: 'Reassessment — at RCFE',
        headline: 'Assessment type: Reassessment — member is at an RCFE.',
        detailLines: [
          'This is a reassessment (reauthorization) visit.',
          facilityName ? `RCFE / facility: ${facilityName}` : '',
          caregiverLine,
        ].filter(Boolean),
      };
    }
    return {
      subjectTag: 'Reassessment',
      headline: 'Assessment type: Reassessment.',
      detailLines: [
        'This is a reassessment (reauthorization) visit. Occasionally the member may still be at home, SNF, or another ISP location — not yet at an RCFE.',
        locationLabel
          ? `Listed location type for this visit: ${locationLabel}.`
          : 'See the ISP location details below before scheduling.',
        caregiverLine,
      ].filter(Boolean),
    };
  }

  if (purpose === 'change_condition') {
    return {
      subjectTag: 'Change of condition assessment',
      headline: 'Assessment type: Change of condition assessment.',
      detailLines: [
        atRcfe
          ? 'Member is listed at an RCFE for this visit.'
          : 'Member may be at home, SNF, RCFE, or another ISP location — confirm below before scheduling.',
        locationLabel ? `Listed location type: ${locationLabel}.` : '',
        caregiverLine,
      ].filter(Boolean),
    };
  }

  return {
    subjectTag: 'ALFT assessment',
    headline: 'Assessment type: Kaiser ALFT Care Assessment.',
    detailLines: [locationLabel ? `Listed location type: ${locationLabel}.` : '', caregiverLine].filter(Boolean),
  };
}

export type IspContactForSwEmail = {
  contactName?: string | null;
  contactFirst?: string | null;
  contactLast?: string | null;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  locationType?: string | null;
  facilityName?: string | null;
  visitLocationSource?: string | null;
  askCaregiverOnArrival?: boolean;
};

/**
 * Always include phone; label whether this is an RCFE facility contact or a named Caspio contact.
 */
export function formatIspContactBlockForSwEmail(opts: IspContactForSwEmail): {
  contactKind: string;
  plainLines: string[];
  html: string;
} {
  const first = clean(opts.contactFirst);
  const last = clean(opts.contactLast);
  const name = clean(opts.contactName) || [first, last].filter(Boolean).join(' ').trim();
  const relationship = clean(opts.relationship);
  const phone = clean(opts.phone);
  const email = clean(opts.email);
  const locationType = clean(opts.locationType);
  const facilityName = clean(opts.facilityName);
  const visitSource = clean(opts.visitLocationSource).toLowerCase();
  const atRcfe =
    visitSource === 'rcfe' ||
    /\brcfe\b/i.test(locationType) ||
    /\brcfe\b/i.test(facilityName) ||
    /^admin$/i.test(relationship) ||
    /facility|rcfe admin|administrator/i.test(relationship);

  let contactKind = 'ISP contact';
  if (name && atRcfe) contactKind = 'RCFE contact';
  else if (name) contactKind = 'Named ISP contact';
  else if (atRcfe) contactKind = 'RCFE facility phone';
  else contactKind = 'ISP contact phone';

  const plainLines = [
    'ISP Contact:',
    `Contact type: ${contactKind}`,
    facilityName ? `Facility / location: ${facilityName}` : '',
    name ? `Name: ${name}` : 'Name: Not on file in Caspio',
    relationship ? `Relationship: ${relationship}` : '',
    `Phone: ${phone || 'Not provided'}`,
    email ? `Email: ${email}` : 'Email: Not on file in Caspio',
    opts.askCaregiverOnArrival
      ? 'Also ask for the caregiver assigned to this member when you arrive at the RCFE.'
      : '',
  ].filter(Boolean);

  const html = `
        <p style="margin: 0; font-weight: 700;">ISP Contact:</p>
        <p style="margin: 0;"><strong>Contact type:</strong> ${contactKind}</p>
        ${facilityName ? `<p style="margin: 0;"><strong>Facility / location:</strong> ${facilityName}</p>` : ''}
        <p style="margin: 0;"><strong>Name:</strong> ${name || 'Not on file in Caspio'}</p>
        ${relationship ? `<p style="margin: 0;"><strong>Relationship:</strong> ${relationship}</p>` : ''}
        <p style="margin: 0;"><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <p style="margin: 0 0 ${opts.askCaregiverOnArrival ? '6px' : '12px'};"><strong>Email:</strong> ${
          email || 'Not on file in Caspio'
        }</p>
        ${
          opts.askCaregiverOnArrival
            ? `<p style="margin: 0 0 16px;">Also ask for the caregiver assigned to this member when you arrive at the RCFE.</p>`
            : ''
        }
      `;

  return { contactKind, plainLines, html };
}
