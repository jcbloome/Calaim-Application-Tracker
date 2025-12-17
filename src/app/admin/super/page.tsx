
'use client';

import { useState, useEffect } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { syncStaff } from '@/ai/flows/sync-staff';
import { sendTestToMake } from '@/ai/flows/send-to-make-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, AlertCircle, ShieldAlert, List, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { collection, getDocs, doc, onSnapshot, Unsubscribe, DocumentData } from 'firebase/firestore';
import { useFirestore } from '@/firebase';


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
    const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
    const router = useRouter();
    const { toast } = useToast();
    const firestore = useFirestore();

    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [isSendingWebhook, setIsSendingWebhook] = useState(false);
    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);

     useEffect(() => {
        if (!isAdminLoading && !isSuperAdmin) {
            router.push('/admin');
        }
    }, [isSuperAdmin, isAdminLoading, router]);

    const fetchStaffDetails = async (roleDocs: DocumentData[]): Promise<StaffMember[]> => {
        if (!firestore) return [];
        const staffPromises = roleDocs.map(async (staffDoc) => {
            const userDocRef = doc(firestore, 'users', staffDoc.uid);
            const userDocSnap = await getDocs(collection(firestore, 'users'));
            const userDoc = userDocSnap.docs.find(d => d.id === staffDoc.uid);
            
            const userData = userDoc?.exists() ? userDoc.data() : null;

            return {
                uid: staffDoc.uid,
                role: staffDoc.role,
                firstName: userData?.firstName || 'Unknown',
                lastName: userData?.lastName || '',
                email: userData?.email || 'No email found',
            };
        });
        return Promise.all(staffPromises);
    };

    useEffect(() => {
        if (!firestore) return;
        setIsLoadingStaff(true);

        const adminRolesRef = collection(firestore, 'roles_admin');
        const superAdminRolesRef = collection(firestore, 'roles_super_admin');

        let combinedUnsubscribes: Unsubscribe[] = [];

        const fetchData = () => {
             const adminUnsub = onSnapshot(adminRolesRef, async (adminSnapshot) => {
                const superAdminDocs = await getDocs(superAdminRolesRef);

                const adminUsers = adminSnapshot.docs.map(d => ({ ...d.data(), role: 'Admin' as const, uid: d.id }));
                const superAdminUsers = superAdminDocs.docs.map(d => ({ ...d.data(), role: 'Super Admin' as const, uid: d.id }));

                const allStaff = await fetchStaffDetails([...adminUsers, ...superAdminUsers]);
                setStaffList(allStaff);
                setIsLoadingStaff(false);
            });

            const superAdminUnsub = onSnapshot(superAdminRolesRef, async (superAdminSnapshot) => {
                 const adminDocs = await getDocs(adminRolesRef);

                const adminUsers = adminDocs.docs.map(d => ({ ...d.data(), role: 'Admin' as const, uid: d.id }));
                const superAdminUsers = superAdminSnapshot.docs.map(d => ({ ...d.data(), role: 'Super Admin' as const, uid: d.id }));

                const allStaff = await fetchStaffDetails([...adminUsers, ...superAdminUsers]);
                setStaffList(allStaff);
                setIsLoadingStaff(false);
            });
            
            combinedUnsubscribes = [adminUnsub, superAdminUnsub];
        };

        fetchData();

        return () => combinedUnsubscribes.forEach(unsub => unsub());

    }, [firestore]);


    const handleSyncStaff = async () => {
        setIsSyncing(true);
        setSyncMessage('');

        try {
            const result = await syncStaff();
            setSyncMessage(result.message);
            toast({
                title: 'Sync Successful',
                description: result.message,
                className: 'bg-green-100 text-green-900 border-green-200',
            });
        } catch (error: any) {
            console.error('Error syncing staff:', error);
            setSyncMessage(`Error: ${error.message}`);
            toast({
                variant: 'destructive',
                title: 'Sync Failed',
                description: `An error occurred while syncing staff. Please check console for details.`,
            });
        } finally {
            setIsSyncing(false);
        }
    };
    
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
                    <CardTitle>Staff Synchronization</CardTitle>
                    <CardDescription>
                        This tool synchronizes all registered users in Firebase Authentication, granting them 'Admin' role access. This is useful for onboarding new team members who have already created an account.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Important Note</AlertTitle>
                        <AlertDescription>
                           This process will grant admin privileges to ALL users registered in your Firebase project, except for the Super Admin account ('jason@carehomefinders.com'). It will not remove existing admins.
                        </AlertDescription>
                    </Alert>

                     <Button onClick={handleSyncStaff} disabled={isSyncing} className="mt-4 w-full sm:w-auto">
                        {isSyncing ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Syncing...</>
                        ) : (
                            <><RefreshCw className="mr-2 h-4 w-4" /> Sync All Staff to Admin Role</>
                        )}
                    </Button>
                    {syncMessage && (
                        <div className="mt-4 p-4 rounded-md bg-muted text-sm font-mono whitespace-pre-wrap">
                            <p className="font-semibold">Sync Status:</p>
                            <p>{syncMessage}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle>Make.com Webhook Test</CardTitle>
                    <CardDescription>
                        Send a sample CS Summary Form to your Make.com webhook to test the integration.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Setup Required</AlertTitle>
                        <AlertDescription>
                            Ensure you have added your Make.com webhook URL to the `MAKE_WEBHOOK_URL` variable in your `.env` file.
                        </AlertDescription>
                    </Alert>

                     <Button onClick={handleSendWebhook} disabled={isSendingWebhook} className="mt-4 w-full sm:w-auto">
                        {isSendingWebhook ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
                        ) : (
                            <><Send className="mr-2 h-4 w-4" /> Send Test Webhook</>
                        )}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Current Staff</CardTitle>
                    <CardDescription>List of users with Admin or Super Admin roles.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoadingStaff ? (
                         <div className="flex justify-center items-center h-24">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : staffList.length > 0 ? (
                        <div className="space-y-4">
                            {staffList.map((staff) => (
                                <div key={staff.uid} className="flex justify-between items-center p-3 border rounded-lg bg-slate-50">
                                    <div className="space-y-1">
                                        <p className="font-semibold">{staff.firstName} {staff.lastName}</p>
                                        <p className="text-sm text-muted-foreground">{staff.email}</p>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${staff.role === 'Super Admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                                            {staff.role}
                                        </span>
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
    );
}
