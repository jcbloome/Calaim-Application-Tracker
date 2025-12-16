'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trash2, Loader2, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Timestamp,
  collection,
  doc,
  deleteDoc,
  setDoc,
  getDocs,
  writeBatch,
  getDoc,
} from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth, useFirestore, useFirebaseApp } from '@/firebase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { WebhookPreparer } from './WebhookPreparer';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, type Auth } from 'firebase/auth';


interface StaffMember {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  avatar?: string;
}

export default function SuperAdminPage() {
  const firestore = useFirestore();
  const mainApp = useFirebaseApp();
  const { toast } = useToast();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffFirstName, setNewStaffFirstName] = useState('');
  const [newStaffLastName, setNewStaffLastName] = useState('');
  const [isAddingStaff, setIsAddingStaff] = useState(false);

  const fetchStaff = async () => {
    if (!firestore) return;
    setIsLoadingStaff(true);
    try {
      const adminRolesSnap = await getDocs(collection(firestore, 'roles_admin'));
      const superAdminRolesSnap = await getDocs(
        collection(firestore, 'roles_super_admin')
      );

      const adminIds = new Set(adminRolesSnap.docs.map(doc => doc.id));
      const superAdminIds = new Set(superAdminRolesSnap.docs.map(doc => doc.id));
      
      const combinedIds = new Set([...adminIds, ...superAdminIds]);

      const staffListPromises = Array.from(combinedIds).map(async (id) => {
          const userDocRef = doc(firestore, 'users', id);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
              const user = userDocSnap.data();
              return {
                  id: id,
                  name: user.displayName || `${user.firstName} ${user.lastName}`,
                  email: user.email,
                  isSuperAdmin: superAdminIds.has(id),
              };
          }
          // If user doc doesn't exist, we might have an orphaned role.
          // For now, we'll just ignore it, but you could add logic to fetch from auth.
          return null;
      });
      
      const resolvedStaffList = (await Promise.all(staffListPromises))
        .filter((s): s is StaffMember => s !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

      setStaff(resolvedStaffList);

    } catch (error) {
      console.error('Error fetching staff:', error);
      toast({
        variant: 'destructive',
        title: 'Error fetching staff',
        description: 'Could not load the list of current staff members.',
      });
    } finally {
      setIsLoadingStaff(false);
    }
  };


  useEffect(() => {
    fetchStaff();
  }, [firestore, toast]);
  
  const grantAdminRoleInFirestore = async (uid: string, email: string, firstName: string, lastName: string) => {
      if (!firestore) throw new Error("Firestore not available");
      const displayName = `${firstName} ${lastName}`.trim();
      const userDocRef = doc(firestore, 'users', uid);
      const adminRoleRef = doc(firestore, 'roles_admin', uid);
  
      const batch = writeBatch(firestore);
      
      batch.set(userDocRef, {
        id: uid,
        email,
        firstName,
        lastName,
        displayName,
      }, { merge: true });
  
      batch.set(adminRoleRef, { grantedAt: Timestamp.now() });
  
      await batch.commit();
  }
  
  const handleAddStaff = async () => {
    if (!newStaffEmail || !newStaffFirstName || !newStaffLastName) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill out all fields.' });
      return;
    }
    if (!mainApp) {
        toast({ variant: "destructive", title: "Firebase Error", description: "Main Firebase app not initialized." });
        return;
    }
    setIsAddingStaff(true);
  
    let tempApp: FirebaseApp | null = null;
    let tempAuth: Auth | null = null;
  
    try {
      const tempAppName = `temp-auth-app-${Date.now()}`;
      tempApp = initializeApp(mainApp.options, tempAppName);
      tempAuth = getAuth(tempApp);
  
      const userCredential = await createUserWithEmailAndPassword(tempAuth, newStaffEmail, newStaffLastName);
      const uid = userCredential.user.uid;
      
      await grantAdminRoleInFirestore(uid, newStaffEmail, newStaffFirstName, newStaffLastName);
  
      toast({
        title: 'Staff Member Added',
        description: `${newStaffFirstName} ${newStaffLastName} has been granted admin privileges.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
  
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
          toast({
              title: "Existing User Found",
              description: `This user already has an account. Granting them admin permissions now...`,
          });
          // This part is tricky without a backend. The best client-side approach is to inform the super admin.
          // A proper fix requires a server-side function to lookup the user by email.
          // For now, we will just toast and let the user know. A better solution would be a callable function.
           toast({
            variant: "destructive",
            title: "Action Required",
            description: "Could not automatically grant role to existing user. This feature requires a backend function not yet implemented. Please ask for the 'grantAdminRole' flow to be created.",
          });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Add Staff",
          description: error.message || "An unexpected error occurred.",
        });
      }
    } finally {
        if (tempAuth) {
            await signOut(tempAuth);
        }
      setIsAddingStaff(false);
      setNewStaffEmail('');
      setNewStaffFirstName('');
      setNewStaffLastName('');
      await fetchStaff();
    }
  };

  const handleRemoveStaff = async (staffMember: StaffMember) => {
    if (!firestore) return;

    if (staffMember.isSuperAdmin && staff.filter(s => s.isSuperAdmin).length <= 1) {
      toast({
        variant: 'destructive',
        title: 'Action Not Allowed',
        description: 'Cannot remove the only remaining Super Admin.',
      });
      return;
    }

    try {
      const batch = writeBatch(firestore);
      const adminRoleRef = doc(firestore, 'roles_admin', staffMember.id);
      const superAdminRoleRef = doc(firestore, 'roles_super_admin', staffMember.id);

      batch.delete(adminRoleRef);
      if (staffMember.isSuperAdmin) {
        batch.delete(superAdminRoleRef);
      }
      
      await batch.commit();

      setStaff(prev => prev.filter(s => s.id !== staffMember.id));
      toast({
        title: 'Staff Roles Removed',
        description: `${staffMember.email} no longer has admin privileges.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to Remove Roles',
        description: error.message,
      });
    }
  };

  const handleRoleToggle = async (staffMember: StaffMember, isSuper: boolean) => {
    if (!firestore) return;

    if (!isSuper && staffMember.isSuperAdmin && staff.filter(s => s.isSuperAdmin).length <= 1) {
      toast({
        variant: 'destructive',
        title: 'Action Not Allowed',
        description: 'Cannot remove the only remaining Super Admin.',
      });
      await fetchStaff();
      return;
    }

    try {
      if (isSuper) {
        const superAdminDocRef = doc(firestore, 'roles_super_admin', staffMember.id);
        await setDoc(superAdminDocRef, {
          uid: staffMember.id,
          addedOn: Timestamp.now(),
        });
        toast({
          title: 'Role Updated',
          description: `${staffMember.name} is now a Super Admin.`,
        });
      } else {
        await deleteDoc(doc(firestore, 'roles_super_admin', staffMember.id));
        toast({
          title: 'Role Updated',
          description: `${staffMember.name} is now a standard Admin.`,
        });
      }
      setStaff(prev =>
        prev.map(s => (s.id === staffMember.id ? { ...s, isSuperAdmin: isSuper } : s))
      );
    } catch (error: any) {
      console.error('Failed to toggle role:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to Update Role',
        description: error.message,
      });
      await fetchStaff();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Super Admin Tools</h1>
        <p className="text-muted-foreground">
          Manage staff access and system-wide settings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add Staff Member</CardTitle>
              <CardDescription>
                Grant 'Admin' privileges to a user. If the user doesn't have an account, one will be created.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-staff-first-name">First Name</Label>
                  <Input
                    id="new-staff-first-name"
                    placeholder="e.g., Jane"
                    value={newStaffFirstName}
                    onChange={e => setNewStaffFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-staff-last-name">Last Name</Label>
                  <Input
                    id="new-staff-last-name"
                    placeholder="e.g., Doe"
                    value={newStaffLastName}
                    onChange={e => setNewStaffLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-staff-email">Email Address</Label>
                <Input
                  id="new-staff-email"
                  type="email"
                  placeholder="e.g., jane.doe@example.com"
                  value={newStaffEmail}
                  onChange={e => setNewStaffEmail(e.target.value)}
                />
              </div>
              <Button
                onClick={handleAddStaff}
                disabled={isAddingStaff}
                className="w-full"
              >
                {isAddingStaff ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Add Staff Member
              </Button>
            </CardContent>
          </Card>

          <WebhookPreparer />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Current Staff</CardTitle>
            <CardDescription>
              A list of all users with Admin or Super Admin roles. Promote or remove
              staff here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              {isLoadingStaff ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : staff.length > 0 ? (
                staff.map(member => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between pr-4 py-3 border-b last:border-b-0"
                  >
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={member.avatar} alt={member.name} />
                        <AvatarFallback>
                          {member.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold">{member.name}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`super-admin-toggle-${member.id}`}
                          checked={member.isSuperAdmin}
                          onCheckedChange={checked => handleRoleToggle(member, checked)}
                        />
                        <Label htmlFor={`super-admin-toggle-${member.id}`}>
                          Super Admin
                        </Label>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10"
                            disabled={
                              member.isSuperAdmin &&
                              staff.filter(s => s.isSuperAdmin).length <= 1
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Are you sure?</DialogTitle>
                            <DialogDescription>
                              This will revoke all admin privileges for {member.name}.
                              They will not be able to access the admin portal. This
                              does not delete their user account.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button variant="outline">Cancel</Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleRemoveStaff(member)}
                            >
                              Confirm Removal
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  No staff members found.
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}