'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, onSnapshot, query, where, documentId } from 'firebase/firestore';
import { AlertTriangle, Loader2, Power, Search, Send, Wifi, WifiOff } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore, useAuth } from '@/firebase';
import { useDesktopPresenceMap } from '@/hooks/use-desktop-presence';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

type StaffUser = {
  uid: string;
  label: string;
  email: string;
  role: 'Super Admin' | 'Admin' | 'Staff';
};

type ApplyScope = 'selected' | 'all';

export default function ElectronControlsPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const auth = useAuth();
  const { user, isAdmin, isSuperAdmin, isLoading } = useAdmin();

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusError, setStatusError] = useState('');
  const [remoteAllowAfterHoursByUid, setRemoteAllowAfterHoursByUid] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.replace('/admin/login?redirect=/admin/electron-controls');
    }
  }, [isLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (!firestore || !isSuperAdmin) return;
    let active = true;
    const load = async () => {
      setLoadingRoster(true);
      try {
        const [adminRolesSnap, superAdminRolesSnap, staffSnap] = await Promise.all([
          getDocs(collection(firestore, 'roles_admin')),
          getDocs(collection(firestore, 'roles_super_admin')),
          getDocs(query(collection(firestore, 'users'), where('isStaff', '==', true))),
        ]);

        const adminIds = new Set(adminRolesSnap.docs.map((d) => d.id));
        const superAdminIds = new Set(superAdminRolesSnap.docs.map((d) => d.id));
        const staffIds = new Set(staffSnap.docs.map((d) => d.id));
        const allIds = Array.from(new Set([...adminIds, ...superAdminIds, ...staffIds])).filter((id) => !String(id).includes('@'));

        const chunks: string[][] = [];
        for (let i = 0; i < allIds.length; i += 10) chunks.push(allIds.slice(i, i + 10));

        const usersById: Record<string, any> = {};
        for (const chunk of chunks) {
          const snap = await getDocs(query(collection(firestore, 'users'), where(documentId(), 'in', chunk)));
          snap.forEach((d) => {
            usersById[d.id] = d.data();
          });
        }

        const nextStaff: StaffUser[] = allIds
          .map((uid) => {
            const data = usersById[uid] || {};
            const email = String(data.email || '').trim() || uid;
            const displayName = String(data.displayName || '').trim();
            const firstName = String(data.firstName || '').trim();
            const lastName = String(data.lastName || '').trim();
            const label = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : (displayName || email || uid);
            const role: StaffUser['role'] = superAdminIds.has(uid) ? 'Super Admin' : adminIds.has(uid) ? 'Admin' : 'Staff';
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

    void load();
    return () => {
      active = false;
    };
  }, [firestore, isSuperAdmin]);

  const staffUids = useMemo(() => staff.map((s) => s.uid), [staff]);
  const { isActiveByUid, presenceByUid } = useDesktopPresenceMap(staffUids);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => (
      s.label.toLowerCase().includes(q)
      || s.email.toLowerCase().includes(q)
      || s.role.toLowerCase().includes(q)
    ));
  }, [search, staff]);

  const activeCount = useMemo(
    () => filteredStaff.filter((s) => Boolean(isActiveByUid[s.uid])).length,
    [filteredStaff, isActiveByUid]
  );

  useEffect(() => {
    if (!firestore || !isSuperAdmin) return;
    if (staffUids.length === 0) {
      setRemoteAllowAfterHoursByUid({});
      return;
    }
    const chunks: string[][] = [];
    for (let i = 0; i < staffUids.length; i += 10) chunks.push(staffUids.slice(i, i + 10));
    const unsubs = chunks.map((chunk) => {
      const qy = query(collection(firestore, 'desktop_control_commands'), where(documentId(), 'in', chunk));
      return onSnapshot(
        qy,
        (snap) => {
          const next: Record<string, boolean> = {};
          chunk.forEach((uid) => {
            next[uid] = false;
          });
          snap.forEach((d) => {
            const data = d.data() as any;
            next[d.id] = Boolean(data?.allowAfterHours);
          });
          setRemoteAllowAfterHoursByUid((prev) => ({ ...prev, ...next }));
        },
        () => {
          // ignore
        }
      );
    });
    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
    };
  }, [firestore, isSuperAdmin, staffUids]);

  const setUidChecked = useCallback((uid: string, checked: boolean) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (checked) next.add(uid);
      else next.delete(uid);
      return next;
    });
  }, []);

  const setVisibleChecked = useCallback((checked: boolean) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      filteredStaff.forEach((s) => {
        if (checked) next.add(s.uid);
        else next.delete(s.uid);
      });
      return next;
    });
  }, [filteredStaff]);

  const applyRemoteSetting = useCallback(async (allowAfterHours: boolean, scope: ApplyScope) => {
    if (!user?.uid || !auth?.currentUser) return;
    const targets = scope === 'all' ? [] : Array.from(selectedUids);
    if (scope === 'selected' && targets.length === 0) {
      setStatusError('Select at least one staff member.');
      return;
    }

    setUpdating(true);
    setStatusError('');
    setStatusMessage('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/electron-controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          allowAfterHours,
          applyAll: scope === 'all',
          targetUids: targets,
          resumeNotifications: true,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      const count = Number(data?.targets || 0) || 0;
      setStatusMessage(`${allowAfterHours ? 'Activated' : 'Deactivated'} Electron after-hours for ${count} staff.`);
    } catch (error: any) {
      setStatusError(error?.message || 'Failed to apply Electron settings.');
    } finally {
      setUpdating(false);
    }
  }, [auth, selectedUids, user?.uid]);

  const sendTestPopup = useCallback(async () => {
    if (!auth?.currentUser) return;
    const targets = Array.from(selectedUids);
    if (targets.length === 0) {
      setStatusError('Select at least one staff member to send a test popup.');
      return;
    }
    setSendingTest(true);
    setStatusError('');
    setStatusMessage('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/electron-test-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          targetUids: targets,
          message: 'Test Electron popup from Super Admin controls.',
          priority: 'Priority',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setStatusMessage(`Sent test popup to ${Number(data?.targets || 0)} staff.`);
    } catch (error: any) {
      setStatusError(error?.message || 'Failed to send test popup.');
    } finally {
      setSendingTest(false);
    }
  }, [auth, selectedUids]);

  const getPausedReason = useCallback((uid: string) => {
    const p = presenceByUid[uid];
    if (!p) return 'Unknown';
    if (!p.effectivePaused) return 'Not paused';
    if (p.pausedByUser) return 'Paused by user';
    if (p.snoozedUntilMs > Date.now()) return `Snoozed until ${new Date(p.snoozedUntilMs).toLocaleString()}`;
    if (!p.allowAfterHours) return 'After-hours silent';
    return 'Paused';
  }, [presenceByUid]);

  if (isLoading || (!isAdmin && !isLoading) || (!isSuperAdmin && !isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-4 p-6">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <Power className="h-5 w-5" />
            Electron Staff Activation
          </CardTitle>
          <CardDescription>
            Activate or deactivate Electron after-hours messaging for all staff or selected staff.
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push('/admin/my-notes')}>
              Open My Notifications
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Remote activation applies on each staff member&apos;s next Electron heartbeat. Staff must have the desktop app open.
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search staff..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Badge variant="outline">Showing {filteredStaff.length}</Badge>
            <Badge variant="outline">Electron active {activeCount}/{filteredStaff.length || 0}</Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={updating} onClick={() => setVisibleChecked(true)}>
              Select visible
            </Button>
            <Button variant="secondary" disabled={updating} onClick={() => setVisibleChecked(false)}>
              Clear visible
            </Button>
            <Button disabled={updating} onClick={() => void applyRemoteSetting(true, 'selected')}>
              Activate selected
            </Button>
            <Button variant="outline" disabled={updating} onClick={() => void applyRemoteSetting(false, 'selected')}>
              Deactivate selected
            </Button>
            <Button disabled={updating} onClick={() => void applyRemoteSetting(true, 'all')}>
              Activate all
            </Button>
            <Button variant="outline" disabled={updating} onClick={() => void applyRemoteSetting(false, 'all')}>
              Deactivate all
            </Button>
            <Button variant="secondary" disabled={sendingTest} onClick={() => void sendTestPopup()}>
              {sendingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send test popup (selected)
            </Button>
          </div>

          {statusMessage ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{statusMessage}</div>
          ) : null}
          {statusError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{statusError}</div>
          ) : null}

          {loadingRoster ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading staff...
            </div>
          ) : (
            <div className="rounded-md border">
              <div className="grid grid-cols-12 gap-2 border-b bg-slate-50/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-1">Pick</div>
                <div className="col-span-3">Staff</div>
                <div className="col-span-3">Email</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-1">Remote</div>
                <div className="col-span-1">Live</div>
                <div className="col-span-1">Paused</div>
              </div>
              <div className="max-h-[62vh] overflow-auto">
                {filteredStaff.map((s) => {
                  const checked = selectedUids.has(s.uid);
                  const active = Boolean(isActiveByUid[s.uid]);
                  const remoteAfterHours = Boolean(remoteAllowAfterHoursByUid[s.uid]);
                  const presence = presenceByUid[s.uid];
                  const lastSeen = presence?.lastSeenAtMs ? new Date(presence.lastSeenAtMs).toLocaleTimeString() : '—';
                  return (
                    <div key={s.uid} className="grid grid-cols-12 gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                      <div className="col-span-1 flex items-center">
                        <Checkbox checked={checked} onCheckedChange={(v) => setUidChecked(s.uid, Boolean(v))} />
                      </div>
                      <div className="col-span-3 truncate font-medium" title={s.label}>{s.label}</div>
                      <div className="col-span-3 truncate text-muted-foreground" title={s.email}>{s.email}</div>
                      <div className="col-span-2 truncate text-muted-foreground">{s.role}</div>
                      <div className="col-span-1 flex items-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${remoteAfterHours ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {remoteAfterHours ? 'ON' : 'OFF'}
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center">
                        {active ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-slate-400" />}
                      </div>
                      <div className="col-span-1 truncate text-xs text-muted-foreground" title={`${getPausedReason(s.uid)} • Last seen ${lastSeen}`}>
                        {presence?.effectivePaused ? 'Yes' : 'No'}
                      </div>
                      <div className="col-span-12 mt-1 rounded bg-slate-50 px-2 py-1 text-[11px] text-muted-foreground">
                        Last seen: {lastSeen} • Route: {presence?.currentPath || '—'} • {getPausedReason(s.uid)}
                      </div>
                    </div>
                  );
                })}
                {filteredStaff.length === 0 ? (
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

