'use client';

import { useState, useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * Listens for globally emitted Firestore permission errors.
 * In development, rethrows so Next.js error overlays surface them for debugging.
 * In production, log only — never crash the whole admin UI (new staff often hit
 * transient/expected permission denials while claims settle after first login).
 */
export function FirebaseErrorListener() {
  const [error, setError] = useState<FirestorePermissionError | null>(null);
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    const isIgnorablePermissionError = (nextError: FirestorePermissionError) => {
      const path = String(nextError?.request?.path || '').toLowerCase();
      const method = String(nextError?.request?.method || '').toLowerCase();
      // Role docs: listing is often denied; not fatal for login/dashboard.
      if (
        method === 'list' &&
        (path.includes('/roles_admin') || path.includes('/roles_super_admin'))
      ) {
        return true;
      }
      // Dashboard / header action queries — deny should degrade UI, not white-screen.
      if (
        method === 'list' &&
        (path.includes('/applications') ||
          path.includes('/standalone_upload') ||
          path.includes('/staff_notifications') ||
          path.includes('/eligibility') ||
          path.includes('/alft_') ||
          path.includes('/caspio_'))
      ) {
        return true;
      }
      return false;
    };

    const handleError = (nextError: FirestorePermissionError) => {
      if (isIgnorablePermissionError(nextError)) {
        console.warn('[FirebaseErrorListener] Ignoring non-fatal permission error.', nextError.request);
        return;
      }
      console.error('[FirebaseErrorListener] Firestore permission error:', nextError.message, nextError.request);
      // Only crash the tree in local/dev so Cursor/LLM debugging still works.
      if (isDev) {
        setError(nextError);
      }
    };

    errorEmitter.on('permission-error', handleError);
    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, [isDev]);

  if (isDev && error) {
    throw error;
  }

  return null;
}
