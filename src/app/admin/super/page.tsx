
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, ShieldAlert, UserPlus, Send, Users, Mail, Save, Trash2, ShieldCheck, Bell, PlusCircle, Beaker, FileWarning, CheckCircle, Clock, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { collection, doc, writeBatch, getDocs, setDoc, deleteDoc, getDoc, collectionGroup, query, where, type Query, serverTimestamp, addDoc, orderBy } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { NotificationManager } from '@/components/NotificationManager';
import NotificationSettings from '@/components/NotificationSettings';
import LoginActivityTracker from '@/components/LoginActivityTracker';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';


// CLIENT-SIDE LOGIC - Replaces the need for server-side AI flows for UI data.
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';


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

interface TestResult {
    testName: string;
    status: 'success' | 'error';
    message: string;
}

interface LoginLog {
    id: string;
    userId: string;
    email: string;
    displayName: string;
    role: 'Admin' | 'User';
    timestamp: any;
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
  hasLegalRep: "Yes",
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

// Helper function to create a temporary, secondary Firebase instance
const createTempAuth = () => {
    const tempAppName = `temp-auth-app-${Date.now()}`;
    const tempApp = initializeApp(firebaseConfig, tempAppName);
    return getAuth(tempApp);
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

    const [testEmail, setTestEmail] = useState('jcbloome@gmail.com');
    const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

    // Firestore test suite state
    const [isLoadingTest, setIsLoadingTest] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<TestResult[]>([]);
    const [testDocId, setTestDocId] = useState<string | null>(null);

    const applicationsQuery = useMemoFirebase(() => {
        if (isAdminLoading || !firestore || !currentUser) {
          return null;
        }
        return query(collectionGroup(firestore, 'applications')) as Query<Application & FormValues>;
    }, [firestore, isAdminLoading, currentUser]);

    const loginLogsQuery = useMemoFirebase(() => {
        // Temporarily disabled to fix permissions issue
        return null;
        // if (isAdminLoading || !firestore || !isSuperAdmin) return null;
        // return query(collection(firestore, 'loginLogs'), orderBy('timestamp', 'desc'));
    }, [firestore, isAdminLoading, isSuperAdmin]);

    const { data: allApplications, isLoading: isLoadingApplications } = useCollection<Application & FormValues>(applicationsQuery);
    const { data: loginLogs, isLoading: isLoadingLoginLogs } = useCollection<LoginLog>(loginLogsQuery);
    
    const fetchAllStaff = async () => {
        if (!firestore || !currentUser) return;
        setIsLoadingStaff(true);
        try {
            const usersCollectionRef = collection(firestore, 'users');
            const adminRolesCollectionRef = collection(firestore, 'roles_admin');
            const superAdminRolesCollectionRef = collection(firestore, 'roles_super_admin');

            const [usersSnap, adminRolesSnap, superAdminRolesSnap] = await Promise.all([
                getDocs(usersCollectionRef),
                getDocs(adminRolesCollectionRef).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: adminRolesCollectionRef.path, operation: 'list' }));
                    throw e;
                }),
                getDocs(superAdminRolesCollectionRef).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: superAdminRolesCollectionRef.path, operation: 'list' }));
                    throw e;
                }),
            ]);

            const users = new Map(usersSnap.docs.map(doc => [doc.id, doc.data() as Omit<UserData, 'id'>]));
            const adminIds = new Set(adminRolesSnap.docs.map(doc => doc.id));
            const superAdminIds = new Set(superAdminRolesSnap.docs.map(doc => doc.id));
            
            const allStaffIds = new Set([...adminIds, ...superAdminIds]);
            
            // Always ensure the hardcoded admin is in the set to be processed.
            if (currentUser.email === 'jason@carehomefinders.com' && !allStaffIds.has(currentUser.uid)) {
              allStaffIds.add(currentUser.uid);
            }

            const staff: StaffMember[] = [];
            
            allStaffIds.forEach(uid => {
                const userData = users.get(uid);
                const isSuper = superAdminIds.has(uid) || (uid === currentUser?.uid && currentUser?.email === 'jason@carehomefinders.com');
                
                let firstName = userData?.firstName || 'Jason';
                let lastName = userData?.lastName || 'Bloome';
                let email = userData?.email || 'jason@carehomefinders.com';
                
                staff.push({
                    uid,
                    firstName,
                    lastName,
                    email,
                    role: isSuper ? 'Super Admin' : 'Admin',
                });
            });
            
            staff.sort((a, b) => {
                // Super Admins first, then regular Admins
                if (a.role === 'Super Admin' && b.role !== 'Super Admin') return -1;
                if (b.role === 'Super Admin' && a.role !== 'Super Admin') return 1;
                // Within same role, sort by last name
                return (a.lastName || '').localeCompare(b.lastName || '');
            });
            setStaffList(staff);
        } catch (error) {
            console.error("[fetchAllStaff] Error:", error);
        } finally {
            setIsLoadingStaff(false);
        }
    };
    
    const fetchNotificationRecipients = async () => {
        if (!firestore) return;
        try {
            const settingsRef = doc(firestore, 'system_settings', 'notifications');
            const docSnap = await getDoc(settingsRef).catch(e => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: settingsRef.path, operation: 'get' }));
                throw e;
            });

            if (docSnap.exists()) {
                setNotificationRecipients(docSnap.data()?.recipientUids || []);
            }
        } catch (error) {
             console.error("Error fetching notification settings:", error);
        }
    };

    useEffect(() => {
        if (!isAdminLoading && firestore && (isSuperAdmin || isAdmin)) {
            fetchAllStaff();
            fetchNotificationRecipients();
        }
    }, [firestore, isSuperAdmin, isAdmin, isAdminLoading, currentUser]);

    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !currentUser) return;
        if (!newStaffEmail || !newStaffFirstName || !newStaffLastName) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill out all fields.' });
            return;
        }
        setIsAddingStaff(true);

        const tempAuth = createTempAuth();
        const tempPassword = Math.random().toString(36).slice(-8);

        try {
            // 1. Create user in the temporary auth instance
            const userCredential = await createUserWithEmailAndPassword(tempAuth, newStaffEmail, tempPassword);
            const newUid = userCredential.user.uid;
            
            // 2. Sign out the temporary user immediately
            await signOut(tempAuth);

            // 3. As the logged-in admin, create the necessary Firestore documents
            const batch = writeBatch(firestore);
            
            // User document
            const userDocRef = doc(firestore, 'users', newUid);
            const displayName = `${newStaffFirstName} ${newStaffLastName}`.trim();
            batch.set(userDocRef, {
                id: newUid,
                email: newStaffEmail,
                firstName: newStaffFirstName,
                lastName: newStaffLastName,
                displayName: displayName,
            });

            // Admin role document
            const adminRoleRef = doc(firestore, 'roles_admin', newUid);
            batch.set(adminRoleRef, { grantedAt: serverTimestamp() });
            
            // 4. Commit the batch
            await batch.commit();

            toast({
                title: "Staff Member Added!",
                description: `${newStaffEmail} has been created and granted Admin permissions. They will need to reset their password to log in.`,
                duration: 7000,
                className: 'bg-green-100 text-green-900 border-green-200',
            });
            
            await fetchAllStaff();
            setNewStaffFirstName('');
            setNewStaffLastName('');
            setNewStaffEmail('');

        } catch (error: any) {
            let errorMessage = "An unexpected error occurred.";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "A user with this email already exists.";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "The temporary password generated was too weak. Please try again.";
            }
             else if (error.code === 'permission-denied') {
                errorMessage = "Permission denied. Your account may not have the rights to create new user roles.";
                errorEmitter.emit('permission-error', new FirestorePermissionError({path: 'users or roles_admin', operation: 'create'}));
            }
            toast({ variant: 'destructive', title: 'Error Adding Staff', description: errorMessage });
        } finally {
            setIsAddingStaff(false);
        }
    };
    
    const handleRoleToggle = async (uid: string, isSuperAdminRole: boolean) => {
        if (!firestore) return;
        const superAdminRoleRef = doc(firestore, 'roles_super_admin', uid);
        const data = { grantedAt: serverTimestamp() };
        try {
            if (isSuperAdminRole) {
                await setDoc(superAdminRoleRef, data).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: superAdminRoleRef.path, operation: 'create', requestResourceData: data }));
                    throw e;
                });
            } else {
                await deleteDoc(superAdminRoleRef).catch(e => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: superAdminRoleRef.path, operation: 'delete' }));
                    throw e;
                });
            }
            toast({ title: 'Role Updated', description: `Successfully updated role.` });
            await fetchAllStaff();
        } catch (error: any) {
             // Error is emitted above
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
            await batch.commit().catch(e => {
                // Emitting a general error as batch write can fail on any of its operations
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `roles_admin/${uid}`, operation: 'delete' }));
                throw e;
            });
            
            toast({ title: 'Staff Roles Revoked', description: `Admin permissions have been removed for the user.`, className: 'bg-green-100 text-green-900 border-green-200' });
            
            await fetchAllStaff();
            await fetchNotificationRecipients();
        } catch (error: any) {
            // Error is emitted above
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
            const data = { recipientUids: notificationRecipients };
            await setDoc(settingsRef, data, { merge: true }).catch(e => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: settingsRef.path, operation: 'update', requestResourceData: data }));
                throw e;
            });

            toast({ title: "Settings Saved", description: "Notification preferences updated.", className: 'bg-green-100 text-green-900 border-green-200' });
        } catch (error: any) {
            // Error emitted above
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

        const plainApps = JSON.parse(JSON.stringify(appsToRemind));

        try {
            const response = await fetch('/api/reminders/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(plainApps),
            });
            
            const result = await response.json();
            
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

    const handleTestCaspioConnection = async () => {
        setIsSendingWebhook(true);
        setWebhookLog(null);
        try {
            const functions = getFunctions();
            // First try basic connection test
            const testBasicConnection = httpsCallable(functions, 'testBasicConnection');
            
            const result = await testBasicConnection();
            const data = result.data as any;
            
            if (data.success) {
                toast({ title: "Caspio Connection Test", description: data.message, className: 'bg-green-100 text-green-900 border-green-200' });
                setWebhookLog(`✅ Success: ${data.message}\n\nTest Results:\n- HTTP Test: ${data.tests?.httpTest}\n- Caspio Domain: ${data.tests?.caspioTest}\n- OAuth Test: ${data.tests?.oauthTest}`);
            } else {
                setWebhookLog(`❌ Failed: ${data.message}`);
                toast({ variant: 'destructive', title: 'Caspio Connection Failed', description: "See log on page for details." });
            }
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setWebhookLog(`❌ Error: ${errorMessage}`);
            toast({ variant: 'destructive', title: 'Caspio Connection Error', description: "See log on page for details." });
        } finally {
            setIsSendingWebhook(false);
        }
    };

    const handleSendCaspioTest = async () => {
        if (!currentUser?.uid) return;
        setIsSendingWebhook(true);
        setWebhookLog(null);
        try {
            // Create a test application ID
            const testAppId = `test_${Date.now()}`;
            const testData = { 
                ...sampleApplicationData, 
                userId: currentUser.uid,
                id: testAppId,
                applicationId: testAppId
            };
            
            const response = await fetch('/api/caspio/publish', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testData),
            });
            
            const result = await response.json();
            
            if (result.success) {
                toast({ title: "Caspio Test Data Sent", description: result.message, className: 'bg-green-100 text-green-900 border-green-200' });
                setWebhookLog(`✅ Success: ${result.message}`);
            } else {
                setWebhookLog(`❌ Failed: ${result.message}\n\nError Details: ${JSON.stringify(result.error, null, 2)}`);
                toast({ variant: 'destructive', title: 'Caspio Sync Error', description: "See log on page for details." });
            }
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setWebhookLog(`❌ Error: ${errorMessage}`);
            toast({ variant: 'destructive', title: 'Caspio Sync Error', description: "See log on page for details." });
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
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: testEmail,
                    subject: "Resend Integration Test | CalAIM Pathfinder",
                    memberName: "Test User",
                    staffName: "The Admin Team",
                    message: "This is a test email to confirm that the Resend email service is configured correctly.",
                    status: 'In Progress',
                }),
            });
            
            const result = await response.json();
            
            if (result.success) {
                toast({
                    title: 'Test Email Sent!',
                    description: `An email has been sent to ${testEmail}. Please check your inbox.`,
                    className: 'bg-green-100 text-green-900 border-green-200',
                });
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Email Send Failed', description: `Could not send test email: ${error.message}` });
        } finally {
            setIsSendingTestEmail(false);
        }
    };

    const handleCreateTestApplication = async () => {
        if (!firestore) return;
        setIsCreatingTestApp(true);
    
        const testUserId = "test-user-for-jcbloome";
    
        try {
            const batch = writeBatch(firestore);

            const userDocRef = doc(firestore, 'users', testUserId);
            const userDocData = {
                id: testUserId,
                email: "jcbloome@gmail.com",
                firstName: "Jason",
                lastName: "Bloome",
                displayName: "Jason Bloome",
            };
            batch.set(userDocRef, userDocData, { merge: true });

            const appDocRef = doc(firestore, `users/${testUserId}/applications`, "kaiser-test-application-456");
            const testAppData: Partial<Application> = {
                id: "kaiser-test-application-456",
                userId: testUserId,
                memberFirstName: "Kaiser",
                memberLastName: "Testmember",
                referrerEmail: "jcbloome@gmail.com",
                referrerName: "Jason Bloome",
                status: 'In Progress',
                pathway: 'SNF Diversion',
                healthPlan: 'Kaiser',
                lastUpdated: serverTimestamp(),
                forms: [
                    { name: 'CS Member Summary', status: 'Completed', type: 'online-form', href: '#' },
                    { name: 'Waivers & Authorizations', status: 'Pending', type: 'online-form', href: '#' },
                    { name: 'Proof of Income', status: 'Pending', type: 'Upload', href: '#' }
                ]
            };
            batch.set(appDocRef, testAppData);
    
            await batch.commit().catch(e => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `users/${testUserId}/applications`, operation: 'create' }));
                throw e;
            });
    
            toast({
                title: "Kaiser Test Application Created",
                description: "A dummy Kaiser application for jcbloome@gmail.com has been added.",
                className: 'bg-green-100 text-green-900 border-green-200',
            });
    
        } catch (error: any) {
            // Error is emitted above
        } finally {
            setIsCreatingTestApp(false);
        }
    };

    const formatAndSetFirstName = (value: string) => setNewStaffFirstName(value.charAt(0).toUpperCase() + value.slice(1).toLowerCase());
    const formatAndSetLastName = (value: string) => setNewStaffLastName(value.charAt(0).toUpperCase() + value.slice(1).toLowerCase());
    
    // --- Firestore Test Suite Logic ---
    const addTestResult = (result: TestResult) => {
        setTestResults(prev => [result, ...prev]);
    };

    const runTest = async (testName: string, testFn: () => Promise<string>) => {
        if (!firestore || !currentUser) {
            toast({ variant: 'destructive', title: 'Not Ready', description: 'Please wait for user and Firestore to be initialized.' });
            return;
        }
        setIsLoadingTest(testName);
        try {
            const successMessage = await testFn();
            addTestResult({ testName, status: 'success', message: successMessage });
        } catch (error: any) {
           addTestResult({ testName, status: 'error', message: `Test failed. Check the error overlay for details. Generic message: ${error.message}` });
        } finally {
            setIsLoadingTest(null);
        }
    };

    const testCreate = async (): Promise<string> => {
        const testCollectionRef = collection(firestore!, 'test_writes');
        const dataToWrite = {
          uid: currentUser!.uid,
          email: currentUser!.email,
          timestamp: serverTimestamp(),
          message: `Test write by ${currentUser!.uid}`,
        };
    
        return new Promise((resolve, reject) => {
            addDoc(testCollectionRef, dataToWrite)
                .then(newDocRef => {
                    setTestDocId(newDocRef.id);
                    resolve(`Document created successfully in 'test_writes' with ID: ${newDocRef.id}`);
                })
                .catch(error => {
                    const permissionError = new FirestorePermissionError({
                        path: testCollectionRef.path,
                        operation: 'create',
                        requestResourceData: dataToWrite
                    });
                    errorEmitter.emit('permission-error', permissionError);
                    reject(permissionError);
                });
        });
    };

    const testRead = async (): Promise<string> => {
        if (!testDocId) return "Skipped: Create a document first.";
        const docRef = doc(firestore!, 'test_writes', testDocId);
        return new Promise((resolve, reject) => {
           getDoc(docRef)
               .then(docSnap => {
                   if (docSnap.exists()) {
                       resolve(`Successfully read document ${testDocId}.`);
                   } else {
                       reject(new Error(`Document ${testDocId} does not exist.`));
                   }
               })
               .catch(error => {
                   const permissionError = new FirestorePermissionError({ path: docRef.path, operation: 'get' });
                   errorEmitter.emit('permission-error', permissionError);
                   reject(permissionError);
               });
        });
    };

    const testUpdate = async (): Promise<string> => {
        if (!testDocId) return "Skipped: Create a document first.";
        const docRef = doc(firestore!, 'test_writes', testDocId);
        const dataToUpdate = { message: 'This document was updated.' };
  
        return new Promise((resolve, reject) => {
           setDoc(docRef, dataToUpdate, { merge: true })
              .then(() => resolve(`Document ${testDocId} updated successfully.`))
              .catch(error => {
                   const permissionError = new FirestorePermissionError({ path: docRef.path, operation: 'update', requestResourceData: dataToUpdate });
                   errorEmitter.emit('permission-error', permissionError);
                   reject(permissionError);
              });
        });
    };

    const testDelete = async (): Promise<string> => {
        if (!testDocId) return "Skipped: Create a document first.";
        const docRef = doc(firestore!, 'test_writes', testDocId);
  
        return new Promise((resolve, reject) => {
           deleteDoc(docRef)
              .then(() => {
                  const deletedId = testDocId;
                  setTestDocId(null);
                  resolve(`Document ${deletedId} deleted successfully.`);
              })
              .catch(error => {
                  const permissionError = new FirestorePermissionError({ path: docRef.path, operation: 'delete' });
                  errorEmitter.emit('permission-error', permissionError);
                  reject(permissionError);
              });
        });
    };

    const testListUser = async (): Promise<string> => {
        const appsRef = collection(firestore!, `users/${currentUser!.uid}/applications`);
        return new Promise((resolve, reject) => {
          getDocs(appsRef)
              .then(snapshot => resolve(`Successfully listed ${snapshot.size} documents from your 'applications' collection.`))
              .catch(error => {
                  const permissionError = new FirestorePermissionError({ path: appsRef.path, operation: 'list' });
                  errorEmitter.emit('permission-error', permissionError);
                  reject(permissionError);
              });
        });
    };

    const firestoreTests = [
        { name: '1. Create Document', fn: testCreate, description: "Writes to 'test_writes/{new_id}'." },
        { name: '2. Read Document', fn: testRead, description: "Reads from 'test_writes/{id}'." },
        { name: '3. Update Document', fn: testUpdate, description: "Updates 'test_writes/{id}'." },
        { name: '4. Delete Document', fn: testDelete, description: "Deletes 'test_writes/{id}'." },
        { name: '5. List User Apps', fn: testListUser, description: "Lists from 'users/{my_uid}/applications'." },
    ];


    if (isAdminLoading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin"/></div>;
    }
    
    if (!isSuperAdmin) {
         return (
             <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Access Denied</AlertTitle>
                <AlertDescription>
                   This page is restricted to Super Admins.
                </AlertDescription>
             </Alert>
         );
     }

     // Original access denied (keeping for fallback)
     if (false) {
         return (
             <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Access Denied</AlertTitle>
                <AlertDescription>
                   This page is restricted to Super Admins.
                </AlertDescription>
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
                            <CardTitle className="flex items-center gap-3 text-lg"><Clock className="h-5 w-5" />User Login Log</CardTitle>
                             <CardDescription>A summary of recent login events across the application.</CardDescription>
                        </CardHeader>
                         <CardContent>
                            <ScrollArea className="h-72 w-full">
                                {isLoadingLoginLogs ? (
                                    <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                                ) : loginLogs && loginLogs.length > 0 ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>User</TableHead>
                                                <TableHead>Role</TableHead>
                                                <TableHead className="text-right">Time</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {loginLogs.map(log => (
                                                <TableRow key={log.id}>
                                                    <TableCell>
                                                        <div className="font-medium">{log.displayName}</div>
                                                        <div className="text-xs text-muted-foreground">{log.email}</div>
                                                    </TableCell>
                                                    <TableCell>{log.role}</TableCell>
                                                    <TableCell className="text-right text-xs">{log.timestamp ? format(log.timestamp.toDate(), 'P p') : 'N/A'}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-10">No login events recorded.</p>
                                )}
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-lg"><Beaker className="h-5 w-5" />Firestore Permissions Test Suite</CardTitle>
                            <CardDescription>Run tests to diagnose security rule issues.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {firestoreTests.map(test => (
                                    <div key={test.name} className="flex flex-col gap-2 p-4 border rounded-lg bg-muted/30">
                                       <h3 className="font-semibold text-sm">{test.name}</h3>
                                       <p className="text-xs text-muted-foreground flex-grow">{test.description}</p>
                                        <Button onClick={() => runTest(test.name, test.fn)} disabled={!!isLoadingTest || !currentUser} size="sm">
                                        {isLoadingTest === test.name ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Run Test
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <h4 className="font-semibold text-sm mb-2">Test Results</h4>
                                <ScrollArea className="h-48 w-full rounded-md border p-4">
                                     {testResults.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-8">No tests run yet.</p>
                                    ) : (
                                        <div className="space-y-2">
                                        {testResults.map((result, index) => (
                                            <Alert key={index} variant={result.status === 'error' ? 'destructive' : 'default'} className={result.status === 'success' ? 'bg-green-50 border-green-200' : ''}>
                                                {result.status === 'success' ? <CheckCircle className="h-4 w-4" /> : <FileWarning className="h-4 w-4" />}
                                                <AlertTitle className="text-xs font-semibold">{result.testName} - {result.status === 'success' ? 'Passed' : 'Failed'}</AlertTitle>
                                                <AlertDescription className="break-words text-xs">{result.message}</AlertDescription>
                                            </Alert>
                                        ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>
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
                                <h4 className="font-semibold">Caspio Integration</h4>
                                <p className="text-sm text-muted-foreground">Test connection to Caspio. Use the "Send CS Summary to Caspio" button on individual application pages to publish data.</p>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <Button variant="outline" className="w-full" disabled={isSendingWebhook} onClick={handleTestCaspioConnection}>
                                                {isSendingWebhook ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Testing...</> : <><Database className="mr-2 h-4 w-4"/>Test Connection</>}
                                            </Button>
                                            <Button className="w-full" disabled variant="secondary">
                                                <Send className="mr-2 h-4 w-4"/>
                                                Use Individual App Pages
                                            </Button>
                                        </div>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="max-w-2xl">
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>Confirm Caspio Test Data</AlertDialogTitle>
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
                                        <AlertDialogAction onClick={handleSendCaspioTest}>
                                            Send to Caspio
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
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button className="w-full" disabled={isCreatingTestApp}>
                                            {isCreatingTestApp ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : <><PlusCircle className="mr-2 h-4 w-4" /> Create Test Application</>}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirm Test Application</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will create a new application for a test user associated with jcbloome@gmail.com. This is useful for testing cron jobs and reminders. Continue?
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleCreateTestApplication}>Create</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
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
                                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
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
                                            <Switch id={`superadmin-switch-${staff.uid}`} checked={staff.role === 'Super Admin'} onCheckedChange={(checked) => handleRoleToggle(staff.uid, checked)} aria-label={`Toggle Super Admin for ${staff.email}`} disabled={staff.email === 'jason@carehomefinders.com'} />
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

                {/* Notification Management */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Bell className="h-5 w-5" />
                            Email Notification System
                        </CardTitle>
                        <CardDescription>
                            Manage automated email notifications for document uploads and CS Summary completions
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <NotificationManager />
                    </CardContent>
                </Card>

                {/* Advanced Notification Settings */}
                <NotificationSettings />

                {/* Login Activity Tracking */}
                <LoginActivityTracker />
            </div>
            
        </div>
    );
}

    