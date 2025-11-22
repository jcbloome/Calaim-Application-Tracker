
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Database, Loader2 } from 'lucide-react';

// A sample application record to be used as a template
const fakeApplicationTemplate = {
    memberFirstName: 'Test',
    memberLastName: 'User',
    status: 'In Progress' as const,
    pathway: 'SNF Diversion' as const,
    healthPlan: 'Health Net',
    progress: 25,
    forms: [
      { name: 'CS Member Summary', status: 'Completed', type: 'Form', href: '/forms/cs-summary-form' },
      { name: 'HIPAA Authorization', status: 'Pending', type: 'Form', href: '/forms/hipaa-authorization' },
    ],
    // Add other fields from your FormValues schema with default/fake values
    memberDob: new Date(1960, 5, 15),
    memberMediCalNum: '987654321',
    memberMrn: 'MRN-TEST-001',
    currentLocation: 'Home',
    currentAddress: '123 Test St',
    currentCity: 'Testville',
    currentState: 'CA',
    currentZip: '90210',
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
                id: newAppId,
                userId: user.uid,
                lastUpdated: serverTimestamp(),
            };

            await setDoc(docRef, dataToSave);

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
                                    Clicking the button below will create a new "In Progress" application under your user account.
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
