import {
  type Firestore,
  type WriteBatch,
  writeBatch,
  waitForPendingWrites,
} from 'firebase/firestore';

const DEFAULT_INTER_BATCH_DELAY_MS = 350;

const isRetryableFirestoreWriteError = (error: unknown): boolean => {
  const message = String((error as { message?: string })?.message || error || '');
  return /queued writes|resource-exhausted|write stream exhausted|deadline-exceeded|unavailable|internal/i.test(
    message
  );
};

/** Wait for the Firestore client write pipeline to fully drain (helps after large uploads). */
export async function drainFirestoreWriteQueue(
  firestore: Firestore,
  options?: { rounds?: number; pauseMs?: number }
): Promise<void> {
  const rounds = Math.max(1, options?.rounds ?? 4);
  const pauseMs = options?.pauseMs ?? 200;
  for (let i = 0; i < rounds; i += 1) {
    await waitForPendingWrites(firestore);
    if (pauseMs > 0 && i < rounds - 1) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }
}

/** Commit a batch and drain the Firestore write stream to avoid queued-write exhaustion. */
export async function commitWriteBatchThrottled(
  firestore: Firestore,
  batch: WriteBatch,
  options?: { delayAfterMs?: number; maxRetries?: number }
): Promise<void> {
  const maxRetries = Math.max(0, options?.maxRetries ?? 6);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await batch.commit();
      await drainFirestoreWriteQueue(firestore, { rounds: 2, pauseMs: 120 });
      const delay = options?.delayAfterMs ?? DEFAULT_INTER_BATCH_DELAY_MS;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableFirestoreWriteError(error) || attempt >= maxRetries) {
        throw error;
      }
      const backoffMs = 500 * 2 ** attempt;
      await drainFirestoreWriteQueue(firestore, { rounds: 5, pauseMs: 300 });
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
}

/** Apply batched writes in chunks with throttling between commits. */
export async function forEachFirestoreBatch<T>(
  firestore: Firestore,
  items: T[],
  chunkSize: number,
  mutator: (batch: WriteBatch, chunk: T[]) => void,
  options?: { delayAfterMs?: number }
): Promise<void> {
  if (!items.length) return;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const batch = writeBatch(firestore);
    mutator(batch, chunk);
    const isLast = i + chunkSize >= items.length;
    await commitWriteBatchThrottled(firestore, batch, {
      delayAfterMs: isLast ? 0 : options?.delayAfterMs,
    });
  }
}

export { writeBatch };
