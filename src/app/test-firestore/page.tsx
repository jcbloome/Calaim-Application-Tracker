
'use client';

import { useState } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc, deleteDoc, collectionGroup, getDocs, query } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Beaker, ShieldCheck, ShieldAlert, FileWarning, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface TestResult {
    testName: string;
    status: 'success' | 'error';
    message: string;
}

export default function TestFirestorePage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [testDocId, setTestDocId] = useState<string | null>(null);

  const addResult = (result: TestResult) => {
    setResults(prev => [result, ...prev]);
  }

  const runTest = async (testName: string, testFn: () => Promise<string>) => {
    if (!firestore || !user) {
        toast({ variant: 'destructive', title: 'Not Ready', description: 'Please wait for user and Firestore to be initialized.' });
        return;
    }
    setIsLoading(testName);
    try {
        const successMessage = await testFn();
        addResult({ testName, status: 'success', message: successMessage });
    } catch (error: any) {
       // The permission error is emitted and thrown globally, but we can still log a local result.
       addResult({ testName, status: 'error', message: `Test failed. Check the error overlay for details. Generic message: ${error.message}` });
    } finally {
        setIsLoading(null);
    }
  }

  // --- Test Functions ---

  const testCreate = async (): Promise<string> => {
    const testCollectionRef = collection(firestore!, 'test_writes');
    const dataToWrite = {
      uid: user!.uid,
      email: user!.email,
      timestamp: serverTimestamp(),
      message: `Test write by ${user!.uid}`,
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
     if (!testDocId) {
        return "Skipped: Create a document first.";
     }
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
      const appsRef = collection(firestore!, `users/${user!.uid}/applications`);
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

  const testListAdmin = async (): Promise<string> => {
      const appsGroupRef = collectionGroup(firestore!, 'applications');
      const q = query(appsGroupRef);
      return new Promise((resolve, reject) => {
        getDocs(q)
            .then(snapshot => resolve(`Admin query successful. Listed ${snapshot.size} documents from 'applications' collection group.`))
            .catch(error => {
                const permissionError = new FirestorePermissionError({ path: 'applications', operation: 'list' });
                errorEmitter.emit('permission-error', permissionError);
                reject(permissionError);
            });
      });
  };


  const tests = [
    { name: '1. Create Document', fn: testCreate, description: "Writes to 'test_writes/{new_id}'." },
    { name: '2. Read Document', fn: testRead, description: "Reads from 'test_writes/{id}'." },
    { name: '3. Update Document', fn: testUpdate, description: "Updates 'test_writes/{id}'." },
    { name: '4. Delete Document', fn: testDelete, description: "Deletes 'test_writes/{id}'." },
    { name: '5. List User Apps', fn: testListUser, description: "Lists from 'users/{my_uid}/applications'." },
    { name: '6. List All Apps (Admin)', fn: testListAdmin, description: "Lists via collectionGroup('applications')." },
  ]

  return (
    <>
      <Header />
      <main className="flex-grow flex items-start justify-center bg-slate-50 p-4 sm:p-8">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                    <Beaker />
                    Firestore Permissions Test Suite
                    </CardTitle>
                    <CardDescription>
                    Run these tests sequentially to diagnose security rule issues. If a test fails, a detailed error log will appear as an overlay.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {!user && (
                         <div className="sm:col-span-2 lg:col-span-3">
                            <Alert variant="destructive">
                                <AlertTitle>Not Logged In</AlertTitle>
                                <AlertDescription>Please log in to run the tests.</AlertDescription>
                            </Alert>
                        </div>
                    )}
                    {tests.map(test => (
                        <div key={test.name} className="flex flex-col gap-2 p-4 border rounded-lg">
                           <h3 className="font-semibold">{test.name}</h3>
                           <p className="text-xs text-muted-foreground flex-grow">{test.description}</p>
                            <Button onClick={() => runTest(test.name, test.fn)} disabled={!!isLoading || !user} size="sm">
                            {isLoading === test.name ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Run Test
                            </Button>
                        </div>
                    ))}
                </CardContent>
            </Card>
            
            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle>Test Results</CardTitle>
                    <CardDescription>Results from the tests will appear here. The most recent result is at the top.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {results.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No tests run yet.</p>
                    ) : (
                        results.map((result, index) => (
                            <Alert key={index} variant={result.status === 'error' ? 'destructive' : 'default'} className={result.status === 'success' ? 'bg-green-50 border-green-200' : ''}>
                                {result.status === 'success' ? <ShieldCheck className="h-4 w-4" /> : <FileWarning className="h-4 w-4" />}
                                <AlertTitle>{result.testName} - {result.status === 'success' ? 'Passed' : 'Failed'}</AlertTitle>
                                <AlertDescription className="break-words text-xs">{result.message}</AlertDescription>
                            </Alert>
                        ))
                    )}
                </CardContent>
            </Card>

        </div>
      </main>
    </>
  );
}
