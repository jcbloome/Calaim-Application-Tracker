'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import {
  AlertCircle,
  CalendarCheck,
  Loader2,
  Mail,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { isRnPortalExcludedStaffEmail } from '@/lib/rn-portal-access';

interface PortalWorker {
  uid: string;
  email: string;
  displayName?: string;
  isActive?: boolean;
  portalKind?: string;
  isRnPortal?: boolean;
  role?: string;
  rn_id?: string;
  sw_id?: string;
}

interface SyncedRn {
  id: string;
  name: string;
  email: string;
  role: string;
  rn_id: string;
  county?: string;
  phone?: string;
  source?: string;
  assignedMemberCount: number;
  hasPortalAccess: boolean;
  isPortalActive: boolean;
}

const MANAGEMENT_PAGE_LINKS = [
  { href: '/admin/user-staff-management', label: 'User & Staff Hub' },
  { href: '/admin/staff-management', label: 'Staff Management' },
  { href: '/admin/sw-user-management', label: 'Social Worker Management' },
  { href: '/admin/rn-user-management', label: 'RN User Management' },
  { href: '/admin/registered-users', label: 'Registered Users' },
] as const;

export default function RnUserManagementPage() {
  const firestore = useFirestore();
  const { isSuperAdmin, isLoading: adminLoading, user: adminUser } = useAdmin();
  const { toast } = useToast();
  const router = useRouter();

  const normalizeEmail = (email?: string) => (email || '').trim().toLowerCase();

  const [portalWorkers, setPortalWorkers] = useState<PortalWorker[]>([]);
  const [syncedRns, setSyncedRns] = useState<SyncedRn[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [updatingAccess, setUpdatingAccess] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  /** Admin/staff emails cannot use /sw-login — grey out RN portal toggle for them. */
  const [connectionsStaffEmails, setConnectionsStaffEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!adminLoading && !isSuperAdmin) {
      router.push('/admin');
    }
  }, [adminLoading, isSuperAdmin, router]);

  useEffect(() => {
    void loadPortalWorkers();
  }, [firestore]);

  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;
    const loadStaffEmails = async () => {
      try {
        const [adminSnap, superSnap, usersSnap] = await Promise.all([
          getDocs(collection(firestore, 'roles_admin')).catch(() => null),
          getDocs(collection(firestore, 'roles_super_admin')).catch(() => null),
          getDocs(collection(firestore, 'users')).catch(() => null),
        ]);
        const emails = new Set<string>();
        const addEmail = (raw?: unknown) => {
          const email = normalizeEmail(String(raw || ''));
          if (email.includes('@')) emails.add(email);
        };

        for (const docSnap of adminSnap?.docs || []) {
          addEmail(docSnap.id);
          addEmail((docSnap.data() as any)?.email);
        }
        for (const docSnap of superSnap?.docs || []) {
          addEmail(docSnap.id);
          addEmail((docSnap.data() as any)?.email);
        }
        for (const docSnap of usersSnap?.docs || []) {
          const data = docSnap.data() as any;
          const email = normalizeEmail(data?.email);
          if (!email.includes('@')) continue;
          const isStaffAccount =
            Boolean(data?.isStaff) ||
            Boolean(data?.isAdmin) ||
            Boolean(data?.isSuperAdmin) ||
            Boolean(data?.canAccessAllTools) ||
            ['admin', 'super admin', 'super_admin', 'staff'].includes(
              String(data?.role || '')
                .trim()
                .toLowerCase()
            );
          // Do not use isRnStaff alone — portal-only RNs also get that flag.
          if (isStaffAccount || isHardcodedAdminEmail(email)) addEmail(email);
        }

        if (!cancelled) setConnectionsStaffEmails(emails);
      } catch (error) {
        console.warn('Failed to load Connections staff emails for RN roster:', error);
      }
    };
    void loadStaffEmails();
    return () => {
      cancelled = true;
    };
  }, [firestore]);

  const isConnectionsStaffEmail = (emailRaw: string) => {
    const email = normalizeEmail(emailRaw);
    if (!email) return false;
    if (isRnPortalExcludedStaffEmail(email)) return true;
    if (isHardcodedAdminEmail(email)) return true;
    return connectionsStaffEmails.has(email);
  };

  const loadPortalWorkers = async (): Promise<PortalWorker[]> => {
    if (!firestore) return [];
    try {
      const swQuery = query(collection(firestore, 'socialWorkers'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(swQuery);
      const workers = snap.docs.map((docSnap) => {
        const data = docSnap.data() as PortalWorker;
        return { ...data, uid: docSnap.id, email: normalizeEmail(data.email) };
      });
      setPortalWorkers(workers);
      return workers;
    } catch (error) {
      console.error('Error loading RN portal workers:', error);
      return [];
    }
  };

  const filteredRns = syncedRns.filter((rn) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      String(rn.name || '').toLowerCase().includes(q) ||
      normalizeEmail(rn.email).includes(q) ||
      String(rn.rn_id || '').toLowerCase().includes(q) ||
      String(rn.role || '').toLowerCase().includes(q)
    );
  });

  const findPortal = (email: string, workers: PortalWorker[] = portalWorkers) =>
    workers.find(
      (w) =>
        normalizeEmail(w.email) === email &&
        (w.portalKind === 'rn' || w.isRnPortal || Boolean(w.rn_id))
    ) || workers.find((w) => normalizeEmail(w.email) === email);

  const loadFromCaspio = async (options?: { includeAssignmentCounts?: boolean }) => {
    if (!adminUser) return;
    const includeAssignmentCounts = options?.includeAssignmentCounts !== false;
    setIsSyncing(true);
    try {
      const idToken = await adminUser.getIdToken();
      const response = await fetch('/api/caspio-rns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, includeAssignmentCounts }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(String(data?.error || 'Failed to fetch Caspio RNs'));
      }

      const workers = await loadPortalWorkers();

      const byEmail = new Map<string, SyncedRn>();
      const byId = new Map<string, SyncedRn>();
      for (const rn of Array.isArray(data.rns) ? data.rns : []) {
        const email = normalizeEmail(rn.email);
        const rnId = String(rn.rn_id || rn.id || '').trim();
        const portal = email ? findPortal(email, workers) : undefined;
        const row: SyncedRn = {
          id: rnId || email || String(rn.name || ''),
          name: String(rn.name || '').trim() || email || (rnId ? `RN ${rnId}` : 'RN'),
          email,
          role: String(rn.role || 'RN').trim() || 'RN',
          rn_id: rnId,
          county: String(rn.county || '').trim() || undefined,
          phone: String(rn.phone || '').trim() || undefined,
          source: String(rn.source || '').trim() || undefined,
          assignedMemberCount: Number(rn.assignedMemberCount || 0),
          hasPortalAccess: Boolean(portal),
          isPortalActive: Boolean(portal?.isActive),
        };
        if (rnId) {
          const existing = byId.get(rnId.toLowerCase());
          if (!existing || (row.email && !existing.email)) byId.set(rnId.toLowerCase(), row);
          continue;
        }
        if (email) {
          const existing = byEmail.get(email);
          if (!existing || row.name.length > existing.name.length) byEmail.set(email, row);
        }
      }

      const merged = Array.from(byId.values()).concat(
        Array.from(byEmail.values()).filter(
          (row) => !Array.from(byId.values()).some((r) => normalizeEmail(r.email) === normalizeEmail(row.email))
        )
      );

      // Default: every Caspio RN with a portal email gets /sw-login access (staff emails excluded).
      let ensureSummary = '';
      try {
        const ensureRes = await fetch('/api/admin/sw-portal/ensure-rn-roster', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            sendInvitesForNewAccounts: true,
            rns: merged.map((rn) => ({
              email: rn.email,
              name: rn.name,
              rnId: rn.rn_id,
              county: rn.county,
            })),
          }),
        });
        const ensureBody = await ensureRes.json().catch(() => ({} as any));
        if (ensureRes.ok && ensureBody?.success) {
          ensureSummary = ` Portal On for ${Number(ensureBody.alreadyActive || 0) + Number(ensureBody.enabled || 0)} RN(s); ${Number(ensureBody.skippedStaff || 0)} staff skipped.`;
          if (Number(ensureBody.created || 0) > 0) {
            ensureSummary += ` ${Number(ensureBody.created)} new login(s) — password setup email sent when possible.`;
          }
        } else if (!ensureRes.ok) {
          console.warn('ensure-rn-roster failed:', ensureBody?.error || ensureRes.status);
        }
      } catch (ensureError) {
        console.warn('ensure-rn-roster error:', ensureError);
      }

      const workersAfter = await loadPortalWorkers();
      const withPortal = merged
        .map((row) => {
          const email = normalizeEmail(row.email);
          if (isConnectionsStaffEmail(email)) {
            return { ...row, hasPortalAccess: false, isPortalActive: false };
          }
          const portal = email ? findPortal(email, workersAfter) : undefined;
          return {
            ...row,
            hasPortalAccess: Boolean(portal),
            isPortalActive: Boolean(portal?.isActive),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      setSyncedRns(withPortal);

      toast({
        title: includeAssignmentCounts ? 'Loaded Caspio RNs' : 'Refreshed Caspio RNs',
        description: includeAssignmentCounts
          ? `Synced ${withPortal.length} RN(s) from ${String(data?.source || 'CalAIM_tbl_RN')}. Counts use Members.RN_ID / RN_Assigned.${ensureSummary}`
          : `Pulled ${withPortal.length} RN(s) from ${String(data?.source || 'CalAIM_tbl_RN')}.${ensureSummary}`,
      });
      if (withPortal.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No RNs found',
          description:
            'CalAIM_tbl_RN returned 0 rows. Confirm the table name and that the Caspio API account can read it.',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Load Failed',
        description: error?.message || 'Failed to load RNs from Caspio',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const togglePortalAccess = async (rn: SyncedRn, nextActive: boolean) => {
    if (!adminUser) return;
    const staffEmail = normalizeEmail(rn.email);
    if (!staffEmail) {
      toast({
        variant: 'destructive',
        title: 'Missing Email',
        description: 'This RN does not have a valid email (SW_email) for portal login.',
      });
      return;
    }
    if (isConnectionsStaffEmail(staffEmail)) {
      toast({
        variant: 'destructive',
        title: 'Connections staff email',
        description: `${rn.name || staffEmail} uses an admin/staff login. Use a separate portal email for ALFT — admin emails cannot sign in at /sw-login.`,
      });
      return;
    }

    setUpdatingAccess((prev) => ({ ...prev, [staffEmail]: true }));
    try {
      const idToken = await adminUser.getIdToken();
      const response = await fetch('/api/admin/sw-portal/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          email: staffEmail,
          displayName: rn.name || staffEmail,
          swId: rn.rn_id || undefined,
          rnId: rn.rn_id || undefined,
          county: rn.county || undefined,
          portalKind: 'rn',
          active: nextActive,
          sendInvite: nextActive,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || 'Failed to update RN portal access'));
      }

      await loadPortalWorkers();
      setSyncedRns((prev) =>
        prev.map((row) =>
          normalizeEmail(row.email) === staffEmail
            ? { ...row, hasPortalAccess: nextActive, isPortalActive: nextActive }
            : row
        )
      );

      toast({
        title: nextActive ? 'RN Portal Access Enabled' : 'RN Portal Access Disabled',
        description: nextActive
          ? data?.authCreated
            ? `${rn.name}: login created (same /sw-login workflow as MSWs). Password setup email ${data?.inviteSent ? 'sent' : 'failed — use Forgot password'}.`
            : `${rn.name} can sign in at /sw-login with the same portal workflow as MSWs.`
          : `${rn.name} is now inactive`,
      });
      if (nextActive && data?.inviteError) {
        toast({
          variant: 'destructive',
          title: 'Password setup email not sent',
          description: String(data.inviteError),
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error?.message || 'Could not update RN portal access',
      });
    } finally {
      setUpdatingAccess((prev) => ({ ...prev, [staffEmail]: false }));
    }
  };

  if (adminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">RN User Management</h1>
          <p className="mt-2 text-muted-foreground">
            Same Social Worker portal workflow as MSWs (/sw-login). Caspio members use{' '}
            <span className="font-medium text-foreground">RN_ID</span> (id) and{' '}
            <span className="font-medium text-foreground">RN_Assigned</span> (name). Loading the roster
            turns <span className="font-medium text-foreground">Portal On</span> for every RN with an
            email (including those doing initial assessment + final ALFT sign-off). Connections staff
            emails (e.g. leslie@carehomefinders.com / @carehomefinders.com) stay on Admin login and are
            blocked from /sw-login.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void loadFromCaspio()} disabled={isSyncing}>
            {isSyncing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Loading…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Load from Caspio
              </>
            )}
          </Button>
          <Button
            variant="outline"
            disabled={isSyncing}
            onClick={() => void loadFromCaspio({ includeAssignmentCounts: false })}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Management links</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {MANAGEMENT_PAGE_LINKS.map((item, index) => (
            <span key={item.href} className="inline-flex items-center gap-3">
              <Link
                href={item.href}
                className={
                  item.href === '/admin/rn-user-management'
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-violet-700" />
            Caspio RN roster
          </CardTitle>
          <CardDescription>
            Primary source: <span className="font-medium">CalAIM_tbl_RN</span> (
            <span className="font-medium">RN_ID</span> matches{' '}
            <span className="font-medium">CalAIM_tbl_Members.RN_ID</span>; name is the{' '}
            <span className="font-medium">RN_Assigned</span> dropdown). Portal access defaults On for
            all roster RNs except Connections staff emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, email, or RN_ID…"
            className="max-w-md"
          />

          {syncedRns.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              Click Load from Caspio to pull RN staff. Eligible RNs get Portal On automatically (staff
              emails like leslie@carehomefinders.com are excluded).
            </div>
          ) : filteredRns.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No RNs match {searchQuery}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name (RN_Assigned)</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Assigned Members</TableHead>
                  <TableHead>Portal / ALFT access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRns.map((rn, idx) => {
                  const staffEmail = normalizeEmail(rn.email);
                  const portal = findPortal(staffEmail);
                  const active = Boolean(portal?.isActive ?? rn.isPortalActive);
                  const isStaffLane = isConnectionsStaffEmail(staffEmail);
                  return (
                    <TableRow
                      key={`${rn.rn_id || rn.email || rn.name}-${idx}`}
                      className={isStaffLane ? 'bg-muted/40 opacity-70' : undefined}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserCheck
                            className={`h-4 w-4 ${isStaffLane ? 'text-muted-foreground' : 'text-violet-700'}`}
                          />
                          <div>
                            <div className="font-medium">{rn.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {rn.role}
                              {rn.rn_id ? ` · RN_ID: ${rn.rn_id}` : ''}
                              {rn.county ? ` · ${rn.county}` : ''}
                            </div>
                            {isStaffLane ? (
                              <Badge variant="outline" className="mt-1 text-[10px] text-muted-foreground">
                                Connections staff — portal N/A
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {staffEmail.includes('@') ? (
                            staffEmail
                          ) : (
                            <span className="text-sm text-amber-600">No email</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{rn.assignedMemberCount ?? 0}</Badge>
                      </TableCell>
                      <TableCell className={isStaffLane ? 'pointer-events-none' : undefined}>
                        <div className="flex flex-wrap items-center gap-2">
                          {isStaffLane ? (
                            <Badge variant="secondary">Portal blocked (staff email)</Badge>
                          ) : (
                            <Badge variant={active ? 'default' : 'destructive'}>
                              {active ? 'Portal On' : 'Portal Off'}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Switch
                            checked={isStaffLane ? false : active}
                            onCheckedChange={(checked) => void togglePortalAccess(rn, Boolean(checked))}
                            disabled={isStaffLane || !staffEmail || updatingAccess[staffEmail]}
                            aria-label={`Portal access for ${rn.name}`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {isStaffLane
                              ? 'Needs a separate /sw-login email for ALFT assessor work'
                              : updatingAccess[staffEmail]
                                ? 'Updating…'
                                : 'Same /sw-login workflow as MSWs'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
