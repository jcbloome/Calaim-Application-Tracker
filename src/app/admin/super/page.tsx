
'use client';

import { useState, useEffect } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { syncStaff } from '@/ai/flows/sync-staff';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, AlertCircle, ShieldAlert, List } from 'lucide-react';
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

export default function SuperAdminPage() {
    const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
    const router = useRouter();
    const { toast } = useToast();
    const firestore = useFirestore();

    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
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
