'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/firebase';
import { format } from 'date-fns';
import { 
  UserPlus, 
  Users, 
  Eye, 
  Edit, 
  Trash2, 
  Shield, 
  ShieldCheck,
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
  
  const [socialWorkers, setSocialWorkers] = useState<SocialWorkerUser[]>([]);
  const [syncedStaff, setSyncedStaff] = useState<SyncedSocialWorker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedSW, setSelectedSW] = useState<SocialWorkerUser | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // New user form state
  const [newUser, setNewUser] = useState({
    email: '',
    displayName: '',
    password: '',
    confirmPassword: '',
    permissions: {
      visitVerification: true,
      memberQuestionnaire: true,
      claimsSubmission: true
    },
    notes: ''
  });

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
          hasPortalAccess: socialWorkers.some(sw => sw.email === data.email),
          isPortalActive: socialWorkers.find(sw => sw.email === data.email)?.isActive || false,
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
              (staff.email && fs.email === staff.email)
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
        email: String(doc.data().email || '')
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
        const staffEmail = String(staff.email || '').trim();
        
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
          assignedMemberCount: 0,
          hasPortalAccess: socialWorkers.some(sw => sw.email === staffEmail),
          isPortalActive: socialWorkers.find(sw => sw.email === staffEmail)?.isActive || false,
          syncedAt: new Date(),
          isInFirestore: alreadyInFirestore,
          needsSync: !alreadyInFirestore
        };
      });
      
      setSyncedStaff(caspioWithStatus);
      
      const newCount = caspioWithStatus.filter(s => s.needsSync).length;
      const existingCount = caspioWithStatus.filter(s => s.isInFirestore).length;
      
      toast({
        title: 'Loaded from Caspio',
        description: `Found ${caspioStaff.length} social workers. ${newCount} new, ${existingCount} already in Firestore.`
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

  const togglePortalAccess = async (staffMember: SyncedSocialWorker) => {
    if (!firestore || !adminUser) return;
    
    setIsCreating(true);
    try {
      if (staffMember.hasPortalAccess) {
        // Disable portal access
        const existingSW = socialWorkers.find(sw => sw.email === staffMember.email);
        if (existingSW) {
          await updateDoc(doc(firestore, 'socialWorkers', existingSW.uid), {
            isActive: false,
            updatedAt: serverTimestamp(),
            updatedBy: adminUser.email || adminUser.uid
          });
          
          toast({
            title: 'Portal Access Disabled',
            description: `${staffMember.name} can no longer access the SW portal`
          });
        }
      } else {
        // Enable portal access
        if (!staffMember.email || !staffMember.email.includes('@')) {
          toast({
            variant: 'destructive',
            title: 'No Email Address',
            description: `Cannot create portal access for ${staffMember.name} - no valid email address found. Please add email to Caspio first.`
          });
          return;
        }
        
        // Generate a temporary password
        const tempPassword = `SW${Math.random().toString(36).slice(-6)}!`;
        
        // Create Firebase Auth user
        const userCredential = await createUserWithEmailAndPassword(
          auth, 
          staffMember.email, 
          tempPassword
        );

        // Create social worker document
        const socialWorkerData: Omit<SocialWorkerUser, 'uid'> = {
          email: staffMember.email,
          displayName: staffMember.name,
          role: 'social_worker',
          isActive: true,
          createdAt: new Date(),
          createdBy: adminUser.email || adminUser.uid,
          permissions: {
            visitVerification: true,
            memberQuestionnaire: true,
            claimsSubmission: true
          },
          notes: `Synced from Caspio. SW_ID: ${staffMember.sw_id}`,
          assignedMembers: [],
          assignedRCFEs: []
        };

        await setDoc(doc(firestore, 'socialWorkers', userCredential.user.uid), {
          ...socialWorkerData,
          createdAt: serverTimestamp()
        });

        toast({
          title: 'Portal Access Enabled',
          description: `${staffMember.name} can now access the SW portal. Temporary password: ${tempPassword}`,
          duration: 10000 // Show longer so you can copy the password
        });
      }
      
      // Reload lists
      loadSocialWorkers();
      // Update the synced staff status
      setSyncedStaff(current => 
        current.map(staff => 
          staff.sw_id === staffMember.sw_id
            ? { ...staff, hasPortalAccess: !staffMember.hasPortalAccess, isPortalActive: !staffMember.hasPortalAccess }
            : staff
        )
      );
      
    } catch (error: any) {
      console.error('Error toggling portal access:', error);
      
      let errorMessage = 'Failed to toggle portal access';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists';
      }
      
      toast({
        variant: 'destructive',
        title: 'Toggle Failed',
        description: errorMessage
      });
    } finally {
      setIsCreating(false);
    }
  };

  const createSocialWorker = async () => {
    if (!firestore || !adminUser) return;
    
    // Validation
    if (!newUser.email || !newUser.displayName || !newUser.password) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please fill in all required fields'
      });
      return;
    }

    if (newUser.password !== newUser.confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Password Mismatch',
        description: 'Passwords do not match'
      });
      return;
    }

    if (newUser.password.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Password Too Short',
        description: 'Password must be at least 6 characters'
      });
      return;
    }

    setIsCreating(true);
    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        newUser.email, 
        newUser.password
      );

      // Create social worker document
      const socialWorkerData: Omit<SocialWorkerUser, 'uid'> = {
        email: newUser.email,
        displayName: newUser.displayName,
        role: 'social_worker',
        isActive: true,
        createdAt: new Date(),
        createdBy: adminUser.email || adminUser.uid,
        permissions: newUser.permissions,
        notes: newUser.notes,
        assignedMembers: [],
        assignedRCFEs: []
      };

      await setDoc(doc(firestore, 'socialWorkers', userCredential.user.uid), {
        ...socialWorkerData,
        createdAt: serverTimestamp()
      });

      toast({
        title: 'Social Worker Created',
        description: `${newUser.displayName} has been added successfully`
      });

      // Reset form and close dialog
      setNewUser({
        email: '',
        displayName: '',
        password: '',
        confirmPassword: '',
        permissions: {
          visitVerification: true,
          memberQuestionnaire: true,
          claimsSubmission: true
        },
        notes: ''
      });
      setShowCreateDialog(false);
      
      // Reload list
      loadSocialWorkers();
      
    } catch (error: any) {
      console.error('Error creating social worker:', error);
      
      let errorMessage = 'Failed to create social worker';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      }
      
      toast({
        variant: 'destructive',
        title: 'Creation Failed',
        description: errorMessage
      });
    } finally {
      setIsCreating(false);
    }
  };

  const updateSocialWorker = async (swId: string, updates: Partial<SocialWorkerUser>) => {
    if (!firestore) return;
    
    try {
      const swRef = doc(firestore, 'socialWorkers', swId);
      await updateDoc(swRef, {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy: adminUser?.email || adminUser?.uid
      });

      // Update local state
      setSocialWorkers(socialWorkers.map(sw => 
        sw.uid === swId ? { ...sw, ...updates } : sw
      ));

      toast({
        title: 'Updated',
        description: 'Social worker information updated successfully'
      });
      
      setShowEditDialog(false);
      setSelectedSW(null);
      
    } catch (error) {
      console.error('Error updating social worker:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Failed to update social worker'
      });
    }
  };

  const toggleSWStatus = async (swId: string, currentStatus: boolean) => {
    await updateSocialWorker(swId, { isActive: !currentStatus });
  };

  const deleteSocialWorker = async (swId: string, swName: string) => {
    if (!firestore) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete ${swName}? This action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    try {
      await deleteDoc(doc(firestore, 'socialWorkers', swId));
      
      // Remove from local state
      setSocialWorkers(socialWorkers.filter(sw => sw.uid !== swId));
      
      toast({
        title: 'Deleted',
        description: `${swName} has been removed from the system`
      });
      
    } catch (error) {
      console.error('Error deleting social worker:', error);
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: 'Failed to delete social worker'
      });
    }
  };

  const getStatusBadge = (isActive: boolean) => {
    return (
      <Badge variant={isActive ? 'default' : 'secondary'} className={isActive ? 'bg-green-600' : 'bg-gray-500'}>
        {isActive ? 'Active' : 'Inactive'}
      </Badge>
    );
  };

  const refreshSyncedStaffStatus = () => {
    // Update the hasPortalAccess status for all synced staff
    setSyncedStaff(current => 
      current.map(staff => ({
        ...staff,
        hasPortalAccess: socialWorkers.some(sw => sw.email === staff.email),
        isPortalActive: socialWorkers.find(sw => sw.email === staff.email)?.isActive || false
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
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Manual SW
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Manual Social Worker</DialogTitle>
                <DialogDescription>
                  Manually add a social worker not in the Caspio system
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                      placeholder="socialworker@example.com"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="displayName">Full Name *</Label>
                    <Input
                      id="displayName"
                      value={newUser.displayName}
                      onChange={(e) => setNewUser({...newUser, displayName: e.target.value})}
                      placeholder="John Doe"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                      placeholder="Minimum 6 characters"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="confirmPassword">Confirm Password *</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={newUser.confirmPassword}
                      onChange={(e) => setNewUser({...newUser, confirmPassword: e.target.value})}
                      placeholder="Re-enter password"
                    />
                  </div>
                </div>

                {/* Permissions */}
                <div>
                  <Label className="text-sm font-medium">Permissions</Label>
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Visit Verification</span>
                      <Switch
                        checked={newUser.permissions.visitVerification}
                        onCheckedChange={(checked) => 
                          setNewUser({
                            ...newUser, 
                            permissions: {...newUser.permissions, visitVerification: checked}
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Member Questionnaire</span>
                      <Switch
                        checked={newUser.permissions.memberQuestionnaire}
                        onCheckedChange={(checked) => 
                          setNewUser({
                            ...newUser, 
                            permissions: {...newUser.permissions, memberQuestionnaire: checked}
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Claims Submission</span>
                      <Switch
                        checked={newUser.permissions.claimsSubmission}
                        onCheckedChange={(checked) => 
                          setNewUser({
                            ...newUser, 
                            permissions: {...newUser.permissions, claimsSubmission: checked}
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={newUser.notes}
                    onChange={(e) => setNewUser({...newUser, notes: e.target.value})}
                    placeholder="Any additional notes..."
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createSocialWorker} disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <Save className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Create
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>


      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portal Access</CardTitle>
            <UserCheck className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {syncedStaff.filter(staff => staff.hasPortalAccess && staff.isPortalActive).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Can access portal
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Synced Social Workers - Toggle Portal Access */}
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
                  <TableHead>SW_ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Portal Access</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncedStaff.map((staff) => {
                  const portalUser = socialWorkers.find(sw => sw.email === staff.email);
                  
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
                          {staff.sw_id}
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
                          {!staff.isInFirestore && (
                            <Button
                              size="sm"
                              onClick={() => saveToFirestore(staff)}
                              disabled={isCreating}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Save className="h-4 w-4 mr-1" />
                              Save to Firestore
                            </Button>
                          )}
                          {staff.isInFirestore && (
                            <>
                              <div className="flex items-center gap-2">
                                <Label htmlFor={`portal-${staff.id}`} className="text-sm font-normal cursor-pointer">
                                  Enable Portal
                                </Label>
                                <Switch
                                  id={`portal-${staff.id}`}
                                  checked={staff.hasPortalAccess && staff.isPortalActive}
                                  onCheckedChange={() => togglePortalAccess(staff)}
                                  disabled={isCreating || !staff.email || !staff.email.includes('@')}
                                  title={!staff.email || !staff.email.includes('@') ? "Email address required for portal access" : ""}
                                />
                              </div>
                              {portalUser && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedSW(portalUser);
                                    setShowEditDialog(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </>
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

      {/* Existing Portal Users */}
      {socialWorkers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Current SW Portal Users ({socialWorkers.length})</CardTitle>
            <CardDescription>
              Social workers who currently have access to the portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {socialWorkers.map((sw) => (
                  <TableRow key={sw.uid}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-primary" />
                        <div>
                          <div className="font-medium">{sw.displayName}</div>
                          <div className="text-sm text-muted-foreground">
                            {sw.permissions.visitVerification && '✓ Visits'} 
                            {sw.permissions.memberQuestionnaire && ' ✓ Questionnaire'} 
                            {sw.permissions.claimsSubmission && ' ✓ Claims'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {sw.email}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(sw.isActive)}</TableCell>
                    <TableCell>
                      {sw.lastLogin ? format(sw.lastLogin, 'MMM d, yyyy HH:mm') : 'Never'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleSWStatus(sw.uid, sw.isActive)}
                        >
                          {sw.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSW(sw);
                            setShowEditDialog(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteSocialWorker(sw.uid, sw.displayName)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      {selectedSW && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Social Worker</DialogTitle>
              <DialogDescription>
                Update {selectedSW.displayName}'s information
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="editDisplayName">Full Name</Label>
                <Input
                  id="editDisplayName"
                  value={selectedSW.displayName}
                  onChange={(e) => setSelectedSW({...selectedSW, displayName: e.target.value})}
                />
              </div>

              {/* Permissions */}
              <div>
                <Label className="text-sm font-medium">Permissions</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Visit Verification</span>
                    <Switch
                      checked={selectedSW.permissions.visitVerification}
                      onCheckedChange={(checked) => 
                        setSelectedSW({
                          ...selectedSW, 
                          permissions: {...selectedSW.permissions, visitVerification: checked}
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Member Questionnaire</span>
                    <Switch
                      checked={selectedSW.permissions.memberQuestionnaire}
                      onCheckedChange={(checked) => 
                        setSelectedSW({
                          ...selectedSW, 
                          permissions: {...selectedSW.permissions, memberQuestionnaire: checked}
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Claims Submission</span>
                    <Switch
                      checked={selectedSW.permissions.claimsSubmission}
                      onCheckedChange={(checked) => 
                        setSelectedSW({
                          ...selectedSW, 
                          permissions: {...selectedSW.permissions, claimsSubmission: checked}
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="editNotes">Notes</Label>
                <Textarea
                  id="editNotes"
                  value={selectedSW.notes || ''}
                  onChange={(e) => setSelectedSW({...selectedSW, notes: e.target.value})}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={() => updateSocialWorker(selectedSW.uid, selectedSW)}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}