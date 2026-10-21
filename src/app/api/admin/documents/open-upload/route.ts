import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();
const ALLOWED_PREFIXES = ['user_uploads/', 'admin_uploads/', 'documents/'];

const normalizeStoragePath = (candidate: string): string => {
  let next = clean(candidate).replace(/^\/+/, '');
  if (!next) return '';
  if (next.startsWith('gs://')) {
    const withoutScheme = next.replace(/^gs:\/\//i, '');
    const slash = withoutScheme.indexOf('/');
    next = slash >= 0 ? withoutScheme.slice(slash + 1) : '';
  }
  try {
    // Paths sometimes land URL-encoded in Firestore (spaces → %20).
    if (/%[0-9A-Fa-f]{2}/.test(next)) {
      next = decodeURIComponent(next);
    }
  } catch {
    // keep raw
  }
  return next.replace(/^o\//i, '');
};

const parseStoragePathFromDownloadUrl = (url: string): string => {
  try {
    const input = clean(url);
    if (!input) return '';
    if (input.startsWith('gs://')) return normalizeStoragePath(input);
    const parsed = new URL(input);
    if (!parsed.pathname.includes('/o/')) return '';
    const afterO = parsed.pathname.split('/o/')[1] || '';
    if (!afterO) return '';
    return normalizeStoragePath(decodeURIComponent(afterO.split('?')[0] || ''));
  } catch {
    return '';
  }
};

const isAllowedPath = (filePath: string) =>
  Boolean(filePath) &&
  !filePath.includes('..') &&
  ALLOWED_PREFIXES.some((prefix) => filePath.startsWith(prefix));

/**
 * Staff-only: stream an uploaded application document. Families cannot read uploads (Storage rules),
 * and this route checks admin access server-side so every staff member can always open them.
 */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const body = (await request.json().catch(() => ({}))) as {
      filePath?: string;
      downloadURL?: string;
    };
    const rawFilePath = clean(body.filePath);
    const rawDownloadUrl = clean(body.downloadURL);

    const candidatePaths = Array.from(
      new Set(
        [rawFilePath, parseStoragePathFromDownloadUrl(rawDownloadUrl)]
          .map(normalizeStoragePath)
          .filter(isAllowedPath)
      )
    );

    if (candidatePaths.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid document path.' }, { status: 400 });
    }

    const { adminStorage } = await import('@/firebase-admin');
    const defaultBucketName =
      process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      'studio-2881432245-f1d94.firebasestorage.app';
    const bucketCandidates = [
      adminStorage.bucket(),
      adminStorage.bucket(defaultBucketName),
      adminStorage.bucket('studio-2881432245-f1d94.appspot.com'),
      adminStorage.bucket('studio-2881432245-f1d94.firebasestorage.app'),
    ];

    let contents: Buffer | null = null;
    let contentType = 'application/octet-stream';
    let resolvedPath = candidatePaths[0];

    for (const bucket of bucketCandidates) {
      if (contents) break;
      for (const filePath of candidatePaths) {
        if (contents) break;
        try {
          const file = bucket.file(filePath);
          const [exists] = await file.exists();
          if (!exists) continue;
          const [metadata] = await file.getMetadata();
          const [bytes] = await file.download();
          contents = bytes;
          contentType = String(metadata?.contentType || contentType);
          resolvedPath = filePath;
          break;
        } catch {
          // try next path / bucket
        }
      }
    }

    // Recover slight path mismatches: same folder, matching leaf filename.
    if (!contents) {
      for (const bucket of bucketCandidates) {
        if (contents) break;
        for (const filePath of candidatePaths) {
          if (contents) break;
          const parts = filePath.split('/').filter(Boolean);
          const leaf = parts[parts.length - 1] || '';
          const parent = parts.slice(0, -1).join('/');
          if (!leaf || !parent || !isAllowedPath(`${parent}/`)) continue;
          try {
            const [listed] = await bucket.getFiles({ prefix: `${parent}/`, maxResults: 100 });
            const match = listed.find((f) => {
              const name = String(f.name || '');
              return name === filePath || name.endsWith(`/${leaf}`) || name.endsWith(leaf);
            });
            if (!match) continue;
            const [metadata] = await match.getMetadata();
            const [bytes] = await match.download();
            contents = bytes;
            contentType = String(metadata?.contentType || contentType);
            resolvedPath = String(match.name || filePath);
            break;
          } catch {
            // try next
          }
        }
      }
    }

    if (!contents && rawDownloadUrl && /^https?:\/\//i.test(rawDownloadUrl)) {
      try {
        const response = await fetch(rawDownloadUrl);
        if (response.ok) {
          contents = Buffer.from(await response.arrayBuffer());
          contentType = String(response.headers.get('content-type') || contentType);
        }
      } catch {
        // fall through to 404
      }
    }

    if (!contents) {
      return NextResponse.json({ success: false, error: 'Document not found in storage.' }, { status: 404 });
    }

    const fileName = resolvedPath.split('/').pop() || 'document';

    return new NextResponse(new Uint8Array(contents), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName.replace(/[^\x20-\x7E]|["\\]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('Open uploaded document failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Could not open document') },
      { status: 500 }
    );
  }
}
