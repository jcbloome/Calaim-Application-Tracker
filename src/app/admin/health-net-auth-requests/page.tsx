'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore, type WithId } from '@/firebase';
import { collection, collectionGroup, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, BellRing, Clock3 } from 'lucide-react';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';

const toMs = (value: any): number => {
  if (!value) return 0;
  try {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

export default function HealthNetAuthRequestsPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const firestore = useFirestore();
  const [allApplications, setAllApplications] = useState<WithId<Application & FormValues>[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(true);

  const fetchApps = useCallback(async () => {
    if (isAdminLoading || !firestore || !isAdmin) {
      if (!isAdminLoading) setIsLoadingApps(false);
      return;
    }

    setIsLoadingApps(true);
    try {
      const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
        getDocs(collectionGroup(firestore, 'applications')),
        getDocs(collection(firestore, 'applications')),
      ]);

      const userApps = userAppsSnapshot.docs.map((docSnap) => ({
        ...docSnap.data(),
        id: docSnap.id,
        source: 'user',
        appUserId: docSnap.ref?.parent?.parent?.id || null,
        appPath: docSnap.ref.path,
      })) as WithId<Application & FormValues>[];
      const adminApps = adminAppsSnapshot.docs.map((docSnap) => ({
        ...docSnap.data(),
        id: docSnap.id,
        source: 'admin',
        appUserId: null,
        appPath: docSnap.ref.path,
      })) as WithId<Application & FormValues>[];

      const deduped = [...userApps, ...adminApps].filter((app, index, arr) => {
        const key = String((app as any).appPath || `${(app as any).source || ''}:${(app as any).id || ''}:${(app as any).appUserId || ''}`);
        return (
          arr.findIndex((candidate) => {
            const candidateKey = String(
              (candidate as any).appPath ||
                `${(candidate as any).source || ''}:${(candidate as any).id || ''}:${(candidate as any).appUserId || ''}`
            );
            return candidateKey === key;
          }) === index
        );
      });

      setAllApplications(deduped);
    } finally {
      setIsLoadingApps(false);
    }
  }, [firestore, isAdmin, isAdminLoading]);

  useEffect(() => {
    void fetchApps();
  }, [fetchApps]);

  const healthNetReadyForAuth = useMemo(() => {
    const rows: Array<{
      id: string;
      memberName: string;
      appHref: string;
      assignedStaff: string;
      readyAtMs: number;
      reminderLevel: 'fresh' | 'due' | 'overdue';
      daysReady: number;
    }> = [];

    (allApplications || []).forEach((app: any) => {
      const plan = String(app?.healthPlan || '').trim().toLowerCase();
      if (!plan.includes('health net')) return;

      const forms = Array.isArray(app?.forms) ? app.forms : [];
      const nonSummaryForms = forms.filter((form: any) => {
        const name = String(form?.name || '').trim().toLowerCase();
        return name !== 'cs member summary' && name !== 'cs summary';
      });
      if (nonSummaryForms.length === 0) return;

      const hasCompletedSummary = forms.some((form: any) => {
        const name = String(form?.name || '').trim().toLowerCase();
        return (name === 'cs member summary' || name === 'cs summary') && String(form?.status || '').trim() === 'Completed';
      });
      if (!hasCompletedSummary) return;
      if (!Boolean(app?.applicationChecked)) return;

      const allNonSummaryCompleted = nonSummaryForms.every((form: any) => String(form?.status || '').trim() === 'Completed');
      if (!allNonSummaryCompleted) return;

      const pendingReview = nonSummaryForms.some((form: any) => !Boolean(form?.acknowledged));
      if (pendingReview) return;

      const ownerUid = app?.appUserId || app?.userId || null;
      const appHref = ownerUid
        ? `/admin/applications/${app.id}?userId=${encodeURIComponent(String(ownerUid))}`
        : `/admin/applications/${app.id}`;
      const memberName = `${String(app?.memberFirstName || '').trim()} ${String(app?.memberLastName || '').trim()}`.trim() || 'Unknown Member';
      const assignedStaff = String(app?.assignedStaffName || app?.assignedStaff || 'Staff unassigned').trim();
      const readyAtMs = Math.max(
        ...nonSummaryForms.map((form: any) => toMs(form?.acknowledgedDate || form?.dateCompleted || form?.uploadedAt || form?.lastUpdated)),
        toMs(app?.lastUpdated),
        toMs(app?.applicationCheckedDate)
      );
      const daysReady = readyAtMs > 0 ? Math.floor((Date.now() - readyAtMs) / (24 * 60 * 60 * 1000)) : 0;
      const reminderLevel: 'fresh' | 'due' | 'overdue' = daysReady >= 7 ? 'overdue' : daysReady >= 3 ? 'due' : 'fresh';

      rows.push({
        id: String(app.id || '').trim(),
        memberName,
        appHref,
        assignedStaff,
        readyAtMs,
        reminderLevel,
        daysReady,
      });
    });

    return rows.sort((a, b) => b.readyAtMs - a.readyAtMs);
  }, [allApplications]);

  const reminderStats = useMemo(
    () =>
      healthNetReadyForAuth.reduce(
        (acc, row) => {
          if (row.reminderLevel === 'overdue') acc.overdue += 1;
          else if (row.reminderLevel === 'due') acc.due += 1;
          else acc.fresh += 1;
          return acc;
        },
        { fresh: 0, due: 0, overdue: 0 }
      ),
    [healthNetReadyForAuth]
  );

  if (isAdminLoading || isLoadingApps) {
    return <div className="p-6 text-sm text-muted-foreground">Loading Health Net authorization requests...</div>;
  }

  if (!isAdmin) {
    return <div className="p-6 text-sm text-destructive">Access denied.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Health Net Auth Requests</h1>
        <p className="text-sm text-muted-foreground">
          Members ready for assigned Health Net staff to submit authorization requests.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-green-700" />
            Authorization Readiness Queue
          </CardTitle>
          <CardDescription>
            CS summary and required documents are complete and reviewed. These members are ready for Health Net authorization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
              Ready now {reminderStats.fresh}
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
              Reminder due {reminderStats.due}
            </Badge>
            <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
              Overdue {reminderStats.overdue}
            </Badge>
          </div>

          {healthNetReadyForAuth.length === 0 ? (
            <div className="text-sm text-muted-foreground">No Health Net members are fully ready yet.</div>
          ) : (
            <div className="space-y-2">
              {healthNetReadyForAuth.map((row) => {
                const reminderIcon =
                  row.reminderLevel === 'overdue' ? (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  ) : row.reminderLevel === 'due' ? (
                    <Clock3 className="h-4 w-4 text-amber-600" />
                  ) : (
                    <BellRing className="h-4 w-4 text-emerald-600" />
                  );
                const reminderLabel =
                  row.reminderLevel === 'overdue'
                    ? `Overdue (${row.daysReady}d)`
                    : row.reminderLevel === 'due'
                      ? `Reminder due (${row.daysReady}d)`
                      : `Ready (${row.daysReady}d)`;

                return (
                  <div key={`${row.id}-${row.readyAtMs}`} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{row.memberName}</div>
                      <div className="text-xs text-muted-foreground">Assigned: {row.assignedStaff || 'Staff unassigned'}</div>
                    </div>
                    <div className="ml-3 flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          row.reminderLevel === 'overdue'
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : row.reminderLevel === 'due'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }
                      >
                        <span className="inline-flex items-center gap-1">
                          {reminderIcon}
                          {reminderLabel}
                        </span>
                      </Badge>
                      <Button asChild size="sm" variant="outline">
                        <Link href={row.appHref}>Open</Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
