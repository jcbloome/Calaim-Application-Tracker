
'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collectionGroup, query, Query, doc, writeBatch } from 'firebase/firestore';
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

export default function AdminApplicationsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isUserLoading } = useUser();
  const [selected, setSelected] = useState<string[]>([]);

  const applicationsQuery = useMemoFirebase(() => {
    if (isUserLoading || !firestore) return null;
    return query(collectionGroup(firestore, 'applications')) as Query<Application & FormValues>;
  }, [firestore, isUserLoading]);

  const { data: applications, isLoading, error } = useCollection<Application & FormValues>(applicationsQuery);

  const handleSelectionChange = (id: string, checked: boolean) => {
    setSelected(prev => checked ? [...prev, id] : prev.filter(item => item !== id));
  };

  const handleDelete = async () => {
    if (!firestore || selected.length === 0) return;
    
    const batch = writeBatch(firestore);
    
    selected.forEach(id => {
      const appToDelete = applications?.find(app => app.id === id);
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
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle>All Applications</CardTitle>
            <CardDescription>Browse and manage all applications submitted to the platform.</CardDescription>
          </div>
           {selected.length > 0 && (
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
          {error && <p className="text-destructive">Error loading applications: {error.message}</p>}
          <AdminApplicationsTable 
            applications={applications || []} 
            isLoading={isLoading || isUserLoading}
            onSelectionChange={handleSelectionChange}
            selected={selected}
          />
        </CardContent>
      </Card>
    </div>
  );
}
