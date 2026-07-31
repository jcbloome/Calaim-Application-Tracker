
'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, type WithId } from '@/firebase';
import { collection, getDocs, collectionGroup, limit, query, where, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { errorEmitter, FirestorePermissionError } from '@/firebase';
import { useSearchParams } from 'next/navigation';
import { isCsSummaryFormName, isExcludedFromReviewQueue, isPendingDocumentReview } from '@/lib/review-queue';

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

const normalizeReviewKeyPart = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const isFormReviewedLike = (form: any) => {
  if (!form || typeof form !== 'object') return false;
  const acknowledged = Boolean(form?.acknowledged);
  const reviewed = Boolean(form?.reviewed);
  const reviewedAt = Boolean(String(form?.reviewedAt || form?.acknowledgedAt || '').trim());
  const reviewedBy = Boolean(
    String(form?.reviewedByName || form?.reviewedByEmail || form?.acknowledgedByName || form?.acknowledgedByEmail || '').trim()
  );
  return acknowledged || reviewed || reviewedAt || reviewedBy;
};

const isGenericMemberLabel = (value: unknown) => {
  const text = String(value || '').trim().toLowerCase();
  return text === 'member' || text === 'unknown member';
};

const toMillisSafe = (value: any): number | null => {
  if (!value) return null;
  try {
    if (typeof value?.toMillis === 'function') {
      const ms = value.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof value?.toDate === 'function') {
      const d = value.toDate();
      const ms = d instanceof Date ? d.getTime() : NaN;
      return Number.isFinite(ms) ? ms : null;
    }
    const seconds =
      typeof value?._seconds === 'number'
        ? value._seconds
        : typeof value?.seconds === 'number'
          ? value.seconds
          : null;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) return seconds * 1000;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
};

const nonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text && text.toLowerCase() !== 'unknown member') return text;
  }
  return '';
};

const fullName = (first: unknown, last: unknown) => {
  const combined = `${String(first || '').trim()} ${String(last || '').trim()}`.trim();
  return combined;
};

const normalizeNameFromSingleField = (value: unknown) => {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  if (!raw.includes(',')) return raw;
  const [lastRaw, firstRaw] = raw.split(',', 2);
  const first = String(firstRaw || '').trim();
  const last = String(lastRaw || '').trim();
  return `${first} ${last}`.trim() || raw;
};

const collectStringValues = (input: unknown, depth = 0): string[] => {
  if (!input || depth > 2) return [];
  if (typeof input === 'string') return [input];
  if (Array.isArray(input)) {
    return input.flatMap((entry) => collectStringValues(entry, depth + 1));
  }
  if (typeof input === 'object') {
    return Object.values(input as Record<string, unknown>).flatMap((entry) =>
      collectStringValues(entry, depth + 1)
    );
  }
  return [];
};

const looksLikePersonName = (value: unknown) => {
  const normalized = normalizeNameFromSingleField(value);
  if (!normalized) return false;
  if (normalized.length < 4 || normalized.length > 80) return false;
  if (/[0-9@/\\]|https?:\/\//i.test(normalized)) return false;
  if (!/\s/.test(normalized)) return false;
  const lowered = normalized.toLowerCase();
  if (
    /(waiver|authorization|document|upload|complete|submitted|pending|status|pathway|kaiser|health net|medicine list|proof of income|form)/i.test(
      lowered
    )
  ) {
    return false;
  }
  const parts = lowered.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((part) => /^[a-z'.-]{2,}$/.test(part));
};

const extractLikelyPersonName = (...inputs: unknown[]) => {
  for (const input of inputs) {
    const candidates = collectStringValues(input);
    for (const candidate of candidates) {
      if (looksLikePersonName(candidate)) {
        return normalizeNameFromSingleField(candidate);
      }
    }
  }
  return '';
};

const looksLikeMemberName = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const lowered = text.toLowerCase();
  if (lowered === 'unknown member' || lowered === 'member') return false;
  if (/\b(admin_app|unknown|n\/a|null|undefined)\b/i.test(lowered)) return false;
  return /[a-z]/i.test(text);
};

const findNameLikeValue = (record: any) => {
  if (!record || typeof record !== 'object') return '';
  const entries = Object.entries(record);
  for (const [key, raw] of entries) {
    if (typeof raw !== 'string') continue;
    if (!/(member.*name|name.*member|senior.*name|senior_first_last|full.?name)/i.test(String(key))) continue;
    if (!looksLikeMemberName(raw)) continue;
    return String(raw).trim();
  }
  return '';
};

const resolveMemberDisplayName = (record: any, fallbackId?: string, form?: any, upload?: any) => {
  const byFormAndUpload = nonEmpty(
    fullName(form?.memberFirstName, form?.memberLastName),
    fullName(upload?.memberFirstName, upload?.memberLastName),
    form?.memberName,
    upload?.memberName,
    form?.memberFullName,
    upload?.memberFullName
  );
  if (byFormAndUpload) return byFormAndUpload;

  const byStructuredName = nonEmpty(
    fullName(record?.memberFirstName, record?.memberLastName),
    fullName(record?.firstName, record?.lastName),
    fullName(record?.first_name, record?.last_name),
    fullName(record?.memberFirst, record?.memberLast),
    fullName(record?.MemberFirstName, record?.MemberLastName),
    fullName(record?.member_first, record?.member_last),
    fullName(record?.member_first_name, record?.member_last_name),
    fullName(record?.Member_First_Name, record?.Member_Last_Name),
    fullName(record?.member?.first_name, record?.member?.last_name),
    fullName(record?.member?.firstName, record?.member?.lastName),
    fullName(record?.memberInfo?.firstName, record?.memberInfo?.lastName),
    fullName(record?.parsedAuthorization?.memberFirstName, record?.parsedAuthorization?.memberLastName),
    fullName(record?.parsedAuthorization?.Member_First_Name, record?.parsedAuthorization?.Member_Last_Name),
    fullName(record?.parsedT2038?.memberFirstName, record?.parsedT2038?.memberLastName),
    fullName(record?.authorization?.memberFirstName, record?.authorization?.memberLastName),
    fullName(record?.Senior_First, record?.Senior_Last),
  );
  if (byStructuredName) return byStructuredName;

  const bySingleFieldRaw = nonEmpty(
    record?.memberName,
    record?.memberFullName,
    record?.member_name,
    record?.member_full_name,
    record?.Member_Name,
    record?.MemberFullName,
    record?.clientName,
    record?.fullName,
    record?.name,
    record?.memberHeadingName,
    record?.memberDisplayName,
    record?.member_display_name,
    record?.member_displayName,
    record?.member_first_last,
    record?.Senior_First_Last,
    record?.parsedAuthorization?.memberName,
    record?.parsedAuthorization?.Member_Name,
    record?.parsedT2038?.memberName,
    record?.authorization?.memberName,
    findNameLikeValue(record),
    findNameLikeValue(form),
    findNameLikeValue(upload),
  );
  const bySingleField = normalizeNameFromSingleField(bySingleFieldRaw);
  if (bySingleField) return bySingleField;

  const heuristicName = extractLikelyPersonName(form, upload, record);
  if (heuristicName) return heuristicName;

  const clientId2 = nonEmpty(record?.clientId2, record?.client_ID2, record?.Client_ID2);
  if (clientId2) return `Client ${clientId2}`;

  const mrn = nonEmpty(record?.memberMrn, record?.mrn, record?.memberMRN, record?.medicalRecordNumber);
  if (mrn) return `MRN ${mrn}`;

  return 'Member';
};

const getDashboardActionHref = (
  plan?: 'kaiser' | 'health-net',
  kind?: 'docs' | 'cs' | 'elig' | 'standalone',
  scope?: 'review'
) => {
  const params = new URLSearchParams();
  if (plan) params.set('plan', plan);
  if (kind) params.set('kind', kind);
  if (scope) params.set('scope', scope);
  const query = params.toString();
  return `/admin${query ? `?${query}` : ''}#new-items-log`;
};

export default function AdminDashboardPage() {
  const { user, isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const firestore = useFirestore();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [allApplications, setAllApplications] = useState<WithId<Application & FormValues>[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [standaloneUploads, setStandaloneUploads] = useState<any[]>([]);
  const [eligibilityChecks, setEligibilityChecks] = useState<any[]>([]);
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
  const [logKindFilter, setLogKindFilter] = useState<'all' | 'docs' | 'cs' | 'elig' | 'standalone'>('all');
  const [logScopeFilter, setLogScopeFilter] = useState<'all' | 'review' | 'reviewed'>('all');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [reviewingKeys, setReviewingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const plan = String(searchParams.get('plan') || '').trim().toLowerCase();
    if (!plan) {
      setLogPlanFilter('all');
    } else if (plan.includes('health-net') || plan.includes('health net') || plan.includes('healthnet')) {
      setLogPlanFilter('health-net');
    } else if (plan.includes('kaiser')) {
      setLogPlanFilter('kaiser');
    } else {
      setLogPlanFilter('all');
    }

    const kind = String(searchParams.get('kind') || '').trim().toLowerCase();
    if (kind === 'docs' || kind === 'cs' || kind === 'elig' || kind === 'standalone') {
      setLogKindFilter(kind);
    } else {
      setLogKindFilter('all');
    }

    const scope = String(searchParams.get('scope') || '').trim().toLowerCase();
    if (scope === 'review') {
      setLogScopeFilter('review');
    } else {
      setLogScopeFilter('all');
    }

    // When arriving from an action badge, show all matching review items (not just current month).
    const hasActionFilter = Boolean(plan || kind || scope);
    if (hasActionFilter) {
      setLogFilterMode('range');
      setLogStartDate('');
      setLogEndDate('');
    }
  }, [searchParams]);

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

  const getRequirementIdFromFormName = (formName: unknown): string => {
    const normalized = String(formName || '')
      .trim()
      .toLowerCase();
    if (!normalized) return '';
    if (normalized === 'cs member summary' || normalized === 'cs summary') return 'cs-summary';
    if (normalized === 'waivers' || normalized === 'waivers & authorizations') return 'waivers';
    if (normalized === 'proof of income') return 'proof-of-income';
    if (normalized === "lic 602a - physician's report") return 'lic-602a';
    if (normalized === 'medicine list') return 'medicine-list';
    if (normalized === 'declaration of eligibility') return 'declaration-of-eligibility';
    if (normalized === 'snf facesheet') return 'snf-facesheet';
    return '';
  };

  const buildAppItemUrl = (applicationId: string, appUserId?: string | null, formName?: unknown) => {
    const normalized = String(formName || '').trim().toLowerCase();
    if (normalized === 'customer feedback survey') {
      const params = new URLSearchParams();
      if (appUserId) params.set('userId', appUserId);
      params.set('focusRequirement', 'customer-feedback-survey');
      return `/admin/applications/${applicationId}?${params.toString()}`;
    }
    const requirementId = getRequirementIdFromFormName(formName);
    if (!requirementId) return buildAppUrl(applicationId, appUserId);
    const params = new URLSearchParams();
    if (appUserId) params.set('userId', appUserId);
    params.set('focusRequirement', requirementId);
    return `/admin/applications/${applicationId}?${params.toString()}`;
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
    const canonicalMemberNameByAppId = new Map<string, string>();
    const csReviewedByAppId = new Map<string, boolean>();
    const csReviewedMetaByAppId = new Map<string, { reviewedAtMs: number | null; reviewedBy: string }>();
    const docReviewedByAppAndForm = new Map<string, boolean>();
    const docReviewedMetaByAppAndForm = new Map<string, { reviewedAtMs: number | null; reviewedBy: string }>();
    (allApplications || []).forEach((candidate: any) => {
      const appId = String(candidate?.id || '').trim();
      if (!appId) return;
      const existing = String(canonicalMemberNameByAppId.get(appId) || '').trim();
      if (existing && existing !== 'Member') return;
      const resolved = resolveMemberDisplayName(candidate, appId);
      if (!resolved) return;
      if (resolved === 'Member' && existing) return;
      canonicalMemberNameByAppId.set(appId, resolved);

      const appChecked = Boolean(candidate?.applicationChecked);
      if (appChecked) {
        csReviewedByAppId.set(appId, true);
        const reviewedAtMs =
          toMillisSafe(candidate?.applicationCheckedAt) ??
          toMillisSafe(candidate?.lastUpdated) ??
          toMillisSafe(candidate?.lastModified);
        const reviewedBy = String(
          candidate?.applicationCheckedByName || candidate?.applicationCheckedByEmail || ''
        ).trim();
        csReviewedMetaByAppId.set(appId, { reviewedAtMs, reviewedBy });
      } else if (!csReviewedByAppId.has(appId)) {
        csReviewedByAppId.set(appId, false);
      }

      const forms = Array.isArray(candidate?.forms) ? candidate.forms : [];
      forms.forEach((form: any) => {
        const isCompleted = String(form?.status || '').trim().toLowerCase() === 'completed';
        if (!isCompleted) return;
        if (isCsSummaryFormName(form?.name) || isExcludedFromReviewQueue(form?.name)) return;
        const formKey = `${appId}::${normalizeReviewKeyPart(form?.name)}`;
        const isReviewed = isFormReviewedLike(form);
        if (isReviewed) {
          docReviewedByAppAndForm.set(formKey, true);
          const reviewedAtMs =
            toMillisSafe(form?.reviewedAt) ??
            toMillisSafe(form?.acknowledgedAt) ??
            toMillisSafe(form?.dateCompleted) ??
            toMillisSafe(candidate?.lastUpdated);
          const reviewedBy = String(
            form?.reviewedByName ||
              form?.reviewedByEmail ||
              form?.acknowledgedByName ||
              form?.acknowledgedByEmail ||
              ''
          ).trim();
          docReviewedMetaByAppAndForm.set(formKey, { reviewedAtMs, reviewedBy });
        } else if (!docReviewedByAppAndForm.has(formKey)) {
          docReviewedByAppAndForm.set(formKey, false);
        }
      });
    });

    const items: Array<{
      key: string;
      kind: 'doc' | 'cs' | 'elig' | 'standalone';
      createdAtMs: number;
      memberName: string;
      pathway: string;
      healthPlan: string;
      itemName: string;
      byName: string;
      memberMrn?: string;
      reviewedAtMs?: number | null;
      reviewedBy?: string;
      applicationId?: string;
      openHref: string;
      appUserId?: string | null;
      appPath?: string;
      formIndex?: number;
      needsReview: boolean;
      reviewLabel?: string;
    }> = [];

    (allApplications || []).forEach((app: any) => {
      const forms = Array.isArray(app.forms) ? app.forms : [];
      const appId = String(app?.id || '').trim();
      const baseMemberName =
        String(canonicalMemberNameByAppId.get(appId) || '').trim() ||
        resolveMemberDisplayName(app, app?.id);
      const memberMrn = nonEmpty(
        app?.memberMrn,
        app?.medicalRecordNumber,
        app?.mrn,
        app?.Member_MRN
      );
      const pathway = String(app.pathway || '').trim();
      const healthPlan = String(app.healthPlan || '').trim();
      const appUserId = app.appUserId || app.userId || null;
      const appPath = app.appPath;

      // CS Summary needs review.
      const summaryIndex = forms.findIndex((f: any) => isCsSummaryFormName(f?.name) && f.status === 'Completed');
      const csNeedsReview = !Boolean(csReviewedByAppId.get(appId));
      if (summaryIndex >= 0 && csNeedsReview) {
        const form = forms[summaryIndex] || {};
        const createdAtMs = (() => {
          const v = form.dateCompleted || app.csSummaryCompletedAt || app.lastUpdated || app.lastModified || app.createdAt;
          try {
            const ms = v?.toMillis?.() || v?.toDate?.()?.getTime?.() || new Date(v).getTime();
            return Number.isFinite(ms) ? ms : Date.now();
          } catch {
            return Date.now();
          }
        })();
        const byName = String(app.csSummarySubmittedByName || app.csSummarySubmittedByEmail || app.referrerName || app.referrerEmail || form.uploadedByName || form.uploadedByEmail || '').trim() || 'User';
        items.push({
          key: `cs-${app.id}-${summaryIndex}-${createdAtMs}`,
          kind: 'cs',
          createdAtMs,
          memberName: isGenericMemberLabel(baseMemberName) && memberMrn ? `MRN ${memberMrn}` : baseMemberName,
          memberMrn: memberMrn || undefined,
          pathway,
          healthPlan,
          itemName: 'CS Summary',
          byName,
          reviewedAtMs: csReviewedMetaByAppId.get(appId)?.reviewedAtMs ?? null,
          reviewedBy: csReviewedMetaByAppId.get(appId)?.reviewedBy || '',
          applicationId: app.id,
          openHref: buildAppItemUrl(app.id, appUserId, 'CS Member Summary'),
          appUserId,
          appPath,
          formIndex: summaryIndex,
          needsReview: true,
          reviewLabel: 'CS Member Summary',
        });
      }

      // Document uploads (timestamped per uploaded file when available).
      forms.forEach((form: any, idx: number) => {
        const isCompleted = form?.status === 'Completed';
        const isSummary = isCsSummaryFormName(form?.name);
        const isExcluded = isExcludedFromReviewQueue(form?.name);
        if (!isCompleted || isSummary || isExcluded) return;
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
          let memberName = resolveMemberDisplayName(app, app?.id, form, upload) || baseMemberName;
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
              const ms = v?.toMillis?.() || v?.toDate?.()?.getTime?.() || new Date(v).getTime();
              return Number.isFinite(ms) ? ms : Date.now();
            } catch {
              return Date.now();
            }
          })();
          const formReviewKey = `${appId}::${normalizeReviewKeyPart(form?.name)}`;
          const reviewedElsewhere = Boolean(docReviewedByAppAndForm.get(formReviewKey));
          const needsReview = isPendingDocumentReview(form) && !reviewedElsewhere;
          const reviewedMeta = docReviewedMetaByAppAndForm.get(formReviewKey);
          // Keep older rows when still requiring review so badge counts and log rows stay in sync.
          if (!needsReview) {
            const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
            const cutoff = Date.now() - WINDOW_MS;
            if (createdAtMs < cutoff) return;
          }

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
          if (memberName === 'Member' && byName && byName.toLowerCase() !== 'user') {
            memberName = byName;
          }
          if (isGenericMemberLabel(memberName) && memberMrn) {
            memberName = `MRN ${memberMrn}`;
          }

          items.push({
            key: `doc-${app.id}-${idx}-${uploadIdx}-${createdAtMs}`,
            kind: 'doc',
            createdAtMs,
            memberName,
            memberMrn: memberMrn || undefined,
            pathway,
            healthPlan,
            itemName: getCompactDocumentItemLabel(String(form?.name || ''), fileName),
            byName,
            reviewedAtMs: needsReview ? null : (reviewedMeta?.reviewedAtMs ?? null),
            reviewedBy: needsReview ? '' : (reviewedMeta?.reviewedBy || ''),
            applicationId: app.id,
            openHref: buildAppItemUrl(app.id, appUserId, form?.name),
            appUserId,
            appPath,
            formIndex: idx,
            needsReview,
            reviewLabel: String(form?.name || '').trim() || 'Document',
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
          const ms = v?.toMillis?.() || v?.toDate?.()?.getTime?.() || new Date(v).getTime();
          return Number.isFinite(ms) ? ms : Date.now();
        } catch {
          return Date.now();
        }
      })();
      const memberName = resolveMemberDisplayName(check, check?.id);
      const memberMrn = nonEmpty(check?.memberMrn, check?.mrn, check?.Member_MRN, check?.medicalRecordNumber);
      const healthPlan = String(check?.healthPlan || '').trim();
      const byName = String(check?.requesterName || `${check?.requesterFirstName || ''} ${check?.requesterLastName || ''}`.trim()).trim() || 'Requester';

      items.push({
        key: `elig-${String(check?.id || '').trim() || memberName}-${createdAtMs}`,
        kind: 'elig',
        createdAtMs,
        memberName: isGenericMemberLabel(memberName) && memberMrn ? `MRN ${memberMrn}` : memberName,
        memberMrn: memberMrn || undefined,
        pathway: '',
        healthPlan,
        itemName: 'Eligibility check',
        byName,
        openHref: `/admin/eligibility-checks?checkId=${encodeURIComponent(String(check?.id || '').trim())}`,
        needsReview: true,
        reviewLabel: 'Eligibility check',
      });
    });

    // Standalone uploads intake needing review
    (standaloneUploads || []).forEach((row: any) => {
      const status = String(row?.status || '').trim().toLowerCase();
      if (status !== 'pending') return;

      const createdAtMs = (() => {
        const v = row?.createdAt || row?.updatedAt;
        try {
          const ms = v?.toMillis?.() || v?.toDate?.()?.getTime?.() || new Date(v).getTime();
          return Number.isFinite(ms) ? ms : Date.now();
        } catch {
          return Date.now();
        }
      })();
      const memberName = resolveMemberDisplayName(row, row?.id);
      const memberMrn = nonEmpty(row?.memberMrn, row?.mrn, row?.Member_MRN, row?.medicalRecordNumber);
      const healthPlan = String(row?.healthPlan || '').trim();
      const byName = String(row?.uploaderName || row?.uploaderEmail || '').trim() || 'Uploader';
      const itemName = String(row?.documentType || 'Standalone upload').trim() || 'Standalone upload';

      items.push({
        key: `standalone-${String(row?.id || '').trim() || memberName}-${createdAtMs}`,
        kind: 'standalone',
        createdAtMs,
        memberName: isGenericMemberLabel(memberName) && memberMrn ? `MRN ${memberMrn}` : memberName,
        memberMrn: memberMrn || undefined,
        pathway: '',
        healthPlan,
        itemName,
        byName,
        openHref: `/admin/standalone-uploads?focus=${encodeURIComponent(String(row?.id || '').trim())}`,
        needsReview: true,
        reviewLabel: itemName,
      });
    });

    return items
      .filter((i) => Number.isFinite(i.createdAtMs))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [allApplications, eligibilityChecks, standaloneUploads]);

  const filteredAndSortedLog = useMemo(() => {
    const normalizedSearch = String(logSearchTerm || '').trim().toLowerCase();
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

    const matchesKindFilter = (kind: string) => {
      if (logKindFilter === 'all') return true;
      if (logKindFilter === 'docs') return kind === 'doc';
      if (logKindFilter === 'cs') return kind === 'cs';
      if (logKindFilter === 'elig') return kind === 'elig';
      if (logKindFilter === 'standalone') return kind === 'standalone';
      return true;
    };

    const filteredItems = (newItemLog || []).filter(
      (e) => inDateRange(e.createdAtMs) && matchesPlanFilter(e.healthPlan) && matchesKindFilter(e.kind)
    );

    const scopedItems =
      logScopeFilter === 'review'
        ? filteredItems.filter((e) => e.needsReview)
        : logScopeFilter === 'reviewed'
          ? filteredItems.filter((e) => !e.needsReview)
          : filteredItems;

    const searchedItems =
      !normalizedSearch
        ? scopedItems
        : scopedItems.filter((e) => {
            const memberName = String(e.memberName || '').toLowerCase();
            const memberMrn = String(e.memberMrn || '').toLowerCase();
            return memberName.includes(normalizedSearch) || memberMrn.includes(normalizedSearch);
          });

    const items =
      logScopeFilter === 'review' && logKindFilter === 'docs'
        ? Array.from(
            searchedItems
              .filter((e) => e.kind === 'doc')
              .reduce((acc, item) => {
                const groupKey = `${String(item.applicationId || item.openHref)}::${String(item.formIndex ?? item.reviewLabel ?? item.itemName)}`;
                const prev = acc.get(groupKey);
                if (!prev || item.createdAtMs > prev.createdAtMs) {
                  acc.set(groupKey, {
                    ...item,
                    itemName: item.reviewLabel || item.itemName,
                  });
                }
                return acc;
              }, new Map<string, (typeof searchedItems)[number]>())
              .values()
          )
        : searchedItems;

    const dirMul = logSort.dir === 'asc' ? 1 : -1;
    const norm = (v: any) => String(v || '').trim().toLowerCase();

    return [...items].sort((a, b) => {
      if (logSort.key === 'time') return (a.createdAtMs - b.createdAtMs) * dirMul;
      if (logSort.key === 'member') return norm(a.memberName).localeCompare(norm(b.memberName)) * dirMul;
      if (logSort.key === 'by') return norm(a.byName).localeCompare(norm(b.byName)) * dirMul;
      return 0;
    });
  }, [logEndDate, logFilterMode, logKindFilter, logMonth, logPlanFilter, logScopeFilter, logSearchTerm, logSort.dir, logSort.key, logStartDate, newItemLog]);

  const groupedDashboardLog = useMemo(() => {
    return filteredAndSortedLog.map((item) => ({
      rowKey: item.key,
      kind: item.kind,
      memberName: item.memberName,
      memberMrn: item.memberMrn || '',
      healthPlan: item.healthPlan,
      pathway: item.pathway,
      byName: item.byName,
      reviewedAtMs: item.reviewedAtMs ?? null,
      reviewedBy: item.reviewedBy || '',
      createdAtMs: item.createdAtMs,
      openHref: item.openHref,
      items: [item],
    }));
  }, [filteredAndSortedLog]);

  const markLogItemReviewed = useCallback(
    async (item: {
      key: string;
      kind: 'doc' | 'cs' | 'elig' | 'standalone';
      applicationId?: string;
      appPath?: string;
      appUserId?: string | null;
      formIndex?: number;
    }) => {
      if (!firestore) return;
      if (item.kind !== 'doc' && item.kind !== 'cs') return;

      const app = (allApplications || []).find((candidate: any) => {
        if (item.appPath && String(candidate?.appPath || '').trim() === String(item.appPath || '').trim()) {
          return true;
        }
        if (!item.applicationId) return false;
        return (
          String(candidate?.id || '').trim() === String(item.applicationId || '').trim() &&
          String(candidate?.appUserId || candidate?.userId || '').trim() === String(item.appUserId || '').trim()
        );
      });
      if (!app) {
        toast({
          title: 'Could not update item',
          description: 'Application record was not found for this log entry.',
          variant: 'destructive',
        });
        return;
      }

      const appPath = String((app as any)?.appPath || '').trim();
      if (!appPath) {
        toast({
          title: 'Could not update item',
          description: 'Application path is missing for this log entry.',
          variant: 'destructive',
        });
        return;
      }

      setReviewingKeys((prev) => {
        const next = new Set(prev);
        next.add(item.key);
        return next;
      });
      try {
        const ref = doc(firestore, appPath);
        const reviewerName = String(user?.displayName || user?.email || 'Staff').trim();
        const reviewerEmail = String(user?.email || '').trim();

        if (item.kind === 'cs') {
          await setDoc(
            ref,
            {
              applicationChecked: true,
              applicationCheckedAt: serverTimestamp(),
              applicationCheckedByName: reviewerName,
              applicationCheckedByEmail: reviewerEmail || null,
              lastUpdated: serverTimestamp(),
            },
            { merge: true }
          );
          setAllApplications((prev) =>
            prev.map((candidate: any) =>
              String(candidate?.appPath || '').trim() === appPath
                ? {
                    ...candidate,
                    applicationChecked: true,
                  }
                : candidate
            )
          );
        } else if (item.kind === 'doc' && Number.isInteger(item.formIndex)) {
          const forms = Array.isArray((app as any)?.forms) ? ([...(app as any).forms] as any[]) : [];
          const idx = Number(item.formIndex);
          if (!forms[idx]) {
            throw new Error('Document form not found.');
          }
          forms[idx] = {
            ...forms[idx],
            acknowledged: true,
            acknowledgedAt: new Date().toISOString(),
            acknowledgedByName: reviewerName,
            acknowledgedByEmail: reviewerEmail || '',
          };
          await setDoc(
            ref,
            {
              forms,
              pendingDocReviewUpdatedAt: serverTimestamp(),
              lastUpdated: serverTimestamp(),
            },
            { merge: true }
          );
          setAllApplications((prev) =>
            prev.map((candidate: any) =>
              String(candidate?.appPath || '').trim() === appPath
                ? {
                    ...candidate,
                    forms,
                  }
                : candidate
            )
          );
        }

        toast({
          title: 'Marked reviewed',
          description: 'Item removed from unresolved action items.',
        });
      } catch (error: any) {
        toast({
          title: 'Update failed',
          description: String(error?.message || 'Unable to mark item as reviewed.'),
          variant: 'destructive',
        });
      } finally {
        setReviewingKeys((prev) => {
          const next = new Set(prev);
          next.delete(item.key);
          return next;
        });
      }
    },
    [allApplications, firestore, toast, user?.displayName, user?.email]
  );

  const csSummaryStats = useMemo(() => {
    const result = {
      received: 0,
      needsReview: 0,
      hnNeedsReview: 0,
      kaiserNeedsReview: 0,
    };
    (newItemLog || [])
      .filter((item) => item.kind === 'cs')
      .forEach((item) => {
        result.received += 1;
        if (!item.needsReview) return;
        result.needsReview += 1;
        const plan = String(item.healthPlan || '').toLowerCase();
        if (plan.includes('kaiser')) result.kaiserNeedsReview += 1;
        if (plan.includes('health net')) result.hnNeedsReview += 1;
      });
    return result;
  }, [newItemLog]);

  const documentStats = useMemo(() => {
    const result = {
      received: 0,
      needsReview: 0,
      hnNeedsReview: 0,
      kaiserNeedsReview: 0,
    };
    (newItemLog || [])
      .filter((item) => item.kind === 'doc')
      .forEach((item) => {
        result.received += 1;
        if (!item.needsReview) return;
        result.needsReview += 1;
        const plan = String(item.healthPlan || '').toLowerCase();
        if (plan.includes('kaiser')) result.kaiserNeedsReview += 1;
        if (plan.includes('health net')) result.hnNeedsReview += 1;
      });
    return result;
  }, [newItemLog]);

  const eligibilityStats = useMemo(() => {
    const result = {
      needsReview: 0,
      hnNeedsReview: 0,
      kaiserNeedsReview: 0,
    };
    (newItemLog || [])
      .filter((item) => item.kind === 'elig' && item.needsReview)
      .forEach((item) => {
        result.needsReview += 1;
        const plan = String(item.healthPlan || '').toLowerCase();
        if (plan.includes('kaiser')) result.kaiserNeedsReview += 1;
        if (plan.includes('health net')) result.hnNeedsReview += 1;
      });
    return result;
  }, [newItemLog]);

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
        <h1 className="text-3xl font-bold">Activity Log</h1>
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
              href={getDashboardActionHref(undefined, 'cs', 'review')}
              className="inline-block text-2xl font-bold hover:underline"
              aria-label="View CS summaries needing review"
            >
              {csSummaryStats.needsReview}
            </Link>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href={getDashboardActionHref('health-net', 'cs', 'review')} aria-label="View Health Net CS summaries needing review">
                <Badge
                  variant="outline"
                  className="bg-green-100 text-green-800 border-green-200 cursor-pointer hover:opacity-90"
                >
                  HN(CS) {csSummaryStats.hnNeedsReview}
                </Badge>
              </Link>
              <Link href={getDashboardActionHref('kaiser', 'cs', 'review')} aria-label="View Kaiser CS summaries needing review">
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
              href={getDashboardActionHref(undefined, 'docs', 'review')}
              className="inline-block text-2xl font-bold hover:underline"
              aria-label="View documents needing review"
            >
              {documentStats.needsReview}
            </Link>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href={getDashboardActionHref('health-net', 'docs', 'review')} aria-label="View Health Net documents needing review">
                <Badge
                  variant="outline"
                  className="bg-green-100 text-green-800 border-green-200 cursor-pointer hover:opacity-90"
                >
                  HN(D) {documentStats.hnNeedsReview}
                </Badge>
              </Link>
              <Link href={getDashboardActionHref('kaiser', 'docs', 'review')} aria-label="View Kaiser documents needing review">
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
        <div id="new-items-log" />
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
                setLogKindFilter('all');
                setLogScopeFilter('all');
                setLogSearchTerm('');
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

            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground">Item Type</div>
              <div className="inline-flex rounded-md border bg-background p-1">
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logKindFilter === 'all' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogKindFilter('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logKindFilter === 'docs' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogKindFilter('docs')}
                >
                  Docs
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logKindFilter === 'cs' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogKindFilter('cs')}
                >
                  CS
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logKindFilter === 'elig' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogKindFilter('elig')}
                >
                  Elig
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logKindFilter === 'standalone' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogKindFilter('standalone')}
                >
                  Standalone
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted-foreground">Scope</div>
              <div className="inline-flex rounded-md border bg-background p-1">
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logScopeFilter === 'all' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogScopeFilter('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logScopeFilter === 'review' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogScopeFilter('review')}
                >
                  Needs review
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs rounded ${logScopeFilter === 'reviewed' ? 'bg-muted font-medium' : ''}`}
                  onClick={() => setLogScopeFilter('reviewed')}
                >
                  Reviewed
                </button>
              </div>
            </div>

            <div className="flex min-w-[220px] flex-1 flex-col gap-1">
              <div className="text-xs text-muted-foreground">Member Search</div>
              <Input
                value={logSearchTerm}
                onChange={(e) => setLogSearchTerm(e.target.value)}
                placeholder="Search member name or MRN"
                className="h-8 text-xs"
              />
            </div>

            <div className="ml-auto text-xs text-muted-foreground">
              Showing <span className="font-medium text-foreground">{groupedDashboardLog.length}</span> rows
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
            <span>
              <span className="font-medium text-foreground">Needs review</span> icon marks items requiring review action.
              {logScopeFilter === 'review'
                ? ' Showing only items that currently need review.'
                : logScopeFilter === 'reviewed'
                  ? ' Showing only reviewed/resolved items.'
                  : ''}
            </span>
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
                    <th className="text-right py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedDashboardLog.map((row) => {
                    const e = row.items[0];
                    const byNames = Array.from(new Set(row.items.map((item) => String(item.byName || '').trim()).filter(Boolean)));
                    return (
                    <tr key={row.rowKey} className="border-t">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(row.createdAtMs).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{row.memberName}</div>
                        {String((row as any).memberMrn || '').trim() ? (
                          <div className="text-xs text-muted-foreground">MRN: {String((row as any).memberMrn || '').trim()}</div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">{getCompactPlanLabel(row.healthPlan)}</td>
                      <td className="py-2 pr-3">{getCompactPathwayLabel(row.pathway)}</td>
                      <td className="py-2 pr-3">
                        {e.needsReview ? (
                          <span className="mr-2 inline-flex align-middle" title="Needs review">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                          </span>
                        ) : null}
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
                        {!e.needsReview ? (
                          <Badge variant="outline" className="ml-2 bg-emerald-50 border-emerald-200 text-emerald-800">
                            Reviewed
                          </Badge>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <div>{byNames.join(', ') || row.byName || '-'}</div>
                        {!e.needsReview ? (
                          <div className="text-xs text-muted-foreground">
                            Reviewed
                            {String((row as any).reviewedBy || '').trim() ? ` by ${String((row as any).reviewedBy || '').trim()}` : ''}
                            {Number.isFinite((row as any).reviewedAtMs)
                              ? ` on ${new Date(Number((row as any).reviewedAtMs)).toLocaleString()}`
                              : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap space-x-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={row.openHref}>Open</Link>
                        </Button>
                        {(e.kind === 'doc' || e.kind === 'cs') && e.needsReview ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const item = row.items[0] as any;
                              void markLogItemReviewed({
                                key: item?.key || row.rowKey,
                                kind: item?.kind || e.kind,
                                applicationId: item?.applicationId,
                                appPath: item?.appPath,
                                appUserId: item?.appUserId,
                                formIndex: item?.formIndex,
                              });
                            }}
                            disabled={reviewingKeys.has((row.items[0] as any)?.key || row.rowKey)}
                          >
                            {reviewingKeys.has((row.items[0] as any)?.key || row.rowKey) ? 'Saving...' : 'Mark Reviewed'}
                          </Button>
                        ) : null}
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
