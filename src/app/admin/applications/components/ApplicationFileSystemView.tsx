'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderOpen, Search } from 'lucide-react';
import { type WithId } from '@/firebase';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import {
  getApplicationFileSystemPlacement,
  getFileSystemFolderKey,
  type FileSystemActiveBucket,
} from '@/lib/application-file-system';
import {
  buildAdminApplicationHref,
  getDisplayMemberName,
} from './AdminApplicationsTable';

type PlacementSelectValue = 'auto' | FileSystemActiveBucket;

const PLAN_LABEL: Record<string, string> = {
  kaiser: 'Kaiser',
  'health-net': 'Health Net',
  other: 'Other',
};

const BUCKET_LABEL: Record<FileSystemActiveBucket, string> = {
  active: 'Active',
  'non-active': 'Non-active',
};

const FOLDER_ORDER: Array<{ plan: 'kaiser' | 'health-net'; bucket: FileSystemActiveBucket }> = [
  { plan: 'kaiser', bucket: 'active' },
  { plan: 'kaiser', bucket: 'non-active' },
  { plan: 'health-net', bucket: 'active' },
  { plan: 'health-net', bucket: 'non-active' },
];

const getAssignedStaffLabel = (app: WithId<Application & FormValues>) => {
  const candidates = [
    (app as any)?.assignedStaffName,
    (app as any)?.assignedStaff,
    (app as any)?.assignedToName,
    (app as any)?.assignedTo,
    (app as any)?.staffName,
  ];
  const label =
    candidates
      .map((value) => String(value ?? '').trim())
      .find((value) => value.length > 0) || '';
  return label || 'Staff unassigned';
};

const formatAuditTimestamp = (raw: unknown) => {
  if (!raw) return '';
  try {
    if (typeof (raw as { toDate?: () => Date })?.toDate === 'function') {
      return (raw as { toDate: () => Date }).toDate().toLocaleString();
    }
    const parsed = new Date(String(raw));
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
  } catch {
    return '';
  }
  return '';
};

type Props = {
  applications: WithId<Application & FormValues>[];
  isLoading: boolean;
  updatingOverrides: Set<string>;
  onSetPlacementOverride: (
    app: WithId<Application & FormValues>,
    override: FileSystemActiveBucket | null
  ) => Promise<void>;
};

export function ApplicationFileSystemView({
  applications,
  isLoading,
  updatingOverrides,
  onSetPlacementOverride,
}: Props) {
  const [search, setSearch] = useState('');

  const filteredApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return applications;
    return applications.filter((app) => {
      const placement = getApplicationFileSystemPlacement(app as any);
      return (
        getDisplayMemberName(app).toLowerCase().includes(query) ||
        String((app as any)?.memberMrn || '').toLowerCase().includes(query) ||
        String((app as any)?.memberMediCalNum || '').toLowerCase().includes(query) ||
        getAssignedStaffLabel(app).toLowerCase().includes(query) ||
        String(placement.status || '').toLowerCase().includes(query)
      );
    });
  }, [applications, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, WithId<Application & FormValues>[]>();
    filteredApplications.forEach((app) => {
      const placement = getApplicationFileSystemPlacement(app as any);
      const key = getFileSystemFolderKey(placement.plan, placement.bucket);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(app);
    });

    groups.forEach((items) => {
      items.sort((a, b) => getDisplayMemberName(a).localeCompare(getDisplayMemberName(b)));
    });
    return groups;
  }, [filteredApplications]);

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading file system view...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Auto-placed by Kaiser/Health Net status with optional manual override.
        </p>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search member, MRN, staff, status..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {FOLDER_ORDER.map(({ plan, bucket }) => {
          const key = getFileSystemFolderKey(plan, bucket);
          const apps = grouped.get(key) || [];

          return (
            <Card key={key}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="inline-flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    {PLAN_LABEL[plan]} / {BUCKET_LABEL[bucket]}
                  </span>
                  <Badge variant="secondary">{apps.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {apps.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4">
                    <EmptyState
                      icon={FolderOpen}
                      title="No applications"
                      description="No records match this folder."
                    />
                  </div>
                ) : (
                  <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                    {apps.map((app) => {
                      const placement = getApplicationFileSystemPlacement(app as any);
                      const selectedValue: PlacementSelectValue = placement.override || 'auto';
                      const isSaving = updatingOverrides.has(app.id);
                      const processStatus = placement.status || 'Status not set';
                      const manualUpdatedBy = String(
                        (app as any)?.fileSystemPlacementUpdatedByName ||
                          (app as any)?.fileSystemPlacementUpdatedByEmail ||
                          ''
                      ).trim();
                      const manualUpdatedAt =
                        formatAuditTimestamp((app as any)?.fileSystemPlacementUpdatedAtIso) ||
                        formatAuditTimestamp((app as any)?.fileSystemPlacementUpdatedAt);
                      const manualAuditLabel =
                        placement.source === 'manual' && (manualUpdatedBy || manualUpdatedAt)
                          ? [manualUpdatedBy || 'Staff', manualUpdatedAt ? `on ${manualUpdatedAt}` : '']
                              .filter(Boolean)
                              .join(' ')
                          : '';

                      return (
                        <div key={app.id} className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{getDisplayMemberName(app)}</p>
                              <p className="text-xs text-muted-foreground">
                                MRN: {String((app as any)?.memberMrn || 'N/A')} · Staff: {getAssignedStaffLabel(app)}
                              </p>
                            </div>
                            <Badge variant={placement.source === 'manual' ? 'default' : 'outline'}>
                              {placement.source === 'manual' ? 'Manual' : 'Auto'}
                            </Badge>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">{PLAN_LABEL[placement.plan]}</Badge>
                            <span>{processStatus}</span>
                          </div>
                          {manualAuditLabel ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Last manual placement: {manualAuditLabel}
                            </p>
                          ) : null}

                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <Select
                              value={selectedValue}
                              onValueChange={(value) =>
                                onSetPlacementOverride(
                                  app,
                                  value === 'auto' ? null : (value as FileSystemActiveBucket)
                                )
                              }
                              disabled={isSaving}
                            >
                              <SelectTrigger className="w-full sm:w-56">
                                <SelectValue placeholder="Select placement mode" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">Clear Override (Auto)</SelectItem>
                                <SelectItem value="active">Set Active</SelectItem>
                                <SelectItem value="non-active">Set Non-active</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button asChild variant="link" className="h-auto p-0 text-sm">
                              <Link href={buildAdminApplicationHref(app)}>Open Application</Link>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
