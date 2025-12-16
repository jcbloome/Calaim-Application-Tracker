
'use client';

import React from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useFirestore } from '@/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
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
import { useToast } from '@/hooks/use-toast';
import { Trash2 } from 'lucide-react';
import type { Application, FormStatus } from '@/lib/definitions';
import type { WithId } from '@/firebase';

type ApplicationStatusType = Application['status'];

const getBadgeVariant = (status: ApplicationStatusType) => {
  switch (status) {
    case 'Approved':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'Completed & Submitted':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Requires Revision':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'In Progress':
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};


export const AdminApplicationsTable = ({
  applications,
  isLoading,
}: {
  applications: WithId<Application>[];
  isLoading: boolean;
}) => {
    const firestore = useFirestore();
    const { toast } = useToast();

    const handleDelete = async (userId: string, appId: string) => {
        if (!firestore) return;
        const docRef = doc(firestore, `users/${userId}/applications`, appId);
        try {
            await deleteDoc(docRef);
            toast({
                title: 'Application Deleted',
                description: `Application ${appId} has been successfully deleted.`,
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: `Could not delete application: ${error.message}`,
            });
        }
    };
    
    // Sort applications by lastUpdated timestamp, most recent first
    const sortedApplications = [...applications].sort((a, b) => {
        const dateA = a.lastUpdated?.toMillis() || 0;
        const dateB = b.lastUpdated?.toMillis() || 0;
        return dateB - dateA;
    });

  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member / App ID</TableHead>
            <TableHead>Submitted By (User ID)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Last Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                Loading applications...
              </TableCell>
            </TableRow>
          ) : sortedApplications.length > 0 ? (
            sortedApplications.map(app => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">
                  <div>{`${app.memberFirstName} ${app.memberLastName}`}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{app.id}</div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{app.referrerName || 'N/A'}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{app.userId}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getBadgeVariant(app.status)}>
                    {app.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                    {app.lastUpdated ? format(app.lastUpdated.toDate(), 'MM/dd/yyyy p') : 'N/A'}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/pathway?applicationId=${app.id}`}>View</Link>
                  </Button>
                   <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className='h-8 w-8'>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the application
                                for {app.memberFirstName} {app.memberLastName}.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(app.userId!, app.id)}>
                                Continue
                            </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                No applications found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};
