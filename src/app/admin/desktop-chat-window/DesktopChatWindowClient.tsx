'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { addDoc, collection, getDocs, onSnapshot, query, serverTimestamp, where, documentId } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquarePlus, Send, Users } from 'lucide-react';

type StaffMemberLite = { uid: string; name: string };

type ChatMessage = {
  id: string;
  threadId: string;
  message: string;
  senderId: string;
  senderName: string;
  createdAtMs: number;
  participants: string[];
  participantNames: string[];
};

function buildChatThreadId(participants: string[]) {
  const ids = Array.from(new Set(participants.map((x) => String(x || '').trim()).filter(Boolean))).sort();
  return `chat:${ids.join(':')}`;
}

export default function DesktopChatWindowClient() {
  const { user } = useUser();
  const firestore = useFirestore();

  const myUid = String(user?.uid || '').trim();
  const myName = String(user?.displayName || user?.email || 'Staff').trim() || 'Staff';

  const [staffList, setStaffList] = useState<StaffMemberLite[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [selectedParticipantNames, setSelectedParticipantNames] = useState<string[]>([]);

  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientIds, setRecipientIds] = useState<Set<string>>(new Set());

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const filteredStaff = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    return staffList
      .filter((s) => s.uid !== myUid)
      .filter((s) => (q ? s.name.toLowerCase().includes(q) : true));
  }, [recipientSearch, staffList, myUid]);

  const threads = useMemo(() => {
    const byThread = new Map<string, ChatMessage[]>();
    for (const m of messages) {
      const arr = byThread.get(m.threadId) || [];
      arr.push(m);
      byThread.set(m.threadId, arr);
    }
    const heads = Array.from(byThread.entries()).map(([threadId, msgs]) => {
      msgs.sort((a, b) => a.createdAtMs - b.createdAtMs);
      const last = msgs[msgs.length - 1];
      const names = (last.participantNames || []).filter(Boolean);
      const title = names.length ? names.join(', ') : threadId;
      return { threadId, last, title, count: msgs.length };
    });
    heads.sort((a, b) => b.last.createdAtMs - a.last.createdAtMs);
    return heads;
  }, [messages]);

  const activeThreadMessages = useMemo(() => {
    if (!selectedThreadId) return [];
    return messages
      .filter((m) => m.threadId === selectedThreadId)
      .slice()
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }, [messages, selectedThreadId]);

  const loadAdminStaff = useCallback(async () => {
    if (!firestore) return;
    if (!myUid) return;
    setLoadingStaff(true);
    try {
      const [adminSnap, superAdminSnap] = await Promise.all([
        getDocs(collection(firestore, 'roles_admin')),
        getDocs(collection(firestore, 'roles_super_admin')),
      ]);
      const ids = Array.from(new Set([...adminSnap.docs.map((d) => d.id), ...superAdminSnap.docs.map((d) => d.id)]));
      if (ids.length === 0) {
        setStaffList([]);
        return;
      }
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

      const users: StaffMemberLite[] = [];
      for (const chunk of chunks) {
        const usersSnap = await getDocs(query(collection(firestore, 'users'), where(documentId(), 'in', chunk)));
        usersSnap.forEach((docItem) => {
          const data = docItem.data() as any;
          const name =
            data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : data.displayName || data.email || 'Unknown Staff';
          users.push({ uid: docItem.id, name });
        });
      }
      users.sort((a, b) => a.name.localeCompare(b.name));
      setStaffList(users);
    } finally {
      setLoadingStaff(false);
    }
  }, [firestore, myUid]);

  useEffect(() => {
    void loadAdminStaff();
  }, [loadAdminStaff]);

  useEffect(() => {
    if (!firestore || !myUid) return;
    const qy = query(
      collection(firestore, 'staff_notifications'),
      where('userId', '==', myUid),
      where('isChatOnly', '==', true),
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: ChatMessage[] = [];
        snap.forEach((docItem) => {
          const data = docItem.data() as any;
          const threadId = String(data?.threadId || docItem.id).trim() || docItem.id;
          const message = String(data?.message || '').trim();
          if (!message) return;
          const ts =
            data?.timestamp?.toDate?.()?.getTime?.()
            || data?.createdAt?.toDate?.()?.getTime?.()
            || (data?.createdAt ? new Date(data.createdAt).getTime() : 0)
            || 0;
          const senderId = String(data?.senderId || data?.createdBy || '').trim();
          const senderName = String(data?.senderName || data?.createdByName || 'Staff').trim() || 'Staff';
          const participants = Array.isArray(data?.participants) ? data.participants.map((x: any) => String(x || '').trim()).filter(Boolean) : [];
          const participantNames = Array.isArray(data?.participantNames) ? data.participantNames.map((x: any) => String(x || '').trim()).filter(Boolean) : [];
          next.push({
            id: docItem.id,
            threadId,
            message,
            senderId,
            senderName,
            createdAtMs: Number(ts || 0),
            participants,
            participantNames,
          });
        });
        setMessages(next);
      },
      () => setMessages([])
    );

    return () => unsub();
  }, [firestore, myUid]);

  useEffect(() => {
    if (selectedThreadId) return;
    if (threads.length === 0) return;
    setSelectedThreadId(threads[0].threadId);
  }, [selectedThreadId, threads]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const head = threads.find((t) => t.threadId === selectedThreadId);
    if (!head?.last) return;
    setSelectedParticipants(head.last.participants || []);
    setSelectedParticipantNames(head.last.participantNames || []);
  }, [selectedThreadId, threads]);

  const startNewChat = () => {
    setSelectedThreadId('');
    setSelectedParticipants([]);
    setSelectedParticipantNames([]);
    setRecipientIds(new Set());
    setRecipientSearch('');
    setDraft('');
  };

  const handleSend = useCallback(async () => {
    if (!firestore || !myUid) return;
    const message = draft.trim();
    if (!message) return;

    const baseRecipients = selectedThreadId
      ? (selectedParticipants || []).filter(Boolean)
      : Array.from(recipientIds);

    const uniqueRecipients = Array.from(new Set([...baseRecipients, myUid])).filter(Boolean);
    const nonSelf = uniqueRecipients.filter((id) => id !== myUid);
    if (nonSelf.length === 0) return;

    const participantNames = uniqueRecipients.map((uid) => {
      if (uid === myUid) return myName;
      return staffList.find((s) => s.uid === uid)?.name || 'Staff';
    });

    const threadId = selectedThreadId || buildChatThreadId(uniqueRecipients);

    setSending(true);
    try {
      const basePayload: Record<string, any> = {
        title: 'Chat',
        message,
        type: 'interoffice_chat',
        priority: 'General',
        status: 'Open',
        isRead: false,
        isChatOnly: true,
        hiddenFromInbox: true,
        createdBy: myUid,
        createdByName: myName,
        senderName: myName,
        senderId: myUid,
        timestamp: serverTimestamp(),
        threadId,
        actionUrl: '/admin/desktop-chat-window',
        source: 'electron',
        participants: uniqueRecipients,
        participantNames,
      };

      await Promise.all(
        uniqueRecipients.map((uid) => {
          const recipientName = uid === myUid ? myName : (staffList.find((s) => s.uid === uid)?.name || 'Staff');
          return addDoc(collection(firestore, 'staff_notifications'), {
            ...basePayload,
            userId: uid,
            recipientName,
            isRead: uid === myUid ? true : basePayload.isRead,
          });
        })
      );

      setDraft('');
      setSelectedThreadId(threadId);
      setRecipientIds(new Set());
    } finally {
      setSending(false);
    }
  }, [draft, firestore, myName, myUid, recipientIds, selectedParticipants, selectedThreadId, staffList]);

  const headerTitle = useMemo(() => {
    if (!selectedThreadId) return 'New chat';
    const names = (selectedParticipantNames || []).filter((n) => n && n !== myName);
    if (names.length === 0) return 'Chat';
    return names.join(', ');
  }, [myName, selectedParticipantNames, selectedThreadId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-700" />
            <div className="font-semibold text-slate-900">Staff Chat</div>
            <Badge variant="secondary" className="ml-2">No alerts</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={startNewChat}>
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            New chat
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[320px_1fr]">
        <div className="rounded-lg border bg-white">
          <div className="border-b px-3 py-2 text-sm font-medium text-slate-700">Threads</div>
          <div className="max-h-[70vh] overflow-auto">
            {threads.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-500">No chats yet.</div>
            ) : (
              threads.map((t) => (
                <button
                  key={t.threadId}
                  type="button"
                  className={`w-full px-3 py-3 text-left hover:bg-slate-50 ${
                    t.threadId === selectedThreadId ? 'bg-slate-50' : ''
                  }`}
                  onClick={() => setSelectedThreadId(t.threadId)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium text-slate-900">{t.title}</div>
                    <div className="text-[11px] text-slate-500">{t.count}</div>
                  </div>
                  <div className="mt-1 line-clamp-1 text-xs text-slate-600">{t.last.message}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-white">
          <div className="border-b px-3 py-2">
            <div className="text-sm font-semibold text-slate-900">{headerTitle}</div>
            <div className="mt-1 text-xs text-slate-500">
              Chat messages are saved separately and do not trigger priority notifications.
            </div>
          </div>

          {!selectedThreadId ? (
            <div className="p-3">
              <div className="text-sm font-medium text-slate-700">Choose recipients</div>
              <div className="mt-2">
                <Input
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Search staff…"
                />
              </div>
              <div className="mt-2 max-h-56 overflow-auto rounded-md border p-2">
                {loadingStaff ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading staff…
                  </div>
                ) : filteredStaff.length === 0 ? (
                  <div className="text-sm text-slate-500">No matches.</div>
                ) : (
                  filteredStaff.map((s) => {
                    const checked = recipientIds.has(s.uid);
                    return (
                      <label key={s.uid} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setRecipientIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(s.uid);
                              else next.delete(s.uid);
                              return next;
                            });
                          }}
                        />
                        <span className="truncate">{s.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-auto p-3 space-y-2">
              {activeThreadMessages.length === 0 ? (
                <div className="text-sm text-slate-500">No messages.</div>
              ) : (
                activeThreadMessages.map((m) => {
                  const isMe = m.senderId === myUid;
                  return (
                    <div key={m.id} className={isMe ? 'flex justify-end' : 'flex justify-start'}>
                      <div className={`max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                        isMe ? 'bg-blue-600 text-white' : 'bg-slate-50 border'
                      }`}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-[11px] opacity-80">
                          <span className="truncate">{isMe ? 'You' : m.senderName}</span>
                          <span>
                            {m.createdAtMs ? new Date(m.createdAtMs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        <div>{m.message}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          <div className="border-t p-3">
            <div className="flex gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder="Type a message…"
              />
              <Button onClick={handleSend} disabled={sending || !draft.trim()} className="shrink-0">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              Tip: start a new chat to choose recipients.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

