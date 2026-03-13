'use client';

import { useEffect, useRef } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
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
  const lastAppliedCommandIdRef = useRef<string>('');

  useEffect(() => {
    if (!firestore || !user?.uid) return;
    if (!isElectronRuntime()) return;

    const uid = String(user.uid).trim();
    if (!uid) return;

    const ref = doc(firestore, 'desktop_presence', uid);

    const heartbeat = async (active: boolean) => {
      try {
        let desktopState: DesktopNotificationState | null = null;
        try {
          desktopState = await (window as any).desktopNotifications?.getState?.();
        } catch {
          desktopState = null;
        }
        const snoozedUntilMs = Number((desktopState as any)?.snoozedUntilMs || 0) || 0;
        await setDoc(
          ref,
          {
            uid,
            active,
            source: 'electron',
            lastSeenAt: serverTimestamp(),
            pausedByUser: Boolean((desktopState as any)?.pausedByUser),
            allowAfterHours: Boolean((desktopState as any)?.allowAfterHours),
            effectivePaused: Boolean((desktopState as any)?.effectivePaused),
            snoozedUntilMs: snoozedUntilMs || 0,
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

  useEffect(() => {
    if (!firestore || !user?.uid) return;
    if (!isElectronRuntime()) return;
    const uid = String(user.uid).trim();
    if (!uid) return;

    const ref = doc(firestore, 'desktop_control_commands', uid);
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        const data = snap.data() as any;
        if (!data) return;
        const commandId = String(data?.commandId || data?.updatedAt?.seconds || '').trim();
        if (!commandId) return;
        if (commandId === lastAppliedCommandIdRef.current) return;
        lastAppliedCommandIdRef.current = commandId;

        try {
          const allowAfterHours = Boolean(data?.allowAfterHours);
          const resumeNotifications = Boolean(data?.resumeNotifications);
          const dn = (window as any).desktopNotifications;
          if (!dn) return;

          const state = await dn.getState?.();
          if (dn.setAllowAfterHours && state && Boolean(state.allowAfterHours) !== allowAfterHours) {
            await dn.setAllowAfterHours(allowAfterHours);
          }
          if (resumeNotifications && dn.setPaused && state?.pausedByUser) {
            await dn.setPaused(false);
          }
        } catch {
          // ignore remote control command failures
        }
      },
      () => {
        // ignore
      }
    );
    return () => unsub();
  }, [firestore, user?.uid]);

  return null;
}

