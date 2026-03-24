import { adminDb, default as admin } from '@/firebase-admin';
import { sendRoomBoardIlsSubmissionEmail } from '@/app/actions/send-email';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

type DispatchInput = {
  applicationId: string;
  applicationUserId?: string | null;
  triggeredByUid?: string | null;
  triggeredByEmail?: string | null;
};

type DispatchResult =
  | { status: 'sent'; applicationPath: string }
  | { status: 'already_sent'; applicationPath: string }
  | { status: 'not_ready'; reason: string; applicationPath: string }
  | { status: 'application_not_found' };

const AGREEMENT_FORM_NAMES = [
  'Room and Board/Tier Level Agreement',
  'Room and Board/Tier Level Commitment',
  'Room and Board Commitment',
];

const clean = (value: unknown, max = 400) => String(value || '').trim().slice(0, max);

export async function dispatchRoomBoardIlsIfReady(input: DispatchInput): Promise<DispatchResult> {
  const applicationId = clean(input.applicationId, 200);
  const applicationUserId = clean(input.applicationUserId, 200);
  if (!applicationId) return { status: 'application_not_found' };

  const refs = [];
  if (applicationUserId) {
    refs.push(adminDb.collection('users').doc(applicationUserId).collection('applications').doc(applicationId));
  }
  refs.push(adminDb.collection('applications').doc(applicationId));

  let appRef: FirebaseFirestore.DocumentReference | null = null;
  let app: Record<string, any> | null = null;
  for (const ref of refs) {
    const snap = await ref.get();
    if (snap.exists) {
      appRef = ref;
      app = (snap.data() || {}) as Record<string, any>;
      break;
    }
  }
  if (!appRef || !app) return { status: 'application_not_found' };

  const applicationPath = appRef.path;
  const agreementMeta = (app as any)?.roomBoardTierAgreement || {};
  if ((agreementMeta as any)?.ilsDispatch?.sentAt) {
    return { status: 'already_sent', applicationPath };
  }

  if (String(agreementMeta?.status || '').trim().toLowerCase() !== 'signed') {
    return { status: 'not_ready', reason: 'Agreement is not fully signed yet.', applicationPath };
  }

  const forms = Array.isArray((app as any)?.forms) ? ((app as any).forms as any[]) : [];
  const proofForm = forms.find((f) => String(f?.name || '').trim() === 'Proof of Income');
  if (!(proofForm && proofForm.status === 'Completed' && clean(proofForm.downloadURL, 2000))) {
    return { status: 'not_ready', reason: 'Proof of Income is missing or has no file.', applicationPath };
  }

  const agreementForm = forms.find((f) => AGREEMENT_FORM_NAMES.includes(String(f?.name || '').trim()));
  if (!(agreementForm && agreementForm.status === 'Completed' && clean(agreementForm.downloadURL, 2000))) {
    return { status: 'not_ready', reason: 'Signed Room and Board/Tier Level Agreement file is missing.', applicationPath };
  }

  const memberName = [clean((app as any)?.memberFirstName, 80), clean((app as any)?.memberLastName, 80)]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Member';
  const mrn = clean((app as any)?.memberMrn, 80);
  const rcfeName = clean((agreementMeta as any)?.rcfeName || (app as any)?.rcfeName, 180);
  const mcoAndTier = clean((agreementMeta as any)?.mcoAndTier, 120);
  const agreedAmount = clean((agreementMeta as any)?.agreedRoomBoardAmount, 40);
  const agreementUrl = clean((agreementForm as any)?.downloadURL, 2000);
  const proofUrl = clean((proofForm as any)?.downloadURL, 2000);

  await sendRoomBoardIlsSubmissionEmail({
    to: 'jocelyn@ilshealth.com',
    memberName,
    mrn: mrn || undefined,
    rcfeName: rcfeName || undefined,
    mcoAndTier: mcoAndTier || undefined,
    agreedRoomBoardAmount: agreedAmount || undefined,
    agreementDownloadUrl: agreementUrl,
    proofIncomeDownloadUrl: proofUrl,
  });

  // Track this send in ILS member update fields (Caspio + local cache).
  const clientId2 = clean((app as any)?.client_ID2 || (app as any)?.clientId2 || (app as any)?.Client_ID2, 120);
  const sentDateIso = new Date().toISOString().slice(0, 10);
  if (clientId2) {
    try {
      const credentials = getCaspioCredentialsFromEnv();
      const token = await getCaspioToken(credentials);
      const escapedClientId2 = clientId2.replace(/'/g, "''");
      const whereClause = `Client_ID2='${escapedClientId2}'`;
      const apiUrl = `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=${encodeURIComponent(whereClause)}`;
      await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ILS_RCFE_Sent_For_Contract_Date: sentDateIso,
        }),
      });
      await adminDb
        .collection('caspio_members_cache')
        .doc(clientId2)
        .set(
          {
            ILS_RCFE_Sent_For_Contract_Date: sentDateIso,
            cachedAt: new Date().toISOString(),
            Date_Modified: new Date().toISOString(),
          },
          { merge: true }
        );
    } catch (caspioErr) {
      console.warn('[room-board-ils-dispatch] Failed to update ILS member date:', caspioErr);
    }
  }

  await appRef.set(
    {
      roomBoardTierAgreement: {
        ilsDispatch: {
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          recipient: 'jocelyn@ilshealth.com',
          sentByUid: clean(input.triggeredByUid, 128) || null,
          sentByEmail: clean(input.triggeredByEmail, 320) || null,
          agreementFormName: clean((agreementForm as any)?.name, 160),
          proofFormName: clean((proofForm as any)?.name, 160),
          agreementDownloadUrl: agreementUrl,
          proofIncomeDownloadUrl: proofUrl,
          ilsContractSentDate: sentDateIso,
          clientId2: clientId2 || null,
        },
      },
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { status: 'sent', applicationPath };
}
