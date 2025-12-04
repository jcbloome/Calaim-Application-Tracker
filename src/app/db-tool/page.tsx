
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, serverTimestamp, collection, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Database, Loader2 } from 'lucide-react';

// An "in-progress" sample application record
const fakeApplicationTemplate = {
    // Step 1: Member & Contact Info
    memberFirstName: 'Test',
    memberLastName: 'User',
    memberDob: Timestamp.fromDate(new Date(1960, 5, 15)),
    memberAge: 64,
    memberMediCalNum: '98765432A',
    confirmMemberMediCalNum: '98765432A',
    memberMrn: 'mrn-test-005', // This will be overwritten
    confirmMemberMrn: 'mrn-test-005', // This will be overwritten
    memberLanguage: 'English',
    referrerFirstName: 'Jason',
    referrerLastName: 'Bloome',
    referrerEmail: 'jason.bloome@example.com',
    referrerPhone: '(555) 123-4567',
    referrerRelationship: 'Social Worker',
    memberPhone: '(555) 987-6543',
    memberEmail: 'test.user@example.com',
    bestContactFirstName: 'Primary',
    bestContactLastName: 'Contact',
    bestContactRelationship: 'Family Member',
    bestContactPhone: '(555) 555-0000',
    bestContactEmail: 'best@contact.com',
    bestContactLanguage: 'English',
    hasCapacity: 'Yes' as const,
    hasLegalRep: 'Yes' as const,
    repName: 'Legal Rep',
    repRelationship: 'Lawyer',
    repPhone: '(555) 111-2222',
    repEmail: 'legal@rep.com',
    repLanguage: 'English',

    // Step 2: Location Information
    currentLocation: 'SNF',
    currentAddress: '123 Skilled Nursing Way',
    currentCity: 'Careville',
    currentState: 'CA',
    currentZip: '90211',
    currentCounty: 'Los Angeles',
    copyAddress: false,
    customaryAddress: '456 Community Lane',
    customaryCity: 'Homeville',
    customaryState: 'CA',
    customaryZip: '90212',
    customaryCounty: 'Los Angeles',

    // Step 3: Health Plan & Pathway
    healthPlan: 'Health Net' as const,
    pathway: 'SNF Diversion' as const,
    meetsSnfTransitionCriteria: true,
    meetsSnfDiversionCriteria: true,
    snfDiversionReason: 'Member requires substantial help with ADLs but can be safely cared for in the community with support.',
    
    // Step 4: ISP & Facility Selection
    ispFirstName: '',
    ispLastName: '',
    ispRelationship: '',
    ispFacilityName: '',
    ispPhone: '',
    ispEmail: '',
    ispLocationType: '',
    ispAddress: '',
    ispCity: '',
    ispState: '',
    ispZip: '',
    ispCounty: '',
    onALWWaitlist: 'No' as const,
    hasPrefRCFE: 'Yes' as const,
    rcfeName: 'The Golden Years RCFE',
    rcfeAdminName: 'Admin Person',
    rcfeAdminPhone: '(555) 111-2222',
    rcfeAdminEmail: 'rcfe-admin@example.com',
    rcfeAddress: '789 Sunshine Ave, Happy Town, CA',

    // Other app-level fields
    status: 'In Progress' as const,
    progress: 25,
    lastUpdated: Timestamp.now(),
    forms: [
      { name: 'CS Member Summary', status: 'Completed', type: 'Form', href: '/forms/cs-summary-form' },
      { name: 'HIPAA Authorization', status: 'Pending', type: 'online-form', href: '/forms/hipaa-authorization' },
    ],
};

const fakeCompletedApplicationTemplate = {
    ...fakeApplicationTemplate,
    memberFirstName: 'Complete',
    memberLastName: 'Test',
    memberCounty: 'San Diego',
    switchingHealthPlan: null,
    meetsPathwayCriteria: true,
    hasPrefRCFE: 'Yes',
    lastUpdated: Timestamp.now(),
};


export default function DbToolPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingComplete, setIsLoadingComplete] = useState(false);

    const handleLoadFakeData = async (template: typeof fakeApplicationTemplate, setLoading: (loading: boolean) => void, type: string) => {
        if (!user || !firestore) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'You must be logged in to use this tool.',
            });
            return;
        }

        setLoading(true);
        console.log(`Attempting to create fake ${type} application...`);

        try {
            const newAppId = doc(collection(firestore, `users/${user.uid}/applications`)).id;
            const docRef = doc(firestore, `users/${user.uid}/applications`, newAppId);
            
            const randomMrn = `MRN-${type.toUpperCase()}-${Math.floor(Math.random() * 100000)}`;

            const dataToSave = {
                ...template,
                id: newAppId,
                userId: user.uid,
                memberMrn: randomMrn,
                confirmMemberMrn: randomMrn,
                referrerFirstName: user.displayName?.split(' ')[0] || 'User',
                referrerLastName: user.displayName?.split(' ').slice(1).join(' ') || 'Name',
                referrerEmail: user.email || '',
                lastUpdated: serverTimestamp(),
            };
             const sanitizedData = Object.fromEntries(
                Object.entries(dataToSave).map(([key, value]) => [key, value === undefined ? null : value])
            );

            await setDoc(docRef, sanitizedData);
            console.log(`Successfully created fake ${type} application with ID: ${newAppId}`);

            toast({
                title: 'Success!',
                description: `Fake ${type} application (ID: ${newAppId}) has been added to your account.`,
                className: 'bg-green-100 text-green-900 border-green-200',
            });
        } catch (error: any) {
            console.error(`Error seeding ${type} database:`, error);
            toast({
                variant: 'destructive',
                title: 'Database Error',
                description: error.message || `Could not save the fake ${type} application.`,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Header />
            <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
                <div className="max-w-xl mx-auto">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Database className="h-6 w-6 text-primary" />
                                <CardTitle>Database Seeding Tool</CardTitle>
                            </div>
                            <CardDescription>
                                Use this tool to load sample data into your Firestore database for testing purposes.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2 p-4 border rounded-lg">
                                <h3 className="font-semibold">In-Progress Application</h3>
                                <p className="text-sm text-muted-foreground">
                                    Creates a new "In Progress" application with some data pre-filled. Useful for testing the form completion process.
                                </p>
                                <Button onClick={() => handleLoadFakeData(fakeApplicationTemplate, setIsLoading, 'in-progress')} disabled={isLoading || isUserLoading} className="w-full">
                                    {isLoading ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding Data...</>
                                    ) : ( 'Load Fake Application' )}
                                </Button>
                            </div>

                             <div className="space-y-2 p-4 border rounded-lg">
                                <h3 className="font-semibold">Complete Application</h3>
                                <p className="text-sm text-muted-foreground">
                                    Creates a new application with ALL fields filled out to pass validation. Useful for debugging form progression and submission.
                                </p>
                                <Button onClick={() => handleLoadFakeData(fakeCompletedApplicationTemplate, setIsLoadingComplete, 'complete')} disabled={isLoadingComplete || isUserLoading} className="w-full" variant="secondary">
                                    {isLoadingComplete ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding Data...</>
                                    ) : ( 'Load Fake Complete Application' )}
                                </Button>
                            </div>

                            {isUserLoading && <p className="text-sm text-center text-muted-foreground">Waiting for user session...</p>}
                        </CardContent>
                    </Card>
                </div>
            </main>
        </>
    );
}
