'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  CheckCircle2,
  ClipboardList,
  Loader2,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import {
  collection,
  doc,
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
  ispContactPhone: string;
  ispContactEmail: string;
  ispContactConfirmDate: string;
  socialWorkerAssigned: string;
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

const parseFlexibleDate = (value: string): Date | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLike) return new Date(Number(isoLike[1]), Number(isoLike[2]) - 1, Number(isoLike[3]));
  const usLike = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usLike) return new Date(Number(usLike[3]), Number(usLike[1]) - 1, Number(usLike[2]));
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const isWithinPastDays = (value: string, days: number): boolean => {
  const dt = parseFlexibleDate(value);
  if (!dt) return false;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  return Math.floor((a - b) / 86400000) <= days;
};

const formatDobLabel = (value: string): string => {
  const dt = parseFlexibleDate(value);
  if (!dt) return '';
  try {
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
};

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
    normalized.includes('rn needed')
  );
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminAlftAssignmentPage() {
  const { isAdmin, isLoading: adminLoading, user } = useAdmin();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [assignments, setAssignments] = useState<Record<string, AlftAssignment>>({});
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState<string | null>(null); // memberId being saved
  const [resetting, setResetting] = useState<string | null>(null);
  const [prefillSourceMode, setPrefillSourceMode] = useState<'cs_summary_app' | 'caspio_selected_fields'>('caspio_selected_fields');
  const swHydrationDoneRef = useRef(false);

  // ── Load Kaiser members (RN Visit Needed) ─────────────────────────────────────

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/kaiser-members', { cache: 'no-store' });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);

      const next: KaiserMember[] = (Array.isArray(data?.members) ? data.members : [])
        .filter((m: any) => isRnVisitNeededStatus(m?.Kaiser_Status ?? m?.kaiserStatus))
        .map((m: any) => ({
          id: String(m?.Client_ID2 || m?.id || '').trim(),
          memberName: String(m?.memberName || '').trim() || 'Member',
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
          kaiserStatus: String(m?.Kaiser_Status || '').trim(),
          alftAssigned: String(m?.ALFT_Assigned || '').trim(),
          ispCurrentLocation: String(m?.ISP_Current_Location || '').trim(),
          ispContactPhone: String(m?.ISP_Contact_Phone || '').trim(),
          ispContactEmail: String(m?.ISP_Contact_Email || '').trim(),
          ispContactConfirmDate: String(
            m?.ISP_Contact_Confirm_Field ||
              m?.ISP_Contact_Confirm_Date ||
              m?.ISP_Contact_Confirm ||
              m?.ISP_Confirm_Date ||
              ''
          ).trim(),
          socialWorkerAssigned: String(m?.Social_Worker_Assigned || '').trim(),
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

  // Hydrate Caspio SW fields into assignment docs automatically (no manual sync needed).
  useEffect(() => {
    if (!firestore || !isAdmin) return;
    if (members.length === 0) return;
    if (swHydrationDoneRef.current) return;

    swHydrationDoneRef.current = true;
    void (async () => {
      try {
        const adminEmail = String((user as any)?.email || auth?.currentUser?.email || '').trim().toLowerCase();
        const adminName = String((user as any)?.displayName || adminEmail || 'Admin').trim();
        const writes: Array<Promise<any>> = [];

        members.forEach((member) => {
          const swId = String(member.swId || '').trim().toLowerCase();
          const swName = normalizeSwNameForUi(String(member.socialWorkerAssigned || '').trim());
          if (!swId && !swName) return;

          const existing = assignments[member.id];
          const existingSwId = String(existing?.assignedSwId || '').trim().toLowerCase();
          const existingSwName = String(existing?.assignedSwName || '').trim().toLowerCase();
          const alreadySynced =
            existingSwId === swId && existingSwName === swName.toLowerCase();
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
            assignedSwId: swId || null,
            assignedSwEmail: '',
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

  // ── Assign SW to member ───────────────────────────────────────────────────────

  const assignSw = useCallback(
    async (member: KaiserMember) => {
      if (!firestore || !auth?.currentUser) return;
      const swId = String(member.swId || '').trim().toLowerCase();
      const swName = normalizeSwNameForUi(String(member.socialWorkerAssigned || '').trim());
      if (!swId && !swName) {
        toast({
          title: 'Missing Caspio SW assignment',
          description: 'This member is missing both SW_ID and Social_Worker_Assigned in Caspio.',
          variant: 'destructive',
        });
        return;
      }

      setAssigning(member.id);
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/alft/workflow/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            member: {
              id: member.id,
              memberName: member.memberName,
              memberFirstName: member.memberFirstName,
              memberLastName: member.memberLastName,
              memberMrn: member.memberMrn,
              birthDate: member.birthDate,
              memberSex: member.memberSex,
              memberPrimaryLanguage: member.memberPrimaryLanguage,
              memberPhone: member.memberPhone,
              ispCurrentAddressStreet: member.ispCurrentAddressStreet,
              ispCurrentAddressCity: member.ispCurrentAddressCity,
              ispCurrentAddressState: member.ispCurrentAddressState,
              ispCurrentAddressZip: member.ispCurrentAddressZip,
              ispFacilityName: member.ispFacilityName,
              kaiserStatus: member.kaiserStatus,
              ispCurrentLocation: member.ispCurrentLocation,
              ispContactPhone: member.ispContactPhone,
              ispContactEmail: member.ispContactEmail,
              ispContactConfirmDate: member.ispContactConfirmDate,
              swId,
              socialWorkerAssigned: swName,
              prefillSourceMode,
              caspioSourceRecord: (member.sourceRecord || {}) as Record<string, unknown>,
            },
          }),
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.success) {
          throw new Error(String(data?.error || `Failed to start workflow (HTTP ${res.status})`));
        }

        toast({
          title: 'ALFT workflow started',
          description: `SW invite ${data?.sw?.emailSent ? 'email sent' : 'queued'} and workflow tracking started.`,
        });
        router.push(`/admin/alft-tracker?member=${encodeURIComponent(member.memberName)}`);
      } catch (e: any) {
        toast({ title: 'Assignment failed', description: e?.message || 'Try again.', variant: 'destructive' });
      } finally {
        setAssigning(null);
      }
    },
    [auth, firestore, prefillSourceMode, router, toast, user]
  );

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
                Select Kaiser members from Caspio and start the ALFT workflow with their Caspio-assigned social worker.
              </CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link href="/admin/alft-tracker">Open ALFT Workflow Intake →</Link>
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
                    <TableHead className="w-52">Member</TableHead>
                    <TableHead>ISP Info</TableHead>
                    <TableHead className="w-56">Caspio SW Assignment</TableHead>
                    <TableHead className="w-36">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => {
                    const assignment = assignments[m.id];
                    const fresh = isWithinPastDays(m.ispContactConfirmDate, 3);
                    const statusMeta = STATUS_LABELS[assignment?.status || ''] || null;
                    const currentSwId = String(assignment?.assignedSwId || '').trim().toLowerCase();
                    const sourceSwId = String(m.swId || '').trim().toLowerCase();
                    const sourceSwName = normalizeSwNameForUi(String(m.socialWorkerAssigned || '').trim());
                    const isAlreadySynced = Boolean(
                      (sourceSwId && currentSwId && sourceSwId === currentSwId) ||
                      (!sourceSwId &&
                        sourceSwName &&
                        String(assignment?.assignedSwName || '').trim().toLowerCase() === sourceSwName.toLowerCase())
                    );
                    const workflowStarted = [
                      'sw_form_in_progress',
                      'awaiting_manager_review',
                      'returned_to_sw_for_changes',
                      'awaiting_rn_final_review',
                      'rn_finalized_ready_for_ils',
                      'in_progress',
                      'submitted',
                      'completed',
                    ].includes(String(assignment?.status || '').trim().toLowerCase());
                    const status = String(assignment?.status || '').trim().toLowerCase();
                    const stepIndex =
                      status === 'sw_invited_pending_submission' || status === 'sw_form_in_progress'
                        ? 1
                        : status === 'awaiting_manager_review' || status === 'returned_to_sw_for_changes'
                          ? 2
                          : status === 'awaiting_rn_final_review'
                            ? 3
                            : status === 'rn_finalized_ready_for_ils' || status === 'submitted' || status === 'completed'
                              ? 4
                              : 0;
                    const dobLabel = formatDobLabel(m.birthDate);

                    return (
                      <TableRow key={m.id} className={assignment?.status === 'submitted' ? 'bg-green-50/50' : ''}>
                        {/* Member info */}
                        <TableCell>
                          <div className="font-medium text-sm">{m.memberName}</div>
                          {m.memberMrn && <div className="text-xs text-muted-foreground font-mono">MRN: {m.memberMrn}</div>}
                          {dobLabel && (
                            <div className="text-xs text-muted-foreground">
                              DOB: {dobLabel}
                            </div>
                          )}
                        </TableCell>

                        {/* ISP contact */}
                        <TableCell className="min-w-[260px]">
                          <div className="space-y-0.5 text-xs">
                            {m.ispCurrentLocation && (
                              <div className="font-medium text-sm truncate max-w-[240px]">{m.ispCurrentLocation}</div>
                            )}
                            {m.ispContactPhone && <div className="text-muted-foreground">📞 {m.ispContactPhone}</div>}
                            {m.ispContactEmail && <div className="text-muted-foreground truncate max-w-[240px]">✉ {m.ispContactEmail}</div>}
                            {m.ispContactConfirmDate ? (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  fresh
                                    ? 'text-green-700 border-green-300 bg-green-50'
                                    : 'text-red-700 border-red-300 bg-red-50'
                                }`}
                              >
                                Contact confirmed: {m.ispContactConfirmDate}
                                {fresh ? ' ✓' : ' — outdated'}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">No contact confirm date</Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* SW assignment picker */}
                        <TableCell>
                          <div className="space-y-2">
                            <div className="text-[11px] text-muted-foreground">
                              Caspio SW: {normalizeSwNameForUi(m.socialWorkerAssigned || '') || 'Not set'}
                            </div>
                            <div className="text-[11px] text-muted-foreground">Caspio SW_ID: {m.swId || 'Not set'}</div>
                            <Button
                              size="sm"
                              variant={assignment?.assignedSwId || assignment?.assignedSwName ? 'outline' : 'default'}
                              className="h-7 text-xs w-full"
                              disabled={
                                assigning === m.id ||
                                (!sourceSwId && !sourceSwName) ||
                                workflowStarted
                              }
                              onClick={() => void assignSw(m)}
                            >
                              {assigning === m.id ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <UserCheck className="h-3 w-3 mr-1" />
                              )}
                              {!sourceSwId && !sourceSwName
                                ? 'Missing Caspio SW'
                                : workflowStarted
                                  ? 'Workflow started'
                                  : 'Start ALFT workflow'}
                            </Button>
                            {assignment?.assignedSwName && (
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                {assignment.assignedSwName}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          {statusMeta ? (
                            <div className="space-y-1">
                              <Badge variant="outline" className={`text-[11px] ${statusMeta.color}`}>
                                {statusMeta.label}
                              </Badge>
                              <div className="text-[10px] text-muted-foreground">
                                Step {stepIndex}/4: {stepIndex === 0 ? 'Not started' : stepIndex === 1 ? 'SW invite + form' : stepIndex === 2 ? 'Manager review' : stepIndex === 3 ? 'RN review' : 'Ready for ILS'}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                SW invite email: {Boolean((assignment as any)?.workflowSteps?.swInviteSent) ? 'sent' : 'pending/unknown'}
                              </div>
                              <div className="text-[10px] text-muted-foreground">SW portal: `/sw-portal/alft-upload`</div>
                              <div className="text-[10px] text-muted-foreground">Manager view: `/admin/alft-tracker`</div>
                              {assignment?.assignedAt?.toDate && (
                                <div className="text-[10px] text-muted-foreground">
                                  {assignment.assignedAt.toDate().toLocaleDateString()}
                                </div>
                              )}
                              <div className="flex gap-2 pt-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => router.push(`/admin/alft-tracker?member=${encodeURIComponent(m.memberName)}`)}
                                >
                                  Open workflow
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
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unassigned</span>
                          )}
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
