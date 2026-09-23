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

  useEffect(() => {
    if (!adminLoading && !isSuperAdmin) {
      router.push('/admin');
    }
  }, [adminLoading, isSuperAdmin, router]);

  useEffect(() => {
    void loadPortalWorkers();
  }, [firestore]);

  const loadPortalWorkers = async () => {
    if (!firestore) return;
    try {
      const swQuery = query(collection(firestore, 'socialWorkers'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(swQuery);
      const workers = snap.docs.map((docSnap) => {
        const data = docSnap.data() as PortalWorker;
        return { ...data, uid: docSnap.id, email: normalizeEmail(data.email) };
      });
      setPortalWorkers(workers);
    } catch (error) {
      console.error('Error loading RN portal workers:', error);
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

  const findPortal = (email: string) =>
    portalWorkers.find(
      (w) =>
        normalizeEmail(w.email) === email &&
        (w.portalKind === 'rn' || w.isRnPortal || w.role === 'rn' || Boolean(w.rn_id))
    ) || portalWorkers.find((w) => normalizeEmail(w.email) === email);

  const loadFromCaspio = async () => {
    if (!adminUser) return;
    setIsSyncing(true);
    try {
      const idToken = await adminUser.getIdToken();
      const response = await fetch('/api/caspio-rns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(String(data?.error || 'Failed to fetch Caspio RNs'));
      }

      await loadPortalWorkers();
      let workers = portalWorkers;
      if (firestore) {
        try {
          const swQuery = query(collection(firestore, 'socialWorkers'), orderBy('createdAt', 'desc'));
          const snap = await getDocs(swQuery);
          workers = snap.docs.map((docSnap) => {
            const docData = docSnap.data() as PortalWorker;
            return { ...docData, uid: docSnap.id, email: normalizeEmail(docData.email) };
          });
          setPortalWorkers(workers);
        } catch {
          // keep prior
        }
      }

      const rows: SyncedRn[] = (Array.isArray(data.rns) ? data.rns : []).map((rn: any) => {
        const email = normalizeEmail(rn.email);
        const portal = workers.find((w) => normalizeEmail(w.email) === email);
        return {
          id: String(rn.id || email || rn.name || ''),
          name: String(rn.name || '').trim() || email || 'RN',
          email,
          role: String(rn.role || 'RN').trim() || 'RN',
          rn_id: String(rn.id || '').trim(),
          county: String(rn.county || '').trim() || undefined,
          phone: String(rn.phone || '').trim() || undefined,
          source: String(rn.source || '').trim() || undefined,
          hasPortalAccess: Boolean(portal),
          isPortalActive: Boolean(portal?.isActive),
        };
      });

      // Deduplicate by email
      const byEmail = new Map<string, SyncedRn>();
      for (const row of rows) {
        if (!row.email) continue;
        const existing = byEmail.get(row.email);
        if (!existing || (row.name.length > existing.name.length)) byEmail.set(row.email, row);
      }
      setSyncedRns(Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name)));

      toast({
        title: 'Loaded Caspio RNs',
        description: `Found ${byEmail.size} RN(s). Enable portal access so they can complete ALFT on the Social Worker site.`,
      });
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
        description: 'This RN does not have a valid email address.',
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
            ? `${rn.name}: login created. Password setup email ${data?.inviteSent ? 'sent' : 'failed — use Forgot password on /sw-login'}.`
            : `${rn.name} can sign in at /sw-login for ALFT.`
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
      <div>
        <h1 className="text-3xl font-bold">RN User Management</h1>
        <p className="mt-2 text-muted-foreground">
          Add RNs who complete in-person ALFT visits. Portal access uses the Social Worker login site
          (/sw-login). In ISP Workflow you can override MSW and assign an RN; the same RN receives
          final approval after admin review.
        </p>
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
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-violet-700" />
              Caspio RN roster
            </CardTitle>
            <CardDescription>
              Pulls RN roles from CalAIM_tbl_Social_Worker / staff tables. Enable portal access for
              ALFT. Member field <span className="font-medium">RN_ID</span> on CalAIM_tbl_Members is
              used when assigning in ISP Workflow.
            </CardDescription>
          </div>
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
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, email, or RN ID…"
            className="max-w-md"
          />

          {syncedRns.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              Click Load from Caspio to pull RN staff, then turn on portal access for each RN who
              will complete ALFT.
            </div>
          ) : filteredRns.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No RNs match {searchQuery}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Portal / ALFT access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRns.map((rn, idx) => {
                  const staffEmail = normalizeEmail(rn.email);
                  const portal = findPortal(staffEmail);
                  const active = Boolean(portal?.isActive ?? rn.isPortalActive);
                  return (
                    <TableRow key={`${rn.rn_id || rn.email}-${idx}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-violet-700" />
                          <div>
                            <div className="font-medium">{rn.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {rn.role}
                              {rn.rn_id ? ` · ID: ${rn.rn_id}` : ''}
                              {rn.county ? ` · ${rn.county}` : ''}
                            </div>
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
                        <span className="text-xs text-muted-foreground">{rn.source || '—'}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={active ? 'default' : 'destructive'}>
                            {active ? 'Portal On' : 'Portal Off'}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Switch
                            checked={active}
                            onCheckedChange={(checked) => void togglePortalAccess(rn, Boolean(checked))}
                            disabled={!staffEmail || updatingAccess[staffEmail]}
                            aria-label={`Portal access for ${rn.name}`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {updatingAccess[staffEmail] ? 'Updating…' : 'Allow SW-site login for ALFT'}
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
