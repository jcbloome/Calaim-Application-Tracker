/**
 * Kaiser referral address helpers.
 * Section 2.2 (where member currently lives) must NOT use MCP / Normal Housing / customary mailing.
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
 * Where the member currently lives (Section 2.2 facility name + address).
 * Referral launchers use only the address; staff type the ALF / Board and Care name by hand.
 * Prefers application current location, then ISP contact/current, then RCFE.
 * Never uses MCP Normal Housing / customary mailing.
 */
export function resolveKaiserReferralCurrentLocation(
  source: Record<string, unknown> | null | undefined
): { name: string; address: string } {
  const flat = flattenKaiserMemberSource(source);

  const appName = isBlankOrUnknown(flat.currentLocationName) ? '' : clean(flat.currentLocationName);
  const appAddress = isBlankOrUnknown(flat.currentAddress)
    ? ''
    : composeReferralAddressLine({
        street: flat.currentAddress,
        city: flat.currentCity,
        state: flat.currentState,
        zip: flat.currentZip,
      });

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

  const name = pickFirstLine(appName, appRcfeName, appIspName, isp.name, rcfe.name);
  const address = pickFirstLine(appAddress, appRcfeAddress, appIspAddress, ispLine, rcfeLine);

  return { name, address };
}
