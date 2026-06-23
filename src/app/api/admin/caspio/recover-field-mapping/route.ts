import { NextRequest, NextResponse } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { requireAdminApiAuth, requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

type MappingRecord = Record<string, string>;
type NamedMappingRecord = Record<string, MappingRecord>;
type Candidate = {
  sourcePath: string;
  sourceType: 'shared' | 'user';
  uid?: string;
  lockedMappings: MappingRecord | null;
  currentDraftMappings: MappingRecord | null;
  namedDrafts: NamedMappingRecord;
  namedDraftMeta: Record<string, { savedAtIso?: string }>;
  lastDraftName: string;
  lockedDraftMeta: { draftName?: string; savedAtIso?: string; lockedAtIso?: string } | null;
  selectedMappings: MappingRecord | null;
  selectedDraftName: string;
  updatedAtMs: number;
  score: number;
};

const asTrimmed = (value: unknown) => String(value ?? '').trim();
const asErrorMessage = (error: unknown) => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const anyErr = error as any;
  return String(anyErr?.message || anyErr?.details || anyErr?.code || '').trim();
};

const normalizeMappingRecord = (value: unknown): MappingRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, mapped]) => [asTrimmed(key), asTrimmed(mapped)] as const)
    .filter(([key, mapped]) => key.length > 0 && mapped.length > 0);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
};

const normalizeNamedDrafts = (value: unknown): NamedMappingRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: NamedMappingRecord = {};
  Object.entries(value as Record<string, unknown>).forEach(([draftName, draftMappings]) => {
    const normalized = normalizeMappingRecord(draftMappings);
    if (!normalized) return;
    const name = asTrimmed(draftName);
    if (!name) return;
    result[name] = normalized;
  });
  return result;
};

const normalizeNamedDraftMeta = (value: unknown): Record<string, { savedAtIso?: string }> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, { savedAtIso?: string }> = {};
  Object.entries(value as Record<string, unknown>).forEach(([draftName, rawMeta]) => {
    if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) return;
    const savedAtIso = asTrimmed((rawMeta as Record<string, unknown>).savedAtIso);
    const name = asTrimmed(draftName);
    if (!name) return;
    result[name] = savedAtIso ? { savedAtIso } : {};
  });
  return result;
};

const toEpochMs = (value: unknown): number => {
  if (!value) return 0;
  if (typeof (value as any)?.toMillis === 'function') {
    const ms = Number((value as any).toMillis());
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof (value as any)?.toDate === 'function') {
    const dt = (value as any).toDate();
    const ms = dt instanceof Date ? dt.getTime() : NaN;
    return Number.isFinite(ms) ? ms : 0;
  }
  const parsed = new Date(String(value));
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const buildCandidate = (params: {
  sourcePath: string;
  sourceType: 'shared' | 'user';
  uid?: string;
  data: Record<string, unknown>;
}): Candidate | null => {
  const { sourcePath, sourceType, uid, data } = params;
  const lockedMappings = normalizeMappingRecord(data.lockedMappings);
  const currentDraftMappings = normalizeMappingRecord(data.currentDraftMappings);
  const namedDrafts = normalizeNamedDrafts(data.namedDrafts);
  const namedDraftMeta = normalizeNamedDraftMeta(data.namedDraftMeta);
  const lastDraftName = asTrimmed(data.lastDraftName);
  const rawLockedMeta = data.lockedDraftMeta;
  const lockedDraftMeta =
    rawLockedMeta && typeof rawLockedMeta === 'object' && !Array.isArray(rawLockedMeta)
      ? {
          draftName: asTrimmed((rawLockedMeta as Record<string, unknown>).draftName) || undefined,
          savedAtIso: asTrimmed((rawLockedMeta as Record<string, unknown>).savedAtIso) || undefined,
          lockedAtIso: asTrimmed((rawLockedMeta as Record<string, unknown>).lockedAtIso) || undefined,
        }
      : null;

  let selectedMappings: MappingRecord | null = null;
  let selectedDraftName = '';
  if (lockedMappings) {
    selectedMappings = lockedMappings;
    selectedDraftName = asTrimmed(lockedDraftMeta?.draftName) || 'Locked mapping';
  } else if (currentDraftMappings) {
    selectedMappings = currentDraftMappings;
    selectedDraftName = 'Current auto-saved draft';
  } else if (Object.keys(namedDrafts).length > 0) {
    const preferredName =
      (lastDraftName && namedDrafts[lastDraftName] ? lastDraftName : '') ||
      Object.entries(namedDrafts).sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)[0]?.[0] ||
      '';
    if (preferredName && namedDrafts[preferredName]) {
      selectedMappings = namedDrafts[preferredName];
      selectedDraftName = preferredName;
    }
  }
  if (!selectedMappings) return null;

  const mappedCount = Object.keys(selectedMappings).length;
  const updatedAtMs = Math.max(
    toEpochMs(data.updatedAt),
    toEpochMs((data as any).migratedFromLocalStorageAt),
    toEpochMs((data as any).lockedDraftSavedAtIso),
    toEpochMs(lockedDraftMeta?.savedAtIso),
    toEpochMs(lockedDraftMeta?.lockedAtIso)
  );
  const lockBias = lockedMappings ? 1_000_000_000_000 : 0;
  const score = lockBias + updatedAtMs + mappedCount;

  return {
    sourcePath,
    sourceType,
    uid,
    lockedMappings,
    currentDraftMappings,
    namedDrafts,
    namedDraftMeta,
    lastDraftName,
    lockedDraftMeta,
    selectedMappings,
    selectedDraftName,
    updatedAtMs,
    score,
  };
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = Boolean((body as any)?.dryRun);
    const bodyIdToken = asTrimmed((body as any)?.idToken);

    const authz = bodyIdToken
      ? await requireAdminApiAuthFromIdToken(bodyIdToken, { requireTwoFactor: false })
      : await requireAdminApiAuth(request, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }
    const { adminDb, uid } = authz;

    const sharedRef = adminDb.collection('admin-settings').doc('caspio-field-mapping');
    const userRef = adminDb.collection('users').doc(uid).collection('admin_settings').doc('caspio_field_mapping');

    let sharedSnap: any = null;
    let userSnap: any = null;
    let groupSnap: any = null;
    const readErrors: string[] = [];
    try {
      sharedSnap = await sharedRef.get();
    } catch (error) {
      readErrors.push(`shared read failed: ${asErrorMessage(error)}`);
    }
    try {
      userSnap = await userRef.get();
    } catch (error) {
      readErrors.push(`user read failed: ${asErrorMessage(error)}`);
    }
    try {
      groupSnap = await adminDb
        .collectionGroup('admin_settings')
        .where(FieldPath.documentId(), '==', 'caspio_field_mapping')
        .get();
    } catch (error) {
      readErrors.push(`collectionGroup read failed: ${asErrorMessage(error)}`);
    }

    const candidates: Candidate[] = [];
    if (sharedSnap?.exists) {
      const candidate = buildCandidate({
        sourcePath: sharedSnap.ref.path,
        sourceType: 'shared',
        data: (sharedSnap.data() || {}) as Record<string, unknown>,
      });
      if (candidate) candidates.push(candidate);
    }
    if (userSnap?.exists) {
      const candidate = buildCandidate({
        sourcePath: userSnap.ref.path,
        sourceType: 'user',
        uid,
        data: (userSnap.data() || {}) as Record<string, unknown>,
      });
      if (candidate) candidates.push(candidate);
    }
    (groupSnap?.docs || []).forEach((docSnap: any) => {
      if (docSnap.ref.path === userRef.path) return;
      const pathParts = String(docSnap.ref.path || '').split('/');
      const sourceUid = pathParts.length >= 4 && pathParts[0] === 'users' ? pathParts[1] : undefined;
      const candidate = buildCandidate({
        sourcePath: docSnap.ref.path,
        sourceType: 'user',
        uid: sourceUid,
        data: (docSnap.data() || {}) as Record<string, unknown>,
      });
      if (candidate) candidates.push(candidate);
    });

    const sorted = candidates.sort((a, b) => b.score - a.score);
    const best = sorted[0];
    if (!best || !best.selectedMappings || Object.keys(best.selectedMappings).length === 0) {
      const details = readErrors.filter(Boolean);
      const permissionHint = details.some((line) => /permission|insufficient|denied/i.test(line))
        ? 'Server credentials can authenticate but do not have Firestore read access to mapping documents in this project.'
        : '';
      return NextResponse.json(
        {
          success: false,
          error: 'No recoverable Caspio field mapping drafts found in Firebase.',
          scannedDocuments: Number(groupSnap?.size || 0) + (sharedSnap?.exists ? 1 : 0),
          details,
          permissionHint,
        },
        { status: 404 }
      );
    }

    const nowIso = new Date().toISOString();
    const recoveredDraftName = best.selectedDraftName || 'Recovered Firebase Draft';
    const recoveredSavedAtIso =
      asTrimmed(best.lockedDraftMeta?.savedAtIso) ||
      (best.updatedAtMs > 0 ? new Date(best.updatedAtMs).toISOString() : '');
    const lockedDraftMeta = {
      draftName: recoveredDraftName,
      savedAtIso: recoveredSavedAtIso || undefined,
      lockedAtIso: nowIso,
    };

    let persistenceWarning = '';
    if (!dryRun) {
      try {
        await Promise.all([
          sharedRef.set(
            {
              lockedMappings: best.selectedMappings,
              lockedDraftName: recoveredDraftName,
              lockedDraftSavedAtIso: recoveredSavedAtIso || null,
              lockedAtIso: nowIso,
              recoveredFromPath: best.sourcePath,
              recoveredByUid: uid,
              recoveredAtIso: nowIso,
              updatedByUid: uid,
              updatedAt: new Date(),
            },
            { merge: true }
          ),
          userRef.set(
            {
              lockedMappings: best.selectedMappings,
              currentDraftMappings: null,
              namedDrafts: best.namedDrafts,
              namedDraftMeta: best.namedDraftMeta,
              lastDraftName: best.lastDraftName || recoveredDraftName,
              lockedDraftMeta,
              recoveredFromPath: best.sourcePath,
              recoveredAtIso: nowIso,
              updatedByUid: uid,
              updatedAt: new Date(),
            },
            { merge: true }
          ),
        ]);
      } catch (writeError) {
        const writeMessage = asErrorMessage(writeError);
        const isPermissionIssue = /permission|insufficient|denied/i.test(writeMessage);
        if (isPermissionIssue) {
          persistenceWarning =
            'Recovered mapping was found but could not be written back to Firebase due to Firestore IAM permission limits.';
        } else {
          throw writeError;
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      persistedToFirebase: !dryRun && !persistenceWarning,
      persistenceWarning: persistenceWarning || null,
      recoveredFromPath: best.sourcePath,
      recoveredFromUid: best.uid || null,
      mappedFieldCount: Object.keys(best.selectedMappings).length,
      recoveredDraftName,
      recoveredSavedAtIso: recoveredSavedAtIso || null,
      lockedMappings: best.selectedMappings,
      namedDrafts: best.namedDrafts,
      namedDraftMeta: best.namedDraftMeta,
      lastDraftName: best.lastDraftName || recoveredDraftName,
      scannedCandidates: sorted.slice(0, 10).map((candidate) => ({
        sourcePath: candidate.sourcePath,
        sourceType: candidate.sourceType,
        uid: candidate.uid || null,
        mappedFieldCount: candidate.selectedMappings ? Object.keys(candidate.selectedMappings).length : 0,
        hasLockedMappings: Boolean(candidate.lockedMappings),
        updatedAtMs: candidate.updatedAtMs || null,
      })),
    });
  } catch (error: any) {
    const details = asErrorMessage(error);
    console.error('recover-field-mapping failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: details || 'Failed to recover Caspio mapping drafts.',
      },
      { status: 500 }
    );
  }
}
