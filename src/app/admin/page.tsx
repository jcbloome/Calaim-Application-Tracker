
'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, AlertTriangle, BellRing, Clock3 } from 'lucide-react';
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

const getCompactPlanLabel = (plan: string) => {
  const normalized = String(plan || '').trim().toLowerCase();
  if (normalized.includes('kaiser')) return 'K';
  if (normalized.includes('health net') || normalized.includes('healthnet')) return 'H';
  return '-';
};

const getCompactPathwayLabel = (pathway: string) => {
  const normalized = String(pathway || '').trim().toLowerCase();
  if (!normalized) return '-';
  if (normalized.includes('diversion')) return 'Diversion';
  if (normalized.includes('transition')) return 'Transition';
  return String(pathway || '').trim();
};

const getCompactDocumentItemLabel = (formName: string, fileName: string) => {
  const form = String(formName || '').trim().toLowerCase();
  const file = String(fileName || '').trim().toLowerCase();
  const combined = `${form} ${file}`;

  if (combined.includes('602')) return '602 Upload';
  if (combined.includes('med') || combined.includes('medicine')) return 'Med List Upload';
  if (combined.includes('proof of income') || combined.includes('income')) return 'Income Upload';
  return 'Document Upload';
};

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
  const [logPlanFilter, setLogPlanFilter] = useState<'all' | 'health-net' | 'kaiser'>('all');

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
        const apps = [...userApps, ...adminApps].filter((app, index, arr) => {
          const dedupeKey = String((app as any).appPath || `${(app as any).source || ''}:${(app as any).id || ''}:${(app as any).appUserId || ''}`);
          return arr.findIndex((candidate) => {
            const candidateKey = String((candidate as any).appPath || `${(candidate as any).source || ''}:${(candidate as any).id || ''}:${(candidate as any).appUserId || ''}`);
            return candidateKey === dedupeKey;
          }) === index;
        });
        
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

      // Document uploads (timestamped per uploaded file when available).
      forms.forEach((form: any, idx: number) => {
        const isCompleted = form?.status === 'Completed';
        const isSummary = form?.name === 'CS Member Summary' || form?.name === 'CS Summary';
        if (!isCompleted || isSummary) return;
        const rawUploads = Array.isArray(form?.uploadedFiles) ? form.uploadedFiles : [];
        const uploads = rawUploads.length > 0
          ? rawUploads
          : [{
              fileName: String(form?.fileName || '').trim(),
              filePath: String(form?.filePath || '').trim(),
              uploadedAtIso: form?.dateCompleted || form?.uploadedAt || app.pendingDocReviewUpdatedAt || app.lastDocumentUpload || app.lastUpdated || app.lastModified || app.createdAt,
              uploadedByName: form?.uploadedByName || form?.uploadedByEmail || app.referrerName || app.referrerEmail || '',
            }];

        uploads.forEach((upload: any, uploadIdx: number) => {
          const createdAtMs = (() => {
            const v =
              upload?.uploadedAtIso ||
              upload?.uploadedAt ||
              upload?.createdAt ||
              form?.dateCompleted ||
              form?.uploadedAt ||
              app.pendingDocReviewUpdatedAt ||
              app.lastDocumentUpload ||
              app.lastUpdated ||
              app.lastModified ||
              app.createdAt;
            try {
              return v?.toMillis?.() || v?.toDate?.()?.getTime?.() || new Date(v).getTime();
            } catch {
              return Date.now();
            }
          })();
          if (createdAtMs < cutoff) return;

          const fileName = String(upload?.fileName || '').trim();
          const byName = String(
            upload?.uploadedByName ||
            upload?.uploadedByEmail ||
            form?.uploadedByName ||
            form?.uploadedByEmail ||
            app.referrerName ||
            app.referrerEmail ||
            ''
          ).trim() || 'User';

          items.push({
            key: `doc-${app.id}-${idx}-${uploadIdx}-${createdAtMs}`,
            kind: 'doc',
            createdAtMs,
            memberName,
            pathway,
            healthPlan,
            itemName: getCompactDocumentItemLabel(String(form?.name || ''), fileName),
            byName,
            applicationId: app.id,
            openHref: buildAppUrl(app.id, appUserId),
            appUserId,
            appPath,
            formIndex: idx,
          });
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
    const matchesPlanFilter = (healthPlan: string) => {
      const normalized = String(healthPlan || '').trim().toLowerCase();
      if (logPlanFilter === 'health-net') return normalized.includes('health net');
      if (logPlanFilter === 'kaiser') return normalized.includes('kaiser');
      return true;
    };
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

    const items = (newItemLog || []).filter((e) => inDateRange(e.createdAtMs) && matchesPlanFilter(e.healthPlan));

    const dirMul = logSort.dir === 'asc' ? 1 : -1;
    const norm = (v: any) => String(v || '').trim().toLowerCase();

    return [...items].sort((a, b) => {
      if (logSort.key === 'time') return (a.createdAtMs - b.createdAtMs) * dirMul;
      if (logSort.key === 'member') return norm(a.memberName).localeCompare(norm(b.memberName)) * dirMul;
      if (logSort.key === 'by') return norm(a.byName).localeCompare(norm(b.byName)) * dirMul;
      return 0;
    });
  }, [logEndDate, logFilterMode, logMonth, logPlanFilter, logSort.dir, logSort.key, logStartDate, newItemLog]);

  const groupedDashboardLog = useMemo(() => {
    return filteredAndSortedLog.map((item) => ({
      rowKey: item.key,
      kind: item.kind,
      memberName: item.memberName,
      healthPlan: item.healthPlan,
      pathway: item.pathway,
      byName: item.byName,
      createdAtMs: item.createdAtMs,
      openHref: item.openHref,
      items: [item],
    }));
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
        ...nonSummaryForms.map((form: any) =>
          toMs(form?.acknowledgedDate || form?.dateCompleted || form?.uploadedAt || form?.lastUpdated)
        ),
        toMs(app?.lastUpdated),
        toMs(app?.applicationCheckedDate)
      );
      const daysReady = readyAtMs > 0 ? Math.floor((Date.now() - readyAtMs) / (24 * 60 * 60 * 1000)) : 0;
      const reminderLevel: 'fresh' | 'due' | 'overdue' =
        daysReady >= 7 ? 'overdue' : daysReady >= 3 ? 'due' : 'fresh';

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

  const healthNetReadyReminderStats = useMemo(() => {
    return healthNetReadyForAuth.reduce(
      (acc, row) => {
        if (row.reminderLevel === 'overdue') acc.overdue += 1;
        else if (row.reminderLevel === 'due') acc.due += 1;
        else acc.fresh += 1;
        return acc;
      },
      { fresh: 0, due: 0, overdue: 0 }
    );
  }, [healthNetReadyForAuth]);

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
              Ongoing timestamped log of new activity, including each document upload, with direct links to each member's application pathway.
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

            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground">Health Plan</div>
              <div className="inline-flex rounded-md border bg-background p-1">
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logPlanFilter === 'all' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogPlanFilter('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logPlanFilter === 'health-net' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogPlanFilter('health-net')}
                >
                  Health Net
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logPlanFilter === 'kaiser' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogPlanFilter('kaiser')}
                >
                  Kaiser
                </button>
              </div>
            </div>

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
                    <th className="text-center py-2 pr-3">Seen (local)</th>
                    <th className="text-right py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedDashboardLog.map((row) => {
                    const e = row.items[0];
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
                      <td className="py-2 pr-3">{getCompactPlanLabel(row.healthPlan)}</td>
                      <td className="py-2 pr-3">{getCompactPathwayLabel(row.pathway)}</td>
                      <td className="py-2 pr-3">
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
                            ? 'Document Upload'
                            : e.kind === 'cs'
                              ? 'CS Summary'
                              : e.kind === 'elig'
                                ? 'Eligibility'
                                : 'Standalone'}
                        </Badge>
                        <span className="ml-2">{e.itemName}</span>
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
          <div className="pt-3 text-xs text-muted-foreground">
            “Seen (local)” only affects your personal dashboard checkmark. Action-item counts remain until CS/doc items are reviewed in the application.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-green-700" />
            Health Net Authorization Readiness
          </CardTitle>
          <CardDescription>
            Members where CS summary + required documents are complete and reviewed, so assigned Health Net staff can submit authorization requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
              Ready now {healthNetReadyReminderStats.fresh}
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
              Reminder due {healthNetReadyReminderStats.due}
            </Badge>
            <Badge variant="outline" className="bg-red-50 text-red-800 border-red-200">
              Overdue {healthNetReadyReminderStats.overdue}
            </Badge>
          </div>
          {healthNetReadyForAuth.length === 0 ? (
            <div className="text-sm text-muted-foreground">No Health Net members are fully ready yet.</div>
          ) : (
            <div className="space-y-2">
              {healthNetReadyForAuth.slice(0, 25).map((row) => {
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
