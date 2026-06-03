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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, RefreshCw } from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

type AssignmentRecord = {
  memberId?: string;
  memberName?: string;
  memberMrn?: string;
  birthDate?: string;
  assignedSwName?: string;
  assignedSwEmail?: string;
  prefillPurpose?: string;
  alftPlanId?: string;
  memberPhone?: string;
  memberPrimaryLanguage?: string;
  currentLocationType?: string;
  currentLocationTypeOther?: string;
  ispCurrentLocation?: string;
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
  ispContactName?: string;
  ispContactRelationship?: string;
  ispContactPhone?: string;
  ispContactEmail?: string;
  ispContact2First?: string;
  ispContact2Last?: string;
  ispContact2Relationship?: string;
  ispContact2Phone?: string;
  ispContact2Email?: string;
  ispContactConfirmDate?: string;
  prefillVerification?: {
    manualSyncAt?: any;
    manualSyncByUid?: string | null;
    manualSyncByEmail?: string | null;
    manualSyncByName?: string | null;
    resolvedFields?: Record<string, string>;
  } | null;
  verificationSignoff?: {
    verified?: boolean | null;
    verifiedAt?: any;
    verifiedByUid?: string | null;
    verifiedByEmail?: string | null;
    verifiedByName?: string | null;
  } | null;
};

const asText = (value: unknown) => String(value ?? '').trim();
const parseFlexibleDate = (value: unknown): Date | null => {
  const raw = asText(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (us) {
    const first = Number(us[1]);
    const second = Number(us[2]);
    const year = Number(us[3]);
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    const dt = new Date(year, month - 1, day);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const toMdy = (value: unknown) => {
  const parsed = parseFlexibleDate(value);
  if (!parsed) return asText(value);
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const yyyy = String(parsed.getFullYear());
  return `${mm}-${dd}-${yyyy}`;
};

const isWithinOneDay = (value: unknown): boolean => {
  const parsed = parseFlexibleDate(value);
  if (!parsed) return false;
  const ageMs = Date.now() - parsed.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return ageMs >= 0 && ageMs <= oneDayMs;
};
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

  const [assignment, setAssignment] = useState<AssignmentRecord | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [step2Completed, setStep2Completed] = useState(false);
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [resettingTool, setResettingTool] = useState(false);
  const [toolResetMode, setToolResetMode] = useState(false);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [lastManualSyncAt, setLastManualSyncAt] = useState<number>(0);
  const persistedResolved = useMemo(
    () =>
      ((((assignment as any)?.prefillVerification || {}) as any)?.resolvedFields || {}) as Record<string, unknown>,
    [assignment]
  );
  const ispContactLastVerifiedRaw = toolResetMode
    ? ''
    : asText(resolved.isp_contact_confirm_date) ||
      asText(persistedResolved.isp_contact_confirm_date) ||
      asText(assignment?.ispContactConfirmDate);
  const ispContactLastVerifiedDisplay = toMdy(ispContactLastVerifiedRaw);
  const ispContactLastVerifiedFresh = isWithinOneDay(ispContactLastVerifiedRaw);
  const verified = Boolean(assignment?.verificationSignoff?.verified);
  const canReturnToWorkflow =
    step2Completed &&
    verified &&
    ispContactLastVerifiedFresh &&
    !manualSyncing &&
    !verificationSaving &&
    !resettingTool;

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
        const resolvedNow = (data?.resolved || {}) as Record<string, string>;
        const syncedMcpCin = asText(resolvedNow.isp_mcp_cin);
        const syncedMrn = asText(syncedMcpCin || resolvedNow.p1_mrn);
        const syncedPlanId = asText(syncedMcpCin || resolvedNow.p1_plan_id || syncedMrn);
        const syncedDob = asText(resolvedNow.p1_dob);
        const syncedHomeStreet = asText(resolvedNow.p2_home_street);
        const syncedHomeCity = asText(resolvedNow.p2_home_city);
        const syncedHomeState = asText(resolvedNow.p2_home_state);
        const syncedHomeZip = asText(resolvedNow.p2_home_zip);
        const syncedCurrentStreet = asText(resolvedNow.p2_current_street);
        const syncedCurrentCity = asText(resolvedNow.p2_current_city);
        const syncedCurrentState = asText(resolvedNow.p2_current_state);
        const syncedCurrentZip = asText(resolvedNow.p2_current_zip);
        const syncedCurrentType = asText(resolvedNow.p2_current_type);
        const syncedCurrentTypeOther = asText(resolvedNow.p2_current_type_other);
        const syncedFacilityName = asText(resolvedNow.p2_facility_name || resolvedNow.isp_location_name);
        const syncedIsp2First = asText(resolvedNow.isp_contact_2_first);
        const syncedIsp2Last = asText(resolvedNow.isp_contact_2_last);
        const syncedIsp2Relationship = asText(resolvedNow.isp_contact_2_relationship);
        const syncedIsp2Phone = asText(resolvedNow.isp_contact_2_phone);
        const syncedIsp2Email = asText(resolvedNow.isp_contact_2_email);
        await setDoc(
          doc(firestore, 'alft_assignments', memberId),
          {
            ...(syncedMrn ? { memberMrn: syncedMrn } : {}),
            ...(syncedPlanId ? { alftPlanId: syncedPlanId } : {}),
            ...(syncedDob ? { birthDate: syncedDob } : {}),
            ...(syncedHomeStreet ? { homeAddressStreet: syncedHomeStreet } : {}),
            ...(syncedHomeCity ? { homeAddressCity: syncedHomeCity } : {}),
            ...(syncedHomeState ? { homeAddressState: syncedHomeState } : {}),
            ...(syncedHomeZip ? { homeAddressZip: syncedHomeZip } : {}),
            ...(syncedCurrentStreet ? { ispCurrentAddressStreet: syncedCurrentStreet } : {}),
            ...(syncedCurrentCity ? { ispCurrentAddressCity: syncedCurrentCity } : {}),
            ...(syncedCurrentState ? { ispCurrentAddressState: syncedCurrentState } : {}),
            ...(syncedCurrentZip ? { ispCurrentAddressZip: syncedCurrentZip } : {}),
            ...(syncedCurrentType ? { currentLocationType: syncedCurrentType } : {}),
            ...(syncedCurrentTypeOther ? { currentLocationTypeOther: syncedCurrentTypeOther } : {}),
            ...(syncedFacilityName
              ? {
                  ispFacilityName: syncedFacilityName,
                  ispCurrentLocation: syncedFacilityName,
                }
              : {}),
            ...(syncedIsp2First ? { ispContact2First: syncedIsp2First } : {}),
            ...(syncedIsp2Last ? { ispContact2Last: syncedIsp2Last } : {}),
            ...(syncedIsp2Relationship ? { ispContact2Relationship: syncedIsp2Relationship } : {}),
            ...(syncedIsp2Phone ? { ispContact2Phone: syncedIsp2Phone } : {}),
            ...(syncedIsp2Email ? { ispContact2Email: syncedIsp2Email } : {}),
            // Each manual sync is a fresh pull, so force a new verification sign-off.
            verificationSignoff: {
              verified: false,
              verifiedAt: null,
              verifiedByUid: null,
              verifiedByEmail: null,
              verifiedByName: null,
            },
            prefillVerification: {
              ...(((assignment as any)?.prefillVerification || {}) as Record<string, unknown>),
              manualSyncAt: serverTimestamp(),
              manualSyncByUid: auth.currentUser?.uid || null,
              manualSyncByEmail: actorEmail || null,
              manualSyncByName: actorName || null,
              resolvedFields: resolvedNow,
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      setResolved((data?.resolved || {}) as Record<string, string>);
      setLastManualSyncAt(Date.now());
      setStep2Completed(true);
      setToolResetMode(false);
      setAssignment((prev) => ({
        ...(prev || {}),
        prefillVerification: {
          ...(((prev as any)?.prefillVerification || {}) as Record<string, unknown>),
          resolvedFields: (data?.resolved || {}) as Record<string, string>,
        },
        verificationSignoff: {
          verified: false,
          verifiedAt: null,
          verifiedByUid: null,
          verifiedByEmail: null,
          verifiedByName: null,
        },
      }));
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

  const resetToolState = async () => {
    if (!auth?.currentUser || !firestore || !memberId) {
      toast({ title: 'Sign in required', description: 'Please sign in and retry.', variant: 'destructive' });
      return;
    }
    setResettingTool(true);
    try {
      await setDoc(
        doc(firestore, 'alft_assignments', memberId),
        {
          verificationSignoff: {
            verified: false,
            verifiedAt: null,
            verifiedByUid: null,
            verifiedByEmail: null,
            verifiedByName: null,
          },
          prefillVerification: {
            manualSyncAt: null,
            manualSyncByUid: null,
            manualSyncByEmail: null,
            manualSyncByName: null,
            resolvedFields: {},
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setResolved({});
      setLastManualSyncAt(0);
      setStep2Completed(false);
      setToolResetMode(true);
      setAssignment((prev) => ({
        ...(prev || {}),
        verificationSignoff: {
          verified: false,
          verifiedAt: null,
          verifiedByUid: null,
          verifiedByEmail: null,
          verifiedByName: null,
        },
      }));
      toast({ title: 'Tool reset', description: 'Cleared pulled values, unchecked verification, and returned to Step 2.' });
    } catch (e: any) {
      toast({
        title: 'Could not reset tool',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setResettingTool(false);
    }
  };

  const setVerifiedState = async (checked: boolean) => {
    if (!auth?.currentUser || !firestore || !memberId) {
      toast({ title: 'Sign in required', description: 'Please sign in and retry.', variant: 'destructive' });
      return;
    }
    if (checked && !ispContactLastVerifiedFresh) {
      toast({
        title: 'Cannot verify yet',
        description: 'ISP Contact Last Verified must be within 1 day before checking Verified.',
        variant: 'destructive',
      });
      return;
    }
    setVerificationSaving(true);
    try {
      const actorEmail = asText(auth.currentUser?.email).toLowerCase();
      const actorName = asText(auth.currentUser?.displayName) || actorEmail || 'Admin';
      await setDoc(
        doc(firestore, 'alft_assignments', memberId),
        {
          verificationSignoff: {
            verified: checked,
            verifiedAt: checked ? serverTimestamp() : null,
            verifiedByUid: checked ? auth.currentUser?.uid || null : null,
            verifiedByEmail: checked ? actorEmail || null : null,
            verifiedByName: checked ? actorName : null,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setAssignment((prev) => ({
        ...(prev || {}),
        verificationSignoff: {
          verified: checked,
          verifiedAt: checked ? new Date() : null,
          verifiedByUid: checked ? auth.currentUser?.uid || null : null,
          verifiedByEmail: checked ? actorEmail || null : null,
          verifiedByName: checked ? actorName : null,
        },
      }));
      toast({
        title: checked ? 'Verified saved' : 'Verification cleared',
        description: checked ? 'Verification checkbox saved with staff attribution.' : 'Verification checkbox reset.',
      });
    } catch (e: any) {
      toast({
        title: 'Could not save verification',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setVerificationSaving(false);
    }
  };

  const sections = useMemo(() => {
    const row = assignment || {};
    const pick = (key: string, fallback?: unknown) =>
      toolResetMode ? '' : asText(resolved[key]) || asText(persistedResolved[key]) || asText(fallback);
    const currentLocationTypeOther = pick('p2_current_type_other', row.currentLocationTypeOther || row.currentLocationType);
    const ispLocationAddress = pick('isp_contact_street', '');
    const ispLocationCity = pick('isp_contact_city', '');
    const ispLocationState = pick('isp_contact_state', '');
    const ispLocationZip = pick('isp_contact_zip', '');
    const ispLocationType = pick('isp_location_type', '');
    const ispLocationName = pick('isp_location_name', '');
    return [
      {
        title: 'Form Basics',
        fields: [
          { label: 'Plan ID', value: toolResetMode ? '' : asText(resolved.p1_plan_id || resolved.p1_mrn || resolved.isp_mcp_cin) },
          { label: 'MRN Number', value: toolResetMode ? '' : asText(resolved.p1_mrn || resolved.isp_mcp_cin) },
          { label: 'Date of Birth', value: toolResetMode ? '' : asText(resolved.p1_dob || row.birthDate) },
          { label: 'Member Name', value: pick('p1_member_name', row.memberName || memberNameFromQuery) },
          { label: 'Purpose of assessment', value: asText(row.prefillPurpose) },
          { label: 'Assessment Site', value: pick('p2_assessment_site', row.assessmentSite) },
          { label: 'Primary Language', value: pick('p1_primary_language', row.memberPrimaryLanguage) },
          { label: 'Phone Number', value: pick('p1_phone', row.memberPhone) },
        ],
      },
      {
        title: 'ISP Location',
        fields: [
      { label: 'ISP Location Address', value: ispLocationAddress },
      { label: 'ISP Location City', value: ispLocationCity },
      { label: 'ISP Location State', value: ispLocationState },
      { label: 'ISP Location Zip', value: ispLocationZip },
      { label: 'ISP Location Type', value: ispLocationType },
      { label: 'ISP Location Name', value: ispLocationName },
      { label: 'Facility Name (ALFT)', value: pick('p2_facility_name', row.ispFacilityName) },
      { label: 'Current Location Type Other Detail (ALFT)', value: currentLocationTypeOther },
      { label: 'ISP Contact First', value: pick('isp_contact_first', '') },
      { label: 'ISP Contact Last', value: pick('isp_contact_last', '') },
      { label: 'ISP Contact Phone', value: pick('isp_contact_phone', row.ispContactPhone) },
      { label: 'ISP Contact Email', value: pick('isp_contact_email', row.ispContactEmail) },
      { label: 'ISP Contact Relationship', value: pick('p1_other_responder_relationship', row.ispContactRelationship) },
      { label: 'ISP Contact 2 First', value: pick('isp_contact_2_first', row.ispContact2First) },
      { label: 'ISP Contact 2 Last', value: pick('isp_contact_2_last', row.ispContact2Last) },
      { label: 'ISP Contact 2 Relationship', value: pick('isp_contact_2_relationship', row.ispContact2Relationship) },
      { label: 'ISP Contact 2 Phone', value: pick('isp_contact_2_phone', row.ispContact2Phone) },
      { label: 'ISP Contact 2 Email', value: pick('isp_contact_2_email', row.ispContact2Email) },
      { label: 'ISP Contact Last Verified', value: toMdy(pick('isp_contact_confirm_date', row.ispContactConfirmDate)) },
        ],
      },
      {
        title: 'Home Location (MCP Address for Member)',
        fields: [
          { label: 'Home Address Street', value: pick('p2_home_street', row.homeAddressStreet) },
          { label: 'Home Address City', value: pick('p2_home_city', row.homeAddressCity) },
          { label: 'Home Address State', value: pick('p2_home_state', row.homeAddressState) },
          { label: 'Home Address Zip', value: pick('p2_home_zip', row.homeAddressZip) },
        ],
      },
    ];
  }, [
    assignment,
    memberNameFromQuery,
    persistedResolved,
    resolved,
    toolResetMode,
  ]);

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
              <Button
                variant="outline"
                className="border-emerald-500 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                onClick={() => void runManualSync()}
                disabled={!memberId || manualSyncing || resettingTool}
              >
                {manualSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Step 2: Manual Sync (Pull Caspio Prefill)
              </Button>
              <Button
                variant="outline"
                className="border-emerald-500 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 disabled:border-slate-300 disabled:text-slate-500 disabled:hover:bg-transparent"
                asChild
                disabled={!canReturnToWorkflow}
              >
                <Link href={trackerUrl}>
                  Step 3: Tool Complete Return to Workflow
                </Link>
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={trackerUrl}>Go Back to Workflow for Member</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void resetToolState()}
                disabled={manualSyncing || verificationSaving || resettingTool}
              >
                {resettingTool ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Reset Tool
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
          {!ispContactLastVerifiedFresh ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              ISP Contact Last Verified must be within 1 day before returning to workflow.
              <div className="text-xs">
                {ispContactLastVerifiedDisplay
                  ? `Current value: ${ispContactLastVerifiedDisplay}`
                  : 'Current value is missing.'}
              </div>
            </div>
          ) : null}
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="prefill-verified"
                checked={verified}
                disabled={!step2Completed || manualSyncing || verificationSaving || resettingTool || (!ispContactLastVerifiedFresh && !verified)}
                onCheckedChange={(next) => void setVerifiedState(next === true)}
              />
              <label htmlFor="prefill-verified" className="text-sm font-medium leading-none">
                Verified
              </label>
              {verificationSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {!step2Completed
                ? 'Run Step 2 first to enable verification.'
                : !ispContactLastVerifiedFresh
                  ? 'Verification is locked until ISP Contact Last Verified is within 1 day.'
                : verifiedBy
                  ? `Verified by ${verifiedBy}${verifiedAtLabel ? ` on ${verifiedAtLabel}` : ''}.`
                  : 'Not yet verified by staff.'}
            </div>
          </div>

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

          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="text-sm font-semibold text-slate-800">{section.title}</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {section.fields.map((f) => (
                  <div key={`${section.title}-${f.label}`} className="rounded border bg-muted/20 p-2">
                    <div className="text-[11px] text-muted-foreground">{f.label}</div>
                    <div className="text-sm">{f.value || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
