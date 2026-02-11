import React from 'react';
import { CheckCircle2, XCircle, Circle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import type { WithId } from '@/firebase';

export type TrackedComponent = { key: string; abbreviation: string };

export const TRACKED_COMPONENTS: TrackedComponent[] = [
  { key: 'CS Member Summary', abbreviation: 'CS' },
  { key: 'Waivers & Authorizations', abbreviation: 'Waivers' },
  { key: 'Room and Board Commitment', abbreviation: 'R&B' },
  { key: 'Proof of Income', abbreviation: 'POI' },
  { key: "LIC 602A - Physician's Report", abbreviation: '602' },
  { key: 'Medicine List', abbreviation: 'Meds' },
  { key: 'SNF Facesheet', abbreviation: 'SNF' },
  { key: 'Eligibility Check', abbreviation: 'Elig' },
  { key: 'Sent to Caspio', abbreviation: 'Caspio' },
];

export type ComponentStatus = 'Completed' | 'Pending' | 'Not Applicable';

export function getComponentStatus(
  app: (Application & FormValues) | WithId<Application & FormValues>,
  componentKey: string
): ComponentStatus {
  const forms = (app as any)?.forms as any[] | undefined;
  const form = forms?.find((f) => f?.name === componentKey);

  if (componentKey === 'Eligibility Check') {
    return (app as any)?.calaimTrackingStatus ? 'Completed' : 'Pending';
  }
  if (componentKey === 'Sent to Caspio') {
    return (app as any)?.caspioSent ? 'Completed' : 'Pending';
  }
  if (componentKey === 'SNF Facesheet' && (app as any)?.pathway !== 'SNF Transition') {
    return 'Not Applicable';
  }

  if (form?.status === 'Completed') return 'Completed';
  return 'Pending';
}

function StatusIcon({
  status,
  label,
  className,
}: {
  status: ComponentStatus;
  label: string;
  className?: string;
}) {
  const cfg =
    status === 'Completed'
      ? { Icon: CheckCircle2, color: 'text-green-600', statusLabel: 'Completed' }
      : status === 'Pending'
        ? { Icon: XCircle, color: 'text-orange-500', statusLabel: 'Pending' }
        : { Icon: Circle, color: 'text-gray-300', statusLabel: 'Not Applicable' };

  const { Icon, color, statusLabel } = cfg;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 rounded border bg-muted/30 px-1 py-0.5',
              className
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', color)} />
            <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {label}: {statusLabel}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ApplicationTrackerInline({
  application,
  components = TRACKED_COMPONENTS,
  className,
}: {
  application: (Application & FormValues) | WithId<Application & FormValues>;
  components?: TrackedComponent[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {components.map((c) => (
        <StatusIcon
          key={c.key}
          status={getComponentStatus(application as any, c.key)}
          label={c.abbreviation}
        />
      ))}
    </div>
  );
}

