
'use client';

import React, { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2 } from 'lucide-react';
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
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, deleteDoc, Query, Timestamp, writeBatch } from 'firebase/firestore';
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
    // If the application is still being worked on, send the user back to the form to continue editing.
    if (app.status === 'In Progress' || app.status === 'Requires Revision') {
      return `/forms/cs-summary-form?applicationId=${app.id}`;
    }
    // For all other statuses, send them to the read-only pathway page.
    return `/pathway?applicationId=${app.id}`;
  };

  const getActionText = (app: ApplicationData) => {
     if (app.status === 'In Progress' || app.status === 'Requires Revision') {
      return 'Continue';
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
                <TableHead>Member / App ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Plan &amp; Pathway</TableHead>
                <TableHead className="hidden sm:table-cell">Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={onSelectionChange ? 6 : 5} className="h-24 text-center">
                    Loading applications...
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
                    <TableCell className="hidden md:table-cell">{app.healthPlan} - {app.pathway}</TableCell>
                    <TableCell className="hidden sm:table-cell">{app.lastUpdated ? format(app.lastUpdated.toDate(), 'MM/dd/yyyy') : 'N/A'}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={getActionLink(app)}>{getActionText(app)}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={onSelectionChange ? 6 : 5} className="h-24 text-center">
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


function AuthDebugPanel() {
    const { user, isUserLoading, userError } = useUser();

    const getStatus = () => {
        if (isUserLoading) return <span className="text-yellow-500">Loading...</span>;
        if (user) return <span className="text-green-500">Authenticated</span>;
        return <span className="text-red-500">Not Authenticated</span>;
    }

    return (
        <Card className="mt-6 bg-gray-800 text-white">
            <CardHeader>
                <CardTitle className="text-lg text-gray-300">Auth Debug Panel (User)</CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-xs space-y-2">
                <p><strong>Status:</strong> {getStatus()}</p>
                <p><strong>isUserLoading:</strong> {String(isUserLoading)}</p>
                <p><strong>User:</strong> {user ? user.email : 'null'}</p>
                 <p><strong>Error:</strong> {userError ? userError.message : 'null'}</p>
            </CardContent>
        </Card>
    )
}


export default function MyApplicationsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const applicationsQuery = useMemoFirebase(() => {
    if (isUserLoading || !user || !firestore) {
      return null;
    }
    return collection(firestore, `users/${user.uid}/applications`) as Query<ApplicationData>;
  }, [user, firestore, isUserLoading]);
  
  const { data: applications = [], isLoading: isLoadingApplications } = useCollection<ApplicationData>(applicationsQuery);

  const [selected, setSelected] = useState<string[]>([]);
  
  // NOTE: This effect is now disabled for debugging.
  // useEffect(() => {
  //   if (isUserLoading) return;

  //   if (!user) {
  //       router.push('/login');
  //       return;
  //   }
  // }, [user, isUserLoading, router]);

  if (isUserLoading) {
    return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }

  const inProgressApps = (applications || []).filter(
    app => app.status !== 'Completed & Submitted' && app.status !== 'Approved'
  );
  const completedApps = (applications || []).filter(
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
    selected.forEach(appId => {
        const docRef = doc(firestore, `users/${user.uid}/applications`, appId);
        batch.delete(docRef);
    });
    
    await batch.commit();
    setSelected([]);
  }

  return (
    <>
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
             <AuthDebugPanel />
        </div>


        <div className="space-y-8">
          <ApplicationsTable
            title="In Progress"
            applications={inProgressApps}
            onSelectionChange={handleSelectionChange}
            selection={selected}
            isLoading={isLoadingApplications}
          />
          <ApplicationsTable
            title="Completed"
            applications={completedApps}
            isLoading={isLoadingApplications}
          />
        </div>
      </main>
    </>
  );
}
