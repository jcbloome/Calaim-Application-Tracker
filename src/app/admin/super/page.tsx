
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldAlert, UserPlus, Send, Users, Mail, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { collection, doc, writeBatch, getDocs, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

// CLIENT-SIDE LOGIC - Replaces the need for server-side AI flows for UI data.
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { sendTestToMake, type TestWebhookInput } from '@/ai/flows/send-to-make-flow';
import { sendReminderEmails } from '@/ai/flows/manage-reminders';


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
    const [newStaffFirstName, setNewStaffFirstName] = useState('');
    const [newStaffLastName, setNewStaffLastName] = useState('');
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [isAddingStaff, setIsAddingStaff] = useState(false);
    const [isSendingWebhook, setIsSendingWebhook] = useState(false);
    
    // This function now runs on the client, directly interacting with Firestore
    const fetchAllStaff = async () => {
        if (!firestore) return;
        setIsLoadingStaff(true);
        try {
            const [usersSnap, adminRolesSnap, superAdminRolesSnap] = await Promise.all([
                getDocs(collection(firestore, 'users')),
                getDocs(collection(firestore, 'roles_admin')),
                getDocs(collection(firestore, 'roles_super_admin'))
            ]);

            const users = new Map(usersSnap.docs.map(doc => [doc.id, doc.data() as Omit<UserData, 'id'>]));
            const adminIds = new Set(adminRolesSnap.docs.map(doc => doc.id));
            const superAdminIds = new Set(superAdminRolesSnap.docs.map(doc => doc.id));

            const allStaffIds = new Set([...adminIds, ...superAdminIds]);
            const staff: StaffMember[] = [];

            allStaffIds.forEach(uid => {
                const userData = users.get(uid);
                if (userData && (adminIds.has(uid) || superAdminIds.has(uid))) {
                    staff.push({
                        uid,
                        firstName: userData.firstName,
                        lastName: userData.lastName,
                        email: userData.email,
                        role: superAdminIds.has(uid) ? 'Super Admin' : 'Admin',
                    });
                }
            });
            
            staff.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
            setStaffList(staff);
        } catch (error) {
            console.error("[fetchAllStaff] Error:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not load staff members." });
        } finally {
            setIsLoadingStaff(false);
        }
    };
    
    // This function also runs on the client
    const fetchNotificationRecipients = async () => {
        if (!firestore) return;
        try {
            const settingsRef = doc(firestore, 'system_settings', 'notifications');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
                setNotificationRecipients(docSnap.data()?.recipientUids || []);
            }
        } catch (error) {
             console.error("Error fetching notification settings:", error);
             toast({ variant: "destructive", title: "Error", description: "Could not load notification settings." });
        }
    };

    useEffect(() => {
        if (!isAdminLoading && !isSuperAdmin) {
            router.push('/admin');
        }
    }, [isSuperAdmin, isAdminLoading, router]);

    useEffect(() => {
        if (isSuperAdmin && firestore) {
            fetchAllStaff();
            fetchNotificationRecipients();
        }
    }, [isSuperAdmin, firestore]);

    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore) return;
        if (!newStaffEmail || !newStaffFirstName || !newStaffLastName) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill out all fields.' });
            return;
        }
        setIsAddingStaff(true);
        // This is a simplified client-side version. A more robust solution would use a Firebase Function
        // to create the user to avoid needing a temporary password on the client.
        // For this context, we will assume a simplified (but less secure) client-side creation.
        try {
            // NOTE: This approach is simplified. In a production app, creating users with passwords
            // on the client like this is not recommended. A Cloud Function is the standard practice.
            const tempPassword = Math.random().toString(36).slice(-8);
            const auth = getAuth();
            // We can't create users directly on the client without special privileges.
            // This will fail unless the rules are open, which they are not.
            // A server-side flow (Firebase Function) is required for this.
            
            // For now, let's just create the DB records, assuming user is created manually or via another process.
            // This is a placeholder to allow UI to function. A proper fix involves Firebase Functions.
            const uid = doc(collection(firestore, 'users')).id; // Placeholder UID

            const batch = writeBatch(firestore);
            const userDocRef = doc(firestore, 'users', uid);
            batch.set(userDocRef, {
                id: uid,
                email: newStaffEmail,
                firstName: newStaffFirstName,
                lastName: newStaffLastName,
                displayName: `${newStaffFirstName} ${newStaffLastName}`
            });

            const adminRoleRef = doc(firestore, 'roles_admin', uid);
            batch.set(adminRoleRef, { grantedAt: new Date() });

            await batch.commit();

            toast({
                title: "Staff Records Created",
                description: `Created DB entries for ${newStaffEmail}. Auth user must be created separately.`,
                className: 'bg-green-100 text-green-900 border-green-200',
            });
            
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
        if (!firestore) return;
        const superAdminRoleRef = doc(firestore, 'roles_super_admin', uid);
        
        try {
            if (isSuperAdmin) {
                await setDoc(superAdminRoleRef, { grantedAt: new Date() });
            } else {
                await deleteDoc(superAdminRoleRef);
            }
            toast({ title: 'Role Updated', description: `Successfully updated role.` });
            await fetchAllStaff(); // Refetch to update the UI state from the source of truth
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
        }
    };
    
    const handleDeleteStaff = async (uid: string) => {
        if (!firestore) return;

        const batch = writeBatch(firestore);
        
        // Remove roles
        batch.delete(doc(firestore, 'roles_admin', uid));
        batch.delete(doc(firestore, 'roles_super_admin', uid));
        
        // Remove from notification recipients list if present
        if (notificationRecipients.includes(uid)) {
            const updatedRecipients = notificationRecipients.filter(id => id !== uid);
            batch.set(doc(firestore, 'system_settings', 'notifications'), { recipientUids: updatedRecipients }, { merge: true });
        }

        try {
            await batch.commit();
            
            // Note: Deleting the 'users' document and the Firebase Auth user is a more destructive action
            // and is omitted here for safety. This action primarily revokes permissions.
            // await deleteDoc(doc(firestore, 'users', uid));

            toast({ title: 'Staff Roles Revoked', description: `Admin permissions have been removed for the user.`, className: 'bg-green-100 text-green-900 border-green-200' });
            
            // Refresh data from Firestore
            await fetchAllStaff();
            await fetchNotificationRecipients();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Delete Failed', description: error.message });
        }
    };


    const handleNotificationToggle = (uid: string, checked: boolean) => {
        setNotificationRecipients(prev => 
            checked ? [...prev, uid] : prev.filter(id => id !== uid)
        );
    };

    const handleSaveNotifications = async () => {
        if (!firestore) return;
        setIsSavingNotifications(true);
        try {
            const settingsRef = doc(firestore, 'system_settings', 'notifications');
            await setDoc(settingsRef, { recipientUids: notificationRecipients }, { merge: true });
            toast({ title: "Settings Saved", description: "Notification preferences updated.", className: 'bg-green-100 text-green-900 border-green-200' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
        } finally {
            setIsSavingNotifications(false);
        }
    };

    const handleSendReminders = async () => {
        if (!currentUser) return;
        setIsSendingReminders(true);
        try {
            const result = await sendReminderEmails({ user: currentUser });
            toast({ title: 'Reminders Sent!', description: `Successfully sent ${result.sentCount} reminder emails.`, className: 'bg-green-100 text-green-900 border-green-200' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Reminder Error', description: `Could not send reminders: ${error.message}` });
        } finally {
            setIsSendingReminders(false);
        }
    };

    const handleSendWebhookTest = async () => {
        if (!currentUser?.uid) return;
        setIsSendingWebhook(true);
        try {
            const result = await sendTestToMake({ user: currentUser, data: { ...sampleApplicationData, userId: currentUser.uid } });
            toast({ title: "Webhook Test Sent", description: result.message, className: 'bg-green-100 text-green-900 border-green-200' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Webhook Error', description: error.message });
        } finally {
            setIsSendingWebhook(false);
        }
    };

    const formatAndSetFirstName = (value: string) => setNewStaffFirstName(value.charAt(0).toUpperCase() + value.slice(1).toLowerCase());
    const formatAndSetLastName = (value: string) => setNewStaffLastName(value.charAt(0).toUpperCase() + value.slice(1).toLowerCase());

    if (isAdminLoading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin"/></div>;
    }

    if (!isSuperAdmin) {
         return (
             <>
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
                                    <div key={staff.uid} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 border rounded-lg bg-background">
                                        <div className="flex-1 flex flex-col min-w-0">
                                            <p className="font-semibold truncate">{staff.firstName} {staff.lastName}</p>
                                            <p className="text-sm text-muted-foreground truncate">{staff.email}</p>
                                        </div>
                                        <div className="flex items-center gap-4 shrink-0">
                                            <span className={`text-sm font-medium ${staff.role === 'Super Admin' ? 'text-primary' : 'text-muted-foreground'}`}>{staff.role}</span>
                                            <Switch checked={staff.role === 'Super Admin'} onCheckedChange={(checked) => handleRoleToggle(staff.uid, checked)} disabled={staff.uid === currentUser?.uid} aria-label={`Toggle Super Admin for ${staff.email}`} />
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={staff.uid === currentUser?.uid}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete Staff Member?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This will revoke all admin permissions for {staff.email}. This action does not delete their auth account but prevents them from accessing admin areas. Are you sure?
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteStaff(staff.uid)} className="bg-destructive hover:bg-destructive/90">
                                                            Yes, Revoke Access
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
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
