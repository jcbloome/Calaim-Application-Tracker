'use client';

import React, { useMemo, useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { collection, Timestamp, getDocs, collectionGroup } from 'firebase/firestore';
import type { Application, StaffTracker, StaffMember } from '@/lib/definitions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, Circle, Filter, Calendar, User, Search } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdmin } from '@/hooks/use-admin';
import { errorEmitter, FirestorePermissionError } from '@/firebase';
import { format } from 'date-fns';

const trackedComponents = [
  { key: 'CS Member Summary', abbreviation: 'CS' },
  { key: 'Waivers & Authorizations', abbreviation: 'Waivers' },
  { key: "LIC 602A - Physician's Report", abbreviation: '602' },
  { key: 'Medicine List', abbreviation: 'Meds' },
  { key: 'Proof of Income', abbreviation: 'POI' },
  { key: 'Declaration of Eligibility', abbreviation: 'DE' },
  { key: 'SNF Facesheet', abbreviation: 'SNF' },
  { key: 'Eligibility Check', abbreviation: 'Elig' },
  { key: 'Sent to Caspio', abbreviation: 'Caspio' },
  { key: 'Room and Board/Tier Level Agreement', abbreviation: 'R&B/Tier' },
];

const reminderIndicatorColumns = [
  { key: 'missing-doc-reminders', abbreviation: 'DocRem', label: 'Missing Doc Reminders Active' },
  { key: 'status-reminders', abbreviation: 'StatRem', label: 'Status Reminders Active' },
] as const;

const missingDocsComponents = trackedComponents.filter(
  (component) =>
    component.key !== 'CS Member Summary' &&
    component.key !== 'CS Summary' &&
    component.key !== 'Eligibility Check' &&
    component.key !== 'Sent to Caspio'
);

const StatusIndicator = ({ status, formName }: { status: 'Completed' | 'Pending' | 'Not Applicable', formName: string }) => {
    const statusConfig = {
        Completed: { Icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
        Pending: { Icon: XCircle, color: 'text-orange-500', label: 'Pending' },
        'Not Applicable': { Icon: Circle, color: 'text-gray-300', label: 'Not Applicable' },
    };
    
    const { Icon, color, label } = statusConfig[status];

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>
                    <Icon className={`h-5 w-5 ${color}`} />
                </TooltipTrigger>
                <TooltipContent>
                    <p>{formName}: {label}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

const getComponentStatus = (app: Application, componentKey: string): 'Completed' | 'Pending' | 'Not Applicable' => {
    const form = app.forms?.find((f: any) => {
      const name = String(f?.name || '').trim();
      if (name === componentKey) return true;
      if (
        componentKey === 'Room and Board/Tier Level Agreement' &&
        (name === 'Room and Board/Tier Level Commitment' || name === 'Room and Board Commitment')
      ) {
        return true;
      }
      return false;
    });

    if (componentKey === 'Eligibility Check') {
        return (app as any)?.calaimTrackingStatus ? 'Completed' : 'Pending';
    }
    if (componentKey === 'Sent to Caspio') {
        return (app as any)?.caspioSent ? 'Completed' : 'Pending';
    }
    if (componentKey === 'Declaration of Eligibility' && app.pathway !== 'SNF Diversion') {
        return 'Not Applicable';
    }
    if (componentKey === 'SNF Facesheet' && app.pathway !== 'SNF Transition') {
        return 'Not Applicable';
    }

    if (form?.status === 'Completed') {
        return 'Completed';
    }
    
    return 'Pending';
};

const getReminderIndicatorStatus = (
  app: Application,
  key: typeof reminderIndicatorColumns[number]['key']
): 'Completed' | 'Pending' => {
  if (key === 'missing-doc-reminders') {
    return (app as any)?.emailRemindersEnabled === true ? 'Completed' : 'Pending';
  }
  return (app as any)?.statusRemindersEnabled === true ? 'Completed' : 'Pending';
};


function ProgressTrackerPageClient() {
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [filters, setFilters] = useState<string[]>([]);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [lastNameSearch, setLastNameSearch] = useState('');
  const [missingDocReminderFilter, setMissingDocReminderFilter] = useState<'all' | 'on' | 'off'>('all');
  const [statusReminderFilter, setStatusReminderFilter] = useState<'all' | 'on' | 'off'>('all');

  const [applications, setApplications] = useState<Application[]>([]);
  const [trackers, setTrackers] = useState<Map<string, StaffTracker>>(new Map());
  const [staff, setStaff] = useState<Map<string, StaffMember>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (isAdminLoading || !firestore || !isAdmin) {
        if (!isAdminLoading) setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
        // Query both user applications and admin-created applications
        const userAppsQuery = collectionGroup(firestore, 'applications');
        const adminAppsQuery = collection(firestore, 'applications');
        const trackersQuery = collectionGroup(firestore, 'staffTrackers');
        const adminRolesQuery = collection(firestore, 'roles_admin');
        const superAdminRolesQuery = collection(firestore, 'roles_super_admin');
        const usersQuery = collection(firestore, 'users');

        const [userAppsSnap, adminAppsSnap, trackersSnap, adminRolesSnap, superAdminRolesSnap, usersSnap] = await Promise.all([
            getDocs(userAppsQuery).catch(e => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applications (collection group)', operation: 'list' })); throw e; }),
            getDocs(adminAppsQuery).catch(e => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applications (collection)', operation: 'list' })); throw e; }),
            getDocs(trackersQuery).catch(e => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'staffTrackers (collection group)', operation: 'list' })); throw e; }),
            getDocs(adminRolesQuery).catch(e => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'roles_admin (collection)', operation: 'list' })); throw e; }),
            getDocs(superAdminRolesQuery).catch(e => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'roles_super_admin (collection)', operation: 'list' })); throw e; }),
            getDocs(usersQuery).catch(e => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'users (collection)', operation: 'list' })); throw e; }),
        ]);

        // Combine both user and admin applications with unique keys
        const userApps = userAppsSnap.docs.map(doc => ({
            ...doc.data(), 
            id: doc.id,
            uniqueKey: `user-${doc.id}`,
            source: 'user'
        })) as Application[];
        const adminApps = adminAppsSnap.docs.map(doc => ({
            ...doc.data(), 
            id: doc.id,
            uniqueKey: `admin-${doc.id}`,
            source: 'admin'
        })) as Application[];

        const normalize = (value: unknown) =>
          String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');

        const toMillis = (value: unknown): number => {
          try {
            if (value && typeof (value as any).toDate === 'function') {
              return (value as any).toDate().getTime();
            }
            if (value && typeof (value as any).toMillis === 'function') {
              return Number((value as any).toMillis()) || 0;
            }
            const ms = new Date(String(value || '')).getTime();
            return Number.isFinite(ms) ? ms : 0;
          } catch {
            return 0;
          }
        };

        const getPriority = (app: any) =>
          app?.source === 'admin' || String(app?.id || '').startsWith('admin_app_') ? 1 : 0;

        const pickBetter = (current: Application, incoming: Application) => {
          const currentMs = toMillis((current as any)?.lastUpdated || (current as any)?.submissionDate);
          const incomingMs = toMillis((incoming as any)?.lastUpdated || (incoming as any)?.submissionDate);
          if (incomingMs !== currentMs) return incomingMs > currentMs ? incoming : current;
          const currentPriority = getPriority(current);
          const incomingPriority = getPriority(incoming);
          if (incomingPriority !== currentPriority) return incomingPriority > currentPriority ? incoming : current;
          return current;
        };

        const getAliases = (app: any): string[] => {
          const first = normalize(app?.memberFirstName);
          const last = normalize(app?.memberLastName);
          const fullName = normalize(`${first} ${last}`);
          const dob = normalize(app?.memberDob);
          const plan = normalize(app?.healthPlan);
          const pathway = normalize(app?.pathway);
          const mrn = normalize(app?.memberMrn);
          const mediCal = normalize(app?.memberMediCalNum);
          const clientId2 = normalize((app as any)?.client_ID2 || (app as any)?.clientId2);
          const aliases = new Set<string>();
          if (mrn) aliases.add(`mrn:${mrn}`);
          if (clientId2) aliases.add(`client:${clientId2}`);
          if (mediCal) aliases.add(`medi:${mediCal}`);
          if (fullName && dob) aliases.add(`name_dob:${fullName}|${dob}`);
          if (fullName && (plan || pathway)) aliases.add(`name_plan_path:${fullName}|${plan}|${pathway}`);
          if (fullName && !mrn && !clientId2 && !mediCal) aliases.add(`name:${fullName}`);
          return Array.from(aliases);
        };

        const allApps = [...userApps, ...adminApps];
        const byId = new Map<string, Application>();
        const aliasToCanonical = new Map<string, string>();

        allApps.forEach((app) => {
          const aliases = getAliases(app);
          if (aliases.length === 0) {
            byId.set(app.id, pickBetter(byId.get(app.id) || app, app));
            return;
          }

          const linkedCanonicalIds = Array.from(
            new Set(
              aliases
                .map((alias) => aliasToCanonical.get(alias))
                .filter((id): id is string => Boolean(id))
            )
          );

          const canonicalId = linkedCanonicalIds[0] || app.id;
          const existingCanonical = byId.get(canonicalId);
          if (!existingCanonical) {
            byId.set(canonicalId, app);
          } else {
            byId.set(canonicalId, pickBetter(existingCanonical, app));
          }

          if (linkedCanonicalIds.length > 1) {
            linkedCanonicalIds.slice(1).forEach((otherId) => {
              const currentBest = byId.get(canonicalId);
              const otherApp = byId.get(otherId);
              if (currentBest && otherApp) {
                byId.set(canonicalId, pickBetter(currentBest, otherApp));
              }
              byId.delete(otherId);
            });
          }

          aliases.forEach((alias) => aliasToCanonical.set(alias, canonicalId));
        });

        const apps = Array.from(byId.values());
        const trackersMap = new Map(trackersSnap.docs.map(doc => [doc.data().applicationId, doc.data() as StaffTracker]));
        
        const adminIds = new Set(adminRolesSnap.docs.map(d => d.id));
        const superAdminIds = new Set(superAdminRolesSnap.docs.map(d => d.id));
        const staffMap = new Map();
        usersSnap.docs.forEach(doc => {
            const uid = doc.id;
            if (adminIds.has(uid) || superAdminIds.has(uid)) {
                 staffMap.set(uid, { uid, ...doc.data() } as StaffMember);
            }
        });

        setApplications(apps);
        setTrackers(trackersMap);
        setStaff(staffMap);

    } catch (err: any) {
        setError(err);
    } finally {
        setIsLoading(false);
    }
  }, [firestore, isAdmin, isAdminLoading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const missingDocsParam = searchParams.get('missingDocs');
    if (missingDocsParam === '1') {
      setShowMissingOnly(true);
    }
  }, [searchParams]);
  
  const handleFilterChange = (componentKey: string, checked: boolean) => {
    setFilters(prev => 
        checked ? [...prev, componentKey] : prev.filter(key => key !== componentKey)
    );
  }

  const filteredApplications = useMemo(() => {
    if (!applications) return [];
    
    const sorted = [...applications].sort((a, b) => {
        const timeA = a.lastUpdated ? (a.lastUpdated as Timestamp).toMillis() : 0;
        const timeB = b.lastUpdated ? (b.lastUpdated as Timestamp).toMillis() : 0;
        return timeB - timeA;
    });

    const missingOnlyFiltered = showMissingOnly
      ? sorted.filter(app =>
          missingDocsComponents.some(component => getComponentStatus(app, component.key) === 'Pending')
        )
      : sorted;

    const componentFiltered = filters.length === 0
      ? missingOnlyFiltered
      : missingOnlyFiltered.filter(app => {
          return filters.every(filterKey => getComponentStatus(app, filterKey) === 'Pending');
        });

    const reminderFiltered = componentFiltered.filter((app) => {
      const matchesMissingDocReminder =
        missingDocReminderFilter === 'all' ||
        (missingDocReminderFilter === 'on' && (app as any)?.emailRemindersEnabled === true) ||
        (missingDocReminderFilter === 'off' && (app as any)?.emailRemindersEnabled !== true);
      const matchesStatusReminder =
        statusReminderFilter === 'all' ||
        (statusReminderFilter === 'on' && (app as any)?.statusRemindersEnabled === true) ||
        (statusReminderFilter === 'off' && (app as any)?.statusRemindersEnabled !== true);
      return matchesMissingDocReminder && matchesStatusReminder;
    });

    const searchTerm = lastNameSearch.trim().toLowerCase();
    if (!searchTerm) return reminderFiltered;

    return reminderFiltered.filter((app) =>
      String(app.memberLastName || '').trim().toLowerCase().includes(searchTerm)
    );

  }, [applications, filters, showMissingOnly, lastNameSearch, missingDocReminderFilter, statusReminderFilter])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Application Progress Tracker</CardTitle>
          <CardDescription>
            A detailed grid showing the status of each required component for all applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Card className="mb-6 bg-muted/50">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filter by Missing Components
                    </CardTitle>
                    <CardDescription>Select one or more components to find applications that are missing all of the selected documents.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                      <Label htmlFor="last-name-search" className="text-sm font-medium mb-2 block">
                        Search by member last name
                      </Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="last-name-search"
                          value={lastNameSearch}
                          onChange={(e) => setLastNameSearch(e.target.value)}
                          placeholder="Type last name..."
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <Checkbox
                        id="missing-docs-only"
                        checked={showMissingOnly}
                        onCheckedChange={(checked) => setShowMissingOnly(Boolean(checked))}
                      />
                      <Label htmlFor="missing-docs-only" className="text-sm font-normal cursor-pointer">
                        Only show applications with missing documents
                      </Label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {trackedComponents.map(c => (
                            <div key={c.key} className="flex items-center space-x-2">
                                <Checkbox 
                                    id={`filter-${c.key}`} 
                                    onCheckedChange={(checked) => handleFilterChange(c.key, !!checked)}
                                    checked={filters.includes(c.key)}
                                />
                                <Label htmlFor={`filter-${c.key}`} className="text-sm font-normal cursor-pointer">
                                    {c.abbreviation} - <span className="text-muted-foreground">{c.key.split(' ')[0]}</span>
                                </Label>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor="missing-doc-reminder-filter" className="text-sm font-medium">
                          Missing Doc Reminders
                        </Label>
                        <Select
                          value={missingDocReminderFilter}
                          onValueChange={(value: 'all' | 'on' | 'off') => setMissingDocReminderFilter(value)}
                        >
                          <SelectTrigger id="missing-doc-reminder-filter">
                            <SelectValue placeholder="All" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="on">On</SelectItem>
                            <SelectItem value="off">Off</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="status-reminder-filter" className="text-sm font-medium">
                          Status Reminders
                        </Label>
                        <Select
                          value={statusReminderFilter}
                          onValueChange={(value: 'all' | 'on' | 'off') => setStatusReminderFilter(value)}
                        >
                          <SelectTrigger id="status-reminder-filter">
                            <SelectValue placeholder="All" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="on">On</SelectItem>
                            <SelectItem value="off">Off</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                </CardContent>
            </Card>

            <div className="p-4 border rounded-lg bg-muted/50 mb-6">
                 <h3 className="font-semibold text-sm">Legend</h3>
                 <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {trackedComponents.map(c => (
                        <span key={c.key}><strong className="font-mono">{c.abbreviation}:</strong> {c.key}</span>
                    ))}
                    {reminderIndicatorColumns.map(c => (
                        <span key={c.key}><strong className="font-mono">{c.abbreviation}:</strong> {c.label}</span>
                    ))}
                </div>
            </div>

          {error && <p className="text-destructive">Error: A permission error occurred while fetching data. Please ensure your account has the necessary roles.</p>}
          {isLoading || isAdminLoading ? (
             <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Loading application data...</p>
            </div>
          ) : (
             <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[250px] font-semibold">Member</TableHead>
                             {trackedComponents.map(c => (
                                <TableHead key={c.key} className="text-center w-[70px] p-2">
                                     <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger className="cursor-help font-mono text-xs">{c.abbreviation}</TooltipTrigger>
                                            <TooltipContent><p>{c.key}</p></TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </TableHead>
                            ))}
                            {reminderIndicatorColumns.map(c => (
                                <TableHead key={c.key} className="text-center w-[80px] p-2">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger className="cursor-help font-mono text-xs">{c.abbreviation}</TooltipTrigger>
                                            <TooltipContent><p>{c.label}</p></TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </TableHead>
                            ))}
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredApplications.length > 0 ? filteredApplications.map(app => {
                            const tracker = trackers.get(app.id);
                            const assignedStaff = tracker?.assignedStaffId ? staff.get(tracker.assignedStaffId) : null;
                            
                            return (
                                <TableRow key={app.uniqueKey || app.id}>
                                    <TableCell>
                                        <div className="font-medium">{`${app.memberFirstName} ${app.memberLastName}`}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {app.healthPlan} / {app.pathway}
                                        </div>
                                        {assignedStaff && (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                                <User className="h-3 w-3" /> 
                                                <span>{assignedStaff.firstName} {assignedStaff.lastName}</span>
                                            </div>
                                        )}
                                        {tracker?.nextStepDate && (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                                <Calendar className="h-3 w-3" />
                                                <span>{format(tracker.nextStepDate.toDate(), 'MMM dd, yyyy')}</span>
                                            </div>
                                        )}
                                    </TableCell>
                                    {trackedComponents.map(c => (
                                        <TableCell key={`${app.uniqueKey || app.id}-${c.key}`} className="text-center">
                                            <StatusIndicator 
                                                status={getComponentStatus(app, c.key)}
                                                formName={c.key}
                                            />
                                        </TableCell>
                                    ))}
                                    {reminderIndicatorColumns.map(c => (
                                        <TableCell key={`${app.uniqueKey || app.id}-${c.key}`} className="text-center">
                                            <StatusIndicator
                                                status={getReminderIndicatorStatus(app, c.key)}
                                                formName={c.label}
                                            />
                                        </TableCell>
                                    ))}
                                    <TableCell className="text-right">
                                        <Button asChild variant="outline" size="sm">
                                            <Link href={
                                                app.userId 
                                                    ? `/admin/applications/${app.id}?userId=${app.userId}`
                                                    : `/admin/applications/${app.id}`
                                            }>
                                                View
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )
                        }) : (
                             <TableRow>
                                <TableCell colSpan={trackedComponents.length + reminderIndicatorColumns.length + 2} className="h-24 text-center">
                                    No applications match the current filter.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProgressTrackerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-4">Loading application data...</p>
        </div>
      }
    >
      <ProgressTrackerPageClient />
    </Suspense>
  );
}
