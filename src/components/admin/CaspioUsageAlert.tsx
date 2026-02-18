'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type UsageSettings = {
  monthId?: string;
  monthToDateTotal?: number;
  projectedMonthly?: number;
  limitMonthly?: number;
  warningLevel?: 'ok' | 'warn' | 'error';
};

function safeNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function CaspioUsageAlert() {
  const { user, isSuperAdmin } = useAdmin();
  const firestore = useFirestore();

  const [settings, setSettings] = useState<UsageSettings | null>(null);
  const [open, setOpen] = useState(false);

  const shownForMonthRef = useRef<string | null>(null);

  const monthId = String(settings?.monthId || new Date().toISOString().slice(0, 7));
  const warningLevel = (settings?.warningLevel || 'ok') as UsageSettings['warningLevel'];
  const projectedMonthly = safeNumber(settings?.projectedMonthly);
  const monthToDateTotal = safeNumber(settings?.monthToDateTotal);
  const limitMonthly = safeNumber(settings?.limitMonthly || 1_000_000);

  const dismissKey = useMemo(() => {
    const uid = user?.uid || 'unknown';
    return `calaim:caspioUsageAlert:dismissed:${uid}:${monthId}`;
  }, [user?.uid, monthId]);

  useEffect(() => {
    if (!isSuperAdmin || !firestore) return;
    const ref = doc(firestore, 'admin-settings', 'caspio-api-usage');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setSettings(snap.exists() ? ((snap.data() as any) as UsageSettings) : null);
      },
      () => setSettings(null)
    );
    return () => unsubscribe();
  }, [isSuperAdmin, firestore]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (!settings) return;

    if (warningLevel === 'ok') {
      setOpen(false);
      shownForMonthRef.current = null;
      return;
    }

    if (typeof window === 'undefined') return;

    const dismissed = window.localStorage.getItem(dismissKey) === '1';
    if (dismissed) return;

    // Avoid re-opening repeatedly while the admin UI stays open.
    if (shownForMonthRef.current === monthId) return;
    shownForMonthRef.current = monthId;
    setOpen(true);
  }, [dismissKey, isSuperAdmin, monthId, settings, warningLevel]);

  if (!isSuperAdmin) return null;

  const title =
    warningLevel === 'error'
      ? 'Caspio API usage at risk'
      : warningLevel === 'warn'
        ? 'Caspio API usage trending high'
        : 'Caspio API usage';

  const description =
    warningLevel === 'error'
      ? 'Projected monthly API calls are at/over the configured monthly limit.'
      : 'Projected monthly API calls are approaching the configured monthly limit.';

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description}
            <div className="mt-3 text-sm text-muted-foreground space-y-1">
              <div>
                <strong>Month:</strong> {monthId}
              </div>
              <div>
                <strong>Month-to-date:</strong> {monthToDateTotal.toLocaleString()}
              </div>
              <div>
                <strong>Projected monthly:</strong> {projectedMonthly.toLocaleString()}
              </div>
              <div>
                <strong>Limit:</strong> {limitMonthly.toLocaleString()}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(dismissKey, '1');
              }
              setOpen(false);
            }}
          >
            Dismiss for this month
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

