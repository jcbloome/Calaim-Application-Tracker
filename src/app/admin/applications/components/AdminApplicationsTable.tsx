
'use client';

import React, { useMemo } from 'react';
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
import { format, parse, differenceInHours } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Sparkles, Calendar, User, FileText, UserCheck, ExternalLink } from 'lucide-react';
import type { Application } from '@/lib/definitions';
import { ApplicationCardSkeleton, ApplicationTableSkeleton } from '@/components/ApplicationCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import type { WithId } from '@/firebase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
                <Button variant="link" className="text-sm font-medium text-primary hover:underline p-0 h-auto">
                    <FileText className="h-3 w-3 mr-1" />
                    Quick View
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="text-xl">CS Summary: {application.memberFirstName} {application.memberLastName}</DialogTitle>
                            <DialogDescription>
                                Complete CS Member Summary form data • {application.healthPlan} • {application.pathway}
                            </DialogDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" asChild>
                                <Link href={`/admin/applications/${application.id}?userId=${application.userId}`}>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Full Details
                                </Link>
                            </Button>
                        </div>
                    </div>
                </DialogHeader>
                <div className="flex-grow overflow-y-auto">
                    <div className="space-y-6 py-4 px-2">
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

                    <Section title="Medical & Care Information">
                        <QuickViewField label="Diagnosis" value={application.diagnosis} fullWidth />
                        <QuickViewField label="Current Care Level" value={application.currentCareLevel} />
                        <QuickViewField label="Mobility" value={application.mobility} />
                        <QuickViewField label="Cognitive Status" value={application.cognitiveStatus} />
                        <QuickViewField label="Behavioral Concerns" value={application.behavioralConcerns} />
                        <QuickViewField label="Special Needs" value={application.specialNeeds} fullWidth />
                    </Section>

                    <Section title="Financial Information">
                        <QuickViewField label="Income Source" value={application.incomeSource} />
                        <QuickViewField label="Monthly Income" value={application.monthlyIncome} />
                        <QuickViewField label="Has Medi-Cal" value={application.hasMediCal ? 'Yes' : 'No'} />
                        <QuickViewField label="Medi-Cal Number" value={application.memberMediCalNum} />
                        <QuickViewField label="Share of Cost" value={application.shareOfCost} />
                    </Section>

                    <Section title="Application Status & Tracking">
                        <QuickViewField label="Submission Status" value={application.status} />
                        <QuickViewField label="Submitted Date" value={application.submissionDate ? format((application.submissionDate as Timestamp).toDate(), 'PPP p') : 'N/A'} />
                        <QuickViewField label="Last Updated" value={application.lastUpdated ? format((application.lastUpdated as Timestamp).toDate(), 'PPP p') : 'N/A'} />
                        <QuickViewField label="Submitted By" value={application.referrerName || 'N/A'} />
                        <QuickViewField label="Application ID" value={application.id} fullWidth />
                    </Section>

                    {/* Additional Notes Section */}
                    {(application.additionalNotes || application.specialInstructions) && (
                        <Section title="Additional Information">
                            {application.additionalNotes && <QuickViewField label="Additional Notes" value={application.additionalNotes} fullWidth />}
                            {application.specialInstructions && <QuickViewField label="Special Instructions" value={application.specialInstructions} fullWidth />}
                        </Section>
                    )}
                    </div>
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
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block w-full overflow-x-auto">
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
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Plan & Pathway</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={onSelectionChange ? 5 : 4} className="h-24 text-center">
                Loading applications...
              </TableCell>
            </TableRow>
          ) : sortedApplications.length > 0 ? (
            sortedApplications.map(app => {
              const referrerName = app.referrerName || `${app.referrerFirstName || ''} ${app.referrerLastName || ''}`.trim() || 'N/A';
              const submissionDate = app.submissionDate ? (app.submissionDate as Timestamp).toDate() : null;
              const lastUpdatedDate = app.lastUpdated ? (app.lastUpdated as Timestamp).toDate() : null;
              const servicesDeclined = app.forms?.find(f => f.name === 'Waivers & Authorizations')?.choice === 'decline';
              const isNew = submissionDate && differenceInHours(new Date(), submissionDate) < 24;
              const isRecentlyUpdated = lastUpdatedDate && submissionDate && 
                differenceInHours(new Date(), lastUpdatedDate) < 24 && 
                differenceInHours(lastUpdatedDate, submissionDate) > 1;

              return (
              <TableRow key={app.uniqueKey || `app-${app.id}-${Date.now()}-${Math.random()}`} className={cn(
                isNew && "bg-blue-50 border-l-4 border-l-blue-400",
                isRecentlyUpdated && "bg-amber-50 border-l-4 border-l-amber-400"
              )}>
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
                  <div>
                    <div className="flex items-center gap-2">
                      {`${app.memberFirstName} ${app.memberLastName}`}
                      {isNew && <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Sparkles className="h-3 w-3 mr-1" /> New</Badge>}
                      {isRecentlyUpdated && <Badge className="bg-amber-100 text-amber-800 border-amber-200">Updated</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {submissionDate ? `Created: ${format(submissionDate, 'MM/dd/yyyy')}` : 'Created: N/A'}
                      {lastUpdatedDate && ` • Updated: ${format(lastUpdatedDate, 'MM/dd/yyyy')}`}
                      • By: {referrerName || (app.userId ? `user-ID: ...${app.userId.substring(app.userId.length - 4)}` : 'Unknown')}
                      {(app as any).assignedStaff && ` • Staff: ${(app as any).assignedStaff}`}
                    </div>
                  </div>
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
                <TableCell className="text-right">
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
                    <QuickViewDialog application={app} />
                    <Button asChild variant="link" className="text-sm font-medium text-primary hover:underline p-0 h-auto">
                        <Link href={`/admin/applications/${app.id}?userId=${app.userId}`}>View Details</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )})
          ) : (
            <TableRow>
              <TableCell colSpan={onSelectionChange ? 5 : 4} className="h-24 text-center">
                <EmptyState
                  icon={FileText}
                  title="No Applications Found"
                  description="Applications will appear here once they're submitted by users."
                  className="py-8"
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>

      {/* Mobile Single-Line View */}
      <div className="lg:hidden space-y-2">
        {isLoading ? (
          <div className="text-center py-8">Loading applications...</div>
        ) : sortedApplications.length > 0 ? (
          sortedApplications.map(app => {
            const referrerName = app.referrerName || `${app.referrerFirstName || ''} ${app.referrerLastName || ''}`.trim();
            const submissionDate = app.submissionDate ? (app.submissionDate as Timestamp).toDate() : null;
            const lastUpdatedDate = app.lastUpdated ? (app.lastUpdated as Timestamp).toDate() : null;
            const isNew = submissionDate && differenceInHours(new Date(), submissionDate) < 24;
            const isRecentlyUpdated = lastUpdatedDate && submissionDate && 
              differenceInHours(new Date(), lastUpdatedDate) < 24 && 
              differenceInHours(lastUpdatedDate, submissionDate) > 1;

            return (
              <div key={app.uniqueKey || `mobile-app-${app.id}-${Date.now()}-${Math.random()}`} className={cn(
                "bg-white border rounded-lg p-3 shadow-sm",
                isNew && "border-l-4 border-l-blue-400 bg-blue-50",
                isRecentlyUpdated && "border-l-4 border-l-amber-400 bg-amber-50"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {onSelectionChange && selected && (
                        <Checkbox
                          checked={selected.includes(app.id)}
                          onCheckedChange={(checked) => onSelectionChange(app.id, !!checked)}
                          aria-label={`Select application for ${app.memberFirstName} ${app.memberLastName}`}
                        />
                      )}
                      <h3 className="font-medium truncate">
                        {app.memberFirstName} {app.memberLastName}
                      </h3>
                      {isNew && <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs"><Sparkles className="h-3 w-3 mr-1" /> New</Badge>}
                      {isRecentlyUpdated && <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Updated</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {submissionDate ? `Created: ${format(submissionDate, 'MM/dd/yy')}` : 'Created: N/A'}
                      {lastUpdatedDate && ` • Updated: ${format(lastUpdatedDate, 'MM/dd/yy')}`}
                      • By: {referrerName || (app.userId ? `user-ID: ...${app.userId.substring(app.userId.length - 4)}` : 'Unknown')}
                      {(app as any).assignedStaff && ` • Staff: ${(app as any).assignedStaff}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <Badge variant="outline" className={getBadgeVariant(app.status)}>
                      {app.status}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <QuickViewDialog application={app} />
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/applications/${app.id}?userId=${app.userId}`}>
                          View Details
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            icon={FileText}
            title="No Applications Found"
            description="Applications will appear here once they're submitted by users."
          />
        )}
      </div>
    </>
  );
};
