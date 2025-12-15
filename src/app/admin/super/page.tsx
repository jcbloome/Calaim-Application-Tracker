'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trash2, UserPlus, Send, Loader2, ShieldPlus } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Timestamp, collection, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useCollection, useUser, useAuth } from '@/firebase';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { createUserWithEmailAndPassword } from 'firebase/auth';


const samplePayload = {
    memberFirstName: 'John',
    memberLastName: 'Doe',
    memberDob: Timestamp.fromDate(new Date('1965-01-15')).toDate(),
    memberAge: 59,
    memberMediCalNum: '912345678',
    confirmMemberMediCalNum: '912345678',
    memberMrn: 'MRN123456789',
    confirmMemberMrn: 'MRN123456789',
    memberLanguage: 'English',
    memberCounty: 'Los Angeles',
    referrerFirstName: 'Admin',
    referrerLastName: 'User',
    referrerEmail: 'admin.user@example.com',
    referrerPhone: '(555) 111-2222',
    referrerRelationship: 'System Admin',
    agency: 'Testing Agency',
    bestContactFirstName: 'Primary',
    bestContactLastName: 'Contact',
    bestContactRelationship: 'Spouse',
    bestContactPhone: '(555) 333-4444',
    bestContactEmail: 'primary@contact.com',
    bestContactLanguage: 'English',
    secondaryContactFirstName: 'Secondary',
    secondaryContactLastName: 'Contact',
    secondaryContactRelationship: 'Child',
    secondaryContactPhone: '(555) 555-6666',
    secondaryContactEmail: 'secondary@contact.com',
    secondaryContactLanguage: 'Spanish',
    hasCapacity: 'Yes',
    hasLegalRep: 'Yes',
    repFirstName: 'Legal',
    repLastName: 'Representative',
    repRelationship: 'Lawyer',
    repPhone: '(555) 777-8888',
    repEmail: 'legal@rep.com',
    repLanguage: 'English',
    isRepPrimaryContact: false,
    currentLocation: 'SNF',
    currentAddress: '123 Test St',
    currentCity: 'Testville',
    currentState: 'CA',
    currentZip: '90210',
    currentCounty: 'Los Angeles',
    copyAddress: false,
    customaryAddress: '456 Home Ave',
    customaryCity: 'Hometown',
    customaryState: 'CA',
    customaryZip: '90211',
    customaryCounty: 'Los Angeles',
    healthPlan: 'Kaiser',
    existingHealthPlan: null,
    switchingHealthPlan: null,
    pathway: 'SNF Transition',
    meetsPathwayCriteria: true,
    snfDiversionReason: null,
    ispFirstName: 'ISP',
    ispLastName: 'Coordinator',
    ispRelationship: 'Care Coordinator',
    ispFacilityName: 'Test Facility',
    ispPhone: '(555) 999-0000',
    ispEmail: 'isp@coordinator.com',
    ispCopyCurrent: false,
    ispLocationType: 'Other',
    ispAddress: '789 ISP Way',
    ispCity: 'Ispville',
    ispState: 'CA',
    ispZip: '90213',
    ispCounty: 'Los Angeles',
    onALWWaitlist: 'No',
    hasPrefRCFE: 'Yes',
    rcfeName: 'Preferred RCFE',
    rcfeAdminName: 'RCFE Admin',
    rcfeAdminPhone: '(555) 123-9876',
    rcfeAdminEmail: 'rcfe@admin.com',
    rcfeAddress: '101 RCFE Blvd',
    id: `test-payload-${Date.now()}`,
    caspioSent: true,
};

interface StaffMember {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Super Admin';
    avatar?: string;
}

const WebhookPreparer = () => {
    const [isSending, setIsSending] = useState(false);
    const { toast } = useToast();

    const handleSendTestWebhook = async () => {
        setIsSending(true);
        const webhookUrl = 'https://hook.us2.make.com/mqif1rouo1wh762k2eze1y7568gwq6kx';
        
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(samplePayload),
            });

            if (!response.ok) throw new Error(`Server responded with ${response.status}`);

            toast({
                title: 'Webhook Sent!',
                description: 'The sample CS Summary data was sent to Make.com.',
                className: 'bg-green-100 text-green-900 border-green-200',
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Webhook Error',
                description: `Failed to send data: ${error.message}`,
            });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Webhook Preparer</CardTitle>
                <CardDescription>Send a sample with all CS Summary fields to Make.com to prepare your scenario for field mapping.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Click the button below to send a test payload. Go to your Make.com scenario, click "Run once", and then come back here and click the button. Make.com will receive the data, allowing you to map the fields to your Caspio module.
                </p>
                <Button onClick={handleSendTestWebhook} disabled={isSending} className="w-full">
                    {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Send Test Payload to Make.com
                </Button>
                <Separator />
                <h4 className="font-semibold">Sample Payload Fields</h4>
                 <ScrollArea className="h-64 border rounded-md p-4 bg-muted/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 text-sm">
                        {Object.entries(samplePayload).map(([key, value]) => (
                            <div key={key} className="flex gap-2">
                                <span className="font-semibold text-primary">{key}:</span>
                                <span className="text-muted-foreground truncate">
                                    {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
                                </span>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};


export default function SuperAdminPage() {
    const firestore = useFirestore();
    const auth = useAuth();
    const { toast } = useToast();
    
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [newStaffFirstName, setNewStaffFirstName] = useState('');
    const [newStaffLastName, setNewStaffLastName] = useState('');
    const [isAddingStaff, setIsAddingStaff] = useState(false);

    const [newSuperAdminEmail, setNewSuperAdminEmail] = useState('');
    const [newSuperAdminFirstName, setNewSuperAdminFirstName] = useState('');
    const [newSuperAdminLastName, setNewSuperAdminLastName] = useState('');
    const [isAddingSuperAdmin, setIsAddingSuperAdmin] = useState(false);

    const usersQuery = useMemo(() => firestore ? collection(firestore, 'users') : null, [firestore]);
    const adminRolesQuery = useMemo(() => firestore ? collection(firestore, 'roles_admin') : null, [firestore]);
    const superAdminRolesQuery = useMemo(() => firestore ? collection(firestore, 'roles_super_admin') : null, [firestore]);

    const { data: users, isLoading: isLoadingUsers } = useCollection(usersQuery);
    const { data: adminRoles, isLoading: isLoadingAdmins } = useCollection(adminRolesQuery);
    const { data: superAdminRoles, isLoading: isLoadingSuperAdmins } = useCollection(superAdminRolesQuery);
    
    const staff = useMemo(() => {
        if (!users || !adminRoles || !superAdminRoles) return [];

        const usersMap = new Map(users.map(u => [u.id, u]));
        const staffList: StaffMember[] = [];

        adminRoles.forEach(role => {
            const user = usersMap.get(role.id);
            if (user) {
                staffList.push({
                    id: user.id,
                    name: user.displayName || `${user.firstName} ${user.lastName}`,
                    email: user.email,
                    role: 'Admin'
                });
            }
        });
        
        superAdminRoles.forEach(role => {
            const user = usersMap.get(role.id);
            if (user) {
                const existingIndex = staffList.findIndex(s => s.id === user.id);
                if (existingIndex > -1) {
                    staffList[existingIndex].role = 'Super Admin';
                } else {
                     staffList.push({
                        id: user.id,
                        name: user.displayName || `${user.firstName} ${user.lastName}`,
                        email: user.email,
                        role: 'Super Admin'
                    });
                }
            }
        });

        return staffList.sort((a,b) => a.name.localeCompare(b.name));
    }, [users, adminRoles, superAdminRoles]);
    
    const isLoadingStaff = isLoadingUsers || isLoadingAdmins || isLoadingSuperAdmins;

    const handleAddRole = async (
        email: string,
        firstName: string,
        lastName: string,
        role: 'Admin' | 'Super Admin',
        setLoading: (loading: boolean) => void
    ) => {
        if (!email || !firstName || !lastName || !firestore || !auth) {
            toast({ variant: "destructive", title: "Missing Information", description: "All fields are required." });
            return;
        }

        setLoading(true);

        try {
            // This is a placeholder password. The user will be expected to reset it.
            // In a real-world scenario, you would send a password reset email.
            const tempPassword = `temp-password-${Date.now()}`;
            
            // 1. Create the user in a temporary auth instance so we don't affect the current user's session
            const { user: newUser } = await createUserWithEmailAndPassword(auth, email, tempPassword);

            // 2. Create the user document in the `users` collection
            const userDocRef = doc(firestore, 'users', newUser.uid);
            await setDoc(userDocRef, {
                id: newUser.uid,
                firstName,
                lastName,
                displayName: `${firstName} ${lastName}`,
                email,
            });

            // 3. Assign the role in the appropriate roles collection
            const roleCollection = role === 'Admin' ? 'roles_admin' : 'roles_super_admin';
            const roleDocRef = doc(firestore, roleCollection, newUser.uid);
            await setDoc(roleDocRef, {
                email,
                role: role.toLowerCase(),
                createdAt: Timestamp.now(),
            });

            toast({ title: `${role} Added`, description: `${email} has been created and given ${role} privileges.` });

            // Clear input fields
            if (role === 'Admin') {
                setNewStaffEmail('');
                setNewStaffFirstName('');
                setNewStaffLastName('');
            } else {
                setNewSuperAdminEmail('');
                setNewSuperAdminFirstName('');
                setNewSuperAdminLastName('');
            }

        } catch (error: any) {
            console.error(`Failed to Add ${role}:`, error);
            const errorMessage = error.code === 'auth/email-already-in-use'
                ? 'A user with this email already exists.'
                : error.message;
            toast({ variant: "destructive", title: `Failed to Add ${role}`, description: errorMessage });
        } finally {
            setLoading(false);
        }
    };
    
    const handleRemoveStaff = async (staffMember: StaffMember) => {
        if (!firestore) return;

        if (staffMember.role === 'Super Admin' && superAdminRoles?.length === 1) {
            toast({
                variant: 'destructive',
                title: 'Action Not Allowed',
                description: 'Cannot remove the only remaining Super Admin.',
            });
            return;
        }

        try {
            if (staffMember.role === 'Admin') {
                await deleteDoc(doc(firestore, 'roles_admin', staffMember.id));
            } else if (staffMember.role === 'Super Admin') {
                await deleteDoc(doc(firestore, 'roles_super_admin', staffMember.id));
            }
            // Note: This does not delete the user from Firebase Auth, only removes their role.
            toast({ title: "Staff Role Removed", description: `${staffMember.email} no longer has the ${staffMember.role} role.` });
        } catch (error: any) {
             toast({ variant: "destructive", title: "Failed to Remove Role", description: error.message });
        }
    };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Super Admin Tools</h1>
        <p className="text-muted-foreground">Manage staff access and system-wide settings.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card>
            <CardHeader>
                <CardTitle>Manage Staff Access</CardTitle>
                <CardDescription>Add or remove staff who can access the admin portal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4 p-4 border rounded-lg">
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
                        <Label htmlFor="add-staff-email">Invite New Staff by Email</Label>
                        <Input 
                            id="add-staff-email" 
                            type="email" 
                            placeholder="new.staff@example.com"
                            value={newStaffEmail}
                            onChange={(e) => setNewStaffEmail(e.target.value)}
                        />
                    </div>
                    <Button onClick={() => handleAddRole(newStaffEmail, newStaffFirstName, newStaffLastName, 'Admin', setIsAddingStaff)} className="w-full" disabled={isAddingStaff}>
                        {isAddingStaff ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                        Add Staff Member
                    </Button>
                </div>

                <Separator />

                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground">Current Staff</h3>
                    <ScrollArea className="h-72">
                         {isLoadingStaff ? (
                            <div className="flex items-center justify-center p-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                         ) : (
                            staff.map(member => (
                                <div key={member.id} className="flex items-center justify-between pr-4 py-2">
                                    <div className="flex items-center gap-4">
                                        <Avatar>
                                            <AvatarImage src={member.avatar} alt={member.name} />
                                            <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-semibold">{member.name}</p>
                                            <p className="text-sm text-muted-foreground">{member.email}</p>
                                        </div>
                                    </div>
                                     <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-muted-foreground">{member.role}</span>
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="text-destructive hover:bg-destructive/10"
                                                    disabled={member.role === 'Super Admin' && superAdminRoles?.length === 1}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Are you sure?</DialogTitle>
                                                    <DialogDescription>
                                                        This will remove <strong>{member.role}</strong> permissions for {member.name}. They may still be able to log in but will not have admin access. This does not delete their user account.
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
                         )}
                    </ScrollArea>
                </div>
            </CardContent>
        </Card>

        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Add Super Admin</CardTitle>
                    <CardDescription>Create a new user with Super Admin privileges.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4 p-4 border rounded-lg">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="superAdminFirstName">First Name</Label>
                                <Input id="superAdminFirstName" value={newSuperAdminFirstName} onChange={e => setNewSuperAdminFirstName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="superAdminLastName">Last Name</Label>
                                <Input id="superAdminLastName" value={newSuperAdminLastName} onChange={e => setNewSuperAdminLastName(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="add-super-admin-email">New Super Admin Email</Label>
                            <Input
                                id="add-super-admin-email"
                                type="email"
                                placeholder="super.admin@example.com"
                                value={newSuperAdminEmail}
                                onChange={(e) => setNewSuperAdminEmail(e.target.value)}
                            />
                        </div>
                        <Button onClick={() => handleAddRole(newSuperAdminEmail, newSuperAdminFirstName, newSuperAdminLastName, 'Super Admin', setIsAddingSuperAdmin)} className="w-full" disabled={isAddingSuperAdmin}>
                            {isAddingSuperAdmin ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldPlus className="mr-2 h-4 w-4" />}
                            Add Super Admin
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <WebhookPreparer />
        </div>

      </div>

    </div>
  );
}
