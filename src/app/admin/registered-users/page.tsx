'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Search, ShieldAlert, Trash2, Ban, CheckCircle2, Eye, History, MoreVertical } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

type AccountKind = 'staff' | 'social_worker' | 'user' | 'unknown';

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
  const [actionMode, setActionMode] = useState<'disable' | 'enable' | 'delete'>('disable');

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

  const runAction = async (u: ListedUser, mode: 'disable' | 'enable' | 'delete') => {
    if (!auth?.currentUser) return;
    const needsReason = mode === 'disable' || mode === 'delete';
    let reason = '';
    if (needsReason) {
      if (typeof window === 'undefined') return;
      const v = window.prompt(`Reason required to ${mode === 'delete' ? 'delete' : 'freeze'} this user:`, '');
      if (v == null) return; // cancelled
      reason = String(v).trim();
      if (!reason) return;
    }
    const ok =
      typeof window !== 'undefined'
        ? window.confirm(
            `${mode === 'delete' ? 'DELETE' : mode === 'disable' ? 'DISABLE' : 'ENABLE'} user?\n\nEmail: ${u.email || '—'}\nUID: ${
              u.uid
            }\n\nReason: ${reason || '(none)'}\n\nThis is a privileged action.`
          )
        : false;
    if (!ok) return;

    setActionLoadingUid(u.uid);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid: u.uid, mode, reason }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed (HTTP ${res.status})`);
      await loadUsers();
      if (detail?.user?.uid === u.uid) {
        setDetail((prev) => (prev ? { ...prev, user: { ...prev.user, disabled: mode === 'disable' ? true : mode === 'enable' ? false : prev.user.disabled } } : prev));
      }
      toast({
        title:
          mode === 'delete'
            ? 'User deleted'
            : mode === 'disable'
              ? 'User frozen'
              : 'User unfrozen',
        description: u.email ? String(u.email) : u.uid,
      });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-7 w-7" />
            Registered Users
          </h1>
          <p className="text-muted-foreground mt-1">Super Admin tools to audit and manage user accounts.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search email, name, or UID…"
              className="w-full sm:w-[320px]"
            />
          </div>
          <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent className="max-h-[60vh] overflow-auto z-[60]">
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="staff">Staff/Admin ({kindCounts.staff})</SelectItem>
              <SelectItem value="social_worker">Social Workers ({kindCounts.social_worker})</SelectItem>
              <SelectItem value="user">Application Users ({kindCounts.user})</SelectItem>
              <SelectItem value="unknown">Unknown ({kindCounts.unknown})</SelectItem>
            </SelectContent>
          </Select>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => void loadUsers({ reset: true })} disabled={loadingList}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {loadingList ? 'Refreshing…' : 'Refresh'}
          </Button>
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
            Showing {filtered.length} of {users.length} loaded • Staff/Admin {kindCounts.staff} • SW {kindCounts.social_worker} • Users {kindCounts.user}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Mobile: compact card list */}
          <div className="space-y-2 sm:hidden">
            {filtered.map((u) => (
              <div key={u.uid} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] break-all text-muted-foreground">{u.email || '—'}</div>
                    <div className="text-sm font-semibold truncate">{u.displayName || '—'}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {kindBadge(u.kind)}
                      {u.disabled ? <Badge variant="secondary">Frozen</Badge> : <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>}
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                      <div>Created: {fmt(u.createdAt)}</div>
                      <div>Last sign-in: {fmt(u.lastSignInAt)}</div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          void openDetails(u);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          void openDetails(u);
                        }}
                      >
                        <History className="h-4 w-4 mr-2" />
                        Login history
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {u.disabled ? (
                        <DropdownMenuItem
                          disabled={actionLoadingUid === u.uid}
                          onSelect={(e) => {
                            e.preventDefault();
                            void runAction(u, 'enable');
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Unfreeze
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          disabled={actionLoadingUid === u.uid}
                          onSelect={(e) => {
                            e.preventDefault();
                            void runAction(u, 'disable');
                          }}
                        >
                          <Ban className="h-4 w-4 mr-2" />
                          Freeze
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        disabled={actionLoadingUid === u.uid}
                        onSelect={(e) => {
                          e.preventDefault();
                          void runAction(u, 'delete');
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
            {filtered.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">No users match your search.</div> : null}
          </div>

          {/* Desktop/tablet: table view */}
          <div className="hidden sm:block overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Email</TableHead>
                  <TableHead className="min-w-[180px]">Name</TableHead>
                  <TableHead className="min-w-[140px]">Type</TableHead>
                  <TableHead className="min-w-[110px]">Status</TableHead>
                  <TableHead className="min-w-[180px]">Created</TableHead>
                  <TableHead className="min-w-[180px]">Last sign-in</TableHead>
                  <TableHead className="min-w-[200px] text-right sticky right-0 bg-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.uid}>
                    <TableCell className="font-mono text-xs break-all py-2">{u.email || '—'}</TableCell>
                    <TableCell className="break-words py-2">{u.displayName || '—'}</TableCell>
                    <TableCell>{kindBadge(u.kind)}</TableCell>
                    <TableCell>
                      {u.disabled ? <Badge variant="secondary">Disabled</Badge> : <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground py-2">{fmt(u.createdAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground py-2">{fmt(u.lastSignInAt)}</TableCell>
                    <TableCell className="text-right sticky right-0 bg-white py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline">
                              <MoreVertical className="h-4 w-4 mr-2" />
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                void openDetails(u);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                void openDetails(u);
                              }}
                            >
                              <History className="h-4 w-4 mr-2" />
                              Login history
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {u.disabled ? (
                              <DropdownMenuItem
                                disabled={actionLoadingUid === u.uid}
                                onSelect={(e) => {
                                  e.preventDefault();
                                  void runAction(u, 'enable');
                                }}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Unfreeze
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                disabled={actionLoadingUid === u.uid}
                                onSelect={(e) => {
                                  e.preventDefault();
                                  void runAction(u, 'disable');
                                }}
                              >
                                <Ban className="h-4 w-4 mr-2" />
                                Freeze
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              disabled={actionLoadingUid === u.uid}
                              onSelect={(e) => {
                                e.preventDefault();
                                void runAction(u, 'delete');
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                      No users match your search.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground font-mono">pageToken: {pageToken || '—'}</div>
            <div className="flex gap-2 justify-end">
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
    </div>
  );
}

