import admin, { adminAuth, adminDb } from '@/firebase-admin';

const clean = (value: unknown, max = 220) => String(value ?? '').trim().slice(0, max);

function randomPassword(length = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export type SwPortalRecord = {
  email: string;
  displayName?: string;
  isActive?: boolean;
  sw_id?: string;
  SW_ID?: string;
  county?: string;
  permissions?: {
    visitVerification?: boolean;
    memberQuestionnaire?: boolean;
    claimsSubmission?: boolean;
  };
  [key: string]: unknown;
};

export async function findActiveSocialWorkerByEmail(email: string): Promise<{
  ref: { id: string; set: (...args: any[]) => Promise<any> };
  data: SwPortalRecord;
} | null> {
  const normalizedEmail = clean(email, 220).toLowerCase();
  if (!normalizedEmail) return null;

  const emailDoc = await adminDb.collection('socialWorkers').doc(normalizedEmail).get();
  if (emailDoc.exists) {
    const data = emailDoc.data() as SwPortalRecord;
    if (Boolean(data?.isActive)) {
      return { ref: emailDoc.ref, data: { ...data, email: normalizedEmail } };
    }
  }

  const byEmail = await adminDb.collection('socialWorkers').where('email', '==', normalizedEmail).limit(5).get();
  for (const docSnap of byEmail.docs) {
    const data = docSnap.data() as SwPortalRecord;
    if (Boolean(data?.isActive)) {
      return { ref: docSnap.ref, data: { ...data, email: normalizedEmail } };
    }
  }

  return null;
}

/**
 * Ensure a Firebase Auth login exists for an active portal SW.
 * Does not set/reset password for existing Auth users.
 */
export async function ensureSocialWorkerAuthUser(params: {
  email: string;
  displayName?: string;
  swId?: string;
  county?: string;
  createdBy?: string;
  activatePortal?: boolean;
}): Promise<{
  uid: string;
  email: string;
  created: boolean;
  displayName: string;
}> {
  const email = clean(params.email, 220).toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('A valid social worker email is required.');
  }

  const displayName =
    clean(params.displayName, 140) ||
    email.split('@')[0] ||
    'Social Worker';
  const swId = clean(params.swId, 80);
  const county = clean(params.county, 120);
  const createdBy = clean(params.createdBy, 220) || 'system';
  const activatePortal = params.activatePortal !== false;

  let userRecord: Awaited<ReturnType<typeof adminAuth.getUserByEmail>> | null = null;
  let created = false;
  try {
    userRecord = await adminAuth.getUserByEmail(email);
  } catch (error: any) {
    if (String(error?.code || '').trim() !== 'auth/user-not-found') throw error;
  }

  if (!userRecord) {
    userRecord = await adminAuth.createUser({
      email,
      password: randomPassword(),
      displayName,
      emailVerified: false,
      disabled: false,
    });
    created = true;
  } else if (displayName && userRecord.displayName !== displayName) {
    try {
      await adminAuth.updateUser(userRecord.uid, { displayName });
    } catch {
      // best-effort
    }
  }

  const uid = userRecord.uid;

  try {
    const existingClaims = (userRecord.customClaims || {}) as Record<string, unknown>;
    await adminAuth.setCustomUserClaims(uid, {
      ...existingClaims,
      socialWorker: true,
    });
  } catch (claimError) {
    console.warn('Failed to set socialWorker claim during provision:', claimError);
  }

  const permissions = {
    visitVerification: true,
    memberQuestionnaire: true,
    claimsSubmission: true,
  };

  const payload: Record<string, unknown> = {
    email,
    displayName,
    role: 'social_worker',
    isActive: activatePortal,
    permissions,
    caspioEmailSource: 'CalAIM_tbl_Social_Worker.SW_email',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (swId) {
    payload.sw_id = swId;
    payload.SW_ID = swId;
  }
  if (county) payload.county = county;

  // Keep email-keyed doc (how admin toggle writes first-time) and UID-keyed doc for rules.
  const emailDoc = await adminDb.collection('socialWorkers').doc(email).get();
  if (!emailDoc.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    payload.createdBy = createdBy;
  }
  await adminDb.collection('socialWorkers').doc(email).set(payload, { merge: true });

  const uidPayload = {
    ...payload,
    migratedFrom: email,
  };
  const uidDoc = await adminDb.collection('socialWorkers').doc(uid).get();
  if (!uidDoc.exists) {
    uidPayload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    uidPayload.createdBy = createdBy;
  }
  await adminDb.collection('socialWorkers').doc(uid).set(uidPayload, { merge: true });

  return { uid, email, created, displayName };
}
