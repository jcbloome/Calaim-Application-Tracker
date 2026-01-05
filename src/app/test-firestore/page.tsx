
'use client';

import { useState } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Beaker } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function TestFirestorePage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleWriteTest = async () => {
    if (!firestore) {
      setResult({ type: 'error', message: 'Firestore service is not available.' });
      return;
    }
    if (!user) {
      setResult({ type: 'error', message: 'You must be logged in to perform this test.' });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const testCollectionRef = collection(firestore, 'test_writes');
      const newDocRef = await addDoc(testCollectionRef, {
        uid: user.uid,
        email: user.email,
        timestamp: serverTimestamp(),
        message: 'This is a test write from the application.',
      });

      const successMessage = `Successfully wrote a document to Firestore with ID: ${newDocRef.id}`;
      setResult({ type: 'success', message: successMessage });
      toast({
        title: 'Write Successful!',
        description: successMessage,
      });

    } catch (error: any) {
      // This will catch any error, including permission errors from security rules
      const errorMessage = `An error occurred: ${error.message}`;
      setResult({ type: 'error', message: errorMessage });
      toast({
        variant: 'destructive',
        title: 'Write Failed',
        description: errorMessage,
      });
      console.error("Firestore write test failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Beaker />
              Firestore Write Test
            </CardTitle>
            <CardDescription>
              Click the button below to attempt to write a document to the `test_writes` collection in Firestore. This helps diagnose permission issues.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleWriteTest} disabled={isLoading || !user} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Test...
                </>
              ) : (
                'Run Write Test'
              )}
            </Button>
            {!user && (
                <Alert variant="destructive">
                    <AlertTitle>Not Logged In</AlertTitle>
                    <AlertDescription>Please log in to run the test.</AlertDescription>
                </Alert>
            )}
            {result && (
              <Alert variant={result.type === 'error' ? 'destructive' : 'default'} className={result.type === 'success' ? 'bg-green-50 border-green-200' : ''}>
                <AlertTitle>{result.type === 'success' ? 'Success' : 'Error'}</AlertTitle>
                <AlertDescription className="break-words">{result.message}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
