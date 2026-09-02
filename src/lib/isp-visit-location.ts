export type IspVisitLocationSource = 'rcfe' | 'isp_location';

export type IspAssessmentPurpose = 'initial' | 'change_condition' | 'review' | string;

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

/**
 * Apply ISP Visit / current physical location from Caspio.
 * - RCFE: RCFE_Name, RCFE_Address, RCFE_City (+ state/zip when present)
 * - ISP location: ISP_Contact_* fields
 */
export function applyIspVisitLocationFromCaspio(
  resolved: Record<string, string>,
  source: Record<string, unknown>,
  locationSource: IspVisitLocationSource
): Record<string, string> {
  const next = { ...resolved };

  if (locationSource === 'rcfe') {
    const name = pick(source, ['RCFE_Name', 'Facility_Name']);
    const street = pick(source, ['RCFE_Address', 'RCFE_Street', 'RCFE_Street_Address']);
    const city = pick(source, ['RCFE_City']);
    const state = pick(source, ['RCFE_State']) || 'CA';
    const zip = pick(source, ['RCFE_Zip']);

    if (name) {
      next.p2_facility_name = name;
      next.isp_location_name = name;
    }
    if (street) {
      next.p2_current_street = street;
      next.isp_location_address = street;
      next.isp_contact_street = street;
    }
    if (city) {
      next.p2_current_city = city;
      next.isp_location_city = city;
      next.isp_contact_city = city;
    }
    next.p2_current_state = state;
    next.isp_location_state = state;
    next.isp_contact_state = state;
    if (zip) {
      next.p2_current_zip = zip;
      next.isp_location_zip = zip;
      next.isp_contact_zip = zip;
    }
    next.p2_current_type = 'RCFE';
    next.p2_current_type_other = 'RCFE';
    next.isp_location_type = 'RCFE';
    return next;
  }

  const name = pick(source, ['ISP_Contact_Location']);
  const street = pick(source, ['ISP_Contact_Address']);
  const city = pick(source, ['ISP_Contact_City']);
  const state = pick(source, ['ISP_Contact_State']) || 'CA';
  const zip = pick(source, ['ISP_Contact_Zip']);
  const locationType = pick(source, ['ISP_Location_Type']) || 'ISP Location';

  if (name) {
    next.p2_facility_name = name;
    next.isp_location_name = name;
  }
  if (street) {
    next.p2_current_street = street;
    next.isp_location_address = street;
    next.isp_contact_street = street;
  }
  if (city) {
    next.p2_current_city = city;
    next.isp_location_city = city;
    next.isp_contact_city = city;
  }
  next.p2_current_state = state;
  next.isp_location_state = state;
  next.isp_contact_state = state;
  if (zip) {
    next.p2_current_zip = zip;
    next.isp_location_zip = zip;
    next.isp_contact_zip = zip;
  }
  next.p2_current_type = locationType;
  next.p2_current_type_other = locationType;
  next.isp_location_type = locationType;
  return next;
}

export function summarizeIspVisitLocationFromCaspio(
  source: Record<string, unknown>,
  locationSource: IspVisitLocationSource
): { name: string; street: string; city: string; label: string } {
  if (locationSource === 'rcfe') {
    return {
      label: 'RCFE (Caspio)',
      name: pick(source, ['RCFE_Name', 'Facility_Name']),
      street: pick(source, ['RCFE_Address', 'RCFE_Street', 'RCFE_Street_Address']),
      city: pick(source, ['RCFE_City']),
    };
  }
  return {
    label: 'ISP location (Caspio)',
    name: pick(source, ['ISP_Contact_Location']),
    street: pick(source, ['ISP_Contact_Address']),
    city: pick(source, ['ISP_Contact_City']),
  };
}

function looksLikeRcfe(facilityType?: string, facilityName?: string, visitLocationSource?: string) {
  if (clean(visitLocationSource).toLowerCase() === 'rcfe') return true;
  const hay = `${clean(facilityType)} ${clean(facilityName)}`.toLowerCase();
  return /\brcfe\b/.test(hay) || hay.includes('residential care');
}

/**
 * Plain-language visit context for SW invite emails.
 */
export function formatIspVisitTypeForSwEmail(opts: {
  purpose?: IspAssessmentPurpose | null;
  visitLocationSource?: IspVisitLocationSource | string | null;
  facilityType?: string | null;
  facilityName?: string | null;
}): { headline: string; detailLines: string[]; subjectTag: string } {
  const purpose = clean(opts.purpose).toLowerCase();
  const locationSource = clean(opts.visitLocationSource).toLowerCase();
  const facilityType = clean(opts.facilityType);
  const facilityName = clean(opts.facilityName);
  const atRcfe = looksLikeRcfe(facilityType, facilityName, locationSource);
  const locationLabel =
    facilityType ||
    (locationSource === 'rcfe'
      ? 'RCFE'
      : locationSource === 'isp_location'
        ? 'ISP location (home, SNF, or other)'
        : '');

  if (purpose === 'initial') {
    if (atRcfe) {
      return {
        subjectTag: 'Initial — at RCFE',
        headline: 'Visit type: Initial ALFT assessment — member is already at an RCFE.',
        detailLines: [
          'This is an initial visit to a member who is already living at an RCFE.',
          facilityName ? `RCFE / facility: ${facilityName}` : '',
        ].filter(Boolean),
      };
    }
    return {
      subjectTag: 'Initial assessment',
      headline: 'Visit type: Initial ALFT assessment.',
      detailLines: [
        locationLabel
          ? `Current member location type: ${locationLabel}. Confirm the ISP location below before scheduling.`
          : 'Confirm the ISP location below before scheduling.',
      ],
    };
  }

  if (purpose === 'review') {
    if (atRcfe || locationSource === 'rcfe') {
      return {
        subjectTag: 'Reauthorization — at RCFE',
        headline: 'Visit type: Reauthorization (reassessment) visit — member is at an RCFE.',
        detailLines: [
          'This is a reauthorization visit.',
          facilityName ? `RCFE / facility: ${facilityName}` : '',
        ].filter(Boolean),
      };
    }
    return {
      subjectTag: 'Reauthorization',
      headline: 'Visit type: Reauthorization (reassessment) visit.',
      detailLines: [
        'This is a reauthorization visit. Occasionally the member may still be at home, SNF, or another ISP location — not yet at an RCFE.',
        locationLabel
          ? `Listed location type for this visit: ${locationLabel}.`
          : 'See the ISP location details below before scheduling.',
      ],
    };
  }

  if (purpose === 'change_condition') {
    return {
      subjectTag: 'Change of condition',
      headline: 'Visit type: Change of condition assessment.',
      detailLines: [
        atRcfe
          ? 'Member is listed at an RCFE for this visit.'
          : 'Member may be at home, SNF, RCFE, or another ISP location — confirm below before scheduling.',
        locationLabel ? `Listed location type: ${locationLabel}.` : '',
      ].filter(Boolean),
    };
  }

  return {
    subjectTag: 'ALFT assessment',
    headline: 'Visit type: Kaiser ALFT Care Assessment.',
    detailLines: locationLabel ? [`Listed location type: ${locationLabel}.`] : [],
  };
}
