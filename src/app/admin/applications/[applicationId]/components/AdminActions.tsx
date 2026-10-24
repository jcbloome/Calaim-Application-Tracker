'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, Mail, Calendar as CalendarIcon, List, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Application } from '@/lib/definitions';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { arrayUnion, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { firebaseAuthHeaders } from '@/lib/admin-fetch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  AlertDialog,
  AlertDialogTitle,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { DEFAULT_COORDINATOR_EMAIL, HEALTH_NET_MANAGER_EMAIL, HEALTH_NET_MANAGER_SIGNATURE } from './application-status-config';

export function getReminderMissingItems(application: Application | null): string[] {
  const forms = Array.isArray((application as any)?.forms) ? ((application as any).forms as any[]) : [];
  if (forms.length === 0) return [];
  const internalExclusions = new Set([
    'eligibility screenshot',
    'eligibility check',
    'room and board/tier level agreement',
    'room and board/tier level commitment',
    'room and board commitment',
  ]);
  return forms
    .filter((form: any) => {
      const name = String(form?.name || '').trim();
      if (!name) return false;
      if (name === 'CS Member Summary' || name === 'CS Summary') return false;
      if (internalExclusions.has(name.toLowerCase())) return false;
      if (String(form?.type || '').trim().toLowerCase() === 'info') return false;
      return String(form?.status || '').trim() !== 'Completed';
    })
    .map((form: any) => String(form?.name || '').trim())
    .filter(Boolean);
}

export function AdminActions({ application }: { application: Application }) {
    const { isAdmin, isSuperAdmin, user: adminUser } = useAdmin();
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<Application['status'] | ''>('');
    const [adminProcessingStatus, setAdminProcessingStatus] = useState<NonNullable<Application['adminProcessingStatus']> | ''>(
      (application.adminProcessingStatus as NonNullable<Application['adminProcessingStatus']>) || ''
    );
    const [adminProcessingReason, setAdminProcessingReason] = useState<string>(String(application.adminProcessingReason || ''));
    const [isSending, setIsSending] = useState(false);
    const [isSavingAdminProcessing, setIsSavingAdminProcessing] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    // Schedule next step in calendar
    const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
    const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
    const [scheduleTitle, setScheduleTitle] = useState('');
    const [scheduleNotes, setScheduleNotes] = useState('');
    const [schedulePriority, setSchedulePriority] = useState<'high' | 'medium' | 'low'>('medium');
    const [isSavingSchedule, setIsSavingSchedule] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const getManagerSignatureMeta = () => {
      const normalizedPlan = String((application as any)?.healthPlan || '').trim().toLowerCase();
      const isKaiser = normalizedPlan.includes('kaiser');
      const isHealthNet = normalizedPlan.includes('health net') || normalizedPlan.includes('healthnet');
      const managerName = isHealthNet
        ? HEALTH_NET_MANAGER_SIGNATURE
        : String((application as any)?.assignedStaffName || '').trim() ||
          String((application as any)?.assignedToName || '').trim() ||
          String(adminUser?.displayName || adminUser?.email || 'The Connections Team').trim();
      const managerEmail = isHealthNet
        ? HEALTH_NET_MANAGER_EMAIL
        : String((application as any)?.assignedStaffEmail || '').trim() ||
          String(adminUser?.email || '').trim() ||
          DEFAULT_COORDINATOR_EMAIL;
      const managerTitle = isKaiser ? 'Kaiser Care Coordinator' : 'Health Net Care Coordinator';
      return { managerName, managerEmail, managerTitle, isHealthNet };
    };

    const firestore = useFirestore();
    const userDocRef = useMemoFirebase(() => {
        if (!firestore || !application.userId || !application.id) return null;
        return doc(firestore, `users/${application.userId}/applications`, application.id);
    }, [firestore, application.id, application.userId]);
    const adminDocRef = useMemoFirebase(() => {
      if (!firestore || !application.id) return null;
      return doc(firestore, 'applications', application.id);
    }, [firestore, application.id]);
    const isAdminSource =
      (application as any)?.source === 'admin' ||
      application.id.startsWith('admin_app_') ||
      !application.userId;

    const kaiserStatusOptions: Application['status'][] = [
        'Application in Review',
        'Authorization Requested',
        'Authorization Received (Doc Collection)',
        'RN/Visit Scheduled',
        'Tier Level Requested',
        'Tier Level Recieved',
        'Locating RCFEs',
        'RCFE Found',
        'Room and Board Committment Letter Required',
        'Room and Board Letter Completed',
        'RCFE Connected with ILS for Contracting',
        'RCFE Contract Received',
        '(Ready for Placement)',
        'Member Placed at RCFE',
    ];

    const standardStatusOptions: Application['status'][] = [
        'In Progress',
        'Requires Revision',
        'Approved',
        'Completed & Submitted',
    ];

    const statusOptions = application.healthPlan?.toLowerCase().includes('kaiser')
        ? kaiserStatusOptions
        : standardStatusOptions;

    const adminProcessingStatusOptions: Array<NonNullable<Application['adminProcessingStatus']>> = [
      'In Process',
      'On Hold',
      'Pending Documents',
      'Pending Authorization',
      'Pending Placement',
      'Ready for Placement',
      'Closed',
    ];
    const adminProcessingHistory = Array.isArray((application as any)?.adminProcessingHistory)
      ? ((application as any).adminProcessingHistory as Array<{
          status?: string;
          reason?: string;
          updatedBy?: string;
          updatedAtIso?: string;
        }>)
      : [];
    const caspioSentDate = (application as any)?.caspioSentDate;
    const caspioSentLabel = caspioSentDate
      ? format(
          typeof caspioSentDate?.toDate === 'function' ? caspioSentDate.toDate() : new Date(caspioSentDate),
          'MMM d, yyyy h:mm a'
        )
      : 'Date unavailable';
    const caspioSentByLabel = String(
      (application as any)?.caspioSentByName ||
      (application as any)?.caspioSentBy ||
      (application as any)?.caspioSentByEmail ||
      ''
    ).trim();

    if (!isAdmin && !isSuperAdmin) {
        return null;
    }

    const saveToApplicationDocs = async (payload: Record<string, unknown>) => {
      const writes: Array<Promise<void>> = [];
      if (userDocRef) {
        writes.push(setDoc(userDocRef, payload, { merge: true }));
      }
      if (isAdminSource && adminDocRef) {
        writes.push(setDoc(adminDocRef, payload, { merge: true }));
      }
      if (!writes.length) {
        throw new Error('No writable application document found.');
      }
      await Promise.all(writes);
    };

    const sendEmailAndUpdateStatus = async () => {
        if (!status) {
             toast({ variant: 'destructive', title: 'Error', description: 'Please select a status before sending.' });
            return;
        }

        if (status === 'Requires Revision' && !notes) {
            toast({ variant: 'destructive', title: 'Error', description: 'Notes are required when requesting a revision.' });
            return;
        }
        
        if (!application.referrerEmail) {
            toast({ variant: 'destructive', title: 'Error', description: 'Referrer email is not available for this application.' });
            return;
        }

        setIsSending(true);

        try {
            const signatureMeta = getManagerSignatureMeta();
            const surveyUrl =
              status === 'Approved'
                ? `${window.location.origin.replace(/\/$/, '')}/forms/customer-feedback?applicationId=${encodeURIComponent(String(application.id || ''))}`
                : undefined;
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: {
                    ...(await firebaseAuthHeaders()),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: application.referrerEmail,
                    includeBcc: false,
                    subject: `Update on CalAIM Application for ${application.memberFirstName} ${application.memberLastName}`,
                    memberName: application.referrerName || 'there',
                    staffName: signatureMeta.managerName,
                    staffTitle: signatureMeta.managerTitle,
                    staffEmail: signatureMeta.managerEmail,
                    message: notes || 'Your application status has been updated. Please log in to your dashboard for more details.',
                    status: status as any, // Cast because we know it's valid
                    surveyUrl,
                    healthPlan: String(application.healthPlan || ''),
                }),
            });
            
            const result = await response.json();
            
            if (result.success) {
                await saveToApplicationDocs({ status, lastUpdated: serverTimestamp() });

                // Pathway RN visit scheduled → Caspio client notes
                try {
                  if (String(status).toLowerCase().includes('visit scheduled') && adminUser?.getIdToken) {
                    const idToken = await adminUser.getIdToken();
                    const clientId2 = String(
                      (application as any)?.clientId2 ||
                        (application as any)?.client_ID2 ||
                        (application as any)?.caspioClientId2 ||
                        ''
                    ).trim();
                    void fetch('/api/admin/caspio/append-rn-visit-note', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        idToken,
                        applicationId: application.id,
                        clientId2: clientId2 || undefined,
                        event: 'rn_visit_scheduled',
                        statusLabel: status,
                      }),
                    }).catch(() => null);
                  }
                } catch {
                  // best-effort
                }

                toast({
                    title: 'Success!',
                    description: `Application status set to "${status}" and email sent to ${application.referrerEmail}.`,
                    className: 'bg-green-100 text-green-900',
                });
                setNotes('');
                setStatus('');
            } else {
                throw new Error(result.message);
            }

        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Email Error',
                description: `Could not send email: ${error.message}`,
            });
        } finally {
            setIsSending(false);
        }
    };

    const saveAdminProcessingStatus = async () => {
      if (!adminProcessingStatus) {
        toast({
          variant: 'destructive',
          title: 'Status required',
          description: 'Please select an internal processing status.',
        });
        return;
      }
      if (!adminProcessingReason.trim()) {
        toast({
          variant: 'destructive',
          title: 'Reason required',
          description: 'Please provide a reason for this internal processing status.',
        });
        return;
      }

      setIsSavingAdminProcessing(true);
      try {
        await saveToApplicationDocs({
          adminProcessingStatus,
          adminProcessingReason: adminProcessingReason.trim(),
          adminProcessingUpdatedAt: serverTimestamp(),
          adminProcessingUpdatedBy: adminUser?.displayName || adminUser?.email || 'Admin',
          adminProcessingUpdatedByUid: adminUser?.uid || null,
          adminProcessingHistory: arrayUnion({
            status: adminProcessingStatus,
            reason: adminProcessingReason.trim(),
            updatedBy: adminUser?.displayName || adminUser?.email || 'Admin',
            updatedByUid: adminUser?.uid || null,
            updatedAtIso: new Date().toISOString(),
          }),
          lastUpdated: serverTimestamp(),
        });
        toast({
          title: 'Internal status saved',
          description: `Internal status set to "${adminProcessingStatus}".`,
          className: 'bg-green-100 text-green-900',
        });
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Save failed',
          description: error?.message || 'Could not save internal processing status.',
        });
      } finally {
        setIsSavingAdminProcessing(false);
      }
    };

    const handleScheduleTask = async () => {
      if (!scheduleDate) {
        toast({ variant: 'destructive', title: 'Date required', description: 'Please select a date for this calendar entry.' });
        return;
      }
      const title = scheduleTitle.trim() || `Follow up: ${application.memberFirstName} ${application.memberLastName}`.trim();
      setIsSavingSchedule(true);
      try {
        const dueDateStr = scheduleDate.toISOString().split('T')[0];
        const response = await fetch('/api/daily-tasks', {
          method: 'POST',
          headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description: scheduleNotes.trim(),
            memberName: `${application.memberFirstName || ''} ${application.memberLastName || ''}`.trim(),
            healthPlan: application.healthPlan || '',
            assignedTo: adminUser?.uid || '',
            assignedToName: adminUser?.displayName || adminUser?.email || 'Admin',
            priority: schedulePriority,
            dueDate: dueDateStr,
            createdBy: adminUser?.uid || '',
            applicationId: application.id,
            applicationLink: `/admin/applications/${application.id}`,
            source: 'application',
          }),
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to create calendar entry');
        toast({ title: 'Added to calendar', description: `Scheduled for ${format(scheduleDate, 'MMM d, yyyy')}`, className: 'bg-green-100 text-green-900' });
        setIsScheduleDialogOpen(false);
        setScheduleDate(undefined);
        setScheduleTitle('');
        setScheduleNotes('');
        setSchedulePriority('medium');
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error?.message || 'Could not add to calendar.' });
      } finally {
        setIsSavingSchedule(false);
      }
    };

    const handleDeleteApplication = async () => {
        if (!firestore) {
            toast({ variant: 'destructive', title: 'Error', description: 'Firestore not available.' });
            return;
        }

        try {
            const idToken = await adminUser?.getIdToken?.();
            if (!idToken) throw new Error('Unable to verify admin session. Please refresh and retry.');
            const response = await fetch('/api/admin/applications/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                idToken,
                applicationId: application.id,
                userId: String(application.userId || '').trim() || null,
              }),
            });
            const result = await response.json().catch(() => ({} as any));
            if (!response.ok || !result?.success) {
              throw new Error(String(result?.error || `Delete failed (${response.status})`));
            }

            toast({
                title: 'Application Deleted',
                description: 'The application has been removed.',
                className: 'bg-green-100 text-green-900 border-green-200',
            });
            router.push('/admin/applications');
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Delete Failed',
                description: error.message || 'Could not delete the application.',
            });
        }
    };

    return (
        <Dialog>
            <Card>
                <CardHeader
                    className="cursor-pointer select-none"
                    onClick={() => setIsOpen((prev) => !prev)}
                    role="button"
                    aria-expanded={isOpen}
                >
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <CardTitle>Admin Actions</CardTitle>
                            <CardDescription>Update status and notify the referrer.</CardDescription>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                    </div>
                </CardHeader>
                {isOpen && (
                <CardContent className="space-y-3">
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Internal Processing Status</p>
                      <p className="mt-1 text-sm text-blue-900">
                        <strong>{String((application as any)?.adminProcessingStatus || 'Not set')}</strong>
                      </p>
                      <p className="mt-1 text-xs text-blue-800 break-words">
                        {String((application as any)?.adminProcessingReason || 'No reason on file.')}
                      </p>
                    </div>
                    {adminProcessingHistory.length > 0 ? (
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal Status History</p>
                        <div className="mt-2 max-h-40 overflow-y-auto space-y-2 pr-1">
                          {[...adminProcessingHistory].reverse().map((entry, index) => (
                            <div key={`admin-history-${index}`} className="rounded border bg-background p-2">
                              <p className="text-xs font-medium">
                                {String(entry?.status || 'Unknown status')}
                                {' '}
                                <span className="text-muted-foreground font-normal">
                                  {entry?.updatedAtIso ? `• ${format(new Date(entry.updatedAtIso), 'MM/dd/yyyy h:mm a')}` : ''}
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground break-words mt-1">
                                {String(entry?.reason || 'No reason')}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                By: {String(entry?.updatedBy || 'Admin')}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">Update Status</Button>
                    </DialogTrigger>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="secondary" className="w-full">Set Internal Processing Status</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Internal Processing Status</DialogTitle>
                          <DialogDescription>Set admin tracking status (notifies no one by default).</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="admin-processing-status-select">Processing Status</Label>
                            <Select
                              value={adminProcessingStatus}
                              onValueChange={(value) =>
                                setAdminProcessingStatus(value as NonNullable<Application['adminProcessingStatus']>)
                              }
                            >
                              <SelectTrigger id="admin-processing-status-select">
                                <SelectValue placeholder="Select internal status..." />
                              </SelectTrigger>
                              <SelectContent>
                                {adminProcessingStatusOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="admin-processing-reason">Reason</Label>
                            <Textarea
                              id="admin-processing-reason"
                              placeholder="Required: add context (e.g., waiting on family documents, payer response pending, etc.)"
                              value={adminProcessingReason}
                              onChange={(e) => setAdminProcessingReason(e.target.value)}
                              rows={4}
                            />
                            <p className="text-xs text-muted-foreground">This reason is required for internal tracking and appears to admins.</p>
                          </div>
                          <Button
                            className="w-full"
                            onClick={saveAdminProcessingStatus}
                            disabled={isSavingAdminProcessing || !adminProcessingStatus || !adminProcessingReason.trim()}
                          >
                            {isSavingAdminProcessing ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <List className="mr-2 h-4 w-4" />
                            )}
                            Save Internal Status
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    
                    {/* Schedule Next Step in Calendar */}
                    <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4" />
                          Schedule Next Step in Calendar
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Schedule Next Step in Calendar</DialogTitle>
                          <DialogDescription>Add a follow-up date to the daily task calendar for this member.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="schedule-title">Task Title</Label>
                            <Input
                              id="schedule-title"
                              placeholder={`Follow up: ${application.memberFirstName} ${application.memberLastName}`}
                              value={scheduleTitle}
                              onChange={(e) => setScheduleTitle(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Due Date *</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn('w-full justify-start text-left font-normal', !scheduleDate && 'text-muted-foreground')}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {scheduleDate ? format(scheduleDate, 'PPP') : <span>Pick a date</span>}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <Calendar
                                  mode="single"
                                  selected={scheduleDate}
                                  onSelect={setScheduleDate}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="schedule-priority">Priority</Label>
                            <Select value={schedulePriority} onValueChange={(v) => setSchedulePriority(v as 'high' | 'medium' | 'low')}>
                              <SelectTrigger id="schedule-priority">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="schedule-notes">Notes</Label>
                            <Textarea
                              id="schedule-notes"
                              placeholder="What needs to happen on this date?"
                              value={scheduleNotes}
                              onChange={(e) => setScheduleNotes(e.target.value)}
                              rows={3}
                            />
                          </div>
                          <Button className="w-full" onClick={handleScheduleTask} disabled={isSavingSchedule || !scheduleDate}>
                            {isSavingSchedule ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarIcon className="mr-2 h-4 w-4" />}
                            Add to Calendar
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="w-full">
                                Delete Application
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete this application?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will permanently remove the application record. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteApplication}>
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    {(application as any)?.caspioSent && (
                        <div className="flex items-center justify-center gap-2 text-xs text-green-700">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Verified sent to Caspio</span>
                            <span className="text-muted-foreground">
                              • {caspioSentByLabel ? `${caspioSentByLabel} • ` : ''}{caspioSentLabel}
                            </span>
                        </div>
                    )}
                    
                </CardContent>
                )}
            </Card>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Admin Actions</DialogTitle>
                    <DialogDescription>Update status and notify the referrer.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="status-select">Application Status</Label>
                        <Select value={status} onValueChange={(value) => setStatus(value as Application['status'])}>
                            <SelectTrigger id="status-select">
                                <SelectValue placeholder="Select new status..." />
                            </SelectTrigger>
                        <SelectContent>
                            {statusOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {option}
                                </SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="status-notes">Notes for Referrer (Optional)</Label>
                        <Textarea
                            id="status-notes"
                            placeholder="e.g., 'Congratulations! The application is approved.' or 'Please upload a clearer copy of the Proof of Income document.'"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={4}
                        />
                        <p className="text-xs text-muted-foreground">This message will be sent in the email to the referrer.</p>
                    </div>
                    <Button className="w-full" onClick={sendEmailAndUpdateStatus} disabled={isSending || !status}>
                        {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                        Send Status Update
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
