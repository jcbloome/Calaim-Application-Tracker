import 'server-only';
import { randomUUID } from 'crypto';

/**
 * Build a Firebase download URL for a Storage object at send time (e.g. links emailed to ILS), so
 * tokened URLs never have to be saved in family-readable application documents.
 * Reuses the object's existing download token, or adds one. Returns '' when the file is missing.
 */
export async function mintStorageDownloadUrl(filePath: string): Promise<string> {
  const path = String(filePath || '').trim().replace(/^\/+/, '');
  if (!path || path.includes('..')) return '';

  const { adminStorage } = await import('@/firebase-admin');
  const bucket = adminStorage.bucket();
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) return '';

  const [metadata] = await file.getMetadata();
  let token = String((metadata?.metadata as Record<string, unknown> | undefined)?.firebaseStorageDownloadTokens || '')
    .split(',')[0]
    .trim();
  if (!token) {
    token = randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** Stored URL when present (legacy docs), else a freshly minted one from `filePath`. */
export async function resolveFormFileDownloadUrl(form: { downloadURL?: unknown; filePath?: unknown } | null | undefined) {
  const stored = String(form?.downloadURL || '').trim();
  if (stored) return stored;
  try {
    return await mintStorageDownloadUrl(String(form?.filePath || ''));
  } catch (error) {
    console.warn('[storage-download-url] Could not mint download URL:', error);
    return '';
  }
}
