/** Blank LIC 602A (Medical Assessment / Physician's Report). The old CDSS URL now redirects to a 404. */
export const LIC_602A_FORM_URL =
  'https://static1.squarespace.com/static/5513063be4b069b54e721157/t/6a909c9dd14c834c6b67715e/1787862173427/residential-care-facilities-for-the-elderly-rcfe-602a-form.pdf';

const LEGACY_LIC_602A_URL_PATTERN = /cdss\.ca\.gov\/cdssweb\/entres\/forms\/english\/lic602a\.pdf/i;

/** Applications saved before the link change still carry the dead CDSS href on their form entry. */
export const resolveFormHref = (href?: string | null) => {
  const value = String(href || '').trim();
  return LEGACY_LIC_602A_URL_PATTERN.test(value) ? LIC_602A_FORM_URL : value;
};
