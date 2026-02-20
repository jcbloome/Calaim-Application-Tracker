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
  const [markingRead, setMarkingRead] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [replyPriority, setReplyPriority] = useState<'General' | 'Priority'>('Priority');
  const [sendToSender, setSendToSender] = useState(true);
  const [sendCopyToMe, setSendCopyToMe] = useState(true);
  const [staffList, setStaffList] = useState<Array<{ uid: string; name: string }>>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [extraRecipientIds, setExtraRecipientIds] = useState<Set<string>>(new Set());
  const [followUpDraft, setFollowUpDraft] = useState<string>('');
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const lastPillPositionRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    dragging: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
    moved: boolean;
    raf: number | null;
    nextX: number;
    nextY: number;
  }>({
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startPos: { x: 0, y: 0 },
    moved: false,
    raf: null,
    nextX: 0,
    nextY: 0,
  });

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Best-effort: read current pill position so dragging starts from correct baseline.
    window.desktopNotificationPill?.getPosition?.()
      .then((pos) => {
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          lastPillPositionRef.current = { x: pos.x, y: pos.y };
        }
      })
      .catch(() => null);
  }, []);

  const mode = pillState?.mode === 'panel' ? 'panel' : 'compact';
  const count = Number(pillState?.count || 0);
  const activeIndex = Math.max(0, Number(pillState?.activeIndex || 0));
  const active = pillState?.activeNote || null;
  const canPrev = activeIndex > 0;
  const canNext = Array.isArray(pillState?.notes) ? activeIndex < (pillState!.notes!.length - 1) : false;

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
    // Reset draft when active note changes.
    setReplyDraft('');
    // This window only shows Priority/Urgent notes, so default replies to Priority.
    setReplyPriority('Priority');
    setSendToSender(true);
    setSendCopyToMe(true);
    setExtraRecipientIds(new Set());
    setStaffPickerOpen(false);
    setStaffSearch('');
    setFollowUpOpen(false);
    setFollowUpDraft('');
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

  const handleDragPointerDown = useCallback((event: React.PointerEvent) => {
    try {
      if (event.button !== 0) return;
      if (!window.desktopNotificationPill?.move) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const pos = lastPillPositionRef.current;
      dragRef.current.dragging = true;
      dragRef.current.pointerId = event.pointerId;
      dragRef.current.startX = event.clientX;
      dragRef.current.startY = event.clientY;
      dragRef.current.startPos = pos || { x: 0, y: 0 };
      dragRef.current.moved = false;
    } catch {
      // ignore
    }
  }, []);

  const handleDragPointerMove = useCallback((event: React.PointerEvent) => {
    try {
      if (!dragRef.current.dragging) return;
      if (dragRef.current.pointerId !== event.pointerId) return;
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      if (!dragRef.current.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        dragRef.current.moved = true;
      }

      const nextX = dragRef.current.startPos.x + dx;
      const nextY = dragRef.current.startPos.y + dy;
      dragRef.current.nextX = nextX;
      dragRef.current.nextY = nextY;

      if (dragRef.current.raf) return;
      dragRef.current.raf = window.requestAnimationFrame(() => {
        dragRef.current.raf = null;
        try {
          window.desktopNotificationPill?.move?.(dragRef.current.nextX, dragRef.current.nextY);
          lastPillPositionRef.current = { x: dragRef.current.nextX, y: dragRef.current.nextY };
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
  }, []);

  const handleDragPointerUp = useCallback((event: React.PointerEvent) => {
    try {
      if (dragRef.current.pointerId !== event.pointerId) return;
      dragRef.current.dragging = false;
      dragRef.current.pointerId = null;
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

      if (sendCopyToMe && myUid) {
        recipients.set(myUid, String(myName));
      }

      for (const id of Array.from(extraRecipientIds)) {
        const name = staffList.find((s) => s.uid === id)?.name || 'Staff';
        recipients.set(id, name);
      }

      // No-op safety.
      if (recipients.size === 0) return;

      if (source === 'caspio' && clientId2) {
        // Caspio is source of truth: write the reply into connect_tbl_clientnotes.
        await fetch('/api/client-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId2,
            comments: message,
            followUpStatus: '🟡 Priority',
          }),
        });
      }

      const basePayload: Record<string, any> = {
        title: `Reply: ${String(active.title || 'Incoming note')}`,
        message,
        type: 'interoffice_reply',
        priority: replyPriority,
        status: 'Open',
        isRead: false,
        createdBy: myUid,
        createdByName: myName,
        senderName: myName,
        senderId: myUid,
        timestamp: serverTimestamp(),
        replyToId: active.noteId || null,
        threadId: active.noteId || null,
        actionUrl: active.noteId
          ? `/admin/my-notes?noteId=${encodeURIComponent(String(active.noteId))}`
          : '/admin/my-notes',
        source: 'electron',
      };

      if (active.memberName) basePayload.memberName = active.memberName;
      if (active.clientId2) basePayload.clientId2 = active.clientId2;

      await Promise.all(
        Array.from(recipients.entries()).map(([uid, name]) =>
          addDoc(collection(firestore, 'staff_notifications'), {
            ...basePayload,
            userId: uid,
            recipientName: name,
          })
        )
      );

      setReplyDraft('');
      handleMinimize();
    } catch {
      // ignore
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
    sendCopyToMe,
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

  return (
    <div className="min-h-screen w-full bg-transparent select-none">
      {count <= 0 ? null : mode === 'compact' ? (
        <button
          type="button"
          className="w-full h-full bg-transparent"
          onClick={() => {
            if (dragRef.current.moved) {
              dragRef.current.moved = false;
              return;
            }
            handleExpand();
          }}
          aria-label="Open notifications panel"
        >
          <div
            className="mx-auto mt-2 w-[320px] max-w-[92vw] rounded-full border bg-white/95 shadow-lg backdrop-blur px-3 py-2 flex items-center justify-between cursor-grab active:cursor-grabbing"
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-2.5 w-2.5 rounded-full bg-blue-600 flex-shrink-0" />
              <div className="text-sm font-medium text-slate-900">Incoming note</div>
              <div className="text-[11px] text-slate-600 truncate">
                {count === 1 ? '1 pending' : `${count} pending`}
              </div>
            </div>
          </div>
        </button>
      ) : (
        <div className={`mx-auto mt-2 w-[440px] max-w-[96vw] rounded-xl border-l-4 ${accentClassForKind(active?.kind)} border bg-white/95 shadow-xl backdrop-blur p-4`}>
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
              <div className="text-xs font-medium text-slate-600 mb-1">Quick reply</div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={sendToSender}
                    onChange={(e) => setSendToSender(e.target.checked)}
                  />
                  Send to sender
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={sendCopyToMe}
                    onChange={(e) => setSendCopyToMe(e.target.checked)}
                  />
                  Copy to me
                </label>
                <label className="flex items-center gap-1">
                  <span>Priority</span>
                  <select
                    className="rounded-md border bg-white px-2 py-1"
                    value={replyPriority}
                    onChange={(e) => setReplyPriority(e.target.value === 'General' ? 'General' : 'Priority')}
                  >
                    <option value="Priority">Priority</option>
                    <option value="General">General</option>
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
                className="w-full resize-none rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                rows={3}
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder="Type a quick reply…"
              />
              <div className="mt-2 flex justify-end">
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

