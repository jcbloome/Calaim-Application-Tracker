
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, ShieldAlert, UserPlus, Send, Users, Mail, Save, Trash2, ShieldCheck, Bell, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { collection, doc, writeBatch, getDocs, setDoc, deleteDoc, getDoc, collectionGroup, query, type Query, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
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
import { ScrollArea } from '@/components/ui/scroll-area';

// CLIENT-SIDE LOGIC - Replaces the need for server-side AI flows for UI data.
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { triggerMakeWebhook } from '@/ai/flows/send-to-make-flow';
import { sendReminderEmails } from '@/ai/flows/manage-reminders';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { sendApplicationStatusEmail } from '@/app/actions/send-email';


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

const sampleApplicationData = {
  // Member Info
  memberFirstName: "John",
  memberLastName: "Doe",
  memberDob: "01/15/1965",
  memberAge: 59,
  memberMediCalNum: "987654321A",
  memberMrn: "MRN123456",
  memberLanguage: "English",
  memberCounty: "Los Angeles",

  // Referrer Info
  referrerFirstName: "Jane",
  referrerLastName: "Smith",
  referrerEmail: "jane.smith@example.com",
  referrerPhone: "(555) 123-4567",
  referrerRelationship: "Social Worker",
  agency: "Community Hospital",

  // Primary Contact
  bestContactFirstName: "Jimmy",
  bestContactLastName: "Doe",
  bestContactRelationship: "Son",
  bestContactPhone: "(555) 987-6543",
  bestContactEmail: "jimmy.doe@example.com",
  bestContactLanguage: "English",
  
  // Secondary Contact
  secondaryContactFirstName: "Carol",
  secondaryContactLastName: "Doe",
  secondaryContactRelationship: "Daughter",
  secondaryContactPhone: "(555) 111-2222",
  secondaryContactEmail: "carol.doe@example.com",
  secondaryContactLanguage: "English",

  // Legal Rep
  hasCapacity: "Yes",
  hasLegalRep: "No",
  repFirstName: null,
  repLastName: null,
  repRelationship: null,
  repPhone: null,
  repEmail: null,

  // Location
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

  // Health Plan & Pathway
  healthPlan: "Health Net",
  existingHealthPlan: null,
  switchingHealthPlan: "N/A",
  pathway: "SNF Transition",
  meetsPathwayCriteria: true,
  snfDiversionReason: null,

  // ISP & RCFE
  ispFirstName: "Sarah",
  ispLastName: "Connor",
  ispRelationship: "Case Manager",
  ispPhone: "(555) 333-4444",
  ispEmail: "sconnor@healthnet.com",
  ispLocationType: "Hospital",
  ispAddress: "123 Main St, Los Angeles, CA 90001",
  ispFacilityName: "Community Hospital",
  onALWWaitlist: "No",
  hasPrefRCFE: "Yes",
  rcfeName: "Sunshine Meadows",
  rcfeAddress: "789 Flower Lane, Burbank, CA 91505",
  rcfeAdminName: "Emily White",
  rcfeAdminPhone: "(555) 555-6666",
  rcfeAdminEmail: "emily@sunshinemeadows.com",
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
    const [webhookLog, setWebhookLog] = useState<string | null>(null);
    const [isCreatingTestApp, setIsCreatingTestApp] = useState(false);

    // New state for test email
    const [testEmail, setTestEmail] = useState('jcbloome@gmail.com');
    const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

    // New: Fetch all applications on the client
    const applicationsQuery = useMemoFirebase(() => {
        if (!firestore || !isSuperAdmin) return null;
        return query(collectionGroup(firestore, 'applications')) as Query<Application & FormValues>;
    }, [firestore, isSuperAdmin]);

    const { data: allApplications, isLoading: isLoadingApplications } = useCollection<Application & FormValues>(applicationsQuery);
    
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
        try {
            // NOTE: This approach is simplified. In a production app, creating users with passwords
            // on the client like this is not recommended. A Cloud Function is the standard practice.
            const tempPassword = Math.random().toString(36).slice(-8);
            const auth = getAuth();
            
            // This is a placeholder to allow UI to function. A proper fix involves Firebase Functions.
            const uid = doc(collection(firestore, 'users')).id;

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
            await fetchAllStaff();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
        }
    };
    
    const handleDeleteStaff = async (uid: string) => {
        if (!firestore) return;

        const batch = writeBatch(firestore);
        
        batch.delete(doc(firestore, 'roles_admin', uid));
        batch.delete(doc(firestore, 'roles_super_admin', uid));
        
        if (notificationRecipients.includes(uid)) {
            const updatedRecipients = notificationRecipients.filter(id => id !== uid);
            batch.set(doc(firestore, 'system_settings', 'notifications'), { recipientUids: updatedRecipients }, { merge: true });
        }

        try {
            await batch.commit();
            
            toast({ title: 'Staff Roles Revoked', description: `Admin permissions have been removed for the user.`, className: 'bg-green-100 text-green-900 border-green-200' });
            
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
        setIsSendingReminders(true);
        
        const appsToRemind = allApplications?.filter(app => 
            (app.status === 'In Progress' || app.status === 'Requires Revision') &&
            app.forms?.some(form => form.status === 'Pending')
        );

        if (!appsToRemind || appsToRemind.length === 0) {
            toast({ title: 'No Reminders Needed', description: 'No applications are currently in a state that requires a reminder.' });
            setIsSendingReminders(false);
            return;
        }

        // The data fetched from Firestore contains complex objects (Timestamps)
        // We need to convert them to plain objects before sending to a server action.
        const plainApps = JSON.parse(JSON.stringify(appsToRemind));

        try {
            const result = await sendReminderEmails(plainApps);
            if (result.success) {
                toast({ title: 'Reminders Sent!', description: `Successfully sent ${result.sentCount} reminder emails.`, className: 'bg-green-100 text-green-900 border-green-200' });
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Reminder Error', description: `Could not send reminders: ${error.message}` });
        } finally {
            setIsSendingReminders(false);
        }
    };

    const handleSendWebhookTest = async () => {
        if (!currentUser?.uid) return;
        setIsSendingWebhook(true);
        setWebhookLog(null);
        try {
            const result = await triggerMakeWebhook(currentUser.uid, { ...sampleApplicationData, userId: currentUser.uid });
            if (result.success) {
                toast({ title: "Webhook Test Sent", description: result.message, className: 'bg-green-100 text-green-900 border-green-200' });
            } else {
                 setWebhookLog(result.message);
                 toast({ variant: 'destructive', title: 'Webhook Error', description: "See log on page for details." });
            }
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setWebhookLog(errorMessage);
            toast({ variant: 'destructive', title: 'Webhook Error', description: "See log on page for details." });
        } finally {
            setIsSendingWebhook(false);
        }
    };

     const handleSendTestEmail = async () => {
        if (!testEmail) {
            toast({ variant: 'destructive', title: 'No Email', description: 'Please enter an email address to send a test to.' });
            return;
        }
        setIsSendingTestEmail(true);
        try {
            await sendApplicationStatusEmail({
                to: testEmail,
                subject: "Resend Integration Test | CalAIM Pathfinder",
                memberName: "Test User",
                staffName: "The Admin Team",
                message: "This is a test email to confirm that the Resend email service is configured correctly.",
                status: 'In Progress',
            });
            toast({
                title: 'Test Email Sent!',
                description: `An email has been sent to ${testEmail}. Please check your inbox.`,
                className: 'bg-green-100 text-green-900 border-green-200',
            });
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Email Send Failed', description: `Could not send test email: ${error.message}` });
        } finally {
            setIsSendingTestEmail(false);
        }
    };

    const handleCreateTestApplication = async () => {
        if (!firestore) return;
        setIsCreatingTestApp(true);
    
        // A placeholder UID for the user who owns the test application.
        // In a real scenario, you would get this after the user signs up.
        // For this test, we can use a hardcoded or randomly generated one.
        const testUserId = "test-user-for-jcbloome";
    
        try {
            const batch = writeBatch(firestore);

            // 1. Create a user document for the test user
            const userDocRef = doc(firestore, 'users', testUserId);
            batch.set(userDocRef, {
                id: testUserId,
                email: "jcbloome@gmail.com",
                firstName: "JC",
                lastName: "Bloome",
                displayName: "JC Bloome",
            });

            // 2. Create the test application document
            const appDocRef = doc(firestore, `users/${testUserId}/applications`, "test-application-123");
            const testAppData: Partial<Application> = {
                id: "test-application-123",
                userId: testUserId,
                memberFirstName: "Testy",
                memberLastName: "McTesterson",
                referrerEmail: "jcbloome@gmail.com",
                referrerName: "JC Bloome",
                status: 'In Progress',
                pathway: 'SNF Transition',
                healthPlan: 'Health Net',
                lastUpdated: serverTimestamp(),
                forms: [
                    { name: 'CS Member Summary', status: 'Completed', type: 'online-form', href: '#' },
                    { name: 'Waivers & Authorizations', status: 'Pending', type: 'online-form', href: '#' },
                    { name: 'Proof of Income', status: 'Pending', type: 'Upload', href: '#' }
                ]
            };
            batch.set(appDocRef, testAppData);
    
            await batch.commit();
    
            toast({
                title: "Test Application Created",
                description: "A dummy application for jcbloome@gmail.com has been added to Firestore.",
                className: 'bg-green-100 text-green-900 border-green-200',
            });
    
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Creation Failed',
                description: `Could not create test application: ${error.message}`
            });
        } finally {
            setIsCreatingTestApp(false);
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-lg"><UserPlus className="h-5 w-5" />Add New Staff</CardTitle>
                        </CardHeader>
                        <CardContent>
                                <form onSubmit={handleAddStaff} className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><Label htmlFor="new-staff-firstname">First Name</Label><Input id="new-staff-firstname" value={newStaffFirstName} onChange={e => formatAndSetFirstName(e.target.value)} /></div>
                                    <div><Label htmlFor="new-staff-lastname">Last Name</Label><Input id="new-staff-lastname" value={newStaffLastName} onChange={e => formatAndSetLastName(e.target.value)} /></div>
                                </div>
                                <div><Label htmlFor="new-staff-email">Email Address</Label><Input id="new-staff-email" type="email" value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)} /></div>
                                <Button type="submit" disabled={isAddingStaff} className="w-full">{isAddingStaff ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Adding...</> : 'Add Staff & Grant Admin Role'}</Button>
                            </form>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-lg"><Mail className="h-5 w-5" />Test Email Integration</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">Send a test email to any address to verify your Resend API key is working.</p>
                            <div className="space-y-2">
                                <Label htmlFor="test-email">Recipient Email</Label>
                                <Input
                                    id="test-email"
                                    type="email"
                                    placeholder="your.email@example.com"
                                    value={testEmail}
                                    onChange={(e) => setTestEmail(e.target.value)}
                                />
                            </div>
                            <Button onClick={handleSendTestEmail} disabled={isSendingTestEmail} className="w-full">
                                {isSendingTestEmail ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : <><Send className="mr-2 h-4 w-4" /> Send Test Email</>}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-lg"><Mail className="h-5 w-5" />Manual Email Reminders</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">Trigger reminder emails for all applications that are "In Progress" or "Requires Revision" and have pending items.</p>
                            <Button onClick={handleSendReminders} disabled={isSendingReminders || isLoadingApplications} className="w-full">{isSendingReminders ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : 'Send In-Progress Reminders'}</Button>
                        </CardContent>
                    </Card>

                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-lg"><Send className="h-5 w-5" />System Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-4">
                                <h4 className="font-semibold">Make.com Webhook Test</h4>
                                <p className="text-sm text-muted-foreground">This action sends a pre-defined sample application to the Make.com webhook URL specified in your environment variables.</p>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button className="w-full" disabled={isSendingWebhook}>
                                            {isSendingWebhook ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Sending...</> : 'Send Test Data to Make.com'}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="max-w-2xl">
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>Confirm Webhook Test Data</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            You are about to send the following sample data to your configured Make.com webhook.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <ScrollArea className="max-h-[50vh] p-4 border rounded-md bg-muted/50">
                                            <pre className="text-xs whitespace-pre-wrap font-mono">
                                                {JSON.stringify(sampleApplicationData, null, 2)}
                                            </pre>
                                        </ScrollArea>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleSendWebhookTest}>
                                            Send Test
                                        </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                                {webhookLog && (
                                    <Alert variant="destructive" className="mt-4">
                                        <AlertTitle>Live Error Log</AlertTitle>
                                        <AlertDescription className="font-mono text-xs break-all">
                                            {webhookLog}
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                             <div className="space-y-4 pt-6 border-t">
                                <h4 className="font-semibold">Create Test Application</h4>
                                <p className="text-sm text-muted-foreground">This creates a sample application assigned to 'jcbloome@gmail.com' with pending forms, perfect for testing the reminder cron job.</p>
                                <Button onClick={handleCreateTestApplication} disabled={isCreatingTestApp} className="w-full">
                                    {isCreatingTestApp ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : <><PlusCircle className="mr-2 h-4 w-4" /> Create Test Application</>}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-lg"><Users className="h-5 w-5" />Current Staff Roles & Notifications</CardTitle>
                        <CardDescription>Manage roles and status email notifications for staff members.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingStaff ? <div className="flex justify-center items-center h-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                        : staffList.length > 0 ? (
                            <div className="space-y-4">{staffList.map((staff) => (
                                <div key={staff.uid} className="flex flex-col gap-4 p-3 border rounded-lg bg-background">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold truncate">{staff.firstName} {staff.lastName}</p>
                                            <p className="text-xs text-muted-foreground break-words">{staff.email}</p>
                                        </div>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" disabled={staff.uid === currentUser?.uid}>
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
                                    <div className="space-y-4 pt-3 border-t">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck className={`h-4 w-4 ${staff.role === 'Super Admin' ? 'text-primary' : 'text-muted-foreground'}`}/>
                                                <Label htmlFor={`superadmin-switch-${staff.uid}`} className="text-sm font-medium">Super Admin</Label>
                                            </div>
                                            <Switch id={`superadmin-switch-${staff.uid}`} checked={staff.role === 'Super Admin'} onCheckedChange={(checked) => handleRoleToggle(staff.uid, checked)} disabled={staff.uid === currentUser?.uid} aria-label={`Toggle Super Admin for ${staff.email}`} />
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2">
                                                <Bell className={`h-4 w-4 ${notificationRecipients.includes(staff.uid) ? 'text-primary' : 'text-muted-foreground'}`} />
                                                <Label htmlFor={`notif-${staff.uid}`} className="text-sm font-medium">Notifications</Label>
                                            </div>
                                            <Checkbox id={`notif-${staff.uid}`} checked={notificationRecipients.includes(staff.uid)} onCheckedChange={(checked) => handleNotificationToggle(staff.uid, !!checked)} aria-label={`Toggle notifications for ${staff.email}`} />
                                        </div>
                                    </div>
                                </div>
                            ))}</div>
                        ) : <p className="text-center text-muted-foreground py-8">No staff members found.</p>}
                    </CardContent>
                    {staffList.length > 0 && (
                        <CardFooter>
                            <Button onClick={handleSaveNotifications} disabled={isSavingNotifications} className="w-full sm:w-auto">
                                {isSavingNotifications ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Notification Settings</>}
                            </Button>
                        </CardFooter>
                    )}
                </Card>
            </div>
            
        </div>
    );
}
