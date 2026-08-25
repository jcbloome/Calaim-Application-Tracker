'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Search, ShieldAlert, Trash2, Ban, CheckCircle2, Eye, Mail, Users } from 'lucide-react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type AccountKind = 'staff' | 'social_worker' | 'user' | 'unknown';

type SortKey = 'email' | 'name' | 'type' | 'status' | 'createdAt' | 'lastSignInAt';
type SortDir = 'asc' | 'desc';

type ListedUser = {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  providerIds: string[];
  kind?: AccountKind;
};

type UserDetailsResult = {
  user: ListedUser;
  loginLogs: Array<{ id: string; email: string; role: string; displayName: string; timestamp: string | null }>;
  uploads: Array<{ id: string; status: string; docType: string; fileName: string; storagePath: string; createdAt: string | null }>;
};

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
};

const normalizeName = (value: string) => String(value || '').trim().replace(/\s+/g, ' ');

const getNameSortValue = (displayName: string) => {
  const normalized = normalizeName(displayName);
  if (!normalized) return '';
  const parts = normalized.split(' ');
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const firstNames = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  return `${lastName}, ${firstNames}`.trim().toLowerCase();
};

const toTimestamp = (iso: string | null): number | null => {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) ? ts : null;
};

const MANAGEMENT_PAGE_LINKS = [
  { href: '/admin/user-staff-management', label: 'User & Staff Hub' },
  { href: '/admin/staff-management', label: 'Staff Management' },
  { href: '/admin/sw-user-management', label: 'Social Worker Management' },
  { href: '/admin/registered-users', label: 'Registered Users' },
] as const;

export default function RegisteredUsersPage() {
  const { isSuperAdmin, isLoading } = useAdmin();
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | AccountKind>('all');
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [pageToken, setPageToken] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetailsResult | null>(null);

  const [actionLoadingUid, setActionLoadingUid] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ user: ListedUser; mode: 'disable' | 'enable' | 'delete' } | null>(
    null
  );
  const [actionReason, setActionReason] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) router.replace('/admin');
  }, [isLoading, isSuperAdmin, router]);

  const loadUsers = async (opts?: { reset?: boolean }) => {
    if (!auth?.currentUser) return;
    setLoadingList(true);
    setError(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const useToken = opts?.reset ? null : pageToken;
      const qs = new URLSearchParams();
      qs.set('pageSize', '75');
      if (useToken) qs.set('pageToken', useToken);
      const res = await fetch(`/api/admin/users/list?${qs.toString()}`, { headers: { authorization: `Bearer ${idToken}` } });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed (HTTP ${res.status})`);
      setUsers(Array.isArray(data?.users) ? data.users : []);
      setNextPageToken(data?.nextPageToken ? String(data.nextPageToken) : null);
      if (opts?.reset) setPageToken(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load users.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (!isSuperAdmin) return;
    if (!auth?.currentUser) return;
    void loadUsers({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isSuperAdmin, auth?.currentUser]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (kindFilter !== 'all') {
        const k = (u.kind || 'unknown') as AccountKind;
        if (k !== kindFilter) return false;
      }
      if (!q) return true;
      return (
        String(u.email || '').toLowerCase().includes(q) ||
        String(u.displayName || '').toLowerCase().includes(q) ||
        String(u.uid || '').toLowerCase().includes(q)
      );
    });
  }, [users, query, kindFilter]);

  const sortedUsers = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const typeLabel = (k?: AccountKind) => {
      const kind = (k || 'unknown') as AccountKind;
      if (kind === 'staff') return 'Staff/Admin';
      if (kind === 'social_worker') return 'Social Worker';
      if (kind === 'user') return 'Application User';
      return 'Unknown';
    };
    const statusLabel = (u: ListedUser) => (u.disabled ? 'Frozen' : 'Active');

    const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

    const arr = [...filtered];
    const cmpDate = (aIso: string | null, bIso: string | null) => {
      const aTs = toTimestamp(aIso);
      const bTs = toTimestamp(bIso);
      if (aTs == null && bTs == null) return 0;
      if (aTs == null) return 1;
      if (bTs == null) return -1;
      return dir * (aTs - bTs);
    };

    arr.sort((a, b) => {
      if (sortKey === 'name') return dir * cmp(getNameSortValue(a.displayName), getNameSortValue(b.displayName));
      if (sortKey === 'type') return dir * cmp(typeLabel(a.kind), typeLabel(b.kind));
      if (sortKey === 'status') return dir * cmp(statusLabel(a), statusLabel(b));
      if (sortKey === 'createdAt') return cmpDate(a.createdAt, b.createdAt);
      if (sortKey === 'lastSignInAt') return cmpDate(a.lastSignInAt, b.lastSignInAt);
      return dir * cmp(String(a.email || ''), String(b.email || ''));
    });
    return arr;
  }, [filtered, sortDir, sortKey]);

  const kindCounts = useMemo(() => {
    const counts: Record<AccountKind, number> = { staff: 0, social_worker: 0, user: 0, unknown: 0 };
    users.forEach((u) => {
      const k = (u.kind || 'unknown') as AccountKind;
      counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
  }, [users]);

  const kindBadge = (kind: AccountKind | undefined) => {
    const k = (kind || 'unknown') as AccountKind;
    if (k === 'staff') return <Badge className="bg-blue-600 hover:bg-blue-600 text-white">Staff/Admin</Badge>;
    if (k === 'social_worker') return <Badge className="bg-purple-600 hover:bg-purple-600 text-white">Social Worker</Badge>;
    if (k === 'user') return <Badge className="bg-slate-600 hover:bg-slate-600 text-white">User</Badge>;
    return <Badge variant="secondary">Unknown</Badge>;
  };

  const openDetails = async (u: ListedUser) => {
    if (!auth?.currentUser) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/users/details?uid=${encodeURIComponent(u.uid)}`, {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed (HTTP ${res.status})`);
      setDetail({
        user: data.user,
        loginLogs: Array.isArray(data.loginLogs) ? data.loginLogs : [],
        uploads: Array.isArray(data.uploads) ? data.uploads : [],
      });
    } catch (e: any) {
      setDetailError(e?.message || 'Failed to load user details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const requestAction = (u: ListedUser, mode: 'disable' | 'enable' | 'delete') => {
    // Open after any dropdown/menu fully closes so the confirm overlay is not blocked.
    window.setTimeout(() => {
      setPendingAction({ user: u, mode });
      setActionReason(mode === 'enable' ? '' : 'Admin cleanup');
    }, 50);
  };

  const closePendingAction = () => {
    if (actionLoadingUid) return;
    setPendingAction(null);
    setActionReason('');
  };

  const confirmPendingAction = async () => {
    if (!auth?.currentUser || !pendingAction) return;
    const { user: u, mode } = pendingAction;
    const needsReason = mode === 'disable' || mode === 'delete';
    const reason = String(actionReason || '').trim();
    if (needsReason && !reason) {
      toast({
        title: 'Reason required',
        description: `Enter a reason to ${mode === 'delete' ? 'delete' : 'freeze'} this account.`,
        variant: 'destructive',
      });
      return;
    }

    setActionLoadingUid(u.uid);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const res = await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid: u.uid, mode, reason }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed (HTTP ${res.status})`);

      if (mode === 'delete') {
        setUsers((prev) => prev.filter((row) => row.uid !== u.uid));
        if (detail?.user?.uid === u.uid) {
          setDetailOpen(false);
          setDetail(null);
        }
      } else {
        const nextDisabled = mode === 'disable';
        setUsers((prev) => prev.map((row) => (row.uid === u.uid ? { ...row, disabled: nextDisabled } : row)));
        if (detail?.user?.uid === u.uid) {
          setDetail((prev) => (prev ? { ...prev, user: { ...prev.user, disabled: nextDisabled } } : prev));
        }
      }

      toast({
        title: mode === 'delete' ? 'User deleted' : mode === 'disable' ? 'User frozen' : 'User unfrozen',
        description: u.email ? String(u.email) : u.uid,
      });
      setPendingAction(null);
      setActionReason('');
    } catch (e: any) {
      toast({
        title: 'Action failed',
        description: e?.message || 'Action failed.',
        variant: 'destructive',
      });
    } finally {
      setActionLoadingUid(null);
    }
  };

  const runAction = (u: ListedUser, mode: 'disable' | 'enable' | 'delete') => {
    requestAction(u, mode);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 overflow-x-hidden px-1 sm:px-0">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 sm:text-3xl">
            <ShieldAlert className="h-7 w-7 shrink-0" />
            Registered Users
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Super Admin tools to audit and manage user accounts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[200px] flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search email, name, or UID…"
              className="w-full"
            />
          </div>
          <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as any)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent className="max-h-[60vh] overflow-auto z-[60]">
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="staff">Staff/Admin ({kindCounts.staff})</SelectItem>
              <SelectItem value="social_worker">Social Workers ({kindCounts.social_worker})</SelectItem>
              <SelectItem value="user">Application Users ({kindCounts.user})</SelectItem>
              {kindCounts.unknown > 0 ? <SelectItem value="unknown">Unknown ({kindCounts.unknown})</SelectItem> : null}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void loadUsers({ reset: true })} disabled={loadingList}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {loadingList ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/system-configuration/welcoming-user-screen">
              <Mail className="h-4 w-4 mr-2" />
              Welcoming User Screen
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/caspio-users-registration">
              <Users className="h-4 w-4 mr-2" />
              Caspio User Registration
            </Link>
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">User & staff management links</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {MANAGEMENT_PAGE_LINKS.map((item, index) => (
            <span key={item.href} className="inline-flex items-center gap-3">
              <Link
                href={item.href}
                className={
                  item.href === '/admin/registered-users'
                    ? 'font-semibold text-foreground'
                    : 'text-primary hover:underline'
                }
              >
                {item.label}
              </Link>
              {index < MANAGEMENT_PAGE_LINKS.length - 1 ? (
                <span className="text-muted-foreground">|</span>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Could not load users</CardTitle>
            <CardDescription className="text-destructive">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Users</CardTitle>
          <CardDescription>
            Showing {sortedUsers.length} of {users.length} loaded • Staff/Admin {kindCounts.staff} • SW {kindCounts.social_worker} • Users {kindCounts.user}
            {kindCounts.unknown > 0 ? ` • Unknown ${kindCounts.unknown}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 overflow-x-hidden">
          <Select
            value={`${sortKey}:${sortDir}`}
            onValueChange={(v) => {
              const [k, d] = String(v).split(':');
              setSortKey((k as SortKey) || 'createdAt');
              setSortDir((d as any) || 'asc');
            }}
          >
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent className="max-h-[60vh] overflow-auto z-[60]">
              <SelectItem value="createdAt:desc">Created (Newest→Oldest)</SelectItem>
              <SelectItem value="createdAt:asc">Created (Oldest→Newest)</SelectItem>
              <SelectItem value="lastSignInAt:desc">Last Login (Newest→Oldest)</SelectItem>
              <SelectItem value="lastSignInAt:asc">Last Login (Oldest→Newest)</SelectItem>
              <SelectItem value="name:asc">Last Name (A→Z)</SelectItem>
              <SelectItem value="name:desc">Last Name (Z→A)</SelectItem>
              <SelectItem value="email:asc">Email (A→Z)</SelectItem>
              <SelectItem value="email:desc">Email (Z→A)</SelectItem>
              <SelectItem value="type:asc">Type (A→Z)</SelectItem>
              <SelectItem value="type:desc">Type (Z→A)</SelectItem>
              <SelectItem value="status:asc">Status (A→Z)</SelectItem>
              <SelectItem value="status:desc">Status (Z→A)</SelectItem>
            </SelectContent>
          </Select>

          <div className="space-y-2">
            {sortedUsers.map((u) => (
              <div key={u.uid} className="rounded-md border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px] break-all text-muted-foreground">{u.email || '—'}</div>
                    <div className="text-sm font-semibold break-words">{u.displayName || '—'}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {kindBadge(u.kind)}
                      {u.disabled ? (
                        <Badge variant="secondary">Frozen</Badge>
                      ) : (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
                      )}
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                      <div>Created: {fmt(u.createdAt)}</div>
                      <div>Last sign-in: {fmt(u.lastSignInAt)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button type="button" size="sm" variant="outline" onClick={() => void openDetails(u)}>
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={actionLoadingUid === u.uid}
                      onClick={() => runAction(u, u.disabled ? 'enable' : 'disable')}
                    >
                      {u.disabled ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Unfreeze
                        </>
                      ) : (
                        <>
                          <Ban className="h-4 w-4 mr-1" />
                          Freeze
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={actionLoadingUid === u.uid}
                      onClick={() => runAction(u, 'delete')}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {sortedUsers.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No users match your search.</div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground font-mono">pageToken: {pageToken || '—'}</div>
            <Button
              variant="outline"
              size="sm"
              disabled={!nextPageToken || loadingList}
              onClick={() => {
                setPageToken(nextPageToken);
                void loadUsers();
              }}
            >
              Next page
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>User details</DialogTitle>
            <DialogDescription>Last login events and uploads for this user.</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : detailError ? (
            <div className="text-sm text-destructive">{detailError}</div>
          ) : detail ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div className="break-all">
                      <span className="text-muted-foreground">UID:</span> <span className="font-mono">{detail.user.uid}</span>
                    </div>
                    <div className="break-all">
                      <span className="text-muted-foreground">Email:</span> <span className="font-mono">{detail.user.email || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Name:</span> {detail.user.displayName || '—'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Created:</span> {fmt(detail.user.createdAt)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last sign-in:</span> {fmt(detail.user.lastSignInAt)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Providers: {detail.user.providerIds?.length ? detail.user.providerIds.join(', ') : '—'}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Admin action</CardTitle>
                    <CardDescription>Freeze/delete will prompt for a reason</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionLoadingUid === detail.user.uid}
                        onClick={() => void runAction(detail.user, detail.user.disabled ? 'enable' : 'disable')}
                      >
                        {detail.user.disabled ? 'Unfreeze' : 'Freeze'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionLoadingUid === detail.user.uid}
                        onClick={() => void runAction(detail.user, 'delete')}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Login activity (latest 20)</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="space-y-2">
                    {detail.loginLogs.length === 0 ? (
                      <div className="text-muted-foreground">No login logs found.</div>
                    ) : (
                      detail.loginLogs.slice(0, 20).map((l) => (
                        <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                          <div className="min-w-0">
                            <div className="font-mono text-xs break-all">{l.email || '—'}</div>
                            <div className="text-xs text-muted-foreground">{l.role || '—'}</div>
                          </div>
                          <div className="text-xs text-muted-foreground">{fmt(l.timestamp)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Uploads (standalone intake)</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="space-y-2">
                    {detail.uploads.length === 0 ? (
                      <div className="text-muted-foreground">No uploads found.</div>
                    ) : (
                      detail.uploads.slice(0, 10).map((u) => (
                        <div key={u.id} className="rounded border p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-mono text-xs break-all">{u.fileName || u.id}</div>
                            <Badge variant="secondary">{u.status || 'unknown'}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {u.docType ? `${u.docType} • ` : ''}{fmt(u.createdAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No details loaded.</div>
          )}
        </DialogContent>
      </Dialog>

      {pendingAction ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-lg border bg-background p-6 shadow-2xl"
          >
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">
                {pendingAction.mode === 'delete'
                  ? 'Delete user'
                  : pendingAction.mode === 'disable'
                    ? 'Freeze user'
                    : 'Unfreeze user'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {pendingAction.mode === 'delete'
                  ? 'This permanently removes the Firebase Auth account and related staff/SW role markers.'
                  : pendingAction.mode === 'disable'
                    ? 'Frozen accounts cannot sign in until unfrozen.'
                    : 'This will allow the account to sign in again.'}
              </p>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Email</div>
                <div className="font-mono break-all">{pendingAction.user.email || '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Name</div>
                <div>{pendingAction.user.displayName || '—'}</div>
              </div>
              {(pendingAction.mode === 'delete' || pendingAction.mode === 'disable') && (
                <div className="space-y-2">
                  <Label htmlFor="registered-user-action-reason">Reason</Label>
                  <Input
                    id="registered-user-action-reason"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Why are you taking this action?"
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={closePendingAction} disabled={Boolean(actionLoadingUid)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={pendingAction.mode === 'delete' ? 'destructive' : 'default'}
                disabled={Boolean(actionLoadingUid)}
                onClick={() => void confirmPendingAction()}
              >
                {actionLoadingUid ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Working…
                  </>
                ) : pendingAction.mode === 'delete' ? (
                  'Delete user'
                ) : pendingAction.mode === 'disable' ? (
                  'Freeze user'
                ) : (
                  'Unfreeze user'
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}