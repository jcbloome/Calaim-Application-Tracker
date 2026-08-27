'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { useUser } from '@/firebase';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  Activity,
  AlertTriangle,
  User,
  Clock,
  RefreshCw,
  Calendar,
  Wifi,
  WifiOff,
  Search,
  Users,
  Briefcase,
  HeartHandshake,
  CheckCircle2,
  XCircle,
  Timer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { cn } from '@/lib/utils';

type RoleFilter = 'all' | 'staff' | 'socialWorker' | 'user';

interface LoginLog {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userRole?: string;
  action?: string;
  timestamp?: any;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  failureReason?: string;
  location?: string;
  portal?: string;
  email?: string;
  displayName?: string;
  role?: string;
  type?: string;
  event?: string;
  [key: string]: any;
}

interface ActiveSession {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  loginTime?: any;
  lastActivity?: any;
  signedOutAt?: any;
  isOnline?: boolean;
  email?: string;
  displayName?: string;
  [key: string]: any;
}

function toDateSafe(timestamp: any): Date | null {
  if (!timestamp) return null;
  try {
    if (typeof timestamp?.toDate === 'function') {
      const d = timestamp.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    const d = new Date(timestamp);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function formatTimestamp(timestamp: any) {
  const date = toDateSafe(timestamp);
  if (!date) return 'Unknown';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDurationMs(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function LoginActivityTracker() {
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const { currentUser } = useUser();
  const [authUser, setAuthUser] = useState<any>(null);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<RoleFilter>('all');
  const [filterUserQuery, setFilterUserQuery] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSuccess, setFilterSuccess] = useState<'all' | 'success' | 'failed'>('all');
  const [socialWorkerEmails, setSocialWorkerEmails] = useState<Set<string>>(new Set());
  const [rnEmails, setRnEmails] = useState<Set<string>>(new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (user) => setAuthUser(user));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const ensureCurrentUserSession = useCallback(async () => {
    const user = currentUser || authUser;
    if (!user) return;
    try {
      const db = getFirestore();
      await setDoc(
        doc(db, 'activeSessions', user.uid),
        {
          userId: user.uid,
          userEmail: user.email,
          userName: user.displayName || user.email?.split('@')[0] || 'Unknown',
          displayName: user.displayName || user.email?.split('@')[0] || 'Unknown',
          email: user.email,
          loginTime: serverTimestamp(),
          lastActivity: serverTimestamp(),
          isOnline: true,
          isActive: true,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          userAgent: typeof window !== 'undefined' ? navigator.userAgent.substring(0, 100) : 'Server',
        },
        { merge: true }
      );
    } catch (err: any) {
      console.warn('Failed to create session:', String(err?.message || err));
    }
  }, [currentUser, authUser]);

  const loadLoginLogs = useCallback(async () => {
    try {
      const db = getFirestore();
      const logsCollection = collection(db, 'loginLogs');
      let logsQuery = query(logsCollection, orderBy('timestamp', 'desc'), limit(500));
      if (filterAction !== 'all') {
        logsQuery = query(
          logsCollection,
          where('action', '==', filterAction),
          orderBy('timestamp', 'desc'),
          limit(500)
        );
      }
      const snap = await getDocs(logsQuery);
      setLoginLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as LoginLog[]);
    } catch (err: any) {
      const msg = `Failed to load login logs: ${String(err?.message || err)}`;
      setError(msg);
      console.warn(msg);
    }
  }, [filterAction]);

  const loadActiveSessions = useCallback(async () => {
    try {
      const db = getFirestore();
      const snap = await getDocs(query(collection(db, 'activeSessions'), orderBy('lastActivity', 'desc'), limit(40)));
      setActiveSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ActiveSession[]);
    } catch (err: any) {
      const msg = `Failed to load active sessions: ${String(err?.message || err)}`;
      setError(msg);
      console.warn(msg);
    }
  }, []);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await ensureCurrentUserSession();
      await Promise.all([loadLoginLogs(), loadActiveSessions()]);
    } catch (err: any) {
      console.warn('Login activity refresh failed:', String(err?.message || err));
      setError(String(err?.message || 'Failed to refresh login activity.'));
    } finally {
      setIsLoading(false);
    }
  }, [ensureCurrentUserSession, loadLoginLogs, loadActiveSessions]);

  useEffect(() => {
    if (isSuperAdmin) void refreshData();
  }, [isSuperAdmin, refreshData]);

  useEffect(() => {
    const loadUserTypeEmails = async () => {
      try {
        const db = getFirestore();
        const swSnap = await getDocs(collection(db, 'socialWorkers'));
        const emails = new Set<string>();
        swSnap.docs.forEach((d) => {
          const email = String(d.data()?.email || '').trim().toLowerCase();
          if (email) emails.add(email);
        });
        setSocialWorkerEmails(emails);
        setRnEmails(new Set());
      } catch (err) {
        console.warn('Failed to load user type emails:', err);
      }
    };
    if (isSuperAdmin) void loadUserTypeEmails();
  }, [isSuperAdmin]);

  const getUserType = (email?: string, portal?: string): 'staff' | 'socialWorker' | 'rn' | 'user' => {
    const portalKey = String(portal || '').trim().toLowerCase();
    if (portalKey === 'admin') return 'staff';
    if (portalKey === 'sw') return 'socialWorker';
    if (portalKey === 'user') return 'user';
    if (!email) return 'user';
    const emailLower = email.toLowerCase();
    if (isHardcodedAdminEmail(emailLower)) return 'staff';
    if (socialWorkerEmails.has(emailLower)) return 'socialWorker';
    if (rnEmails.has(emailLower)) return 'rn';
    return 'user';
  };

  const normalizeRole = (log: LoginLog): 'staff' | 'socialWorker' | 'rn' | 'user' => {
    const explicit = String(log.userRole || log.role || '').trim().toLowerCase();
    if (explicit.includes('super') || explicit.includes('admin') || explicit.includes('staff')) return 'staff';
    if (explicit.includes('social')) return 'socialWorker';
    if (explicit === 'rn' || explicit.includes('nurse')) return 'rn';
    if (explicit.includes('user')) return 'user';
    return getUserType(log.userEmail || log.email || '', log.portal);
  };

  const getUserTypeBadge = (userType: 'staff' | 'socialWorker' | 'rn' | 'user') => {
    switch (userType) {
      case 'staff':
        return { label: 'Staff', className: 'bg-blue-500 text-white' };
      case 'socialWorker':
        return { label: 'Social Worker', className: 'bg-purple-500 text-white' };
      case 'rn':
        return { label: 'RN', className: 'bg-green-500 text-white' };
      case 'user':
        return { label: 'User', className: 'bg-gray-500 text-white' };
    }
  };

  const isLoginSuccessful = (log: LoginLog) => {
    if (log.success === false) return false;
    if (String(log.failureReason || '').trim()) return false;
    return true;
  };

  /** Pair each login with the next logout/timeout for that user to estimate session length. */
  const sessionDurationByLoginId = useMemo(() => {
    const byUser = new Map<string, LoginLog[]>();
    loginLogs.forEach((log) => {
      const key = String(log.userId || log.userEmail || log.email || '').trim().toLowerCase();
      if (!key) return;
      const list = byUser.get(key) || [];
      list.push(log);
      byUser.set(key, list);
    });

    const durations = new Map<string, number | null>();
    byUser.forEach((logs) => {
      const sorted = [...logs].sort((a, b) => {
        const aMs = toDateSafe(a.timestamp)?.getTime() || 0;
        const bMs = toDateSafe(b.timestamp)?.getTime() || 0;
        return aMs - bMs;
      });

      for (let i = 0; i < sorted.length; i += 1) {
        const log = sorted[i];
        const action = String(log.action || log.type || log.event || '').trim().toLowerCase();
        if (action !== 'login' || !isLoginSuccessful(log)) {
          durations.set(log.id, null);
          continue;
        }
        const loginMs = toDateSafe(log.timestamp)?.getTime();
        if (!loginMs) {
          durations.set(log.id, null);
          continue;
        }

        let endMs: number | null = null;
        for (let j = i + 1; j < sorted.length; j += 1) {
          const next = sorted[j];
          const nextAction = String(next.action || next.type || next.event || '').trim().toLowerCase();
          const nextMs = toDateSafe(next.timestamp)?.getTime();
          if (!nextMs) continue;
          if (nextAction === 'logout' || nextAction === 'session_timeout' || nextAction === 'forced_logout') {
            endMs = nextMs;
            break;
          }
          if (nextAction === 'login') break;
        }

        if (endMs != null && endMs >= loginMs) {
          durations.set(log.id, endMs - loginMs);
        } else {
          // Still active / no logout recorded — use active session lastActivity if online.
          const email = String(log.userEmail || log.email || '').trim().toLowerCase();
          const uid = String(log.userId || '').trim();
          const session = activeSessions.find(
            (s) =>
              String(s.userId || '').trim() === uid ||
              String(s.userEmail || s.email || '')
                .trim()
                .toLowerCase() === email
          );
          if (session && Boolean(session.isOnline)) {
            const last = toDateSafe(session.lastActivity)?.getTime() || nowMs;
            durations.set(log.id, Math.max(0, last - loginMs));
          } else if (session?.signedOutAt) {
            const signedOut = toDateSafe(session.signedOutAt)?.getTime();
            durations.set(log.id, signedOut && signedOut >= loginMs ? signedOut - loginMs : null);
          } else {
            durations.set(log.id, null);
          }
        }
      }
    });

    return durations;
  }, [loginLogs, activeSessions, nowMs]);

  const getActiveSessionDuration = (session: ActiveSession) => {
    const start = toDateSafe(session.loginTime) || toDateSafe(session.lastActivity);
    if (!start) return null;
    const end = Boolean(session.isOnline)
      ? new Date(nowMs)
      : toDateSafe(session.signedOutAt) || toDateSafe(session.lastActivity);
    if (!end) return null;
    return Math.max(0, end.getTime() - start.getTime());
  };

  const roleCounts = useMemo(() => {
    const counts = { all: loginLogs.length, staff: 0, socialWorker: 0, user: 0 };
    loginLogs.forEach((log) => {
      const role = normalizeRole(log);
      if (role === 'staff') counts.staff += 1;
      else if (role === 'socialWorker' || role === 'rn') counts.socialWorker += 1;
      else counts.user += 1;
    });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginLogs, socialWorkerEmails, rnEmails]);

  const filteredLoginLogs = useMemo(() => {
    const queryText = filterUserQuery.trim().toLowerCase();
    const fromMs = filterDateFrom ? new Date(`${filterDateFrom}T00:00:00`).getTime() : null;
    const toMs = filterDateTo ? new Date(`${filterDateTo}T23:59:59.999`).getTime() : null;

    return loginLogs.filter((log) => {
      const role = normalizeRole(log);
      const roleBucket = role === 'rn' ? 'socialWorker' : role;
      if (filterRole !== 'all' && roleBucket !== filterRole) return false;

      if (queryText) {
        const userEmail = String(log.userEmail || log.email || '').toLowerCase();
        const userName = String(log.userName || log.displayName || '').toLowerCase();
        const userId = String(log.userId || '').toLowerCase();
        if (!userEmail.includes(queryText) && !userName.includes(queryText) && !userId.includes(queryText)) {
          return false;
        }
      }

      if (fromMs != null || toMs != null) {
        const ts = toDateSafe(log.timestamp);
        if (!ts) return false;
        const ms = ts.getTime();
        if (fromMs != null && Number.isFinite(fromMs) && ms < fromMs) return false;
        if (toMs != null && Number.isFinite(toMs) && ms > toMs) return false;
      }

      if (filterSuccess !== 'all') {
        const ok = isLoginSuccessful(log);
        if (filterSuccess === 'success' && !ok) return false;
        if (filterSuccess === 'failed' && ok) return false;
      }

      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loginLogs,
    filterRole,
    filterUserQuery,
    filterDateFrom,
    filterDateTo,
    filterSuccess,
    socialWorkerEmails,
    rnEmails,
  ]);

  const clearFilters = () => {
    setFilterRole('all');
    setFilterAction('all');
    setFilterUserQuery('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterSuccess('all');
  };

  if (isAdminLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          <p className="text-muted-foreground">Loading admin permissions...</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="py-8 text-center">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-500" />
        <h3 className="mb-2 text-lg font-semibold text-red-600">Access Denied</h3>
        <p className="text-muted-foreground">Only Super Admins can view login logs</p>
      </div>
    );
  }

  const roleButtons: Array<{ key: RoleFilter; label: string; icon: typeof Users; count: number }> = [
    { key: 'all', label: 'All', icon: Users, count: roleCounts.all },
    { key: 'staff', label: 'Staff', icon: Briefcase, count: roleCounts.staff },
    { key: 'socialWorker', label: 'Social Worker', icon: HeartHandshake, count: roleCounts.socialWorker },
    { key: 'user', label: 'User', icon: User, count: roleCounts.user },
  ];

  const hasActiveFilters =
    filterRole !== 'all' ||
    filterUserQuery ||
    filterDateFrom ||
    filterDateTo ||
    filterAction !== 'all' ||
    filterSuccess !== 'all';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isLoading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </>
          ) : (
            <span>
              Showing {filteredLoginLogs.length} of {loginLogs.length} login events
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void refreshData()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Login filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {roleButtons.map((btn) => {
              const Icon = btn.icon;
              const active = filterRole === btn.key;
              return (
                <Button
                  key={btn.key}
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  className={cn('gap-2', active && 'shadow-sm')}
                  onClick={() => setFilterRole(btn.key)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {btn.label}
                  <Badge variant={active ? 'secondary' : 'outline'} className="ml-0.5 h-5 px-1.5 text-[10px]">
                    {btn.count}
                  </Badge>
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={filterSuccess === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterSuccess('all')}
            >
              All results
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filterSuccess === 'success' ? 'default' : 'outline'}
              className={filterSuccess === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              onClick={() => setFilterSuccess('success')}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Successful
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filterSuccess === 'failed' ? 'destructive' : 'outline'}
              onClick={() => setFilterSuccess('failed')}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              Failed
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="login-search" className="text-xs">
                Search by name or email
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="login-search"
                  value={filterUserQuery}
                  onChange={(e) => setFilterUserQuery(e.target.value)}
                  placeholder="e.g. Helen or helen@email.com"
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-date-from" className="text-xs">
                From date
              </Label>
              <Input
                id="login-date-from"
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-date-to" className="text-xs">
                To date
              </Label>
              <Input
                id="login-date-to"
                type="date"
                value={filterDateTo}
                min={filterDateFrom || undefined}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Action</Label>
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
                <SelectItem value="session_timeout">Timeout</SelectItem>
                <SelectItem value="forced_logout">Forced logout</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4" />
              Active Sessions ({activeSessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-80 overflow-y-auto">
              {activeSessions.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No active sessions</p>
              ) : (
                <div className="space-y-1">
                  {activeSessions.map((session) => {
                    const last = toDateSafe(session.lastActivity);
                    const online =
                      Boolean(session.isOnline) && (!!last ? nowMs - last.getTime() < 15 * 60 * 1000 : false);
                    const durationMs = getActiveSessionDuration(session);
                    return (
                      <div key={session.id} className="rounded border p-2 text-xs hover:bg-gray-50">
                        <div className="flex items-start gap-2">
                          {online ? (
                            <Wifi className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                          ) : (
                            <WifiOff className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="truncate font-medium">
                              {session.userName ||
                                session.displayName ||
                                session.userEmail ||
                                session.email ||
                                session.userId ||
                                'Unknown User'}
                            </p>
                            <p className="truncate text-muted-foreground">
                              {session.userEmail || session.email || 'No email'}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={online ? 'default' : 'secondary'} className="h-4 px-1.5 text-[10px]">
                                {online ? 'Online' : 'Offline'}
                              </Badge>
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <Timer className="h-3 w-3" />
                                Session: {formatDurationMs(durationMs)}
                              </span>
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(session.lastActivity)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4" />
              Login History ({filteredLoginLogs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-80 overflow-y-auto">
              {filteredLoginLogs.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No login logs match these filters</p>
              ) : (
                <div className="space-y-1">
                  {filteredLoginLogs.map((log) => {
                    const userEmail = log.userEmail || log.email || '';
                    const userType = normalizeRole(log);
                    const userName =
                      log.userName || log.displayName || userEmail || log.userId || 'Unknown User';
                    const rawAction = String(log.action || log.type || log.event || '')
                      .trim()
                      .toLowerCase();
                    const action =
                      rawAction === 'login' ||
                      rawAction === 'logout' ||
                      rawAction === 'session_timeout' ||
                      rawAction === 'forced_logout'
                        ? rawAction
                        : '';
                    const ok = isLoginSuccessful(log);
                    const typeBadge = getUserTypeBadge(userType);
                    const durationMs = action === 'login' ? sessionDurationByLoginId.get(log.id) : null;

                    return (
                      <div key={log.id} className="rounded border p-2 text-xs transition-colors hover:bg-gray-50">
                        <div className="flex items-start gap-2">
                          <User className="mt-0.5 h-3 w-3 shrink-0 text-gray-500" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate font-medium">{userName}</span>
                              <Badge className={`h-4 shrink-0 px-1.5 text-[10px] ${typeBadge.className}`}>
                                {typeBadge.label}
                              </Badge>
                              {action ? (
                                <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
                                  {action}
                                </Badge>
                              ) : null}
                              <Badge
                                className={cn(
                                  'h-4 shrink-0 gap-1 px-1.5 text-[10px]',
                                  ok
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : 'border-red-200 bg-red-50 text-red-800'
                                )}
                                variant="outline"
                              >
                                {ok ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3" />
                                    Successful
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-3 w-3" />
                                    Failed
                                  </>
                                )}
                              </Badge>
                            </div>
                            <div className="truncate text-muted-foreground">{userEmail || 'No email'}</div>
                            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(log.timestamp)}
                              </span>
                              {action === 'login' ? (
                                <span className="inline-flex items-center gap-1">
                                  <Timer className="h-3 w-3" />
                                  Time in session:{' '}
                                  {durationMs == null
                                    ? 'Still open / unknown'
                                    : formatDurationMs(durationMs)}
                                </span>
                              ) : null}
                              {!ok && log.failureReason ? (
                                <span className="truncate text-red-600">{log.failureReason}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
