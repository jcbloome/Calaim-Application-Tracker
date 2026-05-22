'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw } from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

type AssignmentRecord = {
  memberId?: string;
  memberName?: string;
  memberMrn?: string;
  assignedSwName?: string;
  assignedSwEmail?: string;
  prefillPurpose?: string;
  alftPlanId?: string;
  memberPhone?: string;
  memberPrimaryLanguage?: string;
  currentLocationType?: string;
  assessmentSite?: string;
  ispCurrentAddressStreet?: string;
  ispCurrentAddressCity?: string;
  ispCurrentAddressState?: string;
  ispCurrentAddressZip?: string;
  homeAddressStreet?: string;
  homeAddressCity?: string;
  homeAddressState?: string;
  homeAddressZip?: string;
  ispFacilityName?: string;
  verificationSignoff?: {
    verified?: boolean | null;
    verifiedAt?: any;
    verifiedByUid?: string | null;
    verifiedByEmail?: string | null;
    verifiedByName?: string | null;
  } | null;
};

const asText = (value: unknown) => String(value ?? '').trim();
const toMs = (value: any): number => {
  if (!value) return 0;
  try {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const dt = new Date(value);
    const ms = dt.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

export default function AlftVerificationPage() {
  const { isAdmin, isLoading: adminLoading } = useAdmin();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const memberId = asText(searchParams?.get('memberId'));
  const memberNameFromQuery = asText(searchParams?.get('member'));
  const memberMrnFromQuery = asText(searchParams?.get('mrn'));
  const returnTo = asText(searchParams?.get('returnTo'));
  const safeReturnTo = returnTo.startsWith('/admin/') ? returnTo : '';
  const workflowQuery = new URLSearchParams({
    ...(memberNameFromQuery ? { member: memberNameFromQuery } : {}),
    ...(memberId ? { memberId } : {}),
  }).toString();
  const trackerUrl = safeReturnTo || `/admin/alft-tracker${workflowQuery ? `?${workflowQuery}` : ''}`;
  const queueUrl = memberNameFromQuery
    ? `/admin/alft-assignment?member=${encodeURIComponent(memberNameFromQuery)}`
    : '/admin/alft-assignment';

  const [assignment, setAssignment] = useState<AssignmentRecord | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [lastManualSyncAt, setLastManualSyncAt] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!firestore || !memberId) return;
      setInitialLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'alft_assignments', memberId));
        if (!cancelled) {
          setAssignment(snap.exists() ? (snap.data() as AssignmentRecord) : null);
        }
      } catch {
        if (!cancelled) {
          toast({
            title: 'Could not load verification record',
            description: 'Open ALFT tracker and try again.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [firestore, memberId, toast]);

  const runManualSync = async () => {
    if (!auth?.currentUser || !memberId) {
      toast({ title: 'Sign in required', description: 'Please sign in and retry.', variant: 'destructive' });
      return;
    }
    setManualSyncing(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/prefill/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, memberId }),
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.ok) {
        throw new Error(String(data?.error || `Manual sync failed (HTTP ${res.status})`));
      }
      if (firestore) {
        const actorEmail = asText(auth.currentUser?.email).toLowerCase();
        const actorName = asText(auth.currentUser?.displayName) || actorEmail || 'Admin';
        await setDoc(
          doc(firestore, 'alft_assignments', memberId),
          {
            prefillVerification: {
              manualSyncAt: serverTimestamp(),
              manualSyncByUid: auth.currentUser?.uid || null,
              manualSyncByEmail: actorEmail || null,
              manualSyncByName: actorName || null,
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      setResolved((data?.resolved || {}) as Record<string, string>);
      setLastManualSyncAt(Date.now());
      toast({ title: 'Step 2 complete', description: 'Pre-fill fields refreshed from Caspio and saved to assignment record.' });
    } catch (e: any) {
      toast({
        title: 'Manual sync failed',
        description: e?.message || 'Could not refresh verification fields.',
        variant: 'destructive',
      });
    } finally {
      setManualSyncing(false);
    }
  };

  const fields = useMemo(() => {
    const row = assignment || {};
    const pick = (key: string, fallback?: unknown) => asText(resolved[key]) || asText(fallback);
    return [
      { label: 'Plan ID', value: pick('p1_plan_id', row.alftPlanId) },
      { label: 'MRN Number', value: pick('p1_mrn', row.memberMrn || memberMrnFromQuery) },
      { label: 'Member Name', value: pick('p1_member_name', row.memberName || memberNameFromQuery) },
      { label: 'Purpose of assessment', value: asText(row.prefillPurpose) || 'review' },
      { label: 'Current Location Street', value: pick('p2_current_street', row.ispCurrentAddressStreet) },
      { label: 'Current Location City', value: pick('p2_current_city', row.ispCurrentAddressCity) },
      { label: 'Current Location State', value: pick('p2_current_state', row.ispCurrentAddressState) },
      { label: 'Current Location Zip', value: pick('p2_current_zip', row.ispCurrentAddressZip) },
      { label: 'Current Location Type', value: pick('p2_current_type', row.currentLocationType) },
      { label: 'Assessment Site', value: pick('p2_assessment_site', row.assessmentSite) },
      { label: 'Home Address Street', value: pick('p2_home_street', row.homeAddressStreet) },
      { label: 'Home Address City', value: pick('p2_home_city', row.homeAddressCity) },
      { label: 'Home Address State', value: pick('p2_home_state', row.homeAddressState) },
      { label: 'Home Address Zip', value: pick('p2_home_zip', row.homeAddressZip) },
      { label: 'Facility Name', value: pick('p2_facility_name', row.ispFacilityName) },
      { label: 'Primary Language', value: pick('p1_primary_language', row.memberPrimaryLanguage) },
      { label: 'Phone Number', value: pick('p1_phone', row.memberPhone) },
    ];
  }, [assignment, memberMrnFromQuery, memberNameFromQuery, resolved]);

  const verified = Boolean(assignment?.verificationSignoff?.verified);
  const verifiedBy =
    asText(assignment?.verificationSignoff?.verifiedByName) ||
    asText(assignment?.verificationSignoff?.verifiedByEmail) ||
    '';
  const verifiedAtMs = toMs(assignment?.verificationSignoff?.verifiedAt);
  const verifiedAtLabel = verifiedAtMs ? new Date(verifiedAtMs).toLocaleString() : '';

  if (adminLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="max-w-md mx-auto mt-12">
        <CardHeader>
          <CardTitle>Admin access required</CardTitle>
          <CardDescription>You must be an admin to view this page.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Pre-fill ALFT Tool</CardTitle>
              <CardDescription>
                Pull Caspio values into ALFT prefill fields, then push back to ALFT Tracker to continue workflow.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href={queueUrl}>
                  Back to Assignment Queue
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={trackerUrl}>
                  ALFT Tracker
                </Link>
              </Button>
              <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void runManualSync()} disabled={!memberId || manualSyncing}>
                {manualSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Step 2: Manual Sync (Pull Caspio Prefill)
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium">{asText(assignment?.memberName) || memberNameFromQuery || 'Member'}</div>
            <div className="text-xs text-muted-foreground">
              Member ID: {memberId || '—'} • MRN: {asText(assignment?.memberMrn) || memberMrnFromQuery || '—'}
            </div>
            <div className="text-xs text-muted-foreground">
              SW: {asText(assignment?.assignedSwName) || asText(assignment?.assignedSwEmail) || '—'}
            </div>
          </div>

          {verified ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              Verification checkbox is complete.
              <div className="text-xs">
                Verified by <span className="font-medium">{verifiedBy || 'Unknown user'}</span>
                {verifiedAtLabel ? ` on ${verifiedAtLabel}` : ''}.
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Verification checkbox is not checked yet in workflow.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{Object.keys(resolved).length > 0 ? 'Live Caspio values loaded' : 'Showing saved assignment values'}</Badge>
            <span>{lastManualSyncAt ? `Last manual sync: ${new Date(lastManualSyncAt).toLocaleString()}` : 'No manual sync run yet.'}</span>
            {initialLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading assignment record...
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {fields.map((f) => (
              <div key={f.label} className="rounded border bg-muted/20 p-2">
                <div className="text-[11px] text-muted-foreground">{f.label}</div>
                <div className="text-sm">{f.value || '—'}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
