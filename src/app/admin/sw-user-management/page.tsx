'use client';

import React, { useState, useEffect } from 'react';
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
import { 
  collection, 
  query, 
  orderBy, 
  getDocs, 
  doc, 
  setDoc, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { 
  Users,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  UserCheck,
  Mail,
} from 'lucide-react';

interface SocialWorkerUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'social_worker';
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
  lastLogin?: Date;
  assignedMembers?: string[];
  assignedRCFEs?: string[];
  permissions: {
    visitVerification: boolean;
    memberQuestionnaire: boolean;
    claimsSubmission: boolean;
  };
  notes?: string;
}

interface CaspioStaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  sw_id: string;
  phone?: string;
  department?: string;
  isActive: boolean;
  assignedMemberCount: number;
}

interface SyncedSocialWorker {
  id: string;
  name: string;
  email: string;
  role: string;
  sw_id: string;
  phone?: string;
  department?: string;
  assignedMemberCount: number;
  hasPortalAccess: boolean;
  isPortalActive: boolean;
  syncedAt: Date;
}

const MANAGEMENT_PAGE_LINKS = [
  { href: '/admin/user-staff-management', label: 'User & Staff Hub' },
  { href: '/admin/staff-management', label: 'Staff Management' },
  { href: '/admin/sw-user-management', label: 'Social Worker Management' },
  { href: '/admin/registered-users', label: 'Registered Users' },
] as const;

export default function SWUserManagementPage() {
  const firestore = useFirestore();
  const { isSuperAdmin, user: adminUser } = useAdmin();
  const { toast } = useToast();

  const normalizeEmail = (email?: string) => (email || '').trim().toLowerCase();
  
  const [socialWorkers, setSocialWorkers] = useState<SocialWorkerUser[]>([]);
  const [syncedStaff, setSyncedStaff] = useState<SyncedSocialWorker[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBackfillingSwContacts, setIsBackfillingSwContacts] = useState(false);
  const [updatingAccess, setUpdatingAccess] = useState<Record<string, boolean>>({});
  const [updatingAllAccess, setUpdatingAllAccess] = useState(false);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');

  const filteredSyncedStaff = syncedStaff.filter((staff) => {
    const q = staffSearchQuery.trim().toLowerCase();
    if (!q) return true;
    const name = String(staff.name || '').toLowerCase();
    const email = normalizeEmail(staff.email);
    const swId = String(staff.sw_id || '').toLowerCase();
    const role = String(staff.role || '').toLowerCase();
    return name.includes(q) || email.includes(q) || swId.includes(q) || role.includes(q);
  });

  useEffect(() => {
    void loadSocialWorkers();
  }, []);

  const loadSocialWorkers = async () => {
    if (!firestore) return;
    
    try {
      const swQuery = query(
        collection(firestore, 'socialWorkers'),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(swQuery);
      const workers: SocialWorkerUser[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          uid: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          lastLogin: data.lastLogin?.toDate()
        };
      }) as SocialWorkerUser[];
      
      setSocialWorkers(workers);
    } catch (error) {
      console.error('Error loading social workers:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load social workers'
      });
    } finally {
      // no-op
    }
  };

  const loadFromCaspio = async () => {
    setIsSyncing(true);
    try {
      // Fetch staff from Caspio
      const response = await fetch('/api/caspio-staff');
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch from Caspio');
      }
      
      const caspioStaff = data.staff || [];
      console.log(`🔄 Loaded ${caspioStaff.length} staff members from Caspio`);
      
      if (caspioStaff.length === 0) {
        toast({
          title: 'No Staff Found',
          description: 'No social workers found in Caspio'
        });
        return;
      }
      
      const caspioWithStatusRaw = caspioStaff.map((staff: CaspioStaffMember) => {
        const staffSwId = String(staff.sw_id || staff.id || '');
        const staffEmail = normalizeEmail(String(staff.email || ''));
        return {
          id: String(staff.sw_id || staff.id),
          name: String(staff.name || `SW ${staff.sw_id}`),
          email: staffEmail,
          role: staff.role || 'MSW',
          sw_id: staffSwId,
          phone: String(staff.phone || ''),
          department: String(staff.department || ''),
          assignedMemberCount: staff.assignedMemberCount ?? 0,
          hasPortalAccess: socialWorkers.some(sw => normalizeEmail(sw.email) === staffEmail),
          isPortalActive: socialWorkers.find(sw => normalizeEmail(sw.email) === staffEmail)?.isActive || false,
          syncedAt: new Date(),
        };
      });

      // Deduplicate rows (Caspio can return duplicates). Prefer rows with an email.
      const caspioWithStatus = (() => {
        const pickBetter = (a: any, b: any) => {
          const aEmail = String(a.email || '').trim();
          const bEmail = String(b.email || '').trim();
          if (!!aEmail !== !!bEmail) return aEmail ? a : b;
          const aName = String(a.name || '').trim();
          const bName = String(b.name || '').trim();
          if (aName.length !== bName.length) return aName.length >= bName.length ? a : b;
          return a;
        };
        const bySwId = new Map<string, any>();
        const byEmail = new Map<string, any>();
        for (const row of caspioWithStatusRaw) {
          const swId = String(row.sw_id || '').trim();
          const email = normalizeEmail(String(row.email || ''));
          if (swId) {
            const existing = bySwId.get(swId);
            bySwId.set(swId, existing ? pickBetter(existing, row) : row);
            continue;
          }
          if (email) {
            const existing = byEmail.get(email);
            byEmail.set(email, existing ? pickBetter(existing, row) : row);
          }
        }
        const result = Array.from(bySwId.values()).concat(
          Array.from(byEmail.entries())
            .filter(([email]) => !Array.from(bySwId.values()).some((s) => normalizeEmail(String(s.email || '')) === email))
            .map(([, row]) => row)
        );
        return result;
      })();
      
      setSyncedStaff(caspioWithStatus);
      
      toast({
        title: 'Loaded from Caspio',
        description: `Synced ${caspioStaff.length} social workers from Caspio.`
      });
      
    } catch (error: any) {
      console.error('Error loading from Caspio:', error);
      toast({
        variant: 'destructive',
        title: 'Load Failed',
        description: error.message || 'Failed to load from Caspio'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const refreshSyncedStaffStatus = () => {
    // Update the hasPortalAccess status for all synced staff
    setSyncedStaff(current => 
      current.map(staff => ({
        ...staff,
        hasPortalAccess: socialWorkers.some(sw => normalizeEmail(sw.email) === normalizeEmail(staff.email)),
        isPortalActive: socialWorkers.find(sw => normalizeEmail(sw.email) === normalizeEmail(staff.email))?.isActive || false
      }))
    );
  };

  const setAllPortalAccess = async (nextActive: boolean) => {
    if (!firestore || !adminUser) return;
    const candidates = syncedStaff
      .map((staff) => ({
        ...staff,
        normalizedEmail: normalizeEmail(staff.email)
      }))
      .filter((staff) => !!staff.normalizedEmail);

    if (candidates.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Valid Emails',
        description: 'No social workers with valid email addresses were found.'
      });
      return;
    }

    setUpdatingAllAccess(true);
    try {
      const chunks: Array<typeof candidates> = [];
      for (let i = 0; i < candidates.length; i += 450) {
        chunks.push(candidates.slice(i, i + 450));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(firestore);
        chunk.forEach((staff) => {
          const docId = socialWorkers.find(sw => normalizeEmail(sw.email) === staff.normalizedEmail)?.uid
            || staff.normalizedEmail;
          batch.set(doc(firestore, 'socialWorkers', docId), {
            email: staff.normalizedEmail,
            displayName: staff.name || staff.normalizedEmail,
            role: 'social_worker',
            isActive: nextActive,
            updatedAt: serverTimestamp(),
            ...(docId === staff.normalizedEmail ? {
              createdAt: serverTimestamp(),
              createdBy: adminUser.email || adminUser.uid,
              permissions: {
                visitVerification: true,
                memberQuestionnaire: true,
                claimsSubmission: true
              }
            } : {})
          }, { merge: true });
        });
        await batch.commit();
      }

      await loadSocialWorkers();
      toast({
        title: nextActive ? 'Portal Access Enabled' : 'Portal Access Disabled',
        description: `Updated ${candidates.length} social worker account(s).`
      });
    } catch (error: any) {
      console.error('Error updating all portal access:', error);
      toast({
        variant: 'destructive',
        title: 'Bulk Update Failed',
        description: error.message || 'Failed to update portal access'
      });
    } finally {
      setUpdatingAllAccess(false);
    }
  };

  const backfillSwContactFields = async () => {
    setIsBackfillingSwContacts(true);
    try {
      let idToken = '';
      try {
        idToken = (await adminUser?.getIdToken?.()) || '';
      } catch {
        idToken = '';
      }
      const response = await fetch('/api/tools/sw-userregistration-addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ dryRun: false }),
      });
      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Failed to sync SW contact fields.');
      }
      toast({
        title: 'SW contact fields synced',
        description: `Updated ${Number(payload?.updated || 0)} rows in CalAIM_tbl_Social_Worker (matched ${Number(
          payload?.matched || 0
        )}, unchanged ${Number(payload?.unchanged || 0)}).`,
      });
      void loadFromCaspio();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'SW contact sync failed',
        description: String(error?.message || 'Could not update SW County/Phone/Address/City/Zip fields.'),
      });
    } finally {
      setIsBackfillingSwContacts(false);
    }
  };

  const togglePortalAccess = async (staff: SyncedSocialWorker, nextActive: boolean) => {
    if (!firestore || !adminUser) return;
    const staffEmail = normalizeEmail(staff.email);
    if (!staffEmail) {
      toast({
        variant: 'destructive',
        title: 'Missing Email',
        description: 'This social worker does not have a valid email address.'
      });
      return;
    }

    const existing = socialWorkers.find(sw => normalizeEmail(sw.email) === staffEmail);
    const docId = existing?.uid || staffEmail;

    setUpdatingAccess(prev => ({ ...prev, [staffEmail]: true }));
    try {
      const payload: Partial<SocialWorkerUser> & { updatedAt?: any; createdAt?: any } = {
        email: staffEmail,
        displayName: staff.name || staffEmail,
        role: 'social_worker',
        isActive: nextActive,
        updatedAt: serverTimestamp()
      };

      if (!existing) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = adminUser.email || adminUser.uid;
        payload.permissions = {
          visitVerification: true,
          memberQuestionnaire: true,
          claimsSubmission: true
        };
      }

      await setDoc(doc(firestore, 'socialWorkers', docId), payload, { merge: true });
      await loadSocialWorkers();
      toast({
        title: nextActive ? 'Portal Access Enabled' : 'Portal Access Disabled',
        description: `${staff.name || staffEmail} is now ${nextActive ? 'active' : 'inactive'}`
      });
    } catch (error: any) {
      console.error('Error updating portal access:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error.message || 'Failed to update portal access'
      });
    } finally {
      setUpdatingAccess(prev => ({ ...prev, [staffEmail]: false }));
    }
  };

  // Update synced staff status when social workers change
  useEffect(() => {
    refreshSyncedStaffStatus();
  }, [socialWorkers]);

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need super admin permissions to manage social workers.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Social Worker Management</h1>
          <p className="text-muted-foreground">
            Manage social worker accounts and permissions
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={loadFromCaspio} disabled={isSyncing}>
            {isSyncing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Load from Caspio
              </>
            )}
          </Button>
          <Button onClick={() => { void loadSocialWorkers(); void loadFromCaspio(); }} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => void backfillSwContactFields()} variant="outline" disabled={isBackfillingSwContacts}>
            {isBackfillingSwContacts ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Syncing SW contacts...
              </>
            ) : (
              'Sync SW Contact Fields'
            )}
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
                  item.href === '/admin/sw-user-management'
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


      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total from Caspio</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{syncedStaff.length}</div>
            <p className="text-xs text-muted-foreground">
              Social workers in Caspio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portal Access Enabled</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {syncedStaff.filter(staff => staff.isPortalActive).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Active SW portal accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assigned Members</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {syncedStaff.reduce((total, staff) => total + Number(staff.assignedMemberCount || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total members assigned in Caspio
            </p>
          </CardContent>
        </Card>

      </div>

      {/* Synced Social Workers */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>
                Social Workers from Caspio ({filteredSyncedStaff.length}
                {staffSearchQuery.trim() ? ` of ${syncedStaff.length}` : ''})
              </CardTitle>
              <CardDescription>
                {syncedStaff.length === 0 ? (
                  <>Click Load from Caspio to pull the latest social workers and assigned member counts.</>
                ) : (
                  <>List is synced from Caspio and reflects assigned member counts in real time.</>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-full sm:w-72">
                <Input
                  value={staffSearchQuery}
                  onChange={(event) => setStaffSearchQuery(event.target.value)}
                  placeholder="Search name, email, SW_ID, role..."
                />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Portal access (all)</span>
                <Switch
                  checked={syncedStaff.length > 0 && syncedStaff.every(staff => staff.isPortalActive)}
                  onCheckedChange={(checked) => setAllPortalAccess(checked)}
                  disabled={updatingAllAccess || syncedStaff.length === 0}
                />
              </div>
              {updatingAllAccess && (
                <span className="text-xs text-muted-foreground">Updating…</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {syncedStaff.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Social Workers Loaded</h3>
                <p className="text-muted-foreground mb-4">
                  Click the Load from Caspio button above to pull all social workers from your system.
                </p>
                <Button onClick={loadFromCaspio} disabled={isSyncing}>
                  {isSyncing ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Load from Caspio
                    </>
                  )}
                </Button>
              </div>
            ) : filteredSyncedStaff.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No social workers match {staffSearchQuery}.
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Assigned Members</TableHead>
                  <TableHead>Status / Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSyncedStaff.map((staff, idx) => {
                  const staffEmail = normalizeEmail(staff.email);
                  const rowKey = `${staff.sw_id || staff.id || staffEmail || staff.name || 'sw'}-${staff.email || ''}`;
                  return (
                    <TableRow key={`${rowKey}-${idx}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-medium">{staff.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {staff.role} • SW_ID: {staff.sw_id}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {staff.email && staff.email.includes('@') ? staff.email : (
                            <span className="text-amber-600 text-sm">No email</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {staff.assignedMemberCount ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={staff.isPortalActive ? 'default' : 'outline'}>
                            {staff.isPortalActive ? 'Portal On' : 'Portal Off'}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Switch
                            checked={staff.isPortalActive}
                            onCheckedChange={(checked) => togglePortalAccess(staff, checked)}
                            disabled={!staffEmail || updatingAccess[staffEmail]}
                          />
                          <span className="text-xs text-muted-foreground">
                            {staff.isPortalActive ? 'Portal access: On' : 'Portal access: Off'}
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