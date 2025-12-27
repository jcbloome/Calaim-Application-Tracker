
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { addStaff, updateStaffRole } from '@/ai/flows/manage-staff';
import { getNotificationRecipients, updateNotificationRecipients } from '@/ai/flows/manage-notifications';
import { sendReminderEmails } from '@/ai/flows/manage-reminders';
import { sendTestToMake, type TestWebhookInput } from '@/ai/flows/send-to-make-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldAlert, UserPlus, Send, Users, Mail, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { collection, getDocs, DocumentData } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';


interface StaffMember {
    uid: string;
    role: 'Admin' | 'Super Admin';
    firstName: string;
    lastName: string;
    email: string;
}

interface UserData {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
}

// This is the sample data for the Make.com test webhook.
// It is intentionally detailed to simulate a real submission.
const sampleApplicationData: Omit<TestWebhookInput, 'userId'> = {
    memberFirstName: "John",
    memberLastName: "Doe",
    memberDob: "01/15/1965",
    memberAge: 59,
    memberMediCalNum: "987654321A",
    memberMrn: "MRN123456",
    memberLanguage: "English",
    memberCounty: "Los Angeles",
    referrerFirstName: "Jane",
    referrerLastName: "Smith",
    referrerEmail: "jane.smith@example.com",
    referrerPhone: "(555) 123-4567",
    referrerRelationship: "Social Worker",
    agency: "Community Hospital",
    bestContactFirstName: "Jimmy",
    bestContactLastName: "Doe",
    bestContactRelationship: "Son",
    bestContactPhone: "(555) 987-6543",
    bestContactEmail: "jimmy.doe@example.com",
    bestContactLanguage: "English",
    hasCapacity: "Yes",
    hasLegalRep: "No",
    currentLocation: "Hospital",
    currentAddress: "123 Main St",
    currentCity: "Los Angeles",
    currentState: "CA",
    currentZip: "90001",
    currentCounty: "Los Angeles",
    customaryLocationType: "Home",
    customaryAddress: "456 Oak Ave",
    customaryCity: "Pasadena",
    customaryState: "CA",
    customaryZip: "91101",
    customaryCounty: "Los Angeles",
    healthPlan: "Health Net",
    pathway: "SNF Transition",
    meetsPathwayCriteria: true,
    snfDiversionReason: "N/A",
    ispFirstName: "Sarah",
    ispLastName: "Connor",
    ispRelationship: "Case Manager",
    ispPhone: "(555) 111-2222",
    ispEmail: "sconnor@healthnet.com",
    ispLocationType: "Hospital",
    ispAddress: "123 Main St, Los Angeles, CA 90001",
    ispFacilityName: "Community Hospital",
    onALWWaitlist: "No",
    hasPrefRCFE: "Yes",
    rcfeName: "Sunshine Meadows",
    rcfeAddress: "789 Flower Lane, Burbank, CA 91505",
    rcfeAdminName: "Emily White",
    rcfeAdminPhone: "(555) 333-4444",
    rcfeAdminEmail: "emily@sunshinemeadows.com"
};

const DebugInfo = ({ isAdmin, isSuperAdmin, isLoading }: { isAdmin: boolean, isSuperAdmin: boolean, isLoading: boolean }) => (
  <Card className="mb-6 bg-yellow-50 border-yellow-300">
    <CardHeader>
      <CardTitle className="text-lg">Live Debug Status</CardTitle>
      <CardDescription>Current state of the `useAdmin` hook.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-sm text-muted-foreground">isLoading</p>
          <p className="text-lg font-bold">{isLoading ? 'true' : 'false'}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">isAdmin</p>
          <p className="text-lg font-bold">{isAdmin ? 'true' : 'false'}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">isSuperAdmin</p>
          <p className="text-lg font-bold">{isSuperAdmin ? 'true' : 'false'}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function SuperAdminPage() {
    const { isSuperAdmin, isAdmin, isLoading: isAdminLoading, user: currentUser } = useAdmin();
    const router = useRouter();
    const { toast } = useToast();
    const firestore = useFirestore();

    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);
    const [notificationRecipients, setNotificationRecipients] = useState<string[]>([]);
    const [isSavingNotifications, setIsSavingNotifications] = useState(false);
    const [isSendingReminders, setIsSendingReminders] = useState(false);

    // State for new staff form
    const [newStaffFirstName, setNewStaffFirstName] = useState('');
    const [newStaffLastName, setNewStaffLastName] = useState('');
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [isAddingStaff, setIsAddingStaff] = useState(false);
    const [isSendingWebhook, setIsSendingWebhook] = useState(false);

    useEffect(() => {
        if (!isAdminLoading && !isSuperAdmin) {
            router.push('/admin');
        }
    }, [isSuperAdmin, isAdminLoading, router]);

    
    const fetchAllStaff = async () => {
        if (!firestore) {
            return;
        }
        setIsLoadingStaff(true);
        try {
            // Fetch all documents from the relevant collections in parallel
            const [usersSnap, adminRolesSnap, superAdminRolesSnap] = await Promise.all([
                getDocs(collection(firestore, 'users')),
                getDocs(collection(firestore, 'roles_admin')),
                getDocs(collection(firestore, 'roles_super_admin'))
            ]);


            // Create maps for quick lookups
            const users = new Map(usersSnap.docs.map(doc => [doc.id, doc.data() as Omit<UserData, 'id'>]));
            const adminIds = new Set(adminRolesSnap.docs.map(doc => doc.id));
            const superAdminIds = new Set(superAdminRolesSnap.docs.map(doc => doc.id));

            // Combine the data into a single staff list
            const allStaffIds = new Set([...adminIds, ...superAdminIds]);
            const staff: StaffMember[] = [];

            allStaffIds.forEach(uid => {
                const userData = users.get(uid);
                // Only add users who have an admin or super admin role
                if (userData) {
                    staff.push({
                        uid,
                        firstName: userData.firstName,
                        lastName: userData.lastName,
                        email: userData.email,
                        role: superAdminIds.has(uid) ? 'Super Admin' : 'Admin',
                    });
                }
            });
            
            // Sort the final list
            staff.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
            setStaffList(staff);

        } catch (error) {
            console.error("[fetchAllStaff] Error fetching staff list:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not load staff members." });
        } finally {
            setIsLoadingStaff(false);
        }
    };

    useEffect(() => {
        if (firestore && currentUser && isSuperAdmin) {
            const fetchInitialData = async () => {
                await fetchAllStaff();
                try {
                    const result = await getNotificationRecipients({ user: currentUser });
                    setNotificationRecipients(result.uids);
                } catch (error) {
                    console.error("Error fetching notification settings:", error);
                    toast({ variant: "destructive", title: "Error", description: "Could not load notification settings." });
                }
            };
            fetchInitialData();
        }
    }, [firestore, currentUser, isSuperAdmin, toast]);
    
    
    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newStaffEmail || !newStaffFirstName || !newStaffLastName) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill out all fields.' });
            return;
        }
        if (!currentUser) {
            toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in to add staff.' });
            return;
        }
        setIsAddingStaff(true);
        try {
            const result = await addStaff({
                user: currentUser,
                email: newStaffEmail,
                firstName: newStaffFirstName,
                lastName: newStaffLastName,
            });
            toast({
                title: "Staff Added",
                description: result.message,
                className: 'bg-green-100 text-green-900 border-green-200',
            });
            
            // Refetch staff list after adding
            await fetchAllStaff();

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
        if (!currentUser) {
            toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in to change roles.' });
            return;
        }
        const optimisticStaffList = staffList.map(s => s.uid === uid ? {...s, role: isSuperAdmin ? 'Super Admin' as const : 'Admin' as const} : s);
        setStaffList(optimisticStaffList);

        try {
            await updateStaffRole({ user: currentUser, uid, isSuperAdmin });
            toast({
                title: 'Role Updated',
                description: `Successfully ${isSuperAdmin ? 'promoted' : 'demoted'} staff member.`,
            });
        } catch (error: any) {
             // Revert optimistic update
            const revertedStaffList = staffList.map(s => s.uid === uid ? {...s, role: !isSuperAdmin ? 'Super Admin' as const : 'Admin' as const} : s);
            setStaffList(revertedStaffList);
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
        }
    };

    const handleNotificationToggle = (uid: string, checked: boolean) => {
        setNotificationRecipients(prev => 
            checked ? [...prev, uid] : prev.filter(id => id !== uid)
        );
    };

    const handleSaveNotifications = async () => {
        if (!currentUser) {
            toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in to save settings.' });
            return;
        }
        setIsSavingNotifications(true);
        try {
            await updateNotificationRecipients({ user: currentUser, uids: notificationRecipients });
            toast({ title: "Settings Saved", description: "Notification preferences have been updated.", className: 'bg-green-100 text-green-900 border-green-200' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
        } finally {
            setIsSavingNotifications(false);
        }
    };

    
    const handleSendReminders = async () => {
        if (!currentUser) {
            toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in to send reminders.' });
            return;
        }
        setIsSendingReminders(true);
        try {
            const result = await sendReminderEmails({ user: currentUser });
            toast({
                title: 'Reminders Sent!',
                description: `Successfully sent ${result.sentCount} reminder emails.`,
                className: 'bg-green-100 text-green-900 border-green-200',
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Reminder Error',
                description: `Could not send reminders: ${error.message}`
            });
        } finally {
            setIsSendingReminders(false);
        }
    };

    const handleSendWebhookTest = async () => {
        if (!currentUser?.uid) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to run this test.' });
            return;
        }
        setIsSendingWebhook(true);
        try {
            const result = await sendTestToMake({ user: currentUser, data: { ...sampleApplicationData, userId: currentUser.uid } });
            toast({
                title: "Webhook Test Sent",
                description: result.message,
                className: 'bg-green-100 text-green-900 border-green-200',
            });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Webhook Error', description: error.message });
        } finally {
            setIsSendingWebhook(false);
        }
    };

    const formatAndSetFirstName = (value: string) => {
        const formatted = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        setNewStaffFirstName(formatted);
    };

    const formatAndSetLastName = (value: string) => {
        const formatted = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        setNewStaffLastName(formatted);
    };


    if (isAdminLoading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin"/></div>;
    }

    if (!isSuperAdmin) {
         return (
             <>
                <DebugInfo isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isLoading={isAdminLoading} />
                <Alert variant="destructive">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Access Denied</AlertTitle>
                    <AlertDescription>You do not have the required permissions to view this page.</AlertDescription>
                </Alert>
             </>
        );
    }
    
    return (
        <div className="space-y-6">
            <DebugInfo isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} isLoading={isAdminLoading} />
            
             <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Super Admin Tools</CardTitle>
                    <CardDescription>
                        Manage staff, roles, and system integrations from this panel.
                    </CardDescription>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="border-t-4 border-blue-500">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-lg"><Users className="h-5 w-5 text-blue-500" />Staff Management</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-4">
                            <h4 className="font-semibold flex items-center gap-2"><UserPlus className="h-5 w-5" /> Add New Staff</h4>
                            <form onSubmit={handleAddStaff} className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><Label htmlFor="new-staff-firstname">First Name</Label><Input id="new-staff-firstname" value={newStaffFirstName} onChange={e => formatAndSetFirstName(e.target.value)} /></div>
                                    <div><Label htmlFor="new-staff-lastname">Last Name</Label><Input id="new-staff-lastname" value={newStaffLastName} onChange={e => formatAndSetLastName(e.target.value)} /></div>
                                </div>
                                <div><Label htmlFor="new-staff-email">Email Address</Label><Input id="new-staff-email" type="email" value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)} /></div>
                                <Button type="submit" disabled={isAddingStaff} className="w-full">{isAddingStaff ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Adding...</> : 'Add Staff & Grant Admin Role'}</Button>
                            </form>
                        </div>

                         <div className="space-y-4 pt-6 border-t">
                            <h4 className="font-semibold">Current Staff Roles</h4>
                             {isLoadingStaff ? <div className="flex justify-center items-center h-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                            : staffList.length > 0 ? (
                                <div className="space-y-2 max-h-96 overflow-y-auto pr-2">{staffList.map((staff) => (
                                    <div key={staff.uid} className="flex justify-between items-center p-3 border rounded-lg bg-background">
                                        <div><p className="font-semibold">{staff.firstName} {staff.lastName}</p><p className="text-sm text-muted-foreground">{staff.email}</p></div>
                                        <div className="flex items-center gap-4"><span className={`text-sm font-medium ${staff.role === 'Super Admin' ? 'text-primary' : 'text-muted-foreground'}`}>{staff.role}</span><Switch checked={staff.role === 'Super Admin'} onCheckedChange={(checked) => handleRoleToggle(staff.uid, checked)} disabled={staff.uid === currentUser?.uid} aria-label={`Toggle Super Admin for ${staff.email}`} /></div>
                                    </div>
                                ))}</div>
                            ) : <p className="text-center text-muted-foreground py-8">No staff members found.</p>}
                         </div>
                    </CardContent>
                </Card>
                
                <Card className="border-t-4 border-green-500">
                     <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-lg"><Send className="h-5 w-5 text-green-500" />System Actions &amp; Webhooks</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <h4 className="font-semibold">Make.com Webhook Test</h4>
                            <p className="text-sm text-muted-foreground">This action sends a pre-defined sample application to the Make.com webhook URL specified in your environment variables. This is used to test the initial data intake from external forms.</p>
                            <Button onClick={handleSendWebhookTest} disabled={isSendingWebhook} className="w-full">
                                {isSendingWebhook ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Sending...</> : 'Send Test Data to Make.com'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                 <Card className="border-t-4 border-orange-500">
                     <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-lg"><Mail className="h-5 w-5 text-orange-500" />Notifications &amp; Reminders</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-4">
                            <h4 className="font-semibold">Notification Recipient Settings</h4>
                            <p className="text-sm text-muted-foreground">Select staff to be BCC'd on emails when an application status changes.</p>
                             {isLoadingStaff ? <div className="flex justify-center items-center h-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                            : staffList.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="space-y-2 max-h-60 overflow-y-auto p-1 border rounded-md">{staffList.map(staff => (
                                        <div key={staff.uid} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted"><Checkbox id={`notif-${staff.uid}`} checked={notificationRecipients.includes(staff.uid)} onCheckedChange={(checked) => handleNotificationToggle(staff.uid, !!checked)} /><Label htmlFor={`notif-${staff.uid}`} className="flex flex-col cursor-pointer"><span>{staff.firstName} {staff.lastName}</span><span className="text-xs text-muted-foreground">{staff.email}</span></Label></div>
                                    ))}</div>
                                    <Button onClick={handleSaveNotifications} disabled={isSavingNotifications} className="w-full">{isSavingNotifications ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Notification Settings</>}</Button>
                                </div>
                            ) : <p className="text-center text-muted-foreground py-8">No staff members found to configure.</p>}
                         </div>
                        
                         <div className="space-y-4 pt-6 border-t">
                            <h4 className="font-semibold">Manual Email Reminders</h4>
                            <p className="text-sm text-muted-foreground">Trigger reminder emails for all applications that are "In Progress" or "Requires Revision" and have pending items.</p>
                            <Button onClick={handleSendReminders} disabled={isSendingReminders} className="w-full">{isSendingReminders ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : 'Send In-Progress Reminders'}</Button>
                         </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
