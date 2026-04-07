'use client';

import React, { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, Bell, Mail, Plus, ArrowRight, CheckCircle2, Clock, AlertCircle, CheckCheck, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ApplicationListSkeleton } from '@/components/ui/application-skeleton';
import { useAuth, useUser, useFirestore, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';


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
    revisionRequestedAt?: unknown;
    revisionRequestedReason?: string;
  }>;
}

type ApplicationStatus = 'In Progress' | 'Completed & Submitted' | 'Requires Revision' | 'Approved';

const STATUS_CONFIG: Record<ApplicationStatus, {
  label: string;
  description: string;
  icon: React.ElementType;
  badgeClass: string;
  iconClass: string;
}> = {
  'In Progress': {
    label: 'In Progress',
    description: 'Keep going — your application is not yet submitted.',
    icon: Clock,
    badgeClass: 'bg-gray-100 text-gray-800 border-gray-200',
    iconClass: 'text-gray-500',
  },
  'Requires Revision': {
    label: 'Requires Revision',
    description: 'Staff found items that need your attention.',
    icon: AlertCircle,
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    iconClass: 'text-yellow-600',
  },
  'Completed & Submitted': {
    label: 'Submitted',
    description: 'Your application is with our team for review.',
    icon: CheckCircle2,
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    iconClass: 'text-blue-600',
  },
  'Approved': {
    label: 'Approved',
    description: 'Your application has been approved!',
    icon: CheckCheck,
    badgeClass: 'bg-green-100 text-green-800 border-green-200',
    iconClass: 'text-green-600',
  },
};

const getPendingRevisionCount = (app: ApplicationData): number => {
  return (app.forms || []).filter((form) => {
    if (form.status !== 'Pending') return false;
    return Boolean(String((form as any).revisionRequestedAt || '').trim()) || Boolean(String((form as any).revisionRequestedReason || '').trim());
  }).length;
};

const getCompletionProgress = (app: ApplicationData): { completed: number; total: number } => {
  const forms = app.forms || [];
  if (forms.length === 0) return { completed: 0, total: 1 };
  const completed = forms.filter(f => f.status === 'Completed').length;
  return { completed, total: forms.length };
};

const getActionLink = (app: ApplicationData) => {
  if (app.status === 'In Progress' || app.status === 'Requires Revision') {
    const csSummaryForm = (app as any).forms?.find((form: any) =>
      form.name === 'CS Member Summary' || form.name === 'CS Summary'
    );
    if (csSummaryForm?.status === 'Completed') {
      return `/pathway?applicationId=${app.id}`;
    }
    return `/forms/cs-summary-form?applicationId=${app.id}`;
  }
  return `/pathway?applicationId=${app.id}`;
};

const getActionText = (app: ApplicationData) => {
  if (app.status === 'Approved' || app.status === 'Completed & Submitted') return 'View Application';
  const revisionCount = getPendingRevisionCount(app);
  if (revisionCount > 0) return `Review Revisions (${revisionCount})`;
  const csSummaryForm = app.forms?.find(form =>
    form.name === 'CS Member Summary' || form.name === 'CS Summary'
  );
  if (csSummaryForm?.status === 'Completed') return 'Continue to Pathway';
  return 'Continue Application';
};

function ApplicationCard({
  app,
  onDelete,
}: {
  app: ApplicationData;
  onDelete?: (app: ApplicationData) => void;
}) {
  const statusConfig = STATUS_CONFIG[app.status] ?? STATUS_CONFIG['In Progress'];
  const StatusIcon = statusConfig.icon;
  const revisionCount = getPendingRevisionCount(app);
  const { completed, total } = getCompletionProgress(app);
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isActive = app.status === 'In Progress' || app.status === 'Requires Revision';

  return (
    <Card className={`transition-shadow hover:shadow-md ${app.status === 'Requires Revision' ? 'border-yellow-300' : app.status === 'Approved' ? 'border-green-300' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold truncate">
              {app.memberFirstName} {app.memberLastName}
            </h3>
            <p className="text-sm text-muted-foreground">
              {app.healthPlan} &middot; {app.pathway}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {app.statusRemindersEnabled !== false && (
              <Bell className="h-4 w-4 text-blue-400" title="Status reminders on" />
            )}
            {app.emailRemindersEnabled && (
              <Mail className="h-4 w-4 text-green-400" title="Email reminders on" />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Status row */}
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-4 w-4 shrink-0 ${statusConfig.iconClass}`} />
          <Badge variant="outline" className={statusConfig.badgeClass}>
            {statusConfig.label}
          </Badge>
          {revisionCount > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-xs">
              {revisionCount} item{revisionCount > 1 ? 's' : ''} to fix
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{statusConfig.description}</p>

        {/* Progress bar (only while active) */}
        {isActive && total > 0 && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> Requirements</span>
              <span>{completed} of {total} complete</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>
        )}

        {/* Last updated */}
        <p className="text-xs text-muted-foreground">
          Last updated: {app.lastUpdated ? format(app.lastUpdated.toDate(), 'MMM d, yyyy') : 'recently'}
        </p>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-2 gap-2">
        <Button asChild size="sm" className={`flex-1 ${isActive && app.status !== 'Requires Revision' ? '' : ''}`}>
          <Link href={getActionLink(app)} className="flex items-center justify-center gap-1">
            {getActionText(app)}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-2"
            onClick={() => onDelete(app)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function DeleteConfirmDialog({
  app,
  open,
  onOpenChange,
  onConfirm,
}: {
  app: ApplicationData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const [confirmName, setConfirmName] = useState('');
  const expectedName = app ? app.memberFirstName : '';
  const isMatch = confirmName.trim().toLowerCase() === expectedName.toLowerCase();

  useEffect(() => {
    if (!open) setConfirmName('');
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this application?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span className="block">
              This will permanently delete the application for{' '}
              <strong>{app?.memberFirstName} {app?.memberLastName}</strong>. This cannot be undone.
            </span>
            <span className="block">
              To confirm, type the member&apos;s first name below:
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-1 pb-2">
          <Label htmlFor="confirm-name" className="text-sm text-muted-foreground mb-1 block">
            Member first name: <strong>{expectedName}</strong>
          </Label>
          <Input
            id="confirm-name"
            value={confirmName}
            onChange={e => setConfirmName(e.target.value)}
            placeholder={`Type "${expectedName}" to confirm`}
            className={isMatch ? 'border-green-400' : ''}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!isMatch}
            className="bg-destructive hover:bg-destructive/90 disabled:opacity-40"
          >
            Delete Application
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function MyApplicationsPage() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { isAdmin, isSuperAdmin } = useAdmin();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const applicationsQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/applications`) as Query<ApplicationData>;
  }, [firestore, user]);

  const { data, isLoading: isLoadingApplications, error } = useCollection<ApplicationData>(applicationsQuery);
  const applications = data || [];

  const [pendingDelete, setPendingDelete] = useState<ApplicationData | null>(null);
  const [hasAttemptedClaim, setHasAttemptedClaim] = useState(false);

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) router.push('/login');
    if (user && (isAdmin || isSuperAdmin)) router.push('/admin');
  }, [user, isUserLoading, router, isAdmin, isSuperAdmin]);

  useEffect(() => {
    const claimStartedApps = async () => {
      if (!auth || !user || isUserLoading || isAdmin || isSuperAdmin || hasAttemptedClaim) return;
      setHasAttemptedClaim(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const [firstName = '', ...lastNameParts] = String(user.displayName || '').trim().split(' ');
        const response = await fetch('/api/applications/claim-admin-started', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ firstName, lastName: lastNameParts.join(' ') }),
        });
        if (!response.ok) return;
        const result = await response.json().catch(() => null);
        const claimedCount = Number(result?.claimedCount || 0);
        if (claimedCount > 0) {
          toast({
            title: 'Application linked',
            description: `${claimedCount} application(s) were linked to your account.`,
          });
        }
      } catch {
        // silent
      }
    };
    claimStartedApps();
  }, [auth, user, isUserLoading, isAdmin, isSuperAdmin, hasAttemptedClaim, toast]);

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
  ).sort((a, b) => {
    const aMs = a.lastUpdated?.toDate?.().getTime?.() || 0;
    const bMs = b.lastUpdated?.toDate?.().getTime?.() || 0;
    return bMs - aMs;
  });

  const mostRecentInProgress = inProgressApps[0];

  const completedApps = applications.filter(
    app => app.status === 'Completed & Submitted' || app.status === 'Approved'
  ).sort((a, b) => {
    const aMs = a.lastUpdated?.toDate?.().getTime?.() || 0;
    const bMs = b.lastUpdated?.toDate?.().getTime?.() || 0;
    return bMs - aMs;
  });

  const handleDeleteConfirm = async () => {
    if (!user || !firestore || !pendingDelete) return;
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, `users/${user.uid}/applications`, pendingDelete.id));
    batch.commit().then(() => {
      toast({ title: 'Application deleted', description: `Application for ${pendingDelete.memberFirstName} has been removed.` });
      setPendingDelete(null);
    }).catch(() => {
      const permissionError = new FirestorePermissionError({ path: `users/${user.uid}/applications/${pendingDelete.id}`, operation: 'delete' });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  return (
    <ErrorBoundary>
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 max-w-5xl">
        {/* Page header */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">My Applications</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back, <strong>{user?.displayName || user?.email || 'Guest'}</strong>.
            </p>
          </div>
          <Button asChild>
            <Link href="/forms/cs-summary-form">
              <Plus className="mr-2 h-4 w-4" />
              Start New Application
            </Link>
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Error loading applications</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-10">
          {/* Resume banner */}
          {mostRecentInProgress && (
            <Alert className="border-blue-200 bg-blue-50">
              <AlertTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                Continue where you left off
              </AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-1">
                <span>
                  <strong>{mostRecentInProgress.memberFirstName} {mostRecentInProgress.memberLastName}</strong>
                  {' '}&mdash; last updated{' '}
                  {mostRecentInProgress.lastUpdated
                    ? format(mostRecentInProgress.lastUpdated.toDate(), 'MMM d, yyyy')
                    : 'recently'}.
                </span>
                <Button asChild size="sm" className="shrink-0">
                  <Link href={getActionLink(mostRecentInProgress)}>
                    Resume Application <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* In Progress */}
          {(isPageLoading || inProgressApps.length > 0) && (
            <section>
              <h2 className="text-lg font-semibold mb-3 text-gray-700">In Progress</h2>
              {isPageLoading ? (
                <ApplicationListSkeleton />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {inProgressApps.map(app => (
                    <ApplicationCard
                      key={app.id}
                      app={app}
                      onDelete={setPendingDelete}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Completed / Approved */}
          {(isPageLoading || completedApps.length > 0) && (
            <section>
              <h2 className="text-lg font-semibold mb-3 text-gray-700">Submitted &amp; Approved</h2>
              {isPageLoading ? (
                <ApplicationListSkeleton />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {completedApps.map(app => (
                    <ApplicationCard key={app.id} app={app} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Empty state */}
          {!isPageLoading && applications.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No applications yet</p>
              <p className="text-sm mt-1 mb-6">Start your first application to get the process going.</p>
              <Button asChild>
                <Link href="/forms/cs-summary-form">
                  <Plus className="mr-2 h-4 w-4" />
                  Start New Application
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Delete confirmation with name-match gate */}
        <DeleteConfirmDialog
          app={pendingDelete}
          open={!!pendingDelete}
          onOpenChange={open => { if (!open) setPendingDelete(null); }}
          onConfirm={handleDeleteConfirm}
        />
      </main>
    </ErrorBoundary>
  );
}
