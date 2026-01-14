
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, ShieldAlert, UserPlus, Send, Users, Mail, Save, Trash2, ShieldCheck, Bell, PlusCircle, Beaker, FileWarning, CheckCircle, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { collection, doc, writeBatch, getDocs, setDoc, deleteDoc, getDoc, collectionGroup, query, where, type Query, serverTimestamp, addDoc, orderBy, limit, getFirestore } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError, useStorage } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';
import { ref, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { NotificationManager } from '@/components/NotificationManager';
import NotificationSettings from '@/components/NotificationSettings';
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
    const storage = useStorage();

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

    // Storage test suite state
    const [storageTestResults, setStorageTestResults] = useState<TestResult[]>([]);
    const [isStorageTestLoading, setIsStorageTestLoading] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [storageDebugLog, setStorageDebugLog] = useState<string[]>([]);
    const [functionsTestResults, setFunctionsTestResults] = useState<TestResult[]>([]);
    const [isFunctionsTestLoading, setIsFunctionsTestLoading] = useState(false);
    
    // Caspio Member Sync Test state
    const [isCaspioSyncTesting, setIsCaspioSyncTesting] = useState(false);
    const [caspioSyncResults, setCaspioSyncResults] = useState<any[]>([]);
    const [caspioSyncSummary, setCaspioSyncSummary] = useState<any>(null);
    
    // Emergency reset function
    const resetAllTests = () => {
        setIsStorageTestLoading(null);
        setIsFunctionsTestLoading(false);
        setUploadProgress(0);
        setStorageTestResults([]);
        setFunctionsTestResults([]);
        toast({
            title: 'Tests Reset',
            description: 'All test states have been cleared',
            className: 'bg-blue-100 text-blue-900 border-blue-200'
        });
    };

    // Direct storage upload test (bypasses functions)
    const testDirectStorageUpload = async () => {
        if (!storage || !currentUser) {
            toast({
                variant: 'destructive',
                title: 'Not Ready',
                description: 'Storage or user not available'
            });
            return;
        }

        try {
            addStorageLog('🚀 Starting DIRECT storage upload test...');
            
            // Create test file
            const testData = new Blob(['Direct upload test - bypassing functions'], { type: 'text/plain' });
            const testFile = new File([testData], 'direct-test.txt', { type: 'text/plain' });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const storagePath = `user_uploads/${currentUser.uid}/direct-test/${timestamp}_direct-test.txt`;
            
            addStorageLog(`📁 Direct upload path: ${storagePath}`);
            addStorageLog(`📄 File: ${testFile.name} (${testFile.size} bytes)`);
            
            const storageRef = ref(storage, storagePath);
            addStorageLog(`✅ Storage reference created: ${storageRef.fullPath}`);
            
            // Add 10-second timeout for direct test
            const timeoutId = setTimeout(() => {
                addStorageLog(`❌ Direct upload timeout after 10 seconds`);
                toast({
                    variant: 'destructive',
                    title: 'Direct Upload Timeout',
                    description: 'Upload is hanging - likely Firebase Storage rules issue'
                });
            }, 10000);
            
            const uploadTask = uploadBytesResumable(storageRef, testFile);
            addStorageLog(`🚀 Upload task created, starting direct upload...`);
            
            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    addStorageLog(`📊 Direct upload progress: ${progress.toFixed(1)}% (${snapshot.bytesTransferred}/${snapshot.totalBytes} bytes)`);
                    addStorageLog(`📈 Upload state: ${snapshot.state}`);
                    setUploadProgress(progress);
                },
                (error) => {
                    clearTimeout(timeoutId);
                    addStorageLog(`❌ Direct upload failed: ${error.code} - ${error.message}`);
                    addStorageLog(`❌ Error details: ${JSON.stringify(error, null, 2)}`);
                    
                    if (error.code === 'storage/unauthorized') {
                        addStorageLog(`🔒 DIAGNOSIS: Firebase Storage security rules are blocking uploads`);
                        toast({
                            variant: 'destructive',
                            title: 'Storage Rules Issue',
                            description: 'Firebase Storage security rules are blocking uploads'
                        });
                    } else {
                        toast({
                            variant: 'destructive',
                            title: 'Direct Upload Failed',
                            description: `${error.code}: ${error.message}`
                        });
                    }
                },
                async () => {
                    clearTimeout(timeoutId);
                    try {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        addStorageLog(`✅ Direct upload SUCCESS! URL: ${downloadURL}`);
                        toast({
                            title: 'Direct Upload Success!',
                            description: 'Storage upload works perfectly - issue is not with storage',
                            className: 'bg-green-100 text-green-900 border-green-200'
                        });
                    } catch (error: any) {
                        addStorageLog(`❌ Failed to get download URL: ${error.message}`);
                    }
                }
            );
            
        } catch (error: any) {
            addStorageLog(`❌ Direct upload setup failed: ${error.message}`);
            toast({
                variant: 'destructive',
                title: 'Direct Upload Setup Failed',
                description: error.message
            });
        }
    };

    // Check Firebase Storage rules with detailed diagnostics
    const checkStorageRules = async () => {
        if (!storage || !currentUser) {
            toast({
                variant: 'destructive',
                title: 'Not Ready',
                description: 'Storage or user not available'
            });
            return;
        }

        addStorageLog('🔒 DETAILED Storage Rules Diagnostic...');
        
        try {
            // Get user token details
            const token = await currentUser.getIdToken();
            const tokenResult = await currentUser.getIdTokenResult();
            
            addStorageLog(`🔍 AUTHENTICATION DETAILS:`);
            addStorageLog(`   User UID: ${currentUser.uid}`);
            addStorageLog(`   User email: ${currentUser.email}`);
            addStorageLog(`   Email verified: ${currentUser.emailVerified}`);
            addStorageLog(`   Token length: ${token.length}`);
            addStorageLog(`   Auth provider: ${tokenResult.signInProvider}`);
            
            addStorageLog(`🔍 STORAGE CONFIGURATION:`);
            addStorageLog(`   Storage bucket: ${storage.app.options.storageBucket}`);
            addStorageLog(`   Storage project: ${storage.app.options.projectId}`);
            addStorageLog(`   Firebase app: ${storage.app.name}`);
            
            addStorageLog(`🔍 PATH ANALYSIS:`);
            const testPath = `user_uploads/${currentUser.uid}/rules-test/test.txt`;
            addStorageLog(`   Test path: ${testPath}`);
            addStorageLog(`   Path matches pattern: user_uploads/{userId}/**`);
            addStorageLog(`   UserId in path: ${currentUser.uid}`);
            addStorageLog(`   Auth UID matches: ${currentUser.uid === currentUser.uid ? '✅ YES' : '❌ NO'}`);
            
            // Test creating reference
            const testRef = ref(storage, testPath);
            addStorageLog(`✅ Storage reference created successfully`);
            addStorageLog(`   Reference bucket: ${testRef.bucket}`);
            addStorageLog(`   Reference full path: ${testRef.fullPath}`);
            
            addStorageLog(`🔍 RULES REQUIREMENTS CHECK:`);
            addStorageLog(`   request.auth != null: ${currentUser ? '✅ YES (user authenticated)' : '❌ NO'}`);
            addStorageLog(`   request.auth.uid == userId: ${currentUser ? '✅ YES (UIDs should match)' : '❌ NO'}`);
            
            addStorageLog(`⚠️ NEXT STEP: Try Direct Upload Test to see actual rules behavior`);
            
            toast({
                title: 'Storage Rules Analysis Complete',
                description: 'Check debug log for detailed authentication and path analysis',
                className: 'bg-blue-100 text-blue-900 border-blue-200'
            });
            
        } catch (error: any) {
            addStorageLog(`❌ Storage rules analysis failed: ${error.message}`);
            addStorageLog(`❌ Error code: ${error.code}`);
            addStorageLog(`❌ Error stack: ${error.stack}`);
            toast({
                variant: 'destructive',
                title: 'Storage Rules Analysis Failed',
                description: error.message
            });
        }
    };

    // Simple upload test using uploadBytes instead of uploadBytesResumable
    const testSimpleUpload = async () => {
        if (!storage || !currentUser) {
            toast({
                variant: 'destructive',
                title: 'Not Ready',
                description: 'Storage or user not available'
            });
            return;
        }

        try {
            addStorageLog('🧪 Testing SIMPLE upload (uploadBytes instead of uploadBytesResumable)...');
            
            const testData = new Blob(['Simple upload test'], { type: 'text/plain' });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const storagePath = `user_uploads/${currentUser.uid}/simple-test/${timestamp}_simple.txt`;
            
            addStorageLog(`📁 Simple upload path: ${storagePath}`);
            
            const storageRef = ref(storage, storagePath);
            addStorageLog(`✅ Storage reference created: ${storageRef.fullPath}`);
            
            // Use uploadBytes instead of uploadBytesResumable
            addStorageLog(`🚀 Starting uploadBytes (not resumable)...`);
            
            const uploadResult = await uploadBytes(storageRef, testData);
            addStorageLog(`✅ uploadBytes completed! Bytes transferred: ${uploadResult.totalBytes}`);
            
            const downloadURL = await getDownloadURL(uploadResult.ref);
            addStorageLog(`✅ Download URL obtained: ${downloadURL}`);
            
            toast({
                title: 'Simple Upload Success!',
                description: 'uploadBytes worked - issue might be with uploadBytesResumable',
                className: 'bg-green-100 text-green-900 border-green-200'
            });
            
        } catch (error: any) {
            addStorageLog(`❌ Simple upload failed: ${error.code} - ${error.message}`);
            addStorageLog(`❌ Error details: ${JSON.stringify(error, null, 2)}`);
            
            if (error.code === 'storage/unauthorized') {
                addStorageLog(`🔒 Still getting unauthorized - rules issue persists`);
            } else if (error.code === 'storage/unknown') {
                addStorageLog(`❓ Unknown error - might be service configuration issue`);
            } else {
                addStorageLog(`🔍 Different error type: ${error.code}`);
            }
            
            toast({
                variant: 'destructive',
                title: 'Simple Upload Failed',
                description: `${error.code}: ${error.message}`
            });
        }
    };

    const applicationsQuery = useMemoFirebase(() => {
        if (isAdminLoading || !firestore || !currentUser) {
          return null;
        }
        return query(collectionGroup(firestore, 'applications')) as Query<Application & FormValues>;
    }, [firestore, isAdminLoading, currentUser]);


    const { data: allApplications, isLoading: isLoadingApplications } = useCollection<Application & FormValues>(applicationsQuery);
    
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
            // Use the API route instead of Firebase Function
            const response = await fetch('/api/caspio/test', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            const data = await response.json();
            
            // Format detailed logs for display
            const detailedLogs = data.detailedLogs ? data.detailedLogs.join('\n') : '';
            const debugInfo = data.debug ? JSON.stringify(data.debug, null, 2) : '';
            
            if (data.success) {
                toast({ title: "Caspio Connection Test", description: data.message, className: 'bg-green-100 text-green-900 border-green-200' });
                setWebhookLog(`✅ SUCCESS: ${data.message}\n\n=== DETAILED LOGS ===\n${detailedLogs}\n\n=== TEST RESULTS ===\n- HTTP Test: ${data.tests?.httpTest || 'N/A'}\n- Caspio Domain: ${data.tests?.caspioTest || 'N/A'}\n- OAuth Test: ${data.tests?.oauthTest || 'N/A'}`);
            } else {
                const errorLog = `❌ FAILED: ${data.message}\n\n=== ERROR DETAILS ===\n${data.error || 'Unknown error'}\n\n=== DETAILED LOGS ===\n${detailedLogs}\n\n=== DEBUG INFO ===\n${debugInfo}`;
                setWebhookLog(errorLog);
                toast({ variant: 'destructive', title: 'Caspio Connection Failed', description: "See detailed log on page below." });
            }
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const networkErrorLog = `❌ NETWORK ERROR: ${errorMessage}\n\n=== ERROR DETAILS ===\nThis is likely a network connectivity issue or server error.\n\nError Type: ${error.name || 'Unknown'}\nError Message: ${error.message || 'No message'}\nError Stack: ${error.stack ? error.stack.substring(0, 500) + '...' : 'No stack trace'}`;
            setWebhookLog(networkErrorLog);
            toast({ variant: 'destructive', title: 'Caspio Connection Error', description: "Network error - see detailed log on page below." });
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

    const handleSimpleFunctionTest = async () => {
        try {
            const testFunction = httpsCallable(functions, 'simpleTest');

            toast({
                title: 'Testing Firebase Functions',
                description: 'Checking basic connectivity...',
                className: 'bg-blue-100 text-blue-900 border-blue-200',
            });

            const response = await testFunction({});
            const data = response.data as any;

            console.log('✅ Simple Function Test Result:', data);
            toast({
                title: 'Firebase Functions Working!',
                description: `Success: ${data.message}`,
                className: 'bg-green-100 text-green-900 border-green-200',
            });

        } catch (error: any) {
            console.error('❌ Simple Function Test Error:', error);
            console.error('❌ Error details:', {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: error.stack
            });
            toast({
                variant: 'destructive',
                title: 'Firebase Functions Failed',
                description: `${error.code || 'Unknown'}: ${error.message || 'Failed to connect to Firebase Functions'}`,
            });
        }
    };

    const handleCaspioMemberSyncTest = async () => {
        setIsCaspioSyncTesting(true);
        setCaspioSyncResults([]);
        setCaspioSyncSummary(null);

        try {
            const testFunction = httpsCallable(functions, 'testCaspioMemberSync');

            toast({
                title: 'Caspio Member Sync Test Started',
                description: 'Testing member sync workflow with mock data...',
                className: 'bg-blue-100 text-blue-900 border-blue-200',
            });

            const response = await testFunction({});
            const data = response.data as any;

            if (data.success) {
                setCaspioSyncResults(data.results || []);
                setCaspioSyncSummary(data.summary || null);
                toast({
                    title: 'Caspio Member Sync Test Complete',
                    description: `${data.summary?.successful || 0} of ${data.summary?.totalTested || 0} members synced successfully.`,
                    className: 'bg-green-100 text-green-900 border-green-200',
                });
            } else {
                setCaspioSyncResults(data.results || []);
                setCaspioSyncSummary(data.summary || { totalTested: 0, successful: 0, failed: 0 });
                toast({
                    variant: 'destructive',
                    title: 'Caspio Member Sync Test Failed',
                    description: data.message || 'An unknown error occurred during the test.',
                });
            }

        } catch (error: any) {
            console.error('❌ Caspio Member Sync Test Error:', error);
            console.error('❌ Error details:', {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: error.stack
            });
            toast({
                variant: 'destructive',
                title: 'Caspio Member Sync Test Error',
                description: `${error.code || 'Unknown'}: ${error.message || 'Failed to run Caspio member sync test'}`,
            });
        } finally {
            setIsCaspioSyncTesting(false);
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

    // Storage Test Functions
    const addStorageTestResult = (result: TestResult) => {
        setStorageTestResults(prev => [result, ...prev]);
    };

    const addStorageLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setStorageDebugLog(prev => [`[${timestamp}] ${message}`, ...prev]);
    };

    const runStorageDiagnostics = async () => {
        setStorageDebugLog([]);
        addStorageLog('🔍 Starting Firebase Storage Diagnostics...');
        
        try {
            // Compare Firebase services
            compareFirebaseServices();
            
            // Check if storage is initialized
            addStorageLog(`Storage instance: ${storage ? '✅ Available' : '❌ Not available'}`);
            addStorageLog(`Current user: ${currentUser ? `✅ ${currentUser.email} (${currentUser.uid})` : '❌ Not authenticated'}`);
            
            if (!storage) {
                addStorageLog('❌ CRITICAL: Storage not initialized - this is the root cause!');
                addStorageLog('🔧 Check Firebase client initialization in src/firebase/client-init.ts');
                addStorageLog('🔧 Verify useStorage hook is working correctly');
                return;
            }
            
            if (!currentUser) {
                addStorageLog('❌ CRITICAL: User not authenticated - cannot test storage');
                return;
            }

            // Check storage configuration
            addStorageLog(`Storage app: ${storage.app.name}`);
            addStorageLog(`Storage bucket: ${storage.app.options.storageBucket}`);
            
            // Test creating a reference
            try {
                const testRef = ref(storage, `user_uploads/${currentUser.uid}/diagnostics/test.txt`);
                addStorageLog(`✅ Storage reference created: ${testRef.fullPath}`);
                addStorageLog(`Reference bucket: ${testRef.bucket}`);
                addStorageLog(`Reference name: ${testRef.name}`);
            } catch (error: any) {
                addStorageLog(`❌ Failed to create storage reference: ${error.message}`);
                return;
            }

            // Test user token
            try {
                const token = await currentUser.getIdToken();
                addStorageLog(`✅ User token obtained (length: ${token.length})`);
                
                const tokenResult = await currentUser.getIdTokenResult();
                addStorageLog(`Token claims: ${JSON.stringify(tokenResult.claims, null, 2)}`);
            } catch (error: any) {
                addStorageLog(`❌ Failed to get user token: ${error.message}`);
            }

            // Test basic storage operations
            addStorageLog('🧪 Testing basic storage operations...');
            
            toast({
                title: 'Storage Diagnostics Complete',
                description: 'Check the debug log below for detailed information',
                className: 'bg-blue-100 text-blue-900 border-blue-200'
            });

        } catch (error: any) {
            addStorageLog(`❌ Diagnostics failed: ${error.message}`);
            addStorageLog(`Error stack: ${error.stack}`);
        }
    };

    const testFirebaseFunctions = async () => {
        setIsFunctionsTestLoading(true);
        setFunctionsTestResults([]);
        
        try {

            // Test 2: Direct Firestore access for active sessions (bypassing Functions)
            try {
                const db = getFirestore();
                const sessionsCollection = collection(db, 'activeSessions');
                const sessionsQuery = query(sessionsCollection, limit(10));
                const sessionsSnapshot = await getDocs(sessionsQuery);
                
                const sessions = sessionsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                setFunctionsTestResults(prev => [...prev, {
                    testName: 'getActiveSessions (Direct Firestore)',
                    status: 'success',
                    message: `✅ Successfully accessed activeSessions collection directly. Found ${sessions.length} active sessions.`
                }]);
            } catch (error: any) {
                setFunctionsTestResults(prev => [...prev, {
                    testName: 'getActiveSessions (Direct Firestore)',
                    status: 'error',
                    message: `❌ Failed to access activeSessions: ${error.code || error.message}`
                }]);
            }

            // Test 3: Basic Firestore write test
            try {
                const db = getFirestore();
                const testDoc = doc(db, 'test_writes', 'connectivity_test');
                await setDoc(testDoc, {
                    timestamp: new Date(),
                    test: 'Firebase Functions Test Suite',
                    status: 'success'
                });
                
                setFunctionsTestResults(prev => [...prev, {
                    testName: 'Firestore Write Test',
                    status: 'success',
                    message: '✅ Successfully wrote test document to Firestore.'
                }]);
            } catch (error: any) {
                setFunctionsTestResults(prev => [...prev, {
                    testName: 'Firestore Write Test',
                    status: 'error',
                    message: `❌ Failed to write to Firestore: ${error.code || error.message}`
                }]);
            }

        } catch (error: any) {
            setFunctionsTestResults(prev => [...prev, {
                testName: 'Functions Connection',
                status: 'error',
                message: `Failed to connect to Firebase Functions: ${error.message}`
            }]);
        } finally {
            setIsFunctionsTestLoading(false);
        }
    };

    const runStorageTest = async (testName: string, testFn: () => Promise<string>) => {
        addStorageLog(`🧪 Starting test: ${testName}`);
        
        if (!storage || !currentUser) {
            const errorMsg = `Not ready - Storage: ${!!storage}, User: ${!!currentUser}`;
            addStorageLog(`❌ ${errorMsg}`);
            toast({ variant: 'destructive', title: 'Not Ready', description: 'Please wait for user and Storage to be initialized.' });
            return;
        }
        
        setIsStorageTestLoading(testName);
        try {
            addStorageLog(`⏳ Running ${testName}...`);
            const result = await testFn();
            addStorageLog(`✅ ${testName} passed: ${result}`);
            addStorageTestResult({ name: testName, success: true, message: result });
            toast({ title: 'Test Passed', description: `${testName} completed successfully.`, className: 'bg-green-100 text-green-900 border-green-200' });
        } catch (error: any) {
            addStorageLog(`❌ ${testName} failed: ${error.message}`);
            addStorageLog(`Error code: ${error.code}`);
            addStorageLog(`Error stack: ${error.stack}`);
            addStorageTestResult({ name: testName, success: false, message: error.message });
            toast({ variant: 'destructive', title: 'Test Failed', description: `${testName}: ${error.message}` });
        } finally {
            setIsStorageTestLoading(null);
        }
    };

    const testStorageUpload = () => {
        return new Promise<string>((resolve, reject) => {
            addStorageLog('📤 Starting upload test...');
            
            if (!storage || !currentUser) {
                const error = 'Storage or user not available';
                addStorageLog(`❌ ${error}`);
                reject(new Error(error));
                return;
            }

            const testData = new Blob(['Hello World - Storage Test'], { type: 'text/plain' });
            const testFile = new File([testData], 'test-upload.txt', { type: 'text/plain' });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const storagePath = `user_uploads/${currentUser.uid}/test/${timestamp}_test-upload.txt`;
            
            addStorageLog(`📁 Upload path: ${storagePath}`);
            addStorageLog(`📄 File: ${testFile.name} (${testFile.size} bytes, ${testFile.type})`);
            
            // Add timeout to prevent hanging
            const timeoutId = setTimeout(() => {
                addStorageLog(`❌ Upload timeout after 30 seconds`);
                reject(new Error('Upload timeout - test took too long'));
            }, 30000);

            try {
                const storageRef = ref(storage, storagePath);
                addStorageLog(`✅ Storage reference created successfully`);
                addStorageLog(`🪣 Bucket: ${storageRef.bucket}`);
                addStorageLog(`📍 Full path: ${storageRef.fullPath}`);

                const uploadTask = uploadBytesResumable(storageRef, testFile);
                addStorageLog(`🚀 Upload task created, starting upload...`);

                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        addStorageLog(`📊 Upload progress: ${progress.toFixed(1)}% (${snapshot.bytesTransferred}/${snapshot.totalBytes} bytes)`);
                        addStorageLog(`📈 Upload state: ${snapshot.state}`);
                        setUploadProgress(progress);
                    },
                    (error) => {
                        clearTimeout(timeoutId);
                        addStorageLog(`❌ Upload failed with error: ${error.code}`);
                        addStorageLog(`❌ Error message: ${error.message}`);
                        addStorageLog(`❌ Error details: ${JSON.stringify(error, null, 2)}`);
                        reject(new Error(`Upload failed: ${error.code} - ${error.message}`));
                    },
                    async () => {
                        clearTimeout(timeoutId);
                        try {
                            addStorageLog(`✅ Upload completed successfully!`);
                            addStorageLog(`🔗 Getting download URL...`);
                            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                            addStorageLog(`✅ Download URL obtained: ${downloadURL}`);
                            resolve(`Successfully uploaded test file. Download URL: ${downloadURL}`);
                        } catch (error: any) {
                            addStorageLog(`❌ Failed to get download URL: ${error.message}`);
                            reject(new Error(`Failed to get download URL: ${error.message}`));
                        }
                    }
                );
            } catch (error: any) {
                clearTimeout(timeoutId);
                addStorageLog(`❌ Failed to create storage reference: ${error.message}`);
                reject(new Error(`Failed to create storage reference: ${error.message}`));
            }
        });
    };

    const testStorageList = () => {
        return new Promise<string>((resolve, reject) => {
            if (!storage || !currentUser) {
                reject(new Error('Storage or user not available'));
                return;
            }

            // Add timeout protection
            const timeoutId = setTimeout(() => {
                reject(new Error('List timeout - operation took too long'));
            }, 15000);

            const userUploadsRef = ref(storage, `user_uploads/${currentUser.uid}`);
            
            listAll(userUploadsRef)
                .then((result) => {
                    clearTimeout(timeoutId);
                    const fileCount = result.items.length;
                    const folderCount = result.prefixes.length;
                    resolve(`Successfully listed user uploads: ${fileCount} files, ${folderCount} folders`);
                })
                .catch((error) => {
                    clearTimeout(timeoutId);
                    reject(new Error(`List failed: ${error.code} - ${error.message}`));
                });
        });
    };

    const testStorageDelete = () => {
        return new Promise<string>((resolve, reject) => {
            if (!storage || !currentUser) {
                reject(new Error('Storage or user not available'));
                return;
            }

            // Add timeout protection
            const timeoutId = setTimeout(() => {
                reject(new Error('Delete test timeout - operation took too long'));
            }, 30000);

            // Try to delete a test file (this might fail if no test files exist)
            const testRef = ref(storage, `user_uploads/${currentUser.uid}/test/test-delete.txt`);
            
            // First upload a file to delete
            const testData = new Blob(['Delete me'], { type: 'text/plain' });
            const testFile = new File([testData], 'test-delete.txt', { type: 'text/plain' });
            const uploadTask = uploadBytesResumable(testRef, testFile);

            uploadTask.on('state_changed',
                () => {}, // Progress
                (error) => {
                    clearTimeout(timeoutId);
                    reject(new Error(`Upload for delete test failed: ${error.message}`));
                },
                async () => {
                    // Now delete it
                    try {
                        await deleteObject(testRef);
                        clearTimeout(timeoutId);
                        resolve('Successfully uploaded and deleted test file');
                    } catch (error: any) {
                        clearTimeout(timeoutId);
                        reject(new Error(`Delete failed: ${error.code} - ${error.message}`));
                    }
                }
            );
        });
    };

    const testStorageAsUser = () => {
        return new Promise<string>((resolve, reject) => {
            if (!storage || !currentUser) {
                reject(new Error('Storage or user not available'));
                return;
            }

            // Add timeout protection
            const timeoutId = setTimeout(() => {
                reject(new Error('Security test timeout - operation took too long'));
            }, 15000);

            // Test uploading to a different user's path (should fail)
            const fakeUserId = 'fake-user-id-12345';
            const testData = new Blob(['Unauthorized test'], { type: 'text/plain' });
            const testFile = new File([testData], 'unauthorized-test.txt', { type: 'text/plain' });
            const unauthorizedPath = `user_uploads/${fakeUserId}/test/unauthorized.txt`;
            const storageRef = ref(storage, unauthorizedPath);

            const uploadTask = uploadBytesResumable(storageRef, testFile);

            uploadTask.on('state_changed',
                () => {}, // Progress
                (error) => {
                    clearTimeout(timeoutId);
                    // This should fail with unauthorized error
                    if (error.code === 'storage/unauthorized') {
                        resolve('Security test passed: Unauthorized access correctly blocked');
                    } else {
                        reject(new Error(`Unexpected error: ${error.code} - ${error.message}`));
                    }
                },
                () => {
                    clearTimeout(timeoutId);
                    // This should not succeed
                    reject(new Error('Security test failed: Unauthorized upload was allowed'));
                }
            );
        });
    };

    const compareFirebaseServices = () => {
        addStorageLog('🔍 Comparing Firebase Services...');
        addStorageLog(`Firestore: ${firestore ? '✅ Available' : '❌ Not available'}`);
        addStorageLog(`Storage: ${storage ? '✅ Available' : '❌ Not available'}`);
        
        if (firestore) {
            addStorageLog(`Firestore app: ${firestore.app.name}`);
            addStorageLog(`Firestore project: ${firestore.app.options.projectId}`);
        }
        
        if (storage) {
            addStorageLog(`Storage app: ${storage.app.name}`);
            addStorageLog(`Storage project: ${storage.app.options.projectId}`);
            addStorageLog(`Storage bucket: ${storage.app.options.storageBucket}`);
        } else {
            addStorageLog('❌ CRITICAL: Storage is not initialized!');
            addStorageLog('🔧 This explains why uploads fail - Storage service is missing');
            addStorageLog('🔧 Check Firebase client initialization in src/firebase/client-init.ts');
            addStorageLog('🔧 Verify storage is properly exported from Firebase provider');
        }
        
        // Check if they're using the same app instance
        if (firestore && storage) {
            const sameApp = firestore.app === storage.app;
            addStorageLog(`Same Firebase app instance: ${sameApp ? '✅ Yes' : '⚠️ No - this could cause issues'}`);
        }
    };

    const storageTests = [
        { name: '1. Upload File', fn: testStorageUpload, description: `Uploads to 'user_uploads/${currentUser?.uid}/test/'` },
        { name: '2. List Files', fn: testStorageList, description: `Lists from 'user_uploads/${currentUser?.uid}/'` },
        { name: '3. Delete File', fn: testStorageDelete, description: `Uploads and deletes test file` },
        { name: '4. Security Test', fn: testStorageAsUser, description: `Tests unauthorized access (should fail)` },
    ];

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

                    {/* Firebase Functions Test Suite */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-lg"><Bell className="h-5 w-5" />Firebase Functions Test Suite</CardTitle>
                            <CardDescription>Test Firebase Functions connectivity and login tracking functions. If functions fail, they need deployment.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-2">
                                <Button 
                                    onClick={testFirebaseFunctions} 
                                    disabled={isFunctionsTestLoading || !currentUser} 
                                    variant="secondary"
                                >
                                    {isFunctionsTestLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                                    Test Functions
                                </Button>
                            </div>
                            <div>
                                <h4 className="font-semibold text-sm mb-2">Functions Test Results</h4>
                                <ScrollArea className="h-48 w-full rounded-md border p-4">
                                    {functionsTestResults.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-8">No functions tests run yet.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {functionsTestResults.map((result, index) => (
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

                    {/* Firebase Storage Test Suite */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-lg"><Database className="h-5 w-5" />Firebase Storage Test Suite</CardTitle>
                            <CardDescription>Run tests to diagnose storage upload and security issues.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="mb-4 space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <Button 
                                        onClick={runStorageDiagnostics}
                                        variant="outline"
                                        className="w-full"
                                    >
                                        🔍 Run Storage Diagnostics
                                    </Button>
                                    <Button 
                                        onClick={checkStorageRules}
                                        variant="outline"
                                        className="w-full"
                                        disabled={!storage || !currentUser}
                                    >
                                        🔒 Check Storage Rules
                                    </Button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <Button 
                                        onClick={testDirectStorageUpload}
                                        variant="default"
                                        size="sm"
                                        disabled={!storage || !currentUser}
                                    >
                                        🎯 Direct Upload Test
                                    </Button>
                                    <Button 
                                        onClick={testSimpleUpload}
                                        variant="secondary"
                                        size="sm"
                                        disabled={!storage || !currentUser}
                                    >
                                        🧪 Simple Upload Test
                                    </Button>
                                    <Button 
                                        onClick={resetAllTests}
                                        variant="destructive"
                                        size="sm"
                                    >
                                        🔄 Reset All Tests
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Check Firebase Storage initialization and configuration. Use "Direct Upload Test" to verify storage works. Use reset if tests get stuck.
                                </p>
                                {storageTestResults.some(r => r.status === 'success') && (
                                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                                        ✅ <strong>Storage is working!</strong> Upload issues are likely in the pathway page implementation, not Firebase Storage itself.
                                    </div>
                                )}
                                {functionsTestResults.some(r => r.status === 'error' && r.message.includes('permission-denied')) && (
                                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                                        ⚠️ <strong>Functions need deployment.</strong> Login activity logs won't work until Firebase Functions are deployed with proper authentication.
                                    </div>
                                )}
                                {storageTestResults.some(r => r.status === 'error' && r.message.includes('timeout')) && (
                                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                                        🔥 <strong>Storage uploads timing out!</strong> This is likely a Firebase Storage security rules issue. Check your Firebase console Storage rules.
                                    </div>
                                )}
                                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                                    💡 <strong>Key Insight:</strong> Applications/forms save successfully (Firestore works) but documents fail (Storage issue). This confirms authentication works - it's specifically a Storage rules problem.
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {storageTests.map(test => (
                                    <div key={test.name} className="flex flex-col gap-2 p-4 border rounded-lg bg-muted/30">
                                        <h3 className="font-semibold text-sm">{test.name}</h3>
                                        <p className="text-xs text-muted-foreground flex-grow">{test.description}</p>
                                        <Button 
                                            onClick={() => runStorageTest(test.name, test.fn)} 
                                            disabled={!!isStorageTestLoading || !currentUser || !storage} 
                                            size="sm"
                                        >
                                            {isStorageTestLoading === test.name ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            Run Test
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            
                            {uploadProgress > 0 && uploadProgress < 100 && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span>Upload Progress</span>
                                        <span>{uploadProgress.toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                            className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                                            style={{ width: `${uploadProgress}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )}
                            
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-semibold text-sm mb-2">Storage Test Results</h4>
                                    <ScrollArea className="h-48 w-full rounded-md border p-4">
                                        {storageTestResults.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-8">No storage tests run yet.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {storageTestResults.map((result, index) => (
                                                    <Alert key={index} variant={result.success ? 'default' : 'destructive'} className={result.success ? 'bg-green-50 border-green-200' : ''}>
                                                        {result.success ? <CheckCircle className="h-4 w-4" /> : <FileWarning className="h-4 w-4" />}
                                                        <AlertTitle className="text-xs font-semibold">{result.name} - {result.success ? 'Passed' : 'Failed'}</AlertTitle>
                                                        <AlertDescription className="break-words text-xs">{result.message}</AlertDescription>
                                                    </Alert>
                                                ))}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </div>
                                
                                <div>
                                    <h4 className="font-semibold text-sm mb-2">Debug Log</h4>
                                    <ScrollArea className="h-48 w-full rounded-md border p-4 bg-gray-50">
                                        {storageDebugLog.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-8">No debug logs yet. Run diagnostics to see detailed information.</p>
                                        ) : (
                                            <div className="space-y-1">
                                                {storageDebugLog.map((log, index) => (
                                                    <div key={index} className="text-xs font-mono break-words">
                                                        {log}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </div>
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                    <Button variant="outline" className="w-full" disabled={isSendingWebhook} onClick={handleTestCaspioConnection}>
                                        {isSendingWebhook ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Testing...</> : <><Database className="mr-2 h-4 w-4"/>Test Connection</>}
                                    </Button>
                                    <Button 
                                        variant="default" 
                                        className="w-full" 
                                        disabled={isCaspioSyncTesting} 
                                        onClick={handleCaspioMemberSyncTest}
                                    >
                                        {isCaspioSyncTesting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Testing...</> : <><Database className="mr-2 h-4 w-4"/>Member Sync Test</>}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Button 
                                        variant="secondary" 
                                        className="w-full" 
                                        onClick={handleSimpleFunctionTest}
                                    >
                                        <Beaker className="mr-2 h-4 w-4"/>
                                        Test Firebase Functions
                                    </Button>
                                    <Button className="w-full" disabled variant="outline">
                                        <Send className="mr-2 h-4 w-4"/>
                                        Use Individual App Pages
                                    </Button>
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" className="w-full mt-3">
                                            <Send className="mr-2 h-4 w-4"/>
                                            Send Test Data to Caspio
                                        </Button>
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
                                
                                {/* Caspio Member Sync Test Results */}
                                {caspioSyncSummary && (
                                    <div className="mt-4 space-y-4">
                                        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-primary">{caspioSyncSummary.totalTested}</p>
                                                <p className="text-xs text-muted-foreground">Total Tested</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-green-600">{caspioSyncSummary.successful}</p>
                                                <p className="text-xs text-muted-foreground">Successful</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-red-600">{caspioSyncSummary.failed}</p>
                                                <p className="text-xs text-muted-foreground">Failed</p>
                                            </div>
                                        </div>
                                        
                                        {caspioSyncResults.length > 0 && (
                                            <div className="space-y-2">
                                                <h5 className="font-semibold text-sm">Member Sync Results:</h5>
                                                {caspioSyncResults.map((result, index) => (
                                                    <Alert key={index} variant={result.success ? 'default' : 'destructive'} className={result.success ? 'bg-green-50 border-green-200' : ''}>
                                                        {result.success ? <CheckCircle className="h-4 w-4" /> : <FileWarning className="h-4 w-4" />}
                                                        <AlertTitle className="text-xs font-semibold">
                                                            {result.member} ({result.mco}) - {result.success ? 'SUCCESS' : 'FAILED'}
                                                        </AlertTitle>
                                                        <AlertDescription className="text-xs">
                                                            {result.message}
                                                            {result.clientId && <p className="mt-1">Client ID: {result.clientId}</p>}
                                                        </AlertDescription>
                                                    </Alert>
                                                ))}
                                            </div>
                                        )}
                                    </div>
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
            </div>
            
        </div>
    );
}

    