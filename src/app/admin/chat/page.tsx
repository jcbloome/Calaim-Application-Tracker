'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import {
  addDoc,
  collection,
  doc,
  increment,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MessageSquareText, Send, Users } from 'lucide-react';
import { getDirectConversationId, getOtherParticipantUid } from '@/lib/chat-utils';
import { useSearchParams } from 'next/navigation';

type StaffUser = {
  uid: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  isStaff?: boolean;
};

type ConversationDoc = {
  id: string;
  kind: 'direct';
  participants: string[];
  participantInfo?: Record<string, { name?: string; email?: string }>;
  lastMessageText?: string;
  lastMessageAt?: any;
  lastMessageSenderUid?: string;
  lastMessageId?: string;
  readAtByUid?: Record<string, any>;
  unreadCountByUid?: Record<string, number>;
  updatedAt?: any;
  createdAt?: any;
};

type MessageDoc = {
  id: string;
  text: string;
  senderUid: string;
  senderName?: string;
  createdAt?: any;
};

type DesktopPresenceDoc = {
  uid?: string;
  active?: boolean;
  source?: string;
  lastSeenAt?: any;
};

function toMs(value: any) {
  try {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
}

function displayNameForUser(u: StaffUser) {
  const name =
    u.displayName ||
    `${String(u.firstName || '').trim()} ${String(u.lastName || '').trim()}`.trim();
  return name || u.email || u.uid;
}

function DeepLinkListener({ onCid }: { onCid: (cid: string) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const cid = String(searchParams?.get('cid') || '').trim();
    if (cid) onCid(cid);
  }, [searchParams, onCid]);
  return null;
}

function formatTime(value: any) {
  try {
    const d =
      typeof value?.toDate === 'function'
        ? value.toDate()
        : value instanceof Date
          ? value
          : value
            ? new Date(value)
            : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  } catch {
    return '';
  }
}

export default function AdminChatPage() {
  const { isAdmin, isLoading: isAdminLoading, user } = useAdmin();
  const firestore = useFirestore();

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffFilter, setStaffFilter] = useState('');
  const [staffSelectUid, setStaffSelectUid] = useState<string>('');

  const [desktopPresenceByUid, setDesktopPresenceByUid] = useState<Record<string, DesktopPresenceDoc>>({});

  const [conversations, setConversations] = useState<ConversationDoc[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeOtherUid, setActiveOtherUid] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deepLinkCid, setDeepLinkCid] = useState<string>('');

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const myUid = String(user?.uid || '').trim();

  const markConversationRead = async (conversationId: string) => {
    if (!firestore || !myUid) return;
    const ref = doc(firestore, 'chat_conversations', conversationId);
    const field = `readAtByUid.${myUid}`;
    const unreadField = `unreadCountByUid.${myUid}`;
    try {
      await updateDoc(ref, { [field]: serverTimestamp(), [unreadField]: 0 } as any);
    } catch {
      // ignore
    }
  };

  const isDesktopActive = (uid?: string | null) => {
    const id = String(uid || '').trim();
    if (!id) return false;
    const p = desktopPresenceByUid[id];
    if (!p) return false;
    if (p.source !== 'electron') return false;
    if (p.active === false) return false;
    const ms = typeof p?.lastSeenAt?.toMillis === 'function' ? p.lastSeenAt.toMillis() : 0;
    if (!ms) return false;
    return Date.now() - ms <= 120_000; // 2 minutes freshness window
  };

  const activeOther = useMemo(() => {
    if (!activeOtherUid) return null;
    return staff.find((s) => s.uid === activeOtherUid) || null;
  }, [activeOtherUid, staff]);

  const filteredStaff = useMemo(() => {
    const q = staffFilter.trim().toLowerCase();
    const base = staff.filter((s) => s.uid && s.uid !== myUid);
    if (!q) return base;
    return base.filter((s) => {
      const hay = `${displayNameForUser(s)} ${s.email || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [staff, staffFilter, myUid]);

  const sortedConversations = useMemo(() => {
    const copy = [...conversations];
    copy.sort((a, b) => {
      const aMs = (typeof a?.updatedAt?.toMillis === 'function' ? a.updatedAt.toMillis() : 0) || 0;
      const bMs = (typeof b?.updatedAt?.toMillis === 'function' ? b.updatedAt.toMillis() : 0) || 0;
      return bMs - aMs;
    });
    return copy;
  }, [conversations]);

  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, activeConversationId]);

  useEffect(() => {
    if (!isAdmin || !firestore) return;
    let cancelled = false;
    setStaffLoading(true);

    const load = async () => {
      try {
        const [staffUsersSnap, adminRolesSnap, superAdminRolesSnap] = await Promise.all([
          getDocs(query(collection(firestore, 'users'), where('isStaff', '==', true))).catch(() => ({ docs: [] } as any)),
          getDocs(collection(firestore, 'roles_admin')).catch(() => ({ docs: [] } as any)),
          getDocs(collection(firestore, 'roles_super_admin')).catch(() => ({ docs: [] } as any)),
        ]);

        const userById = new Map<string, any>();
        staffUsersSnap.docs.forEach((d: any) => userById.set(String(d.id), d.data()));

        const roleIds = new Set<string>([
          ...adminRolesSnap.docs.map((d: any) => String(d.id)),
          ...superAdminRolesSnap.docs.map((d: any) => String(d.id)),
        ]);

        // Hydrate role-based users that are not in users/isStaff.
        const missing = Array.from(roleIds).filter((id) => !userById.has(id) && !String(id).includes('@'));
        const missingDocs = await Promise.all(
          missing.map(async (uid) => {
            try {
              const snap = await getDoc(doc(firestore, 'users', uid));
              return snap.exists() ? { uid, data: snap.data() } : null;
            } catch {
              return null;
            }
          })
        );
        missingDocs.filter(Boolean).forEach((m: any) => userById.set(String(m.uid), m.data));

        // Best-effort: include current user if not present.
        if (myUid && !userById.has(myUid)) {
          userById.set(myUid, { email: user?.email || '', displayName: user?.displayName || '' });
        }

        const list: StaffUser[] = Array.from(userById.entries()).map(([uid, data]) => ({
          uid,
          email: (data as any)?.email,
          firstName: (data as any)?.firstName,
          lastName: (data as any)?.lastName,
          displayName: (data as any)?.displayName,
          isStaff: Boolean((data as any)?.isStaff),
        }));

        list.sort((a, b) => displayNameForUser(a).localeCompare(displayNameForUser(b)));
        if (!cancelled) setStaff(list);
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [firestore, isAdmin, myUid, user?.displayName, user?.email]);

  useEffect(() => {
    if (!isAdmin || !firestore || !myUid) return;
    setConvLoading(true);
    const qConvs = query(collection(firestore, 'chat_conversations'), where('participants', 'array-contains', myUid));
    const unsub = onSnapshot(
      qConvs,
      (snap) => {
        const list: ConversationDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setConversations(list);
        setConvLoading(false);
      },
      () => setConvLoading(false)
    );
    return () => unsub();
  }, [firestore, isAdmin, myUid]);

  useEffect(() => {
    if (!isAdmin || !firestore) return;
    const unsub = onSnapshot(
      collection(firestore, 'desktop_presence'),
      (snap) => {
        const next: Record<string, DesktopPresenceDoc> = {};
        snap.docs.forEach((d) => {
          next[String(d.id)] = { ...(d.data() as any) };
        });
        setDesktopPresenceByUid(next);
      },
      () => setDesktopPresenceByUid({})
    );
    return () => unsub();
  }, [firestore, isAdmin]);

  useEffect(() => {
    if (!firestore || !activeConversationId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    setMessagesLoading(true);
    const qMsgs = query(collection(firestore, 'chat_conversations', activeConversationId, 'messages'));
    const unsub = onSnapshot(
      qMsgs,
      (snap) => {
        const list: MessageDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        // Sort client-side to avoid composite indexes.
        list.sort((a, b) => {
          const aMs = (typeof a?.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0) || 0;
          const bMs = (typeof b?.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0) || 0;
          return aMs - bMs;
        });
        setMessages(list);
        setMessagesLoading(false);
      },
      () => setMessagesLoading(false)
    );
    return () => unsub();
  }, [firestore, activeConversationId]);

  const openDirectChat = async (other: StaffUser) => {
    if (!firestore || !myUid) return;
    const otherUid = String(other.uid || '').trim();
    if (!otherUid) return;
    const id = getDirectConversationId(myUid, otherUid);
    if (!id) return;

    const ref = doc(firestore, 'chat_conversations', id);
    await setDoc(
      ref,
      {
        kind: 'direct',
        participants: [myUid, otherUid],
        participantInfo: {
          [myUid]: {
            name: user?.displayName || user?.email || myUid,
            email: user?.email || undefined,
          },
          [otherUid]: {
            name: displayNameForUser(other),
            email: other.email || undefined,
          },
        },
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    setActiveConversationId(id);
    setActiveOtherUid(otherUid);
    void markConversationRead(id);
  };

  const openConversation = (c: ConversationDoc) => {
    setActiveConversationId(c.id);
    const otherUid = getOtherParticipantUid(c.participants || [], myUid);
    setActiveOtherUid(otherUid);
    void markConversationRead(c.id);
  };

  const sendMessage = async () => {
    if (!firestore || !activeConversationId || !myUid) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const convRef = doc(firestore, 'chat_conversations', activeConversationId);
      const msgsRef = collection(firestore, 'chat_conversations', activeConversationId, 'messages');

      const batch = writeBatch(firestore);
      const msgRef = doc(msgsRef);
      batch.set(msgRef, {
        text,
        senderUid: myUid,
        senderName: user?.displayName || user?.email || myUid,
        createdAt: serverTimestamp(),
      });

      const otherUid = String(activeOtherUid || '').trim();
      const myUnreadField = `unreadCountByUid.${myUid}`;
      const otherUnreadField = otherUid ? `unreadCountByUid.${otherUid}` : null;
      const myReadField = `readAtByUid.${myUid}`;

      batch.set(
        convRef,
        {
          lastMessageText: text.slice(0, 400),
          lastMessageAt: serverTimestamp(),
          lastMessageSenderUid: myUid,
          lastMessageId: msgRef.id,
          [myReadField]: serverTimestamp(),
          [myUnreadField]: 0,
          ...(otherUnreadField ? { [otherUnreadField]: increment(1) } : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await batch.commit();
      void markConversationRead(activeConversationId);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  // Deep-link: /admin/chat?cid=<conversationId>
  useEffect(() => {
    if (!myUid) return;
    const cid = String(deepLinkCid || '').trim();
    if (!cid) return;
    if (cid === activeConversationId) return;
    const found = conversations.find((c) => c.id === cid);
    if (!found) return;
    openConversation(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkCid, conversations, myUid]);

  if (isAdminLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You need admin privileges to use staff chat.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <Suspense fallback={null}>
        <DeepLinkListener onCid={setDeepLinkCid} />
      </Suspense>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Chat</h1>
          <p className="text-sm text-muted-foreground">
            Real-time staff messaging (Firestore). Conversations are direct (1:1) for now.
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          Admin only
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left rail */}
        <Card className="lg:col-span-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4" />
              Conversations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Start a chat</div>
              <Input
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                placeholder="Search staff…"
              />
              <Select
                value={staffSelectUid}
                onValueChange={(uid) => {
                  setStaffSelectUid(uid);
                  const target = staff.find((s) => String(s.uid) === String(uid));
                  if (target) void openDirectChat(target);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select staff…" />
                </SelectTrigger>
                <SelectContent>
                  {filteredStaff.slice(0, 50).map((s) => (
                    <SelectItem key={s.uid} value={s.uid}>
                      <span className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isDesktopActive(s.uid) ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{displayNameForUser(s)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ScrollArea className="h-[180px] rounded-md border">
                <div className="p-2 space-y-1">
                  {staffLoading ? (
                    <div className="p-2 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading staff…
                    </div>
                  ) : filteredStaff.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No staff found.</div>
                  ) : (
                    filteredStaff.slice(0, 50).map((s) => (
                      <button
                        key={s.uid}
                        onClick={() => void openDirectChat(s)}
                        className="w-full text-left rounded-md px-2 py-2 hover:bg-accent"
                        title={s.email || s.uid}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isDesktopActive(s.uid) ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                            aria-hidden="true"
                          />
                          <div className="text-sm font-medium truncate">{displayNameForUser(s)}</div>
                          {isDesktopActive(s.uid) ? (
                            <Badge variant="secondary" className="ml-auto text-[10px]">
                              Desktop
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{s.email || s.uid}</div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Your conversations</div>
              <ScrollArea className="h-[260px] rounded-md border">
                <div className="p-2 space-y-1">
                  {convLoading ? (
                    <div className="p-2 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading conversations…
                    </div>
                  ) : sortedConversations.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No conversations yet. Start one above.
                    </div>
                  ) : (
                    sortedConversations.map((c) => {
                      const otherUid = getOtherParticipantUid(c.participants || [], myUid);
                      const otherInfo = otherUid ? c.participantInfo?.[otherUid] : null;
                      const label = otherInfo?.name || otherInfo?.email || otherUid || c.id;
                      const active = c.id === activeConversationId;
                      const isUnread =
                        Boolean(myUid) &&
                        toMs(c.lastMessageAt) > toMs(c.readAtByUid?.[myUid]) &&
                        String(c.lastMessageSenderUid || '').trim() !== String(myUid).trim();
                      const unreadCount = Math.max(0, Number(c.unreadCountByUid?.[myUid] ?? (isUnread ? 1 : 0)) || 0);
                      return (
                        <button
                          key={c.id}
                          onClick={() => openConversation(c)}
                          className={`w-full text-left rounded-md px-2 py-2 hover:bg-accent ${
                            active ? 'bg-accent' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                isDesktopActive(otherUid) ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                              aria-hidden="true"
                            />
                            <div className="text-sm font-medium truncate">{label}</div>
                            {isUnread ? (
                              <Badge variant="default" className="ml-auto text-[10px]">
                                {unreadCount}
                              </Badge>
                            ) : isDesktopActive(otherUid) ? (
                              <Badge variant="secondary" className="ml-auto text-[10px]">
                                Desktop
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.lastMessageText || 'No messages yet'}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        {/* Chat panel */}
        <Card className="lg:col-span-8">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="truncate">
                {activeOther ? `Chat with ${displayNameForUser(activeOther)}` : 'Select a conversation'}
              </span>
              {activeConversationId ? (
                <span className="flex items-center gap-2">
                  {activeOtherUid && isDesktopActive(activeOtherUid) ? (
                    <Badge variant="secondary" className="text-xs">
                      Desktop active
                    </Badge>
                  ) : null}
                  <Badge variant="secondary" className="font-mono text-xs">
                    {activeConversationId.slice(0, 10)}
                  </Badge>
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScrollArea className="h-[520px] rounded-md border">
              <div className="p-3 space-y-2">
                {!activeConversationId ? (
                  <div className="text-sm text-muted-foreground">
                    Pick a staff member on the left to start chatting.
                  </div>
                ) : messagesLoading ? (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading messages…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No messages yet.</div>
                ) : (
                  messages.map((m) => {
                    const mine = String(m.senderUid || '') === myUid;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-lg border p-2 ${mine ? 'bg-blue-50' : 'bg-white'}`}>
                          <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                            <span className="truncate">{mine ? 'You' : m.senderName || m.senderUid}</span>
                            <span className="flex-shrink-0">{formatTime(m.createdAt)}</span>
                          </div>
                          <div className="text-sm whitespace-pre-wrap break-words">{m.text}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={activeConversationId ? 'Type a message…' : 'Select a conversation to chat…'}
                disabled={!activeConversationId || sending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <Button onClick={() => void sendMessage()} disabled={!activeConversationId || sending || !draft.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

