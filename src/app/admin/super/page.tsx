
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { sendTestToMake } from '@/ai/flows/send-to-make-flow';
import { addStaff, updateStaffRole } from '@/ai/flows/manage-staff';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, AlertCircle, ShieldAlert, UserPlus, Send, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { collection, getDocs, doc, onSnapshot, Unsubscribe, DocumentData, query } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';


interface StaffMember {
    uid: string;
    role: 'Admin' | 'Super Admin';
    firstName: string;
    lastName: string;
    email: string;
}

const sampleApplicationData = {
    memberFirstName: 'John',
    memberLastName: 'Doe',
    memberDob: '01/15/1955',
    memberAge: 69,
    memberMediCalNum: '98765432B',
    memberMrn: 'Kaiser-MRN-12345',
    memberLanguage: 'English',
    memberCounty: 'San Diego',
    referrerFirstName: 'Jason',
    referrerLastName: 'Bloome',
    referrerEmail: 'jason@carehomefinders.com',
    referrerPhone: '(555) 111-2222',
    referrerRelationship: 'Consultant',
    agency: 'Connections',
    bestContactFirstName: 'Jane',
    bestContactLastName: 'Doe',
    bestContactRelationship: 'Spouse',
    bestContactPhone: '(555) 333-4444',
    bestContactEmail: 'jane.doe@example.com',
    bestContactLanguage: 'English',
    hasCapacity: 'Yes' as const,
    hasLegalRep: 'No' as const,
    currentLocation: 'Hospital',
    currentAddress: '123 Hospital Dr',
    currentCity: 'Healthcare City',
    currentState: 'CA',
    currentZip: '90210',
    currentCounty: 'Los Angeles',
    customaryLocationType: 'Home',
    customaryAddress: '456 Home St',
    customaryCity: 'Homeville',
    customaryState: 'CA',
    customaryZip: '90211',
    customaryCounty: 'Los Angeles',
    healthPlan: 'Kaiser' as const,
    pathway: 'SNF Diversion' as const,
    meetsPathwayCriteria: true,
    snfDiversionReason: 'At risk of institutionalization, can be cared for in community.',
    ispFirstName: 'Sarah',
    ispLastName: 'Connor',
    ispRelationship: 'SNF Social Worker',
    ispPhone: '(555) 888-9999',
    ispEmail: 's.connor@snf.example.com',
    ispLocationType: 'SNF',
    ispAddress: '123 Skilled Nursing Way, Careville, CA, 90211',
    ispFacilityName: 'General SNF',
    onALWWaitlist: 'No' as const,
    hasPrefRCFE: 'Yes' as const,
    rcfeName: 'Sunshine RCFE',
    rcfeAddress: '789 Community Ln, Happyville, CA, 90212',
    rcfeAdminName: 'Admin Name',
    rcfeAdminPhone: '(555) 777-8888',
    rcfeAdminEmail: 'admin@sunshinercfe.com',
    userId: 'SUPER_ADMIN_TEST_USER'
};


export default function SuperAdminPage() {
    const { isSuperAdmin, isLoading: isAdminLoading, user: currentUser } = useAdmin();
    const router = useRouter();
    const { toast } = useToast();
    const firestore = useFirestore();

    const [isSendingWebhook, setIsSendingWebhook] = useState(false);
    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);

    // State for new staff form
    const [newStaffFirstName, setNewStaffFirstName] = useState('');
    const [newStaffLastName, setNewStaffLastName] = useState('');
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [isAddingStaff, setIsAddingStaff] = useState(false);


    useEffect(() => {
        if (!isAdminLoading && !isSuperAdmin) {
            router.push('/admin');
        }
    }, [isSuperAdmin, isAdminLoading, router]);

    useEffect(() => {
        if (!firestore) return;
        setIsLoadingStaff(true);

        const usersRef = collection(firestore, 'users');
        const adminRolesRef = collection(firestore, 'roles_admin');
        const superAdminRolesRef = collection(firestore, 'roles_super_admin');

        const unsubUsers = onSnapshot(query(usersRef), (usersSnapshot) => {
            const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
            
            onSnapshot(query(adminRolesRef), (adminSnapshot) => {
                const adminIds = new Set(adminSnapshot.docs.map(doc => doc.id));
                
                onSnapshot(query(superAdminRolesRef), (superAdminSnapshot) => {
                     const superAdminIds = new Set(superAdminSnapshot.docs.map(doc => doc.id));

                     const allStaff = usersData
                        .filter(user => adminIds.has(user.id) || superAdminIds.has(user.id))
                        .map(user => ({
                            uid: user.id,
                            firstName: user.firstName,
                            lastName: user.lastName,
                            email: user.email,
                            role: superAdminIds.has(user.id) ? 'Super Admin' : 'Admin',
                        }))
                        .sort((a, b) => a.lastName.localeCompare(b.lastName));

                     setStaffList(allStaff);
                     setIsLoadingStaff(false);
                });
            });
        });
        
        return () => unsubUsers();
    }, [firestore]);
    
    const handleSendWebhook = async () => {
        setIsSendingWebhook(true);
        try {
            const result = await sendTestToMake(sampleApplicationData);
             if (result.success) {
                toast({
                    title: 'Webhook Sent Successfully',
                    description: result.message,
                    className: 'bg-green-100 text-green-900 border-green-200',
                });
            } else {
                 throw new Error(result.message);
            }
        } catch (error: any) {
             toast({
                variant: 'destructive',
                title: 'Webhook Failed',
                description: error.message || 'An unknown error occurred.',
            });
        } finally {
            setIsSendingWebhook(false);
        }
    };
    
    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newStaffEmail || !newStaffFirstName || !newStaffLastName) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill out all fields.' });
            return;
        }
        setIsAddingStaff(true);
        try {
            const result = await addStaff({
                firstName: newStaffFirstName,
                lastName: newStaffLastName,
                email: newStaffEmail
            });
            toast({
                title: "Staff Added",
                description: result.message,
                className: 'bg-green-100 text-green-900 border-green-200',
            });
            setNewStaffFirstName('');
            setNewStaffLastName('');
            setNewStaffEmail('');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error Adding Staff', description: error.message });
        } finally {
            setIsAddingStaff(false);
        }
    };
    
    const handleRoleToggle = async (uid: string, isSuperAdmin: boolean) => {
        const optimisticStaffList = staffList.map(s => s.uid === uid ? {...s, role: isSuperAdmin ? 'Super Admin' : 'Admin'} : s);
        setStaffList(optimisticStaffList);

        try {
            await updateStaffRole({ uid, isSuperAdmin });
            toast({
                title: 'Role Updated',
                description: `Successfully ${isSuperAdmin ? 'promoted' : 'demoted'} staff member.`,
            });
        } catch (error: any) {
            // Revert optimistic update
            setStaffList(staffList);
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
        }
    };


    if (isAdminLoading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin"/></div>;
    }

    if (!isSuperAdmin) {
         return (
            <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Access Denied</AlertTitle>
                <AlertDescription>You do not have the required permissions to view this page.</AlertDescription>
            </Alert>
        );
    }
    
    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Super Admin Tools</CardTitle>
                    <CardDescription>
                        Manage staff, roles, and system integrations from this panel.
                    </CardDescription>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2"><UserPlus className="h-5 w-5" /> Add New Staff Member</CardTitle>
                        </CardHeader>
                         <CardContent>
                            <form onSubmit={handleAddStaff} className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="new-staff-firstname">First Name</Label>
                                        <Input id="new-staff-firstname" value={newStaffFirstName} onChange={e => setNewStaffFirstName(e.target.value)} />
                                    </div>
                                    <div>
                                        <Label htmlFor="new-staff-lastname">Last Name</Label>
                                        <Input id="new-staff-lastname" value={newStaffLastName} onChange={e => setNewStaffLastName(e.target.value)} />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="new-staff-email">Email Address</Label>
                                    <Input id="new-staff-email" type="email" value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)} />
                                </div>
                                <Button type="submit" disabled={isAddingStaff}>
                                    {isAddingStaff ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Adding...</> : 'Add Staff & Grant Admin Role'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                         <CardHeader>
                            <CardTitle className="text-lg">System Actions</CardTitle>
                         </CardHeader>
                         <CardContent className="space-y-6">
                            {/* Webhook Test */}
                             <div>
                                <h4 className="font-medium">Make.com Webhook Test</h4>
                                <p className="text-sm text-muted-foreground mt-1">Send a sample CS Summary Form to your configured webhook URL.</p>
                                <Collapsible className="mt-2">
                                    <CollapsibleTrigger asChild>
                                        <Button variant="outline" size="sm" className="w-full justify-between">
                                            View Webhook Data
                                            <ChevronDown className="h-4 w-4" />
                                        </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        <pre className="mt-2 p-2 bg-muted rounded-md text-xs overflow-x-auto">
                                            {JSON.stringify(sampleApplicationData, null, 2)}
                                        </pre>
                                    </CollapsibleContent>
                                </Collapsible>
                                <Alert variant="warning" className="my-2 text-xs">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>Ensure your webhook URL is set in the `.env` file.</AlertDescription>
                                </Alert>
                                <Button onClick={handleSendWebhook} disabled={isSendingWebhook} variant="secondary">
                                    {isSendingWebhook ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : <><Send className="mr-2 h-4 w-4" /> Send Test Webhook</>}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6" /> Current Staff</CardTitle>
                        <CardDescription>List of users with Admin or Super Admin roles.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingStaff ? (
                            <div className="flex justify-center items-center h-24">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : staffList.length > 0 ? (
                            <div className="space-y-2">
                                {staffList.map((staff) => (
                                    <div key={staff.uid} className="flex justify-between items-center p-3 border rounded-lg">
                                        <div>
                                            <p className="font-semibold">{staff.firstName} {staff.lastName}</p>
                                            <p className="text-sm text-muted-foreground">{staff.email}</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className={`text-sm font-medium ${staff.role === 'Super Admin' ? 'text-primary' : 'text-muted-foreground'}`}>
                                                {staff.role}
                                            </span>
                                            <Switch
                                                checked={staff.role === 'Super Admin'}
                                                onCheckedChange={(checked) => handleRoleToggle(staff.uid, checked)}
                                                disabled={staff.uid === currentUser?.uid}
                                                aria-label={`Toggle Super Admin for ${staff.email}`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-8">No staff members found.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
