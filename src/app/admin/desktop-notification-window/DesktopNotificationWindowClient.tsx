'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@/firebase';
import { useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';

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
  const [followUpDraft, setFollowUpDraft] = useState<string>('');
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [savingFollowUp, setSavingFollowUp] = useState(false);

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

  useEffect(() => {
    // Reset draft when active note changes.
    setReplyDraft('');
    setFollowUpOpen(false);
    setFollowUpDraft('');
  }, [active?.noteId, active?.senderId, active?.timestamp, active?.title]);

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

  const handleSendReply = useCallback(async () => {
    if (!active) return;
    const message = replyDraft.trim();
    if (!message) return;
    setSendingReply(true);
    try {
      const myUid = String(user?.uid || '').trim();
      const source = String(active.source || '').toLowerCase();
      const clientId2 = String(active.clientId2 || '').trim();

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

        // Also log to My Notifications for the sender (so staff has a history in the web app).
        if (myUid) {
          window.desktopNotificationPill?.sendReply?.({
            noteId: active.noteId,
            senderId: myUid,
            message,
          });
        }
      } else {
        // Interoffice priority: use existing quick-reply bridge (writes a Firestore staff_notification).
        window.desktopNotificationPill?.sendReply?.({
          noteId: active.noteId,
          senderId: active.senderId,
          message,
        });
      }
      setReplyDraft('');
      handleMinimize();
    } catch {
      // ignore
    } finally {
      setSendingReply(false);
    }
  }, [active, replyDraft, handleMinimize, user?.uid]);

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
          onClick={handleExpand}
          aria-label="Open notifications panel"
        >
          <div className="mx-auto mt-2 w-[400px] max-w-[94vw] rounded-full border bg-white/95 shadow-lg backdrop-blur px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-blue-600" />
              <div className="text-sm font-medium text-slate-900">Priority</div>
              <div className="text-xs text-slate-600">
                {count === 1 ? '1 pending' : `${count} pending`}
              </div>
            </div>
            <div className="text-xs text-slate-500">Click to open</div>
          </div>
        </button>
      ) : (
        <div className={`mx-auto mt-2 w-[440px] max-w-[96vw] rounded-xl border-l-4 ${accentClassForKind(active?.kind)} border bg-white/95 shadow-xl backdrop-blur p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500">
                {count === 1 ? '1 priority item' : `${count} priority items`}
              </div>
              <div className="text-base font-semibold text-slate-900">
                {String(active?.title || pillState?.title || 'Priority')}
              </div>
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

