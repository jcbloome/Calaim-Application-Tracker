import admin, { adminDb, adminStorage } from '@/firebase-admin';

const PDF_URL_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function clean(value: unknown) {
  return String(value || '').trim();
}

async function resolveApplicationRef(params: {
  applicationId?: string;
  userId?: string;
  memberClientId?: string;
  memberMrn?: string;
}): Promise<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> } | null> {
  const applicationId = clean(params.applicationId);
  const userId = clean(params.userId);
  const memberClientId = clean(params.memberClientId);
  const memberMrn = clean(params.memberMrn);

  if (applicationId) {
    if (userId) {
      const userAppRef = adminDb.doc(`users/${userId}/applications/${applicationId}`);
      const userAppSnap = await userAppRef.get();
      if (userAppSnap.exists) {
        return { ref: userAppRef, data: (userAppSnap.data() || {}) as Record<string, any> };
      }
    }

    const adminAppRef = adminDb.collection('applications').doc(applicationId);
    const adminAppSnap = await adminAppRef.get();
    if (adminAppSnap.exists) {
      return { ref: adminAppRef, data: (adminAppSnap.data() || {}) as Record<string, any> };
    }

    try {
      const groupSnap = await adminDb
        .collectionGroup('applications')
        .where(admin.firestore.FieldPath.documentId(), '==', applicationId)
        .limit(1)
        .get();
      if (!groupSnap.empty) {
        const snap = groupSnap.docs[0];
        return { ref: snap.ref, data: (snap.data() || {}) as Record<string, any> };
      }
    } catch {
      // collectionGroup may be unavailable without indexes in some environments
    }
  }

  const byKey = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: Record<string, any>; updatedMs: number }>();
  const add = (ref: FirebaseFirestore.DocumentReference, data: Record<string, any>) => {
    const updatedMs =
      Number(data?.lastUpdated?.toMillis?.()) ||
      Number(data?.updatedAt?.toMillis?.()) ||
      Date.parse(String(data?.lastUpdatedIso || data?.updatedAtIso || '')) ||
      0;
    const prev = byKey.get(ref.path);
    if (!prev || updatedMs >= prev.updatedMs) byKey.set(ref.path, { ref, data, updatedMs });
  };

  if (memberClientId) {
    try {
      const byId = await adminDb.collection('applications').doc(memberClientId).get();
      if (byId.exists) add(byId.ref, byId.data() || {});
    } catch {
      /* ignore */
    }
    for (const field of ['clientId2', 'caspioMatchedClientId2', 'memberClientId', 'Client_ID2', 'client_ID2']) {
      try {
        const snap = await adminDb.collection('applications').where(field, '==', memberClientId).limit(10).get();
        snap.docs.forEach((d) => add(d.ref, d.data() || {}));
      } catch {
        /* ignore */
      }
    }
  }

  if (memberMrn) {
    try {
      const snap = await adminDb.collection('applications').where('memberMrn', '==', memberMrn).limit(15).get();
      snap.docs.forEach((d) => add(d.ref, d.data() || {}));
    } catch {
      /* ignore */
    }
  }

  const ranked = Array.from(byKey.values()).sort((a, b) => b.updatedMs - a.updatedMs);
  return ranked[0] || null;
}

async function resolveDownloadUrl(filePath: string, providedUrl?: string) {
  const existing = clean(providedUrl);
  if (existing) return existing;
  const path = clean(filePath);
  if (!path) return '';
  try {
    const [signedUrl] = await adminStorage.bucket().file(path).getSignedUrl({
      action: 'read',
      expires: Date.now() + PDF_URL_TTL_MS,
    });
    return clean(signedUrl);
  } catch {
    return '';
  }
}

export type AttachGeneratedFormParams = {
  applicationId?: string;
  userId?: string;
  memberClientId?: string;
  memberMrn?: string;
  formName: string;
  fileName: string;
  filePath: string;
  downloadURL?: string;
  source?: string;
};

/**
 * Persist a generated PDF under the application `forms` array so it appears in Member Files.
 */
export async function attachGeneratedFormToApplication(
  params: AttachGeneratedFormParams
): Promise<{ attached: boolean; applicationPath?: string; reason?: string }> {
  const formName = clean(params.formName) || 'Generated Form';
  const fileName = clean(params.fileName) || `${formName}.pdf`;
  const filePath = clean(params.filePath);
  if (!filePath) {
    return { attached: false, reason: 'Missing storage path' };
  }

  const resolved = await resolveApplicationRef({
    applicationId: params.applicationId,
    userId: params.userId,
    memberClientId: params.memberClientId,
    memberMrn: params.memberMrn,
  });
  if (!resolved) {
    return { attached: false, reason: 'No matching application found' };
  }

  const downloadURL = await resolveDownloadUrl(filePath, params.downloadURL);
  const dateCompleted = new Date().toISOString();
  const uploadEntry = {
    fileName,
    filePath,
    downloadURL: downloadURL || null,
    uploadedAtIso: dateCompleted,
    source: clean(params.source) || 'generated-form',
  };

  const existingForms = Array.isArray(resolved.data?.forms) ? [...resolved.data.forms] : [];
  const existingIndex = existingForms.findIndex(
    (form: any) => clean(form?.name).toLowerCase() === formName.toLowerCase()
  );

  if (existingIndex >= 0) {
    const existing = existingForms[existingIndex] || {};
    const priorUploads = Array.isArray(existing.uploadedFiles) ? existing.uploadedFiles : [];
    existingForms[existingIndex] = {
      ...existing,
      name: formName,
      status: 'Completed',
      type: 'Upload',
      fileName,
      filePath,
      downloadURL: downloadURL || existing.downloadURL || null,
      href: downloadURL || existing.href || null,
      downloadHref: downloadURL || existing.downloadHref || null,
      dateCompleted,
      source: clean(params.source) || existing.source || 'generated-form',
      uploadedFiles: [...priorUploads, uploadEntry],
    };
  } else {
    existingForms.unshift({
      name: formName,
      status: 'Completed',
      type: 'Upload',
      fileName,
      filePath,
      downloadURL: downloadURL || null,
      href: downloadURL || null,
      downloadHref: downloadURL || null,
      dateCompleted,
      source: clean(params.source) || 'generated-form',
      uploadedFiles: [uploadEntry],
    });
  }

  await resolved.ref.set(
    {
      forms: existingForms,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { attached: true, applicationPath: resolved.ref.path };
}
