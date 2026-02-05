'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      const caspioWithStatus = caspioStaff.map((staff: CaspioStaffMember) => {
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
        <div className="flex gap-2">
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
          <CardHeader>
            <CardTitle>Social Workers from Caspio ({syncedStaff.length})</CardTitle>
            <CardDescription>
              {syncedStaff.length === 0 ? (
                <>Click "Load from Caspio" to pull all social workers, then save them one by one to Firestore.</>
              ) : (
                <>Click "Save to Firestore" for each social worker to add them to the system. Green badge = already in Firestore.</>
              )}
            </CardDescription>
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
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncedStaff.map((staff) => {
                  
                  return (
                    <TableRow key={staff.id}>
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
                        <div className="flex items-center gap-2">
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
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {!staff.isInFirestore ? (
                            <Button
                              size="sm"
                              onClick={() => saveToFirestore(staff)}
                              disabled={isCreating}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Save className="h-4 w-4 mr-1" />
                              Save to Firestore
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">Saved</span>
                          )}
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