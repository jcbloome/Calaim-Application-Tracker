import { NextRequest, NextResponse } from 'next/server';
import { cert, initializeApp, getApps, type ServiceAccount } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

type CleanupCandidate = {
  path: string;
  id: string;
  memberFirstName: string;
  oldLastName: string;
  newLastName: string;
};

const DEFAULT_SUFFIXES = new Set([
  'snp',
  'hmo',
  'ppo',
  'epo',
  'pos',
  'mmp',
  'dsnp',
  'd-snp',
  'planid',
]);

const normalizeToken = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');

const stripTrailingPlanSuffixes = (lastName: unknown, suffixes: Set<string>) => {
  const tokens = String(lastName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 0) {
    const token = normalizeToken(tokens[tokens.length - 1] || '');
    if (!suffixes.has(token)) break;
    tokens.pop();
  }
  return tokens.join(' ').trim();
};

let adminDb: FirebaseFirestore.Firestore | null = null;
try {
  const serviceAccountJson =
    String(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim() ||
    String(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '').trim() ||
    String(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').trim();
  const projectId = process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94';
  const cleanupAppName = 'cleanup-member-last-name-suffixes';

  if (serviceAccountJson) {
    try {
      const existingCleanupApp = getApps().find((app) => app.name === cleanupAppName);
      const cleanupApp =
        existingCleanupApp ||
        initializeApp(
          {
            projectId,
            credential: cert(JSON.parse(serviceAccountJson) as ServiceAccount),
          },
          cleanupAppName
        );
      adminDb = getFirestore(cleanupApp);
    } catch (parseError) {
      console.warn('Could not parse service account JSON for cleanup-member-last-name-suffixes route:', parseError);
    }
  }

  if (!adminDb) {
    if (!getApps().length) {
      initializeApp({ projectId });
    }
    adminDb = getFirestore();
  }
} catch (error) {
  console.error('Firebase Admin initialization error (cleanup-member-last-name-suffixes):', error);
}

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      apply?: boolean;
      suffixes?: string[];
      limit?: number;
    };

    const apply = body?.apply === true;
    const limit = Math.max(1, Math.min(5000, Number(body?.limit || 5000)));
    const suffixes = new Set(DEFAULT_SUFFIXES);
    if (Array.isArray(body?.suffixes)) {
      body.suffixes
        .map((value) => normalizeToken(String(value || '')))
        .filter(Boolean)
        .forEach((token) => suffixes.add(token));
    }

    const snapshot = await adminDb.collectionGroup('applications').get();
    const candidates: CleanupCandidate[] = [];

    snapshot.docs.slice(0, limit).forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const memberFirstName = String(data?.memberFirstName || '').trim();
      const oldLastName = String(data?.memberLastName || '').trim();
      if (!memberFirstName || !oldLastName) return;

      const newLastName = stripTrailingPlanSuffixes(oldLastName, suffixes);
      if (!newLastName || newLastName === oldLastName) return;

      candidates.push({
        path: doc.ref.path,
        id: doc.id,
        memberFirstName,
        oldLastName,
        newLastName,
      });
    });

    if (!apply) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        scanned: Math.min(snapshot.size, limit),
        matched: candidates.length,
        sample: candidates.slice(0, 25),
        message: 'Dry run complete. Re-run with {"apply": true} to write changes.',
      });
    }

    let updated = 0;
    let batch = adminDb.batch();
    let writesInBatch = 0;

    for (const candidate of candidates) {
      const ref = adminDb.doc(candidate.path);
      batch.update(ref, {
        memberLastName: candidate.newLastName,
        memberName: `${candidate.memberFirstName} ${candidate.newLastName}`.trim(),
        lastUpdated: FieldValue.serverTimestamp(),
      });
      updated += 1;
      writesInBatch += 1;

      if (writesInBatch >= 400) {
        await batch.commit();
        batch = adminDb.batch();
        writesInBatch = 0;
      }
    }

    if (writesInBatch > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      scanned: Math.min(snapshot.size, limit),
      matched: candidates.length,
      updated,
      sample: candidates.slice(0, 25),
      message: `Updated ${updated} application record(s).`,
    });
  } catch (error: any) {
    console.error('Error cleaning member last-name suffixes:', error);
    return NextResponse.json(
      { error: 'Failed to clean member last-name suffixes', details: String(error?.message || error) },
      { status: 500 }
    );
  }
}

