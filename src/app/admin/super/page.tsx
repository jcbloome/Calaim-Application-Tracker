
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
import { Trash2, Loader2, UserPlus, RefreshCw } from 'lucide-react';
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
import { useFirestore } from '@/firebase';
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
import { syncStaff } from '@/ai/flows/sync-staff';


interface StaffMember {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  avatar?: string;
}

export default function SuperAdminPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

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
    if (firestore) {
      fetchStaff();
    }
  }, [firestore]);
  
  
  const handleSyncStaff = async () => {
    setIsSyncing(true);
    toast({ title: 'Syncing Staff...', description: 'Fetching all users and assigning roles. This may take a moment.' });
    try {
        const result = await syncStaff();
        toast({
            title: 'Sync Complete!',
            description: result.message,
            className: 'bg-green-100 text-green-900 border-green-200',
        });
        await fetchStaff(); // Refresh the list
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Failed to Sync Staff",
            description: error.message || "An unexpected error occurred on the server.",
        });
    } finally {
        setIsSyncing(false);
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
              <CardTitle>Sync Staff from Authentication</CardTitle>
              <CardDescription>
                This will retrieve all users from Firebase Authentication, grant them an 'Admin' role if they don't have one, and add them to the list. Your account will be skipped.
              </CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={handleSyncStaff} disabled={isSyncing} className="w-full">
                    {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Sync All Staff
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
