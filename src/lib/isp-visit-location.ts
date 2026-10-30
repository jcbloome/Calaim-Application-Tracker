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

/**
 * ISP Contact / Current Physical fields only — never invents RCFE or app addresses.
 * Empty Caspio ISP location must stay empty so staff fill it before SW invite / ALFT.
 */
export function getIspLocationSnapshot(source: Record<string, unknown>): IspLocationSnapshot {
  return {
    name: pick(source, ['ISP_Contact_Location', 'ISP_Current_Location']),
    street: pick(source, ['ISP_Contact_Address', 'ISP_Current_Address']),
    city: pick(source, ['ISP_Contact_City', 'ISP_Current_City']),
    state: pick(source, ['ISP_Contact_State', 'ISP_Current_State']),
    zip: pick(source, ['ISP_Contact_Zip', 'ISP_Current_Zip']),
    phone: pick(source, ['ISP_Contact_Phone']),
    type: pick(source, ['ISP_Location_Type']),
  };
}

/** True when Caspio has a usable ISP street + city + name (or type) for SW visit emails. */
export function hasCompleteIspLocationInCaspio(source: Record<string, unknown>): {
  ok: boolean;
  reasons: string[];
  snapshot: IspLocationSnapshot;
} {
  const snapshot = getIspLocationSnapshot(source);
  const reasons: string[] = [];
  if (!snapshot.street) reasons.push('ISP_Contact_Address is empty in Caspio');
  if (!snapshot.city) reasons.push('ISP_Contact_City is empty in Caspio');
  if (!snapshot.state) reasons.push('ISP_Contact_State is empty in Caspio');
  if (!snapshot.zip) reasons.push('ISP_Contact_Zip is empty in Caspio');
  if (!snapshot.name && !snapshot.type) {
    reasons.push('ISP_Contact_Location (or ISP_Location_Type) is empty in Caspio');
  }
  return { ok: reasons.length === 0, reasons, snapshot };
}

export function getRcfeLocationSnapshot(source: Record<string, unknown>): IspLocationSnapshot {
  const name = pick(source, ['RCFE_Name', 'Facility_Name']);
  const street = pick(source, ['RCFE_Address', 'RCFE_Street', 'RCFE_Street_Address']);
  let city = pick(source, ['RCFE_City']);
  let state = pick(source, ['RCFE_State']);
  let zip = pick(source, ['RCFE_Zip']);

  // Caspio sometimes stores combined city/state/zip columns.
  const cityStateZip = pick(source, [
    'RCFE_City_RCFE_State_RCFE_Zip',
    'RCFE_City_State_Zip',
    'RCFE_City_RCFE_Zip',
    'RCFE_City_RCFE_State',
  ]);
  if (cityStateZip && (!city || !state || !zip)) {
    const zipMatch = cityStateZip.match(/\b(\d{5}(?:-\d{4})?)\b/);
    if (!zip && zipMatch) zip = zipMatch[1];
    const stateMatch = cityStateZip.match(/\b([A-Za-z]{2})\b(?=[^A-Za-z]*\d{5}|$)/);
    if (!state && stateMatch) state = stateMatch[1].toUpperCase();
    if (!city) {
      let remainder = cityStateZip;
      if (zipMatch) remainder = remainder.replace(zipMatch[0], ' ');
      if (stateMatch) remainder = remainder.replace(new RegExp(`\\b${stateMatch[1]}\\b`, 'i'), ' ');
      city = clean(remainder.replace(/[,\s]+/g, ' '));
    }
  }

  return {
    name,
    street,
    city,
    state: state || 'CA',
    zip,
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

/** ISP_Contact_Confirm_Date older than this is treated as stale when the member is at an RCFE. */
export const ISP_CONFIRM_MAX_AGE_DAYS = 30;

/** Today's date in Pacific time as a Caspio DATE/TIME value (`YYYY-MM-DDT00:00:00`). */
export function todayCaspioConfirmDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return `${parts}T00:00:00`;
}

export function getIspConfirmDate(source: Record<string, unknown>): {
  raw: string;
  ms: number;
  ageDays: number | null;
} {
  const raw = pick(source, [
    'ISP_Contact_Confirm_Date',
    'ISP_Contact_Confirm_Field',
    'ISP_Contact_Confirm',
    'ISP_Confirm_Date',
  ]);
  if (!raw) return { raw: '', ms: 0, ageDays: null };
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return { raw, ms: 0, ageDays: null };
  const ageDays = Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
  return { raw, ms, ageDays };
}

export function formatIspConfirmDate(raw: string): string {
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

export type IspLocationReadiness = {
  ok: boolean;
  reasons: string[];
  confirmDateRaw: string;
  confirmAgeDays: number | null;
  locationMatchesRcfe: boolean;
  confirmDateFresh: boolean;
};

/**
 * Member at RCFE: ISP_Contact_* must match RCFE_* and ISP_Contact_Confirm_Date must be recent.
 * Otherwise (home / SNF / other ISP): Caspio ISP_Contact_* address fields must be fully filled —
 * never invent addresses from the application or RCFE.
 */
export function evaluateIspLocationReadiness(
  source: Record<string, unknown>,
  visitLocationSource?: IspVisitLocationSource | string | null
): IspLocationReadiness {
  const confirm = getIspConfirmDate(source);
  const confirmDateFresh = confirm.ageDays !== null && confirm.ageDays <= ISP_CONFIRM_MAX_AGE_DAYS;
  if (clean(visitLocationSource).toLowerCase() !== 'rcfe') {
    const ispComplete = hasCompleteIspLocationInCaspio(source);
    return {
      ok: ispComplete.ok,
      reasons: ispComplete.reasons,
      confirmDateRaw: confirm.raw,
      confirmAgeDays: confirm.ageDays,
      locationMatchesRcfe: true,
      confirmDateFresh,
    };
  }
  const comparison = compareIspLocationToRcfe(source);
  const reasons: string[] = [];
  if (!comparison.hasRcfeData) {
    reasons.push('Member is marked at RCFE but RCFE_Name is empty in Caspio');
  } else if (!comparison.matches) {
    reasons.push(
      `ISP location does not match RCFE (${comparison.mismatches.map((m) => m.label).join(', ')})`
    );
  }
  if (!confirm.raw) {
    reasons.push('ISP_Contact_Confirm_Date is empty in Caspio');
  } else if (!confirmDateFresh) {
    reasons.push(
      `ISP_Contact_Confirm_Date ${formatIspConfirmDate(confirm.raw)} is older than ${ISP_CONFIRM_MAX_AGE_DAYS} days`
    );
  }
  return {
    ok: reasons.length === 0,
    reasons,
    confirmDateRaw: confirm.raw,
    confirmAgeDays: confirm.ageDays,
    locationMatchesRcfe: comparison.hasRcfeData && comparison.matches,
    confirmDateFresh,
  };
}

/** Caspio field payload to set ISP_Contact_* from RCFE_* (member at RCFE) and stamp today's confirm date. */
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
  updates.ISP_Contact_Confirm_Date = todayCaspioConfirmDate();
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
 * When visit location is RCFE, prefer RCFE_Name / RCFE_Address / RCFE_City / RCFE_State / RCFE_Zip
 * (where the member will go / already is). Otherwise use ISP_Contact_* / ISP_Current_*.
 */
export function applyIspVisitLocationFromCaspio(
  resolved: Record<string, string>,
  source: Record<string, unknown>,
  locationSource?: IspVisitLocationSource,
  _opts?: { preserveIspContactFields?: boolean }
): Record<string, string> {
  const next = { ...resolved };
  const preferRcfe = clean(locationSource).toLowerCase() === 'rcfe';
  const isp = getIspLocationSnapshot(source);
  const rcfe = getRcfeLocationSnapshot(source);

  // No cross-fallback: empty Caspio ISP must not pull RCFE/app addresses (and vice versa).
  const name = preferRcfe ? rcfe.name : isp.name;
  const street = preferRcfe ? rcfe.street : isp.street;
  const city = preferRcfe ? rcfe.city : isp.city;
  const rawState = preferRcfe ? rcfe.state : isp.state;
  const state = rawState
    ? /^[A-Za-z]{2}$/.test(rawState.trim())
      ? rawState.trim().toUpperCase()
      : rawState.trim()
    : preferRcfe
      ? 'CA'
      : '';
  const zip = preferRcfe ? rcfe.zip : isp.zip;
  const phone = preferRcfe ? rcfe.phone : isp.phone;
  const type = preferRcfe ? rcfe.type || 'RCFE' : isp.type;

  next.p2_facility_name = name;
  next.isp_location_name = name;
  next.p2_current_street = street;
  next.isp_location_address = street;
  next.isp_contact_street = street;
  next.p2_current_city = city;
  next.isp_location_city = city;
  next.isp_contact_city = city;
  next.p2_current_state = state;
  next.isp_location_state = state;
  next.isp_contact_state = state;
  next.p2_current_zip = zip;
  next.isp_location_zip = zip;
  next.isp_contact_zip = zip;
  if (phone) next.isp_contact_phone = phone;
  next.p2_current_type = type;
  next.p2_current_type_other = type;
  next.isp_location_type = type;
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
  if (next === 'n/a' || next === 'na' || next === 'none') return '';
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
    ? 'On arrival at the RCFE, ask for staff for this member (there may not be a single ISP contact person on file — e.g. large assisted living).'
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
    name ? `Name: ${name}` : opts.askCaregiverOnArrival ? 'Name: Ask for staff on arrival' : 'Name: Not on file in Caspio',
    relationship ? `Relationship: ${relationship}` : '',
    `Phone: ${phone || 'Not provided'}`,
    email ? `Email: ${email}` : 'Email: Not on file in Caspio',
    opts.askCaregiverOnArrival
      ? 'Also ask for staff for this member when you arrive at the RCFE (no single ISP contact person on file).'
      : '',
  ].filter(Boolean);

  const html = `
        <p style="margin: 0; font-weight: 700;">ISP Contact:</p>
        <p style="margin: 0;"><strong>Contact type:</strong> ${contactKind}</p>
        ${facilityName ? `<p style="margin: 0;"><strong>Facility / location:</strong> ${facilityName}</p>` : ''}
        <p style="margin: 0;"><strong>Name:</strong> ${
          name || (opts.askCaregiverOnArrival ? 'Ask for staff on arrival' : 'Not on file in Caspio')
        }</p>
        ${relationship ? `<p style="margin: 0;"><strong>Relationship:</strong> ${relationship}</p>` : ''}
        <p style="margin: 0;"><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <p style="margin: 0 0 ${opts.askCaregiverOnArrival ? '6px' : '12px'};"><strong>Email:</strong> ${
          email || 'Not on file in Caspio'
        }</p>
        ${
          opts.askCaregiverOnArrival
            ? `<p style="margin: 0 0 16px;">Also ask for staff for this member when you arrive at the RCFE (no single ISP contact person on file).</p>`
            : ''
        }
      `;

  return { contactKind, plainLines, html };
}
