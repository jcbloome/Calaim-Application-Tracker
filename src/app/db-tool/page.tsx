
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, serverTimestamp, collection, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Database, Loader2 } from 'lucide-react';

// A complete sample application record that satisfies all validation
const fakeApplicationTemplate = {
    // Step 1: Member & Contact Info
    memberFirstName: 'Test',
    memberLastName: 'User',
    memberDob: Timestamp.fromDate(new Date(1960, 5, 15)),
    memberAge: 64,
    memberMediCalNum: '98765432A',
    confirmMemberMediCalNum: '98765432A',
    memberMrn: 'mrn-test-005',
    confirmMemberMrn: 'mrn-test-005',
    memberLanguage: 'English',
    referrerFirstName: 'Jason', // Populated by user profile
    referrerLastName: 'Bloome', // Populated by user profile
    referrerEmail: 'jason.bloome@example.com', // Populated by user profile
    referrerPhone: '(555) 123-4567',
    referrerRelationship: 'Social Worker',
    memberPhone: '(555) 987-6543',
    memberEmail: 'test.user@example.com',
    isBestContact: false,
    bestContactName: 'Best Contact',
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
    ispFirstName: 'ISP',
    ispLastName: 'Contact',
    ispRelationship: 'Coordinator',
    ispFacilityName: 'Community Services Center',
    ispPhone: '(555) 555-5555',
    ispEmail: 'isp@example.com',
    ispCopyCurrent: false,
    ispCopyCustomary: false,
    ispLocationType: 'Other',
    ispAddress: '789 Assessment Dr',
    ispCity: 'Planville',
    ispState: 'CA',
    ispZip: '90213',
    ispCounty: 'Los Angeles',
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
    forms: [
      { name: 'CS Member Summary', status: 'Completed', type: 'Form', href: '/forms/cs-summary-form' },
      { name: 'HIPAA Authorization', status: 'Pending', type: 'Form', href: '/forms/hipaa-authorization' },
    ],
};


export default function DbToolPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const handleLoadFakeData = async () => {
        if (!user || !firestore) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'You must be logged in to use this tool.',
            });
            return;
        }

        setIsLoading(true);

        try {
            const newAppId = doc(collection(firestore, `users/${user.uid}/applications`)).id;
            const docRef = doc(firestore, `users/${user.uid}/applications`, newAppId);

            const dataToSave = {
                ...fakeApplicationTemplate,
                // Overwrite with dynamic data
                id: newAppId,
                userId: user.uid,
                referrerFirstName: user.displayName?.split(' ')[0] || 'User',
                referrerLastName: user.displayName?.split(' ')[1] || 'Name',
                referrerEmail: user.email || '',
                lastUpdated: serverTimestamp(),
            };
             // Sanitize data: convert undefined to null
            const sanitizedData = Object.fromEntries(
                Object.entries(dataToSave).map(([key, value]) => [key, value === undefined ? null : value])
            );

            await setDoc(docRef, sanitizedData);

            toast({
                title: 'Success!',
                description: `Fake application (ID: ${newAppId}) has been added to your account.`,
                className: 'bg-green-100 text-green-900 border-green-200',
            });
        } catch (error: any) {
            console.error('Error seeding database:', error);
            toast({
                variant: 'destructive',
                title: 'Database Error',
                description: error.message || 'Could not save the fake application.',
            });
        } finally {
            setIsLoading(false);
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
                        <CardContent>
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    Clicking the button below will create a new "In Progress" application under your user account with pre-filled data.
                                    This is useful for testing the "My Applications" page and the "Pathway" page without having to fill out the form manually each time.
                                </p>
                                <Button onClick={handleLoadFakeData} disabled={isLoading || isUserLoading} className="w-full">
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Adding Data...
                                        </>
                                    ) : (
                                        'Load Fake Application'
                                    )}
                                </Button>
                                {isUserLoading && <p className="text-sm text-center text-muted-foreground">Waiting for user session...</p>}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </>
    );
}
