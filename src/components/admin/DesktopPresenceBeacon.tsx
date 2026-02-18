'use client';

import { useEffect, useRef } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';

function isElectronRuntime() {
  try {
    return typeof window !== 'undefined' && Boolean((window as any).desktopNotifications);
  } catch {
    return false;
  }
}

export function DesktopPresenceBeacon() {
  const firestore = useFirestore();
  const { user } = useUser();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!firestore || !user?.uid) return;
    if (!isElectronRuntime()) return;

    const uid = String(user.uid).trim();
    if (!uid) return;

    const ref = doc(firestore, 'desktop_presence', uid);

    const heartbeat = async (active: boolean) => {
      try {
        await setDoc(
          ref,
          {
            uid,
            active,
            source: 'electron',
            lastSeenAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        // Ignore presence failures (rules/network).
      }
    };

    // Mark active immediately, then refresh periodically.
    void heartbeat(true);
    timerRef.current = setInterval(() => void heartbeat(true), 30_000);

    const handleBeforeUnload = () => {
      void heartbeat(false);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      void heartbeat(false);
    };
  }, [firestore, user?.uid]);

  return null;
}

