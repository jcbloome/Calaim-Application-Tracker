'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Clock,
  Database,
  FileSpreadsheet,
  Heart,
  ClipboardList,
  Shield,
  Users,
  BarChart3,
  FileText,
  Navigation,
  Building2,
  RefreshCw,
  Loader2,
  Moon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type SyncStatus = {
  success?: boolean;
  settings?: {
    lastSyncAt?: string;
    lastMode?: string;
    lastRunTrigger?: string;
    lastAutoSyncAt?: string;
    lastManualSyncAt?: string;
    lastRunSummary?: {
      fetched?: number;
      upserted?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  error?: string;
};

type NightJob = {
  name: string;
  schedule: string;
  writes: string;
  source: string;
};

type UpdatedPage = {
  title: string;
  href: string;
  description: string;
  dataSource: 'members-cache' | 'notes' | 'social-workers' | 'applications';
  icon: typeof Heart;
};

const NIGHT_JOBS: NightJob[] = [
  {
    name: 'Social workers directory',
    schedule: 'Daily 8:45 PM Eastern',
    source: 'Caspio social worker / EFT directory',
    writes: 'Firestore `syncedSocialWorkers`',
  },
  {
    name: 'Members cache (incremental)',
    schedule: 'Daily 9:00 PM Eastern',
    source: 'CalAIM_tbl_Members (+ RCFE registration join)',
    writes: 'Firestore `caspio_members_cache` + application Kaiser/CalAIM status',
  },
  {
    name: 'Members cache (full)',
    schedule: 'Sunday 9:35 PM Eastern',
    source: 'CalAIM_tbl_Members (full pull)',
    writes: 'Firestore `caspio_members_cache` safety-net refresh',
  },
  {
    name: 'Kaiser midnight preload',
    schedule: 'Night cron (`/api/cron/kaiser-midnight-preload`)',
    source: 'Members cache sync + Caspio notes per Kaiser member',
    writes: 'Members cache + Firestore member notes (Kaiser)',
  },
];

const UPDATED_PAGES: UpdatedPage[] = [
  {
    title: 'Kaiser Tracker',
    href: '/admin/kaiser-tracker',
    description: 'Member roster, statuses, and saved notes counts from night sync',
    dataSource: 'notes',
    icon: Heart,
  },
  {
    title: 'Authorization Tracker',
    href: '/admin/authorization-tracker',
    description: 'Auth / member fields from members cache',
    dataSource: 'members-cache',
    icon: Shield,
  },
  {
    title: 'ALFT Detail Tracker',
    href: '/admin/alft-tracker',
    description: 'Kaiser member list and demographics from cache',
    dataSource: 'members-cache',
    icon: ClipboardList,
  },
  {
    title: 'ALFT Assignment',
    href: '/admin/alft-assignment',
    description: 'Member roster for ALFT assignment workflows',
    dataSource: 'members-cache',
    icon: ClipboardList,
  },
  {
    title: 'ISP Workflow',
    href: '/admin/tools/isp-workflow',
    description: 'Member cache status + Kaiser member selection',
    dataSource: 'members-cache',
    icon: ClipboardList,
  },
  {
    title: 'SW ISP Assignments',
    href: '/admin/tools/isp-assignment',
    description: 'Assignments resolved against members + SW directory caches',
    dataSource: 'social-workers',
    icon: Users,
  },
  {
    title: 'ISP Tracker',
    href: '/admin/tools/isp-tracker',
    description: 'ISP rows tied to night-refreshed member data',
    dataSource: 'members-cache',
    icon: ClipboardList,
  },
  {
    title: 'ILS Status Check',
    href: '/admin/tools/ils-status-check',
    description: 'Kaiser member statuses from cache',
    dataSource: 'members-cache',
    icon: FileText,
  },
  {
    title: 'ILS MIF Consolidator',
    href: '/admin/tools/ils-mif-consolidator',
    description: 'Member match / Service Delivery identity from cache',
    dataSource: 'members-cache',
    icon: FileSpreadsheet,
  },
  {
    title: 'ILS Monthly MIF RTF',
    href: '/admin/tools/ils-mif-monthly-report',
    description: 'Kaiser members list for monthly MIF reporting',
    dataSource: 'members-cache',
    icon: FileSpreadsheet,
  },
  {
    title: 'ILS Pending / Report Editor',
    href: '/admin/ils-report-editor',
    description: 'Member cache status and Kaiser member pulls',
    dataSource: 'members-cache',
    icon: FileText,
  },
  {
    title: 'H2022 Status',
    href: '/admin/tools/h2022-claim-checker',
    description: 'Claim checker member resolution from cache',
    dataSource: 'members-cache',
    icon: ClipboardList,
  },
  {
    title: 'Kaiser RCFE Facility List',
    href: '/admin/tools/kaiser-rcfe-facility-list',
    description: 'RCFE-linked members from night members + RCFE join',
    dataSource: 'members-cache',
    icon: Building2,
  },
  {
    title: 'RCFE Data Management',
    href: '/admin/tools/rcfe-data',
    description: 'RCFE admin contact fields joined during members sync',
    dataSource: 'members-cache',
    icon: Building2,
  },
  {
    title: 'Health Net Members',
    href: '/admin/tools/health-net-active-members',
    description: 'Health Net rows in members cache',
    dataSource: 'members-cache',
    icon: FileSpreadsheet,
  },
  {
    title: 'SW Proximity (EFT setup)',
    href: '/admin/tools/sw-proximity',
    description: 'Closest members + SW directory from night caches',
    dataSource: 'social-workers',
    icon: Navigation,
  },
  {
    title: 'Statistics',
    href: '/admin/statistics',
    description: 'Authorized / program counts from members cache',
    dataSource: 'members-cache',
    icon: BarChart3,
  },
  {
    title: 'Program Growth Statistics',
    href: '/admin/tools/program-growth',
    description: 'Growth metrics driven by cached member roster',
    dataSource: 'members-cache',
    icon: BarChart3,
  },
  {
    title: 'My Tasks',
    href: '/admin/my-tasks',
    description: 'Kaiser member task context from cache',
    dataSource: 'members-cache',
    icon: ClipboardList,
  },
  {
    title: 'Follow-up Notes (Caspio)',
    href: '/admin/followup-notes',
    description: 'Uses notes refreshed by midnight Kaiser notes preload',
    dataSource: 'notes',
    icon: FileText,
  },
  {
    title: 'Applications',
    href: '/admin/applications',
    description: 'Kaiser/CalAIM statuses propagated from members sync',
    dataSource: 'applications',
    icon: Database,
  },
  {
    title: 'Create Application',
    href: '/admin/applications/create',
    description: 'Member picker / Kaiser ILS datapage member lookup',
    dataSource: 'members-cache',
    icon: Database,
  },
  {
    title: 'Kaiser Income Estimate',
    href: '/admin/super-admin-tools/kaiser-income-estimate',
    description: 'Income estimate rows from members cache',
    dataSource: 'members-cache',
    icon: BarChart3,
  },
];

const SOURCE_LABEL: Record<UpdatedPage['dataSource'], string> = {
  'members-cache': 'Members cache',
  notes: 'Notes + members',
  'social-workers': 'SW + members',
  applications: 'App status push',
};

function formatWhen(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export default function DatapageToolsPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingStatus(true);
      try {
        const res = await fetch('/api/caspio/members-cache/status', { cache: 'no-store' });
        const json = (await res.json().catch(() => ({}))) as SyncStatus;
        if (!cancelled) setStatus(json);
      } catch {
        if (!cancelled) setStatus({ success: false, error: 'Failed to load sync status' });
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const settings = status?.settings || {};

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">DataPage Tools</h1>
          <Badge variant="outline" className="gap-1">
            <Moon className="h-3.5 w-3.5" />
            Night updates
          </Badge>
        </div>
        <p className="text-muted-foreground max-w-3xl">
          Night jobs refresh Firestore caches from Caspio. Every datapage below reads that refreshed
          data the next day (notes stay on-demand during the day unless an admin syncs).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <RefreshCw className="h-5 w-5" />
            Latest members-cache sync
          </CardTitle>
          <CardDescription>Live status from the nightly Caspio → Firestore members pull</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStatus ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sync status…
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <div className="text-muted-foreground">Last sync</div>
                <div className="font-medium">{formatWhen(String(settings.lastSyncAt || ''))}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Mode</div>
                <div className="font-medium">{String(settings.lastMode || '—')}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Trigger</div>
                <div className="font-medium">{String(settings.lastRunTrigger || '—')}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Fetched / upserted</div>
                <div className="font-medium">
                  {typeof settings.lastRunSummary?.fetched === 'number'
                    ? `${settings.lastRunSummary.fetched.toLocaleString()} / ${Number(
                        settings.lastRunSummary.upserted || 0
                      ).toLocaleString()}`
                    : '—'}
                </div>
              </div>
            </div>
          )}
          {status?.error ? <p className="mt-3 text-sm text-destructive">{status.error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" />
            Night jobs
          </CardTitle>
          <CardDescription>What the app updates overnight (Eastern)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {NIGHT_JOBS.map((job) => (
            <div
              key={job.name}
              className="rounded-md border px-3 py-2.5 grid gap-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
            >
              <div>
                <div className="font-medium">{job.name}</div>
                <div className="text-xs text-muted-foreground">{job.schedule}</div>
              </div>
              <div className="text-sm">
                <div>
                  <span className="text-muted-foreground">From: </span>
                  {job.source}
                </div>
                <div>
                  <span className="text-muted-foreground">Writes: </span>
                  {job.writes}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-1">All pages updated</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Datapages that pick up the night members / SW / notes refresh
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {UPDATED_PAGES.map((page) => {
            const Icon = page.icon;
            return (
              <Card key={page.href} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-5 w-5 shrink-0 text-sky-700" />
                      <CardTitle className="text-base leading-snug">{page.title}</CardTitle>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {SOURCE_LABEL[page.dataSource]}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">{page.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm" variant="outline" className="w-full justify-between">
                    <Link href={page.href}>
                      Open datapage
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
