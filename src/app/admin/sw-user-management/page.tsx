'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  updateDoc, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { 
  Users,
  AlertCircle,
  RefreshCw,
  Save,
  X,
  CheckCircle,
  UserCheck,
  Mail,
  Calendar,
  Settings
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
  isInFirestore?: boolean;
  needsSync?: boolean;
}

export default function SWUserManagementPage() {
  const firestore = useFirestore();
  const { isSuperAdmin, user: adminUser } = useAdmin();
  const { toast } = useToast();

  const normalizeEmail = (email?: string) => (email || '').trim().toLowerCase();
  
  const [socialWorkers, setSocialWorkers] = useState<SocialWorkerUser[]>([]);
  const [syncedStaff, setSyncedStaff] = useState<SyncedSocialWorker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [updatingAccess, setUpdatingAccess] = useState<Record<string, boolean>>({});
  const [updatingAllAccess, setUpdatingAllAccess] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  useEffect(() => {
    loadSocialWorkers();
    loadSyncedStaff();
  }, []);

  const loadSocialWorkers = async () => {
    if (!firestore) return;
    
    setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  const loadSyncedStaff = async () => {
    if (!firestore) return;
    
    try {
      // Load synced staff from Firebase
      const syncedQuery = query(
        collection(firestore, 'syncedSocialWorkers'),
        orderBy('name', 'asc')
      );
      
      const querySnapshot = await getDocs(syncedQuery);
      const firestoreStaff: SyncedSocialWorker[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          syncedAt: data.syncedAt?.toDate() || new Date(),
          hasPortalAccess: socialWorkers.some(sw => normalizeEmail(sw.email) === normalizeEmail(data.email)),
          isPortalActive: socialWorkers.find(sw => normalizeEmail(sw.email) === normalizeEmail(data.email))?.isActive || false,
          isInFirestore: true,
          needsSync: false
        };
      }) as SyncedSocialWorker[];
      
      // If we have loaded staff from Caspio, merge with Firestore status
      if (syncedStaff.length > 0) {
        setSyncedStaff(current => 
          current.map(staff => {
            const inFirestore = firestoreStaff.some(fs => 
              fs.sw_id === staff.sw_id || 
              (staff.email && normalizeEmail(fs.email) === normalizeEmail(staff.email))
            );
            return {
              ...staff,
              isInFirestore: inFirestore,
              needsSync: !inFirestore
            };
          })
        );
      } else {
        // If no Caspio data loaded yet, just show Firestore staff
        setSyncedStaff(firestoreStaff);
      }
      
      
    } catch (error) {
      console.error('Error loading synced staff:', error);
    }
  };

  const loadFromCaspio = async () => {
    if (!firestore) return;
    
    setIsSyncing(true);
    try {
      // First, load existing Firestore staff to check against
      const firestoreQuery = query(collection(firestore, 'syncedSocialWorkers'));
      const firestoreSnapshot = await getDocs(firestoreQuery);
      const existingFirestoreStaff = firestoreSnapshot.docs.map(doc => ({
        sw_id: String(doc.data().sw_id || ''),
        email: normalizeEmail(String(doc.data().email || ''))
      }));
      
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
      
      // Check which ones are already in Firestore
      const caspioWithStatusRaw = caspioStaff.map((staff: CaspioStaffMember) => {
        const staffSwId = String(staff.sw_id || staff.id || '');
        const staffEmail = normalizeEmail(String(staff.email || ''));
        
        // Check if already in Firestore
        const alreadyInFirestore = existingFirestoreStaff.some(fs => 
          fs.sw_id === staffSwId || 
          (staffEmail && fs.email === staffEmail)
        );
        
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
          isInFirestore: alreadyInFirestore,
          needsSync: !alreadyInFirestore
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
      
      // Persist Caspio names to Firestore so they don't fall back to SW_ID
      const batch = writeBatch(firestore);
      let savedCount = 0;
      caspioWithStatus.forEach((staff) => {
        const staffSwId = String(staff.sw_id || '').trim();
        if (!staffSwId) return;
        const docId = `sw_${staffSwId}`;
        batch.set(
          doc(firestore, 'syncedSocialWorkers', docId),
          {
            name: staff.name || `SW ${staffSwId}`,
            email: staff.email || '',
            role: staff.role || 'MSW',
            sw_id: staffSwId,
            phone: staff.phone || '',
            department: staff.department || '',
            assignedMemberCount: staff.assignedMemberCount ?? 0,
            syncedAt: serverTimestamp(),
            syncedBy: adminUser?.email || adminUser?.uid || 'system'
          },
          { merge: true }
        );
        savedCount += 1;
      });
      if (savedCount > 0) {
        await batch.commit();
      }

      setSyncedStaff(
        caspioWithStatus.map((staff) => ({
          ...staff,
          isInFirestore: staff.sw_id ? true : staff.isInFirestore,
          needsSync: staff.sw_id ? false : staff.needsSync
        }))
      );
      
      const newCount = caspioWithStatus.filter(s => s.needsSync).length;
      const existingCount = caspioWithStatus.filter(s => s.isInFirestore).length;
      
      toast({
        title: 'Loaded from Caspio',
        description: `Found ${caspioStaff.length} social workers. ${savedCount} name records saved to Firestore.`
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

  const saveToFirestore = async (staffMember: SyncedSocialWorker) => {
    if (!firestore || !adminUser) return;
    
    setIsCreating(true);
    try {
      const staffName = String(staffMember.name || staffMember.sw_id || 'Unknown Staff');
      const staffEmail = String(staffMember.email || '').trim();
      const staffSwId = String(staffMember.sw_id || staffMember.id || '');
      
      const syncedStaffData = {
        name: staffName,
        email: staffEmail,
        role: staffMember.role || 'MSW',
        sw_id: staffSwId,
        phone: String(staffMember.phone || ''),
        department: String(staffMember.department || ''),
        assignedMemberCount: 0,
        syncedAt: serverTimestamp(),
        syncedBy: adminUser.email || adminUser.uid
      };
      
      // Create a safe document ID - use SW_ID as primary identifier
      const docId = `sw_${staffSwId}`;
      
      await setDoc(doc(firestore, 'syncedSocialWorkers', docId), syncedStaffData);
      
      // Update local state
      setSyncedStaff(current => 
        current.map(staff => 
          staff.sw_id === staffSwId 
            ? { ...staff, isInFirestore: true, needsSync: false }
            : staff
        )
      );
      
      toast({
        title: 'Saved to Firestore',
        description: `${staffName} has been saved to Firestore`
      });
      
    } catch (error: any) {
      console.error('Error saving to Firestore:', error);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message || 'Failed to save to Firestore'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const saveAllNewToFirestore = async () => {
    if (!firestore || !adminUser) return;
    const toSave = syncedStaff.filter((staff) => !staff.isInFirestore);
    if (toSave.length === 0) {
      toast({
        title: 'Nothing to Save',
        description: 'All social workers are already in Firestore.'
      });
      return;
    }

    setIsSavingAll(true);
    try {
      const chunks: Array<typeof toSave> = [];
      for (let i = 0; i < toSave.length; i += 400) {
        chunks.push(toSave.slice(i, i + 400));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(firestore);
        chunk.forEach((staffMember) => {
          const staffName = String(staffMember.name || staffMember.sw_id || 'Unknown Staff');
          const staffEmail = String(staffMember.email || '').trim();
          if (!staffEmail) return;
          const staffSwId = String(staffMember.sw_id || staffMember.id || '');
          const docId = `sw_${staffSwId}`;
          batch.set(doc(firestore, 'syncedSocialWorkers', docId), {
            name: staffName,
            email: staffEmail,
            role: staffMember.role || 'MSW',
            sw_id: staffSwId,
            phone: String(staffMember.phone || ''),
            department: String(staffMember.department || ''),
            assignedMemberCount: 0,
            syncedAt: serverTimestamp(),
            syncedBy: adminUser.email || adminUser.uid
          });
        });
        await batch.commit();
      }

      await loadSyncedStaff();
      toast({
        title: 'Saved to Firestore',
        description: `Saved ${toSave.length} social worker(s).`
      });
    } catch (error: any) {
      console.error('Error saving all to Firestore:', error);
      toast({
        variant: 'destructive',
        title: 'Bulk Save Failed',
        description: error.message || 'Failed to save social workers'
      });
    } finally {
      setIsSavingAll(false);
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
          <Button onClick={() => { loadSocialWorkers(); loadSyncedStaff(); }} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            onClick={saveAllNewToFirestore}
            variant="secondary"
            disabled={isSavingAll || isSyncing}
          >
            {isSavingAll ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save all new
              </>
            )}
          </Button>
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
            <CardTitle className="text-sm font-medium">In Firestore</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {syncedStaff.filter(staff => staff.isInFirestore).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Already saved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New from Caspio</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {syncedStaff.filter(staff => staff.needsSync).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Need to save
            </p>
          </CardContent>
        </Card>

      </div>

      {/* Synced Social Workers */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Social Workers from Caspio ({syncedStaff.length})</CardTitle>
              <CardDescription>
                {syncedStaff.length === 0 ? (
                  <>Click "Load from Caspio" to pull all social workers, then save them one by one to Firestore.</>
                ) : (
                  <>Click "Save to Firestore" for each social worker to add them to the system. Green badge = already in Firestore.</>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Portal access (all)</span>
                <Switch
                  checked={syncedStaff.length > 0 && syncedStaff.every(staff => staff.isPortalActive)}
                  onCheckedChange={(checked) => setAllPortalAccess(checked)}
                  disabled={updatingAllAccess || isCreating || syncedStaff.length === 0}
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
                  Click the "Load from Caspio" button above to pull all social workers from your system.
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
                {syncedStaff.map((staff, idx) => {
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
                          {staff.isInFirestore ? (
                            <Badge className="bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              In Firestore
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-500 text-amber-700">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              New from Caspio
                            </Badge>
                          )}
                          {!staff.isInFirestore && (
                            <Button
                              size="sm"
                              onClick={() => saveToFirestore(staff)}
                              disabled={isCreating}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Save className="h-4 w-4 mr-1" />
                              Save
                            </Button>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Switch
                            checked={staff.isPortalActive}
                            onCheckedChange={(checked) => togglePortalAccess(staff, checked)}
                            disabled={!staffEmail || updatingAccess[staffEmail] || isCreating}
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