'use client';

import React, { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, Bell, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ApplicationListSkeleton } from '@/components/ui/application-skeleton';
import { useUser, useFirestore, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, doc, Query, Timestamp, writeBatch } from 'firebase/firestore';
import { format } from 'date-fns';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';


// Define a type for the application data coming from Firestore
interface ApplicationData {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  status: ApplicationStatus;
  lastUpdated: Timestamp;
  pathway: 'SNF Transition' | 'SNF Diversion';
  healthPlan: 'Kaiser' | 'Health Net' | 'Other' | 'Kaiser Permanente';
  userId?: string;
  emailRemindersEnabled?: boolean;
  statusRemindersEnabled?: boolean;
  forms?: Array<{
    name: string;
    status: 'Pending' | 'Completed';
    type: string;
    href: string;
  }>;
}

type ApplicationStatus = 'In Progress' | 'Completed & Submitted' | 'Requires Revision' | 'Approved';

const getBadgeVariant = (status: ApplicationStatus) => {
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

const ApplicationsTable = ({
  title,
  applications,
  onSelectionChange,
  selection,
  isLoading,
}: {
  title: string;
  applications: ApplicationData[];
  onSelectionChange?: (id: string, isSelected: boolean) => void;
  selection?: string[];
  isLoading: boolean;
}) => {
  const getActionLink = (app: ApplicationData) => {
    // If the application is still being worked on, check if CS Summary is completed
    if (app.status === 'In Progress' || app.status === 'Requires Revision') {
      // Check if CS Member Summary form is completed
      const csSummaryForm = (app as any).forms?.find((form: any) => 
        form.name === 'CS Member Summary' || form.name === 'CS Summary'
      );
      
      // If CS Summary is completed, go directly to pathway
      if (csSummaryForm?.status === 'Completed') {
        return `/pathway?applicationId=${app.id}`;
      }
      
      // Otherwise, continue with CS Summary form
      return `/forms/cs-summary-form?applicationId=${app.id}`;
    }
    // For all other statuses, send them to the read-only pathway page.
    return `/pathway?applicationId=${app.id}`;
  };

  const getActionText = (app: ApplicationData) => {
    if (app.status === 'In Progress' || app.status === 'Requires Revision') {
      // Check if CS Member Summary form is completed
      const csSummaryForm = app.forms?.find(form => 
        form.name === 'CS Member Summary' || form.name === 'CS Summary'
      );
      
      // If CS Summary is completed, show "Continue to Pathway"
      if (csSummaryForm?.status === 'Completed') {
        return 'Continue to Pathway';
      }
      
      return 'Continue Form';
    }
    return 'View';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {onSelectionChange && <TableHead className="w-[50px] pl-4"></TableHead>}
                <TableHead>Member</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Plan &amp; Pathway</TableHead>
                <TableHead className="hidden sm:table-cell">Last Updated</TableHead>
                <TableHead className="hidden md:table-cell text-center">Notifications</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={onSelectionChange ? 7 : 6} className="h-24 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : applications.length > 0 ? (
                applications.map(app => (
                  <TableRow key={app.id}>
                    {onSelectionChange && (
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={selection?.includes(app.id)}
                          onCheckedChange={checked => onSelectionChange(app.id, !!checked)}
                          aria-label={`Select application for ${app.memberFirstName} ${app.memberLastName}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <div>{`${app.memberFirstName} ${app.memberLastName}`}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate max-w-[120px] sm:max-w-xs">{app.id}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getBadgeVariant(app.status)}>
                        {app.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{app.healthPlan} - {app.pathway}</TableCell>
                    <TableCell className="hidden sm:table-cell">{app.lastUpdated ? format(app.lastUpdated.toDate(), 'MM/dd/yyyy') : 'N/A'}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center justify-center gap-2">
                        <Bell 
                          className={`h-4 w-4 ${
                            app.statusRemindersEnabled !== false 
                              ? 'text-blue-600' 
                              : 'text-gray-300'
                          }`}
                          title={app.statusRemindersEnabled !== false ? 'Status reminders enabled' : 'Status reminders disabled'}
                        />
                        <Mail 
                          className={`h-4 w-4 ${
                            app.emailRemindersEnabled 
                              ? 'text-green-600' 
                              : 'text-gray-300'
                          }`}
                          title={app.emailRemindersEnabled ? 'Email reminders enabled' : 'Email reminders disabled'}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={getActionLink(app)}>{getActionText(app)}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={onSelectionChange ? 7 : 6} className="h-24 text-center">
                    No applications found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default function MyApplicationsPage() {
  const { user, isUserLoading } = useUser();
  const { isAdmin, isSuperAdmin } = useAdmin();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const applicationsQuery = useMemoFirebase(() => {
    if (!user || !firestore) {
      return null;
    }
    return collection(firestore, `users/${user.uid}/applications`) as Query<ApplicationData>;
  }, [firestore, user]);
  
  const { data, isLoading: isLoadingApplications, error } = useCollection<ApplicationData>(applicationsQuery);
  const applications = data || [];

  const [selected, setSelected] = useState<string[]>([]);
  
  useEffect(() => {
    if (isUserLoading) return; 
    if (!user) {
        router.push('/login');
    }
    // If an admin user lands here, redirect them to the admin dashboard
    if (user && (isAdmin || isSuperAdmin)) {
        router.push('/admin');
    }
  }, [user, isUserLoading, router, isAdmin, isSuperAdmin]);

  const isPageLoading = isUserLoading || isLoadingApplications;

  if (isUserLoading || !user || isAdmin || isSuperAdmin) {
    return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }

  const inProgressApps = applications.filter(
    app => app.status !== 'Completed & Submitted' && app.status !== 'Approved'
  );
  const completedApps = applications.filter(
    app => app.status === 'Completed & Submitted' || app.status === 'Approved'
  );


  const handleSelectionChange = (id: string, isSelected: boolean) => {
    setSelected(prev =>
      isSelected ? [...prev, id] : prev.filter(item => item !== id)
    );
  };
  
  const handleDelete = async () => {
    if (!user || !firestore || selected.length === 0) return;

    const batch = writeBatch(firestore);
    const docRefsToDelete = selected.map(appId => doc(firestore, `users/${user.uid}/applications`, appId));
    
    docRefsToDelete.forEach(docRef => {
      batch.delete(docRef);
    });
    
    batch.commit().then(() => {
        toast({
            title: 'Applications Deleted',
            description: `${selected.length} application(s) have been successfully deleted.`
        });
        setSelected([]);
    }).catch(error => {
        // Create and emit a contextual error for each failed deletion.
        docRefsToDelete.forEach(docRef => {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'delete'
            });
            errorEmitter.emit('permission-error', permissionError);
        });
    });
  }

  return (
    <ErrorBoundary>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
        <div className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1">
                    <h1 className="text-3xl font-bold">My Applications</h1>
                    <p className="text-muted-foreground mt-1">
                        Welcome, <strong>{user?.displayName || user?.email || 'Guest'}</strong>.
                    </p>
                </div>
                <div className="flex items-center gap-2 self-stretch sm:self-center flex-wrap">
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
                            <AlertDialogAction onClick={handleDelete}>Continue</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Button asChild>
                    <Link href="/forms/cs-summary-form">
                        <Plus className="mr-2 h-4 w-4" /> Start New Application
                    </Link>
                    </Button>
                </div>
            </div>
        </div>

        {error && 
            <Alert variant="destructive" className="mb-4">
                <AlertTitle>Data Fetching Error</AlertTitle>
                <AlertDescription>
                    <p>There was an error loading your applications. This is likely a security rule issue. The detailed error is below:</p>
                    <pre className="mt-2 whitespace-pre-wrap text-xs font-mono bg-destructive/10 p-2 rounded">
                        {error.message}
                    </pre>
                </AlertDescription>
            </Alert>
        }

        <div className="space-y-8">
          <ApplicationsTable
            title="In Progress"
            applications={inProgressApps}
            onSelectionChange={handleSelectionChange}
            selection={selected}
            isLoading={isPageLoading}
          />
          <ApplicationsTable
            title="Completed"
            applications={completedApps}
            isLoading={isPageLoading}
          />
        </div>
      </main>
    </ErrorBoundary>
  );
}
