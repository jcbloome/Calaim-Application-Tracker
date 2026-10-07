/**
 * Kaiser referral address helpers.
 * Section 2.2 (where member currently lives) must NOT use MCP / Normal Housing / customary mailing.
 * For SNF, use Caspio Current Location (ISP_Current_* / ISP_Contact_*) only.
 */

import {
  getIspLocationSnapshot,
  getRcfeLocationSnapshot,
  type IspLocationSnapshot,
} from '@/lib/isp-visit-location';

const clean = (value: unknown) => String(value ?? '').trim();

const isBlankOrUnknown = (value: unknown) => {
  const next = clean(value);
  if (!next) return true;
  return /^(unknown|n\/?a|none|null|-)$/i.test(next);
};

const normalizeAddressKey = (value: string) =>
  clean(value)
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function composeReferralAddressLine(parts: {
  street?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
}): string {
  const street = clean(parts.street);
  const city = clean(parts.city);
  const state = clean(parts.state);
  const zip = clean(parts.zip);
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, cityStateZip]
    .filter(Boolean)
    .join(', ')
    .replace(/,\s*,/g, ', ')
    .trim();
}

function snapshotToLine(snapshot: IspLocationSnapshot): string {
  return composeReferralAddressLine({
    street: snapshot.street,
    city: snapshot.city,
    state: snapshot.state,
    zip: snapshot.zip,
  });
}

function pickFirstLine(...candidates: string[]): string {
  for (const candidate of candidates) {
    if (!isBlankOrUnknown(candidate)) return clean(candidate);
  }
  return '';
}

function pickField(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const wanted = key.toLowerCase();
    const direct = source[key];
    if (!isBlankOrUnknown(direct)) return clean(direct);
    for (const [k, value] of Object.entries(source || {})) {
      if (k.toLowerCase() === wanted && !isBlankOrUnknown(value)) return clean(value);
    }
  }
  return '';
}

/**
 * Flatten Caspio member + nested caspioRaw so ISP/RCFE helpers can read fields.
 */
export function flattenKaiserMemberSource(
  source: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!source || typeof source !== 'object') return {};
  const raw =
    source.caspioRaw && typeof source.caspioRaw === 'object'
      ? (source.caspioRaw as Record<string, unknown>)
      : {};
  return { ...raw, ...source };
}

/**
 * Member mailing address (MCP / Normal Housing / customary). Used for Section A mailing only.
 */
export function resolveKaiserReferralMailingAddress(
  source: Record<string, unknown> | null | undefined
): string {
  const flat = flattenKaiserMemberSource(source);

  const customary = composeReferralAddressLine({
    street: flat.customaryAddress || flat.memberCustomaryAddress,
    city: flat.customaryCity || flat.memberCustomaryCity,
    state: flat.customaryState || flat.memberCustomaryState,
    zip: flat.customaryZip || flat.memberCustomaryZip,
  });
  if (customary) return customary;

  const normalHousing = composeReferralAddressLine({
    street:
      flat.Normal_Housing_Street ||
      flat.Normal_Housing_Address ||
      flat['Normal Housing Street'] ||
      flat['Normal Housing Address'],
    city: flat.Normal_Housing_City || flat['Normal Housing City'],
    state: flat.Normal_Housing_State || flat['Normal Housing State'],
    zip: flat.Normal_Housing_Zip || flat['Normal Housing Zip'],
  });
  if (normalHousing) return normalHousing;

  // Application-only: do not treat currentAddress as mailing when customary exists elsewhere.
  return '';
}

/**
 * Caspio "Current Location" only (ISP_Current_* / ISP_Contact_*). Never MCP Member Address.
 */
export function resolveCaspioCurrentLocationFields(
  source: Record<string, unknown> | null | undefined
): { name: string; address: string } {
  if (!source || typeof source !== 'object') return { name: '', address: '' };
  const raw =
    source.caspioRaw && typeof source.caspioRaw === 'object'
      ? (source.caspioRaw as Record<string, unknown>)
      : null;
  // Read caspioRaw first so API aliases that fill ISP_Current_* from MCP Member_Address cannot win.
  const layers = raw ? [raw, source] : [source];
  const pick = (keys: string[]) => {
    for (const layer of layers) {
      const value = pickField(layer, keys);
      if (value) return value;
    }
    return '';
  };
  const name = pick(['ISP_Contact_Location', 'ISP_Current_Location']);
  const address = composeReferralAddressLine({
    street: pick(['ISP_Contact_Address', 'ISP_Current_Address']),
    city: pick(['ISP_Contact_City', 'ISP_Current_City']),
    state: pick(['ISP_Contact_State', 'ISP_Current_State']),
    zip: pick(['ISP_Contact_Zip', 'ISP_Current_Zip']),
  });
  return { name, address };
}

/** True when member is currently in a SNF (section 2.2 choice A). */
export function isKaiserReferralSnfLiving(
  source: Record<string, unknown> | null | undefined
): boolean {
  const flat = flattenKaiserMemberSource(source);
  const explicitChoice = pickField(flat, ['ALF_2_2_Choice', 'alft22Choice']).toUpperCase();
  if (explicitChoice === 'A') return true;

  const text = [
    pickField(flat, [
      'ISP_Location_Type',
      'Where_Living',
      'Describe_Member_Living_Situation',
      'Member_Current_Living_Situation',
      'Current_Living_Situation',
      'ISP_Current_Location',
      'currentLocation',
      'currentLocationType',
    ]),
    pickField(flat, ['SNF_Diversion_or_Transition', 'Pathway', 'pathway']),
  ]
    .join(' ')
    .toLowerCase();

  if (/\bsnf\b/.test(text) || text.includes('skilled nursing') || text.includes('nursing facility')) {
    // Pathway "SNF Diversion" alone means diverting FROM SNF (often still home) — only treat as
    // currently in SNF when location/type text says so, or pathway is Transition.
    if (text.includes('snf diversion') && !text.includes('snf transition')) {
      const locationOnly = pickField(flat, [
        'ISP_Location_Type',
        'Where_Living',
        'Describe_Member_Living_Situation',
        'Member_Current_Living_Situation',
        'Current_Living_Situation',
        'ISP_Current_Location',
        'currentLocation',
        'currentLocationType',
      ]).toLowerCase();
      return (
        /\bsnf\b/.test(locationOnly) ||
        locationOnly.includes('skilled nursing') ||
        locationOnly.includes('nursing facility')
      );
    }
    return true;
  }
  return false;
}

/**
 * Where the member currently lives (Section 2.2 facility name + address).
 * Referral launchers use only the address; staff type the ALF / Board and Care name by hand.
 * SNF: Caspio Current Location (ISP_*) only — never MCP Member Address / Normal Housing.
 * Otherwise: Caspio Current Location, then RCFE / ISP helpers, then application fields
 * that do not match the MCP mailing address.
 */
export function resolveKaiserReferralCurrentLocation(
  source: Record<string, unknown> | null | undefined
): { name: string; address: string } {
  const flat = flattenKaiserMemberSource(source);
  const mailing = resolveKaiserReferralMailingAddress(flat);
  const mailingKey = normalizeAddressKey(mailing);
  const caspioCurrent = resolveCaspioCurrentLocationFields(flat);

  if (isKaiserReferralSnfLiving(flat)) {
    return {
      name: caspioCurrent.name,
      address: caspioCurrent.address,
    };
  }

  const appName = isBlankOrUnknown(flat.currentLocationName) ? '' : clean(flat.currentLocationName);
  const appAddress = isBlankOrUnknown(flat.currentAddress)
    ? ''
    : composeReferralAddressLine({
        street: flat.currentAddress,
        city: flat.currentCity,
        state: flat.currentState,
        zip: flat.currentZip,
      });
  const safeAppAddress =
    appAddress && mailingKey && normalizeAddressKey(appAddress) === mailingKey ? '' : appAddress;

  const appRcfeName = isBlankOrUnknown(flat.rcfeName) ? '' : clean(flat.rcfeName);
  const appRcfeAddress = isBlankOrUnknown(flat.rcfeAddress) ? '' : clean(flat.rcfeAddress);

  const appIspName = isBlankOrUnknown(flat.ispFacilityName) ? '' : clean(flat.ispFacilityName);
  const appIspAddress = isBlankOrUnknown(flat.ispAddress)
    ? ''
    : composeReferralAddressLine({
        street: flat.ispAddress,
        city: flat.ispCity,
        state: flat.ispState,
        zip: flat.ispZip,
      });

  const isp = getIspLocationSnapshot(flat);
  const rcfe = getRcfeLocationSnapshot(flat);
  const ispLine = snapshotToLine(isp);
  const rcfeLine = snapshotToLine(rcfe);

  // Prefer true Caspio Current Location over helpers that may fall back to RCFE/MCP aliases.
  const name = pickFirstLine(
    caspioCurrent.name,
    appName,
    appRcfeName,
    appIspName,
    isp.name,
    rcfe.name
  );
  const address = pickFirstLine(
    caspioCurrent.address,
    ispLine,
    rcfeLine,
    appRcfeAddress,
    appIspAddress,
    safeAppAddress
  );

  return { name, address };
}
