
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trash2, UserPlus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Timestamp, collection, doc, deleteDoc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useUser, useAuth } from '@/firebase';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Switch } from '@/components/ui/switch';
import { WebhookPreparer } from './WebhookPreparer';


interface StaffMember {
    id: string;
    name: string;
    email: string;
    isSuperAdmin: boolean;
    avatar?: string;
}

export default function SuperAdminPage() {
    const firestore = useFirestore();
    const auth = useAuth();
    const { toast } = useToast();
    
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [newStaffFirstName, setNewStaffFirstName] = useState('');
    const [newStaffLastName, setNewStaffLastName] = useState('');
    const [isAddingStaff, setIsAddingStaff] = useState(false);
    
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);

    const fetchStaff = async () => {
        if (!firestore) return;
        setIsLoadingStaff(true);
        try {
            const adminRolesSnap = await getDocs(collection(firestore, 'roles_admin'));
            const superAdminRolesSnap = await getDocs(collection(firestore, 'roles_super_admin'));

            const adminIds = new Set(adminRolesSnap.docs.map(doc => doc.id));
            const superAdminIds = new Set(superAdminRolesSnap.docs.map(doc => doc.id));
            
            const allRoleIds = [...new Set([...Array.from(adminIds), ...Array.from(superAdminIds)])];

            if (allRoleIds.length === 0) {
                setStaff([]);
                setIsLoadingStaff(false);
                return;
            }
            
            const usersQuery = query(collection(firestore, 'users'), where('id', 'in', allRoleIds));
            const usersSnap = await getDocs(usersQuery);
            
            const userMap = new Map();
            usersSnap.forEach(doc => userMap.set(doc.id, doc.data()));

            const staffList = allRoleIds.map(id => {
                const user = userMap.get(id);
                if (!user) return null;
                
                return {
                    id: id,
                    name: user.displayName || `${user.firstName} ${user.lastName}`,
                    email: user.email,
                    isSuperAdmin: superAdminIds.has(id),
                };
            }).filter((s): s is StaffMember => s !== null).sort((a,b) => a.name.localeCompare(b.name));

            setStaff(staffList);

        } catch (error) {
            console.error("Error fetching staff:", error);
            toast({
                variant: "destructive",
                title: "Error fetching staff",
                description: "Could not load the list of current staff members."
            });
        } finally {
            setIsLoadingStaff(false);
        }
    };

    useEffect(() => {
        fetchStaff();
    }, [firestore]);


    const handleAddStaff = async () => {
        if (!newStaffEmail || !newStaffFirstName || !newStaffLastName || !firestore || !auth) {
            toast({ variant: "destructive", title: "Missing Information", description: "All fields are required." });
            return;
        }
    
        setIsAddingStaff(true);
    
        try {
            let uid: string | null = null;
    
            // Check if user already exists in the `users` collection in Firestore
            const existingUsersQuery = query(collection(firestore, 'users'), where('email', '==', newStaffEmail));
            const existingUsersSnap = await getDocs(existingUsersQuery);
            
            if (!existingUsersSnap.empty) {
                // User document exists in Firestore, grant admin role
                uid = existingUsersSnap.docs[0].id;
                toast({ title: "Existing User Found", description: `Granting Admin role to ${newStaffEmail}.`});
            } else {
                // No user document in Firestore, attempt to create a new user in Auth
                const tempPassword = `temp-password-${Date.now()}`;
                try {
                    const { user: newUser } = await createUserWithEmailAndPassword(auth, newStaffEmail, tempPassword);
                    uid = newUser.uid;
                    // Also create their user profile document
                    const userDocRef = doc(firestore, 'users', uid);
                    await setDoc(userDocRef, {
                        id: uid,
                        firstName: newStaffFirstName,
                        lastName: newStaffLastName,
                        displayName: `${newStaffFirstName} ${newStaffLastName}`,
                        email: newStaffEmail,
                    });
                } catch (error: any) {
                    if (error.code === 'auth/email-already-in-use') {
                       // This is the edge case: user exists in Auth but not Firestore.
                       // We can't get their UID directly from the client, so we must ask for a manual fix for now.
                       // A more advanced solution would involve a server-side function to look up user by email.
                       throw new Error("This email is registered in Firebase Auth but not in the 'users' collection. Please resolve manually in Firebase Console.");
                    }
                    throw error;
                }
            }
    
            if (!uid) throw new Error("Could not get user ID.");
    
            // Grant the standard Admin role
            const adminRoleDocRef = doc(firestore, 'roles_admin', uid);
            await setDoc(adminRoleDocRef, { uid: uid, addedOn: Timestamp.now() });
    
            toast({
                title: `Admin Role Granted`,
                description: `${newStaffEmail} has been granted Admin privileges.`,
                className: 'bg-green-100 text-green-900 border-green-200',
            });

            // Refresh the staff list
            await fetchStaff();
            
            setNewStaffEmail('');
            setNewStaffFirstName('');
            setNewStaffLastName('');
    
        } catch (error: any) {
            console.error(`Failed to Add Staff:`, error);
            toast({ variant: "destructive", title: `Failed to Add Staff`, description: error.message });
        } finally {
            setIsAddingStaff(false);
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
            // Remove both admin and super_admin roles to fully revoke access
            await deleteDoc(doc(firestore, 'roles_admin', staffMember.id));
            await deleteDoc(doc(firestore, 'roles_super_admin', staffMember.id));

            setStaff(prev => prev.filter(s => s.id !== staffMember.id));
            toast({ title: "Staff Roles Removed", description: `${staffMember.email} no longer has admin privileges.` });
        } catch (error: any) {
             toast({ variant: "destructive", title: "Failed to Remove Roles", description: error.message });
        }
    };

    const handleRoleToggle = async (staffMember: StaffMember, isSuper: boolean) => {
        if (!firestore) return;
    
        // Prevent removing the last Super Admin
        if (!isSuper && staffMember.isSuperAdmin && staff.filter(s => s.isSuperAdmin).length <= 1) {
            toast({
                variant: 'destructive',
                title: 'Action Not Allowed',
                description: 'Cannot remove the only remaining Super Admin.',
            });
            // Re-fetch to reset the toggle in the UI
            await fetchStaff(); 
            return;
        }
    
        try {
            if (isSuper) {
                // Grant Super Admin
                const superAdminDocRef = doc(firestore, 'roles_super_admin', staffMember.id);
                await setDoc(superAdminDocRef, { uid: staffMember.id, addedOn: Timestamp.now() });
                toast({ title: "Role Updated", description: `${staffMember.name} is now a Super Admin.` });
            } else {
                // Revoke Super Admin
                await deleteDoc(doc(firestore, 'roles_super_admin', staffMember.id));
                toast({ title: "Role Updated", description: `${staffMember.name} is now a standard Admin.` });
            }
            // Update local state to reflect the change immediately
            setStaff(prev => prev.map(s => s.id === staffMember.id ? { ...s, isSuperAdmin: isSuper } : s));
    
        } catch (error: any) {
            console.error("Failed to toggle role:", error);
            toast({ variant: "destructive", title: "Failed to Update Role", description: error.message });
            // Re-fetch to reset the UI on error
            await fetchStaff();
        }
    };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Super Admin Tools</h1>
        <p className="text-muted-foreground">Manage staff access and system-wide settings.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Add Staff Member</CardTitle>
                    <CardDescription>Grant standard Admin privileges to a new or existing user. You can grant Super Admin privileges from the staff list after they are added.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="firstName">First Name</Label>
                              <Input id="firstName" value={newStaffFirstName} onChange={e => setNewStaffFirstName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="lastName">Last Name</Label>
                              <Input id="lastName" value={newStaffLastName} onChange={e => setNewStaffLastName(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="add-staff-email">Staff Email</Label>
                            <Input 
                                id="add-staff-email" 
                                type="email" 
                                placeholder="new.staff@example.com"
                                value={newStaffEmail}
                                onChange={(e) => setNewStaffEmail(e.target.value)}
                            />
                        </div>
                        <Button onClick={handleAddStaff} className="w-full" disabled={isAddingStaff}>
                            {isAddingStaff ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                            Add Staff Member
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <WebhookPreparer />
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Current Staff</CardTitle>
                <CardDescription>A list of all users with Admin or Super Admin roles.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-96">
                     {isLoadingStaff ? (
                        <div className="flex items-center justify-center p-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                     ) : staff.length > 0 ? (
                        staff.map(member => (
                            <div key={member.id} className="flex items-center justify-between pr-4 py-3 border-b last:border-b-0">
                                <div className="flex items-center gap-4">
                                    <Avatar>
                                        <AvatarImage src={member.avatar} alt={member.name} />
                                        <AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback>
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
                                            onCheckedChange={(checked) => handleRoleToggle(member, checked)}
                                        />
                                        <Label htmlFor={`super-admin-toggle-${member.id}`}>Super Admin</Label>
                                    </div>
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button
                                                variant="ghost" 
                                                size="icon" 
                                                className="text-destructive hover:bg-destructive/10"
                                                disabled={member.isSuperAdmin && staff.filter(s => s.isSuperAdmin).length <= 1}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Are you sure?</DialogTitle>
                                                <DialogDescription>
                                                    This will revoke all admin privileges for {member.name}. They will not be able to access the admin portal. This does not delete their user account.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <DialogFooter>
                                                <Button variant="outline">Cancel</Button>
                                                <Button variant="destructive" onClick={() => handleRemoveStaff(member)}>Confirm Removal</Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>
                        ))
                     ) : (
                        <div className="text-center text-muted-foreground p-8">No staff members found.</div>
                     )}
                </ScrollArea>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
