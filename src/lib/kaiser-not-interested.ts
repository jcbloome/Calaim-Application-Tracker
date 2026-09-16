export const KAISER_NOT_INTERESTED_COLLECTION = 'kaiser_not_interested_members';

export const KAISER_NOT_INTERESTED_STATUS = 'Not interested';

export const normalizeKaiserNotInterestedKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const isNotInterestedKaiserStatus = (value: unknown) => {
  const key = normalizeKaiserNotInterestedKey(value);
  if (!key) return false;
  return (
    key === 'not interested' ||
    key === 'member not interested' ||
    (key.includes('not interested') && !key.includes('on hold'))
  );
};

export const buildKaiserNotInterestedDocId = (params: {
  applicationId?: string;
  clientId2?: string;
  memberMrn?: string;
  memberFirstName?: string;
  memberLastName?: string;
}) => {
  const applicationId = String(params.applicationId || '').trim();
  if (applicationId) return applicationId.slice(0, 700);
  const clientId2 = String(params.clientId2 || '').trim();
  if (clientId2) return `client_${clientId2}`.replace(/[\/#?[\]]/g, '_').slice(0, 700);
  const mrn = String(params.memberMrn || '').trim();
  const first = String(params.memberFirstName || '').trim().toLowerCase();
  const last = String(params.memberLastName || '').trim().toLowerCase();
  const fallback = [mrn, last, first].filter(Boolean).join('_') || `ni_${Date.now()}`;
  return fallback.replace(/[\/#?[\]]/g, '_').slice(0, 700);
};
