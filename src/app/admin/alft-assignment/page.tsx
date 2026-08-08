'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

// ── Types ──────────────────────────────────────────────────────────────────────

type KaiserMember = {
  id: string;
  memberName: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  swId: string;
  birthDate: string;
  memberSex: string;
  memberPrimaryLanguage: string;
  memberPhone: string;
  ispCurrentAddressStreet: string;
  ispCurrentAddressCity: string;
  ispCurrentAddressState: string;
  ispCurrentAddressZip: string;
  ispFacilityName: string;
  kaiserStatus: string;
  alftAssigned: string;
  ispCurrentLocation: string;
  ispContactName: string;
  ispContactPhone: string;
  ispContactEmail: string;
  ispContactConfirmDate: string;
  socialWorkerAssigned: string;
  socialWorkerEmail: string;
  sourceRecord?: Record<string, unknown>;
};

type AlftAssignment = {
  memberId: string;
  memberName: string;
  assignedSwId?: string;
  assignedSwEmail: string;
  assignedSwName: string;
  status:
    | 'assigned'
    | 'in_progress'
    | 'submitted'
    | 'completed'
    | 'sw_form_in_progress'
    | 'awaiting_manager_review'
    | 'returned_to_sw_for_changes'
    | 'awaiting_rn_final_review'
    | 'rn_finalized_ready_for_ils';
  assignedAt: any;
  assignedByEmail: string;
  assignedByName: string;
  prefillVerification?: {
    manualSyncAt?: any;
    manualSyncByUid?: string | null;
    manualSyncByEmail?: string | null;
    manualSyncByName?: string | null;
  } | null;
};

const normalizeSwNameForUi = (name: string) =>
  (() => {
    let value = String(name || '').trim().replace(/\s+\d+$/, '').trim();
    if (!value) return '';
    if (value.includes(',')) {
      const [last, first] = value.split(',', 2).map((part) => part.trim());
      value = `${first || ''} ${last || ''}`.trim();
    }
    return value
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .split(' ')
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
      .join(' ')
      .trim();
  })();

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  assigned: { label: 'Assigned', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  sw_form_in_progress: { label: 'SW filling ALFT form', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  awaiting_manager_review: { label: 'Awaiting ALFT manager review', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  returned_to_sw_for_changes: { label: 'Returned to SW for changes', color: 'bg-red-100 text-red-800 border-red-200' },
  awaiting_rn_final_review: { label: 'Awaiting RN final review/sign', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  rn_finalized_ready_for_ils: { label: 'RN finalized, ready for ILS', color: 'bg-green-100 text-green-800 border-green-200' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  submitted: { label: 'Submitted', color: 'bg-green-100 text-green-800 border-green-200' },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-700 border-gray-200' },
};

const isRnVisitNeededStatus = (value: unknown): boolean => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!normalized) return false;
  return (
    normalized === 'rn visit needed' ||
    normalized.includes('rn visit needed') ||
    normalized.includes('rn visit req') ||
    normalized.includes('rn needed') ||
    normalized.includes('visit needed')
  );
};

const resolveKaiserStatusValue = (row: Record<string, unknown>): string => {
  const direct = [
    row?.Kaiser_Status,
    row?.kaiserStatus,
    row?.Kaiser_ID_Status,
    row?.kaiser_id_status,
    row?.KaiserStatus,
  ]
    .map((v) => String(v || '').trim())
    .find(Boolean);
  if (direct) return direct;

  const keyMatch = Object.keys(row || {}).find((k) => k.toLowerCase().includes('kaiser') && k.toLowerCase().includes('status'));
  if (keyMatch) return String((row as any)?.[keyMatch] || '').trim();
  return '';
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminAlftAssignmentPage() {
  const { isAdmin, isLoading: adminLoading, user } = useAdmin();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [assignments, setAssignments] = useState<Record<string, AlftAssignment>>({});
  const [search, setSearch] = useState('');
  const [resetting, setResetting] = useState<string | null>(null);
  const [pushingToTrackerId, setPushingToTrackerId] = useState<string | null>(null);
  const [prefillSourceMode, setPrefillSourceMode] = useState<'cs_summary_app' | 'caspio_selected_fields'>('caspio_selected_fields');

  useEffect(() => {
    const memberQuery = String(searchParams?.get('member') || '').trim();
    if (memberQuery) setSearch(memberQuery);
  }, [searchParams]);

  // ── Load Kaiser members (RN Visit Needed) ─────────────────────────────────────

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, staffRes] = await Promise.all([
        fetch('/api/kaiser-members?refresh=1&source=caspio', { cache: 'no-store' }),
        fetch('/api/caspio-staff', { cache: 'no-store' }).catch(() => null),
      ]);
      const data = await membersRes.json().catch(() => ({} as any));
      if (!membersRes.ok || !data?.success) throw new Error(data?.error || `HTTP ${membersRes.status}`);

      const swById: Record<string, { name: string; email: string }> = {};
      if (staffRes?.ok) {
        const staffPayload = await staffRes.json().catch(() => ({} as any));
        const staffRows = Array.isArray(staffPayload?.staff) ? staffPayload.staff : [];
        staffRows.forEach((row: any) => {
          const swId = String(row?.sw_id || '').trim().toLowerCase();
          if (!swId) return;
          const name = normalizeSwNameForUi(String(row?.name || row?.sw_name || '').trim());
          const email = String(row?.email || '').trim().toLowerCase();
          swById[swId] = { name, email };
        });
      }
      const next: KaiserMember[] = (Array.isArray(data?.members) ? data.members : [])
        .filter((m: any) => isRnVisitNeededStatus(resolveKaiserStatusValue(m as Record<string, unknown>)))
        .map((m: any) => ({
          id: String(m?.Client_ID2 || m?.client_ID2 || m?.id || m?.ID || `${m?.Senior_Last_First_ID || m?.memberName || ''}-${m?.MCP_CIN || m?.memberMrn || ''}`).trim(),
          memberName: String(m?.memberName || m?.Senior_Last_First_ID || '').trim() || 'Member',
          memberFirstName: String(m?.memberFirstName || '').trim(),
          memberLastName: String(m?.memberLastName || '').trim(),
          memberMrn: String(m?.memberMrn || m?.MCP_CIN || '').trim(),
          swId: String(m?.SW_ID || m?.sw_id || '').trim(),
          birthDate: String(m?.Birth_Date || m?.birthDate || '').trim(),
          memberSex: String(m?.memberSex || m?.Sex || m?.Gender || '').trim(),
          memberPrimaryLanguage: String(
            m?.memberPrimaryLanguage || m?.Primary_Language || m?.Member_Language || m?.Language || ''
          ).trim(),
          memberPhone: String(m?.memberPhone || m?.Member_Phone || '').trim(),
          ispCurrentAddressStreet: String(
            m?.ispCurrentAddressStreet || m?.ISP_Current_Address || m?.Member_Address || m?.Address || ''
          ).trim(),
          ispCurrentAddressCity: String(
            m?.ispCurrentAddressCity || m?.ISP_Current_City || m?.Member_City || m?.MemberCity || m?.City || ''
          ).trim(),
          ispCurrentAddressState: String(
            m?.ispCurrentAddressState || m?.ISP_Current_State || m?.Member_State || m?.State || ''
          ).trim(),
          ispCurrentAddressZip: String(
            m?.ispCurrentAddressZip || m?.ISP_Current_Zip || m?.Member_Zip || m?.Zip || ''
          ).trim(),
          ispFacilityName: String(m?.ispFacilityName || m?.RCFE_Name || m?.Facility_Name || '').trim(),
          kaiserStatus: resolveKaiserStatusValue(m as Record<string, unknown>),
          alftAssigned: String(m?.ALFT_Assigned || '').trim(),
          ispCurrentLocation: String(m?.ISP_Current_Location || '').trim(),
          ispContactName: String(
            m?.ISP_Contact_Name || m?.ispContactName || m?.RCFE_Admin_Name || m?.Contact_Name || ''
          ).trim(),
          ispContactPhone: String(m?.ISP_Contact_Phone || '').trim(),
          ispContactEmail: String(m?.ISP_Contact_Email || '').trim(),
          ispContactConfirmDate: String(
            m?.ISP_Contact_Confirm_Field ||
              m?.ISP_Contact_Confirm_Date ||
              m?.ISP_Contact_Confirm ||
              m?.ISP_Confirm_Date ||
              ''
          ).trim(),
          socialWorkerAssigned:
            swById[String(m?.SW_ID || m?.sw_id || '').trim().toLowerCase()]?.name ||
            String(m?.Social_Worker_Assigned || '').trim(),
          socialWorkerEmail:
            swById[String(m?.SW_ID || m?.sw_id || '').trim().toLowerCase()]?.email || '',
          sourceRecord: m as Record<string, unknown>,
        }))
        .filter((m: KaiserMember) => Boolean(m.id))
        .sort((a: KaiserMember, b: KaiserMember) => a.memberName.localeCompare(b.memberName));

      setMembers(next);
      setHasLoadedOnce(true);
    } catch (e: any) {
      toast({ title: 'Could not load members', description: e?.message || 'Retry.', variant: 'destructive' });
      setHasLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ── Live-listen to alft_assignments ──────────────────────────────────────────

  useEffect(() => {
    if (!firestore || !isAdmin) return;
    const unsub = onSnapshot(collection(firestore, 'alft_assignments'), (snap) => {
      const next: Record<string, AlftAssignment> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as AlftAssignment;
        if (data.memberId) next[data.memberId] = data;
      });
      setAssignments(next);
    });
    return () => unsub();
  }, [firestore, isAdmin]);

  // Hydrate Caspio SW fields into assignment docs whenever Caspio data changes.
  useEffect(() => {
    if (!firestore || !isAdmin) return;
    if (members.length === 0) return;
    void (async () => {
      try {
        const adminEmail = String((user as any)?.email || auth?.currentUser?.email || '').trim().toLowerCase();
        const adminName = String((user as any)?.displayName || adminEmail || 'Admin').trim();
        const writes: Array<Promise<any>> = [];

        members.forEach((member) => {
          const swId = String(member.swId || '').trim().toLowerCase();
          const swName = normalizeSwNameForUi(String(member.socialWorkerAssigned || '').trim());
          const swEmail = String(member.socialWorkerEmail || '').trim().toLowerCase();
          if (!swId && !swName) return;

          const existing = assignments[member.id];
          const existingSwId = String(existing?.assignedSwId || '').trim().toLowerCase();
          const existingSwName = normalizeSwNameForUi(String(existing?.assignedSwName || '').trim()).toLowerCase();
          const existingSwEmail = String(existing?.assignedSwEmail || '').trim().toLowerCase();
          const alreadySynced =
            existingSwId === swId &&
            existingSwName === swName.toLowerCase() &&
            existingSwEmail === swEmail;
          if (alreadySynced) return;

          const patch: Record<string, any> = {
            memberId: member.id,
            memberName: member.memberName,
            memberFirstName: member.memberFirstName,
            memberLastName: member.memberLastName,
            memberMrn: member.memberMrn,
            memberSex: member.memberSex,
            memberPrimaryLanguage: member.memberPrimaryLanguage,
            memberPhone: member.memberPhone,
            ispCurrentAddressStreet: member.ispCurrentAddressStreet,
            ispCurrentAddressCity: member.ispCurrentAddressCity,
            ispCurrentAddressState: member.ispCurrentAddressState,
            ispCurrentAddressZip: member.ispCurrentAddressZip,
            ispFacilityName: member.ispFacilityName,
            ispCurrentLocation: member.ispCurrentLocation,
            ispContactName: member.ispContactName,
            ispContactPhone: member.ispContactPhone,
            ispContactEmail: member.ispContactEmail,
            ispContactConfirmDate: member.ispContactConfirmDate,
            assignedSwId: swId || null,
            assignedSwEmail: swEmail || '',
            assignedSwName: swName || `SW ID ${member.swId}`,
            caspioSocialWorkerAssigned: member.socialWorkerAssigned,
            updatedAt: serverTimestamp(),
            assignedByEmail: String(existing?.assignedByEmail || adminEmail),
            assignedByName: String(existing?.assignedByName || adminName),
          };
          if (!existing?.assignedAt) patch.assignedAt = serverTimestamp();
          if (!existing?.status) patch.status = 'assigned';

          writes.push(setDoc(doc(firestore, 'alft_assignments', member.id), patch, { merge: true }));
        });

        if (writes.length > 0) {
          await Promise.all(writes);
        }
      } catch {
        // best-effort hydration
      }
    })();
  }, [assignments, auth?.currentUser?.email, firestore, isAdmin, members, user]);

  const resetWorkflowStatus = useCallback(
    async (member: KaiserMember) => {
      if (!firestore) return;
      setResetting(member.id);
      try {
        await setDoc(
          doc(firestore, 'alft_assignments', member.id),
          {
            status: 'assigned',
            workflowStage: 'sw_not_started',
            trackerPushedAt: null,
            trackerPushedByEmail: null,
            trackerPushedByName: null,
            workflowResetAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        toast({
          title: 'Workflow reset',
          description: `${member.memberName} reset to pre-start status.`,
        });
      } catch (e: any) {
        toast({ title: 'Reset failed', description: e?.message || 'Try again.', variant: 'destructive' });
      } finally {
        setResetting(null);
      }
    },
    [firestore, toast]
  );

  const pushToAlftTracker = useCallback(
    async (member: KaiserMember, assignment?: AlftAssignment) => {
      if (!firestore) return;
      const memberId = String(member.id || '').trim();
      if (!memberId) return;
      setPushingToTrackerId(memberId);
      try {
        const trackerRef = doc(firestore, 'standalone_upload_submissions', memberId);
        const existingSnap = await getDoc(trackerRef);
        const existing = existingSnap.exists() ? (existingSnap.data() as Record<string, any>) : null;
        const existingStatus = String(existing?.status || '').toLowerCase();
        const existingWorkflowStatus = String(existing?.workflowStatus || '').toLowerCase();
        const restoringRemoved =
          existingStatus === 'removed' || existingWorkflowStatus.includes('removed_from_tracker');

        if (!existing) {
          await setDoc(
            trackerRef,
            {
              status: 'pending',
              toolCode: 'ALFT',
              documentType: 'ALFT Tool',
              files: [],
              memberId,
              memberName: String(member.memberName || '').trim() || 'Member',
              memberFirstName: String(member.memberFirstName || '').trim() || null,
              memberLastName: String(member.memberLastName || '').trim() || null,
              healthPlan: 'Kaiser',
              medicalRecordNumber: String(member.memberMrn || '').trim() || null,
              uploaderEmail: String(user?.email || '').trim().toLowerCase() || null,
              uploaderName: String((user as any)?.displayName || user?.email || 'Admin').trim(),
              prefillSourceMode,
              prefillSourceLabel: prefillSourceMode === 'cs_summary_app' ? 'App CS Summary' : 'Caspio selected fields',
              workflowStatus: '',
              workflowStage: 'tracker_member_added',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else if (restoringRemoved) {
          await setDoc(
            trackerRef,
            {
              status: 'pending',
              workflowStatus: '',
              workflowStage: 'tracker_member_readded',
              removedFromTrackerAt: null,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          await setDoc(
            trackerRef,
            {
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        await setDoc(
          doc(firestore, 'alft_assignments', memberId),
          {
            memberId,
            memberName: member.memberName,
            memberFirstName: member.memberFirstName || '',
            memberLastName: member.memberLastName || '',
            memberMrn: member.memberMrn || '',
            assignedSwId: assignment?.assignedSwId || null,
            assignedSwName: assignment?.assignedSwName || '',
            assignedSwEmail: assignment?.assignedSwEmail || '',
            status: String(assignment?.status || 'assigned'),
            trackerPushedAt: serverTimestamp(),
            trackerPushedByEmail: String(user?.email || '').trim().toLowerCase() || null,
            trackerPushedByName: String((user as any)?.displayName || user?.email || 'Admin').trim(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        toast({
          title: 'Pushed to ALFT Tracker',
          description: `${member.memberName || 'Member'} is now available on the ALFT Tracker page.`,
        });
        router.push(`/admin/alft-tracker?focus=${encodeURIComponent(memberId)}`);
      } catch (e: any) {
        toast({
          title: 'Could not push to ALFT Tracker',
          description: e?.message || 'Please retry.',
          variant: 'destructive',
        });
      } finally {
        setPushingToTrackerId(null);
      }
    },
    [firestore, prefillSourceMode, router, toast, user]
  );

  // ── Derived ───────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(
      (m) =>
        !q ||
        m.memberName.toLowerCase().includes(q) ||
        m.memberMrn.toLowerCase().includes(q) ||
        m.ispCurrentLocation.toLowerCase().includes(q) ||
        (assignments[m.id]?.assignedSwName || '').toLowerCase().includes(q)
    );
  }, [assignments, members, search]);

  const assignedCount = useMemo(() => members.filter((m) => Boolean(assignments[m.id])).length, [assignments, members]);
  const submittedCount = useMemo(
    () => members.filter((m) => ['submitted', 'completed'].includes(assignments[m.id]?.status || '')).length,
    [assignments, members]
  );

  // ── Auth guard ────────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                ALFT Assignment Queue
              </CardTitle>
              <CardDescription>
                All Caspio members with Kaiser status "RN Visit Needed" are shown here. Push members individually to ALFT Tracker, then run the full workflow there.
              </CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link href="/admin/alft-tracker">Go to ALFT Tracker Page</Link>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, MRN, location, or SW…"
              className="w-60"
            />
            <Button variant="outline" size="sm" onClick={() => void loadMembers()} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Load Caspio Members
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSearch('')} disabled={!search}>
              Clear search
            </Button>
            <div className="flex items-center gap-2 rounded-md border px-2 py-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Prefill mode</span>
              <select
                value={prefillSourceMode}
                onChange={(e) => setPrefillSourceMode(e.target.value as 'cs_summary_app' | 'caspio_selected_fields')}
                className="h-8 rounded border bg-background px-2 text-xs"
              >
                <option value="cs_summary_app">Use app CS Summary (in-app members)</option>
                <option value="caspio_selected_fields">Use Caspio selected fields (non-app members)</option>
              </select>
            </div>
            <div className="flex gap-2 ml-auto text-sm text-muted-foreground">
              <Badge variant="outline">{filtered.length} shown</Badge>
              <Badge variant="outline">{assignedCount} assigned</Badge>
              <Badge variant="outline" className="text-green-700 border-green-300">{submittedCount} submitted</Badge>
            </div>
          </div>

          {!hasLoadedOnce && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Click <strong>Load Caspio Members</strong> to view Kaiser members (RN Visit Needed) and their social worker assignment from Caspio.
              </AlertDescription>
            </Alert>
          )}

          {hasLoadedOnce && !loading && filtered.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm">
              No members found with Kaiser Status = "RN Visit Needed".
            </div>
          )}

          {hasLoadedOnce && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Member</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => {
                    const assignment = assignments[m.id];
                    const statusMeta = STATUS_LABELS[assignment?.status || ''] || null;
                    const pushedToTracker = Boolean((assignment as any)?.trackerPushedAt);
                    const pushedAtDate = (assignment as any)?.trackerPushedAt?.toDate?.() as Date | undefined;
                    const swAssignedName = normalizeSwNameForUi(m.socialWorkerAssigned || '') || 'Not set';
                    const isPushingToTracker = pushingToTrackerId === m.id;
                    const disablePush = pushedToTracker || isPushingToTracker;

                    return (
                      <TableRow key={m.id} className={assignment?.status === 'submitted' ? 'bg-green-50/50' : ''}>
                        <TableCell className="py-2 align-top">
                          <div className="font-medium text-sm">{m.memberName}</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Kaiser Status: {m.kaiserStatus || 'Unknown'}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">SW assigned: {swAssignedName}</div>
                          {pushedToTracker ? (
                            <div className="mt-1 text-[11px] text-emerald-700">
                              <span className="font-semibold" aria-label="Already pushed to tracker">✓</span>{' '}
                              Pushed to tracker: {pushedAtDate ? pushedAtDate.toLocaleDateString() : 'Yes'}
                            </div>
                          ) : null}
                          {pushedToTracker ? (
                            <div className="mt-1 text-[11px]">
                              <Link
                                href={`/admin/alft-tracker?focus=${encodeURIComponent(m.id)}`}
                                className="text-blue-600 hover:text-blue-700 underline"
                              >
                                Open member in ALFT Tracker
                              </Link>
                            </div>
                          ) : null}
                          <div className="mt-1.5 space-y-1">
                            <Button
                              size="sm"
                              className={`h-6 px-2 text-[10px] ${
                                disablePush
                                  ? 'bg-slate-300 hover:bg-slate-300 text-slate-600'
                                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                              }`}
                              disabled={disablePush}
                              onClick={() => void pushToAlftTracker(m, assignment)}
                            >
                              {isPushingToTracker ? 'Pushing…' : pushedToTracker ? 'Already Pushed' : 'Push to ALFT Tracker'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              disabled={resetting === m.id}
                              onClick={() => void resetWorkflowStatus(m)}
                            >
                              {resetting === m.id ? 'Resetting…' : 'Reset'}
                            </Button>
                            <div className="text-[10px] text-muted-foreground leading-tight">
                              After push, open ALFT Tracker to start and manage the full workflow for this member.
                            </div>
                          </div>
                          <div className="mt-1.5 text-[11px] text-muted-foreground">
                            Current status: {statusMeta ? statusMeta.label : 'Unassigned'}
                          </div>
                          {assignment?.assignedAt?.toDate ? (
                            <div className="text-[11px] text-muted-foreground">
                              Assigned: {assignment.assignedAt.toDate().toLocaleDateString()}
                            </div>
                          ) : null}
                        </TableCell>

                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
