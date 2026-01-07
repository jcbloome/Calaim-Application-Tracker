'use client';

import React, { useState, useMemo } from 'react';
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
import { format, parse } from 'date-fns';
import { useFirestore } from '@/firebase';
import { doc, deleteDoc, Timestamp } from 'firebase/firestore';
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
import { Trash2, AlertTriangle } from 'lucide-react';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import type { WithId } from '@/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

const QuickViewField = ({ label, value, fullWidth = false }: { label: string, value?: string | number | boolean | null, fullWidth?: boolean }) => (
    <div className={fullWidth ? 'col-span-2' : ''}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{String(value) || <span className="font-normal text-gray-400">N/A</span>}</p>
    </div>
);

const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (typeof date === 'string') {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
            try {
                const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
                return format(parsedDate, 'PPP');
            } catch (e) { return date; }
        }
        try {
            const parsedDate = new Date(date);
            if (!isNaN(parsedDate.getTime())) return format(parsedDate, 'PPP');
        } catch (e) { /* Fallthrough */ }
    }
    if (date && typeof date.toDate === 'function') {
        return format(date.toDate(), 'PPP');
    }
    return 'Invalid Date';
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
        <h3 className="text-lg font-semibold mb-2 text-primary">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {children}
        </div>
        <Separator className="my-6" />
    </div>
);

const QuickViewDialog = ({ application }: { application: WithId<Application & FormValues> }) => {
    
    const getCapacityStatus = (hasLegalRepValue: Application['hasLegalRep']) => {
        switch(hasLegalRepValue) {
            case 'notApplicable':
            case 'same_as_primary':
            case 'different':
                return 'Yes, member has capacity';
            case 'no_has_rep': 
                return 'No, member lacks capacity';
            default: 
                return 'Yes, member has capacity';
        }
    }
    
    return (
         <Dialog>
            <DialogTrigger asChild>
                <Link href="#" className="text-sm font-medium text-primary hover:underline">View</Link>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Summary: {application.memberFirstName} {application.memberLastName}</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4 max-h-[70vh] overflow-y-auto px-2">
                    <Section title="Member Information">
                        <QuickViewField label="First Name" value={application.memberFirstName} />
                        <QuickViewField label="Last Name" value={application.memberLastName} />
                        <QuickViewField label="Date of Birth" value={formatDate(application.memberDob)} />
                        <QuickViewField label="Age" value={application.memberAge} />
                        <QuickViewField label="Medi-Cal Number" value={application.memberMediCalNum} />
                        <QuickViewField label="Medical Record Number (MRN)" value={application.memberMrn} />
                        <QuickViewField label="Preferred Language" value={application.memberLanguage} />
                        <QuickViewField label="County" value={application.currentCounty} />
                    </Section>

                    <Section title="Referrer Information">
                        <QuickViewField label="Name" value={`${application.referrerFirstName} ${application.referrerLastName}`} />
                        <QuickViewField label="Email" value={application.referrerEmail} />
                        <QuickViewField label="Phone" value={application.referrerPhone} />
                        <QuickViewField label="Relationship" value={application.referrerRelationship} />
                        <QuickViewField label="Agency" value={application.agency} />
                    </Section>

                    <Section title="Primary Contact">
                        <QuickViewField label="Name" value={`${application.bestContactFirstName} ${application.bestContactLastName}`} />
                        <QuickViewField label="Relationship" value={application.bestContactRelationship} />
                        <QuickViewField label="Phone" value={application.bestContactPhone} />
                        <QuickViewField label="Email" value={application.bestContactEmail} />
                        <QuickViewField label="Language" value={application.bestContactLanguage} />
                    </Section>

                    <Section title="Legal Representative">
                        <QuickViewField label="Member Has Capacity" value={getCapacityStatus(application.hasLegalRep)} />
                        <QuickViewField label="Has Legal Representative" value={application.hasLegalRep} />
                        <QuickViewField label="Rep Name" value={`${application.repFirstName || ''} ${application.repLastName || ''}`.trim() || 'N/A'} />
                        <QuickViewField label="Rep Relationship" value={application.repRelationship} />
                        <QuickViewField label="Rep Phone" value={application.repPhone} />
                        <QuickViewField label="Rep Email" value={application.repEmail} />
                    </Section>
                    
                    <Section title="Location Information">
                        <QuickViewField label="Current Location Type" value={application.currentLocation} />
                        <QuickViewField label="Current Address" value={`${application.currentAddress}, ${application.currentCity}, ${application.currentState} ${application.currentZip}`} fullWidth />
                        <QuickViewField label="Customary Residence Type" value={application.customaryLocationType} />
                        <QuickViewField label="Customary Address" value={`${application.customaryAddress}, ${application.customaryCity}, ${application.customaryState} ${application.customaryZip}`} fullWidth />
                    </Section>
                    
                    <Section title="Health Plan & Pathway">
                        <QuickViewField label="Health Plan" value={application.healthPlan} />
                        <QuickViewField label="Pathway" value={application.pathway} />
                        <QuickViewField label="Meets Criteria" value={application.meetsPathwayCriteria ? 'Yes' : 'No'} fullWidth />
                        {application.pathway === 'SNF Diversion' && <QuickViewField label="Reason for Diversion" value={application.snfDiversionReason} fullWidth />}
                    </Section>

                     <Section title="ISP & RCFE Information">
                        <QuickViewField label="ISP Contact Name" value={`${application.ispFirstName} ${application.ispLastName}`} />
                        <QuickViewField label="ISP Contact Phone" value={application.ispPhone} />
                        <QuickViewField label="ISP Assessment Location" value={application.ispAddress} fullWidth />
                        <QuickViewField label="On ALW Waitlist?" value={application.onALWWaitlist} />
                        <QuickViewField label="Has Preferred RCFE?" value={application.hasPrefRCFE} />
                        <QuickViewField label="RCFE Name" value={application.rcfeName} fullWidth />
                    </Section>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export const AdminApplicationsTable = ({
  applications,
  isLoading,
  onSelectionChange,
  selected,
}: {
  applications: WithId<Application & FormValues>[];
  isLoading: boolean;
  onSelectionChange?: (id: string, checked: boolean) => void;
  selected?: string[];
}) => {
    
    const sortedApplications = useMemo(() => {
        if (!applications) return [];
        return [...applications].sort((a, b) => {
            const dateA = a.lastUpdated ? (a.lastUpdated as Timestamp).toMillis() : 0;
            const dateB = b.lastUpdated ? (b.lastUpdated as Timestamp).toMillis() : 0;
            return dateB - dateA;
        });
    }, [applications]);

  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {onSelectionChange && selected && (
              <TableHead className="w-[50px]">
                  <Checkbox
                      checked={selected.length === sortedApplications.length && sortedApplications.length > 0}
                      onCheckedChange={(checked) => {
                          sortedApplications.forEach(app => onSelectionChange(app.id, !!checked))
                      }}
                      aria-label="Select all"
                  />
              </TableHead>
            )}
            <TableHead>Member</TableHead>
            <TableHead className="hidden md:table-cell">Submitted By</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Plan & Pathway</TableHead>
            <TableHead className="hidden sm:table-cell">Dates</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={onSelectionChange ? 7 : 6} className="h-24 text-center">
                Loading applications...
              </TableCell>
            </TableRow>
          ) : sortedApplications.length > 0 ? (
            sortedApplications.map(app => {
              const referrerName = app.referrerName || `${app.referrerFirstName || ''} ${app.referrerLastName || ''}`.trim() || 'N/A';
              const submissionDate = app.submissionDate ? (app.submissionDate as Timestamp).toDate() : null;
              const lastUpdatedDate = app.lastUpdated ? (app.lastUpdated as Timestamp).toDate() : null;
              const servicesDeclined = app.forms?.find(f => f.name === 'Waivers & Authorizations')?.choice === 'decline';

              return (
              <TableRow key={app.id}>
                {onSelectionChange && selected && (
                  <TableCell>
                      <Checkbox
                          checked={selected.includes(app.id)}
                          onCheckedChange={(checked) => onSelectionChange(app.id, !!checked)}
                          aria-label={`Select application for ${app.memberFirstName}`}
                      />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  {`${app.memberFirstName} ${app.memberLastName}`}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                   {referrerName}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getBadgeVariant(app.status)}>
                    {app.status}
                  </Badge>
                </TableCell>
                 <TableCell className="hidden lg:table-cell">
                    <div>{app.healthPlan}</div>
                    <div className="text-xs text-muted-foreground">{app.pathway}</div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div>
                    {submissionDate ? `Created: ${format(submissionDate, 'MM/dd/yyyy')}`: <span>Created: N/A</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {lastUpdatedDate ? `Updated: ${format(lastUpdatedDate, 'MM/dd/yyyy')}` : <span>Updated: N/A</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right space-x-4">
                  <QuickViewDialog application={app} />
                   <div className="inline-flex items-center gap-2">
                    {servicesDeclined && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <AlertTriangle className="h-4 w-4 text-destructive" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Services were declined by member.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    <Link href={`/admin/applications/${app.id}?userId=${app.userId}`} className="text-sm font-medium text-primary hover:underline">
                        Details
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            )})
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
  );
};
