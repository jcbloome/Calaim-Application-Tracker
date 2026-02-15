'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { useGlobalNotifications } from '@/components/NotificationProvider';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  limit,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore';

type RecipientSettings = {
  enabled: boolean;
  csSummary: boolean;
  documents: boolean;
  label?: string;
  email?: string;
};

type ReviewNotificationsConfig = {
  enabled: boolean;
  pollIntervalSeconds: number;
  recipients: Record<string, RecipientSettings>;
};

const DEFAULT_CONFIG: ReviewNotificationsConfig = {
  enabled: true,
  pollIntervalSeconds: 180,
  recipients: {}
};

const clampPollSeconds = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_CONFIG.pollIntervalSeconds;
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
  const firestore = useFirestore();
  const { showNotification } = useGlobalNotifications();

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const configRef = useMemo(() => {
    if (!firestore) return null;
    return doc(firestore, 'system_settings', 'review_notifications');
  }, [firestore]);

  const shouldRun = useMemo(() => {
    if (!user?.uid) return false;
    if (!firestore) return false;
    if (typeof window === 'undefined') return false;
    return true;
  }, [user?.uid, firestore]);

  const pollOnce = async (): Promise<number> => {
    if (!user?.uid || !firestore) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const isRealDesktop = Boolean(window.desktopNotifications && !window.desktopNotifications.__shim);
      const configSnap = configRef ? await getDoc(configRef).catch(() => null) : null;
      const config = configSnap?.exists()
        ? ({ ...DEFAULT_CONFIG, ...(configSnap.data() as any) } as ReviewNotificationsConfig)
        : DEFAULT_CONFIG;
      const intervalSeconds = clampPollSeconds(Number((config as any)?.pollIntervalSeconds ?? DEFAULT_CONFIG.pollIntervalSeconds));

      if (!config.enabled) return intervalSeconds;
      const recipient = config.recipients?.[user.uid] || null;
      if (!recipient?.enabled) return intervalSeconds;

      const seen = readSeen(user.uid);

      const shouldCheckCs = Boolean(recipient?.enabled && recipient?.csSummary);
      const shouldCheckDocs = Boolean(recipient?.enabled && recipient?.documents);
      if (!shouldCheckCs && !shouldCheckDocs) return intervalSeconds;

      const csQueries = shouldCheckCs
        ? [
            getDocs(
              query(
                collection(firestore, 'applications'),
                where('pendingCsReview', '==', true),
                orderBy('csSummaryCompletedAt', 'desc'),
                limit(50)
              )
            ),
            getDocs(
              query(
                collectionGroup(firestore, 'applications'),
                where('pendingCsReview', '==', true),
                orderBy('csSummaryCompletedAt', 'desc'),
                limit(50)
              )
            ),
          ]
        : [];

      const docQueries = shouldCheckDocs
        ? [
            getDocs(
              query(
                collection(firestore, 'applications'),
                where('pendingDocReviewCount', '>', 0),
                limit(50)
              )
            ),
            getDocs(
              query(
                collectionGroup(firestore, 'applications'),
                where('pendingDocReviewCount', '>', 0),
                limit(50)
              )
            ),
          ]
        : [];

      const [csRootSnap, csGroupSnap, docRootSnap, docGroupSnap] = await Promise.all([
        ...(csQueries.length === 2 ? csQueries : [Promise.resolve(null), Promise.resolve(null)]),
        ...(docQueries.length === 2 ? docQueries : [Promise.resolve(null), Promise.resolve(null)]),
      ] as any);

      const csCount = (csRootSnap?.size || 0) + (csGroupSnap?.size || 0);
      const docsCount = (docRootSnap?.size || 0) + (docGroupSnap?.size || 0);

      // Provide Electron "notepad" list items for documents/CS review.
      const reviewNotes: Array<{
        title: string;
        message: string;
        kind?: 'docs' | 'cs';
        author?: string;
        recipientName?: string;
        memberName?: string;
        timestamp?: string;
        actionUrl?: string;
      }> = [];
      try {
        const pushCs = (snap: any) => {
          (snap?.docs || []).slice(0, 3).forEach((d: any) => {
            const data = d.data?.() || {};
            const memberName = `${data.memberFirstName || 'Unknown'} ${data.memberLastName || 'Member'}`.trim();
            reviewNotes.push({
              kind: 'cs',
              title: 'CS Summary received',
              message: memberName,
              author: 'System',
              recipientName: user.displayName || user.email || 'Staff',
              memberName,
              timestamp: data.csSummaryCompletedAt?.toDate?.()?.toLocaleString?.() || undefined,
              actionUrl: '/admin/applications?review=cs'
            });
          });
        };

        const pushDocs = (snap: any) => {
          (snap?.docs || []).slice(0, 3).forEach((d: any) => {
            const data = d.data?.() || {};
            const memberName = `${data.memberFirstName || 'Unknown'} ${data.memberLastName || 'Member'}`.trim();
            const count = Number(data.pendingDocReviewCount || 0);
            reviewNotes.push({
              kind: 'docs',
              title: 'Documents received',
              message: count > 0 ? `${memberName} (${count})` : memberName,
              author: 'System',
              recipientName: user.displayName || user.email || 'Staff',
              memberName,
              timestamp: data.pendingDocReviewUpdatedAt?.toDate?.()?.toLocaleString?.() || undefined,
              actionUrl: '/admin/applications?review=docs'
            });
          });
        };

        if (shouldCheckCs) {
          pushCs(csRootSnap);
          pushCs(csGroupSnap);
        }
        if (shouldCheckDocs) {
          pushDocs(docRootSnap);
          pushDocs(docGroupSnap);
        }

        if (isRealDesktop) {
          window.desktopNotifications?.setReviewPillSummary?.({
            count: (shouldCheckCs ? csCount : 0) + (shouldCheckDocs ? docsCount : 0),
            notes: reviewNotes.slice(0, 6)
          });
        }
      } catch {
        // ignore
      }

      const csLatestMs = Math.max(
        ...(csRootSnap?.docs || []).map((d: any) => toMs(d.data()?.csSummaryCompletedAt || d.data()?.lastUpdated)),
        ...(csGroupSnap?.docs || []).map((d: any) => toMs(d.data()?.csSummaryCompletedAt || d.data()?.lastUpdated)),
        0
      );

      const docsLatestMs = Math.max(
        ...(docRootSnap?.docs || []).map((d: any) => toMs(d.data()?.pendingDocReviewUpdatedAt || d.data()?.lastUpdated)),
        ...(docGroupSnap?.docs || []).map((d: any) => toMs(d.data()?.pendingDocReviewUpdatedAt || d.data()?.lastUpdated)),
        0
      );

      const csIsNew = shouldCheckCs && csCount > 0 && (csLatestMs > seen.cs.latestMs || csCount > seen.cs.count);
      const docsIsNew = shouldCheckDocs && docsCount > 0 && (docsLatestMs > seen.docs.latestMs || docsCount > seen.docs.count);

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
        csIsNew && shouldCheckCs
          ? '/admin/applications?review=cs'
          : '/admin/applications?review=docs';

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
          recipientName: user.displayName || user.email || 'Staff',
          memberName: '',
          notes: reviewNotes.slice(0, 6).map((n) => ({
            message: `${n.title}${n.message ? ` — ${n.message}` : ''}`,
            author: n.author || 'System',
            memberName: n.memberName,
            timestamp: n.timestamp,
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
          count: shouldCheckCs ? csCount : seen.cs.count,
          latestMs: shouldCheckCs ? Math.max(seen.cs.latestMs, csLatestMs) : seen.cs.latestMs,
        },
        docs: {
          count: shouldCheckDocs ? docsCount : seen.docs.count,
          latestMs: shouldCheckDocs ? Math.max(seen.docs.latestMs, docsLatestMs) : seen.docs.latestMs,
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
      const nextSeconds = await pollOnce().catch(() => DEFAULT_CONFIG.pollIntervalSeconds);
      const delaySeconds = clampPollSeconds(Number(nextSeconds || DEFAULT_CONFIG.pollIntervalSeconds));
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

