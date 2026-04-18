
'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, type WithId } from '@/firebase';
import { collection, getDocs, collectionGroup, limit, query, where } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { errorEmitter, FirestorePermissionError } from '@/firebase';
import { Checkbox } from '@/components/ui/checkbox';

const normalizeLookup = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export default function AdminDashboardPage() {
  const { user, isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [allApplications, setAllApplications] = useState<WithId<Application & FormValues>[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [standaloneUploads, setStandaloneUploads] = useState<any[]>([]);
  const [eligibilityChecks, setEligibilityChecks] = useState<any[]>([]);
  const [seenMap, setSeenMap] = useState<Record<string, boolean>>({});
  const [logSort, setLogSort] = useState<{ key: 'time' | 'member' | 'by'; dir: 'asc' | 'desc' }>({
    key: 'time',
    dir: 'desc',
  });
  const [logFilterMode, setLogFilterMode] = useState<'month' | 'range'>('month');
  const [logMonth, setLogMonth] = useState<string>(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  });
  const [logStartDate, setLogStartDate] = useState<string>('');
  const [logEndDate, setLogEndDate] = useState<string>('');

  const seenStorageKey = useMemo(() => {
    if (!user?.uid) return null;
    return `admin:new-items-seen:${user.uid}`;
  }, [user?.uid]);

  useEffect(() => {
    if (!seenStorageKey) return;
    try {
      const raw = localStorage.getItem(seenStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (parsed && typeof parsed === 'object') {
        setSeenMap(parsed);
      }
    } catch {
      // ignore
    }
  }, [seenStorageKey]);

  const setSeen = (key: string, value: boolean) => {
    setSeenMap((prev) => {
      const next = { ...(prev || {}), [key]: value };
      if (seenStorageKey) {
        try {
          localStorage.setItem(seenStorageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  const fetchApps = useCallback(async () => {
    if (isAdminLoading || !firestore || !isAdmin) {
        if (!isAdminLoading) setIsLoadingApps(false);
        return;
      }
      
    setIsLoadingApps(true);
    setError(null);
    try {
        // Query both user applications and admin-created applications
        const userAppsQuery = collectionGroup(firestore, 'applications');
        const adminAppsQuery = collection(firestore, 'applications');
        
        const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
          getDocs(userAppsQuery).catch(e => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applications (collection group)', operation: 'list' }));
            throw e;
          }),
          getDocs(adminAppsQuery).catch(e => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applications (collection)', operation: 'list' }));
            throw e;
          })
        ]);

        // Combine both user and admin applications with unique keys
        const userApps = userAppsSnapshot.docs.map((docSnap) => ({ 
          ...docSnap.data(), 
          id: docSnap.id,
          uniqueKey: `user-${docSnap.id}-${docSnap.ref?.parent?.parent?.id || 'user'}`,
          source: 'user',
          appUserId: docSnap.ref?.parent?.parent?.id || null,
          appPath: docSnap.ref.path,
        })) as WithId<Application & FormValues>[];
        const adminApps = adminAppsSnapshot.docs.map((docSnap) => ({ 
          ...docSnap.data(), 
          id: docSnap.id,
          uniqueKey: `admin-${docSnap.id}`,
          source: 'admin',
          appUserId: null,
          appPath: docSnap.ref.path,
        })) as WithId<Application & FormValues>[];
        const apps = [...userApps, ...adminApps];
        
        setAllApplications(apps);

        // Standalone uploads intake (pending)
        try {
          const snap = await getDocs(
            query(collection(firestore, 'standalone_upload_submissions'), where('status', '==', 'pending'), limit(500))
          );
          setStandaloneUploads(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        } catch {
          setStandaloneUploads([]);
        }

        // Eligibility checks (pending/in-progress)
        try {
          const res = await fetch('/api/admin/eligibility-checks', { method: 'GET' });
          const data = (await res.json().catch(() => ({}))) as any;
          const checks = Array.isArray(data?.checks) ? data.checks : [];
          setEligibilityChecks(checks);
        } catch {
          setEligibilityChecks([]);
        }
    } catch (err: any) {
        setError(err);
    } finally {
        setIsLoadingApps(false);
    }
  }, [firestore, isAdmin, isAdminLoading]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const buildAppUrl = (applicationId: string, appUserId?: string | null) => {
    if (appUserId) return `/admin/applications/${applicationId}?userId=${encodeURIComponent(appUserId)}`;
    return `/admin/applications/${applicationId}`;
  };

  // Keep the dashboard log fresh without hammering Firestore.
  useEffect(() => {
    if (!isAdmin || !firestore) return;
    const t = setInterval(() => {
      fetchApps().catch(() => undefined);
    }, 60_000);
    return () => clearInterval(t);
  }, [fetchApps, firestore, isAdmin]);

  const newItemLog = useMemo(() => {
    const items: Array<{
      key: string;
      kind: 'doc' | 'cs' | 'elig' | 'standalone';
      createdAtMs: number;
      memberName: string;
      pathway: string;
      healthPlan: string;
      itemName: string;
      byName: string;
      applicationId?: string;
      openHref: string;
      appUserId?: string | null;
      appPath?: string;
      formIndex?: number;
    }> = [];

    const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - WINDOW_MS;

    (allApplications || []).forEach((app: any) => {
      const forms = Array.isArray(app.forms) ? app.forms : [];
      const memberName = `${app.memberFirstName || 'Unknown'} ${app.memberLastName || 'Member'}`.trim();
      const pathway = String(app.pathway || '').trim();
      const healthPlan = String(app.healthPlan || '').trim();
      const appUserId = app.appUserId || app.userId || null;
      const appPath = app.appPath;

      // CS Summary needs review.
      const summaryIndex = forms.findIndex((f: any) => (f.name === 'CS Member Summary' || f.name === 'CS Summary') && f.status === 'Completed');
      if (summaryIndex >= 0 && !app.applicationChecked) {
        const form = forms[summaryIndex] || {};
        const createdAtMs = (() => {
          const v = form.dateCompleted || app.csSummaryCompletedAt || app.lastUpdated || app.lastModified || app.createdAt;
          try {
            return v?.toMillis?.() || v?.toDate?.()?.getTime?.() || new Date(v).getTime();
          } catch {
            return Date.now();
          }
        })();
        if (createdAtMs >= cutoff) {
        const byName = String(app.csSummarySubmittedByName || app.csSummarySubmittedByEmail || app.referrerName || app.referrerEmail || form.uploadedByName || form.uploadedByEmail || '').trim() || 'User';
        items.push({
          key: `cs-${app.id}-${summaryIndex}-${createdAtMs}`,
          kind: 'cs',
          createdAtMs,
          memberName,
          pathway,
          healthPlan,
          itemName: 'CS Summary',
          byName,
          applicationId: app.id,
          openHref: buildAppUrl(app.id, appUserId),
          appUserId,
          appPath,
          formIndex: summaryIndex,
        });
        }
      }

      // Documents needing acknowledgement.
      forms.forEach((form: any, idx: number) => {
        const isCompleted = form?.status === 'Completed';
        const isSummary = form?.name === 'CS Member Summary' || form?.name === 'CS Summary';
        if (!isCompleted || isSummary) return;
        if (form?.acknowledged) return;
        const createdAtMs = (() => {
          const v = form.dateCompleted || form.uploadedAt || app.pendingDocReviewUpdatedAt || app.lastDocumentUpload || app.lastUpdated || app.lastModified || app.createdAt;
          try {
            return v?.toMillis?.() || v?.toDate?.()?.getTime?.() || new Date(v).getTime();
          } catch {
            return Date.now();
          }
        })();
        if (createdAtMs < cutoff) return;
        const byName = String(form.uploadedByName || form.uploadedByEmail || app.referrerName || app.referrerEmail || '').trim() || 'User';
        items.push({
          key: `doc-${app.id}-${idx}-${createdAtMs}`,
          kind: 'doc',
          createdAtMs,
          memberName,
          pathway,
          healthPlan,
          itemName: String(form.name || 'Document'),
          byName,
          applicationId: app.id,
          openHref: buildAppUrl(app.id, appUserId),
          appUserId,
          appPath,
          formIndex: idx,
        });
      });
    });

    // Eligibility checks needing review
    (eligibilityChecks || []).forEach((check: any) => {
      const status = String(check?.status || '').trim().toLowerCase();
      const needsReview = status === 'pending' || status === 'in-progress';
      if (!needsReview) return;

      const createdAtMs = (() => {
        const v = check?.timestamp || check?.createdAt || check?.requestedAt;
        try {
          return v?.toMillis?.() || v?.toDate?.()?.getTime?.() || new Date(v).getTime();
        } catch {
          return Date.now();
        }
      })();
      if (createdAtMs < cutoff) return;

      const memberName = String(check?.memberName || `${check?.memberFirstName || ''} ${check?.memberLastName || ''}`.trim()).trim() || 'Unknown Member';
      const healthPlan = String(check?.healthPlan || '').trim();
      const byName = String(check?.requesterName || `${check?.requesterFirstName || ''} ${check?.requesterLastName || ''}`.trim()).trim() || 'Requester';

      items.push({
        key: `elig-${String(check?.id || '').trim() || memberName}-${createdAtMs}`,
        kind: 'elig',
        createdAtMs,
        memberName,
        pathway: '',
        healthPlan,
        itemName: 'Eligibility check',
        byName,
        openHref: `/admin/eligibility-checks?checkId=${encodeURIComponent(String(check?.id || '').trim())}`,
      });
    });

    // Standalone uploads intake needing review
    (standaloneUploads || []).forEach((row: any) => {
      const status = String(row?.status || '').trim().toLowerCase();
      if (status !== 'pending') return;

      const createdAtMs = (() => {
        const v = row?.createdAt || row?.updatedAt;
        try {
          return v?.toMillis?.() || v?.toDate?.()?.getTime?.() || new Date(v).getTime();
        } catch {
          return Date.now();
        }
      })();
      if (createdAtMs < cutoff) return;

      const memberName = String(row?.memberName || `${row?.memberFirstName || ''} ${row?.memberLastName || ''}`.trim()).trim() || 'Unknown Member';
      const healthPlan = String(row?.healthPlan || '').trim();
      const byName = String(row?.uploaderName || row?.uploaderEmail || '').trim() || 'Uploader';
      const itemName = String(row?.documentType || 'Standalone upload').trim() || 'Standalone upload';

      items.push({
        key: `standalone-${String(row?.id || '').trim() || memberName}-${createdAtMs}`,
        kind: 'standalone',
        createdAtMs,
        memberName,
        pathway: '',
        healthPlan,
        itemName,
        byName,
        openHref: `/admin/standalone-uploads?focus=${encodeURIComponent(String(row?.id || '').trim())}`,
      });
    });

    return items
      .filter((i) => Number.isFinite(i.createdAtMs))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 100);
  }, [allApplications, eligibilityChecks, standaloneUploads]);

  const filteredAndSortedLog = useMemo(() => {
    const inDateRange = (ms: number) => {
      if (!Number.isFinite(ms)) return false;
      if (logFilterMode === 'month') {
        if (!logMonth) return true;
        const d = new Date(ms);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const key = `${d.getFullYear()}-${mm}`;
        return key === logMonth;
      }

      // range mode
      if (!logStartDate && !logEndDate) return true;
      const startMs = logStartDate ? new Date(`${logStartDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
      const endMs = logEndDate ? new Date(`${logEndDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
      return ms >= startMs && ms <= endMs;
    };

    const items = (newItemLog || []).filter((e) => inDateRange(e.createdAtMs));

    const dirMul = logSort.dir === 'asc' ? 1 : -1;
    const norm = (v: any) => String(v || '').trim().toLowerCase();

    return [...items].sort((a, b) => {
      if (logSort.key === 'time') return (a.createdAtMs - b.createdAtMs) * dirMul;
      if (logSort.key === 'member') return norm(a.memberName).localeCompare(norm(b.memberName)) * dirMul;
      if (logSort.key === 'by') return norm(a.byName).localeCompare(norm(b.byName)) * dirMul;
      return 0;
    });
  }, [logEndDate, logFilterMode, logMonth, logSort.dir, logSort.key, logStartDate, newItemLog]);

  const groupedDashboardLog = useMemo(() => {
    type LogItem = (typeof filteredAndSortedLog)[number];
    type GroupedLogRow = {
      rowKey: string;
      kind: LogItem['kind'];
      memberName: string;
      healthPlan: string;
      pathway: string;
      byName: string;
      createdAtMs: number;
      openHref: string;
      items: LogItem[];
    };

    const groupedDocs = new Map<string, GroupedLogRow>();
    const rows: GroupedLogRow[] = [];

    filteredAndSortedLog.forEach((item) => {
      if (item.kind !== 'doc') {
        rows.push({
          rowKey: item.key,
          kind: item.kind,
          memberName: item.memberName,
          healthPlan: item.healthPlan,
          pathway: item.pathway,
          byName: item.byName,
          createdAtMs: item.createdAtMs,
          openHref: item.openHref,
          items: [item],
        });
        return;
      }

      const groupKey = [
        normalizeLookup(item.memberName),
        normalizeLookup(item.healthPlan),
        normalizeLookup(item.pathway),
      ].join('|');

      const existing = groupedDocs.get(groupKey);
      if (!existing) {
        groupedDocs.set(groupKey, {
          rowKey: `doc-group-${groupKey}`,
          kind: 'doc',
          memberName: item.memberName,
          healthPlan: item.healthPlan,
          pathway: item.pathway,
          byName: item.byName,
          createdAtMs: item.createdAtMs,
          openHref: item.openHref,
          items: [item],
        });
        return;
      }

      existing.items.push(item);
      if (item.createdAtMs > existing.createdAtMs) {
        existing.createdAtMs = item.createdAtMs;
        existing.byName = item.byName;
        existing.openHref = item.openHref;
      }
    });

    const docRows = Array.from(groupedDocs.values()).map((row) => ({
      ...row,
      items: [...row.items].sort((a, b) => b.createdAtMs - a.createdAtMs),
    }));

    return [...rows, ...docRows].sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [filteredAndSortedLog]);

  const csSummaryStats = useMemo(() => {
    const result = {
      received: 0,
      needsReview: 0,
      hnNeedsReview: 0,
      kaiserNeedsReview: 0,
    };

    if (!allApplications) return result;

    allApplications.forEach((app) => {
      const forms = app.forms || [];
      const hasCompletedSummary = forms.some((form: any) =>
        (form.name === 'CS Member Summary' || form.name === 'CS Summary') && form.status === 'Completed'
      );
      if (!hasCompletedSummary) return;

      result.received += 1;
      const plan = String(app.healthPlan || '').toLowerCase();
      const isKaiser = plan.includes('kaiser');
      const isHn = plan.includes('health net');

      if (!app.applicationChecked) {
        result.needsReview += 1;
        if (isKaiser) result.kaiserNeedsReview += 1;
        if (isHn) result.hnNeedsReview += 1;
      }
    });

    return result;
  }, [allApplications]);

  const documentStats = useMemo(() => {
    const result = {
      received: 0,
      needsReview: 0,
      hnNeedsReview: 0,
      kaiserNeedsReview: 0,
    };

    if (!allApplications) return result;

    allApplications.forEach((app) => {
      const forms = app.forms || [];
      forms.forEach((form: any) => {
        const isCompleted = form.status === 'Completed';
        const isSummary = form.name === 'CS Member Summary' || form.name === 'CS Summary';
        if (!isCompleted || isSummary) return;

        result.received += 1;
        const plan = String(app.healthPlan || '').toLowerCase();
        const isKaiser = plan.includes('kaiser');
        const isHn = plan.includes('health net');

        if (!form.acknowledged) {
          result.needsReview += 1;
          if (isKaiser) result.kaiserNeedsReview += 1;
          if (isHn) result.hnNeedsReview += 1;
        }
      });
    });

    return result;
  }, [allApplications]);

  const eligibilityStats = useMemo(() => {
    const result = {
      needsReview: 0,
      hnNeedsReview: 0,
      kaiserNeedsReview: 0,
    };

    (eligibilityChecks || []).forEach((check: any) => {
      const status = String(check?.status || '').trim().toLowerCase();
      if (status !== 'pending' && status !== 'in-progress') return;
      result.needsReview += 1;
      const plan = String(check?.healthPlan || '').toLowerCase();
      if (plan.includes('kaiser')) result.kaiserNeedsReview += 1;
      if (plan.includes('health net')) result.hnNeedsReview += 1;
    });

    return result;
  }, [eligibilityChecks]);

  if (isAdminLoading || isLoadingApps) {
    return (
      <div className="space-y-6">
        {/* Stats Cards Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </div>
    );
  }

   if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">Failed to load application data: A permission error occurred.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Activity Dashboard</h1>
        <p className="text-muted-foreground">
          Daily dashboard with notifications and statistics.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-l-4 border-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CS Summary Needs Review</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/applications?review=cs"
              className="inline-block text-2xl font-bold hover:underline"
              aria-label="View CS summaries needing review"
            >
              {csSummaryStats.needsReview}
            </Link>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href="/admin/applications?plan=health-net&review=cs" aria-label="View Health Net CS summaries needing review">
                <Badge
                  variant="outline"
                  className="bg-green-100 text-green-800 border-green-200 cursor-pointer hover:opacity-90"
                >
                  HN(CS) {csSummaryStats.hnNeedsReview}
                </Badge>
              </Link>
              <Link href="/admin/applications?plan=kaiser&review=cs" aria-label="View Kaiser CS summaries needing review">
                <Badge
                  variant="outline"
                  className="bg-blue-100 text-blue-800 border-blue-200 cursor-pointer hover:opacity-90"
                >
                  K(CS) {csSummaryStats.kaiserNeedsReview}
                </Badge>
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents Need Review</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/applications?review=docs"
              className="inline-block text-2xl font-bold hover:underline"
              aria-label="View documents needing review"
            >
              {documentStats.needsReview}
            </Link>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href="/admin/applications?plan=health-net&review=docs" aria-label="View Health Net documents needing review">
                <Badge
                  variant="outline"
                  className="bg-green-100 text-green-800 border-green-200 cursor-pointer hover:opacity-90"
                >
                  HN(D) {documentStats.hnNeedsReview}
                </Badge>
              </Link>
              <Link href="/admin/applications?plan=kaiser&review=docs" aria-label="View Kaiser documents needing review">
                <Badge
                  variant="outline"
                  className="bg-blue-100 text-blue-800 border-blue-200 cursor-pointer hover:opacity-90"
                >
                  K(D) {documentStats.kaiserNeedsReview}
                </Badge>
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eligibility Check Needs Review</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/eligibility-checks"
              className="inline-block text-2xl font-bold hover:underline"
              aria-label="View eligibility checks needing review"
            >
              {eligibilityStats.needsReview}
            </Link>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge
                variant="outline"
                className="bg-green-100 text-green-800 border-green-200"
              >
                HN(E) {eligibilityStats.hnNeedsReview}
              </Badge>
              <Badge
                variant="outline"
                className="bg-blue-100 text-blue-800 border-blue-200"
              >
                K(E) {eligibilityStats.kaiserNeedsReview}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between flex-row">
          <div>
            <CardTitle>New items log</CardTitle>
            <CardDescription>
              Live list of items that need review/processing (CS summaries, documents, eligibility checks, and standalone upload intakes).
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => fetchApps()} disabled={isLoadingApps}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3 pb-4">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground">Filter</div>
              <div className="inline-flex rounded-md border bg-background p-1">
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logFilterMode === 'month' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogFilterMode('month')}
                >
                  Month
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logFilterMode === 'range' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogFilterMode('range')}
                >
                  Date range
                </button>
              </div>
            </div>

            {logFilterMode === 'month' ? (
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground">Month</div>
                <input
                  type="month"
                  value={logMonth}
                  onChange={(e) => setLogMonth(e.target.value)}
                  className="h-9 rounded-md border px-3 text-sm bg-background"
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-muted-foreground">From</div>
                  <input
                    type="date"
                    value={logStartDate}
                    onChange={(e) => setLogStartDate(e.target.value)}
                    className="h-9 rounded-md border px-3 text-sm bg-background"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-muted-foreground">To</div>
                  <input
                    type="date"
                    value={logEndDate}
                    onChange={(e) => setLogEndDate(e.target.value)}
                    className="h-9 rounded-md border px-3 text-sm bg-background"
                  />
                </div>
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLogFilterMode('month');
                const d = new Date();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                setLogMonth(`${d.getFullYear()}-${mm}`);
                setLogStartDate('');
                setLogEndDate('');
              }}
            >
              Reset
            </Button>

            <div className="ml-auto text-xs text-muted-foreground">
              Showing <span className="font-medium text-foreground">{groupedDashboardLog.length}</span> rows
            </div>
          </div>

          {groupedDashboardLog.length === 0 ? (
            <div className="text-sm text-muted-foreground">No new items right now.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left py-2 pr-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() =>
                          setLogSort((prev) => ({
                            key: 'time',
                            dir: prev.key === 'time' ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'desc',
                          }))
                        }
                      >
                        Time
                        {logSort.key === 'time' ? (logSort.dir === 'asc' ? '▲' : '▼') : null}
                      </button>
                    </th>
                    <th className="text-left py-2 pr-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() =>
                          setLogSort((prev) => ({
                            key: 'member',
                            dir: prev.key === 'member' ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'asc',
                          }))
                        }
                      >
                        Member
                        {logSort.key === 'member' ? (logSort.dir === 'asc' ? '▲' : '▼') : null}
                      </button>
                    </th>
                    <th className="text-left py-2 pr-3">Plan</th>
                    <th className="text-left py-2 pr-3">Pathway</th>
                    <th className="text-left py-2 pr-3">Item</th>
                    <th className="text-left py-2 pr-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() =>
                          setLogSort((prev) => ({
                            key: 'by',
                            dir: prev.key === 'by' ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'asc',
                          }))
                        }
                      >
                        By
                        {logSort.key === 'by' ? (logSort.dir === 'asc' ? '▲' : '▼') : null}
                      </button>
                    </th>
                    <th className="text-center py-2 pr-3">Seen</th>
                    <th className="text-right py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedDashboardLog.map((row) => {
                    const e = row.items[0];
                    const isDocGroup = row.kind === 'doc';
                    const allSeen = row.items.every((item) => Boolean(seenMap[item.key]));
                    const byNames = Array.from(new Set(row.items.map((item) => String(item.byName || '').trim()).filter(Boolean)));
                    return (
                    <tr key={row.rowKey} className="border-t">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(row.createdAtMs).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{row.memberName}</div>
                      </td>
                      <td className="py-2 pr-3">{row.healthPlan || '-'}</td>
                      <td className="py-2 pr-3">{row.pathway || '-'}</td>
                      <td className="py-2 pr-3">
                        {isDocGroup ? (
                          <div className="space-y-1">
                            {row.items.map((item) => (
                              <div key={item.key} className="flex flex-wrap items-center gap-2">
                                <span>{item.itemName}</span>
                                <Badge variant="outline" className="bg-red-50 border-red-200 text-red-800">
                                  Flagged
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <Badge
                              variant="outline"
                              className={
                                e.kind === 'doc'
                                  ? 'bg-green-50 border-green-200 text-green-800'
                                  : e.kind === 'cs'
                                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                                    : e.kind === 'elig'
                                      ? 'bg-purple-50 border-purple-200 text-purple-800'
                                      : 'bg-orange-50 border-orange-200 text-orange-800'
                              }
                            >
                              {e.kind === 'doc'
                                ? 'Document'
                                : e.kind === 'cs'
                                  ? 'CS Summary'
                                  : e.kind === 'elig'
                                    ? 'Eligibility'
                                    : 'Standalone'}
                            </Badge>
                            <span className="ml-2">{e.itemName}</span>
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-3">{byNames.join(', ') || row.byName || '-'}</td>
                      <td className="py-2 pr-3 text-center">
                        <Checkbox
                          checked={allSeen}
                          onCheckedChange={(checked) => {
                            row.items.forEach((item) => setSeen(item.key, Boolean(checked)));
                          }}
                          aria-label={`Mark seen for ${row.memberName}`}
                        />
                      </td>
                      <td className="py-2 text-right whitespace-nowrap space-x-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={row.openHref}>Open</Link>
                        </Button>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      
    </div>
  );
}
