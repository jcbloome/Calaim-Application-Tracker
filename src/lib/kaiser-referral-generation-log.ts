import { GLOBAL_CHANGE_LOG_COLLECTION, type WriteGlobalChangeLogInput } from '@/lib/global-change-log';

export const KAISER_REFERRAL_GENERATION_LOGS_COLLECTION = 'kaiser_referral_generation_logs';

const clean = (value: unknown) => String(value ?? '').trim();

type AdminDb = {
  collection: (name: string) => {
    add: (data: Record<string, unknown>) => Promise<{ id: string }>;
  };
};

type FieldValueModule = {
  firestore: { FieldValue: { serverTimestamp: () => unknown } };
};

export type KaiserReferralGenerationLogInput = {
  eventType?: 'generated' | 'downloaded' | 'previewed' | 'sent';
  memberName?: string;
  memberMrn?: string;
  clientId2?: string;
  applicationId?: string;
  staffName?: string;
  staffEmail?: string;
  fileName?: string;
  referralContext?: string;
  region?: string;
  source?: string;
  details?: Record<string, unknown>;
};

/** Persist Kaiser referral generation/download so Global Change Log can show it. */
export async function writeKaiserReferralGenerationLog(
  adminDb: AdminDb,
  adminModule: FieldValueModule,
  input: KaiserReferralGenerationLogInput
): Promise<{ generationLogId: string; globalLogId?: string }> {
  const eventType = (clean(input.eventType) as KaiserReferralGenerationLogInput['eventType']) || 'generated';
  const memberName = clean(input.memberName);
  const memberMrn = clean(input.memberMrn);
  const clientId2 = clean(input.clientId2);
  const applicationId = clean(input.applicationId);
  const staffName = clean(input.staffName);
  const staffEmail = clean(input.staffEmail).toLowerCase();
  const fileName = clean(input.fileName);
  const referralContext = clean(input.referralContext);
  const region = clean(input.region);
  const source = clean(input.source) || 'kaiser-referral';
  const atIso = new Date().toISOString();
  const serverTimestamp = adminModule.firestore.FieldValue.serverTimestamp();

  const verb =
    eventType === 'sent'
      ? 'sent'
      : eventType === 'previewed'
        ? 'previewed'
        : eventType === 'downloaded'
          ? 'downloaded'
          : 'generated';
  const summary = `Kaiser referral form ${verb}${memberName ? ` · ${memberName}` : ''}${
    memberMrn ? ` · MRN ${memberMrn}` : ''
  }`;

  const generationRef = await adminDb.collection(KAISER_REFERRAL_GENERATION_LOGS_COLLECTION).add({
    eventType,
    memberName: memberName || null,
    memberMrn: memberMrn || null,
    clientId2: clientId2 || null,
    applicationId: applicationId || null,
    staffName: staffName || null,
    staffEmail: staffEmail || null,
    fileName: fileName || null,
    referralContext: referralContext || null,
    region: region || null,
    source,
    details: input.details && typeof input.details === 'object' ? input.details : null,
    atIso,
    createdAt: serverTimestamp,
  });

  let globalLogId: string | undefined;
  try {
    const globalPayload: WriteGlobalChangeLogInput = {
      category: 'referral',
      action: `kaiser_referral_${eventType}`,
      summary,
      memberName: memberName || undefined,
      memberMrn: memberMrn || undefined,
      clientId2: clientId2 || undefined,
      applicationId: applicationId || undefined,
      staffName: staffName || undefined,
      staffEmail: staffEmail || undefined,
      source,
      href: '/admin/email-logs/kaiser-referrals',
      atIso,
      details: {
        eventType,
        fileName: fileName || undefined,
        referralContext: referralContext || undefined,
        region: region || undefined,
        ...(input.details || {}),
      },
    };
    const globalRef = await adminDb.collection(GLOBAL_CHANGE_LOG_COLLECTION).add({
      ...globalPayload,
      memberName: memberName || null,
      memberMrn: memberMrn || null,
      clientId2: clientId2 || null,
      applicationId: applicationId || null,
      staffName: staffName || null,
      staffEmail: staffEmail || null,
      details: globalPayload.details || null,
      href: globalPayload.href || null,
      createdAt: serverTimestamp,
    });
    globalLogId = globalRef.id;
  } catch (error) {
    console.warn('[kaiser-referral] failed to dual-write global_change_log:', error);
  }

  return { generationLogId: generationRef.id, globalLogId };
}
