
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { collection, doc, writeBatch, getDocs, collectionGroup } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { AdminApplicationsTable } from './components/AdminApplicationsTable';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import { useAdmin } from '@/hooks/use-admin';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';


function AuthDebugPanel() {
    const { user, isAdmin, isSuperAdmin, isLoading } = useAdmin();

    const getStatus = () => {
        if (isLoading) return <span className="text-yellow-500">Loading...</span>;
        if (user) return <span className="text-green-500">Authenticated</span>;
        return <span className="text-red-500">Not Authenticated</span>;
    }

    return (
        <Card className="mt-6 bg-gray-900 text-white">
            <CardHeader>
                <CardTitle className="text-lg text-gray-300">Auth Debug Panel (Admin)</CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-xs space-y-2">
                <p><strong>Status:</strong> {getStatus()}</p>
                <p><strong>isLoading:</strong> {String(isLoading)}</p>
                <p><strong>User:</strong> {user ? user.email : 'null'}</p>
                <p><strong>isAdmin:</strong> {String(isAdmin)}</p>
                <p><strong>isSuperAdmin:</strong> {String(isSuperAdmin)}</p>
            </CardContent>
        </Card>
    )
}

export default function AdminApplicationsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isAdmin, isSuperAdmin, isLoading: isAdminLoading, user } = useAdmin();
  const [selected, setSelected] = useState<string[]>([]);
  const [allApplications, setAllApplications] = useState<(Application & FormValues)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAllApplications = useCallback(async () => {
    if (!firestore || !isAdmin) {
      if (!isAdminLoading) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const appsQuery = collectionGroup(firestore, 'applications');
      const snapshot = await getDocs(appsQuery).catch(e => {
          errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applications (collection group)', operation: 'list' }));
          throw e;
      });

      const apps = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as (Application & FormValues)[];
      setAllApplications(apps);
      
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [firestore, isAdmin, isAdminLoading]);

  useEffect(() => {
    fetchAllApplications();
  }, [fetchAllApplications]);


  const handleSelectionChange = (id: string, checked: boolean) => {
    setSelected(prev => checked ? [...prev, id] : prev.filter(item => item !== id));
  };

  const handleDelete = async () => {
    if (!firestore || selected.length === 0) return;
    
    const batch = writeBatch(firestore);
    
    selected.forEach(id => {
      const appToDelete = allApplications?.find(app => app.id === id);
      if (appToDelete?.userId) {
          const docRef = doc(firestore, `users/${appToDelete.userId}/applications`, id);
          batch.delete(docRef);
      }
    });

    try {
      await batch.commit();
      toast({
        title: 'Applications Deleted',
        description: `${selected.length} application(s) have been successfully deleted.`,
      });
      // Refetch data
       setAllApplications(prev => prev.filter(app => !selected.includes(app.id)));
      setSelected([]);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Could not delete applications: ${error.message}`,
      });
    }
  };


  return (
    <div className="space-y-6">
       {isSuperAdmin && <AuthDebugPanel />}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle>All Applications</CardTitle>
            <CardDescription>Browse and manage all applications submitted to the platform.</CardDescription>
          </div>
           {selected.length > 0 && isSuperAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete ({selected.length})
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete {selected.length} application(s).
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>
                        Continue
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent>
          {error && <p className="text-destructive">Error loading applications: A permission error occurred while fetching data.</p>}
          <AdminApplicationsTable 
            applications={allApplications || []} 
            isLoading={isLoading || isAdminLoading}
            onSelectionChange={isSuperAdmin ? handleSelectionChange : undefined}
            selected={isSuperAdmin ? selected : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
