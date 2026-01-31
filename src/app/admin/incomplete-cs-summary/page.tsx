 'use client';
 
 import React, { useCallback, useMemo, useState } from 'react';
 import Link from 'next/link';
 import { collection, collectionGroup, getDocs } from 'firebase/firestore';
 import { format } from 'date-fns';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { Input } from '@/components/ui/input';
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
 import { Badge } from '@/components/ui/badge';
 import { useToast } from '@/hooks/use-toast';
 import { useAdmin } from '@/hooks/use-admin';
 import { useFirestore } from '@/firebase';
 import type { Application } from '@/lib/definitions';
 import type { FormValues } from '@/app/forms/cs-summary-form/schema';
 import type { WithId } from '@/firebase';
 
 type AppRecord = WithId<Application & FormValues> & {
   source?: 'user' | 'admin';
   userId?: string;
 };
 
 const hasCompletedCsSummary = (application: AppRecord) => {
   if ((application as any)?.csSummaryComplete === true) return true;
   const forms = application.forms || [];
   return forms.some(
     (form) =>
       (form.name === 'CS Member Summary' || form.name === 'CS Summary') &&
       form.status === 'Completed'
   );
 };
 
 export default function IncompleteCsSummaryPage() {
   const firestore = useFirestore();
   const { isAdmin, isAdminLoading } = useAdmin();
   const { toast } = useToast();
 
   const [isLoading, setIsLoading] = useState(false);
   const [applications, setApplications] = useState<AppRecord[]>([]);
   const [memberFilter, setMemberFilter] = useState('');
   const [sendingReminders, setSendingReminders] = useState<Set<string>>(new Set());
 
   const fetchApplications = useCallback(async () => {
     if (!firestore || !isAdmin) return;
     setIsLoading(true);
 
     try {
       const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
         getDocs(collectionGroup(firestore, 'applications')),
         getDocs(collection(firestore, 'applications'))
       ]);
 
       const userApps = userAppsSnapshot.docs.map((doc) => ({
         ...doc.data(),
         id: doc.id,
         source: 'user',
         userId: doc.ref.parent.parent?.id
       })) as AppRecord[];
 
       const adminApps = adminAppsSnapshot.docs.map((doc) => ({
         ...doc.data(),
         id: doc.id,
         source: 'admin'
       })) as AppRecord[];
 
       const deduped = new Map<string, AppRecord>();
       [...userApps, ...adminApps].forEach((app) => {
         const key = `${app.id}-${app.userId || 'admin'}`;
         deduped.set(key, app);
       });
 
       setApplications(Array.from(deduped.values()));
     } catch (error: any) {
       console.error('Error loading applications:', error);
       toast({
         variant: 'destructive',
         title: 'Error',
         description: error.message || 'Failed to load applications.'
       });
     } finally {
       setIsLoading(false);
     }
   }, [firestore, isAdmin, toast]);
 
   React.useEffect(() => {
     if (!isAdminLoading) {
       fetchApplications();
     }
   }, [fetchApplications, isAdminLoading]);
 
   const incompleteApps = useMemo(() => {
     return applications.filter((app) => !hasCompletedCsSummary(app));
   }, [applications]);
 
   const filteredApps = useMemo(() => {
     return incompleteApps.filter((app) => {
       const memberName = `${app.memberFirstName || ''} ${app.memberLastName || ''}`.trim();
       return !memberFilter || memberName.toLowerCase().includes(memberFilter.toLowerCase());
     });
   }, [incompleteApps, memberFilter]);
 
   const handleSendReminder = async (app: AppRecord) => {
     if (sendingReminders.has(app.id)) return;
 
     setSendingReminders((prev) => new Set(prev).add(app.id));
 
     try {
       const response = await fetch('/api/admin/send-cs-reminder', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           applicationId: app.id,
           userId: app.userId,
           reminderType: 'email'
         })
       });
 
       const result = await response.json();
 
       if (!result.success) {
         throw new Error(result.error || 'Failed to send reminder');
       }
 
       toast({
         title: 'Reminder Sent',
         description: `CS Summary reminder sent for ${app.memberFirstName} ${app.memberLastName}.`
       });
 
       fetchApplications();
     } catch (error: any) {
       toast({
         variant: 'destructive',
         title: 'Error',
         description: error.message || 'Failed to send reminder.'
       });
     } finally {
       setSendingReminders((prev) => {
         const next = new Set(prev);
         next.delete(app.id);
         return next;
       });
     }
   };
 
   return (
     <div className="space-y-6">
       <div>
         <h1 className="text-3xl font-bold">Incomplete CS Summary Forms</h1>
         <p className="text-muted-foreground">
           Auto reminders go out every 2 days until the CS Summary is completed.
         </p>
       </div>
 
       <Card>
         <CardHeader>
           <CardTitle>Filter</CardTitle>
           <CardDescription>Find applications by member name.</CardDescription>
         </CardHeader>
         <CardContent>
           <Input
             placeholder="Filter by member name..."
             value={memberFilter}
             onChange={(event) => setMemberFilter(event.target.value)}
           />
         </CardContent>
       </Card>
 
       <Card>
         <CardHeader>
           <CardTitle>Applications</CardTitle>
           <CardDescription>
             {filteredApps.length} application(s) missing CS Summary completion
           </CardDescription>
         </CardHeader>
         <CardContent>
           <div className="w-full overflow-x-auto">
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>Member</TableHead>
                   <TableHead>Referrer</TableHead>
                   <TableHead>Email</TableHead>
                   <TableHead>Plan</TableHead>
                   <TableHead>Pathway</TableHead>
                   <TableHead>Last Updated</TableHead>
                   <TableHead>Last Reminder</TableHead>
                   <TableHead className="text-right">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {isLoading ? (
                   <TableRow>
                     <TableCell colSpan={8} className="h-24 text-center">
                       Loading applications...
                     </TableCell>
                   </TableRow>
                 ) : filteredApps.length > 0 ? (
                   filteredApps.map((app) => {
                     const lastUpdatedDate = (app.lastUpdated as any)?.toDate?.();
                     const lastReminderDate = (app as any)?.lastCsSummaryReminder?.toDate?.();
                     const memberName = `${app.memberFirstName || ''} ${app.memberLastName || ''}`.trim();
                     const referrerName = app.referrerName
                       || `${app.referrerFirstName || ''} ${app.referrerLastName || ''}`.trim()
                       || 'N/A';
                     const detailUrl = `/admin/applications/${app.id}${app.userId ? `?userId=${app.userId}` : ''}`;
 
                     return (
                       <TableRow key={`${app.id}-${app.userId || 'admin'}`}>
                         <TableCell className="font-medium">{memberName}</TableCell>
                         <TableCell>{referrerName}</TableCell>
                         <TableCell className="text-xs text-muted-foreground">
                           {app.referrerEmail || 'N/A'}
                         </TableCell>
                         <TableCell>{app.healthPlan || 'N/A'}</TableCell>
                         <TableCell>{app.pathway || 'N/A'}</TableCell>
                         <TableCell>
                           {lastUpdatedDate ? format(lastUpdatedDate, 'MM/dd/yyyy') : 'N/A'}
                         </TableCell>
                         <TableCell>
                           {lastReminderDate ? format(lastReminderDate, 'MM/dd/yyyy') : 'N/A'}
                         </TableCell>
                         <TableCell className="text-right">
                           <div className="inline-flex items-center gap-2">
                             <Button asChild variant="outline" size="sm">
                               <Link href={detailUrl}>View</Link>
                             </Button>
                             <Button
                               size="sm"
                               onClick={() => handleSendReminder(app)}
                               disabled={sendingReminders.has(app.id) || !app.referrerEmail}
                             >
                               {sendingReminders.has(app.id) ? 'Sending...' : 'Send Reminder'}
                             </Button>
                           </div>
                         </TableCell>
                       </TableRow>
                     );
                   })
                 ) : (
                   <TableRow>
                     <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                       No incomplete CS Summary forms found.
                     </TableCell>
                   </TableRow>
                 )}
               </TableBody>
             </Table>
           </div>
         </CardContent>
       </Card>
     </div>
   );
 }
