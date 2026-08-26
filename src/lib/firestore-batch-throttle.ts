import {
  type Firestore,
  type WriteBatch,
  writeBatch,
  waitForPendingWrites,
} from 'firebase/firestore';

const DEFAULT_INTER_BATCH_DELAY_MS = 75;

/** Commit a batch and drain the Firestore write stream to avoid queued-write exhaustion. */
export async function commitWriteBatchThrottled(
  firestore: Firestore,
  batch: WriteBatch,
  options?: { delayAfterMs?: number }
): Promise<void> {
  await batch.commit();
  await waitForPendingWrites(firestore);
  const delay = options?.delayAfterMs ?? DEFAULT_INTER_BATCH_DELAY_MS;
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
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
