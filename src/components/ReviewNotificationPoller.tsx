'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useUser } from '@/firebase';
import { useGlobalNotifications } from '@/components/NotificationProvider';

const DEFAULT_POLL_SECONDS = 180;

const clampPollSeconds = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_POLL_SECONDS;
  return Math.max(30, Math.min(3600, Math.round(value)));
};

type SeenState = {
  cs: { count: number; latestMs: number };
  docs: { count: number; latestMs: number };
};

const makeStorageKey = (uid: string) => `review-notification-seen:${uid}`;

const readSeen = (uid: string): SeenState => {
  if (typeof window === 'undefined') {
    return { cs: { count: 0, latestMs: 0 }, docs: { count: 0, latestMs: 0 } };
  }
  try {
    const raw = localStorage.getItem(makeStorageKey(uid));
    if (!raw) return { cs: { count: 0, latestMs: 0 }, docs: { count: 0, latestMs: 0 } };
    const parsed = JSON.parse(raw) as Partial<SeenState>;
    return {
      cs: {
        count: Number(parsed?.cs?.count || 0),
        latestMs: Number(parsed?.cs?.latestMs || 0),
      },
      docs: {
        count: Number(parsed?.docs?.count || 0),
        latestMs: Number(parsed?.docs?.latestMs || 0),
      },
    };
  } catch {
    return { cs: { count: 0, latestMs: 0 }, docs: { count: 0, latestMs: 0 } };
  }
};

const writeSeen = (uid: string, state: SeenState) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(makeStorageKey(uid), JSON.stringify(state));
  } catch {
    // ignore
  }
};

const toMs = (value: any): number => {
  if (!value) return 0;
  try {
    if (typeof value?.toDate === 'function') {
      return value.toDate().getTime();
    }
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

export function ReviewNotificationPoller() {
  const { user } = useUser();
  const { showNotification } = useGlobalNotifications();
  const warnedRef = useRef<{ missingRecipient: boolean; queryError: boolean }>({ missingRecipient: false, queryError: false });

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const shouldRun = useMemo(() => {
    if (!user?.uid) return false;
    if (typeof window === 'undefined') return false;
    // Admin pages already trigger review popups from live action-item counters.
    if (typeof window !== 'undefined' && window.location?.pathname?.startsWith('/admin')) return false;
    return true;
  }, [user?.uid]);

  const pollOnce = async (): Promise<number> => {
    if (!user?.uid) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const isRealDesktop = Boolean(window.desktopNotifications && !window.desktopNotifications.__shim);
      const seen = readSeen(user.uid);
      // Use server API (Admin SDK) so web notifications work regardless of Firestore client rules.
      let intervalSeconds = DEFAULT_POLL_SECONDS;
      let reviewPrefs: any = null;
      let tasks: any[] = [];
      try {
        const res = await fetch(`/api/staff/tasks?userId=${encodeURIComponent(user.uid)}`, { cache: 'no-store' });
        const contentType = res.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const data = isJson ? await res.json() : null;
        if (!res.ok) throw new Error(data?.error || `Request failed with status ${res.status}`);
        reviewPrefs = data?.reviewPrefs || null;
        tasks = Array.isArray(data?.tasks) ? data.tasks : [];
        intervalSeconds = clampPollSeconds(Number(reviewPrefs?.pollIntervalSeconds || DEFAULT_POLL_SECONDS));
      } catch (error) {
        if (process.env.NODE_ENV !== 'production' && !warnedRef.current.queryError) {
          warnedRef.current.queryError = true;
          console.warn('[ReviewNotificationPoller] /api/staff/tasks failed:', error);
        }
        return intervalSeconds;
      }

      if (!reviewPrefs?.enabled || !reviewPrefs?.recipientEnabled) {
        if (process.env.NODE_ENV !== 'production' && !warnedRef.current.missingRecipient) {
          warnedRef.current.missingRecipient = true;
          console.warn('[ReviewNotificationPoller] Review prefs disabled for user:', user.uid);
        }
        return intervalSeconds;
      }

      const allowCs = Boolean(reviewPrefs?.allowCs);
      const allowDocs = Boolean(reviewPrefs?.allowDocs);
      if (!allowCs && !allowDocs) {
        return intervalSeconds;
      }

      const reviewTasks = tasks.filter((t) => t?.taskType === 'review');
      const csTasks = allowCs
        ? reviewTasks.filter((t) => t?.reviewKind === 'cs' || String(t?.title || '').toLowerCase().includes('cs'))
        : [];
      const docTasks = allowDocs
        ? reviewTasks.filter((t) => t?.reviewKind === 'docs' || String(t?.title || '').toLowerCase().includes('document'))
        : [];

      const csCount = csTasks.length;
      const docsCount = docTasks.length;

      const csLatestMs = Math.max(...csTasks.map((t) => toMs(t?.dueDate || t?.updatedAt || t?.createdAt)), 0);
      const docsLatestMs = Math.max(...docTasks.map((t) => toMs(t?.dueDate || t?.updatedAt || t?.createdAt)), 0);

      const csIsNew = allowCs && csCount > 0 && (csLatestMs > seen.cs.latestMs || csCount > seen.cs.count);
      const docsIsNew = allowDocs && docsCount > 0 && (docsLatestMs > seen.docs.latestMs || docsCount > seen.docs.count);

      if (!csIsNew && !docsIsNew) {
        return;
      }

      const title =
        csIsNew && !docsIsNew
          ? 'CS Summary received'
          : docsIsNew && !csIsNew
            ? 'Documents received'
            : 'Review items received';
      const parts: string[] = [];
      if (csCount > 0 && shouldCheckCs) {
        parts.push(`${csCount} CS Summary${csCount === 1 ? '' : 'ies'} to review`);
      }
      if (docsCount > 0 && shouldCheckDocs) {
        parts.push(`${docsCount} upload${docsCount === 1 ? '' : 's'} to acknowledge`);
      }
      const message = parts.length > 0 ? parts.join(' • ') : 'New items require review.';

      const actionUrl =
        csIsNew && allowCs
          ? '/admin/applications?review=cs'
          : '/admin/applications?review=docs';

      const reviewNotes = [
        ...docTasks.slice(0, 4).map((t) => ({
          kind: 'docs' as const,
          title: 'Doc uploads received',
          message: t?.memberName ? `${t.memberName}${t?.description ? ` — ${t.description}` : ''}` : String(t?.description || t?.title || ''),
          timestamp: t?.dueDate || t?.createdAt,
        })),
        ...csTasks.slice(0, 4).map((t) => ({
          kind: 'cs' as const,
          title: 'CS Summary received',
          message: t?.memberName ? t.memberName : String(t?.description || t?.title || ''),
          timestamp: t?.dueDate || t?.createdAt,
        })),
      ].slice(0, 6);

      if (isRealDesktop) {
        try {
          window.desktopNotifications?.setReviewPillSummary?.({
            count: (allowCs ? csCount : 0) + (allowDocs ? docsCount : 0),
            notes: reviewNotes.map((n) => ({
              title: n.title,
              message: n.message,
              kind: n.kind,
              author: 'System',
              recipientName: user.displayName || user.email || 'Staff',
              memberName: '',
              timestamp: n.timestamp ? new Date(n.timestamp).toLocaleString() : undefined,
              actionUrl,
            })),
          });
        } catch {
          // ignore
        }
      }

      if (isRealDesktop && window.desktopNotifications?.notify) {
        // Pop the pill (Electron).
        await window.desktopNotifications.notify({
          title,
          body: message,
          // Only open the app automatically; don't flip the pill UI open repeatedly.
          openOnNotify: false,
        });
      } else {
        // Web: small, color-coded card first; click expands, then click message opens Applications.
        showNotification({
          keyId: 'review-needed-summary',
          type: csIsNew && docsIsNew ? 'warning' : csIsNew ? 'task' : 'success',
          title,
          message,
          author: 'System',
          recipientName: 'System',
          memberName: '',
          notes: reviewNotes.map((n) => ({
            message: `${n.title}${n.message ? ` — ${n.message}` : ''}`,
            author: 'System',
            memberName: '',
            timestamp: n.timestamp ? new Date(n.timestamp).toLocaleString() : undefined,
            replyUrl: undefined,
          })),
          duration: 0,
          minimizeAfter: 12000,
          startMinimized: true,
          pendingLabel: message,
          sound: true,
          animation: 'slide',
          onClick: () => {
            if (typeof window === 'undefined') return;
            window.location.href = actionUrl;
          }
        });
      }

      // Update seen state to prevent repeat popups.
      writeSeen(user.uid, {
        cs: {
          count: allowCs ? csCount : seen.cs.count,
          latestMs: allowCs ? Math.max(seen.cs.latestMs, csLatestMs) : seen.cs.latestMs,
        },
        docs: {
          count: allowDocs ? docsCount : seen.docs.count,
          latestMs: allowDocs ? Math.max(seen.docs.latestMs, docsLatestMs) : seen.docs.latestMs,
        },
      });
      return intervalSeconds;
    } finally {
      inFlightRef.current = false;
    }
  };

  // Start/stop polling loop (periodic polling; avoids snapshot listeners).
  useEffect(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (!shouldRun) return;

    let stopped = false;
    const loop = async () => {
      if (stopped) return;
      const nextSeconds = await pollOnce().catch(() => DEFAULT_POLL_SECONDS);
      const delaySeconds = clampPollSeconds(Number(nextSeconds || DEFAULT_POLL_SECONDS));
      pollTimeoutRef.current = setTimeout(loop, delaySeconds * 1000);
    };

    loop().catch(() => undefined);
    return () => {
      stopped = true;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRun, user?.uid]);

  return null;
}

