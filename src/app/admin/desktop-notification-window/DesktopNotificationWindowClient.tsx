'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@/firebase';
import { useFirestore } from '@/firebase';
import { Target } from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  documentId
} from 'firebase/firestore';

type NotifyCardPayload = {
  id?: string;
  type?: 'note' | 'task' | 'urgent' | 'success' | 'warning';
  title: string;
  message: string;
  author?: string;
  recipientName?: string;
  memberName?: string;
  timestamp?: string;
  tagLabel?: string;
  pendingLabel?: string;
  actionUrl?: string;
  notes?: Array<{
    message: string;
    author?: string;
    memberName?: string;
    timestamp?: string;
    replyUrl?: string;
    tagLabel?: string;
  }>;
};

type PillStatePayload = {
  count: number;
  mode?: 'compact' | 'panel';
  updatedAtMs?: number;
  activeIndex?: number;
  activeNote?: {
    title: string;
    message: string;
    kind?: 'note' | 'docs' | 'cs';
    source?: string;
    clientId2?: string;
    author?: string;
    recipientName?: string;
    memberName?: string;
    timestamp?: string;
    noteId?: string;
    senderId?: string;
    replyUrl?: string;
    actionUrl?: string;
  } | null;
  notes?: Array<{
    title: string;
    message: string;
    kind?: 'note' | 'docs' | 'cs';
    source?: string;
    clientId2?: string;
    author?: string;
    recipientName?: string;
    memberName?: string;
    timestamp?: string;
    noteId?: string;
    senderId?: string;
    replyUrl?: string;
    actionUrl?: string;
  }>;
  title?: string;
  message?: string;
  author?: string;
  recipientName?: string;
  memberName?: string;
  timestamp?: string;
  replyUrl?: string;
  actionUrl?: string;
};

type ThreadMessage = {
  id: string;
  message: string;
  authorName: string;
  senderId?: string;
  createdAtMs: number;
  isChat: boolean;
};

const accentClassForKind = (kind?: string) => {
  const k = String(kind || '').toLowerCase().trim();
  if (k === 'docs') return 'border-l-green-600';
  if (k === 'cs') return 'border-l-orange-500';
  return 'border-l-blue-600';
};

export default function DesktopNotificationWindowClient() {
  const { user } = useUser();
  const firestore = useFirestore();
  const unsubRef = useRef<null | (() => void)>(null);
  const unsubSummaryRef = useRef<null | (() => void)>(null);
  const [pillState, setPillState] = useState<PillStatePayload | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [sendError, setSendError] = useState<string>('');
  const [markingRead, setMarkingRead] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [replyPriority, setReplyPriority] = useState<'General' | 'Priority' | 'Chat'>('Priority');
  const [sendToSender, setSendToSender] = useState(true);
  const [staffList, setStaffList] = useState<Array<{ uid: string; name: string }>>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [extraRecipientIds, setExtraRecipientIds] = useState<Set<string>>(new Set());
  const [followUpDraft, setFollowUpDraft] = useState<string>('');
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [activeTaskMeta, setActiveTaskMeta] = useState<{
    status: string;
    followUpRequired: boolean;
    followUpDateIso: string;
    threadId: string;
  } | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadError, setThreadError] = useState<string>('');
  const [togglingTaskStatus, setTogglingTaskStatus] = useState(false);
  const [undoClose, setUndoClose] = useState<{ noteId: string; expiresAtMs: number } | null>(null);
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);
  const [muteMenuOpen, setMuteMenuOpen] = useState(false);

  const titleLabel = useMemo(() => {
    const c = Number(pillState?.count || 0);
    if (!c) return 'Desktop notifications';
    return c === 1 ? '1 pending item' : `${c} pending items`;
  }, [pillState?.count]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = titleLabel;
    try {
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
    } catch {
      // ignore
    }
  }, [titleLabel]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const openExternal = (url?: string) => {
      try {
        if (!url) return;
        window.desktopNotificationPill?.open?.(url);
      } catch {
        // ignore
      }
    };

    const handlePillState = (payload: PillStatePayload) => {
      setPillState(payload);
      // If a new item came in while the user was drafting, keep the draft but reset when the active note changes.
    };

    unsubSummaryRef.current = window.desktopNotificationPill?.onPillState?.(handlePillState) || null;

    return () => {
      try {
        unsubRef.current?.();
      } catch {
        // ignore
      }
      try {
        unsubSummaryRef.current?.();
      } catch {
        // ignore
      }
      unsubRef.current = null;
      unsubSummaryRef.current = null;
    };
  }, []);

  const mode = pillState?.mode === 'panel' ? 'panel' : 'compact';
  const count = Number(pillState?.count || 0);
  const activeIndex = Math.max(0, Number(pillState?.activeIndex || 0));
  const active = pillState?.activeNote || null;
  const canPrev = activeIndex > 0;
  const canNext = Array.isArray(pillState?.notes) ? activeIndex < (pillState!.notes!.length - 1) : false;
  const lastUpdatedLabel = useMemo(() => {
    const ms = Number(pillState?.updatedAtMs || 0);
    if (!ms) return '';
    const delta = Date.now() - ms;
    if (delta < 10_000) return 'Updated just now';
    if (delta < 60_000) return `Updated ${Math.round(delta / 1000)}s ago`;
    if (delta < 60 * 60_000) return `Updated ${Math.round(delta / 60_000)}m ago`;
    return `Updated ${Math.round(delta / 3_600_000)}h ago`;
  }, [pillState?.updatedAtMs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!firestore) return;
    const myUid = String(user?.uid || '').trim();
    const threadId = String(activeTaskMeta?.threadId || '').trim();
    const kind = String(active?.kind || '').toLowerCase();
    if (mode !== 'panel' || !myUid || !threadId || kind === 'cs' || kind === 'docs') {
      setThreadMessages([]);
      setThreadError('');
      return;
    }

    const notificationsQuery = query(
      collection(firestore, 'staff_notifications'),
      where('userId', '==', myUid),
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snap) => {
        const next: ThreadMessage[] = [];
        snap.forEach((docItem) => {
          const data = docItem.data() as any;
          const docThreadId = String(data?.threadId || data?.replyToId || docItem.id).trim();
          if (docItem.id !== threadId && docThreadId !== threadId) return;
          const ts =
            data?.timestamp?.toDate?.()?.getTime?.()
            || data?.createdAt?.toDate?.()?.getTime?.()
            || (data?.createdAt ? new Date(data.createdAt).getTime() : 0)
            || 0;
          const message = String(data?.message || data?.content || '').trim();
          if (!message) return;
          const senderId = String(data?.senderId || data?.createdBy || '').trim() || undefined;
          const authorName =
            String(data?.createdByName || data?.senderName || data?.authorName || 'Staff').trim() || 'Staff';
          const type = String(data?.type || '').toLowerCase();
          const isChat = Boolean(data?.isChatOnly) || type.includes('chat');
          next.push({
            id: docItem.id,
            message,
            authorName,
            senderId,
            createdAtMs: Number(ts || 0),
            isChat,
          });
        });
        next.sort((a, b) => a.createdAtMs - b.createdAtMs);
        setThreadMessages(next);
        setThreadError('');
      },
      (error) => {
        setThreadMessages([]);
        setThreadError(error instanceof Error ? error.message : String(error || 'Failed to load thread'));
      }
    );

    return () => unsubscribe();
  }, [active?.kind, activeTaskMeta?.threadId, firestore, mode, user?.uid]);

  useEffect(() => {
    // Reset draft when active note changes.
    setReplyDraft('');
    setSendError('');
    // This window only shows Priority/Urgent notes, so default replies to Priority.
    setReplyPriority('Priority');
    setSendToSender(true);
    setExtraRecipientIds(new Set());
    setStaffPickerOpen(false);
    setStaffSearch('');
    setFollowUpOpen(false);
    setFollowUpDraft('');
    setSnoozeMenuOpen(false);
    setMuteMenuOpen(false);
  }, [active?.noteId, active?.senderId, active?.timestamp, active?.title]);

  const loadAdminStaff = useCallback(async () => {
    if (!firestore) return;
    try {
      setIsLoadingStaff(true);
      const [adminSnap, superAdminSnap] = await Promise.all([
        getDocs(collection(firestore, 'roles_admin')),
        getDocs(collection(firestore, 'roles_super_admin'))
      ]);
      const adminIds = adminSnap.docs.map((docItem) => docItem.id);
      const superAdminIds = superAdminSnap.docs.map((docItem) => docItem.id);
      const allIds = Array.from(new Set([...adminIds, ...superAdminIds]));
      if (allIds.length === 0) {
        setStaffList([]);
        return;
      }

      const chunks: string[][] = [];
      for (let i = 0; i < allIds.length; i += 10) {
        chunks.push(allIds.slice(i, i + 10));
      }

      const users: Array<{ uid: string; name: string }> = [];
      for (const chunk of chunks) {
        const usersSnap = await getDocs(
          query(collection(firestore, 'users'), where(documentId(), 'in', chunk))
        );
        usersSnap.forEach((docItem) => {
          const data = docItem.data() as any;
          const name = data.firstName && data.lastName
            ? `${data.firstName} ${data.lastName}`
            : data.displayName || data.email || 'Unknown Staff';
          users.push({ uid: docItem.id, name });
        });
      }

      users.sort((a, b) => a.name.localeCompare(b.name));
      setStaffList(users);
    } catch {
      setStaffList([]);
    } finally {
      setIsLoadingStaff(false);
    }
  }, [firestore]);

  useEffect(() => {
    if (!staffPickerOpen) return;
    if (staffList.length > 0) return;
    loadAdminStaff();
  }, [staffPickerOpen, staffList.length, loadAdminStaff]);

  const handleExpand = useCallback(() => {
    try {
      window.desktopNotificationPill?.expand?.();
    } catch {
      // ignore
    }
  }, []);

  const handleMinimize = useCallback(() => {
    try {
      window.desktopNotificationPill?.dismiss?.();
    } catch {
      // ignore
    }
  }, []);

  const handleOpen = useCallback(() => {
    const isCs = String(active?.kind || '').toLowerCase() === 'cs';
    const url = isCs
      ? String(active?.actionUrl || pillState?.actionUrl || '/admin/my-notes')
      : (active?.noteId
          ? `/admin/my-notes?noteId=${encodeURIComponent(String(active.noteId))}`
          : '/admin/my-notes');
    if (!url) return;
    try {
      window.desktopNotificationPill?.open?.(url);
    } catch {
      // ignore
    }
  }, [active?.actionUrl, pillState?.actionUrl]);

  const handleNavigate = useCallback((delta: number) => {
    try {
      window.desktopNotificationPill?.navigate?.(delta);
    } catch {
      // ignore
    }
  }, []);

  const handleMarkRead = useCallback(async () => {
    if (!firestore) return;
    if (!active?.noteId) return;
    const kind = String(active?.kind || '').toLowerCase();
    if (kind === 'cs' || kind === 'docs') return;
    setMarkingRead(true);
    try {
      await updateDoc(doc(firestore, 'staff_notifications', String(active.noteId)), {
        isRead: true,
        updatedAt: new Date(),
      });
      handleMinimize();
    } catch {
      // ignore
    } finally {
      setMarkingRead(false);
    }
  }, [active?.kind, active?.noteId, firestore, handleMinimize]);

  const handleSendReply = useCallback(async () => {
    if (!active) return;
    const message = replyDraft.trim();
    if (!message) return;
    if (!firestore) return;
    setSendingReply(true);
    setSendError('');
    try {
      const myUid = String(user?.uid || '').trim();
      const source = String(active.source || '').toLowerCase();
      const clientId2 = String(active.clientId2 || '').trim();
      const myName = user?.displayName || user?.email || 'Staff';

      const senderId = String(active.senderId || '').trim();
      const recipients = new Map<string, string>();

      if (sendToSender && senderId) {
        const senderName =
          staffList.find((s) => s.uid === senderId)?.name
          || String(active.author || '').trim()
          || 'Staff';
        recipients.set(senderId, senderName);
      }

      for (const id of Array.from(extraRecipientIds)) {
        const name = staffList.find((s) => s.uid === id)?.name || 'Staff';
        recipients.set(id, name);
      }

      // Always save a sent copy into My Notifications (marked read) so threads show as dialog.
      if (myUid) {
        recipients.set(myUid, myName);
      }

      // No-op safety (avoid saving a self-only reply).
      const allowSelfOnlyTest = Boolean(sendToSender && senderId && myUid && senderId === myUid);
      const hasAnyNonSelfRecipient = myUid
        ? Array.from(recipients.keys()).some((uid) => uid !== myUid)
        : recipients.size > 0;
      if (!hasAnyNonSelfRecipient && !allowSelfOnlyTest) {
        setSendError('Select at least one recipient (sender or staff).');
        return;
      }

      const isChat = replyPriority === 'Chat';

      if (clientId2 && !isChat) {
        // If tied to a Caspio client, write the reply into connect_tbl_clientnotes.
        await fetch('/api/client-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId2,
            comments: message,
            followUpStatus: replyPriority === 'Priority' ? '🟡 Priority' : 'Open',
            userId: myUid,
            actorName: myName,
            actorEmail: String(user?.email || ''),
            source: source || 'electron',
          }),
        });
      }

      const basePayload: Record<string, any> = {
        title: `Reply: ${String(active.title || 'Incoming note')}`,
        message,
        type: isChat ? 'interoffice_chat' : 'interoffice_reply',
        // Chat should still popup, so treat it as Priority for desktop.
        priority: isChat ? 'Priority' : (replyPriority === 'Priority' ? 'Priority' : 'General'),
        status: 'Open',
        isRead: false,
        isChatOnly: isChat,
        createdBy: myUid,
        createdByName: myName,
        senderName: myName,
        senderId: myUid,
        timestamp: serverTimestamp(),
        replyToId: active.noteId || null,
        threadId: String(activeTaskMeta?.threadId || active.noteId || '').trim() || null,
        actionUrl: active.noteId
          ? `/admin/my-notes?noteId=${encodeURIComponent(String(active.noteId))}`
          : '/admin/my-notes',
        source: 'electron',
      };

      // Chat should not be tied to a member/client record.
      if (!isChat) {
        if (active.memberName) basePayload.memberName = active.memberName;
        if (active.clientId2) basePayload.clientId2 = active.clientId2;
      }

      await Promise.all(
        Array.from(recipients.entries()).map(([uid, name]) =>
          addDoc(collection(firestore, 'staff_notifications'), {
            ...basePayload,
            userId: uid,
            recipientName: name,
            // Always mark the sender's own copy read so they don't alert themselves.
            isRead: myUid && uid === myUid ? true : basePayload.isRead,
          })
        )
      );

      setReplyDraft('');
      handleMinimize();
    } catch {
      setSendError('Send failed. Please try again.');
    } finally {
      setSendingReply(false);
    }
  }, [
    active,
    extraRecipientIds,
    firestore,
    handleMinimize,
    replyDraft,
    replyPriority,
    sendToSender,
    staffList,
    user?.displayName,
    user?.email,
    user?.uid
  ]);

  const canSetFollowUp = Boolean(active) && String(active?.kind || '').toLowerCase() !== 'cs';

  const handleSaveFollowUp = useCallback(async () => {
    if (!firestore) return;
    if (!active?.noteId) return;
    if (!followUpDraft) return;
    setSavingFollowUp(true);
    try {
      // Persist follow-up onto the original staff_notifications doc so it appears
      // in the Daily Task Tracker / calendar (same as the web app behavior).
      const followUpDate = new Date(`${followUpDraft}T00:00:00`);
      if (Number.isNaN(followUpDate.getTime())) return;
      await updateDoc(doc(firestore, 'staff_notifications', String(active.noteId)), {
        followUpRequired: true,
        followUpDate,
        status: 'Open',
        updatedAt: new Date(),
      });
      setFollowUpOpen(false);
      setFollowUpDraft('');
    } catch {
      // ignore
    } finally {
      setSavingFollowUp(false);
    }
  }, [active?.noteId, firestore, followUpDraft]);

  const handleClearFollowUp = useCallback(async () => {
    if (!firestore) return;
    if (!active?.noteId) return;
    setSavingFollowUp(true);
    try {
      await updateDoc(doc(firestore, 'staff_notifications', String(active.noteId)), {
        followUpRequired: false,
        followUpDate: null,
        updatedAt: new Date(),
      });
      setFollowUpOpen(false);
      setFollowUpDraft('');
    } catch {
      // ignore
    } finally {
      setSavingFollowUp(false);
    }
  }, [active?.noteId, firestore]);

  const toIso = (value: any) => {
    try {
      const d = value?.toDate?.() || new Date(value);
      const ms = d?.getTime?.();
      if (!ms || Number.isNaN(ms)) return '';
      return new Date(ms).toISOString();
    } catch {
      return '';
    }
  };

  useEffect(() => {
    if (!firestore) return;
    const noteId = String(active?.noteId || '').trim();
    const kind = String(active?.kind || '').toLowerCase();
    if (!noteId || kind === 'cs' || kind === 'docs') {
      setActiveTaskMeta(null);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(firestore, 'staff_notifications', noteId),
      (snap) => {
        if (!snap.exists()) {
          setActiveTaskMeta(null);
          return;
        }
        const data = snap.data() as any;
        const threadId = String(data?.threadId || data?.replyToId || noteId).trim();
        setActiveTaskMeta({
          status: String(data?.status || 'Open'),
          followUpRequired: Boolean(data?.followUpRequired),
          followUpDateIso: toIso(data?.followUpDate),
          threadId,
        });
      },
      () => setActiveTaskMeta(null)
    );
    return () => unsubscribe();
  }, [active?.kind, active?.noteId, firestore]);

  useEffect(() => {
    if (!undoClose) return;
    const waitMs = Math.max(0, undoClose.expiresAtMs - Date.now());
    const t = setTimeout(() => setUndoClose(null), waitMs);
    return () => clearTimeout(t);
  }, [undoClose]);

  const canToggleTask =
    Boolean(active?.noteId) &&
    String(active?.kind || '').toLowerCase() === 'note' &&
    Boolean(activeTaskMeta?.followUpRequired || activeTaskMeta?.followUpDateIso);
  const taskIsClosed = String(activeTaskMeta?.status || '').toLowerCase() === 'closed';

  const canSnoozeThis = Boolean(active?.noteId) && String(active?.kind || '').toLowerCase() === 'note';
  const canMuteSender = Boolean(active?.senderId) && String(active?.kind || '').toLowerCase() === 'note';

  const snoozeThisNote = async (untilMs: number) => {
    const noteId = String(active?.noteId || '').trim();
    if (!noteId) return;
    try {
      await window.desktopNotifications?.snoozeNote?.(noteId, untilMs);
      setSnoozeMenuOpen(false);
      handleMinimize();
    } catch {
      // ignore
    }
  };

  const clearSnoozeThisNote = async () => {
    const noteId = String(active?.noteId || '').trim();
    if (!noteId) return;
    try {
      await window.desktopNotifications?.clearSnoozeNote?.(noteId);
      setSnoozeMenuOpen(false);
    } catch {
      // ignore
    }
  };

  const muteThisSender = async (untilMs: number) => {
    const senderId = String(active?.senderId || '').trim();
    if (!senderId) return;
    try {
      await window.desktopNotifications?.muteSender?.(senderId, untilMs);
      setMuteMenuOpen(false);
      handleMinimize();
    } catch {
      // ignore
    }
  };

  const clearMuteThisSender = async () => {
    const senderId = String(active?.senderId || '').trim();
    if (!senderId) return;
    try {
      await window.desktopNotifications?.clearMuteSender?.(senderId);
      setMuteMenuOpen(false);
    } catch {
      // ignore
    }
  };

  const handleToggleTaskStatus = useCallback(async () => {
    if (!firestore) return;
    if (!active?.noteId) return;
    if (!canToggleTask) return;
    setTogglingTaskStatus(true);
    try {
      const nextStatus = taskIsClosed ? 'Open' : 'Closed';
      await updateDoc(doc(firestore, 'staff_notifications', String(active.noteId)), {
        status: nextStatus,
        updatedAt: new Date(),
      });
      if (nextStatus === 'Closed') {
        setUndoClose({ noteId: String(active.noteId), expiresAtMs: Date.now() + 15000 });
      } else {
        setUndoClose(null);
      }
    } catch {
      // ignore
    } finally {
      setTogglingTaskStatus(false);
    }
  }, [active?.noteId, canToggleTask, firestore, taskIsClosed]);

  const handleUndoClose = useCallback(async () => {
    if (!firestore) return;
    if (!undoClose?.noteId) return;
    setTogglingTaskStatus(true);
    try {
      await updateDoc(doc(firestore, 'staff_notifications', String(undoClose.noteId)), {
        status: 'Open',
        updatedAt: new Date(),
      });
      setUndoClose(null);
    } catch {
      // ignore
    } finally {
      setTogglingTaskStatus(false);
    }
  }, [firestore, undoClose?.noteId]);

  return (
    <div className="h-full w-full bg-transparent select-none">
      {count <= 0 ? null : mode === 'compact' ? (
        <button
          type="button"
          className="w-full h-full bg-transparent"
          onClick={() => {
            handleExpand();
          }}
          aria-label="Open notifications panel"
        >
          <div className="w-full h-full flex items-center justify-center">
            <div
              className="rounded-full border bg-white/95 shadow-lg backdrop-blur px-3 py-1.5 inline-flex items-center gap-2"
            >
              <div className="h-2.5 w-2.5 rounded-full bg-blue-600 flex-shrink-0" />
              <div className="text-sm font-medium text-slate-900 whitespace-nowrap">Incoming note</div>
              <div className="text-[11px] text-slate-600 whitespace-nowrap">
                {count === 1 ? '1 pending' : `${count} pending`}
              </div>
            </div>
          </div>
        </button>
      ) : (
        <div className={`mx-auto mt-2 w-[440px] max-w-[96vw] rounded-xl border-l-4 ${accentClassForKind(active?.kind)} border bg-white/95 shadow-xl backdrop-blur p-4`}>
          {undoClose && Date.now() < undoClose.expiresAtMs ? (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2 text-xs">
              <span>Task closed.</span>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-md border bg-white hover:bg-slate-50 disabled:opacity-40"
                disabled={togglingTaskStatus}
                onClick={handleUndoClose}
              >
                Undo
              </button>
            </div>
          ) : null}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500">
                {count === 1 ? '1 priority item' : `${count} priority items`}
              </div>
              <div className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-700 motion-safe:animate-[pulse_2s_ease-in-out_infinite]" />
                Incoming note
              </div>
              {!isOnline ? (
                <div className="mt-1 text-xs text-amber-700">
                  Offline — updates and quick actions may be delayed.
                </div>
              ) : null}
              {lastUpdatedLabel ? (
                <div className="mt-1 text-xs text-slate-500">
                  {lastUpdatedLabel}
                </div>
              ) : null}
              <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                {String(active?.message || pillState?.message || '')}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {(active?.author || pillState?.author) ? `From: ${active?.author || pillState?.author}` : null}
                {(active?.memberName || pillState?.memberName) ? `  •  About: ${active?.memberName || pillState?.memberName}` : null}
              </div>
            </div>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-md border hover:bg-slate-50"
              onClick={handleMinimize}
            >
              Minimize
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-md border disabled:opacity-40"
                disabled={!canPrev}
                onClick={() => handleNavigate(-1)}
              >
                Prev
              </button>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-md border disabled:opacity-40"
                disabled={!canNext}
                onClick={() => handleNavigate(1)}
              >
                Next
              </button>
            </div>
            <div className="flex items-center gap-2">
              {canSetFollowUp ? (
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50"
                  onClick={() => setFollowUpOpen((v) => !v)}
                >
                  Set Follow-up
                </button>
              ) : null}
              {canSnoozeThis ? (
                <div className="relative">
                  <button
                    type="button"
                    className="text-xs px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50"
                    onClick={() => {
                      setSnoozeMenuOpen((v) => !v);
                      setMuteMenuOpen(false);
                    }}
                  >
                    Snooze note
                  </button>
                  {snoozeMenuOpen ? (
                    <div className="absolute right-0 mt-1 w-44 rounded-md border bg-white shadow-lg p-1 z-50">
                      <button className="w-full text-left text-xs px-2 py-1 hover:bg-slate-50 rounded" onClick={() => snoozeThisNote(Date.now() + 15 * 60 * 1000)}>
                        15 minutes
                      </button>
                      <button className="w-full text-left text-xs px-2 py-1 hover:bg-slate-50 rounded" onClick={() => snoozeThisNote(Date.now() + 60 * 60 * 1000)}>
                        1 hour
                      </button>
                      <button
                        className="w-full text-left text-xs px-2 py-1 hover:bg-slate-50 rounded"
                        onClick={() => {
                          const now = new Date();
                          const tomorrow = new Date(now);
                          tomorrow.setDate(now.getDate() + 1);
                          tomorrow.setHours(8, 0, 0, 0);
                          void snoozeThisNote(tomorrow.getTime());
                        }}
                      >
                        Until tomorrow 8am
                      </button>
                      <div className="my-1 border-t" />
                      <button className="w-full text-left text-xs px-2 py-1 hover:bg-slate-50 rounded" onClick={() => void clearSnoozeThisNote()}>
                        Clear snooze
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {canMuteSender ? (
                <div className="relative">
                  <button
                    type="button"
                    className="text-xs px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50"
                    onClick={() => {
                      setMuteMenuOpen((v) => !v);
                      setSnoozeMenuOpen(false);
                    }}
                  >
                    Mute sender
                  </button>
                  {muteMenuOpen ? (
                    <div className="absolute right-0 mt-1 w-44 rounded-md border bg-white shadow-lg p-1 z-50">
                      <button className="w-full text-left text-xs px-2 py-1 hover:bg-slate-50 rounded" onClick={() => void muteThisSender(Date.now() + 60 * 60 * 1000)}>
                        1 hour
                      </button>
                      <button className="w-full text-left text-xs px-2 py-1 hover:bg-slate-50 rounded" onClick={() => void muteThisSender(Date.now() + 2 * 60 * 60 * 1000)}>
                        2 hours
                      </button>
                      <div className="my-1 border-t" />
                      <button className="w-full text-left text-xs px-2 py-1 hover:bg-slate-50 rounded" onClick={() => void clearMuteThisSender()}>
                        Unmute sender
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {canToggleTask ? (
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50 disabled:opacity-40"
                  disabled={togglingTaskStatus}
                  onClick={handleToggleTaskStatus}
                >
                  {togglingTaskStatus ? 'Saving…' : taskIsClosed ? 'Reopen task' : 'Close task'}
                </button>
              ) : null}
              {String(active?.kind || '').toLowerCase() === 'cs' || String(active?.kind || '').toLowerCase() === 'docs' ? null : (
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50 disabled:opacity-40"
                  disabled={markingRead || !active?.noteId}
                  onClick={handleMarkRead}
                >
                  {markingRead ? 'Marking…' : 'Mark read'}
                </button>
              )}
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
                onClick={handleOpen}
              >
                {String(active?.kind || '').toLowerCase() === 'cs' ? 'Open Pathway' : 'Open My Notes'}
              </button>
            </div>
          </div>

          {canSetFollowUp && followUpOpen ? (
            <div className="mt-3 rounded-md border bg-white p-3">
              <div className="text-xs font-medium text-slate-600 mb-2">Follow-up date</div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="flex-1 rounded-md border px-2 py-1 text-sm"
                  value={followUpDraft}
                  onChange={(e) => setFollowUpDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
                  disabled={savingFollowUp || !followUpDraft}
                  onClick={handleSaveFollowUp}
                >
                  {savingFollowUp ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50 disabled:opacity-40"
                  disabled={savingFollowUp}
                  onClick={handleClearFollowUp}
                >
                  Clear
                </button>
              </div>
            </div>
          ) : null}

          {String(active?.kind || '').toLowerCase() === 'cs' ? null : (
            <div className="mt-3">
              {threadError ? (
                <div className="mb-2 rounded-md border bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Conversation unavailable. Use “Open My Notes” to view the thread.
                </div>
              ) : threadMessages.length > 1 ? (
                <details className="mb-2 rounded-md border bg-white p-2" open>
                  <summary className="cursor-pointer text-[11px] text-slate-600">
                    Conversation ({threadMessages.length})
                  </summary>
                  {threadMessages.some((m) => m.isChat) ? (
                    <div className="mt-2 rounded-md border bg-violet-50 px-2 py-1 text-[11px] text-violet-800">
                      Chat messages are saved to My Notifications only (not to client notes / Caspio).
                    </div>
                  ) : null}
                  <div className="mt-2 max-h-28 overflow-auto space-y-2">
                    {threadMessages.map((msg) => {
                      const isMe = Boolean(user?.uid) && msg.senderId === user?.uid;
                      return (
                        <div key={msg.id} className={isMe ? 'flex justify-end' : 'flex justify-start'}>
                          <div
                            className={`max-w-[85%] rounded-md px-2 py-1 text-[12px] whitespace-pre-wrap ${
                              isMe ? 'bg-blue-600 text-white' : 'bg-slate-50 border'
                            }`}
                          >
                            <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] opacity-80">
                              <span className="truncate">
                                {isMe ? 'You' : msg.authorName}
                                {msg.isChat ? ' · Chat' : ''}
                              </span>
                              <span>
                                {msg.createdAtMs
                                  ? new Date(msg.createdAtMs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                                  : ''}
                              </span>
                            </div>
                            <div>{msg.message}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              ) : null}

              <div className="text-xs font-medium text-slate-600 mb-1">Quick reply</div>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={sendToSender}
                    onChange={(e) => setSendToSender(e.target.checked)}
                  />
                  Send to sender
                </label>
                <label className="flex items-center gap-1">
                  <span>Priority</span>
                  <select
                    className="rounded-md border bg-white px-2 py-0.5"
                    value={replyPriority}
                    onChange={(e) => {
                      const value = String(e.target.value || '');
                      if (value === 'Chat') setReplyPriority('Chat');
                      else if (value === 'General') setReplyPriority('General');
                      else setReplyPriority('Priority');
                    }}
                  >
                    <option value="Priority">Priority</option>
                    <option value="General">General</option>
                    <option value="Chat">Chat (popup, no Caspio)</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="ml-auto text-xs px-2 py-1 rounded-md border bg-white hover:bg-slate-50"
                  onClick={() => setStaffPickerOpen((v) => !v)}
                >
                  {staffPickerOpen ? 'Hide staff list' : 'Add staff'}
                </button>
              </div>

              {staffPickerOpen ? (
                <div className="mb-2 rounded-md border bg-white p-2">
                  <input
                    className="w-full rounded-md border px-2 py-1 text-xs"
                    placeholder="Search staff…"
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                  />
                  <div className="mt-2 max-h-32 overflow-auto text-xs">
                    {isLoadingStaff ? (
                      <div className="text-slate-500">Loading staff…</div>
                    ) : (
                      staffList
                        .filter((s) => s.uid !== user?.uid)
                        .filter((s) => s.name.toLowerCase().includes(staffSearch.toLowerCase()))
                        .map((s) => {
                          const checked = extraRecipientIds.has(s.uid);
                          return (
                            <label key={s.uid} className="flex items-center gap-2 py-1">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setExtraRecipientIds((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(s.uid);
                                    else next.delete(s.uid);
                                    return next;
                                  });
                                }}
                              />
                              <span className="text-slate-800">{s.name}</span>
                            </label>
                          );
                        })
                    )}
                  </div>
                </div>
              ) : null}
              <textarea
                className="w-full resize-none rounded-md border bg-white px-2 py-1 text-[12px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                rows={2}
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder="Type a quick reply…"
              />
              {sendError ? (
                <div className="mt-1 text-[11px] text-red-600">{sendError}</div>
              ) : null}
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-md border bg-white hover:bg-slate-50 disabled:opacity-40"
                  disabled={sendingReply || !replyDraft.trim()}
                  onClick={handleSendReply}
                >
                  {sendingReply ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

