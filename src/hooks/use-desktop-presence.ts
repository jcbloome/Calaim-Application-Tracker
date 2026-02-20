'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFirestore } from '@/firebase';
import { collection, documentId, onSnapshot, query, where } from 'firebase/firestore';

const toMs = (value: any): number => {
  if (!value) return 0;
  try {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value === 'number') return value;
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

export function useDesktopPresenceMap(
  uids: string[],
  options?: { activeWindowMs?: number }
): {
  isActiveByUid: Record<string, boolean>;
} {
  const firestore = useFirestore();
  const activeWindowMs = options?.activeWindowMs ?? 2 * 60 * 1000;

  const stableUids = useMemo(() => {
    const cleaned = (uids || [])
      .map((u) => String(u || '').trim())
      .filter(Boolean);
    return Array.from(new Set(cleaned)).sort();
  }, [uids]);

  const [isActiveByUid, setIsActiveByUid] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!firestore) return;
    if (stableUids.length === 0) {
      setIsActiveByUid({});
      return;
    }

    const unsubs: Array<() => void> = [];
    const chunks: string[][] = [];
    for (let i = 0; i < stableUids.length; i += 10) {
      chunks.push(stableUids.slice(i, i + 10));
    }

    chunks.forEach((chunk) => {
      const q = query(collection(firestore, 'desktop_presence'), where(documentId(), 'in', chunk));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const now = Date.now();
          const chunkState: Record<string, boolean> = {};
          chunk.forEach((uid) => {
            chunkState[uid] = false;
          });
          snap.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const active = Boolean(data?.active);
            const lastSeenMs = toMs(data?.lastSeenAt);
            const fresh = lastSeenMs > 0 ? (now - lastSeenMs <= activeWindowMs) : true;
            chunkState[docSnap.id] = Boolean(active && fresh);
          });
          setIsActiveByUid((prev) => ({ ...prev, ...chunkState }));
        },
        () => {
          // If permission/rules prevent reads, fail silently.
        }
      );
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore
        }
      });
    };
  }, [firestore, stableUids, activeWindowMs]);

  return { isActiveByUid };
}

