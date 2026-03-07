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
  elig: { count: number; latestMs: number };
  standalone: { count: number; latestMs: number };
  alft: { count: number; latestMs: number };
};

const makeStorageKey = (uid: string) => `review-notification-seen:${uid}`;

const readSeen = (uid: string): SeenState => {
  if (typeof window === 'undefined') {
    return {
      cs: { count: 0, latestMs: 0 },
      docs: { count: 0, latestMs: 0 },
      elig: { count: 0, latestMs: 0 },
      standalone: { count: 0, latestMs: 0 },
      alft: { count: 0, latestMs: 0 },
    };
  }
  try {
    const raw = localStorage.getItem(makeStorageKey(uid));
    if (!raw) {
      return {
        cs: { count: 0, latestMs: 0 },
        docs: { count: 0, latestMs: 0 },
        elig: { count: 0, latestMs: 0 },
        standalone: { count: 0, latestMs: 0 },
        alft: { count: 0, latestMs: 0 },
      };
    }
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
      elig: {
        count: Number((parsed as any)?.elig?.count || 0),
        latestMs: Number((parsed as any)?.elig?.latestMs || 0),
      },
      standalone: {
        count: Number((parsed as any)?.standalone?.count || 0),
        latestMs: Number((parsed as any)?.standalone?.latestMs || 0),
      },
      alft: {
        count: Number((parsed as any)?.alft?.count || 0),
        latestMs: Number((parsed as any)?.alft?.latestMs || 0),
      },
    };
  } catch {
    return {
      cs: { count: 0, latestMs: 0 },
      docs: { count: 0, latestMs: 0 },
      elig: { count: 0, latestMs: 0 },
      standalone: { count: 0, latestMs: 0 },
      alft: { count: 0, latestMs: 0 },
    };
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
      if (isRealDesktop && window.desktopNotifications?.getState) {
        try {
          const st = await window.desktopNotifications.getState();
          const effectivePaused = Boolean((st as any)?.effectivePaused);
          if (effectivePaused) {
            // While Electron is snoozed/paused, fully hide the review pill and skip popups.
            window.desktopNotifications?.setReviewPillSummary?.({ count: 0, openPanel: false, notes: [] });
            return intervalSeconds;
          }
        } catch {
          // ignore
        }
      }
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
      const allowElig = Boolean(reviewPrefs?.allowEligibility);
      const allowStandalone = Boolean(reviewPrefs?.allowStandalone);
      const allowAlft = Boolean(reviewPrefs?.allowAlft);
      if (!allowCs && !allowDocs && !allowElig && !allowStandalone && !allowAlft) {
        return intervalSeconds;
      }

      const reviewTasks = tasks.filter((t) => t?.taskType === 'review');
      const csTasks = allowCs
        ? reviewTasks.filter((t) => t?.reviewKind === 'cs' || String(t?.title || '').toLowerCase().includes('cs'))
        : [];
      const docTasks = allowDocs
        ? reviewTasks.filter((t) => t?.reviewKind === 'docs' || String(t?.title || '').toLowerCase().includes('document'))
        : [];
      const eligTasks = allowElig
        ? reviewTasks.filter((t) => t?.reviewKind === 'elig' || String(t?.title || '').toLowerCase().includes('elig'))
        : [];
      const standaloneTasks = allowStandalone
        ? reviewTasks.filter((t) => t?.reviewKind === 'standalone' || String(t?.title || '').toLowerCase().includes('standalone'))
        : [];
      const alftTasks = allowAlft
        ? reviewTasks.filter((t) => t?.reviewKind === 'alft' || String(t?.title || '').toLowerCase().includes('alft'))
        : [];

      const csCount = csTasks.length;
      const docsCount = docTasks.length;
      const eligCount = eligTasks.length;
      const standaloneCount = standaloneTasks.length;
      const alftCount = alftTasks.length;

      const csLatestMs = Math.max(...csTasks.map((t) => toMs(t?.dueDate || t?.updatedAt || t?.createdAt)), 0);
      const docsLatestMs = Math.max(...docTasks.map((t) => toMs(t?.dueDate || t?.updatedAt || t?.createdAt)), 0);
      const eligLatestMs = Math.max(...eligTasks.map((t) => toMs(t?.dueDate || t?.updatedAt || t?.createdAt)), 0);
      const standaloneLatestMs = Math.max(...standaloneTasks.map((t) => toMs(t?.dueDate || t?.updatedAt || t?.createdAt)), 0);
      const alftLatestMs = Math.max(...alftTasks.map((t) => toMs(t?.dueDate || t?.updatedAt || t?.createdAt)), 0);

      const csIsNew = allowCs && csCount > 0 && (csLatestMs > seen.cs.latestMs || csCount > seen.cs.count);
      const docsIsNew = allowDocs && docsCount > 0 && (docsLatestMs > seen.docs.latestMs || docsCount > seen.docs.count);
      const eligIsNew = allowElig && eligCount > 0 && (eligLatestMs > seen.elig.latestMs || eligCount > seen.elig.count);
      const standaloneIsNew =
        allowStandalone &&
        standaloneCount > 0 &&
        (standaloneLatestMs > seen.standalone.latestMs || standaloneCount > seen.standalone.count);
      const alftIsNew = allowAlft && alftCount > 0 && (alftLatestMs > seen.alft.latestMs || alftCount > seen.alft.count);

      if (!csIsNew && !docsIsNew && !eligIsNew && !standaloneIsNew && !alftIsNew) {
        return;
      }

      const title =
        csIsNew && !docsIsNew && !eligIsNew && !standaloneIsNew && !alftIsNew
          ? 'CS Summary received'
          : docsIsNew && !csIsNew && !eligIsNew && !standaloneIsNew && !alftIsNew
            ? 'Documents received'
            : eligIsNew && !csIsNew && !docsIsNew && !standaloneIsNew && !alftIsNew
              ? 'Eligibility check received'
              : standaloneIsNew && !csIsNew && !docsIsNew && !eligIsNew && !alftIsNew
                ? 'Standalone upload received'
                : alftIsNew && !csIsNew && !docsIsNew && !eligIsNew && !standaloneIsNew
                  ? 'ALFT upload received'
            : 'Review items received';
      const parts: string[] = [];
      if (allowCs && csCount > 0) {
        parts.push(`${csCount} CS Summary${csCount === 1 ? '' : 'ies'} to review`);
      }
      if (allowDocs && docsCount > 0) {
        parts.push(`${docsCount} upload${docsCount === 1 ? '' : 's'} to acknowledge`);
      }
      if (allowElig && eligCount > 0) {
        parts.push(`${eligCount} eligibility check${eligCount === 1 ? '' : 's'} to review`);
      }
      if (allowStandalone && standaloneCount > 0) {
        parts.push(`${standaloneCount} standalone intake${standaloneCount === 1 ? '' : 's'} to triage`);
      }
      if (allowAlft && alftCount > 0) {
        parts.push(`${alftCount} ALFT intake${alftCount === 1 ? '' : 's'} to triage`);
      }
      const message = parts.length > 0 ? parts.join(' • ') : 'New items require review.';

      const actionUrl = csIsNew
        ? '/admin/applications?review=cs'
        : docsIsNew
          ? '/admin/applications?review=docs'
          : eligIsNew
            ? '/admin/eligibility-checks'
            : alftIsNew
              ? '/admin/alft-tracker'
              : '/admin/standalone-uploads';

      const reviewNotes = [
        ...alftTasks.slice(0, 4).map((t) => ({
          kind: 'alft' as const,
          title: 'ALFT upload received',
          message: t?.memberName ? `${t.memberName}${t?.description ? ` — ${t.description}` : ''}` : String(t?.description || t?.title || ''),
          timestamp: t?.dueDate || t?.createdAt,
        })),
        ...standaloneTasks.slice(0, 4).map((t) => ({
          kind: 'standalone' as const,
          title: 'Standalone upload received',
          message: t?.memberName ? `${t.memberName}${t?.description ? ` — ${t.description}` : ''}` : String(t?.description || t?.title || ''),
          timestamp: t?.dueDate || t?.createdAt,
        })),
        ...eligTasks.slice(0, 4).map((t) => ({
          kind: 'elig' as const,
          title: 'Eligibility check received',
          message: t?.memberName ? `${t.memberName}${t?.description ? ` — ${t.description}` : ''}` : String(t?.description || t?.title || ''),
          timestamp: t?.dueDate || t?.createdAt,
        })),
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
            count:
              (allowCs ? csCount : 0) +
              (allowDocs ? docsCount : 0) +
              (allowElig ? eligCount : 0) +
              (allowStandalone ? standaloneCount : 0) +
              (allowAlft ? alftCount : 0),
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
          type:
            [csIsNew, docsIsNew, eligIsNew, standaloneIsNew].filter(Boolean).length > 1
              ? 'warning'
              : csIsNew || eligIsNew
                ? 'task'
                : 'success',
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
        elig: {
          count: allowElig ? eligCount : seen.elig.count,
          latestMs: allowElig ? Math.max(seen.elig.latestMs, eligLatestMs) : seen.elig.latestMs,
        },
        standalone: {
          count: allowStandalone ? standaloneCount : seen.standalone.count,
          latestMs: allowStandalone ? Math.max(seen.standalone.latestMs, standaloneLatestMs) : seen.standalone.latestMs,
        },
        alft: {
          count: allowAlft ? alftCount : seen.alft.count,
          latestMs: allowAlft ? Math.max(seen.alft.latestMs, alftLatestMs) : seen.alft.latestMs,
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

