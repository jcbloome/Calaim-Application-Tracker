'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Monitor, Search } from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  documentId,
  Timestamp,
} from 'firebase/firestore';

type StaffUser = {
  uid: string;
  label: string;
  email: string;
  role: 'Super Admin' | 'Admin' | 'Staff';
};

type PresenceRow = {
  uid: string;
  active: boolean;
  pausedByUser: boolean;
  effectivePaused: boolean;
  snoozedUntilMs: number;
  lastSeenAtMs: number;
};

const toMs = (value: any): number => {
  if (!value) return 0;
  try {
    if (value instanceof Timestamp) return value.toMillis();
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value === 'number') return value;
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

export default function DesktopStatusPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { user, isAdmin, isLoading } = useAdmin();

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [presenceByUid, setPresenceByUid] = useState<Record<string, PresenceRow>>({});
  const [search, setSearch] = useState('');
  const [loadingRoster, setLoadingRoster] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.replace('/admin/login?redirect=/admin/desktop-status');
    }
  }, [isAdmin, isLoading, router]);

  useEffect(() => {
    if (!firestore || !isAdmin) return;
    let active = true;
    const load = async () => {
      setLoadingRoster(true);
      try {
        const [adminRolesSnap, superAdminRolesSnap, staffSnap] = await Promise.all([
          getDocs(collection(firestore, 'roles_admin')),
          getDocs(collection(firestore, 'roles_super_admin')),
          getDocs(query(collection(firestore, 'users'), where('isStaff', '==', true)))
        ]);

        const adminIds = new Set(adminRolesSnap.docs.map((d) => d.id));
        const superAdminIds = new Set(superAdminRolesSnap.docs.map((d) => d.id));
        const isStaffIds = new Set(staffSnap.docs.map((d) => d.id));
        const allIds = Array.from(new Set([...adminIds, ...superAdminIds, ...isStaffIds]));

        const chunks: string[][] = [];
        for (let i = 0; i < allIds.length; i += 10) chunks.push(allIds.slice(i, i + 10));

        const usersById: Record<string, any> = {};
        for (const chunk of chunks) {
          const snap = await getDocs(
            query(collection(firestore, 'users'), where(documentId(), 'in', chunk))
          );
          snap.forEach((d) => {
            usersById[d.id] = d.data();
          });
        }

        // Ensure current user appears even if not flagged isStaff.
        if (user?.uid && !usersById[user.uid]) {
          try {
            const u = await getDoc(doc(firestore, 'users', user.uid));
            if (u.exists()) usersById[user.uid] = u.data();
          } catch {
            // ignore
          }
        }

        const nextStaff: StaffUser[] = allIds
          .map((uid) => {
            const data = usersById[uid] || {};
            const email = String(data.email || '').trim() || uid;
            const displayName = String(data.displayName || '').trim();
            const firstName = String(data.firstName || '').trim();
            const lastName = String(data.lastName || '').trim();
            const label =
              (firstName || lastName)
                ? `${firstName} ${lastName}`.trim()
                : (displayName || email || uid);
            const role: StaffUser['role'] =
              superAdminIds.has(uid) ? 'Super Admin' : adminIds.has(uid) ? 'Admin' : 'Staff';
            return { uid, label, email, role };
          })
          .filter((s) => Boolean(s.uid))
          .sort((a, b) => a.label.localeCompare(b.label));

        if (!active) return;
        setStaff(nextStaff);
      } catch {
        if (!active) return;
        setStaff([]);
      } finally {
        if (active) setLoadingRoster(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [firestore, isAdmin, user?.uid]);

  useEffect(() => {
    if (!firestore || !isAdmin) return;
    const unsub = onSnapshot(
      collection(firestore, 'desktop_presence'),
      (snap) => {
        const next: Record<string, PresenceRow> = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          next[docSnap.id] = {
            uid: docSnap.id,
            active: Boolean(data?.active),
            pausedByUser: Boolean(data?.pausedByUser),
            effectivePaused: Boolean(data?.effectivePaused),
            snoozedUntilMs: Number(data?.snoozedUntilMs || 0) || 0,
            lastSeenAtMs: toMs(data?.lastSeenAt),
          };
        });
        setPresenceByUid(next);
      },
      () => {
        // ignore
      }
    );
    return () => unsub();
  }, [firestore, isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) =>
      s.label.toLowerCase().includes(q)
      || s.email.toLowerCase().includes(q)
      || s.role.toLowerCase().includes(q)
    );
  }, [staff, search]);

  const now = Date.now();
  const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

  if (isLoading || (!isAdmin && !isLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Staff status indicators
          </CardTitle>
          <CardDescription>
            Shows which staff have Electron active, paused, or snoozed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loadingRoster ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading staff…
            </div>
          ) : (
            <div className="rounded-md border">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-slate-50/50">
                <div className="col-span-4">Staff</div>
                <div className="col-span-4">Email</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Last seen</div>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                {filtered.map((s) => {
                  const p = presenceByUid[s.uid] || null;
                  const lastSeen = p?.lastSeenAtMs ? new Date(p.lastSeenAtMs).toLocaleString() : '—';
                  const activeNow = Boolean(p?.active) && (!p?.lastSeenAtMs || (now - p.lastSeenAtMs <= ACTIVE_WINDOW_MS));
                  const snoozedNow = Boolean(p?.snoozedUntilMs && p.snoozedUntilMs > now);
                  const pausedNow = Boolean(p?.pausedByUser);
                  const statusLabel =
                    snoozedNow ? `Snoozed until ${new Date(p!.snoozedUntilMs).toLocaleString()}`
                      : pausedNow ? 'Paused'
                        : activeNow ? 'Active'
                          : 'Offline';
                  const dotClass =
                    snoozedNow ? 'bg-amber-400'
                      : pausedNow ? 'bg-slate-400'
                        : activeNow ? 'bg-emerald-500'
                          : 'bg-slate-300';

                  return (
                    <div key={s.uid} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm border-b last:border-b-0">
                      <div className="col-span-4 font-medium truncate" title={s.label}>{s.label}</div>
                      <div className="col-span-4 truncate text-muted-foreground" title={s.email}>{s.email}</div>
                      <div className="col-span-2 flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
                        <span className="truncate" title={statusLabel}>{statusLabel}</span>
                      </div>
                      <div className="col-span-2 text-muted-foreground truncate" title={lastSeen}>{lastSeen}</div>
                    </div>
                  );
                })}
                {filtered.length === 0 ? (
                  <div className="px-3 py-6 text-sm text-muted-foreground">No staff match that search.</div>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

